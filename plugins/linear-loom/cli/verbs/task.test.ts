import { test, expect, vi } from 'vitest';
import { taskComment } from './task.ts';
import { LinearClient } from '../lib/linear-client.ts';
import type { LinearMarker } from '../lib/marker.ts';

const SAMPLE_MARKER: LinearMarker = {
  schema_version: 1,
  slug: 'my-thing',
  linear_project_id: 'lin-proj-1',
  linear_project_name: 'My Sandbox',
  label: 'loom-project:my-thing',
  created: '2026-05-22T19:00:00.000Z',
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

// fetchLinearState response shape: a Phase milestone + a Batch
// (issue, parent=null, projectMilestone=m-1) + a Task
// (issue, parent={id: 'i-batch'}). All carry composed-key headers
// in their description so fetchLinearState's parseComposedKey
// indexes them into by_composed_key.
function stateResponse() {
  return {
    data: {
      project: {
        id: 'lin-proj-1',
        projectMilestones: {
          nodes: [
            {
              id: 'm-1',
              name: 'my-thing · Phase 1 — Design',
              description:
                '**Composed key**: design-1\n**Source**: -\n**Last synced**: -\n\n---\n\nDesign',
            },
          ],
        },
      },
      issues: {
        nodes: [
          {
            id: 'i-batch',
            title: 'my-thing · Batch design-1.skeleton-1 — Skeleton',
            description:
              '**Composed key**: design-1.skeleton-1\n**Source**: -\n**Last synced**: -\n\n---\n\nSkeleton',
            parent: null,
            projectMilestone: { id: 'm-1' },
            state: { type: 'started' },
          },
          {
            id: 'i-task',
            title: 'Decisions',
            description:
              '**Composed key**: design-1.skeleton-1.decisions-1\n**Source**: -\n**Last synced**: -\n\n---\n\nDecisions',
            parent: { id: 'i-batch' },
            projectMilestone: null,
            state: { type: 'unstarted' },
          },
        ],
      },
    },
  };
}

function clientWithResponses(responses: unknown[]) {
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

test('taskComment: errors with missing-slug when no positional', async () => {
  const result = await taskComment([], {
    resolveAuthFn: stubAuth(),
    markerIO: markerIOReturning(SAMPLE_MARKER),
  });
  expect(result.exitCode).toBe(1);
  expect(JSON.parse(result.stderr ?? '').error).toBe('missing-slug');
});

test('taskComment: errors with missing-task-id when --task missing', async () => {
  const result = await taskComment(['my-thing', '--body=hi'], {
    resolveAuthFn: stubAuth(),
    markerIO: markerIOReturning(SAMPLE_MARKER),
  });
  expect(result.exitCode).toBe(1);
  expect(JSON.parse(result.stderr ?? '').error).toBe('missing-task-id');
});

test('taskComment: errors with missing-body when neither --body nor --body-file', async () => {
  const result = await taskComment(
    ['my-thing', '--task=design-1.skeleton-1.decisions-1'],
    {
      resolveAuthFn: stubAuth(),
      markerIO: markerIOReturning(SAMPLE_MARKER),
    },
  );
  expect(result.exitCode).toBe(1);
  expect(JSON.parse(result.stderr ?? '').error).toBe('missing-body');
});

test('taskComment: errors with conflicting-body when both --body and --body-file', async () => {
  const result = await taskComment(
    [
      'my-thing',
      '--task=design-1.skeleton-1.decisions-1',
      '--body=hi',
      '--body-file=/tmp/x',
    ],
    {
      resolveAuthFn: stubAuth(),
      markerIO: markerIOReturning(SAMPLE_MARKER),
    },
  );
  expect(result.exitCode).toBe(1);
  expect(JSON.parse(result.stderr ?? '').error).toBe('conflicting-body');
});

test('taskComment: errors with body-file-unreadable when --body-file IO fails', async () => {
  const result = await taskComment(
    [
      'my-thing',
      '--task=design-1.skeleton-1.decisions-1',
      '--body-file=/no/such/path',
    ],
    {
      resolveAuthFn: stubAuth(),
      projectsRoot: '/tmp/projects',
      markerIO: markerIOReturning(SAMPLE_MARKER),
      readFileFn: () => {
        throw new Error('ENOENT');
      },
    },
  );
  expect(result.exitCode).toBe(1);
  expect(JSON.parse(result.stderr ?? '').error).toBe('body-file-unreadable');
});

test('taskComment: errors with task-not-found when composed_key absent from Linear state', async () => {
  const result = await taskComment(
    ['my-thing', '--task=no-such-key', '--body=hi'],
    {
      client: clientWithResponses([stateResponse()]),
      resolveAuthFn: stubAuth(),
      projectsRoot: '/tmp/projects',
      markerIO: markerIOReturning(SAMPLE_MARKER),
    },
  );
  expect(result.exitCode).toBe(1);
  expect(JSON.parse(result.stderr ?? '').error).toBe('task-not-found');
});

test('taskComment: errors with task-target-is-milestone when composed_key resolves to a Phase', async () => {
  const result = await taskComment(
    ['my-thing', '--task=design-1', '--body=hi'],
    {
      client: clientWithResponses([stateResponse()]),
      resolveAuthFn: stubAuth(),
      projectsRoot: '/tmp/projects',
      markerIO: markerIOReturning(SAMPLE_MARKER),
    },
  );
  expect(result.exitCode).toBe(1);
  expect(JSON.parse(result.stderr ?? '').error).toBe(
    'task-target-is-milestone',
  );
});

test('taskComment: posts comment on a Task and emits {slug, task, comment} JSON', async () => {
  const result = await taskComment(
    [
      'my-thing',
      '--task=design-1.skeleton-1.decisions-1',
      '--body=Hello from linear-loom.',
    ],
    {
      client: clientWithResponses([
        stateResponse(),
        {
          data: {
            commentCreate: {
              success: true,
              comment: {
                id: 'comment-7',
                url: 'https://linear.app/x/issue/X-7#comment-7',
              },
            },
          },
        },
      ]),
      resolveAuthFn: stubAuth(),
      projectsRoot: '/tmp/projects',
      markerIO: markerIOReturning(SAMPLE_MARKER),
    },
  );
  expect(result.exitCode).toBe(0);
  const parsed = JSON.parse(result.stdout ?? '');
  expect(parsed).toEqual({
    slug: 'my-thing',
    task: {
      composed_key: 'design-1.skeleton-1.decisions-1',
      linear_id: 'i-task',
    },
    comment: {
      id: 'comment-7',
      url: 'https://linear.app/x/issue/X-7#comment-7',
    },
  });
});

test('taskComment: posts comment on a Batch (issue with parent=null) — Batches accept comments same as Tasks', async () => {
  const result = await taskComment(
    [
      'my-thing',
      '--task=design-1.skeleton-1',
      '--body=Batch-level note.',
    ],
    {
      client: clientWithResponses([
        stateResponse(),
        {
          data: {
            commentCreate: {
              success: true,
              comment: { id: 'c-batch', url: 'https://linear.app/c/batch' },
            },
          },
        },
      ]),
      resolveAuthFn: stubAuth(),
      projectsRoot: '/tmp/projects',
      markerIO: markerIOReturning(SAMPLE_MARKER),
    },
  );
  expect(result.exitCode).toBe(0);
  const parsed = JSON.parse(result.stdout ?? '');
  expect(parsed.task.linear_id).toBe('i-batch');
  expect(parsed.comment.id).toBe('c-batch');
});

test('taskComment: --body-file reads body from disk via injected reader', async () => {
  const result = await taskComment(
    [
      'my-thing',
      '--task=design-1.skeleton-1.decisions-1',
      '--body-file=/tmp/comment.md',
    ],
    {
      client: clientWithResponses([
        stateResponse(),
        {
          data: {
            commentCreate: {
              success: true,
              comment: { id: 'c-2', url: 'https://linear.app/c/2' },
            },
          },
        },
      ]),
      resolveAuthFn: stubAuth(),
      projectsRoot: '/tmp/projects',
      markerIO: markerIOReturning(SAMPLE_MARKER),
      readFileFn: (path) => {
        expect(path).toBe('/tmp/comment.md');
        return '# Status\n\nLooks good.';
      },
    },
  );
  expect(result.exitCode).toBe(0);
  const parsed = JSON.parse(result.stdout ?? '');
  expect(parsed.comment.id).toBe('c-2');
});

test('taskComment: bubbles up comment-create-failed when mutation reports success=false', async () => {
  const result = await taskComment(
    [
      'my-thing',
      '--task=design-1.skeleton-1.decisions-1',
      '--body=hi',
    ],
    {
      client: clientWithResponses([
        stateResponse(),
        {
          data: {
            commentCreate: { success: false, comment: null },
          },
        },
      ]),
      resolveAuthFn: stubAuth(),
      projectsRoot: '/tmp/projects',
      markerIO: markerIOReturning(SAMPLE_MARKER),
    },
  );
  expect(result.exitCode).toBe(1);
  expect(JSON.parse(result.stderr ?? '').error).toBe('comment-create-failed');
});

test('taskComment: --pretty pretty-prints the JSON output', async () => {
  const result = await taskComment(
    [
      'my-thing',
      '--task=design-1.skeleton-1.decisions-1',
      '--body=hi',
      '--pretty',
    ],
    {
      client: clientWithResponses([
        stateResponse(),
        {
          data: {
            commentCreate: {
              success: true,
              comment: { id: 'c-3', url: 'u' },
            },
          },
        },
      ]),
      resolveAuthFn: stubAuth(),
      projectsRoot: '/tmp/projects',
      markerIO: markerIOReturning(SAMPLE_MARKER),
    },
  );
  expect(result.exitCode).toBe(0);
  // Pretty output contains 2-space indentation.
  expect(result.stdout).toContain('\n  ');
});
