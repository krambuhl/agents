import { test, expect, vi } from 'vitest';
import { revisePlan } from './revise-plan.ts';
import type { LinearMarker } from '../lib/marker.ts';
import type { GitRunner } from '../lib/git.ts';

const SAMPLE_MARKER: LinearMarker = {
  schema_version: 1,
  slug: 'my-thing',
  linear_project_id: 'lin-proj-1',
  linear_project_name: 'My Sandbox',
  label: 'loom-project:my-thing',
  created: '2026-05-22T19:00:00.000Z',
};

const markerIOReturning = (marker: LinearMarker | null) => ({
  readFile: () => {
    if (marker === null) throw new Error('ENOENT');
    return JSON.stringify(marker);
  },
  writeFile: () => {},
  exists: () => marker !== null,
  mkdir: () => {},
});

const FAKE_GIT: GitRunner = {
  currentBranch: () => 'main',
  githubRemote: () => ({ org: 'krambuhl', repo: 'agents' }),
  isCommitted: () => false,
  addAndCommit: () => {},
};

const FIXED_NOW = () => new Date('2026-05-24T10:00:00.000Z');

test('revisePlan: errors with missing-slug when no positional', async () => {
  const result = await revisePlan([], {
    markerIO: markerIOReturning(SAMPLE_MARKER),
  });
  expect(result.exitCode).toBe(1);
  expect(JSON.parse(result.stderr ?? '').error).toBe('missing-slug');
});

test('revisePlan: errors with missing-args when --revision-file absent', async () => {
  const result = await revisePlan(
    ['my-thing', '--rationale=Tighten scope.'],
    {
      markerIO: markerIOReturning(SAMPLE_MARKER),
    },
  );
  expect(result.exitCode).toBe(1);
  const err = JSON.parse(result.stderr ?? '');
  expect(err.error).toBe('missing-args');
  expect(err.message).toContain('--revision-file');
});

test('revisePlan: errors with missing-args when --rationale absent or empty', async () => {
  const empty = await revisePlan(
    ['my-thing', '--revision-file=/tmp/r.md', '--rationale='],
    {
      markerIO: markerIOReturning(SAMPLE_MARKER),
    },
  );
  expect(empty.exitCode).toBe(1);
  expect(JSON.parse(empty.stderr ?? '').error).toBe('missing-args');

  const absent = await revisePlan(
    ['my-thing', '--revision-file=/tmp/r.md'],
    {
      markerIO: markerIOReturning(SAMPLE_MARKER),
    },
  );
  expect(absent.exitCode).toBe(1);
  expect(JSON.parse(absent.stderr ?? '').error).toBe('missing-args');
});

test('revisePlan: bubbles up readMarker error when no projects/<slug>/linear.json', async () => {
  const result = await revisePlan(
    ['no-such-project', '--revision-file=/tmp/r.md', '--rationale=Test.'],
    {
      markerIO: markerIOReturning(null),
      projectsRoot: '/tmp/projects',
    },
  );
  expect(result.exitCode).toBe(1);
  // readMarker surfaces ENOENT from the stubbed IO as
  // marker-unreadable (the substrate's chosen failure shape).
  expect(JSON.parse(result.stderr ?? '').error).toBe('marker-unreadable');
});

test('revisePlan: errors with plan-not-found when PLAN.md is absent under the project dir', async () => {
  const result = await revisePlan(
    ['my-thing', '--revision-file=/tmp/r.md', '--rationale=Test.'],
    {
      markerIO: markerIOReturning(SAMPLE_MARKER),
      projectsRoot: '/tmp/projects',
      existsFn: () => false,
    },
  );
  expect(result.exitCode).toBe(1);
  expect(JSON.parse(result.stderr ?? '').error).toBe('plan-not-found');
});

