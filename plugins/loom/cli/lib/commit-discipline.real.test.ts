// Real-git regression tier for the commit-discipline lint.
//
// commit-discipline.test.ts asserts the pure functions against synthetic
// CommitFiles the test owns. THIS file proves the `git log --name-only`
// PARSE against real git output: a seeded 2-commit repo (one state-only
// commit, one that folds state into code) exercises the producer/parser
// pairing end-to-end, so a drift in the `--format` sentinel or git's
// blank-line layout fails here rather than silently mis-parsing in CI.
//
// It deliberately does NOT lint real project history — pre-(d) commits
// (e.g. phase-setup commits) legitimately touched only state, so a
// live-history gate would flag merged history and need a fragile range.
// The forward "no state-only commit" guarantee is structural (the loop
// commits code + state together), not enforced here.

import { test, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync, mkdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { spawnSync } from 'node:child_process';
import {
  findStateOnlyCommits,
  parseGitLogNameOnly,
  GIT_LOG_NAME_ONLY_FORMAT,
} from './commit-discipline.ts';

let repo: string;

function git(args: string[]): string {
  const result = spawnSync('git', args, { cwd: repo, encoding: 'utf8' });
  if (result.status !== 0) {
    throw new Error(`git ${args.join(' ')} failed: ${result.stderr}`);
  }
  return result.stdout;
}

function write(relPath: string, content: string): void {
  const abs = join(repo, relPath);
  mkdirSync(dirname(abs), { recursive: true });
  writeFileSync(abs, content, 'utf8');
}

beforeEach(() => {
  repo = mkdtempSync(join(tmpdir(), 'loom-commit-discipline-'));
  git(['init', '-q']);
  git(['config', 'user.email', 'test@example.com']);
  git(['config', 'user.name', 'Test']);
  git(['config', 'commit.gpgsign', 'false']);
});

afterEach(() => {
  rmSync(repo, { recursive: true, force: true });
});

test('parses real git log and flags the state-only commit, not the mixed one', () => {
  // Commit 1: touches ONLY a project manifest.toml — a state-only commit.
  write('projects/demo/manifest.toml', 'schema_version = 1\n');
  git(['add', 'projects/demo/manifest.toml']);
  git(['commit', '-q', '-m', 'state-only commit']);
  const stateOnlySha = git(['rev-parse', 'HEAD']).trim();

  // Commit 2: folds a manifest mutation into a code change — the (d) shape.
  write('projects/demo/manifest.toml', 'schema_version = 1\nlatest_checkin = "01"\n');
  write('src/app.ts', 'export const x = 1;\n');
  git(['add', '-A']);
  git(['commit', '-q', '-m', 'fold state into code']);
  const mixedSha = git(['rev-parse', 'HEAD']).trim();

  const log = git(['log', '--name-only', `--format=${GIT_LOG_NAME_ONLY_FORMAT}`]);
  const commits = parseGitLogNameOnly(log);
  const offenders = findStateOnlyCommits(commits);

  // The parse round-trips both real commits...
  expect(commits.map((c) => c.sha).sort()).toEqual([stateOnlySha, mixedSha].sort());
  // ...and only the state-only commit is flagged.
  expect(offenders).toEqual([stateOnlySha]);
  expect(offenders).not.toContain(mixedSha);
});
