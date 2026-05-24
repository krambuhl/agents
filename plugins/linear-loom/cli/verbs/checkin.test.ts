import { test, expect, vi } from 'vitest';
import { checkinWrite } from './checkin.ts';
import { LinearClient } from '../lib/linear-client.ts';
import type { LinearMarker } from '../lib/marker.ts';
import type { Checkin } from '../lib/render-checkin.ts';

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

function baseCheckin(): Checkin {
  return {
    schema_version: 1,
    number: '01',
    created: '2026-05-23T20:00:00.000Z',
    phase: { number: 6, name: 'Manual write-back verbs' },
    branch: 'ev-agent.linear-loom.checkin-write',
    unit: 'U2 — checkin write',
    contract: {
      goal: 'Ship the checkin-write verb.',
      acceptance_criteria: ['Renders to markdown.', 'Posts as comment.'],
      rules_applied: ['DESIGN.md § 7.'],
      disqualifiers: [],
      inputs: [],
    },
    execution: {
      actions: ['Wrote the verb.'],
      files_touched: ['cli/verbs/checkin.ts'],
      corrections: [],
    },
    scope: [],
    changes_since_previous: 'Second unit of Phase 6.',
    verdict: { result: 'approved', reasons: [] },
    notes_for_pr: [],
  };
}

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
  return { fetchFn, client: new LinearClient({
    apiKey: 'lin_api_test',
    fetchFn,
    sleepFn: () => Promise.resolve(),
  }) };
}

test('checkinWrite: errors with missing-slug when no positional', async () => {
  const result = await checkinWrite([], {
    resolveAuthFn: stubAuth(),
    markerIO: markerIOReturning(SAMPLE_MARKER),
  });
  expect(result.exitCode).toBe(1);
  expect(JSON.parse(result.stderr ?? '').error).toBe('missing-slug');
});

test('checkinWrite: errors with missing-task-id when --task missing', async () => {
  const result = await checkinWrite(
    ['my-thing', '--checkin-file=/tmp/c.json'],
    {
      resolveAuthFn: stubAuth(),
      markerIO: markerIOReturning(SAMPLE_MARKER),
    },
  );
  expect(result.exitCode).toBe(1);
  expect(JSON.parse(result.stderr ?? '').error).toBe('missing-task-id');
});

test('checkinWrite: errors with missing-checkin-file when --checkin-file missing', async () => {
  const result = await checkinWrite(
    ['my-thing', '--task=design-1.skeleton-1.decisions-1'],
    {
      resolveAuthFn: stubAuth(),
      markerIO: markerIOReturning(SAMPLE_MARKER),
    },
  );
  expect(result.exitCode).toBe(1);
  expect(JSON.parse(result.stderr ?? '').error).toBe('missing-checkin-file');
});

test('checkinWrite: errors with checkin-file-unreadable when reader throws', async () => {
  const result = await checkinWrite(
    [
      'my-thing',
      '--task=design-1.skeleton-1.decisions-1',
      '--checkin-file=/no/such/path',
    ],
    {
      resolveAuthFn: stubAuth(),
      markerIO: markerIOReturning(SAMPLE_MARKER),
      readFileFn: () => {
        throw new Error('ENOENT');
      },
    },
  );
  expect(result.exitCode).toBe(1);
  expect(JSON.parse(result.stderr ?? '').error).toBe('checkin-file-unreadable');
});

test('checkinWrite: bubbles up checkin-invalid-json on bad JSON', async () => {
  const result = await checkinWrite(
    [
      'my-thing',
      '--task=design-1.skeleton-1.decisions-1',
      '--checkin-file=/tmp/c.json',
    ],
    {
      resolveAuthFn: stubAuth(),
      markerIO: markerIOReturning(SAMPLE_MARKER),
      readFileFn: () => '{not json',
    },
  );
  expect(result.exitCode).toBe(1);
  expect(JSON.parse(result.stderr ?? '').error).toBe('checkin-invalid-json');
});

test('checkinWrite: bubbles up checkin-schema-invalid on missing required field', async () => {
  const c = baseCheckin() as Partial<Checkin>;
  delete c.verdict;
  const result = await checkinWrite(
    [
      'my-thing',
      '--task=design-1.skeleton-1.decisions-1',
      '--checkin-file=/tmp/c.json',
    ],
    {
      resolveAuthFn: stubAuth(),
      markerIO: markerIOReturning(SAMPLE_MARKER),
      readFileFn: () => JSON.stringify(c),
    },
  );
  expect(result.exitCode).toBe(1);
  expect(JSON.parse(result.stderr ?? '').error).toBe('checkin-schema-invalid');
});