test('revisePlan: errors with revision-read-failed when reader throws', async () => {
  const result = await revisePlan(
    ['my-thing', '--revision-file=/no/such/path', '--rationale=Test.'],
    {
      markerIO: markerIOReturning(SAMPLE_MARKER),
      projectsRoot: '/tmp/projects',
      existsFn: () => true,
      readFileFn: () => {
        throw new Error('ENOENT');
      },
    },
  );
  expect(result.exitCode).toBe(1);
  expect(JSON.parse(result.stderr ?? '').error).toBe('revision-read-failed');
});

test('revisePlan: success path — writes new PLAN.md with Revision log entry and commits', async () => {
  const writeFileSpy = vi.fn();
  const addAndCommitSpy = vi.fn();
  const result = await revisePlan(
    [
      'my-thing',
      '--revision-file=/tmp/r.md',
      '--rationale=Tighten Phase 5 scope.',
    ],
    {
      markerIO: markerIOReturning(SAMPLE_MARKER),
      projectsRoot: '/tmp/projects',
      existsFn: () => true,
      readFileFn: () => '# PLAN\n\nNew content.\n',
      writeFileFn: writeFileSpy,
      gitRunner: { ...FAKE_GIT, addAndCommit: addAndCommitSpy },
      repoRoot: '/repo',
      now: FIXED_NOW,
    },
  );
  expect(result.exitCode).toBe(0);
  const parsed = JSON.parse(result.stdout ?? '');
  expect(parsed).toEqual({
    slug: 'my-thing',
    path: '/tmp/projects/my-thing',
    committed: true,
    rationale: 'Tighten Phase 5 scope.',
  });
  expect(writeFileSpy).toHaveBeenCalledTimes(1);
  const [writtenPath, writtenContents] = writeFileSpy.mock.calls[0]!;
  expect(writtenPath).toBe('/tmp/projects/my-thing/PLAN.md');
  expect(writtenContents).toContain('## Revision log');
  expect(writtenContents).toContain('- 2026-05-24 — Tighten Phase 5 scope.');
  expect(addAndCommitSpy).toHaveBeenCalledTimes(1);
  const [repoRootArg, pathsArg, msgArg] = addAndCommitSpy.mock.calls[0]!;
  expect(repoRootArg).toBe('/repo');
  expect(pathsArg).toEqual(['/tmp/projects/my-thing/PLAN.md']);
  expect(msgArg).toBe(
    '[linear-loom revise-plan] my-thing: Tighten Phase 5 scope.',
  );
});

test('revisePlan: --no-commit writes PLAN.md but skips git', async () => {
  const writeFileSpy = vi.fn();
  const addAndCommitSpy = vi.fn();
  const result = await revisePlan(
    [
      'my-thing',
      '--revision-file=/tmp/r.md',
      '--rationale=Dry edit.',
      '--no-commit',
    ],
    {
      markerIO: markerIOReturning(SAMPLE_MARKER),
      projectsRoot: '/tmp/projects',
      existsFn: () => true,
      readFileFn: () => '# PLAN\n\nNew content.\n',
      writeFileFn: writeFileSpy,
      gitRunner: { ...FAKE_GIT, addAndCommit: addAndCommitSpy },
      repoRoot: '/repo',
      now: FIXED_NOW,
    },
  );
  expect(result.exitCode).toBe(0);
  const parsed = JSON.parse(result.stdout ?? '');
  expect(parsed.committed).toBe(false);
  expect(writeFileSpy).toHaveBeenCalledTimes(1);
  expect(addAndCommitSpy).not.toHaveBeenCalled();
});

test('revisePlan: --pretty pretty-prints the JSON output', async () => {
  const result = await revisePlan(
    [
      'my-thing',
      '--revision-file=/tmp/r.md',
      '--rationale=Pretty.',
      '--pretty',
    ],
    {
      markerIO: markerIOReturning(SAMPLE_MARKER),
      projectsRoot: '/tmp/projects',
      existsFn: () => true,
      readFileFn: () => '# PLAN\n',
      writeFileFn: () => {},
      gitRunner: FAKE_GIT,
      repoRoot: '/repo',
      now: FIXED_NOW,
    },
  );
  expect(result.exitCode).toBe(0);
  expect(result.stdout).toContain('\n  ');
});
