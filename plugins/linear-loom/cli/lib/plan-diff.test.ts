import { test, expect } from 'vitest';
import { parsePlan } from './plan-parser.ts';
import {
  computeDiff,
  partitionArchiveOps,
  summarizeDiff,
  type DiffOp,
} from './plan-diff.ts';
import type { LinearState, LinearStateNode } from './linear-state.ts';

// Simple title/body composers for tests. Real generate verb wires
// the slug-prefixed-title + provenance-described-body combo.
const composeTitle = (node: { kind: string; id: string; prose: string }, slug: string) => {
  if (node.kind === 'phase') return `${slug} · Phase — ${node.prose}`;
  return `${slug} · ${node.id} — ${node.prose}`;
};
const composeBody = (node: { prose: string }) => node.prose;

function linearStateFromEntries(
  entries: Array<Partial<LinearStateNode> & { composed_key: string }>,
): LinearState {
  const map = new Map<string, LinearStateNode>();
  for (const e of entries) {
    map.set(e.composed_key, {
      composed_key: e.composed_key,
      kind: e.kind ?? 'task',
      linear_id: e.linear_id ?? `lin-${e.composed_key}`,
      title: e.title ?? '',
      description: e.description ?? '',
      state_type: e.state_type,
      parent_linear_id: e.parent_linear_id,
    });
  }
  return { by_composed_key: map, unkeyed: [] };
}

const SIMPLE_PLAN = `## Phases

### Phase 1 [design-1] — Design

#### Batch 1 [skeleton-1] — Skeleton

- [decisions-1] Decisions
`;

test('computeDiff: emits creates when nothing exists in Linear', () => {
  const plan = parsePlan(SIMPLE_PLAN);
  const ops = computeDiff({
    plan,
    linear: linearStateFromEntries([]),
    slug: 'my-thing',
    composeTitle,
    composeBody,
  });
  expect(ops).toHaveLength(3);
  expect(ops.map((o) => o.kind)).toEqual(['create', 'create', 'create']);
  const phaseCreate = ops.find(
    (o) => o.kind === 'create' && o.node_kind === 'phase',
  );
  expect(phaseCreate).toBeDefined();
  if (phaseCreate?.kind === 'create') {
    expect(phaseCreate.composed_key).toBe('design-1');
    expect(phaseCreate.parent_composed_key).toBeUndefined();
  }
  const batchCreate = ops.find(
    (o) => o.kind === 'create' && o.node_kind === 'batch',
  );
  if (batchCreate?.kind === 'create') {
    expect(batchCreate.composed_key).toBe('design-1.skeleton-1');
    expect(batchCreate.parent_composed_key).toBe('design-1');
  }
  const taskCreate = ops.find(
    (o) => o.kind === 'create' && o.node_kind === 'task',
  );
  if (taskCreate?.kind === 'create') {
    expect(taskCreate.composed_key).toBe('design-1.skeleton-1.decisions-1');
    expect(taskCreate.parent_composed_key).toBe('design-1.skeleton-1');
  }
});

test('computeDiff: emits update when title differs', () => {
  const plan = parsePlan(SIMPLE_PLAN);
  const ops = computeDiff({
    plan,
    linear: linearStateFromEntries([
      {
        composed_key: 'design-1.skeleton-1.decisions-1',
        kind: 'task',
        title: 'old title',
        description: 'Decisions',
      },
    ]),
    slug: 'my-thing',
    composeTitle,
    composeBody,
  });
  const taskOp = ops.find(
    (o) =>
      (o.kind === 'update' || o.kind === 'create') &&
      (o.node_kind ?? '') === 'task',
  );
  expect(taskOp?.kind).toBe('update');
  if (taskOp?.kind === 'update') {
    expect(taskOp.title_before).toBe('old title');
    expect(taskOp.title_after).toBe('my-thing · decisions-1 — Decisions');
    expect(taskOp.body_changed).toBe(false);
  }
});

