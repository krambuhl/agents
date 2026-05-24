import { test, expect, vi } from 'vitest';
import { phaseUpdate } from './phase.ts';
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

function milestoneListResponse() {
  return {
    data: {
      project: {
        id: 'lin-proj-1',
        projectMilestones: {
          nodes: [
            {
              id: 'm-1',
              name: 'my-thing · Phase 1 — Design',
              state: 'planned',
            },
            {
              id: 'm-2',
              name: 'my-thing · Phase 2 — Build',
              state: 'started',
            },
          ],
        },
      },
    },
  };
}

function projectNotFoundResponse() {
  return { data: { project: null } };
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
  return {
    fetchFn,
    client: new LinearClient({
      apiKey: 'lin_api_test',
      fetchFn,
      sleepFn: () => Promise.resolve(),
    }),
  };
}

test('phaseUpdate: errors with missing-slug when no positional', async () => {
  const result = await phaseUpdate([], {
    resolveAuthFn: stubAuth(),
    markerIO: markerIOReturning(SAMPLE_MARKER),
  });
  expect(result.exitCode).toBe(1);
  expect(JSON.parse(result.stderr ?? '').error).toBe('missing-slug');
});

test('phaseUpdate: errors with missing-phase-number when --phase absent', async () => {
  const result = await phaseUpdate(
    ['my-thing', '--status=completed'],
    {
      resolveAuthFn: stubAuth(),
      markerIO: markerIOReturning(SAMPLE_MARKER),
    },
  );
  expect(result.exitCode).toBe(1);
  expect(JSON.parse(result.stderr ?? '').error).toBe('missing-phase-number');
});

test('phaseUpdate: errors with invalid-phase-number when --phase is not a positive integer', async () => {
  const result = await phaseUpdate(
    ['my-thing', '--phase=zero', '--status=completed'],
    {
      resolveAuthFn: stubAuth(),
      markerIO: markerIOReturning(SAMPLE_MARKER),
    },
  );
  expect(result.exitCode).toBe(1);
  expect(JSON.parse(result.stderr ?? '').error).toBe('invalid-phase-number');
});

test('phaseUpdate: errors with missing-status when --status absent', async () => {
  const result = await phaseUpdate(
    ['my-thing', '--phase=1'],
    {
      resolveAuthFn: stubAuth(),
      markerIO: markerIOReturning(SAMPLE_MARKER),
    },
  );
  expect(result.exitCode).toBe(1);
  expect(JSON.parse(result.stderr ?? '').error).toBe('missing-status');
});

test('phaseUpdate: bubbles up status-not-mappable on --status=blocked', async () => {
  const result = await phaseUpdate(
    ['my-thing', '--phase=1', '--status=blocked'],
    {
      resolveAuthFn: stubAuth(),
      markerIO: markerIOReturning(SAMPLE_MARKER),
    },
  );
  expect(result.exitCode).toBe(1);
  expect(JSON.parse(result.stderr ?? '').error).toBe('status-not-mappable');
});

test('phaseUpdate: errors with linear-project-not-found when project query returns null', async () => {
  const { client } = clientWithResponses([projectNotFoundResponse()]);
  const result = await phaseUpdate(
    ['my-thing', '--phase=1', '--status=completed'],
    {
      client,
      resolveAuthFn: stubAuth(),
      projectsRoot: '/tmp/projects',
      markerIO: markerIOReturning(SAMPLE_MARKER),
    },
  );
  expect(result.exitCode).toBe(1);
  expect(JSON.parse(result.stderr ?? '').error).toBe('linear-project-not-found');
});

test('phaseUpdate: errors with phase-not-found when no milestone matches the phase number', async () => {
  const { client } = clientWithResponses([milestoneListResponse()]);
  const result = await phaseUpdate(
    ['my-thing', '--phase=99', '--status=completed'],
    {
      client,
      resolveAuthFn: stubAuth(),
      projectsRoot: '/tmp/projects',
      markerIO: markerIOReturning(SAMPLE_MARKER),
    },
  );
  expect(result.exitCode).toBe(1);
  expect(JSON.parse(result.stderr ?? '').error).toBe('phase-not-found');
});

