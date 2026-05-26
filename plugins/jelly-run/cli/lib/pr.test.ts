import { test, expect } from 'vitest';
import {
  CONFIDENCE,
  GRILL_THRESHOLD,
  classifyArchetype,
  scoreField,
  composePrBody,
  isGrilled,
  archetypeFields,
  deriveDiffSignals,
} from './pr.ts';
import type { ScoringContext } from './pr.ts';
import type { PhaseContext } from './types.ts';

const PHASE: PhaseContext = {
  name: 'Phase 2.1 — jelly-run substrate',
  goal: 'Ship the orchestration layer.',
  exitCriteria: ['x'],
};

function ctx(overrides: Partial<ScoringContext> = {}): ScoringContext {
  return {
    phase: PHASE,
    branch: 'ev-agent.jelly.run',
    changedFiles: ['plugins/jelly-run/cli/lib/pr.ts'],
    diffStat: ' plugins/jelly-run/cli/lib/pr.ts | 40 +++',
    hasNewDeps: false,
    hasTests: false,
    planMentionsChangedFiles: false,
    ...overrides,
  };
}

// ---------- threshold calibration (named constant, imported) ----------

test('confidence bands sit on the right side of GRILL_THRESHOLD', () => {
  // The calibration contract: high auto-fills, medium + low grill. If a
  // future edit moves a band across the threshold, this fails loudly.
  expect(CONFIDENCE.high).toBeGreaterThanOrEqual(GRILL_THRESHOLD);
  expect(CONFIDENCE.medium).toBeLessThan(GRILL_THRESHOLD);
  expect(CONFIDENCE.low).toBeLessThan(GRILL_THRESHOLD);
});

test('isGrilled is the threshold predicate', () => {
  expect(isGrilled({ field: 'x', value: '', confidence: CONFIDENCE.high, derivation: '' })).toBe(false);
  expect(isGrilled({ field: 'x', value: '', confidence: CONFIDENCE.medium, derivation: '' })).toBe(true);
  expect(isGrilled({ field: 'x', value: '', confidence: CONFIDENCE.low, derivation: '' })).toBe(true);
});

// ---------- the asymmetry: prose / ambiguous fields grill ----------

test('Motivation grills even WITH a PLAN pointer (a pointer is not a rationale)', () => {
  const scored = scoreField('Motivation', ctx({ planMentionsChangedFiles: true }));
  expect(isGrilled(scored)).toBe(true);
  expect(scored.confidence).toBeLessThan(GRILL_THRESHOLD);
  expect(scored.derivation).toMatch(/judgment|input/i);
});

test('Solution (prose describing the change) always grills', () => {
  const scored = scoreField('Solution', ctx({ planMentionsChangedFiles: true, hasTests: true }));
  expect(isGrilled(scored)).toBe(true);
});

test('an unrecognized field never auto-fills', () => {
  const scored = scoreField('Vibes', ctx());
  expect(scored.value).toBe('');
  expect(isGrilled(scored)).toBe(true);
});

// ---------- the auto-fill side: deterministic structural fields ----------

test('Title auto-fills high-confidence from the phase name', () => {
  const scored = scoreField('Title', ctx());
  expect(isGrilled(scored)).toBe(false);
  expect(scored.value).toContain('Phase 2.1');
});

test('Checklist auto-fills (standard template)', () => {
  expect(isGrilled(scoreField('Checklist', ctx()))).toBe(false);
});

test('Risk level auto-fills low for a clean small change', () => {
  const scored = scoreField('Risk level', ctx({ changedFiles: ['a.ts'], hasNewDeps: false }));
  expect(isGrilled(scored)).toBe(false);
  expect(scored.value).toBe('low');
});

test('Risk level grills when a dependency changed (mixed signal -> medium)', () => {
  const scored = scoreField('Risk level', ctx({ hasNewDeps: true }));
  expect(isGrilled(scored)).toBe(true);
});

test('Verification auto-fills when the diff carries tests, grills when it does not', () => {
  expect(isGrilled(scoreField('Verification', ctx({ hasTests: true })))).toBe(false);
  expect(isGrilled(scoreField('Verification', ctx({ hasTests: false })))).toBe(true);
});

// ---------- archetype classification (itself a scored field) ----------

test('classifyArchetype: deps-only small change -> dependency, high confidence', () => {
  const scored = classifyArchetype(ctx({ hasNewDeps: true, changedFiles: ['package.json'] }));
  expect(scored.value).toBe('dependency');
  expect(isGrilled(scored)).toBe(false);
});

test('classifyArchetype: large surface -> migration, but grills to confirm', () => {
  const files = Array.from({ length: 12 }, (_, i) => `f${i}.ts`);
  const scored = classifyArchetype(ctx({ changedFiles: files }));
  expect(scored.value).toBe('migration');
  expect(isGrilled(scored)).toBe(true);
});

test('classifyArchetype: ambiguous default -> architectural, grills (cannot tell bug-fix/refactor)', () => {
  const scored = classifyArchetype(ctx({ changedFiles: ['a.ts', 'b.ts'] }));
  expect(scored.value).toBe('architectural');
  expect(isGrilled(scored)).toBe(true);
});

test('archetypeFields returns the CLAUDE.md field set per archetype', () => {
  expect(archetypeFields('architectural')).toContain('Motivation');
  expect(archetypeFields('bug-fix')).toContain('Root cause');
  expect(archetypeFields('dependency')).toContain('Why this bump');
});

// ---------- signal derivation ----------

test('deriveDiffSignals detects dependency changes', () => {
  expect(deriveDiffSignals(['package.json'], '').hasNewDeps).toBe(true);
  expect(deriveDiffSignals(['package-lock.json'], '').hasNewDeps).toBe(true);
  expect(deriveDiffSignals(['src/a.ts'], '').hasNewDeps).toBe(false);
});

test('deriveDiffSignals detects test files', () => {
  expect(deriveDiffSignals(['a.test.ts'], '').hasTests).toBe(true);
  expect(deriveDiffSignals(['a.spec.tsx'], '').hasTests).toBe(true);
  expect(deriveDiffSignals(['a.ts'], '').hasTests).toBe(false);
});

test('deriveDiffSignals detects when PLAN mentions a changed file', () => {
  const plan = 'We will edit plugins/jelly-run/cli/jelly-run.ts in this phase.';
  expect(deriveDiffSignals(['plugins/jelly-run/cli/jelly-run.ts'], plan).planMentionsChangedFiles).toBe(true);
  expect(deriveDiffSignals(['unrelated/x.ts'], plan).planMentionsChangedFiles).toBe(false);
});

// ---------- body composition ----------

test('composePrBody renders archetype field sections plus Rollout + Checklist', () => {
  const fields = archetypeFields('architectural').map((f) => scoreField(f, ctx()));
  const body = composePrBody(fields);
  expect(body).toContain('## Motivation');
  expect(body).toContain('## Verification');
  expect(body).toContain('## Rollout');
  expect(body).toContain('## Checklist');
  // The standard checklist block is rendered once, not from a scored field.
  expect(body).toContain('- [ ] Verified locally');
});