test('checkinWrite: errors with task-not-found when composed_key absent from Linear state', async () => {
  const { client } = clientWithResponses([stateResponse()]);
  const result = await checkinWrite(
    ['my-thing', '--task=no-such-key', '--checkin-file=/tmp/c.json'],
    {
      client,
      resolveAuthFn: stubAuth(),
      projectsRoot: '/tmp/projects',
      markerIO: markerIOReturning(SAMPLE_MARKER),
      readFileFn: () => JSON.stringify(baseCheckin()),
    },
  );
  expect(result.exitCode).toBe(1);
  expect(JSON.parse(result.stderr ?? '').error).toBe('task-not-found');
});

test('checkinWrite: errors with task-target-is-milestone when composed_key resolves to a Phase', async () => {
  const { client } = clientWithResponses([stateResponse()]);
  const result = await checkinWrite(
    ['my-thing', '--task=design-1', '--checkin-file=/tmp/c.json'],
    {
      client,
      resolveAuthFn: stubAuth(),
      projectsRoot: '/tmp/projects',
      markerIO: markerIOReturning(SAMPLE_MARKER),
      readFileFn: () => JSON.stringify(baseCheckin()),
    },
  );
  expect(result.exitCode).toBe(1);
  expect(JSON.parse(result.stderr ?? '').error).toBe(
    'task-target-is-milestone',
  );
});

test('checkinWrite: posts rendered checkin markdown as comment and emits success JSON', async () => {
  const { fetchFn, client } = clientWithResponses([
    stateResponse(),
    {
      data: {
        commentCreate: {
          success: true,
          comment: {
            id: 'comment-9',
            url: 'https://linear.app/x/issue/X-1#comment-9',
          },
        },
      },
    },
  ]);
  const result = await checkinWrite(
    [
      'my-thing',
      '--task=design-1.skeleton-1.decisions-1',
      '--checkin-file=/tmp/c.json',
    ],
    {
      client,
      resolveAuthFn: stubAuth(),
      projectsRoot: '/tmp/projects',
      markerIO: markerIOReturning(SAMPLE_MARKER),
      readFileFn: () => JSON.stringify(baseCheckin()),
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
    checkin: {
      number: '01',
      branch: 'ev-agent.linear-loom.checkin-write',
    },
    comment: {
      id: 'comment-9',
      url: 'https://linear.app/x/issue/X-1#comment-9',
    },
  });

  // Confirm the commentCreate mutation carries the rendered markdown
  // as its body (the second fetch call).
  const callBodies = fetchFn.mock.calls.map(
    (c) =>
      JSON.parse(c[1].body) as {
        variables: { input: { body?: string; issueId?: string } };
      },
  );
  const commentCall = callBodies[1]!;
  expect(commentCall.variables.input.issueId).toBe('i-task');
  expect(commentCall.variables.input.body).toContain('# U2 — checkin write');
  expect(commentCall.variables.input.body).toContain(
    '**Phase**: 6 — Manual write-back verbs',
  );
  expect(commentCall.variables.input.body).toContain(
    '1. Renders to markdown.',
  );
});

test('checkinWrite: bubbles up comment-create-failed when mutation reports success=false', async () => {
  const { client } = clientWithResponses([
    stateResponse(),
    {
      data: {
        commentCreate: { success: false, comment: null },
      },
    },
  ]);
  const result = await checkinWrite(
    [
      'my-thing',
      '--task=design-1.skeleton-1.decisions-1',
      '--checkin-file=/tmp/c.json',
    ],
    {
      client,
      resolveAuthFn: stubAuth(),
      projectsRoot: '/tmp/projects',
      markerIO: markerIOReturning(SAMPLE_MARKER),
      readFileFn: () => JSON.stringify(baseCheckin()),
    },
  );
  expect(result.exitCode).toBe(1);
  expect(JSON.parse(result.stderr ?? '').error).toBe('comment-create-failed');
});

test('checkinWrite: --pretty pretty-prints the JSON output', async () => {
  const { client } = clientWithResponses([
    stateResponse(),
    {
      data: {
        commentCreate: {
          success: true,
          comment: { id: 'c-p', url: 'u' },
        },
      },
    },
  ]);
  const result = await checkinWrite(
    [
      'my-thing',
      '--task=design-1.skeleton-1.decisions-1',
      '--checkin-file=/tmp/c.json',
      '--pretty',
    ],
    {
      client,
      resolveAuthFn: stubAuth(),
      projectsRoot: '/tmp/projects',
      markerIO: markerIOReturning(SAMPLE_MARKER),
      readFileFn: () => JSON.stringify(baseCheckin()),
    },
  );
  expect(result.exitCode).toBe(0);
  expect(result.stdout).toContain('\n  ');
});
