import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

import { check, compile } from './compile.ts';
import type { AgentBodyReader, CheckResult, CompileReport } from './compile.ts';
import type { FileWriter } from './compile/emit.ts';

function makeAgentBodyReader(writes: Map<string, string>, outputDir: string): AgentBodyReader {
  return (cellId: string) => writes.get(`${outputDir}/${cellId}.md`);
}

const pluginRoot = dirname(dirname(dirname(dirname(fileURLToPath(import.meta.url)))));

function inMemoryWriter(writes: Map<string, string>): FileWriter {
  return (relPath, content) => {
    writes.set(relPath, content);
  };
}

const FUSED_AT = '2026-05-28T20:00:00Z';

describe('compile: end-to-end smoke against the real seed axes.toml', () => {
  it('runs parse → validate → derive → resolve → compose → emit and produces cells', () => {
    const axesToml = readFileSync(join(pluginRoot, 'modes', 'axes.toml'), 'utf8');
    const fragmentReader = (relPath: string) =>
      readFileSync(join(pluginRoot, relPath), 'utf8');
    const writes = new Map<string, string>();

    const report: CompileReport = compile({
      axesToml,
      outputDir: 'out',
      fragmentReader,
      fileWriter: inMemoryWriter(writes),
      fusedAt: FUSED_AT,
    });

    expect(report.cells_total).toBeGreaterThan(0);
    expect(report.emit.cache_entries.length).toBe(report.cells_total);
    expect(report.emit.written_files.length).toBe(report.cells_total + 1); // +1 for .cache.toml

    expect(writes.has('out/.cache.toml')).toBe(true);
    expect(writes.has('out/evaluator-a11y.md')).toBe(true);
    expect(writes.has('out/plan-skeptic.md')).toBe(true);
  });

  it('every emitted .md carries the YAML frontmatter and provenance comment', () => {
    const axesToml = readFileSync(join(pluginRoot, 'modes', 'axes.toml'), 'utf8');
    const fragmentReader = (relPath: string) =>
      readFileSync(join(pluginRoot, relPath), 'utf8');
    const writes = new Map<string, string>();

    compile({
      axesToml,
      outputDir: 'out',
      fragmentReader,
      fileWriter: inMemoryWriter(writes),
      fusedAt: FUSED_AT,
    });

    for (const [path, body] of writes.entries()) {
      if (!path.endsWith('.md')) continue;
      expect(body.startsWith('---\nname: ')).toBe(true);
      expect(body).toContain('COMPOSED by `guild compile`');
    }
  });

  it('cache-miss on first run (no cache provided); cache-hit on second run with the prior cache', () => {
    const axesToml = readFileSync(join(pluginRoot, 'modes', 'axes.toml'), 'utf8');
    const fragmentReader = (relPath: string) =>
      readFileSync(join(pluginRoot, relPath), 'utf8');

    const firstWrites = new Map<string, string>();
    const firstReport = compile({
      axesToml,
      outputDir: 'out',
      fragmentReader,
      fileWriter: inMemoryWriter(firstWrites),
      fusedAt: FUSED_AT,
    });
    expect(firstReport.cache_misses.length).toBe(firstReport.cells_total);
    expect(firstReport.cache_hits.length).toBe(0);

    const cacheToml = firstWrites.get('out/.cache.toml')!;
    expect(cacheToml).toBeDefined();

    const secondWrites = new Map<string, string>();
    const secondReport = compile({
      axesToml,
      outputDir: 'out',
      cacheToml,
      fragmentReader,
      fileWriter: inMemoryWriter(secondWrites),
      fusedAt: FUSED_AT,
    });
    expect(secondReport.cache_hits.length).toBe(secondReport.cells_total);
    expect(secondReport.cache_misses.length).toBe(0);
  });

  it('output_hashes from emit are stable across runs with same inputs + fusedAt', () => {
    const axesToml = readFileSync(join(pluginRoot, 'modes', 'axes.toml'), 'utf8');
    const fragmentReader = (relPath: string) =>
      readFileSync(join(pluginRoot, relPath), 'utf8');

    const a = new Map<string, string>();
    const b = new Map<string, string>();
    compile({
      axesToml,
      outputDir: 'out',
      fragmentReader,
      fileWriter: inMemoryWriter(a),
      fusedAt: FUSED_AT,
    });
    compile({
      axesToml,
      outputDir: 'out',
      fragmentReader,
      fileWriter: inMemoryWriter(b),
      fusedAt: FUSED_AT,
    });
    expect(a.get('out/.cache.toml')).toBe(b.get('out/.cache.toml'));
  });
});