test('computeDiff: emits update when body differs even if title matches', () => {
  const plan = parsePlan(SIMPLE_PLAN);
  const ops = computeDiff({
    plan,
    linear: linearStateFromEntries([
      {
        composed_key: 'design-1.skeleton-1.decisions-1',
        kind: 'task',
        title: 'my-thing · decisions-1 — Decisions',
        description: 'old body',
      },
    ]),
    slug: 'my-thing',
    composeTitle,
    composeBody,
  });
  const taskOp = ops.find(
    (o) => o.kind === 'update' && o.node_kind === 'task',
  );
  expect(taskOp).toBeDefined();
  if (taskOp?.kind === 'update') {
    expect(taskOp.body_changed).toBe(true);
  }
});

test('computeDiff: matching state emits no ops by default (noops suppressed)', () => {
  const plan = parsePlan(SIMPLE_PLAN);
  const ops = computeDiff({
    plan,
    linear: linearStateFromEntries([
      {
        composed_key: 'design-1',
        kind: 'phase',
        title: 'my-thing · Phase — Design',
        description: 'Design',
      },
      {
        composed_key: 'design-1.skeleton-1',
        kind: 'batch',
        title: 'my-thing · skeleton-1 — Skeleton',
        description: 'Skeleton',
      },
      {
        composed_key: 'design-1.skeleton-1.decisions-1',
        kind: 'task',
        title: 'my-thing · decisions-1 — Decisions',
        description: 'Decisions',
      },
    ]),
    slug: 'my-thing',
    composeTitle,
    composeBody,
  });
  expect(ops).toHaveLength(0);
});

test('computeDiff: include_noops=true emits noop ops for matching state', () => {
  const plan = parsePlan(SIMPLE_PLAN);
  const ops = computeDiff({
    plan,
    linear: linearStateFromEntries([
      {
        composed_key: 'design-1',
        kind: 'phase',
        title: 'my-thing · Phase — Design',
        description: 'Design',
      },
      {
        composed_key: 'design-1.skeleton-1',
        kind: 'batch',
        title: 'my-thing · skeleton-1 — Skeleton',
        description: 'Skeleton',
      },
      {
        composed_key: 'design-1.skeleton-1.decisions-1',
        kind: 'task',
        title: 'my-thing · decisions-1 — Decisions',
        description: 'Decisions',
      },
    ]),
    slug: 'my-thing',
    include_noops: true,
    composeTitle,
    composeBody,
  });
  expect(ops).toHaveLength(3);
  expect(ops.every((o) => o.kind === 'noop')).toBe(true);
});

test('computeDiff: rekey op when PLAN.md carries was=<old-id> and Linear has the old key', () => {
  const plan = parsePlan(`## Phases

### Phase 1 [design-1] — Design

#### Batch 1 [skeleton-1] — Skeleton

- [decisions-2 was=decisions-1] Decisions (renamed)
`);
  const ops = computeDiff({
    plan,
    linear: linearStateFromEntries([
      {
        composed_key: 'design-1.skeleton-1.decisions-1',
        kind: 'task',
        title: 'my-thing · decisions-1 — Decisions',
        description: 'Decisions',
        linear_id: 'lin-old',
      },
    ]),
    slug: 'my-thing',
    composeTitle,
    composeBody,
  });
  const rekey = ops.find((o) => o.kind === 'rekey');
  expect(rekey).toBeDefined();
  if (rekey?.kind === 'rekey') {
    expect(rekey.linear_id).toBe('lin-old');
    expect(rekey.old_composed_key).toBe('design-1.skeleton-1.decisions-1');
    expect(rekey.new_composed_key).toBe('design-1.skeleton-1.decisions-2');
    expect(rekey.title_changed).toBe(true);
    expect(rekey.body_changed).toBe(true);
  }
});

