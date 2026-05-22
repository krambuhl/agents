import { test, expect, vi } from 'vitest';
import { research } from './research.ts';
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
  currentBranch: () => 'ev-agent.linear-loom.documents-research',
  githubRemote: () => ({ org: 'krambuhl', repo: 'agents' }),
  isCommitted: () => false,
  addAndCommit: () => {},
};

function stubAuth() {
  return () => ({ apiKey: 'lin_api_test', source: 'env' as const });
}

function markerIOReturning(marker: LinearMarker | null) {
  return {
    readFile: () => {
      if (marker === null) throw new Error('ENOENT');
      return JSON.stringify(marker);
    },
    writeFile: () => {},
    exists: () => marker !== null,
    mkdir: () => {},
  };
}

function clientWithDocCreates(
  documents: Array<{ id: string; url: string; title: string }>,
) {
  const fetchFn = vi.fn();
  for (const doc of documents) {
    fetchFn.mockResolvedValueOnce({
      ok: true,
      status: 200,
      text: () => Promise.resolve(''),
      json: () =>
        Promise.resolve({
          data: {
            documentCreate: {
              success: true,
              document: doc,
            },
          },
        }),
    });
  }
  return new LinearClient({
    apiKey: 'lin_api_test',
    fetchFn,
    sleepFn: () => Promise.resolve(),
  });
}

test('research: missing slug', async () => {
  const result = await research([], { resolveAuthFn: stubAuth() });
  expect(result.exitCode).toBe(1);
  expect(JSON.parse(result.stderr ?? '').error).toBe('missing-slug');
});

test('research: missing --research-file', async () => {
  const result = await research(['my-thing'], {
    resolveAuthFn: stubAuth(),
  });
  expect(result.exitCode).toBe(1);
  expect(JSON.parse(result.stderr ?? '').error).toBe('missing-args');
  expect(JSON.parse(result.stderr ?? '').message).toContain('--research-file');
});

test('research: missing --notes-file', async () => {
  const result = await research(
    ['my-thing', '--research-file=/tmp/R.md'],
    { resolveAuthFn: stubAuth() },
  );
  expect(result.exitCode).toBe(1);
  expect(JSON.parse(result.stderr ?? '').message).toContain('--notes-file');
});

test('research: surfaces marker-unreadable when marker missing', async () => {
  const result = await research(
    [
      'my-thing',
      '--research-file=/tmp/R.md',
      '--notes-file=/tmp/N.md',
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

test('research: surfaces research-file-unreadable when --research-file missing on disk', async () => {
  const result = await research(
    [
      'my-thing',
      '--research-file=/tmp/missing-R.md',
      '--notes-file=/tmp/N.md',
    ],
    {
      client: clientWithDocCreates([]),
      resolveAuthFn: stubAuth(),
      projectsRoot: '/tmp/projects',
      markerIO: markerIOReturning(SAMPLE_MARKER),
      gitRunner: FAKE_GIT,
      readFileFn: (p) => {
        if (p === '/tmp/missing-R.md') throw new Error('ENOENT');
        return '';
      },
      repoRoot: '/repo',
    },
  );
  expect(result.exitCode).toBe(1);
  expect(JSON.parse(result.stderr ?? '').error).toBe(
    'research-file-unreadable',
  );
});

test('research: uploads both Documents and emits structured success', async () => {
  const result = await research(
    [
      'my-thing',
      '--research-file=/tmp/R.md',
      '--notes-file=/tmp/N.md',
    ],
    {
      client: clientWithDocCreates([
        { id: 'doc-r', url: 'https://l/r', title: 'my-thing · RESEARCH.md' },
        { id: 'doc-n', url: 'https://l/n', title: 'my-thing · RESEARCH-NOTES.md' },
      ]),
      resolveAuthFn: stubAuth(),
      projectsRoot: '/tmp/projects',
      markerIO: markerIOReturning(SAMPLE_MARKER),
      gitRunner: FAKE_GIT,
      readFileFn: (p) => (p.endsWith('R.md') ? '# Research body' : '# Notes body'),
      repoRoot: '/repo',
      now: () => '2026-05-22T20:00:00.000Z',
    },
  );
  expect(result.exitCode).toBe(0);
  const parsed = JSON.parse(result.stdout ?? '');
  expect(parsed.slug).toBe('my-thing');
  expect(parsed.linear_project_id).toBe('lin-proj-1');
  expect(parsed.branch).toBe('ev-agent.linear-loom.documents-research');
  expect(parsed.synced_at).toBe('2026-05-22T20:00:00.000Z');
  expect(parsed.documents.research).toEqual({
    id: 'doc-r',
    url: 'https://l/r',
    title: 'my-thing · RESEARCH.md',
  });
  expect(parsed.documents.notes).toEqual({
    id: 'doc-n',
    url: 'https://l/n',
    title: 'my-thing · RESEARCH-NOTES.md',
  });
});

test('research: includes the provenance header in uploaded Document bodies', async () => {
  const receivedBodies: string[] = [];
  const client = new LinearClient({
    apiKey: 'lin_api_test',
    fetchFn: vi.fn((_url, init) => {
      const parsed = JSON.parse(init.body);
      receivedBodies.push(parsed.variables.input.content);
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
                  id: `d-${receivedBodies.length}`,
                  url: 'https://l/x',
                  title: 'x',
                },
              },
            },
          }),
      });
    }),
    sleepFn: () => Promise.resolve(),
  });
  await research(
    [
      'my-thing',
      '--research-file=/tmp/R.md',
      '--notes-file=/tmp/N.md',
    ],
    {
      client,
      resolveAuthFn: stubAuth(),
      projectsRoot: '/tmp/projects',
      markerIO: markerIOReturning(SAMPLE_MARKER),
      gitRunner: FAKE_GIT,
      readFileFn: (p) =>
        p.endsWith('R.md') ? '# Research body' : '# Notes body',
      repoRoot: '/repo',
      now: () => '2026-05-22T20:00:00.000Z',
    },
  );
  expect(receivedBodies).toHaveLength(2);
  expect(receivedBodies[0]).toContain('**Project**: my-thing (loom-project: my-thing)');
  expect(receivedBodies[0]).toContain(
    '**Source**: github.com/krambuhl/agents/tree/ev-agent.linear-loom.documents-research/projects/my-thing/RESEARCH.md',
  );
  expect(receivedBodies[0]).toContain(
    '**Last synced**: 2026-05-22T20:00:00.000Z',
  );
  expect(receivedBodies[0]).toMatch(/---\n\n# Research body/);
  expect(receivedBodies[1]).toContain('projects/my-thing/RESEARCH-NOTES.md');
  expect(receivedBodies[1]).toContain('# Notes body');
});

