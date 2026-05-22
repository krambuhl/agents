import type { ParsedPlan } from './plan-parser.ts';
import { flattenPlan, type FlatNode } from './plan-parser.ts';
import type { LinearState } from './linear-state.ts';

// PLAN.md ↔ Linear diff (DESIGN.md § 12.3).
//
// Reconciliation policy: PLAN.md is authoritative. Each parsed node
// matches against Linear by composed key. The diff emits four op
// shapes:
//
//   create: composed key in PLAN.md but not in Linear → ship a new
//           Milestone / Issue / Sub-Issue.
//   update: composed key in both, title or body differs → update
//           the existing Linear item's title + body.
//   rekey:  PLAN.md node carries `was=<old-id>` and the old composed
//           key is in Linear → re-key the Linear record + apply any
//           title/body update in the same op.
//   archive: composed key in Linear but not in PLAN.md → archive
//           the orphan. § 12.4's in-flight safety lives in the
//           generate verb (U3); plan-diff just emits the op.
//
// noop: composed key in both, title + body match → emitted only if
// the caller passes `include_noops: true`, otherwise omitted.
//
// Pure transformation; no I/O.

export type DiffOpKind = 'create' | 'update' | 'rekey' | 'archive' | 'noop';

export interface DiffOpCreate {
  kind: 'create';
  node_kind: 'phase' | 'batch' | 'task';
  composed_key: string;
  title: string;
  body: string;
  parent_composed_key: string | undefined;
}

export interface DiffOpUpdate {
  kind: 'update';
  node_kind: 'phase' | 'batch' | 'task';
  composed_key: string;
  linear_id: string;
  title_before: string;
  title_after: string;
  body_changed: boolean;
}

export interface DiffOpRekey {
  kind: 'rekey';
  node_kind: 'phase' | 'batch' | 'task';
  linear_id: string;
  old_composed_key: string;
  new_composed_key: string;
  title_changed: boolean;
  body_changed: boolean;
}

export interface DiffOpArchive {
  kind: 'archive';
  node_kind: 'phase' | 'batch' | 'task';
  linear_id: string;
  composed_key: string;
  state_type: string | undefined;
}

export interface DiffOpNoop {
  kind: 'noop';
  node_kind: 'phase' | 'batch' | 'task';
  composed_key: string;
  linear_id: string;
}

export type DiffOp =
  | DiffOpCreate
  | DiffOpUpdate
  | DiffOpRekey
  | DiffOpArchive
  | DiffOpNoop;

export interface DiffArgs {
  plan: ParsedPlan;
  linear: LinearState;
  slug: string;
  // When include_noops is false, ops with no work (composed key in
  // both, title + body identical) are omitted. Default false; the
  // generate verb uses false so its summary only lists real work.
  include_noops?: boolean;
  // Title/body composers: given a FlatNode, return the
  // Linear-side title and the Linear-side body. Tests inject
  // simple identity functions; production wires the slug-prefixed
  // title + composeLinearDescription combo.
  composeTitle: (node: FlatNode, slug: string) => string;
  composeBody: (node: FlatNode) => string;
}

