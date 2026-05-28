import { createHash } from 'node:crypto';

import { parseToml, isTomlTable, type TomlTable } from '../../lib/toml.ts';
import { compose } from './compile/compose.ts';
import { derive } from './compile/derive.ts';
import { emit, type FileWriter } from './compile/emit.ts';
import { parse } from './compile/parse.ts';
import { resolve, type FragmentReader } from './compile/resolve.ts';
import {
  type CacheEntry,
  type ComposedAgent,
  type EmitResult,
  type ResolvedCell,
  type ValidationResult,
  ComposeError,
} from './compile/types.ts';
import { validate } from './compile/validate.ts';

// compile orchestrator — runs the pipeline:
//
//   parse → validate → derive → resolve → (cache lookup) → compose → emit
//
// Pure-ish: I/O concerns (axes.toml read, fragment reads, file
// writes, cache.toml read) are all injected so the orchestrator
// stays testable with in-memory closures. The repo-local bin/guild
// shim wires real fs.readFileSync / fs.writeFileSync at the CLI
// entry point.
//
// PLAN exit criterion 2 names cache lookup before compose. v0
// implements the lookup but currently always re-composes — compose
// is fast text-concat and skipping it saves nothing. The cache-hit
// short-circuit becomes load-bearing in Phase 2.1 when compose
// performs LLM fusion (cache hit → skip the expensive LLM call).
// The CompileReport reports cache hits + misses regardless.

export interface CompileOptions {
  axesToml: string;
  outputDir: string;
  cacheToml?: string;
  fragmentReader: FragmentReader;
  fileWriter: FileWriter;
  fusedAt?: string;
  promptHash?: string;
}

export interface CompileReport {
  cells_total: number;
  cache_hits: string[];   // cell_ids whose source_hashes match the prior cache
  cache_misses: string[]; // cell_ids whose source_hashes differ or had no prior entry
  emit: EmitResult;
}

function sha256(s: string): string {
  return createHash('sha256').update(s, 'utf8').digest('hex');
}

function readCache(cacheToml: string | undefined): Map<string, CacheEntry> {
  const map = new Map<string, CacheEntry>();
  if (cacheToml === undefined || cacheToml.length === 0) return map;
  let root: TomlTable;
  try {
    root = parseToml(cacheToml);
  } catch {
    // A malformed cache is treated as no cache — the orchestrator
    // re-composes everything. The next emit overwrites the bad file.
    return map;
  }
  const cells = root.cells;
  if (!Array.isArray(cells)) return map;
  for (const entry of cells) {
    if (!isTomlTable(entry)) continue;
    const cell_id = entry.cell_id;
    const fused_at = entry.fused_at;
    const output_hash = entry.output_hash;
    const phase = entry.source_hash_phase;
    const personality = entry.source_hash_personality;
    const domain = entry.source_hash_domain;
    if (typeof cell_id !== 'string') continue;
    if (typeof fused_at !== 'string') continue;
    if (typeof output_hash !== 'string') continue;
    if (typeof phase !== 'string') continue;
    if (typeof personality !== 'string') continue;
    if (typeof domain !== 'string') continue;
    // Legacy entries written before U2 landed have no prompt_hash
    // field. Reading them as empty string matches an empty-string
    // caller (the pre-U3 default), so existing .cache.toml files
    // stay valid until U3 ships a real prompt and changes the
    // value. A non-string prompt_hash falls through the same way.
    const rawPromptHash = entry.prompt_hash;
    const prompt_hash = typeof rawPromptHash === 'string' ? rawPromptHash : '';
    map.set(cell_id, {
      cell_id,
      fused_at,
      output_hash,
      prompt_hash,
      source_hashes: { phase, personality, domain },
    });
  }
  return map;
}

function isCacheHit(
  cell: ResolvedCell,
  cache: Map<string, CacheEntry>,
  promptHash: string,
): boolean {
  const entry = cache.get(cell.id);
  if (entry === undefined) return false;
  return (
    entry.prompt_hash === promptHash &&
    entry.source_hashes.phase === sha256(cell.phase_fragment) &&
    entry.source_hashes.personality === sha256(cell.personality_fragment) &&
    entry.source_hashes.domain === sha256(cell.domain_fragment)
  );
}

export function compile(opts: CompileOptions): CompileReport {
  const { resolved, cache_hits, cache_misses } = compileThroughResolveCore(opts);
  const composed: ComposedAgent[] = resolved.map((cell) => compose(cell));
  // v0: always compose; cache_hits/misses reported for caller
  // awareness. Phase 2.1 will branch on isCacheHit and short-
  // circuit LLM fusion for the hits.

  const emitResult = emit(
    composed,
    opts.outputDir,
    opts.fileWriter,
    opts.fusedAt,
    opts.promptHash ?? '',
  );

  return {
    cells_total: composed.length,
    cache_hits,
    cache_misses,
    emit: emitResult,
  };
}

// Partial-stage variants for the /guild-compile skill (Phase 2.1).
// The skill drives in-session LLM fusion between these two calls:
//   1. compileThroughResolve → ResolvedCell[] (skill consumes via JSON).
//   2. Skill performs fusion → ComposedAgent[].
//   3. compileEmitOnly(agents) → writes files + cache.
//
// promptHash threads through both partials. The skill computes it
// once from fusion-prompt.md (U3) and passes it to both calls — to
// through-resolve so cache hits/misses key on it, and to emit-only
// so the .cache.toml entries record it.

export interface ThroughResolveOptions {
  axesToml: string;
  fragmentReader: FragmentReader;
  cacheToml?: string;
  promptHash?: string;
}

export interface ThroughResolveResult {
  resolved: ResolvedCell[];
  cache_hits: string[];
  cache_misses: string[];
}

function compileThroughResolveCore(opts: ThroughResolveOptions): ThroughResolveResult {
  const data = parse(opts.axesToml);
  const validation: ValidationResult = validate(data);
  if (!validation.ok) {
    throw new ComposeError(
      `compile: validate failed with ${validation.errors.length} finding(s); first: ${validation.errors[0]?.code} — ${validation.errors[0]?.message}`,
    );
  }

  const cells = derive(data);
  const resolved: ResolvedCell[] = cells.map((c) =>
    resolve(data, c, opts.fragmentReader),
  );

  const cache = readCache(opts.cacheToml);
  const promptHash = opts.promptHash ?? '';
  const cache_hits: string[] = [];
  const cache_misses: string[] = [];
  for (const cell of resolved) {
    if (isCacheHit(cell, cache, promptHash)) {
      cache_hits.push(cell.id);
    } else {
      cache_misses.push(cell.id);
    }
  }
  return { resolved, cache_hits, cache_misses };
}

export function compileThroughResolve(
  opts: ThroughResolveOptions,
): ThroughResolveResult {
  return compileThroughResolveCore(opts);
}

export interface EmitOnlyOptions {
  agents: ComposedAgent[];
  outputDir: string;
  fileWriter: FileWriter;
  fusedAt?: string;
  promptHash?: string;
}

export function compileEmitOnly(opts: EmitOnlyOptions): EmitResult {
  return emit(
    opts.agents,
    opts.outputDir,
    opts.fileWriter,
    opts.fusedAt,
    opts.promptHash ?? '',
  );
}
