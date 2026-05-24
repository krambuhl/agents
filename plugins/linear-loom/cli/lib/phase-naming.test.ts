import { test, expect } from 'vitest';
import { parsePhaseFromMilestoneName } from './phase-naming.ts';

test('parsePhaseFromMilestoneName: parses the standard `<slug> · Phase N — <prose>` shape', () => {
  expect(
    parsePhaseFromMilestoneName('my-thing · Phase 1 — Design', 'my-thing'),
  ).toEqual({ number: 1, name: 'Design' });
});

test('parsePhaseFromMilestoneName: accepts ASCII hyphen as well as em-dash (operators may type either)', () => {
  expect(
    parsePhaseFromMilestoneName('my-thing · Phase 7 - Dogfood', 'my-thing'),
  ).toEqual({ number: 7, name: 'Dogfood' });
});

test('parsePhaseFromMilestoneName: returns null when the slug prefix does not match', () => {
  expect(
    parsePhaseFromMilestoneName('other-project · Phase 1 — Design', 'my-thing'),
  ).toBeNull();
});

test('parsePhaseFromMilestoneName: returns null on a non-phase milestone name', () => {
  expect(
    parsePhaseFromMilestoneName('my-thing · Generic Milestone', 'my-thing'),
  ).toBeNull();
});

test('parsePhaseFromMilestoneName: trims trailing whitespace from the parsed name', () => {
  expect(
    parsePhaseFromMilestoneName(
      'my-thing · Phase 3 — Project lifecycle verbs   ',
      'my-thing',
    ),
  ).toEqual({ number: 3, name: 'Project lifecycle verbs' });
});

test('parsePhaseFromMilestoneName: parses multi-digit phase numbers', () => {
  expect(
    parsePhaseFromMilestoneName('my-thing · Phase 12 — Late phase', 'my-thing'),
  ).toEqual({ number: 12, name: 'Late phase' });
});
