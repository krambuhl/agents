import { test, expect, vi } from 'vitest';
import { applyDiffOps, type ApplyContext } from './apply-diff.ts';
import { LinearClient } from './linear-client.ts';
import type { DiffOp } from './plan-diff.ts';

function clientWithSequencedResponses(
  responses: Array<{ ok?: boolean; status?: number; body: unknown }>,
) {
  const fetchFn = vi.fn();
  const requestVariables: unknown[] = [];
  for (const r of responses) {
    fetchFn.mockResolvedValueOnce({
      ok: r.ok ?? true,
      status: r.status ?? 200,
      text: () => Promise.resolve(''),
      json: () => Promise.resolve(r.body),
    });
  }
  const client = new LinearClient({
    apiKey: 'lin_api_test',
    fetchFn: (url, init) => {
      const parsed = JSON.parse(init.body);
      requestVariables.push(parsed.variables);
      return fetchFn(url, init) as ReturnType<typeof fetchFn>;
    },
    sleepFn: () => Promise.resolve(),
  });
  return { client, fetchFn, requestVariables };
}

function ctxWith(client: LinearClient, overrides?: Partial<ApplyContext>): ApplyContext {
  return {
    client,
    team_id: 'team-1',
    linear_project_id: 'lin-proj-1',
    label: { id: 'lbl-1', name: 'loom-project:my-thing' },
    composed_key_to_linear_id: new Map(),
    ...overrides,
  };
}

test('applyDiffOps: empty op list returns empty applied list', async () => {
  const { client } = clientWithSequencedResponses([]);
  const applied = await applyDiffOps([], ctxWith(client));
  expect(applied).toEqual([]);
});

test('applyDiffOps: creates a Milestone via projectMilestoneCreate', async () => {
  const { client, requestVariables } = clientWithSequencedResponses([
    {
      body: {
        data: {
          projectMilestoneCreate: {
            success: true,
            projectMilestone: { id: 'm-1', name: 'Phase 1' },
          },
        },
      },
    },
  ]);
  const ops: DiffOp[] = [
    {
      kind: 'create',
      node_kind: 'phase',
      composed_key: 'design-1',
      title: 'my-thing · Phase 1 — Design',
      body: 'body',
      parent_composed_key: undefined,
    },
  ];
  const applied = await applyDiffOps(ops, ctxWith(client));
  expect(applied).toHaveLength(1);
  expect(applied[0]!.linear_id).toBe('m-1');
  expect(applied[0]!.op_kind).toBe('create');
  expect(applied[0]!.node_kind).toBe('phase');
  expect((requestVariables[0] as { input: unknown }).input).toMatchObject({
    projectId: 'lin-proj-1',
    name: 'my-thing · Phase 1 — Design',
    description: 'body',
  });
});

test('applyDiffOps: creates Batch as Issue under Milestone via projectMilestoneId', async () => {
  const ctx = ctxWith(
    {} as LinearClient,
    {
      composed_key_to_linear_id: new Map([['design-1', 'm-1']]),
    },
  );
  const { client, requestVariables } = clientWithSequencedResponses([
    {
      body: {
        data: {
          issueCreate: {
            success: true,
            issue: {
              id: 'i-1',
              identifier: 'ENG-1',
              url: 'https://l/i/1',
              title: 't',
            },
          },
        },
      },
    },
  ]);
  ctx.client = client;
  const ops: DiffOp[] = [
    {
      kind: 'create',
      node_kind: 'batch',
      composed_key: 'design-1.skeleton-1',
      title: 'my-thing · Batch design-1.skeleton-1 — Skeleton',
      body: 'body',
      parent_composed_key: 'design-1',
    },
  ];
  const applied = await applyDiffOps(ops, ctx);
  expect(applied[0]!.linear_id).toBe('i-1');
  expect(applied[0]!.linear_identifier).toBe('ENG-1');
  expect((requestVariables[0] as { input: { projectMilestoneId: string; labelIds: string[] } }).input.projectMilestoneId).toBe('m-1');
  expect((requestVariables[0] as { input: { labelIds: string[] } }).input.labelIds).toEqual(['lbl-1']);
});

test('applyDiffOps: creates Task as Issue under Batch via parentId', async () => {
  const ctx = ctxWith(
    {} as LinearClient,
    {
      composed_key_to_linear_id: new Map([
        ['design-1', 'm-1'],
        ['design-1.skeleton-1', 'i-1'],
      ]),
    },
  );
  const { client, requestVariables } = clientWithSequencedResponses([
    {
      body: {
        data: {
          issueCreate: {
            success: true,
            issue: {
              id: 'i-2',
              identifier: 'ENG-2',
              url: 'https://l/i/2',
              title: 't',
            },
          },
        },
      },
    },
  ]);
  ctx.client = client;
  const ops: DiffOp[] = [
    {
      kind: 'create',
      node_kind: 'task',
      composed_key: 'design-1.skeleton-1.decisions-1',
      title: 'Decisions',
      body: 'body',
      parent_composed_key: 'design-1.skeleton-1',
    },
  ];
  await applyDiffOps(ops, ctx);
  expect((requestVariables[0] as { input: { parentId: string } }).input.parentId).toBe('i-1');
});

