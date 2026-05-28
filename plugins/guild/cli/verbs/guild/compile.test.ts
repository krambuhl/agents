import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

import { compile } from './compile.ts';
import type { CompileReport } from './compile.ts';
import type { FileWriter } from './compile/emit.ts';

const pluginRoot = dirname(dirname(dirname(dirname(fileURLToPath(import.meta.url)))));

function inMemoryWriter(writes: Map<string, string>): FileWriter {
  return (relPath, content) => {
    writes.set(relPath, content);
  };
}

const FUSED_AT = '2026-05-28T20:00:00Z';

describe('compile: end-to-end smoke against the real seed axes.toml', () => {
  it('runs parse → validate → derive → resolve → compose → emit and produces cells', () => {
    const axesToml = readFileSync(join(pluginRoot, 'axes.toml'), 'utf8');
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
    expect(writes.has('out/whiteboard-skeptic.md')).toBe(true);
  });

  it('every emitted .md carries the YAML frontmatter and provenance comment', () => {
    const axesToml = readFileSync(join(pluginRoot, 'axes.toml'), 'utf8');
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
    const axesToml = readFileSync(join(pluginRoot, 'axes.toml'), 'utf8');
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
    const axesToml = readFileSync(join(pluginRoot, 'axes.toml'), 'utf8');
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