describe('compile: prompt_hash threading', () => {
  it('same sources + same promptHash → cache_hit on second run', () => {
    const axesToml = readFileSync(join(pluginRoot, 'modes', 'axes.toml'), 'utf8');
    const fragmentReader = (relPath: string) =>
      readFileSync(join(pluginRoot, relPath), 'utf8');

    const firstWrites = new Map<string, string>();
    compile({
      axesToml,
      outputDir: 'out',
      fragmentReader,
      fileWriter: inMemoryWriter(firstWrites),
      fusedAt: FUSED_AT,
      promptHash: 'abc123',
    });
    const cacheToml = firstWrites.get('out/.cache.toml')!;

    const secondWrites = new Map<string, string>();
    const secondReport = compile({
      axesToml,
      outputDir: 'out',
      cacheToml,
      fragmentReader,
      fileWriter: inMemoryWriter(secondWrites),
      fusedAt: FUSED_AT,
      promptHash: 'abc123',
    });
    expect(secondReport.cache_hits.length).toBe(secondReport.cells_total);
    expect(secondReport.cache_misses.length).toBe(0);
  });

  it('same sources + different promptHash → cache_miss for every cell', () => {
    const axesToml = readFileSync(join(pluginRoot, 'modes', 'axes.toml'), 'utf8');
    const fragmentReader = (relPath: string) =>
      readFileSync(join(pluginRoot, relPath), 'utf8');

    const firstWrites = new Map<string, string>();
    compile({
      axesToml,
      outputDir: 'out',
      fragmentReader,
      fileWriter: inMemoryWriter(firstWrites),
      fusedAt: FUSED_AT,
      promptHash: 'old-prompt',
    });
    const cacheToml = firstWrites.get('out/.cache.toml')!;

    const secondWrites = new Map<string, string>();
    const secondReport = compile({
      axesToml,
      outputDir: 'out',
      cacheToml,
      fragmentReader,
      fileWriter: inMemoryWriter(secondWrites),
      fusedAt: FUSED_AT,
      promptHash: 'new-prompt',
    });
    expect(secondReport.cache_misses.length).toBe(secondReport.cells_total);
    expect(secondReport.cache_hits.length).toBe(0);
  });

  it('empty-string promptHash matches an empty-string entry (legacy-compat default)', () => {
    const axesToml = readFileSync(join(pluginRoot, 'modes', 'axes.toml'), 'utf8');
    const fragmentReader = (relPath: string) =>
      readFileSync(join(pluginRoot, relPath), 'utf8');

    // First run with no explicit promptHash — defaults to ''.
    const firstWrites = new Map<string, string>();
    compile({
      axesToml,
      outputDir: 'out',
      fragmentReader,
      fileWriter: inMemoryWriter(firstWrites),
      fusedAt: FUSED_AT,
    });
    const cacheToml = firstWrites.get('out/.cache.toml')!;

    // Second run also default — both sides empty. All cache_hits.
    const secondWrites = new Map<string, string>();
    const secondReport = compile({
      axesToml,
      outputDir: 'out',
      cacheToml,
      fragmentReader,
      fileWriter: inMemoryWriter(secondWrites),
      fusedAt: FUSED_AT,
    });
    expect(secondReport.cache_hits.length).toBe(secondReport.cells_total);
  });

  it('legacy cache entry without prompt_hash field reads as empty string', () => {
    const axesToml = readFileSync(join(pluginRoot, 'modes', 'axes.toml'), 'utf8');
    const fragmentReader = (relPath: string) =>
      readFileSync(join(pluginRoot, relPath), 'utf8');

    // Synthesize a legacy cache.toml WITHOUT prompt_hash on each cell
    // (pre-U2 shape). Use a real cell_id that exists in the seed
    // axes.toml so source_hashes match.
    const seedWrites = new Map<string, string>();
    compile({
      axesToml,
      outputDir: 'out',
      fragmentReader,
      fileWriter: inMemoryWriter(seedWrites),
      fusedAt: FUSED_AT,
    });
    const legacyCache = seedWrites
      .get('out/.cache.toml')!
      .split('\n')
      .filter((line) => !line.startsWith('prompt_hash'))
      .join('\n');

    const replayWrites = new Map<string, string>();
    const report = compile({
      axesToml,
      outputDir: 'out',
      cacheToml: legacyCache,
      fragmentReader,
      fileWriter: inMemoryWriter(replayWrites),
      fusedAt: FUSED_AT,
      // Default promptHash = '' — matches the synthesized
      // empty-string from the legacy reader.
    });
    expect(report.cache_hits.length).toBe(report.cells_total);
  });
});

