import { test, expect } from 'vitest';
import { parsePhase } from './plan.ts';

const PLAN = `# Some Plan

## M1 — Foundations

#### Phase 1.3 — \`jelly-loom\` substrate

**Goal**: Ship the record-keeping layer.

**Exit**:
- \`plugins/jelly-loom/\` exists.
- CLI verbs land.

**Depends on**: Phase 1.1.

### M2 — Orchestration layer

#### Phase 2.1 — \`jelly-run\` substrate

**Goal**: Ship the orchestration layer of jelly.

**Exit**:
- \`plugins/jelly-run/\` exists with plugin.json + marketplace entry.
- Three skills shipped inside the plugin.
- Plugin dependencies: \`[commons, jelly-guild, jelly-loom]\`.

**Depends on**: Phase 1.2, Phase 1.3.

**Risks**: /goal API may evolve.
`;

test('parsePhase extracts goal + exit criteria for a named phase', () => {
  const phase = parsePhase(PLAN, 'Phase 2.1');
  expect(phase.name).toContain('Phase 2.1');
  expect(phase.goal).toBe('Ship the orchestration layer of jelly.');
  expect(phase.exitCriteria).toHaveLength(3);
  expect(phase.exitCriteria[0]).toContain('plugins/jelly-run/');
});

test('parsePhase stops at the next heading — no bleed into the following section', () => {
  // Phase 1.3's exit list must not absorb Phase 2.1's content.
  const phase = parsePhase(PLAN, 'Phase 1.3');
  expect(phase.exitCriteria).toHaveLength(2);
  expect(phase.goal).toBe('Ship the record-keeping layer.');
});

test('parsePhase stops the exit list at the next ** field (Depends on)', () => {
  const phase = parsePhase(PLAN, 'Phase 2.1');
  // "Plugin dependencies" is the last bullet; "Depends on" / "Risks" are
  // fields, not criteria, and must not leak in.
  for (const c of phase.exitCriteria) {
    expect(c).not.toContain('Depends on');
    expect(c).not.toContain('/goal API may evolve');
  }
});

test('parsePhase matches by substring (partial phase name)', () => {
  const phase = parsePhase(PLAN, 'jelly-run');
  expect(phase.name).toContain('Phase 2.1');
});

test('parsePhase throws phase-not-found for an unknown phase', () => {
  expect(() => parsePhase(PLAN, 'Phase 9.9')).toThrow(/phase-not-found/);
});

test('parsePhase tolerates a phase with no exit criteria', () => {
  const plan = `#### Phase 5.0 — empty\n\n**Goal**: Do a thing.\n\n**Depends on**: nothing.\n`;
  const phase = parsePhase(plan, 'Phase 5.0');
  expect(phase.goal).toBe('Do a thing.');
  expect(phase.exitCriteria).toEqual([]);
});
