import { test, expect, vi } from 'vitest';
import { retro } from './retro.ts';
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

const FAKE_GIT: GitRunner = {
  currentBranch: () => 'main',
  githubRemote: () => ({ org: 'krambuhl', repo: 'agents' }),
  isCommitted: () => false,
  addAndCommit: () => {},
};

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

const clientCreatingDoc = (doc: { id: string; url: string; title: string }) =>
  new LinearClient({
    apiKey: 'lin_api_test',
    fetchFn: vi.fn(() =>
      Promise.resolve({
        ok: true,
        status: 200,
        text: () => Promise.resolve(''),
        json: () =>
          Promise.resolve({
            data: {
              documentCreate: { success: true, document: doc },
            },
          }),
      }),
    ),
    sleepFn: () => Promise.resolve(),
  });

test('retro: missing slug', async () => {
  const result = await retro([], { resolveAuthFn: stubAuth() });
  expect(result.exitCode).toBe(1);
  expect(JSON.parse(result.stderr ?? '').error).toBe('missing-slug');
});

test('retro: missing --type', async () => {
  const result = await retro(['my-thing'], { resolveAuthFn: stubAuth() });
  expect(result.exitCode).toBe(1);
  expect(JSON.parse(result.stderr ?? '').error).toBe('missing-args');
  expect(JSON.parse(result.stderr ?? '').message).toContain('--type');
});

test('retro: missing --retro-file', async () => {
  const result = await retro(['my-thing', '--type=phase-3'], {
    resolveAuthFn: stubAuth(),
  });
  expect(result.exitCode).toBe(1);
  expect(JSON.parse(result.stderr ?? '').message).toContain('--retro-file');
});

test('retro: rejects non-kebab-case --type', async () => {
  const result = await retro(
    ['my-thing', '--type=Phase_3', '--retro-file=/tmp/r.md'],
    { resolveAuthFn: stubAuth() },
  );
  expect(result.exitCode).toBe(1);
  expect(JSON.parse(result.stderr ?? '').error).toBe('invalid-retro-type');
});

test('retro: rejects --type with trailing dash', async () => {
  const result = await retro(
    ['my-thing', '--type=phase-3-', '--retro-file=/tmp/r.md'],
    { resolveAuthFn: stubAuth() },
  );
  expect(result.exitCode).toBe(1);
  expect(JSON.parse(result.stderr ?? '').error).toBe('invalid-retro-type');
});

test('retro: surfaces marker-unreadable when marker missing', async () => {
  const result = await retro(
    [
      'my-thing',
      '--type=phase-3',
      '--retro-file=/tmp/r.md',
    ],
    {
      resolveAuthFn: stubAuth(),
      projectsRoot: '/tmp/projects',
      markerIO: markerIOReturning(null),
      gitRunner: FAKE_GIT,
    },
  );
  expect(result.exitCode).toBe(1);
  expect(JSON.parse(result.stderr ?? '').error).toBe('marker-unreadable');
});

test('retro: surfaces retro-file-unreadable', async () => {
  const result = await retro(
    [
      'my-thing',
      '--type=phase-3',
      '--retro-file=/tmp/ghost.md',
    ],
    {
      resolveAuthFn: stubAuth(),
      projectsRoot: '/tmp/projects',
      markerIO: markerIOReturning(SAMPLE_MARKER),
      gitRunner: FAKE_GIT,
      readFileFn: () => {
        throw new Error('ENOENT');
      },
      repoRoot: '/repo',
    },
  );
  expect(result.exitCode).toBe(1);
  expect(JSON.parse(result.stderr ?? '').error).toBe('retro-file-unreadable');
});

test('retro: uploads Document with correct title + filename in provenance', async () => {
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
                  id: 'doc-1',
                  url: 'https://l/r',
                  title: parsed.variables.input.title,
                },
              },
            },
          }),
      });
    }),
    sleepFn: () => Promise.resolve(),
  });
  const result = await retro(
    [
      'my-thing',
      '--type=phase-3',
      '--retro-file=/tmp/r.md',
    ],
    {
      client,
      resolveAuthFn: stubAuth(),
      projectsRoot: '/tmp/projects',
      markerIO: markerIOReturning(SAMPLE_MARKER),
      gitRunner: FAKE_GIT,
      readFileFn: () => '# Retro body',
      repoRoot: '/repo',
      now: () => '2026-05-22T20:00:00.000Z',
    },
  );
  expect(result.exitCode).toBe(0);
  const parsed = JSON.parse(result.stdout ?? '');
  expect(parsed.retro_type).toBe('phase-3');
  expect(parsed.document.title).toBe('my-thing · RETRO-phase-3');
  expect(captured[0]).toContain('projects/my-thing/RETRO-phase-3.md');
  expect(captured[0]).toMatch(/---\n\n# Retro body/);
});

test('retro: --pretty pretty-prints', async () => {
  const result = await retro(
    [
      'my-thing',
      '--type=phase-3',
      '--retro-file=/tmp/r.md',
      '--pretty',
    ],
    {
      client: clientCreatingDoc({
        id: 'doc-1',
        url: 'https://l/r',
        title: 'my-thing · RETRO-phase-3',
      }),
      resolveAuthFn: stubAuth(),
      projectsRoot: '/tmp/projects',
      markerIO: markerIOReturning(SAMPLE_MARKER),
      gitRunner: FAKE_GIT,
      readFileFn: () => '# Retro body',
      repoRoot: '/repo',
      now: () => '2026-05-22T20:00:00.000Z',
    },
  );
  expect(result.exitCode).toBe(0);
  expect(result.stdout).toContain('\n  ');
});