describe('compile: --check smoke (Phase 2.1 exit criteria 4 + 5)', () => {
  const axesToml = readFileSync(join(pluginRoot, 'modes', 'axes.toml'), 'utf8');
  const fragmentReader = (relPath: string) =>
    readFileSync(join(pluginRoot, relPath), 'utf8');

  function freshCompile(promptHash?: string) {
    const writes = new Map<string, string>();
    const report = compile({
      axesToml,
      outputDir: 'out',
      fragmentReader,
      fileWriter: inMemoryWriter(writes),
      fusedAt: FUSED_AT,
      promptHash,
    });
    const cacheToml = writes.get('out/.cache.toml')!;
    const agentBodyReader = makeAgentBodyReader(writes, 'out');
    return { writes, report, cacheToml, agentBodyReader };
  }

  it('a fresh compile followed by --check reports ok=true with all drift lists empty', () => {
    const { cacheToml, agentBodyReader } = freshCompile();
    const result: CheckResult = check({
      axesToml,
      cacheToml,
      fragmentReader,
      agentBodyReader,
    });
    expect(result.ok).toBe(true);
    expect(result.drift.cells_with_source_drift).toEqual([]);
    expect(result.drift.cells_with_output_drift).toEqual([]);
    expect(result.drift.cells_with_prompt_drift).toEqual([]);
    expect(result.drift.cells_missing_cache_entry).toEqual([]);
    expect(result.drift.cells_missing_on_disk).toEqual([]);
    expect(result.drift.stale_cache_entries).toEqual([]);
  });

  it('no-source-change re-run reports zero cache_misses (the no-op invariant for the skill body)', () => {
    const { cacheToml } = freshCompile();
    const secondWrites = new Map<string, string>();
    const secondReport = compile({
      axesToml,
      outputDir: 'out',
      cacheToml,
      fragmentReader,
      fileWriter: inMemoryWriter(secondWrites),
      fusedAt: FUSED_AT,
    });
    expect(secondReport.cache_hits.length).toBe(secondReport.cells_total);
    expect(secondReport.cache_misses.length).toBe(0);
  });

  it('detects source drift per axis when a fragment changes', () => {
    const { cacheToml, agentBodyReader } = freshCompile();
    const mutatedReader = (relPath: string) => {
      const body = fragmentReader(relPath);
      // Mutate only the a11y domain fragment so we expect drift only
      // on the (evaluator-a11y) cell's domain axis.
      if (relPath.endsWith('modes/domains/a11y.md')) {
        return body + '\nMUTATED LINE\n';
      }
      return body;
    };
    const result = check({
      axesToml,
      cacheToml,
      fragmentReader: mutatedReader,
      agentBodyReader,
    });
    expect(result.ok).toBe(false);
    const drift = result.drift.cells_with_source_drift;
    expect(drift.length).toBeGreaterThan(0);
    // a11y is a domain on both reviewer and plan phases, so both
    // evaluator-a11y and plan-a11y drift. Every drift entry
    // should be axis=domain and on a cell whose id ends with `-a11y`.
    expect(drift.every((d) => d.axis === 'domain')).toBe(true);
    expect(drift.every((d) => d.id.endsWith('-a11y'))).toBe(true);
    expect(drift.find((d) => d.id === 'evaluator-a11y')).toBeDefined();
  });

  it('detects prompt drift on every cached cell when prompt_hash changes', () => {
    const { writes, cacheToml, agentBodyReader } = freshCompile('prompt-A');
    const result = check({
      axesToml,
      cacheToml,
      fragmentReader,
      agentBodyReader,
      promptHash: 'prompt-B',
    });
    expect(result.ok).toBe(false);
    // Every cell in the catalog should drift since prompt_hash is
    // global to the cache. The .md count in the in-memory writes
    // map is the cell count (every cell wrote one .md plus one
    // .cache.toml — subtract the cache file).
    const writtenAgentCount = [...writes.keys()].filter((k) => k.endsWith('.md')).length;
    expect(result.drift.cells_with_prompt_drift.length).toBe(writtenAgentCount);
  });

  it('detects output drift when an on-disk body is tampered', () => {
    const { writes, cacheToml } = freshCompile();
    // Tamper one body in the in-memory map; rebuild reader.
    writes.set('out/evaluator-a11y.md', '---\ntampered\n---\n');
    const agentBodyReader = makeAgentBodyReader(writes, 'out');
    const result = check({
      axesToml,
      cacheToml,
      fragmentReader,
      agentBodyReader,
    });
    expect(result.ok).toBe(false);
    expect(result.drift.cells_with_output_drift).toContain('evaluator-a11y');
  });

  it('detects missing on-disk body when an agent file disappears', () => {
    const { writes, cacheToml } = freshCompile();
    writes.delete('out/evaluator-a11y.md');
    const agentBodyReader = makeAgentBodyReader(writes, 'out');
    const result = check({
      axesToml,
      cacheToml,
      fragmentReader,
      agentBodyReader,
    });
    expect(result.ok).toBe(false);
    expect(result.drift.cells_missing_on_disk).toContain('evaluator-a11y');
    // A missing body is its own category, not output drift.
    expect(result.drift.cells_with_output_drift).not.toContain('evaluator-a11y');
  });

  it('detects missing cache entry when a new cell appears in axes.toml without a cache entry', () => {
    const { cacheToml: legacyCache } = freshCompile();
    // Strip one cell's entry from the cache (simulating a newly-added
    // cell that hasn't been fused yet).
    const stripped = legacyCache
      .split(/\n\n/)
      .filter((block) => !block.includes('cell_id = "evaluator-a11y"'))
      .join('\n\n');
    const { agentBodyReader } = freshCompile();
    const result = check({
      axesToml,
      cacheToml: stripped,
      fragmentReader,
      agentBodyReader,
    });
    expect(result.ok).toBe(false);
    expect(result.drift.cells_missing_cache_entry).toContain('evaluator-a11y');
  });

  it('detects stale cache entry when the cache holds an id no longer in the derived set', () => {
    const { cacheToml, agentBodyReader } = freshCompile();
    // Inject a phantom cache entry. Use a real CacheEntry shape so
    // readCache picks it up.
    const phantomEntry = [
      '',
      '[[cells]]',
      'cell_id = "evaluator-ghost"',
      `fused_at = "${FUSED_AT}"`,
      `output_hash = "${'0'.repeat(64)}"`,
      'prompt_hash = ""',
      `source_hash_phase = "${'0'.repeat(64)}"`,
      `source_hash_personality = "${'0'.repeat(64)}"`,
      `source_hash_domain = "${'0'.repeat(64)}"`,
      '',
    ].join('\n');
    const polluted = cacheToml + phantomEntry;
    const result = check({
      axesToml,
      cacheToml: polluted,
      fragmentReader,
      agentBodyReader,
    });
    expect(result.ok).toBe(false);
    expect(result.drift.stale_cache_entries).toContain('evaluator-ghost');
  });

  it('--check makes no API call and no writes — pure deterministic comparison', () => {
    // Sanity: check returns synchronously, doesn't take a fileWriter,
    // doesn't take a fusion callback. The type signature is the
    // proof, but assert the runtime trivially.
    const { cacheToml, agentBodyReader } = freshCompile();
    const start = Date.now();
    const result = check({
      axesToml,
      cacheToml,
      fragmentReader,
      agentBodyReader,
    });
    const elapsed = Date.now() - start;
    expect(result.ok).toBe(true);
    // Generous bound — purely deterministic, should run in tens of ms.
    expect(elapsed).toBeLessThan(2000);
  });
});

describe('compile: validate gates the pipeline', () => {
  it('throws ComposeError when axes.toml has a validate-stage finding', () => {
    // Construct a tiny axes.toml whose recipe references an unknown phase.
    const bad = `
schema_version = 1

[axis.domain.foo]
phases = ["reviewer"]
tool_grants = []

[axis.personality.skeptic]
phases = ["reviewer"]
disposition = "x"

[axis.phase.reviewer]
base_tools = ["Read"]
writes = false
default_personality = "skeptic"

[[recipes]]
name = "broken"
phase = "ghost"
personality = "skeptic"
domains = ["foo"]

[[retained]]
name = "contract-fit"
`;
    expect(() =>
      compile({
        axesToml: bad,
        outputDir: 'out',
        fragmentReader: () => '',
        fileWriter: () => {},
        fusedAt: FUSED_AT,
      }),
    ).toThrow(/validate failed/);
  });
});
