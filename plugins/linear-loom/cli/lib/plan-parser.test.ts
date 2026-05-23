import { test, expect } from 'vitest';
import { parsePlan, flattenPlan } from './plan-parser.ts';
import { LinearLoomError } from './errors.ts';

const HAPPY_PLAN = `# A Plan

Some preamble.

## Context

Not parsed.

## Phases

### Phase 1 [design-1] — DESIGN.md

Goal: lock the architecture.

#### Batch 1 [skeleton-1] — Write skeleton

Some batch prose.

- [decisions-1] Decision register
- [sketch-1] Architecture sketch
- [open-q-1] Open questions

#### Batch 2 [grill-1] — Grill open branches

- [parser-1] tasks-generate parser convention
- [skills-1] skills inventory

### Phase 2 [scaffold-1] — Plugin scaffolding

#### Batch 1 [bootstrap-1] — Bootstrap files

- [plugin-json-1] plugin.json
- [bin-1] bin/linear-loom entrypoint

## Risks

Not parsed.
`;

test('parsePlan: parses happy-path structure with composed keys', () => {
  const parsed = parsePlan(HAPPY_PLAN);
  expect(parsed.phases).toHaveLength(2);

  const phase1 = parsed.phases[0]!;
  expect(phase1.id).toBe('design-1');
  expect(phase1.number).toBe(1);
  expect(phase1.composed_key).toBe('design-1');
  expect(phase1.prose).toBe('DESIGN.md');
  expect(phase1.batches).toHaveLength(2);

  const batch1 = phase1.batches[0]!;
  expect(batch1.id).toBe('skeleton-1');
  expect(batch1.number).toBe(1);
  expect(batch1.composed_key).toBe('design-1.skeleton-1');
  expect(batch1.tasks).toHaveLength(3);

  const task1 = batch1.tasks[0]!;
  expect(task1.id).toBe('decisions-1');
  expect(task1.composed_key).toBe('design-1.skeleton-1.decisions-1');
  expect(task1.prose).toBe('Decision register');
});

test('parsePlan: ignores ## sections that are not "## Phases"', () => {
  const parsed = parsePlan(HAPPY_PLAN);
  expect(parsed.phases.map((p) => p.id)).toEqual(['design-1', 'scaffold-1']);
  // Context and Risks sections present in the markdown but not in the parse.
});

test('parsePlan: requires Tasks to hang under a Batch', () => {
  const plan = `## Phases

### Phase 1 [p-1] — Phase 1

- [t-1] Orphaned task

#### Batch 1 [b-1] — Batch
`;
  expect(() => parsePlan(plan)).toThrow(/plan-parse-failed/);
});

test('parsePlan: errors when "## Phases" section is missing', () => {
  expect(() => parsePlan('# Just a heading\n\n## Context\n')).toThrow(
    /No "## Phases" section/,
  );
});

test('parsePlan: errors on duplicate Phase IDs', () => {
  const plan = `## Phases

### Phase 1 [p-1] — Phase 1

#### Batch 1 [b-1] — Batch

- [t-1] Task

### Phase 2 [p-1] — Duplicate ID

#### Batch 1 [b-2] — Batch

- [t-1] Task
`;
  expect(() => parsePlan(plan)).toThrow(/Duplicate ID "p-1"/);
});

test('parsePlan: errors on duplicate Batch IDs under same Phase', () => {
  const plan = `## Phases

### Phase 1 [p-1] — Phase 1

#### Batch 1 [b-1] — Batch A

- [t-1] Task A

#### Batch 2 [b-1] — Batch B same ID

- [t-2] Task B
`;
  expect(() => parsePlan(plan)).toThrow(/Duplicate ID "b-1"/);
});

test('parsePlan: errors on duplicate Task IDs under same Batch', () => {
  const plan = `## Phases

### Phase 1 [p-1] — Phase 1

#### Batch 1 [b-1] — Batch

- [t-1] First task
- [t-1] Same ID
`;
  expect(() => parsePlan(plan)).toThrow(/Duplicate ID "t-1"/);
});

test('parsePlan: allows the same ID under different parents (parent-scoped)', () => {
  const plan = `## Phases

### Phase 1 [p-1] — Phase 1

#### Batch 1 [skeleton-1] — Batch A

- [item-1] Task

### Phase 2 [p-2] — Phase 2

#### Batch 1 [skeleton-1] — Batch B (same Batch ID, different Phase parent)

- [item-1] Task (same Task ID, different Batch parent)
`;
  const parsed = parsePlan(plan);
  expect(parsed.phases[0]!.batches[0]!.composed_key).toBe('p-1.skeleton-1');
  expect(parsed.phases[1]!.batches[0]!.composed_key).toBe('p-2.skeleton-1');
  expect(parsed.phases[0]!.batches[0]!.tasks[0]!.composed_key).toBe(
    'p-1.skeleton-1.item-1',
  );
  expect(parsed.phases[1]!.batches[0]!.tasks[0]!.composed_key).toBe(
    'p-2.skeleton-1.item-1',
  );
});

