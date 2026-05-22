import { test, expect, vi } from 'vitest';
import { plan } from './plan.ts';
import { LinearClient } from '../lib/linear-client.ts';
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

function makeFakeGit(opts: {
  isCommitted?: boolean;
  branch?: string;
} = {}): GitRunner & { commits: Array<{ paths: string[]; message: string }> } {
  const commits: Array<{ paths: string[]; message: string }> = [];
  return {
    commits,
    currentBranch: () => opts.branch ?? 'ev-agent.test.plan',
    githubRemote: () => ({ org: 'krambuhl', repo: 'agents' }),
    isCommitted: () => opts.isCommitted ?? false,
    addAndCommit: (_repo, paths, message) => {
      commits.push({ paths, message });
    },
  };
}

const stubAuth = () => () => ({
  apiKey: 'lin_api_test',
  source: 'env' as const,
});

const markerIOReturning = (marker: LinearMarker | null) => ({
  readFile: () => {
    if (marker === null) throw new Error('ENOENT');
    return JSON.stringify(marker);
  },
  writeFile: () => {},
  exists: () => marker !== null,
  mkdir: () => {},
});

function clientCreatingDoc(doc: { id: string; url: string; title: string }) {
  return new LinearClient({
    apiKey: 'lin_api_test',
    fetchFn: vi.fn(() =>
      Promise.resolve({
        ok: true,
        status: 200,
        text: () => Promise.resolve(''),
        json: () =>
          Promise.resolve({
            data: { documentCreate: { success: true, document: doc } },
          }),
      }),
    ),
    sleepFn: () => Promise.resolve(),
  });
}

test('plan: missing slug', async () => {
  const result = await plan([], { resolveAuthFn: stubAuth() });
  expect(result.exitCode).toBe(1);
  expect(JSON.parse(result.stderr ?? '').error).toBe('missing-slug');
});

test('plan: missing --plan-file', async () => {
  const result = await plan(['my-thing'], { resolveAuthFn: stubAuth() });
  expect(result.exitCode).toBe(1);
  expect(JSON.parse(result.stderr ?? '').message).toContain('--plan-file');
});

test('plan: missing --interview-file', async () => {
  const result = await plan(
    ['my-thing', '--plan-file=/tmp/p.md'],
    { resolveAuthFn: stubAuth() },
  );
  expect(result.exitCode).toBe(1);
  expect(JSON.parse(result.stderr ?? '').message).toContain('--interview-file');
});

test('plan: surfaces marker-unreadable', async () => {
  const result = await plan(
    [
      'my-thing',
      '--plan-file=/tmp/p.md',
      '--interview-file=/tmp/i.md',
    ],
    {
      resolveAuthFn: stubAuth(),
      projectsRoot: '/tmp/projects',
      markerIO: markerIOReturning(null),
      gitRunner: makeFakeGit(),
    },
  );
  expect(result.exitCode).toBe(1);
  expect(JSON.parse(result.stderr ?? '').error).toBe('marker-unreadable');
});

test('plan: refuses overwrite when PLAN.md already committed', async () => {
  const result = await plan(
    [
      'my-thing',
      '--plan-file=/tmp/p.md',
      '--interview-file=/tmp/i.md',
    ],
    {
      resolveAuthFn: stubAuth(),
      projectsRoot: '/tmp/projects',
      markerIO: markerIOReturning(SAMPLE_MARKER),
      gitRunner: makeFakeGit({ isCommitted: true }),
      readFileFn: () => 'body',
      repoRoot: '/repo',
    },
  );
  expect(result.exitCode).toBe(1);
  expect(JSON.parse(result.stderr ?? '').error).toBe('plan-already-committed');
});

