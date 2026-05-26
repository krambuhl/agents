// Shared CLI types for jelly-run. Lives in lib/ (not in jelly-run.ts) so
// the entrypoint AND the verb handlers can both import them without an
// import cycle (jelly-run.ts imports the verbs for its registry; the
// verbs import these types). Mirrors jelly-loom/cli/lib/types.ts; the U1
// gate inlined CliContext/DispatchResult in the entry and U2 migrates
// them here now that real verbs need to import them.

import type { GitRunner } from './git.ts';

export type CliContext = {
  // Root under which jelly-loom-managed projects live; defaults to <cwd>/projects.
  projectsRoot: string;
  // Repo root the run targets — git state + PLAN.md live here, and the
  // skills shell out from here. Defaults to cwd.
  repoRoot?: string;
  // Injected git runner for tests; production uses defaultGitRunner.
  gitRunner?: GitRunner;
};

export type DispatchResult = {
  stdout?: string;
  stderr?: string;
  exitCode: number;
};

// ---------- Domain types ----------

// The slice of git reality the preamble + PR-field scoring read from.
// Gathered by the verbs (via GitRunner) and passed to the pure
// composition/scoring functions, which never touch git themselves.
export type GitState = {
  branch: string;
  baseBranch: string;
  // Paths changed on this branch relative to baseBranch.
  changedFiles: string[];
  // Human-readable `git diff --stat`-style summary (for the preamble +
  // the PR-body "what changed" context).
  diffStat: string;
};

// The phase the run targets, parsed from PLAN.md. Feeds the /goal
// preamble: the lead agent gets the goal + exit criteria to execute
// against, deliberately WITHOUT any instruction to open a PR.
export type PhaseContext = {
  // The full PLAN.md heading text, e.g. "Phase 2.1 — jelly-run substrate".
  // Carries the semantic phase label, so no separate number is needed.
  name: string;
  goal: string;
  exitCriteria: string[];
};

// One field of a draft PR body, with the confidence the substrate
// assigns to its auto-derived value and the receipt explaining how the
// value was derived. The receipt is rendered in the final preview for
// EVERY field (not just low-confidence ones) so a wrong high-confidence
// guess is visible rather than silently skipped.
export type ScoredField = {
  field: string;
  value: string;
  // 0..1; below GRILL_THRESHOLD (see lib/pr.ts) the field is grilled.
  confidence: number;
  // One-line "derived from: ..." explanation shown in the preview.
  derivation: string;
};

// The assembled draft PR body: the chosen archetype, every scored
// field, and the rendered markdown body.
export type PrBodyDraft = {
  archetype: string;
  fields: ScoredField[];
  body: string;
};
