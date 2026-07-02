// sync-shared: plugin-local
import { spawnSync } from 'node:child_process';
import { LoomError } from './errors.ts';

// Thin abstraction over the small set of `git` operations loom's
// planning verbs need: asking whether a file is committed (collision
// check for `plan`), the add-and-commit pair (commit phase of `plan`
// and `revise-plan`), and — for the distributed project store — a
// rebase-and-push that keeps every writer converging on the store's
// default branch (decisions 0002 pull-before-act, 0013/0014 store sync).
//
// Tests inject a stub `GitRunner` via the verb's `CliContext.gitRunner`;
// production code uses `defaultGitRunner` which shells out to `git`.
export type GitRunner = {
  // Returns true when `filePath` is tracked in HEAD (i.e. committed
  // at least once on the current branch). Untracked files return
  // false. Used by `plan` to decide whether to refuse overwrite vs
  // allow recovery-from-failed-commit.
  isCommitted(repoRoot: string, filePath: string): boolean;

  // Stages the named paths and commits with the given message.
  // Throws `LoomError('git-commit-failed', ...)` on non-zero exit
  // from either step. Run from `repoRoot` so relative paths in
  // `paths` resolve correctly.
  addAndCommit(repoRoot: string, paths: string[], message: string): void;

  // Rebase the local branch onto its upstream and push, so a just-made
  // commit lands on the shared default branch. A no-op when the repo has
  // no upstream (a local-only store). Retries once on a non-fast-forward
  // race (another writer pushed between our pull and push). Optional so
  // existing test stubs (which predate store sync) type-check unchanged;
  // when absent, `commitState({push})` silently commits without syncing.
  syncToRemote?(repoRoot: string): void;
};

// The git repo that actually contains `dir` (its work-tree toplevel), or
// null when `dir` is not inside a git repo. This is how loom finds the
// STORE repo from `LOOM_PROJECTS_ROOT`: the repo to commit project state
// into is the one holding the store, not the process's cwd (which, under
// `--env=coder` dispatch, is the *code* repo — a different repo entirely).
export function resolveStoreRepoRoot(dir: string): string | null {
  const result = spawnSync(
    'git',
    ['-C', dir, 'rev-parse', '--show-toplevel'],
    { encoding: 'utf8' },
  );
  if (result.status !== 0) return null;
  const top = result.stdout.trim();
  return top === '' ? null : top;
}

// Commit `paths` into `repoRoot`, then — when `opts.push` — rebase-and-push
// so the commit reaches the shared default branch. The push is a single
// choke point: policy (is this the distributed store, is push enabled) is
// decided once by the caller (loom.ts) and passed down as a boolean, so the
// verbs stay ignorant of store topology.
export function commitState(
  runner: GitRunner,
  repoRoot: string,
  paths: string[],
  message: string,
  opts?: { push?: boolean },
): void {
  runner.addAndCommit(repoRoot, paths, message);
  if (opts?.push === true) runner.syncToRemote?.(repoRoot);
}

export const defaultGitRunner: GitRunner = {
  isCommitted(repoRoot: string, filePath: string): boolean {
    const result = spawnSync(
      'git',
      ['ls-files', '--error-unmatch', filePath],
      { cwd: repoRoot, encoding: 'utf8' },
    );
    return result.status === 0;
  },

  addAndCommit(repoRoot: string, paths: string[], message: string): void {
    const addResult = spawnSync('git', ['add', ...paths], {
      cwd: repoRoot,
      encoding: 'utf8',
    });
    if (addResult.status !== 0) {
      throw new LoomError(
        'git-commit-failed',
        `git add failed: ${addResult.stderr ?? '(no stderr)'}`,
      );
    }
    const commitResult = spawnSync('git', ['commit', '-m', message], {
      cwd: repoRoot,
      encoding: 'utf8',
    });
    if (commitResult.status !== 0) {
      throw new LoomError(
        'git-commit-failed',
        `git commit failed: ${commitResult.stderr ?? '(no stderr)'}`,
      );
    }
  },

  syncToRemote(repoRoot: string): void {
    // No upstream → a local-only store; nothing to converge on. Commit-only.
    const upstream = spawnSync(
      'git',
      ['rev-parse', '--abbrev-ref', '--symbolic-full-name', '@{u}'],
      { cwd: repoRoot, encoding: 'utf8' },
    );
    if (upstream.status !== 0) return;

    // Rebase onto the shared tip, then push. Two attempts: the store is
    // append-mostly (per-phase manifests, per-record decision files with
    // monotonic numbering — decision 0009), so a concurrent writer usually
    // touches different files and the rebase is clean; the retry covers the
    // narrow window where someone pushed between our pull and our push.
    for (let attempt = 0; attempt < 2; attempt++) {
      const pull = spawnSync('git', ['pull', '--rebase', '--autostash'], {
        cwd: repoRoot,
        encoding: 'utf8',
      });
      if (pull.status !== 0) {
        throw new LoomError(
          'git-sync-failed',
          `git pull --rebase failed in store repo ${repoRoot} ` +
            `(a rebase conflict needs manual resolution): ${pull.stderr ?? '(no stderr)'}`,
        );
      }
      const push = spawnSync('git', ['push'], {
        cwd: repoRoot,
        encoding: 'utf8',
      });
      if (push.status === 0) return;
      if (attempt === 1) {
        throw new LoomError(
          'git-sync-failed',
          `git push failed after rebase in store repo ${repoRoot}: ${push.stderr ?? '(no stderr)'}`,
        );
      }
    }
  },
};
