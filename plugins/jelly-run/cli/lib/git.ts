import { spawnSync } from 'node:child_process';
import { JellyRunError } from './errors.ts';

// Thin abstraction over the small set of READ git operations jelly-run's
// verbs need to assemble a /goal preamble and score a PR body: the
// current branch, the files changed against a base branch, and a
// human-readable diff summary. jelly-loom's GitRunner is write-focused
// (isCommitted / addAndCommit); jelly-run's is read-focused, because
// the orchestration layer composes from git state rather than mutating
// it. (PR-open + comment state live on GitHub via `gh`, not here.)
//
// Tests inject a stub `GitRunner` via `CliContext.gitRunner`; production
// uses `defaultGitRunner`, which shells out to `git`. jelly-run declares
// its own (rather than importing jelly-loom's) to stay standalone.

export type GitRunner = {
  // The branch currently checked out at repoRoot.
  currentBranch(repoRoot: string): string;

  // Paths changed on the current branch relative to `base` (the merge-base
  // diff: what this branch adds on top of base). Empty when nothing differs.
  changedFiles(repoRoot: string, base: string): string[];

  // Human-readable `git diff --stat base...HEAD` summary, for the
  // preamble context + the PR-body "what changed" section.
  diffStat(repoRoot: string, base: string): string;
};

function runGit(repoRoot: string, args: string[]): string {
  const result = spawnSync('git', args, { cwd: repoRoot, encoding: 'utf8' });
  if (result.status !== 0) {
    throw new JellyRunError(
      'git-read-failed',
      `git ${args.join(' ')} failed: ${result.stderr ?? '(no stderr)'}`,
    );
  }
  return result.stdout ?? '';
}

export const defaultGitRunner: GitRunner = {
  currentBranch(repoRoot: string): string {
    return runGit(repoRoot, ['rev-parse', '--abbrev-ref', 'HEAD']).trim();
  },

  changedFiles(repoRoot: string, base: string): string[] {
    // `base...HEAD` (three-dot) diffs against the merge-base, so the list
    // is what this branch changed, not unrelated commits on base.
    const out = runGit(repoRoot, ['diff', '--name-only', `${base}...HEAD`]);
    return out
      .split('\n')
      .map((line) => line.trim())
      .filter((line) => line.length > 0);
  },

  diffStat(repoRoot: string, base: string): string {
    return runGit(repoRoot, ['diff', '--stat', `${base}...HEAD`]).trimEnd();
  },
};
