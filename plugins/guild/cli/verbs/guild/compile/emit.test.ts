import { describe, expect, it } from 'vitest';

import { emit, type FileWriter } from './emit.ts';
import { EmitError, type ComposedAgent } from './types.ts';

function makeAgent(overrides: Partial<ComposedAgent> = {}): ComposedAgent {
  return {
    id: 'evaluator-foo',
    phase: 'reviewer',
    personality: 'skeptic',
    domain: 'foo',
    source: 'recipe',
    source_name: 'r',
    phase_fragment: 'phase body',
    personality_fragment: 'personality body',
    domain_fragment: 'domain body',
    tools: ['Read'],
    composed_body: '---\nname: evaluator-foo\n---\n\nhello',
    source_hashes: {
      phase: 'a'.repeat(64),
      personality: 'b'.repeat(64),
      domain: 'c'.repeat(64),
    },
    ...overrides,
  };
}

function makeWriter(): { fileWriter: FileWriter; writes: Map<string, string> } {
  const writes = new Map<string, string>();
  const fileWriter: FileWriter = (relPath, content) => {
    writes.set(relPath, content);
  };
  return { fileWriter, writes };
}

const FUSED_AT = '2026-05-28T12:34:56Z';

describe('emit: per-cell files', () => {
  it('writes one .md per cell to outputDir/<id>.md', () => {
    const agents = [
      makeAgent({ id: 'evaluator-foo' }),
      makeAgent({ id: 'plan-bar' }),
    ];
    const { fileWriter, writes } = makeWriter();
    const result = emit(agents, 'agents/generated', fileWriter, FUSED_AT);
    expect(writes.has('agents/generated/evaluator-foo.md')).toBe(true);
    expect(writes.has('agents/generated/plan-bar.md')).toBe(true);
    expect(result.written_files).toContain('agents/generated/evaluator-foo.md');
    expect(result.written_files).toContain('agents/generated/plan-bar.md');
  });

  it('preserves composed_body byte-for-byte', () => {
    const body = '---\nname: x\n---\n\nbody content with markers\n';
    const agents = [makeAgent({ id: 'x', composed_body: body })];
    const { fileWriter, writes } = makeWriter();
    emit(agents, 'out', fileWriter, FUSED_AT);
    expect(writes.get('out/x.md')).toBe(body);
  });
});

describe('emit: .cache.toml', () => {
  it('writes a .cache.toml with one [[cells]] per agent', () => {
    const agents = [
      makeAgent({ id: 'evaluator-foo' }),
      makeAgent({ id: 'plan-bar' }),
    ];
    const { fileWriter, writes } = makeWriter();
    emit(agents, 'agents/generated', fileWriter, FUSED_AT);
    const cache = writes.get('agents/generated/.cache.toml');
    expect(cache).toBeDefined();
    expect(cache).toContain('schema_version = 1');
    expect((cache!.match(/\[\[cells\]\]/g) || []).length).toBe(2);
  });

  it('cache entries record cell_id + source_hashes + output_hash + fused_at + prompt_hash', () => {
    const agents = [makeAgent({ id: 'evaluator-foo' })];
    const { fileWriter, writes } = makeWriter();
    const result = emit(agents, 'out', fileWriter, FUSED_AT);
    const cache = writes.get('out/.cache.toml')!;
    expect(cache).toContain('cell_id = "evaluator-foo"');
    expect(cache).toContain(`fused_at = "${FUSED_AT}"`);
    expect(cache).toContain('output_hash = "');
    expect(cache).toContain('prompt_hash = "');
    expect(cache).toContain(`source_hash_phase = "${'a'.repeat(64)}"`);
    expect(result.cache_entries.length).toBe(1);
    expect(result.cache_entries[0]!.cell_id).toBe('evaluator-foo');
    expect(result.cache_entries[0]!.prompt_hash).toBe('');
  });

  it('cache entries are sorted by cell_id (deterministic output)', () => {
    const agentsInRandomOrder = [
      makeAgent({ id: 'z' }),
      makeAgent({ id: 'a' }),
      makeAgent({ id: 'm' }),
    ];
    const { fileWriter, writes } = makeWriter();
    emit(agentsInRandomOrder, 'out', fileWriter, FUSED_AT);
    const cache = writes.get('out/.cache.toml')!;
    const aIdx = cache.indexOf('cell_id = "a"');
    const mIdx = cache.indexOf('cell_id = "m"');
    const zIdx = cache.indexOf('cell_id = "z"');
    expect(aIdx).toBeLessThan(mIdx);
    expect(mIdx).toBeLessThan(zIdx);
  });

  it('two runs over the same input produce byte-identical .cache.toml (given the same fusedAt)', () => {
    const agents = [makeAgent({ id: 'evaluator-foo' })];
    const a = makeWriter();
    const b = makeWriter();
    emit(agents, 'out', a.fileWriter, FUSED_AT);
    emit(agents, 'out', b.fileWriter, FUSED_AT);
    expect(a.writes.get('out/.cache.toml')).toBe(b.writes.get('out/.cache.toml'));
  });
});

describe('emit: output_hash', () => {
  it('output_hash is SHA-256 of composed_body (64 hex chars)', () => {
    const agents = [makeAgent()];
    const { fileWriter } = makeWriter();
    const result = emit(agents, 'out', fileWriter, FUSED_AT);
    expect(result.cache_entries[0]!.output_hash).toMatch(/^[0-9a-f]{64}$/);
  });

  it('output_hash changes when composed_body changes', () => {
    const a = emit([makeAgent({ composed_body: 'A' })], 'out', () => {}, FUSED_AT);
    const b = emit([makeAgent({ composed_body: 'B' })], 'out', () => {}, FUSED_AT);
    expect(a.cache_entries[0]!.output_hash).not.toBe(b.cache_entries[0]!.output_hash);
  });
});

describe('emit: prompt_hash', () => {
  it('writes the passed promptHash into every cache entry', () => {
    const agents = [
      makeAgent({ id: 'a' }),
      makeAgent({ id: 'b' }),
    ];
    const { fileWriter, writes } = makeWriter();
    const result = emit(agents, 'out', fileWriter, FUSED_AT, 'deadbeef'.repeat(8));
    const cache = writes.get('out/.cache.toml')!;
    expect((cache.match(new RegExp(`prompt_hash = "${'deadbeef'.repeat(8)}"`, 'g')) || []).length).toBe(2);
    for (const entry of result.cache_entries) {
      expect(entry.prompt_hash).toBe('deadbeef'.repeat(8));
    }
  });

  it('defaults to empty string when promptHash is not passed', () => {
    const agents = [makeAgent()];
    const { fileWriter, writes } = makeWriter();
    const result = emit(agents, 'out', fileWriter, FUSED_AT);
    expect(writes.get('out/.cache.toml')).toContain('prompt_hash = ""');
    expect(result.cache_entries[0]!.prompt_hash).toBe('');
  });
});

describe('emit: error cases', () => {
  it('throws EmitError on empty agents list', () => {
    const { fileWriter } = makeWriter();
    expect(() => emit([], 'out', fileWriter, FUSED_AT)).toThrow(EmitError);
  });
});
