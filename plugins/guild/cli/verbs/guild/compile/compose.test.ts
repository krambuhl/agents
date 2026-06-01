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

  it('uses "plan" role for plan phase cells', () => {
    const result = compose(makeCell({ phase: 'plan', id: 'plan-foo' }));
    expect(result.composed_body).toContain('role: plan');
  });

  it('description names personality + domain + role for recipe cells', () => {
    const result = compose(makeCell());
    expect(result.composed_body).toContain('skeptic foo evaluator');
  });

  it('description for singletons (no domain) omits the domain term', () => {
    const result = compose(
      makeCell({
        id: 'plan-skeptic',
        phase: 'plan',
        domain: null,
        source: 'singleton',
        domain_fragment: '',
      }),
    );
    expect(result.composed_body).toContain('skeptic plan');
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
        id: 'plan-skeptic',
        phase: 'plan',
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

describe('compose: identical-line dedup', () => {
  it('drops a shared line from the later axis (first-occurring axis wins by phase > personality > domain)', () => {
    const result = compose(
      makeCell({
        phase_fragment: '## Stance\nbe doubtful\n',
        personality_fragment: '## Disposition\nbe doubtful\n',
        domain_fragment: '## Scope\nfoo concerns\n',
      }),
    );
    // "be doubtful" appears in phase AND personality. Phase wins
    // (earlier in AXIS_ORDER). Personality drops the line.
    const phaseSectionIdx = result.composed_body.indexOf('<!-- @section: phase -->');
    const personalitySectionIdx = result.composed_body.indexOf('<!-- @section: personality -->');
    const phaseSection = result.composed_body.slice(phaseSectionIdx);
    const personalitySection = result.composed_body.slice(
      personalitySectionIdx,
      phaseSectionIdx,
    );
    expect(phaseSection).toContain('be doubtful');
    expect(personalitySection).not.toContain('be doubtful');
  });

  it('drops a shared line from domain when phase + domain share it (phase wins; personality untouched)', () => {
    const result = compose(
      makeCell({
        phase_fragment: '## Tool posture\n- Read\n',
        personality_fragment: '## Disposition\n- doubt\n',
        domain_fragment: '## Scope\n- Read\nfoo only\n',
      }),
    );
    const dedupAnnotation = result.composed_body.match(
      /<!-- DEDUP: dropped (\d+) line\(s\) from domain \(also present in ([^)]+)\) -->/,
    );
    expect(dedupAnnotation).not.toBeNull();
    expect(dedupAnnotation![1]).toBe('1');
    expect(dedupAnnotation![2]).toBe('phase');
  });

  it('three-way overlap: line in all three fragments, phase owns it, personality+domain both drop', () => {
    const result = compose(
      makeCell({
        phase_fragment: 'shared guidance\n',
        personality_fragment: 'shared guidance\n',
        domain_fragment: 'shared guidance\n',
      }),
    );
    const phaseIdx = result.composed_body.indexOf('<!-- @section: phase -->');
    const personalityIdx = result.composed_body.indexOf('<!-- @section: personality -->');
    const domainIdx = result.composed_body.indexOf('<!-- @section: domain -->');
    // Phase keeps the line; personality and domain both drop it.
    expect(result.composed_body.slice(phaseIdx)).toContain('shared guidance');
    expect(result.composed_body.slice(personalityIdx, phaseIdx)).not.toContain(
      'shared guidance',
    );
    expect(result.composed_body.slice(domainIdx)).not.toContain('shared guidance');
    // The personality and domain annotations both name phase as the
    // owner since that's where the shared line now lives.
    expect(result.composed_body).toMatch(
      /<!-- DEDUP: dropped 1 line\(s\) from personality \(also present in [^)]*phase[^)]*\) -->/,
    );
    expect(result.composed_body).toMatch(
      /<!-- DEDUP: dropped 1 line\(s\) from domain \(also present in [^)]*phase[^)]*\) -->/,
    );
  });

  it('does not annotate axes whose lines stayed put (no dedup → no marker)', () => {
    const result = compose(makeCell());
    // With the default makeCell fragments (distinct heading sets +
    // distinct bodies), no lines are shared, so no DEDUP markers
    // are emitted.
    expect(result.composed_body).not.toContain('<!-- DEDUP:');
  });

  it('treats heading lines like any other line — shared headings dedup', () => {
    const result = compose(
      makeCell({
        phase_fragment: '## Vocabulary\n- terms\n',
        personality_fragment: '## Vocabulary\n- words\n',
        domain_fragment: '## Scope\nfoo\n',
      }),
    );
    // "## Vocabulary" is shared (phase + personality). Phase wins.
    const phaseIdx = result.composed_body.indexOf('<!-- @section: phase -->');
    const personalityIdx = result.composed_body.indexOf('<!-- @section: personality -->');
    const phaseSection = result.composed_body.slice(phaseIdx);
    const personalitySection = result.composed_body.slice(personalityIdx, phaseIdx);
    expect(phaseSection).toContain('## Vocabulary');
    expect(personalitySection).not.toContain('## Vocabulary');
    // Personality's body content (- words) is unique and stays.
    expect(personalitySection).toContain('- words');
  });

  it('blank lines are not deduped (so dedup never collapses whitespace structure)', () => {
    const result = compose(
      makeCell({
        phase_fragment: 'a\n\nb\n',
        personality_fragment: 'c\n\nd\n',
        domain_fragment: 'e\n\nf\n',
      }),
    );
    expect(result.composed_body).not.toContain('<!-- DEDUP:');
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
