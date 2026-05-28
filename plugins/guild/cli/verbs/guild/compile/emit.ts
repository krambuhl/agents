import { createHash } from 'node:crypto';

import type {
  CacheEntry,
  ComposedAgent,
  EmitResult,
} from './types.ts';
import { EmitError } from './types.ts';

// emit: ComposedAgent[] + outputDir + fileWriter → EmitResult.
//
// Writes one .md file per cell to <outputDir>/<cell.id>.md and a
// .cache.toml that records each cell's source hashes + the
// computed output_hash + a fused_at ISO timestamp.
//
// fileWriter is injected: compile.ts wires it to fs.writeFileSync;
// tests pass an in-memory closure. The function does NOT create
// directories — that's the orchestrator's job (and tests are
// permitted to ignore it).
//
// The .cache.toml shape is deterministic — sorted by cell_id —
// so re-running emit on the same input produces byte-identical
// cache output. The check verb (Phase 2.1 onward) gates on this.
//
// Per PLAN § Exit requirements (line 29 of the global Exit
// requirements): each cache entry records {source_hashes: {phase,
// domain, personality}, output_hash, fused_at}. This module
// records exactly that shape; the long-term cache evolution
// (per-cell cache files vs. monolithic, prompt-hash inclusion in
// Phase 2.1) is downstream concern.

export type FileWriter = (relPath: string, content: string) => void;

function sha256(s: string): string {
  return createHash('sha256').update(s, 'utf8').digest('hex');
}

function tomlString(s: string): string {
  return `"${s.replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"`;
}

function emitCacheToml(entries: CacheEntry[]): string {
  // Emit deterministically: sort by cell_id ascending so re-runs
  // produce identical output for the same input.
  const sorted = [...entries].sort((a, b) => a.cell_id.localeCompare(b.cell_id));
  const out: string[] = [];
  out.push('schema_version = 1');
  out.push('');
  out.push(
    '# .cache.toml — per-cell cache entries written by `guild compile`.',
  );
  out.push(
    '# Each entry records {source_hashes, output_hash, fused_at} so the',
  );
  out.push(
    '# check verb can detect drift between committed agent bodies and',
  );
  out.push(
    '# their inputs without re-running the LLM fusion. Deterministic',
  );
  out.push('# ordering (sorted by cell_id) keeps the file diff-friendly.');
  out.push('');
  // Flat key shape — the guild TOML reader (cli/lib/toml.ts) is
  // intentionally minimal and doesn't support nested sub-tables
  // under array-of-tables. source_hashes go inline as
  // source_hash_{phase,personality,domain} keys, reassembled by the
  // orchestrator's readCache.
  for (const e of sorted) {
    out.push(`[[cells]]`);
    out.push(`cell_id = ${tomlString(e.cell_id)}`);
    out.push(`fused_at = ${tomlString(e.fused_at)}`);
    out.push(`output_hash = ${tomlString(e.output_hash)}`);
    out.push(`source_hash_phase = ${tomlString(e.source_hashes.phase)}`);
    out.push(`source_hash_personality = ${tomlString(e.source_hashes.personality)}`);
    out.push(`source_hash_domain = ${tomlString(e.source_hashes.domain)}`);
    out.push('');
  }
  return out.join('\n');
}

export function emit(
  agents: ComposedAgent[],
  outputDir: string,
  fileWriter: FileWriter,
  fusedAt: string = new Date().toISOString(),
): EmitResult {
  if (agents.length === 0) {
    throw new EmitError('emit: agents list is empty (nothing to write)');
  }

  const written_files: string[] = [];
  const cache_entries: CacheEntry[] = [];

  // Stable order: by cell.id ascending, so emit is deterministic
  // regardless of derive's order.
  const sorted = [...agents].sort((a, b) => a.id.localeCompare(b.id));

  for (const agent of sorted) {
    const relPath = `${outputDir}/${agent.id}.md`;
    fileWriter(relPath, agent.composed_body);
    written_files.push(relPath);
    cache_entries.push({
      cell_id: agent.id,
      source_hashes: agent.source_hashes,
      output_hash: sha256(agent.composed_body),
      fused_at: fusedAt,
    });
  }

  const cachePath = `${outputDir}/.cache.toml`;
  fileWriter(cachePath, emitCacheToml(cache_entries));
  written_files.push(cachePath);

  return { written_files, cache_entries };
}
