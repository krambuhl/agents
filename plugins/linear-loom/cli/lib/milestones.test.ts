import { test, expect, vi } from 'vitest';
import {
  mapPhaseStatusToLinearState,
  updateMilestoneState,
} from './milestones.ts';
import { LinearClient } from './linear-client.ts';
import { LinearLoomError } from './errors.ts';

function clientReturning(response: unknown) {
  return new LinearClient({
    apiKey: 'lin_api_test',
    fetchFn: vi.fn(() =>
      Promise.resolve({
        ok: true,
        status: 200,
        text: () => Promise.resolve(''),
        json: () => Promise.resolve(response),
      }),
    ),
    sleepFn: () => Promise.resolve(),
  });
}

test('updateMilestoneState: returns {id, name, state} on success', async () => {
  const client = clientReturning({
    data: {
      projectMilestoneUpdate: {
        success: true,
        projectMilestone: { id: 'm-1', name: 'X · Phase 1 — Design', state: 'started' },
      },
    },
  });
  const result = await updateMilestoneState({
    client,
    milestoneId: 'm-1',
    state: 'started',
  });
  expect(result).toEqual({
    id: 'm-1',
    name: 'X · Phase 1 — Design',
    state: 'started',
  });
});

test('updateMilestoneState: throws milestone-update-failed when success=false', async () => {
  const client = clientReturning({
    data: {
      projectMilestoneUpdate: { success: false, projectMilestone: null },
    },
  });
  expect.assertions(2);
  try {
    await updateMilestoneState({
      client,
      milestoneId: 'm-1',
      state: 'completed',
    });
  } catch (err) {
    expect(err).toBeInstanceOf(LinearLoomError);
    expect((err as LinearLoomError).code).toBe('milestone-update-failed');
  }
});

test('updateMilestoneState: forwards milestoneId + state to the mutation input', async () => {
  const fetchFn = vi.fn(() =>
    Promise.resolve({
      ok: true,
      status: 200,
      text: () => Promise.resolve(''),
      json: () =>
        Promise.resolve({
          data: {
            projectMilestoneUpdate: {
              success: true,
              projectMilestone: { id: 'm-7', name: 'n', state: 'completed' },
            },
          },
        }),
    }),
  );
  const client = new LinearClient({
    apiKey: 'lin_api_test',
    fetchFn,
    sleepFn: () => Promise.resolve(),
  });
  await updateMilestoneState({
    client,
    milestoneId: 'm-7',
    state: 'completed',
  });
  const callBodies = fetchFn.mock.calls.map(
    (c) =>
      JSON.parse(c[1].body) as {
        variables: { id: string; input: { state: string } };
      },
  );
  expect(callBodies[0]!.variables).toEqual({
    id: 'm-7',
    input: { state: 'completed' },
  });
});

test('mapPhaseStatusToLinearState: maps the four valid loom statuses to Linear strings', () => {
  expect(mapPhaseStatusToLinearState('not-started')).toBe('planned');
  expect(mapPhaseStatusToLinearState('in-progress')).toBe('started');
  expect(mapPhaseStatusToLinearState('completed')).toBe('completed');
  expect(mapPhaseStatusToLinearState('canceled')).toBe('canceled');
});

test('mapPhaseStatusToLinearState: throws status-not-mappable on "blocked" with a clear remedy hint', () => {
  expect.assertions(3);
  try {
    mapPhaseStatusToLinearState('blocked');
  } catch (err) {
    expect(err).toBeInstanceOf(LinearLoomError);
    expect((err as LinearLoomError).code).toBe('status-not-mappable');
    expect((err as LinearLoomError).message).toContain('label or comment');
  }
});

test('mapPhaseStatusToLinearState: throws status-not-mappable on unrecognized value', () => {
  expect.assertions(2);
  try {
    mapPhaseStatusToLinearState('purple');
  } catch (err) {
    expect(err).toBeInstanceOf(LinearLoomError);
    expect((err as LinearLoomError).code).toBe('status-not-mappable');
  }
});