test('research: surfaces document-create-failed when Linear reports failure mid-upload (partial success)', async () => {
  const fetchFn = vi.fn();
  fetchFn.mockResolvedValueOnce({
    ok: true,
    status: 200,
    text: () => Promise.resolve(''),
    json: () =>
      Promise.resolve({
        data: {
          documentCreate: {
            success: true,
            document: { id: 'd-1', url: 'https://l/r', title: 't' },
          },
        },
      }),
  });
  fetchFn.mockResolvedValueOnce({
    ok: true,
    status: 200,
    text: () => Promise.resolve(''),
    json: () =>
      Promise.resolve({
        data: { documentCreate: { success: false, document: null } },
      }),
  });
  const client = new LinearClient({
    apiKey: 'lin_api_test',
    fetchFn,
    sleepFn: () => Promise.resolve(),
  });
  const result = await research(
    [
      'my-thing',
      '--research-file=/tmp/R.md',
      '--notes-file=/tmp/N.md',
    ],
    {
      client,
      resolveAuthFn: stubAuth(),
      projectsRoot: '/tmp/projects',
      markerIO: markerIOReturning(SAMPLE_MARKER),
      gitRunner: FAKE_GIT,
      readFileFn: () => 'body',
      repoRoot: '/repo',
      now: () => '2026-05-22T20:00:00.000Z',
    },
  );
  expect(result.exitCode).toBe(1);
  const parsed = JSON.parse(result.stderr ?? '');
  expect(parsed.error).toBe('document-create-failed');
  expect(parsed.message).toContain('https://l/r');
});

test('research: --pretty pretty-prints', async () => {
  const result = await research(
    [
      'my-thing',
      '--research-file=/tmp/R.md',
      '--notes-file=/tmp/N.md',
      '--pretty',
    ],
    {
      client: clientWithDocCreates([
        { id: 'doc-r', url: 'https://l/r', title: 't' },
        { id: 'doc-n', url: 'https://l/n', title: 't' },
      ]),
      resolveAuthFn: stubAuth(),
      projectsRoot: '/tmp/projects',
      markerIO: markerIOReturning(SAMPLE_MARKER),
      gitRunner: FAKE_GIT,
      readFileFn: () => 'body',
      repoRoot: '/repo',
      now: () => '2026-05-22T20:00:00.000Z',
    },
  );
  expect(result.exitCode).toBe(0);
  expect(result.stdout).toContain('\n  ');
});
