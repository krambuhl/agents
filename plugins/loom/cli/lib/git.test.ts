import { describe, expect, test, beforeEach, afterEach } from 'vitest';
import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync, realpathSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  resolveStoreRepoRoot,
  commitState,
  defaultGitRunner,
  type GitRunner,
} from './git.ts';
import { decisionVerb } from '../verbs/loom/decision.ts';
import type { CliContext } from '../verbs/loom/project.ts';

function git(cwd: string, ...args: string[]): string {
  return execFileSync('git', args, {
    cwd,
    encoding: 'utf8',
    env: {
      ...process.env,
      GIT_AUTHOR_NAME: 'test',
      GIT_AUTHOR_EMAIL: 'test@example.com',
      GIT_COMMITTER_NAME: 'test',
      GIT_COMMITTER_EMAIL: 'test@example.com',
      GIT_CONFIG_GLOBAL: '/dev/null',
      GIT_CONFIG_SYSTEM: '/dev/null',
    },
  });
}

function initRepo(dir: string): void {
  mkdirSync(dir, { recursive: true });
  git(dir, 'init', '-q', '-b', 'main');
  git(dir, 'config', 'user.email', 'test@example.com');
  git(dir, 'config', 'user.name', 'test');
}

let scratch: string;
beforeEach(() => {
  scratch = mkdtempSync(join(tmpdir(), 'loom-git-'));
});
afterEach(() => {
  rmSync(scratch, { recursive: true, force: true });
});

describe('resolveStoreRepoRoot', () => {
  test('returns the git toplevel for a dir inside a repo', () => {
    const repo = join(scratch, 'repo');
    initRepo(repo);
    const sub = join(repo, 'projects', 'nested');
    mkdirSync(sub, { recursive: true });
    expect(resolveStoreRepoRoot(sub)).toBe(realpathSync(repo));
  });

  test('returns null for a dir that is not in a git repo', () => {
    const plain = join(scratch, 'plain');
    mkdirSync(plain, { recursive: true });
    expect(resolveStoreRepoRoot(plain)).toBeNull();
  });
});

describe('commitState', () => {
  test('commits always; pushes only when push:true', () => {
    const calls: string[] = [];
    const runner: GitRunner = {
      isCommitted: () => false,
      addAndCommit: () => calls.push('commit'),
      syncToRemote: () => calls.push('push'),
    };
    commitState(runner, '/r', ['a'], 'm');
    expect(calls).toEqual(['commit']);
    commitState(runner, '/r', ['a'], 'm', { push: true });
    expect(calls).toEqual(['commit', 'commit', 'push']);
  });

  test('push:true is a safe no-op when the runner has no syncToRemote', () => {
    const calls: string[] = [];
    // Older stub runners (pre-store-sync) omit syncToRemote entirely.
    const runner: GitRunner = {
      isCommitted: () => false,
      addAndCommit: () => calls.push('commit'),
    };
    expect(() => commitState(runner, '/r', ['a'], 'm', { push: true })).not.toThrow();
    expect(calls).toEqual(['commit']);
  });
});

describe('defaultGitRunner.syncToRemote', () => {
  test('rebases and pushes a commit to the upstream', () => {
    const origin = join(scratch, 'origin.git');
    mkdirSync(origin, { recursive: true });
    git(origin, 'init', '-q', '--bare', '-b', 'main');

    const store = join(scratch, 'store');
    git(scratch, 'clone', '-q', origin, 'store');
    git(store, 'config', 'user.email', 'test@example.com');
    git(store, 'config', 'user.name', 'test');
    // seed an initial commit so the branch has an upstream
    writeFileSync(join(store, 'seed'), 'x');
    git(store, 'add', 'seed');
    git(store, 'commit', '-q', '-m', 'seed');
    git(store, 'push', '-q', '-u', 'origin', 'main');

    // a new local commit, then sync
    writeFileSync(join(store, 'new'), 'y');
    git(store, 'add', 'new');
    git(store, 'commit', '-q', '-m', 'new');
    defaultGitRunner.syncToRemote!(store);

    // origin now has the commit — a fresh clone sees `new`
    git(scratch, 'clone', '-q', origin, 'verify');
    const log = git(join(scratch, 'verify'), 'log', '--oneline');
    expect(log).toContain('new');
  });

  test('is a no-op (no throw) when the repo has no upstream', () => {
    const local = join(scratch, 'local');
    initRepo(local);
    writeFileSync(join(local, 'f'), 'z');
    git(local, 'add', 'f');
    git(local, 'commit', '-q', '-m', 'c');
    expect(() => defaultGitRunner.syncToRemote!(local)).not.toThrow();
  });
});

describe('state commits land in the STORE repo, not the cwd repo', () => {
  test('loom decision commits into the store repo while cwd is the code repo', () => {
    // Two distinct real repos: the code repo (cwd) and the store repo.
    const codeRepo = join(scratch, 'code');
    const storeRepo = join(scratch, 'store');
    initRepo(codeRepo);
    initRepo(storeRepo);
    // give both an initial commit so HEAD exists
    writeFileSync(join(codeRepo, 'README'), '# code');
    git(codeRepo, 'add', '.');
    git(codeRepo, 'commit', '-q', '-m', 'init');
    const projectsRoot = join(storeRepo, 'projects');
    const slug = '2026-07-01-store-test';
    mkdirSync(join(projectsRoot, slug), { recursive: true });
    writeFileSync(join(projectsRoot, slug, 'manifest.toml'), '', 'utf8');
    git(storeRepo, 'add', '.');
    git(storeRepo, 'commit', '-q', '-m', 'init store');

    const prevCwd = process.cwd();
    const prevEmail = process.env.GIT_AUTHOR_EMAIL;
    try {
      // Simulate the dispatch: cwd is the CODE repo, store is elsewhere.
      process.chdir(codeRepo);
      process.env.GIT_AUTHOR_EMAIL = 'test@example.com';
      process.env.GIT_COMMITTER_EMAIL = 'test@example.com';
      process.env.GIT_AUTHOR_NAME = 'test';
      process.env.GIT_COMMITTER_NAME = 'test';
      const ctx: CliContext = {
        projectsRoot,
        repoRoot: storeRepo, // loom.ts sets this from the store's git toplevel
        storeAutosync: false, // no remote in this test
        today: '2026-07-01',
      } as CliContext;
      const r = decisionVerb([slug, 'A Store Decision'], ctx);
      expect(r.exitCode).toBe(0);
    } finally {
      process.chdir(prevCwd);
      process.env.GIT_AUTHOR_EMAIL = prevEmail;
    }

    // The decision commit is in the STORE repo…
    const storeLog = git(storeRepo, 'log', '--oneline');
    expect(storeLog).toContain('decision 0001');
    // …and the CODE repo saw no new commit (still just its init).
    const codeLog = git(codeRepo, 'log', '--oneline').trim().split('\n');
    expect(codeLog).toHaveLength(1);
    expect(codeLog[0]).toContain('init');
  });
});
