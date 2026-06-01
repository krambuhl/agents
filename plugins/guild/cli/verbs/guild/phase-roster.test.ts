import { readFileSync } from 'node:fs';
import { describe, expect, test } from 'vitest';
import { parseToml } from '../../lib/toml.ts';
import { PhaseRosterError, resolvePhaseRoster } from './phase-roster.ts';
import { defaultAxesPath } from './recipe.ts';

const axes = parseToml(readFileSync(defaultAxesPath(), 'utf8'));

// These rosters are the participation source of truth for the four
// roster-driven phases. They cross-check against the `*-default` recipes
// in axes.toml (research-default = 10 domains, implementer/fixer-default =
// 8) — if a domain's `phases` list drifts, these break loud.
describe('resolvePhaseRoster (live axes.toml)', () => {
  test('research → 10 domains, research- prefixed, sorted by domain', () => {
    expect(resolvePhaseRoster(axes, 'research')).toEqual([
      'research-a11y',
      'research-abstraction',
      'research-composition',
      'research-naming',
      'research-performance',
      'research-react',
      'research-substrate',
      'research-test-integration',
      'research-test-unit',
      'research-tokens',
    ]);
  });

  test('plan → the same 10 domains as research, plan- prefixed', () => {
    expect(resolvePhaseRoster(axes, 'plan')).toEqual([
      'plan-a11y',
      'plan-abstraction',
      'plan-composition',
      'plan-naming',
      'plan-performance',
      'plan-react',
      'plan-substrate',
      'plan-test-integration',
      'plan-test-unit',
      'plan-tokens',
    ]);
  });

  test('implementer → 8 domains, implementer- prefixed (no evaluator skew)', () => {
    expect(resolvePhaseRoster(axes, 'implementer')).toEqual([
      'implementer-a11y',
      'implementer-css-architecture',
      'implementer-naming',
      'implementer-nextjs',
      'implementer-react',
      'implementer-test-integration',
      'implementer-test-unit',
      'implementer-tokens',
    ]);
  });

  test('fixer → the same 8 domains as implementer, fixer- prefixed', () => {
    expect(resolvePhaseRoster(axes, 'fixer')).toEqual([
      'fixer-a11y',
      'fixer-css-architecture',
      'fixer-naming',
      'fixer-nextjs',
      'fixer-react',
      'fixer-test-integration',
      'fixer-test-unit',
      'fixer-tokens',
    ]);
  });

  test('reviewer applies the evaluator- prefix skew (faithful reader, even though derive-panel routes reviewer to the file path)', () => {
    expect(resolvePhaseRoster(axes, 'reviewer')).toEqual([
      'evaluator-a11y',
      'evaluator-css-architecture',
      'evaluator-naming',
      'evaluator-nextjs',
      'evaluator-react',
      'evaluator-test-integration',
      'evaluator-test-unit',
      'evaluator-tokens',
    ]);
  });

  test('unknown phase fails loud (never an empty roster)', () => {
    expect(() => resolvePhaseRoster(axes, 'bogus')).toThrow(PhaseRosterError);
  });
});

describe('resolvePhaseRoster (synthetic table — membership + sort precision)', () => {
  const synthetic = parseToml(
    [
      '[axis.domain.zebra]',
      'phases = ["plan"]',
      '[axis.domain.alpha]',
      'phases = ["plan", "research"]',
      '[axis.domain.skip]',
      'phases = ["research"]',
    ].join('\n'),
  );

  test('emits only the phase members, sorted alpha regardless of declaration order', () => {
    expect(resolvePhaseRoster(synthetic, 'plan')).toEqual([
      'plan-alpha',
      'plan-zebra',
    ]);
  });

  test('a different phase selects a different membership subset', () => {
    expect(resolvePhaseRoster(synthetic, 'research')).toEqual([
      'research-alpha',
      'research-skip',
    ]);
  });
});