test('phaseUpdate: transitions matching milestone and emits {before, after, requested_loom, requested_linear}', async () => {
  const { fetchFn, client } = clientWithResponses([
    milestoneListResponse(),
    {
      data: {
        projectMilestoneUpdate: {
          success: true,
          projectMilestone: {
            id: 'm-1',
            name: 'my-thing · Phase 1 — Design',
            state: 'completed',
          },
        },
      },
    },
  ]);
  const result = await phaseUpdate(
    ['my-thing', '--phase=1', '--status=completed'],
    {
      client,
      resolveAuthFn: stubAuth(),
      projectsRoot: '/tmp/projects',
      markerIO: markerIOReturning(SAMPLE_MARKER),
    },
  );

  expect(result.exitCode).toBe(0);
  const parsed = JSON.parse(result.stdout ?? '');
  expect(parsed).toEqual({
    slug: 'my-thing',
    phase: {
      number: 1,
      name: 'Design',
      milestone_id: 'm-1',
    },
    status: {
      before: 'planned',
      after: 'completed',
      requested_loom: 'completed',
      requested_linear: 'completed',
    },
  });

  // Confirm the update mutation carried the mapped Linear state.
  const callBodies = fetchFn.mock.calls.map(
    (c) =>
      JSON.parse(c[1].body) as {
        variables: { id?: string; input?: { state?: string } };
      },
  );
  const updateCall = callBodies[1]!;
  expect(updateCall.variables.id).toBe('m-1');
  expect(updateCall.variables.input?.state).toBe('completed');
});

test('phaseUpdate: maps --status=in-progress to Linear state "started" in the update request', async () => {
  const { fetchFn, client } = clientWithResponses([
    milestoneListResponse(),
    {
      data: {
        projectMilestoneUpdate: {
          success: true,
          projectMilestone: {
            id: 'm-1',
            name: 'my-thing · Phase 1 — Design',
            state: 'started',
          },
        },
      },
    },
  ]);
  const result = await phaseUpdate(
    ['my-thing', '--phase=1', '--status=in-progress'],
    {
      client,
      resolveAuthFn: stubAuth(),
      projectsRoot: '/tmp/projects',
      markerIO: markerIOReturning(SAMPLE_MARKER),
    },
  );
  expect(result.exitCode).toBe(0);

  const callBodies = fetchFn.mock.calls.map(
    (c) =>
      JSON.parse(c[1].body) as {
        variables: { input?: { state?: string } };
      },
  );
  expect(callBodies[1]!.variables.input?.state).toBe('started');
});

test('phaseUpdate: bubbles up milestone-update-failed when projectMilestoneUpdate returns success=false', async () => {
  const { client } = clientWithResponses([
    milestoneListResponse(),
    {
      data: {
        projectMilestoneUpdate: { success: false, projectMilestone: null },
      },
    },
  ]);
  const result = await phaseUpdate(
    ['my-thing', '--phase=1', '--status=completed'],
    {
      client,
      resolveAuthFn: stubAuth(),
      projectsRoot: '/tmp/projects',
      markerIO: markerIOReturning(SAMPLE_MARKER),
    },
  );
  expect(result.exitCode).toBe(1);
  expect(JSON.parse(result.stderr ?? '').error).toBe('milestone-update-failed');
});

test('phaseUpdate: --pretty pretty-prints the JSON output', async () => {
  const { client } = clientWithResponses([
    milestoneListResponse(),
    {
      data: {
        projectMilestoneUpdate: {
          success: true,
          projectMilestone: {
            id: 'm-1',
            name: 'my-thing · Phase 1 — Design',
            state: 'completed',
          },
        },
      },
    },
  ]);
  const result = await phaseUpdate(
    ['my-thing', '--phase=1', '--status=completed', '--pretty'],
    {
      client,
      resolveAuthFn: stubAuth(),
      projectsRoot: '/tmp/projects',
      markerIO: markerIOReturning(SAMPLE_MARKER),
    },
  );
  expect(result.exitCode).toBe(0);
  expect(result.stdout).toContain('\n  ');
});
