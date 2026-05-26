// Shared CLI types for jelly-loom. Lives in lib/ (not in jelly.ts) so
// the entrypoint AND the verb handlers can both import them without an
// import cycle (jelly.ts imports the verbs for its registry; the verbs
// import these types). loom keeps the equivalent types in its first
// verb file; jelly puts them in a neutral lib module instead.

import type { GitRunner } from './git.ts';

export type CliContext = {
  /** Root under which projects live; defaults to <cwd>/projects. */
  projectsRoot: string;
  /** Repo root — `jelly plan` (U4) needs it to manage the
   *  @projects/<slug>/CLAUDE.md import line in the repo-root CLAUDE.md,
   *  and the verbs commit relative to it. Defaults to cwd. */
  repoRoot?: string;
  /** ISO date (YYYY-MM-DD) override for deterministic tests. */
  today?: string;
  /** cwd override for deterministic tests. */
  cwdOverride?: string;
  /** Injected git runner for tests; production uses defaultGitRunner. */
  gitRunner?: GitRunner;
};

export type DispatchResult = {
  stdout?: string;
  stderr?: string;
  exitCode: number;
};