test('parsePlan: supports was=<old-id> rename annotation on Phase, Batch, Task', () => {
  const plan = `## Phases

### Phase 1 [architecture-1 was=sketch-1] — Renamed Phase

#### Batch 1 [bootstrap-2 was=bootstrap-1] — Renamed Batch

- [config-2 was=config-1] Renamed Task
`;
  const parsed = parsePlan(plan);
  expect(parsed.phases[0]!.was).toBe('sketch-1');
  expect(parsed.phases[0]!.id).toBe('architecture-1');
  expect(parsed.phases[0]!.batches[0]!.was).toBe('bootstrap-1');
  expect(parsed.phases[0]!.batches[0]!.tasks[0]!.was).toBe('config-1');
});

test('parsePlan: rejects invalid ID shapes (uppercase, leading/trailing dash)', () => {
  const bad = [
    `## Phases\n\n### Phase 1 [Has-Caps] — bad\n\n#### Batch 1 [b-1] — x\n\n- [t-1] task\n`,
    `## Phases\n\n### Phase 1 [-leading] — bad\n\n#### Batch 1 [b-1] — x\n\n- [t-1] task\n`,
    `## Phases\n\n### Phase 1 [trailing-] — bad\n\n#### Batch 1 [b-1] — x\n\n- [t-1] task\n`,
  ];
  for (const plan of bad) {
    expect(() => parsePlan(plan)).toThrow(/not a valid kebab-case identifier/);
  }
});

test('parsePlan: errors on multiple "## Phases" sections', () => {
  const plan = `## Phases

### Phase 1 [p-1] — A

#### Batch 1 [b-1] — Batch

- [t-1] Task

## Phases

### Phase 2 [p-2] — B
`;
  expect(() => parsePlan(plan)).toThrow(/multiple "## Phases" sections/);
});

test('parsePlan: tolerates both em-dash and hyphen separator in headings', () => {
  const plan = `## Phases

### Phase 1 [p-1] - Hyphen separator

#### Batch 1 [b-1] - Also hyphen

- [t-1] Task
`;
  const parsed = parsePlan(plan);
  expect(parsed.phases[0]!.prose).toBe('Hyphen separator');
  expect(parsed.phases[0]!.batches[0]!.prose).toBe('Also hyphen');
});

test('parsePlan: captures prose body under Phase and Batch headings', () => {
  const plan = `## Phases

### Phase 1 [p-1] — Title

Phase-level prose paragraph.

Spanning multiple lines.

#### Batch 1 [b-1] — Batch

Batch-level prose.

- [t-1] Task A
- [t-2] Task B
`;
  const parsed = parsePlan(plan);
  expect(parsed.phases[0]!.body).toBe(
    'Phase-level prose paragraph.\n\nSpanning multiple lines.',
  );
  expect(parsed.phases[0]!.batches[0]!.body).toBe('Batch-level prose.');
});

test('flattenPlan: walks tree in document order with composed_key per node', () => {
  const parsed = parsePlan(HAPPY_PLAN);
  const flat = flattenPlan(parsed);
  const keys = flat.map((n) => `${n.kind}:${n.composed_key}`);
  expect(keys.slice(0, 6)).toEqual([
    'phase:design-1',
    'batch:design-1.skeleton-1',
    'task:design-1.skeleton-1.decisions-1',
    'task:design-1.skeleton-1.sketch-1',
    'task:design-1.skeleton-1.open-q-1',
    'batch:design-1.grill-1',
  ]);
  // Sanity-check the total node count: 2 phases + 3 batches + 7 tasks = 12.
  expect(flat.length).toBe(12);
});

test('parsePlan: each parsed node carries its 1-based source line number', () => {
  const parsed = parsePlan(HAPPY_PLAN);

  // HAPPY_PLAN is a template literal where "# A Plan" is line 1.
  // "### Phase 1 [design-1] — DESIGN.md" sits on line 11.
  const phase1 = parsed.phases[0]!;
  expect(phase1.line).toBe(11);

  // "#### Batch 1 [skeleton-1] — Write skeleton" sits on line 15.
  const batch1 = phase1.batches[0]!;
  expect(batch1.line).toBe(15);

  // "- [decisions-1] Decision register" sits on line 19.
  const task1 = batch1.tasks[0]!;
  expect(task1.line).toBe(19);

  // Sanity: line numbers are strictly increasing in document order.
  expect(phase1.line).toBeLessThan(batch1.line);
  expect(batch1.line).toBeLessThan(task1.line);
});

test('flattenPlan: propagates line number onto FlatNode', () => {
  const parsed = parsePlan(HAPPY_PLAN);
  const flat = flattenPlan(parsed);
  const phase1 = flat.find((n) => n.composed_key === 'design-1');
  const batch1 = flat.find((n) => n.composed_key === 'design-1.skeleton-1');
  const task1 = flat.find(
    (n) => n.composed_key === 'design-1.skeleton-1.decisions-1',
  );
  expect(phase1?.line).toBe(11);
  expect(batch1?.line).toBe(15);
  expect(task1?.line).toBe(19);
});

test('parsePlan: LinearLoomError carries plan-parse-failed code', () => {
  expect.assertions(2);
  try {
    parsePlan('## Phases\n\n### Phase 1 [BAD-ID] — x\n');
  } catch (err) {
    expect(err).toBeInstanceOf(LinearLoomError);
    expect((err as LinearLoomError).code).toBe('plan-parse-failed');
  }
});