test('computeDiff: was=<old-id> with no Linear record at old key falls through to create', () => {
  const plan = parsePlan(`## Phases

### Phase 1 [design-1] — Design

#### Batch 1 [skeleton-1] — Skeleton

- [decisions-2 was=decisions-1] Decisions (renamed)
`);
  const ops = computeDiff({
    plan,
    linear: linearStateFromEntries([]),
    slug: 'my-thing',
    composeTitle,
    composeBody,
  });
  const decisionsOp = ops.find(
    (o) =>
      'composed_key' in o &&
      o.composed_key === 'design-1.skeleton-1.decisions-2',
  );
  expect(decisionsOp?.kind).toBe('create');
});

test('computeDiff: archive ops for Linear-side composed keys not in PLAN.md', () => {
  const plan = parsePlan(SIMPLE_PLAN);
  const ops = computeDiff({
    plan,
    linear: linearStateFromEntries([
      {
        composed_key: 'design-1',
        kind: 'phase',
        title: 'my-thing · Phase — Design',
        description: 'Design',
      },
      {
        composed_key: 'design-1.skeleton-1',
        kind: 'batch',
        title: 'my-thing · skeleton-1 — Skeleton',
        description: 'Skeleton',
      },
      {
        composed_key: 'design-1.skeleton-1.decisions-1',
        kind: 'task',
        title: 'my-thing · decisions-1 — Decisions',
        description: 'Decisions',
      },
      {
        composed_key: 'design-1.skeleton-1.obsolete-1',
        kind: 'task',
        title: 'orphan',
        description: 'orphan',
        state_type: 'backlog',
        linear_id: 'lin-obsolete',
      },
    ]),
    slug: 'my-thing',
    composeTitle,
    composeBody,
  });
  const archiveOps = ops.filter((o) => o.kind === 'archive');
  expect(archiveOps).toHaveLength(1);
  if (archiveOps[0]!.kind === 'archive') {
    expect(archiveOps[0]!.composed_key).toBe('design-1.skeleton-1.obsolete-1');
    expect(archiveOps[0]!.linear_id).toBe('lin-obsolete');
    expect(archiveOps[0]!.state_type).toBe('backlog');
  }
});

test('summarizeDiff: counts ops by kind', () => {
  const ops: DiffOp[] = [
    { kind: 'create', node_kind: 'task', composed_key: 'a', title: 't', body: 'b', parent_composed_key: undefined },
    { kind: 'create', node_kind: 'task', composed_key: 'b', title: 't', body: 'b', parent_composed_key: undefined },
    { kind: 'update', node_kind: 'task', composed_key: 'c', linear_id: 'lin', title_before: 'a', title_after: 'b', body_changed: false },
    { kind: 'archive', node_kind: 'task', composed_key: 'd', linear_id: 'lin', state_type: 'backlog' },
  ];
  const summary = summarizeDiff(ops);
  expect(summary).toMatchObject({
    create: 2,
    update: 1,
    archive: 1,
    total_ops: 4,
  });
});

test('partitionArchiveOps: separates in-flight from safe', () => {
  const ops: DiffOp[] = [
    { kind: 'archive', node_kind: 'task', composed_key: 'a', linear_id: 'lin-a', state_type: 'backlog' },
    { kind: 'archive', node_kind: 'task', composed_key: 'b', linear_id: 'lin-b', state_type: 'started' },
    { kind: 'archive', node_kind: 'task', composed_key: 'c', linear_id: 'lin-c', state_type: 'completed' },
    { kind: 'archive', node_kind: 'phase', composed_key: 'd', linear_id: 'lin-d', state_type: undefined },
    { kind: 'create', node_kind: 'task', composed_key: 'e', title: 't', body: 'b', parent_composed_key: undefined },
  ];
  const partition = partitionArchiveOps(ops);
  expect(partition.safe_to_archive.map((o) => o.composed_key)).toEqual(['a', 'd']);
  expect(partition.in_flight.map((o) => o.composed_key)).toEqual(['b', 'c']);
});
