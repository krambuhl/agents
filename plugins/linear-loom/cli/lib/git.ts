import { spawnSync } from 'node:child_process';
import { LinearLoomError } from './errors.ts';

// Thin git wrapper for linear-loom's content-upload verbs (research,
// plan, retro). The Linear Document provenance header (DESIGN.md § 13)
// needs the current branch name and the GitHub <org>/<repo> derived
// from `remote.origin.url` so links land at
// github.com/<org>/<repo>/tree/<branch>/projects/<slug>/<file>.
//
// Tests inject a stub via the verb's CliContext.gitRunner;
// production code uses defaultGitRunner which shells out to git.

export interface GitHubRemote {
  org: string;
  repo: string;
}

export interface GitRunner {
  // Current branch name, e.g. "main" or
  // "ev-agent.linear-loom.documents-research". Throws
  // git-detection-failed on detached-HEAD or unreadable repo.
  currentBranch(repoRoot: string): string;

  // GitHub <org>/<repo> derived from remote.origin.url. Supports both
  // SSH (git@github.com:org/repo.git) and HTTPS
  // (https://github.com/org/repo.git) URL shapes. Throws
  // remote-not-github when the remote isn't a GitHub URL.
  githubRemote(repoRoot: string): GitHubRemote;

  // Returns true when `filePath` is tracked in HEAD (i.e. committed
  // at least once on the current branch). Used by `plan` to refuse
  // overwrite when PLAN.md is already committed.
  isCommitted(repoRoot: string, filePath: string): boolean;

  // Stages the named paths and commits with the given message.
  // Throws git-commit-failed on non-zero exit from either step.
  // Run from `repoRoot` so relative paths in `paths` resolve.
  addAndCommit(repoRoot: string, paths: string[], message: string): void;
}

export const defaultGitRunner: GitRunner = {
  currentBranch(repoRoot: string): string {
    const result = spawnSync(
      'git',
      ['rev-parse', '--abbrev-ref', 'HEAD'],
      { cwd: repoRoot, encoding: 'utf8' },
    );
    if (result.status !== 0 || typeof result.stdout !== 'string') {
      throw new LinearLoomError(
        'git-detection-failed',
        `git rev-parse --abbrev-ref HEAD failed: ${result.stderr ?? '(no stderr)'}`,
      );
    }
    const branch = result.stdout.trim();
    if (branch === '' || branch === 'HEAD') {
      throw new LinearLoomError(
        'git-detection-failed',
        `cannot resolve a branch name (detached HEAD or empty repo at ${repoRoot}).`,
      );
    }
    return branch;
  },

  githubRemote(repoRoot: string): GitHubRemote {
    const result = spawnSync(
      'git',
      ['config', '--get', 'remote.origin.url'],
      { cwd: repoRoot, encoding: 'utf8' },
    );
    if (result.status !== 0 || typeof result.stdout !== 'string') {
      throw new LinearLoomError(
        'remote-not-github',
        `git config --get remote.origin.url failed: ${result.stderr ?? '(no stderr)'}`,
      );
    }
    return parseGitHubRemote(result.stdout.trim());
  },

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
      throw new LinearLoomError(
        'git-commit-failed',
        `git add failed: ${addResult.stderr ?? '(no stderr)'}`,
      );
    }
    const commitResult = spawnSync('git', ['commit', '-m', message], {
      cwd: repoRoot,
      encoding: 'utf8',
    });
    if (commitResult.status !== 0) {
      throw new LinearLoomError(
        'git-commit-failed',
        `git commit failed: ${commitResult.stderr ?? '(no stderr)'}`,
      );
    }
  },
};

// Exported so tests + alternative callers can validate URL parsing
// without shelling out.
export function parseGitHubRemote(rawUrl: string): GitHubRemote {
  // SSH: git@github.com:<org>/<repo>(.git)?
  const sshMatch = /^git@github\.com:([^/]+)\/(.+?)(?:\.git)?$/.exec(rawUrl);
  if (sshMatch !== null && sshMatch[1] !== undefined && sshMatch[2] !== undefined) {
    return { org: sshMatch[1], repo: sshMatch[2] };
  }
  // HTTPS: https://github.com/<org>/<repo>(.git)?
  const httpsMatch = /^https:\/\/github\.com\/([^/]+)\/(.+?)(?:\.git)?$/.exec(rawUrl);
  if (httpsMatch !== null && httpsMatch[1] !== undefined && httpsMatch[2] !== undefined) {
    return { org: httpsMatch[1], repo: httpsMatch[2] };
  }
  throw new LinearLoomError(
    'remote-not-github',
    `remote.origin.url does not look like a GitHub URL (got ${rawUrl}). The provenance header needs a GitHub <org>/<repo> pair to link source files; pass --source-url-override on the verb to bypass.`,
  );
}
