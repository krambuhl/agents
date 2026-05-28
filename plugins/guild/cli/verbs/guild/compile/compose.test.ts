import { describe, expect, it } from 'vitest';

import { compose } from './compose.ts';
import type { ResolvedCell } from './types.ts';

function makeCell(overrides: Partial<ResolvedCell> = {}): ResolvedCell {
  return {
    id: 'evaluator-foo',
    phase: 'reviewer',
    personality: 'skeptic',
    domain: 'foo',
    source: 'recipe',
    source_name: 'r',
    phase_fragment: '# Phase\n\n## Stance\n\nSkeptical.\n',
    personality_fragment: '# Skeptic\n\n## Disposition\n\nDoubt.\n',
    domain_fragment: '# Domain: foo\n\n## Scope\n\nFoo concerns.\n',
    tools: ['Bash(npm run lint:*)', 'Glob', 'Grep', 'Read'],
    ...overrides,
  };
}

describe('compose: frontmatter', () => {
  it('emits YAML frontmatter with name, role, description, tools, model, maxTurns', () => {
    const result = compose(makeCell());
    expect(result.composed_body).toMatch(/^---\nname: evaluator-foo\n/);
    expect(result.composed_body).toContain('role: evaluator');
    expect(result.composed_body).toContain('tools: Bash(npm run lint:*), Glob, Grep, Read');
    expect(result.composed_body).toContain('model: inherit');
    expect(result.composed_body).toContain('maxTurns: 5');
  });

  it('uses "whiteboard" role for planner phase cells', () => {
    const result = compose(makeCell({ phase: 'planner', id: 'whiteboard-foo' }));
    expect(result.composed_body).toContain('role: whiteboard');
  });

  it('description names personality + domain + role for recipe cells', () => {
    const result = compose(makeCell());
    expect(result.composed_body).toContain('skeptic foo evaluator');
  });

  it('description for singletons (no domain) omits the domain term', () => {
    const result = compose(
      makeCell({
        id: 'whiteboard-skeptic',
        phase: 'planner',
        domain: null,
        source: 'singleton',
        domain_fragment: '',
      }),
    );
    expect(result.composed_body).toContain('skeptic whiteboard');
    expect(result.composed_body).not.toContain('skeptic null');
  });
});

describe('compose: body composition', () => {
  it('concatenates the three fragments under @section markers', () => {
    const result = compose(makeCell());
    expect(result.composed_body).toContain('<!-- @section: personality -->');
    expect(result.composed_body).toContain('<!-- @section: phase -->');
    expect(result.composed_body).toContain('<!-- @section: domain -->');

    const persIdx = result.composed_body.indexOf('<!-- @section: personality -->');
    const phaseIdx = result.composed_body.indexOf('<!-- @section: phase -->');
    const domainIdx = result.composed_body.indexOf('<!-- @section: domain -->');
    expect(persIdx).toBeLessThan(phaseIdx);
    expect(phaseIdx).toBeLessThan(domainIdx);
  });

  it('omits the domain section for singletons (empty domain_fragment + null domain)', () => {
    const result = compose(
      makeCell({
        id: 'whiteboard-skeptic',
        phase: 'planner',
        domain: null,
        source: 'singleton',
        domain_fragment: '',
      }),
    );
    expect(result.composed_body).not.toContain('<!-- @section: domain -->');
  });

  it('includes a do-not-edit provenance comment', () => {
    const result = compose(makeCell());
    expect(result.composed_body).toContain('COMPOSED by `guild compile`');
    expect(result.composed_body).toContain('Do not edit by hand');
  });

  it('ends with a trailing newline', () => {
    const result = compose(makeCell());
    expect(result.composed_body.endsWith('\n')).toBe(true);
  });
});

describe('compose: dedup markers', () => {
  it('emits a dedup-candidate marker when a ## heading appears in 2+ fragments', () => {
    const result = compose(
      makeCell({
        personality_fragment: '## Vocabulary\n- doubt\n',
        domain_fragment: '## Vocabulary\n- premature abstraction\n',
        phase_fragment: '# Phase\nNo headings.\n',
      }),
    );
    expect(result.composed_body).toContain('DEDUP candidate');
    expect(result.composed_body).toContain('## Vocabulary');
    expect(result.composed_body).toContain('personality + domain');
  });

  it('emits no dedup markers when the fragments share zero ## headings', () => {
    const result = compose(makeCell());
    expect(result.composed_body).not.toContain('DEDUP candidate');
  });
});

describe('compose: source hashes', () => {
  it('produces stable SHA-256 hashes for each fragment', () => {
    const result1 = compose(makeCell());
    const result2 = compose(makeCell());
    expect(result1.source_hashes).toEqual(result2.source_hashes);
    expect(result1.source_hashes.phase).toMatch(/^[0-9a-f]{64}$/);
    expect(result1.source_hashes.personality).toMatch(/^[0-9a-f]{64}$/);
    expect(result1.source_hashes.domain).toMatch(/^[0-9a-f]{64}$/);
  });

  it('changes the source hash when the corresponding fragment changes', () => {
    const a = compose(makeCell({ phase_fragment: 'A\n' }));
    const b = compose(makeCell({ phase_fragment: 'B\n' }));
    expect(a.source_hashes.phase).not.toBe(b.source_hashes.phase);
    expect(a.source_hashes.personality).toBe(b.source_hashes.personality);
    expect(a.source_hashes.domain).toBe(b.source_hashes.domain);
  });

  it('hashes an empty domain_fragment for singletons (consistent fingerprint)', () => {
    const a = compose(
      makeCell({
        domain: null,
        domain_fragment: '',
      }),
    );
    const b = compose(
      makeCell({
        domain: null,
        domain_fragment: '',
      }),
    );
    expect(a.source_hashes.domain).toBe(b.source_hashes.domain);
  });
});
