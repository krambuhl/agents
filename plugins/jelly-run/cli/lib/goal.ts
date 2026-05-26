// The ONE module that knows /goal's surface. Everything jelly-run
// couples to Claude Code's `/goal` command lives here: the preamble
// shape (the goal-text /goal executes against) and the version
// compatibility gate. When /goal's preamble or version contract
// changes upstream, this is the single file to edit — the blast radius
// is one module, not three skill bodies (the whiteboard's adapter-seam
// finding).
//
// These functions are PURE: they take already-gathered inputs (a
// PhaseContext parsed from PLAN.md, a GitState gathered via GitRunner)
// and return strings / DispatchResults. The IO (reading PLAN.md,
// running git, invoking /goal, observing the yield) lives in the verb
// handlers and the skill bodies, not here — so the coupling knowledge
// is testable without /goal in the loop.

import type { GitState, PhaseContext, DispatchResult } from './types.ts';

// The /goal command shipped in Claude Code 2.1.139 (the jelly RESEARCH
// § Phase 1.1 empirical floor). jelly-run refuses to compose a preamble
// for a CLI older than this rather than feed /goal a shape it may not
// understand — a silently-wrong preamble is worse than a refusal, and a
// silent yield-detection failure would strand the work without yielding
// (violating the non-negotiable yield-to-operator posture).
export const MIN_GOAL_CLAUDE_VERSION = '2.1.139';

// Parsed [major, minor, patch]; null when the string is not a clean
// dotted-numeric version.
function parseVersion(version: string): [number, number, number] | null {
  const trimmed = version.trim().replace(/^v/, '');
  const parts = trimmed.split('.');
  if (parts.length < 3) return null;
  const nums = parts.slice(0, 3).map((p) => Number.parseInt(p, 10));
  if (nums.some((n) => Number.isNaN(n))) return null;
  return [nums[0]!, nums[1]!, nums[2]!];
}

function gte(a: [number, number, number], b: [number, number, number]): boolean {
  for (let i = 0; i < 3; i++) {
    if (a[i]! > b[i]!) return true;
    if (a[i]! < b[i]!) return false;
  }
  return true; // equal
}

// The version GATE (not a warning). Returns exitCode 0 when the running
// Claude Code is new enough for /goal; otherwise a structured refusal on
// stderr with exitCode 1. The /jelly-run skill runs this as `jelly-run
// preflight` and STOPS on a non-zero exit — it does not proceed on a
// guess.
export function assertGoalVersion(version: string): DispatchResult {
  const running = parseVersion(version);
  const floor = parseVersion(MIN_GOAL_CLAUDE_VERSION)!;
  if (running === null) {
    const payload = {
      error: 'goal-version-unrecognized',
      message: `could not parse Claude Code version '${version}'; jelly-run requires >= ${MIN_GOAL_CLAUDE_VERSION} for /goal`,
    };
    return { stderr: JSON.stringify(payload), exitCode: 1 };
  }
  if (!gte(running, floor)) {
    const payload = {
      error: 'goal-version-too-old',
      message: `Claude Code ${version} is older than the /goal floor ${MIN_GOAL_CLAUDE_VERSION}; jelly-run refuses to compose a /goal preamble for it`,
    };
    return { stderr: JSON.stringify(payload), exitCode: 1 };
  }
  const payload = {
    ok: true,
    version,
    floor: MIN_GOAL_CLAUDE_VERSION,
  };
  return { stdout: JSON.stringify(payload), exitCode: 0 };
}

// Compose the goal-text handed to /goal for a phase. The substrate
// POSTURE (dispatch model, review cadence) reaches /goal's lead agent
// via the project-scoped CLAUDE.md @-import that `jelly plan` manages —
// so the preamble carries only the task: the phase goal, its exit
// criteria, and the git state to orient against.
//
// LOAD-BEARING INVARIANT: the preamble must NOT instruct /goal to open
// a pull request. jelly owns the PR boundary (the /jelly-pr skill
// composes + opens the PR under operator review). The prohibition is
// phrased with "create or submit" so the affirmative phrase a test
// guards against ("open a pull request") never appears even in the
// negative instruction.
export function composePreamble(phase: PhaseContext, gitState: GitState): string {
  const exitLines =
    phase.exitCriteria.length === 0
      ? ['  (no exit criteria recorded in PLAN.md for this phase)']
      : phase.exitCriteria.map((c) => `  - ${c}`);

  const changeSummary =
    gitState.changedFiles.length === 0
      ? 'The working tree is clean (no changes on this branch yet).'
      : `${gitState.changedFiles.length} file(s) changed on this branch so far:\n${gitState.diffStat}`;

  return [
    `Execute ${phase.name}.`,
    '',
    `Goal: ${phase.goal}`,
    '',
    'Exit criteria:',
    ...exitLines,
    '',
    `You are on branch \`${gitState.branch}\` (base \`${gitState.baseBranch}\`).`,
    changeSummary,
    '',
    'Do not create or submit a pull request. The jelly substrate handles',
    'PR composition separately: after you finish the work and yield',
    'control, jelly drafts the PR body and the operator reviews it. Your',
    'job ends at a clean, complete working tree that satisfies the exit',
    'criteria above.',
  ].join('\n');
}
