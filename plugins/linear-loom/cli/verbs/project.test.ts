import { test, expect, vi } from 'vitest';
import { projectCreate } from './project.ts';
import { LinearClient } from '../lib/linear-client.ts';

const FAKE_NOW = '2026-05-22T19:00:00.000Z';

function stubAuth() {
  return () => ({ apiKey: 'lin_api_test', source: 'env' as const });
}

interface FakeResponseShape {
  data?: unknown;
  errors?: Array<{ message: string }>;
}

function clientWithResponses(responses: FakeResponseShape[]) {
  const fetchFn = vi.fn();
  for (const r of responses) {
    fetchFn.mockResolvedValueOnce({
      ok: true,
      status: 200,
      text: () => Promise.resolve(''),
      json: () => Promise.resolve(r),
    });
  }
  return new LinearClient({
    apiKey: 'lin_api_test',
    fetchFn,
    sleepFn: () => Promise.resolve(),
  });
}

function noopMarkerIO() {
  const writes: Array<[string, string]> = [];
  return {
    io: {
      readFile: (_path: string) => {
        throw new Error('ENOENT');
      },
      writeFile: (path: string, content: string) => writes.push([path, content]),
      exists: () => false,
      mkdir: () => {},
    },
    writes,
  };
}

test('projectCreate: errors on missing slug', async () => {
  const result = await projectCreate([], {
    client: clientWithResponses([]),
    resolveAuthFn: stubAuth(),
  });
  expect(result.exitCode).toBe(1);
  const parsed = JSON.parse(result.stderr ?? '');
  expect(parsed.error).toBe('missing-slug');
  expect(parsed.verb).toBe('create');
});

test('projectCreate: errors on missing --linear-project flag', async () => {
  const result = await projectCreate(['my-thing'], {
    client: clientWithResponses([]),
    resolveAuthFn: stubAuth(),
  });
  expect(result.exitCode).toBe(1);
  const parsed = JSON.parse(result.stderr ?? '');
  expect(parsed.error).toBe('missing-linear-project');
});

test('projectCreate: errors when marker already exists', async () => {
  const { io } = noopMarkerIO();
  const result = await projectCreate(
    ['my-thing', '--linear-project=p-1'],
    {
      client: clientWithResponses([]),
      resolveAuthFn: stubAuth(),
      projectsRoot: '/tmp/projects',
      markerIO: { ...io, exists: () => true },
    },
  );
  expect(result.exitCode).toBe(1);
  const parsed = JSON.parse(result.stderr ?? '');
  expect(parsed.error).toBe('project-already-exists');
});

test('projectCreate: errors when Linear Project not found', async () => {
  const { io } = noopMarkerIO();
  const result = await projectCreate(
    ['my-thing', '--linear-project=ghost-id'],
    {
      client: clientWithResponses([{ data: { project: null } }]),
      resolveAuthFn: stubAuth(),
      projectsRoot: '/tmp/projects',
      markerIO: io,
    },
  );
  expect(result.exitCode).toBe(1);
  const parsed = JSON.parse(result.stderr ?? '');
  expect(parsed.error).toBe('linear-project-not-found');
});

test('projectCreate: creates label when none exists; writes marker', async () => {
  const { io, writes } = noopMarkerIO();
  const result = await projectCreate(
    ['my-thing', '--linear-project=p-1'],
    {
      client: clientWithResponses([
        { data: { project: { id: 'p-1', name: 'Sandbox' } } },
        { data: { issueLabels: { nodes: [] } } },
        {
          data: {
            issueLabelCreate: {
              success: true,
              issueLabel: { id: 'lbl-1', name: 'loom-project:my-thing' },
            },
          },
        },
      ]),
      resolveAuthFn: stubAuth(),
      projectsRoot: '/tmp/projects',
      markerIO: io,
      now: () => FAKE_NOW,
    },
  );
  expect(result.exitCode).toBe(0);
  const parsed = JSON.parse(result.stdout ?? '');
  expect(parsed.marker_path).toBe('/tmp/projects/my-thing/linear.json');
  expect(parsed.marker).toEqual({
    schema_version: 1,
    slug: 'my-thing',
    linear_project_id: 'p-1',
    linear_project_name: 'Sandbox',
    label: 'loom-project:my-thing',
    created: FAKE_NOW,
  });
  expect(parsed.label).toEqual({
    id: 'lbl-1',
    name: 'loom-project:my-thing',
    created: true,
  });
  expect(writes).toHaveLength(1);
  expect(writes[0]![0]).toBe('/tmp/projects/my-thing/linear.json');
});

test('projectCreate: reuses existing label without re-creating', async () => {
  const { io } = noopMarkerIO();
  const result = await projectCreate(
    ['my-thing', '--linear-project=p-1'],
    {
      client: clientWithResponses([
        { data: { project: { id: 'p-1', name: 'Sandbox' } } },
        {
          data: {
            issueLabels: {
              nodes: [{ id: 'existing-id', name: 'loom-project:my-thing' }],
            },
          },
        },
      ]),
      resolveAuthFn: stubAuth(),
      projectsRoot: '/tmp/projects',
      markerIO: io,
      now: () => FAKE_NOW,
    },
  );
  expect(result.exitCode).toBe(0);
  const parsed = JSON.parse(result.stdout ?? '');
  expect(parsed.label).toEqual({
    id: 'existing-id',
    name: 'loom-project:my-thing',
    created: false,
  });
});

test('projectCreate: errors when issueLabelCreate reports success=false', async () => {
  const { io } = noopMarkerIO();
  const result = await projectCreate(
    ['my-thing', '--linear-project=p-1'],
    {
      client: clientWithResponses([
        { data: { project: { id: 'p-1', name: 'Sandbox' } } },
        { data: { issueLabels: { nodes: [] } } },
        {
          data: {
            issueLabelCreate: { success: false, issueLabel: null },
          },
        },
      ]),
      resolveAuthFn: stubAuth(),
      projectsRoot: '/tmp/projects',
      markerIO: io,
    },
  );
  expect(result.exitCode).toBe(1);
  const parsed = JSON.parse(result.stderr ?? '');
  expect(parsed.error).toBe('label-create-failed');
});

test('projectCreate: --pretty pretty-prints success JSON', async () => {
  const { io } = noopMarkerIO();
  const result = await projectCreate(
    ['my-thing', '--linear-project=p-1', '--pretty'],
    {
      client: clientWithResponses([
        { data: { project: { id: 'p-1', name: 'Sandbox' } } },
        { data: { issueLabels: { nodes: [] } } },
        {
          data: {
            issueLabelCreate: {
              success: true,
              issueLabel: { id: 'lbl-1', name: 'loom-project:my-thing' },
            },
          },
        },
      ]),
      resolveAuthFn: stubAuth(),
      projectsRoot: '/tmp/projects',
      markerIO: io,
      now: () => FAKE_NOW,
    },
  );
  expect(result.exitCode).toBe(0);
  expect(result.stdout).toContain('\n  ');
});