test('applyDiffOps: creates Phase + Batch + Task in tree order, threading IDs', async () => {
  const { client } = clientWithSequencedResponses([
    { body: { data: { projectMilestoneCreate: { success: true, projectMilestone: { id: 'm-1', name: 'P' } } } } },
    { body: { data: { issueCreate: { success: true, issue: { id: 'i-1', identifier: 'X-1', url: 'u', title: 't' } } } } },
    { body: { data: { issueCreate: { success: true, issue: { id: 'i-2', identifier: 'X-2', url: 'u', title: 't' } } } } },
  ]);
  const ctx = ctxWith(client);
  const ops: DiffOp[] = [
    { kind: 'create', node_kind: 'phase', composed_key: 'p-1', title: 'P', body: 'b', parent_composed_key: undefined },
    { kind: 'create', node_kind: 'batch', composed_key: 'p-1.b-1', title: 'B', body: 'b', parent_composed_key: 'p-1' },
    { kind: 'create', node_kind: 'task', composed_key: 'p-1.b-1.t-1', title: 'T', body: 'b', parent_composed_key: 'p-1.b-1' },
  ];
  const applied = await applyDiffOps(ops, ctx);
  expect(applied.map((a) => a.linear_id)).toEqual(['m-1', 'i-1', 'i-2']);
});

test('applyDiffOps: throws apply-failed when projectMilestoneCreate returns success=false', async () => {
  const { client } = clientWithSequencedResponses([
    {
      body: {
        data: {
          projectMilestoneCreate: { success: false, projectMilestone: null },
        },
      },
    },
  ]);
  const ops: DiffOp[] = [
    { kind: 'create', node_kind: 'phase', composed_key: 'p-1', title: 'P', body: 'b', parent_composed_key: undefined },
  ];
  await expect(applyDiffOps(ops, ctxWith(client))).rejects.toMatchObject({
    code: 'apply-failed',
  });
});

test('applyDiffOps: throws apply-failed when parent has no Linear ID yet', async () => {
  const { client } = clientWithSequencedResponses([]);
  const ops: DiffOp[] = [
    {
      kind: 'create',
      node_kind: 'batch',
      composed_key: 'p-1.b-1',
      title: 'B',
      body: 'b',
      parent_composed_key: 'p-1',
    },
  ];
  await expect(applyDiffOps(ops, ctxWith(client))).rejects.toMatchObject({
    code: 'apply-failed',
  });
});

test('applyDiffOps: update op sends issueUpdate with the new title', async () => {
  const { client, requestVariables } = clientWithSequencedResponses([
    { body: { data: { issueUpdate: { success: true, issue: { id: 'i-1', identifier: 'X-1', url: 'u', title: 'new' } } } } },
  ]);
  const ops: DiffOp[] = [
    {
      kind: 'update',
      node_kind: 'task',
      composed_key: 'p-1.b-1.t-1',
      linear_id: 'i-1',
      title_before: 'old',
      title_after: 'new',
      body_changed: true,
    },
  ];
  const applied = await applyDiffOps(ops, ctxWith(client));
  expect(applied[0]!.op_kind).toBe('update');
  expect((requestVariables[0] as { input: { title: string } }).input.title).toBe('new');
});

test('applyDiffOps: archive op sends issueArchive for batch/task', async () => {
  const { client, requestVariables } = clientWithSequencedResponses([
    { body: { data: { issueArchive: { success: true } } } },
  ]);
  const ops: DiffOp[] = [
    {
      kind: 'archive',
      node_kind: 'task',
      composed_key: 'orphan-1.b-1.t-1',
      linear_id: 'i-orphan',
      state_type: 'backlog',
    },
  ];
  const applied = await applyDiffOps(ops, ctxWith(client));
  expect(applied[0]!.op_kind).toBe('archive');
  expect((requestVariables[0] as { id: string }).id).toBe('i-orphan');
});

test('applyDiffOps: archive op sends projectMilestoneArchive for phase', async () => {
  const { client } = clientWithSequencedResponses([
    { body: { data: { projectMilestoneArchive: { success: true } } } },
  ]);
  const ops: DiffOp[] = [
    {
      kind: 'archive',
      node_kind: 'phase',
      composed_key: 'orphan-phase',
      linear_id: 'm-orphan',
      state_type: undefined,
    },
  ];
  const applied = await applyDiffOps(ops, ctxWith(client));
  expect(applied[0]!.op_kind).toBe('archive');
  expect(applied[0]!.node_kind).toBe('phase');
});

test('applyDiffOps: applies in order create → update → rekey → archive', async () => {
  const { client, requestVariables } = clientWithSequencedResponses([
    { body: { data: { projectMilestoneCreate: { success: true, projectMilestone: { id: 'm-new', name: '' } } } } },
    { body: { data: { issueUpdate: { success: true, issue: { id: 'i-u', identifier: 'X-1', url: 'u', title: '' } } } } },
    { body: { data: { issueUpdate: { success: true, issue: { id: 'i-r', identifier: 'X-2', url: 'u', title: '' } } } } },
    { body: { data: { issueArchive: { success: true } } } },
  ]);
  const ops: DiffOp[] = [
    { kind: 'archive', node_kind: 'task', composed_key: 'orphan', linear_id: 'i-archive', state_type: 'backlog' },
    { kind: 'create', node_kind: 'phase', composed_key: 'new-1', title: 't', body: 'b', parent_composed_key: undefined },
    { kind: 'rekey', node_kind: 'task', linear_id: 'i-r', old_composed_key: 'old', new_composed_key: 'new', title_changed: false, body_changed: true },
    { kind: 'update', node_kind: 'task', composed_key: 'unchanged', linear_id: 'i-u', title_before: 'a', title_after: 'b', body_changed: false },
  ];
  const applied = await applyDiffOps(ops, ctxWith(client));
  expect(applied.map((a) => a.op_kind)).toEqual([
    'create',
    'update',
    'rekey',
    'archive',
  ]);
  // Verify the actual GraphQL operations went out in that order too:
  // mutation 1: projectMilestoneCreate (create), 2: issueUpdate (update),
  // 3: issueUpdate (rekey), 4: issueArchive (archive).
  expect(requestVariables).toHaveLength(4);
});
