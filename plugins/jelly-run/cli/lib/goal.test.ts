import { test, expect } from 'vitest';
import {
  MIN_GOAL_CLAUDE_VERSION,
  assertGoalVersion,
  composePreamble,
} from './goal.ts';
import type { GitState, PhaseContext } from './types.ts';

function makePhase(overrides: Partial<PhaseContext> = {}): PhaseContext {
  return {
    name: 'Phase 2.1 — jelly-run substrate',
    goal: 'Ship the orchestration layer of jelly.',
    exitCriteria: ['plugins/jelly-run/ exists', 'three skills shipped'],
    ...overrides,
  };
}

function makeGitState(overrides: Partial<GitState> = {}): GitState {
  return {
    branch: 'ev-agent.jelly.run',
    baseBranch: 'main',
    changedFiles: ['plugins/jelly-run/cli/jelly-run.ts'],
    diffStat: ' plugins/jelly-run/cli/jelly-run.ts | 10 ++++++',
    ...overrides,
  };
}

// ---------- composePreamble: the load-bearing no-PR invariant ----------

test('composePreamble does NOT affirmatively instruct /goal to open a PR', () => {
  // The bug we are defending against: a preamble that tells /goal to open
  // its own PR, bypassing jelly's operator-paired PR boundary. We guard
  // the affirmative "open ..." phrasings — NOT "submit"/"create", which
  // appear legitimately inside the prohibition below (asserting their
  // absence would contradict the correct content).
  const preamble = composePreamble(makePhase(), makeGitState()).toLowerCase();
  expect(preamble).not.toContain('open a pull request');
  expect(preamble).not.toContain('open a pr');
  expect(preamble).not.toContain('open the pull request');
});

test('composePreamble carries an explicit no-PR prohibition', () => {
  // Presence side of the same invariant: the prohibition is stated, not
  // merely omitted — /goal is actively told jelly owns the PR boundary.
  // This presence check is the load-bearing half; the affirmative-absence
  // check above guards the specific "open a PR" regression shape.
  const preamble = composePreamble(makePhase(), makeGitState()).toLowerCase();
  expect(preamble).toContain('do not create or submit a pull request');
});

test('composePreamble includes the phase goal and every exit criterion', () => {
  const phase = makePhase({
    name: 'Phase 2.1 — jelly-run substrate',
    goal: 'Wrap /goal with grill-gates.',
    exitCriteria: ['criterion alpha', 'criterion beta', 'criterion gamma'],
  });
  const preamble = composePreamble(phase, makeGitState());
  expect(preamble).toContain('Wrap /goal with grill-gates.');
  for (const c of phase.exitCriteria) {
    expect(preamble).toContain(c);
  }
  expect(preamble).toContain('Phase 2.1 — jelly-run substrate');
});

test('composePreamble reports branch + base and a clean tree when nothing changed', () => {
  const preamble = composePreamble(
    makePhase(),
    makeGitState({ changedFiles: [], diffStat: '' }),
  );
  expect(preamble).toContain('ev-agent.jelly.run');
  expect(preamble).toContain('main');
  expect(preamble.toLowerCase()).toContain('working tree is clean');
});

test('composePreamble summarizes changed files when the branch has work', () => {
  const preamble = composePreamble(
    makePhase(),
    makeGitState({
      changedFiles: ['a.ts', 'b.ts'],
      diffStat: ' a.ts | 2 +\n b.ts | 3 +',
    }),
  );
  expect(preamble).toContain('2 file(s) changed');
  expect(preamble).toContain('a.ts');
});

test('composePreamble handles a phase with no exit criteria gracefully', () => {
  const preamble = composePreamble(makePhase({ exitCriteria: [] }), makeGitState());
  expect(preamble.toLowerCase()).toContain('no exit criteria recorded');
});

// ---------- assertGoalVersion: the gate (refuse, do not warn) ----------

test('assertGoalVersion accepts the exact floor version', () => {
  const result = assertGoalVersion(MIN_GOAL_CLAUDE_VERSION);
  expect(result.exitCode).toBe(0);
  expect(result.stderr).toBeUndefined();
  const parsed = JSON.parse(result.stdout as string);
  expect(parsed.ok).toBe(true);
});

test('assertGoalVersion accepts a newer version (with v prefix)', () => {
  const result = assertGoalVersion('v2.2.0');
  expect(result.exitCode).toBe(0);
});

test('assertGoalVersion REFUSES a version below the floor (exit 1, not a warning)', () => {
  const result = assertGoalVersion('2.1.138');
  expect(result.exitCode).toBe(1);
  expect(result.stdout).toBeUndefined();
  const parsed = JSON.parse(result.stderr as string);
  expect(parsed.error).toBe('goal-version-too-old');
});

test('assertGoalVersion REFUSES an unparseable version rather than guessing', () => {
  const result = assertGoalVersion('not-a-version');
  expect(result.exitCode).toBe(1);
  const parsed = JSON.parse(result.stderr as string);
  expect(parsed.error).toBe('goal-version-unrecognized');
});

test('assertGoalVersion refuses an older major even with a higher patch', () => {
  const result = assertGoalVersion('1.9.999');
  expect(result.exitCode).toBe(1);
});