export function computeDiff(args: DiffArgs): DiffOp[] {
  const ops: DiffOp[] = [];
  const parsedFlat = flattenPlan(args.plan);
  const includeNoops = args.include_noops ?? false;

  // Build a quick parent-composed-key lookup so create ops can
  // surface the parent for the apply step (U3 needs the parent's
  // Linear ID to attach the new Linear item to it).
  const parentByComposedKey = new Map<string, string>();
  for (const phase of args.plan.phases) {
    parentByComposedKey.set(phase.composed_key, '');
    for (const batch of phase.batches) {
      parentByComposedKey.set(batch.composed_key, phase.composed_key);
      for (const task of batch.tasks) {
        parentByComposedKey.set(task.composed_key, batch.composed_key);
      }
    }
  }

  // Track which Linear-side composed keys we've matched so the
  // unmatched ones can become archive ops.
  const matchedLinearKeys = new Set<string>();

  for (const planNode of parsedFlat) {
    const expectedTitle = args.composeTitle(planNode, args.slug);
    const expectedBody = args.composeBody(planNode);
    const parentComposedKey = parentByComposedKey.get(planNode.composed_key);
    const parentForCreate =
      parentComposedKey === '' ? undefined : parentComposedKey;

    // Rename path: PLAN.md node carries `was=<old-id>`. The composed
    // key recorded in Linear is the OLD composed key (it was created
    // when the old ID was current), so we look that up.
    if (planNode.was !== undefined) {
      const oldComposedKey = composedKeyWithSubstitution(
        planNode.composed_key,
        planNode.id,
        planNode.was,
      );
      const oldLinearNode = args.linear.by_composed_key.get(oldComposedKey);
      if (oldLinearNode !== undefined) {
        matchedLinearKeys.add(oldComposedKey);
        const titleChanged = oldLinearNode.title !== expectedTitle;
        const bodyChanged = oldLinearNode.description !== expectedBody;
        ops.push({
          kind: 'rekey',
          node_kind: planNode.kind,
          linear_id: oldLinearNode.linear_id,
          old_composed_key: oldComposedKey,
          new_composed_key: planNode.composed_key,
          title_changed: titleChanged,
          body_changed: bodyChanged,
        });
        continue;
      }
      // No Linear record at the old composed key — fall through to
      // create-or-update via the new composed key. The `was=`
      // annotation was harmless extra metadata.
    }

    const linearNode = args.linear.by_composed_key.get(planNode.composed_key);
    if (linearNode === undefined) {
      ops.push({
        kind: 'create',
        node_kind: planNode.kind,
        composed_key: planNode.composed_key,
        title: expectedTitle,
        body: expectedBody,
        parent_composed_key: parentForCreate,
      });
      continue;
    }

    matchedLinearKeys.add(planNode.composed_key);
    const titleSame = linearNode.title === expectedTitle;
    const bodySame = linearNode.description === expectedBody;
    if (titleSame && bodySame) {
      if (includeNoops) {
        ops.push({
          kind: 'noop',
          node_kind: planNode.kind,
          composed_key: planNode.composed_key,
          linear_id: linearNode.linear_id,
        });
      }
      continue;
    }
    ops.push({
      kind: 'update',
      node_kind: planNode.kind,
      composed_key: planNode.composed_key,
      linear_id: linearNode.linear_id,
      title_before: linearNode.title,
      title_after: expectedTitle,
      body_changed: !bodySame,
    });
  }

  // Archive sweep: any Linear-side composed key we haven't matched
  // is an orphan. § 12.4's in-flight safety is the generate verb's
  // (U3's) call to apply or defer.
  for (const [composedKey, linearNode] of args.linear.by_composed_key) {
    if (matchedLinearKeys.has(composedKey)) continue;
    ops.push({
      kind: 'archive',
      node_kind: linearNode.kind,
      linear_id: linearNode.linear_id,
      composed_key: composedKey,
      state_type: linearNode.state_type,
    });
  }

  return ops;
}

// Given a node's full composed key and the `was` substitution,
// compute the old composed key by swapping the leaf id. Example:
// composed_key = "design-1.skeleton-1.architecture-1", id =
// "architecture-1", was = "sketch-1" →
// "design-1.skeleton-1.sketch-1".
function composedKeyWithSubstitution(
  composedKey: string,
  currentLeafId: string,
  oldLeafId: string,
): string {
  // Composed key always ends with the leaf id (the node's own id).
  // Replace only that final segment.
  const idx = composedKey.lastIndexOf(currentLeafId);
  if (idx === -1) return composedKey;
  const prefix = composedKey.slice(0, idx);
  return `${prefix}${oldLeafId}`;
}

// Summary helpers — convenient for U3's report and for testing.
export interface DiffSummary {
  create: number;
  update: number;
  rekey: number;
  archive: number;
  noop: number;
  total_ops: number;
}

export function summarizeDiff(ops: DiffOp[]): DiffSummary {
  const summary: DiffSummary = {
    create: 0,
    update: 0,
    rekey: 0,
    archive: 0,
    noop: 0,
    total_ops: ops.length,
  };
  for (const op of ops) {
    summary[op.kind] += 1;
  }
  return summary;
}

// Partition archive ops by whether they look in-flight (state.type
// other than backlog/unstarted). The generate verb consumes this to
// gate § 12.4's --prune flag.
export interface ArchivePartition {
  safe_to_archive: DiffOpArchive[];
  in_flight: DiffOpArchive[];
}

export function partitionArchiveOps(ops: DiffOp[]): ArchivePartition {
  const safe: DiffOpArchive[] = [];
  const inFlight: DiffOpArchive[] = [];
  for (const op of ops) {
    if (op.kind !== 'archive') continue;
    // Phase = Milestone has no state.type in our model (Milestones
    // don't have workflow state in the same way Issues do). Treat
    // phase archives as safe by default.
    if (op.state_type === undefined) {
      safe.push(op);
      continue;
    }
    if (op.state_type === 'backlog' || op.state_type === 'unstarted') {
      safe.push(op);
    } else {
      inFlight.push(op);
    }
  }
  return { safe_to_archive: safe, in_flight: inFlight };
}
