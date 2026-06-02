import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, test } from 'vitest';

// loom-plan gains a plan-* design panel (Phase 3 of
// orchestrator-guild-rpi-alignment) at the synthesis seam, composed via
// the Phase 1 derive-panel --phase=plan surface. It AUGMENTS the solo
// grill-me interview; it does NOT touch the step 6 evaluator pass, which
// keeps its own file-driven derive-panel --files= composition. These
// assertions lock both seams against the SKILL.md body.

const SKILL = readFileSync(
  join(
    dirname(fileURLToPath(import.meta.url)),
    '..',
    'skills',
    'loom-plan',
    'SKILL.md',
  ),
  'utf8',
);

describe('loom-plan composes a plan-phase design panel (Phase 3 seam)', () => {
  test('the synthesis-seam panel resolves via derive-panel --phase=plan', () => {
    expect(SKILL).toMatch(/guild derive-panel --phase=plan/);
  });

  test('plan-* is the documented bootstrapping glob fallback', () => {
    expect(SKILL).toContain('.claude/agents/plan-*.md');
  });

  test('the design panel augments — does not replace — the interview', () => {
    expect(SKILL).toMatch(/augments — it does not replace/i);
  });

  test('a convergence budget bounds the panel to a single round', () => {
    // \s+ tolerates the SKILL.md's soft line-wrapping mid-phrase.
    expect(SKILL).toMatch(/single composition\s+round/i);
    expect(SKILL).toMatch(/cannot blow the\s+interview budget/i);
  });

  test('the empty-plan-roster bootstrapping skip is documented', () => {
    expect(SKILL).toMatch(/no plan engineers registered/i);
  });
});

describe('loom-plan keeps the evaluator pass intact (both seams coexist)', () => {
  test('step 6 still derives the evaluator panel via derive-panel --files=', () => {
    expect(SKILL).toMatch(/guild derive-panel --files=/);
  });

  test('the evaluator gate still composes /guild-validate', () => {
    expect(SKILL).toContain('/guild-validate');
  });
});