test('plan: writes PLAN.md + commits + uploads INTERVIEW.md', async () => {
  const writes: Array<[string, string]> = [];
  const mkdirs: Array<[string, { recursive: true }]> = [];
  const fakeGit = makeFakeGit();
  const result = await plan(
    [
      'my-thing',
      '--plan-file=/tmp/p.md',
      '--interview-file=/tmp/i.md',
    ],
    {
      client: clientCreatingDoc({
        id: 'doc-i',
        url: 'https://l/i',
        title: 'my-thing · INTERVIEW.md',
      }),
      resolveAuthFn: stubAuth(),
      projectsRoot: '/tmp/projects',
      markerIO: markerIOReturning(SAMPLE_MARKER),
      gitRunner: fakeGit,
      readFileFn: (p) =>
        p === '/tmp/p.md' ? '# Plan body' : '# Interview body',
      writeFileFn: (path, content) => writes.push([path, content]),
      mkdirFn: (path, opts) => mkdirs.push([path, opts]),
      repoRoot: '/repo',
      now: () => '2026-05-22T20:00:00.000Z',
    },
  );
  expect(result.exitCode).toBe(0);
  const parsed = JSON.parse(result.stdout ?? '');
  expect(parsed.plan).toEqual({
    path: 'projects/my-thing/PLAN.md',
    committed: true,
  });
  expect(parsed.documents.interview).toEqual({
    id: 'doc-i',
    url: 'https://l/i',
    title: 'my-thing · INTERVIEW.md',
  });
  expect(writes).toHaveLength(1);
  expect(writes[0]![0]).toBe('/repo/projects/my-thing/PLAN.md');
  expect(writes[0]![1]).toBe('# Plan body');
  expect(mkdirs[0]![0]).toBe('/repo/projects/my-thing');
  expect(fakeGit.commits).toHaveLength(1);
  expect(fakeGit.commits[0]!.paths).toEqual(['projects/my-thing/PLAN.md']);
  expect(fakeGit.commits[0]!.message).toContain('[linear-loom plan]');
  expect(fakeGit.commits[0]!.message).toContain('my-thing');
});

test('plan: INTERVIEW.md upload carries provenance header', async () => {
  const captured: string[] = [];
  const client = new LinearClient({
    apiKey: 'lin_api_test',
    fetchFn: vi.fn((_url, init) => {
      const parsed = JSON.parse(init.body);
      captured.push(parsed.variables.input.content);
      return Promise.resolve({
        ok: true,
        status: 200,
        text: () => Promise.resolve(''),
        json: () =>
          Promise.resolve({
            data: {
              documentCreate: {
                success: true,
                document: {
                  id: 'd',
                  url: 'u',
                  title: parsed.variables.input.title,
                },
              },
            },
          }),
      });
    }),
    sleepFn: () => Promise.resolve(),
  });
  await plan(
    [
      'my-thing',
      '--plan-file=/tmp/p.md',
      '--interview-file=/tmp/i.md',
    ],
    {
      client,
      resolveAuthFn: stubAuth(),
      projectsRoot: '/tmp/projects',
      markerIO: markerIOReturning(SAMPLE_MARKER),
      gitRunner: makeFakeGit({ branch: 'feature-x' }),
      readFileFn: () => 'body',
      writeFileFn: () => {},
      mkdirFn: () => {},
      repoRoot: '/repo',
      now: () => '2026-05-22T20:00:00.000Z',
    },
  );
  expect(captured).toHaveLength(1);
  expect(captured[0]).toContain('projects/my-thing/INTERVIEW.md');
  expect(captured[0]).toContain('tree/feature-x/');
  expect(captured[0]).toMatch(/---\n\nbody/);
});

test('plan: surfaces document-create-failed when INTERVIEW upload fails post-commit', async () => {
  const client = new LinearClient({
    apiKey: 'lin_api_test',
    fetchFn: vi.fn(() =>
      Promise.resolve({
        ok: true,
        status: 200,
        text: () => Promise.resolve(''),
        json: () =>
          Promise.resolve({
            data: {
              documentCreate: { success: false, document: null },
            },
          }),
      }),
    ),
    sleepFn: () => Promise.resolve(),
  });
  const result = await plan(
    [
      'my-thing',
      '--plan-file=/tmp/p.md',
      '--interview-file=/tmp/i.md',
    ],
    {
      client,
      resolveAuthFn: stubAuth(),
      projectsRoot: '/tmp/projects',
      markerIO: markerIOReturning(SAMPLE_MARKER),
      gitRunner: makeFakeGit(),
      readFileFn: () => 'body',
      writeFileFn: () => {},
      mkdirFn: () => {},
      repoRoot: '/repo',
      now: () => '2026-05-22T20:00:00.000Z',
    },
  );
  expect(result.exitCode).toBe(1);
  const parsed = JSON.parse(result.stderr ?? '');
  expect(parsed.error).toBe('document-create-failed');
  expect(parsed.message).toContain('PLAN.md committed at');
});
