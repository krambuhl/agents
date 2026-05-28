import { test, expect } from 'vitest';
import {
  type CommitFiles,
  findStateOnlyCommits,
  isManifestStatePath,
  parseGitLogNameOnly,
  GIT_LOG_NAME_ONLY_FORMAT,
} from './commit-discipline.ts';

// Factory: a commit is just its sha + changed-file set for this lint.
function makeCommit(sha: string, files: string[]): CommitFiles {
  return { sha, files };
}

// ---------- isManifestStatePath ----------

test('isManifestStatePath: a project manifest.toml is state', () => {
  expect(isManifestStatePath('projects/2026-05-26-substrate-consolidation/manifest.toml')).toBe(true);
  expect(isManifestStatePath('a/nested/projects/x/manifest.toml')).toBe(true);
});

test('isManifestStatePath: code, docs, and response files are NOT state', () => {
  expect(isManifestStatePath('plugins/loom/cli/lib/foo.ts')).toBe(false);
  expect(isManifestStatePath('projects/x/PLAN.md')).toBe(false);
  expect(isManifestStatePath('projects/x/INTERVIEW.md')).toBe(false);
  // A response file is a separate address-feedback artifact, not state.
  expect(isManifestStatePath('projects/x/checkins/branch/responses/response-01.json')).toBe(false);
  // A bare manifest.toml outside a projects/<slug>/ dir is not loom state.
  expect(isManifestStatePath('manifest.toml')).toBe(false);
  // The slug is a single path segment — a deeper path does not match.
  expect(isManifestStatePath('projects/x/sub/manifest.toml')).toBe(false);
});

// ---------- findStateOnlyCommits ----------

test('findStateOnlyCommits: flags a commit touching only manifest.toml', () => {
  const commits = [makeCommit('aaa', ['projects/x/manifest.toml'])];
  expect(findStateOnlyCommits(commits)).toEqual(['aaa']);
});

test('findStateOnlyCommits: passes a commit that folds state into code', () => {
  const commits = [
    makeCommit('bbb', ['projects/x/manifest.toml', 'plugins/loom/cli/lib/foo.ts']),
  ];
  expect(findStateOnlyCommits(commits)).toEqual([]);
});

test('findStateOnlyCommits: passes an all-code commit', () => {
  const commits = [makeCommit('ccc', ['plugins/loom/cli/lib/foo.ts'])];
  expect(findStateOnlyCommits(commits)).toEqual([]);
});

test('findStateOnlyCommits: does NOT flag an empty (no-files) commit', () => {
  // "every file is state" is vacuously true on an empty set, but an empty
  // commit carries no state mutation to fold — not the antipattern.
  const commits = [makeCommit('ddd', [])];
  expect(findStateOnlyCommits(commits)).toEqual([]);
});

test('findStateOnlyCommits: flags only the state-only commits in a mix', () => {
  const commits = [
    makeCommit('a', ['projects/x/manifest.toml']), // state-only -> flagged
    makeCommit('b', ['projects/x/manifest.toml', 'src/app.ts']), // mixed
    makeCommit('c', ['src/app.ts']), // code-only
    makeCommit('d', ['projects/y/manifest.toml']), // state-only -> flagged
  ];
  expect(findStateOnlyCommits(commits)).toEqual(['a', 'd']);
});

test('findStateOnlyCommits: honors a custom state-path predicate', () => {
  const onlyJson = (p: string) => p.endsWith('.json');
  const commits = [
    makeCommit('a', ['a.json', 'b.json']), // all state under the custom rule
    makeCommit('b', ['a.json', 'a.ts']), // mixed under the custom rule
  ];
  expect(findStateOnlyCommits(commits, onlyJson)).toEqual(['a']);
});

// ---------- parseGitLogNameOnly ----------

test('parseGitLogNameOnly: parses a single commit with files', () => {
  const out = ['COMMIT:abc123', '', 'projects/x/manifest.toml', 'src/app.ts', ''].join('\n');
  expect(parseGitLogNameOnly(out)).toEqual([
    { sha: 'abc123', files: ['projects/x/manifest.toml', 'src/app.ts'] },
  ]);
});

test('parseGitLogNameOnly: parses multiple commits', () => {
  const out = [
    'COMMIT:aaa',
    '',
    'projects/x/manifest.toml',
    '',
    'COMMIT:bbb',
    '',
    'src/app.ts',
    'src/lib.ts',
    '',
  ].join('\n');
  expect(parseGitLogNameOnly(out)).toEqual([
    { sha: 'aaa', files: ['projects/x/manifest.toml'] },
    { sha: 'bbb', files: ['src/app.ts', 'src/lib.ts'] },
  ]);
});

test('parseGitLogNameOnly: a commit with no files (e.g. a merge) parses as empty', () => {
  const out = ['COMMIT:aaa', '', 'COMMIT:bbb', '', 'src/app.ts', ''].join('\n');
  expect(parseGitLogNameOnly(out)).toEqual([
    { sha: 'aaa', files: [] },
    { sha: 'bbb', files: ['src/app.ts'] },
  ]);
});

test('parse -> detect round-trip flags the state-only commit', () => {
  const out = [
    `${GIT_LOG_NAME_ONLY_FORMAT.replace('%H', 'aaa')}`,
    '',
    'projects/x/manifest.toml',
    '',
    `${GIT_LOG_NAME_ONLY_FORMAT.replace('%H', 'bbb')}`,
    '',
    'projects/x/manifest.toml',
    'src/app.ts',
    '',
  ].join('\n');
  expect(findStateOnlyCommits(parseGitLogNameOnly(out))).toEqual(['aaa']);
});
