import { spawnSync } from 'node:child_process';
import { JellyError } from './errors.ts';

// Thin abstraction over the small set of `git` operations jelly-loom's
// verbs need: asking whether a file is committed (collision check for
// research/plan), and the add-and-commit pair (the commit phase of
// every verb that writes project files).
//
// Tests inject a stub `GitRunner` via `CliContext.gitRunner`; production
// uses `defaultGitRunner`, which shells out to `git`. Mirrors loom's
// git.ts (jelly-loom declares its own to stay standalone).

export type GitRunner = {
  // Returns true when `filePath` is tracked in HEAD (committed at least
  // once on the current branch). Untracked files return false.
  isCommitted(repoRoot: string, filePath: string): boolean;

  // Stages the named paths and commits with the given message. Throws
  // JellyError('git-commit-failed', ...) on non-zero exit from either
  // step. Run from `repoRoot` so relative paths resolve correctly.
  addAndCommit(repoRoot: string, paths: string[], message: string): void;
};

export const defaultGitRunner: GitRunner = {
  isCommitted(repoRoot: string, filePath: string): boolean {
    const result = spawnSync('git', ['ls-files', '--error-unmatch', filePath], {
      cwd: repoRoot,
      encoding: 'utf8',
    });
    return result.status === 0;
  },

  addAndCommit(repoRoot: string, paths: string[], message: string): void {
    const addResult = spawnSync('git', ['add', ...paths], {
      cwd: repoRoot,
      encoding: 'utf8',
    });
    if (addResult.status !== 0) {
      throw new JellyError(
        'git-commit-failed',
        `git add failed: ${addResult.stderr ?? '(no stderr)'}`,
      );
    }
    const commitResult = spawnSync('git', ['commit', '-m', message], {
      cwd: repoRoot,
      encoding: 'utf8',
    });
    if (commitResult.status !== 0) {
      throw new JellyError(
        'git-commit-failed',
        `git commit failed: ${commitResult.stderr ?? '(no stderr)'}`,
      );
    }
  },
};
