import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, test } from 'vitest';

// orchestrator-guild-rpi-alignment delegation seam, across both ev-loops:
//   - Phase 4: the Execute step gains a per-unit implementer-delegation
//     switch (compose implementer-<domain> via `derive-panel
//     --phase=implementer`, delegate the write through /guild-spawn, not a
//     direct Agent call). Defaults differ by loop — interactive OFF
//     (keystroke-level pairing preserved), confidence ON.
//   - Phase 5: the FIX step gains the mirror fixer-delegation switch
//     (`derive-panel --phase=fixer`, minimal pragmatist remedy, re-gated).
//   - Phase 6: the obsolete "Specialist gate-then-review" section is
//     deleted; the cleanup-lock below asserts it stays gone.
// In every case the evaluator checkpoint gates regardless of switch state.
// These assertions lock that wiring against both SKILL.md bodies; \s+ / .?
// tolerate the SKILL.md soft line-wrapping mid-phrase.

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

  test('the obsolete "Specialist gate-then-review" section is deleted (Phase 6 cleanup)', () => {
    // The write-side wiring is real in the Execute step (Phases 4-5), so the
    // Phase-4 placeholder section — and its "no control-flow change" claim —
    // was removed in Phase 6. Lock that it stays gone.
    for (const body of [INTERACTIVE, CONFIDENCE]) {
      expect(body).not.toMatch(/Specialist-evaluator gate-then-review/);
      expect(body).not.toMatch(/no control-flow change/i);
    }
  });
});

describe('ev-loop fixer-delegation switch (Phase 5)', () => {
  test('both loops document the per-unit fixer-delegation switch', () => {
    expect(INTERACTIVE).toMatch(/Fixer delegation \(per-unit switch/);
    expect(CONFIDENCE).toMatch(/Fixer delegation \(per-unit switch/);
  });

  test('interactive defaults the fix switch OFF, confidence defaults it ON', () => {
    expect(INTERACTIVE).toMatch(/Fixer delegation \(per-unit switch, default OFF/);
    expect(CONFIDENCE).toMatch(/Fixer delegation \(per-unit switch, default ON/);
  });

  test('both compose fixer-<domain> via derive-panel --phase=fixer', () => {
    expect(INTERACTIVE).toMatch(/guild derive-panel --phase=fixer/);
    expect(CONFIDENCE).toMatch(/guild derive-panel --phase=fixer/);
  });

  test('the delegated remedy is the minimal pragmatist fix, re-gated by the panel', () => {
    for (const body of [INTERACTIVE, CONFIDENCE]) {
      expect(body).toMatch(/default_personality.{0,8}pragmatist/i);
      expect(body).toMatch(/re-invoke[\s\S]{0,20}guild-validate/i);
    }
  });

  test('the inline-fix path is still the documented fallback when off/unregistered', () => {
    // "back to inline fix" anchors to the opt-out / registry-lag fallback
    // clauses rather than matching the phrase anywhere in the body.
    for (const body of [INTERACTIVE, CONFIDENCE]) {
      expect(body).toMatch(/back to inline fix/i);
    }
  });
});
