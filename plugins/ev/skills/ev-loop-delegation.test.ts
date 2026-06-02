import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, test } from 'vitest';

// Phase 4 of orchestrator-guild-rpi-alignment: both ev-loops gain a per-unit
// implementer-delegation switch. When on, the Execute step composes
// implementer-<domain> via `derive-panel --phase=implementer` and delegates
// the write through /guild-spawn (not a direct Agent call). The defaults
// differ by loop — interactive OFF (keystroke-level pairing preserved),
// confidence ON — and the evaluator checkpoint gates regardless of switch
// state. These assertions lock that wiring against both SKILL.md bodies.
// \s+ / .? tolerate the SKILL.md soft line-wrapping mid-phrase.

const SKILLS_DIR = dirname(fileURLToPath(import.meta.url));
const INTERACTIVE = readFileSync(
  join(SKILLS_DIR, 'ev-loop-interactive', 'SKILL.md'),
  'utf8',
);
const CONFIDENCE = readFileSync(
  join(SKILLS_DIR, 'ev-loop-confidence', 'SKILL.md'),
  'utf8',
);

describe('ev-loop implementer-delegation switch (Phase 4)', () => {
  test('both loops document the per-unit delegation switch', () => {
    expect(INTERACTIVE).toMatch(/Implementer delegation \(per-unit switch/);
    expect(CONFIDENCE).toMatch(/Implementer delegation \(per-unit switch/);
  });

  test('interactive defaults the switch OFF, confidence defaults it ON', () => {
    expect(INTERACTIVE).toMatch(/per-unit switch, default OFF/);
    expect(CONFIDENCE).toMatch(/per-unit switch, default ON/);
  });

  test('both compose implementer-<domain> via derive-panel --phase=implementer', () => {
    expect(INTERACTIVE).toMatch(/guild derive-panel --phase=implementer/);
    expect(CONFIDENCE).toMatch(/guild derive-panel --phase=implementer/);
  });

  test('both delegate through /guild-spawn, not a direct Agent call', () => {
    for (const body of [INTERACTIVE, CONFIDENCE]) {
      expect(body).toContain('/guild-spawn');
      expect(body).toMatch(/direct .?Agent/);
    }
  });

  test('the evaluator checkpoint fires regardless of switch state in both loops', () => {
    for (const body of [INTERACTIVE, CONFIDENCE]) {
      expect(body).toMatch(/step 3 \(Evaluate\) fires/);
    }
  });

  test('both Specialist sections retract "no control-flow change" for the write side', () => {
    for (const body of [INTERACTIVE, CONFIDENCE]) {
      expect(body).toMatch(/real wiring as of this plan.s\s+Phase 4/i);
    }
  });
});
