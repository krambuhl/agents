import { test, expect, vi } from 'vitest';
import {
  composeLinearDescription,
  fetchLinearState,
  parseComposedKey,
} from './linear-state.ts';
import { LinearClient } from './linear-client.ts';

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

test('parseComposedKey: extracts from a description header', () => {
  const desc = `**Composed key**: design-1.skeleton-1.decisions-1
**Source**: github.com/...
**Last synced**: 2026-05-22T20:00:00.000Z

---

prose body`;
  expect(parseComposedKey(desc)).toBe('design-1.skeleton-1.decisions-1');
});

test('parseComposedKey: returns undefined when no Composed key line present', () => {
  expect(parseComposedKey('some other text')).toBeUndefined();
  expect(parseComposedKey('')).toBeUndefined();
  expect(parseComposedKey(null)).toBeUndefined();
});

test('parseComposedKey: matches phase-level (single segment) keys too', () => {
  expect(parseComposedKey('**Composed key**: design-1')).toBe('design-1');
});

test('parseComposedKey: rejects invalid characters (uppercase, spaces)', () => {
  expect(parseComposedKey('**Composed key**: Design-1')).toBeUndefined();
  expect(parseComposedKey('**Composed key**: design 1')).toBeUndefined();
});

test('composeLinearDescription: header + divider + body match the layout', () => {
  const body = composeLinearDescription(
    {
      composed_key: 'design-1.skeleton-1.decisions-1',
      source_url: 'github.com/krambuhl/agents/tree/main/projects/test/PLAN.md',
      synced_at: '2026-05-22T20:00:00.000Z',
    },
    'task prose body',
  );
  const lines = body.split('\n');
  expect(lines[0]).toBe(
    '**Composed key**: design-1.skeleton-1.decisions-1',
  );
  expect(lines[1]).toContain('**Source**:');
  expect(lines[2]).toContain('**Last synced**:');
  expect(lines[3]).toBe('');
  expect(lines[4]).toBe('---');
  expect(lines[5]).toBe('');
  expect(lines[6]).toBe('task prose body');
  // parseComposedKey should round-trip on the composed body.
  expect(parseComposedKey(body)).toBe('design-1.skeleton-1.decisions-1');
});

test('fetchLinearState: linear-project-not-found when project is null', async () => {
  const client = clientReturning({ data: { project: null, issues: { nodes: [] } } });
  await expect(
    fetchLinearState({
      client,
      linearProjectId: 'ghost',
      labelName: 'loom-project:my-thing',
    }),
  ).rejects.toMatchObject({ code: 'linear-project-not-found' });
});

test('fetchLinearState: keys Milestones with composed-key headers', async () => {
  const client = clientReturning({
    data: {
      project: {
        id: 'p-1',
        projectMilestones: {
          nodes: [
            {
              id: 'm-1',
              name: 'my-thing · Phase 1 — Design',
              description: `**Composed key**: design-1
**Source**: github.com/...
**Last synced**: 2026-05-22

---

phase prose`,
            },
            {
              id: 'm-2',
              name: 'Operator-created milestone',
              description: 'no header here',
            },
          ],
        },
      },
      issues: { nodes: [] },
    },
  });
  const state = await fetchLinearState({
    client,
    linearProjectId: 'p-1',
    labelName: 'loom-project:my-thing',
  });
  expect(state.by_composed_key.has('design-1')).toBe(true);
  expect(state.by_composed_key.get('design-1')!.linear_id).toBe('m-1');
  expect(state.by_composed_key.get('design-1')!.kind).toBe('phase');
  // Unkeyed milestone shows up in the unkeyed list.
  expect(state.unkeyed).toHaveLength(1);
  expect(state.unkeyed[0]!.linear_id).toBe('m-2');
});

test('fetchLinearState: distinguishes Batches (no parent) from Tasks (parent !== null)', async () => {
  const client = clientReturning({
    data: {
      project: { id: 'p-1', projectMilestones: { nodes: [] } },
      issues: {
        nodes: [
          {
            id: 'i-1',
            title: 'Batch 1',
            description: '**Composed key**: design-1.skeleton-1',
            parent: null,
            projectMilestone: { id: 'm-1' },
            state: { type: 'started' },
          },
          {
            id: 'i-2',
            title: 'Sub-Issue',
            description: '**Composed key**: design-1.skeleton-1.decisions-1',
            parent: { id: 'i-1' },
            projectMilestone: null,
            state: { type: 'unstarted' },
          },
        ],
      },
    },
  });
  const state = await fetchLinearState({
    client,
    linearProjectId: 'p-1',
    labelName: 'loom-project:my-thing',
  });
  const batch = state.by_composed_key.get('design-1.skeleton-1')!;
  expect(batch.kind).toBe('batch');
  expect(batch.parent_linear_id).toBe('m-1');
  const task = state.by_composed_key.get('design-1.skeleton-1.decisions-1')!;
  expect(task.kind).toBe('task');
  expect(task.parent_linear_id).toBe('i-1');
});

test('fetchLinearState: unkeyed Issues land in the unkeyed array', async () => {
  const client = clientReturning({
    data: {
      project: { id: 'p-1', projectMilestones: { nodes: [] } },
      issues: {
        nodes: [
          {
            id: 'i-keyed',
            title: 't',
            description: '**Composed key**: d-1.b-1',
            parent: null,
            projectMilestone: null,
            state: { type: 'unstarted' },
          },
          {
            id: 'i-unkeyed',
            title: 't',
            description: null,
            parent: null,
            projectMilestone: null,
            state: { type: 'unstarted' },
          },
        ],
      },
    },
  });
  const state = await fetchLinearState({
    client,
    linearProjectId: 'p-1',
    labelName: 'loom-project:my-thing',
  });
  expect(state.by_composed_key.size).toBe(1);
  expect(state.unkeyed).toHaveLength(1);
  expect(state.unkeyed[0]!.linear_id).toBe('i-unkeyed');
});
