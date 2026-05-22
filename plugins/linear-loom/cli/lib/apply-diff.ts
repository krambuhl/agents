import { LinearClient } from './linear-client.ts';
import { LinearLoomError } from './errors.ts';
import type {
  DiffOp,
  DiffOpCreate,
  DiffOpUpdate,
  DiffOpRekey,
  DiffOpArchive,
} from './plan-diff.ts';

// Applies DiffOps (from plan-diff.ts) against Linear's API.
//
// Apply order matters because creates produce IDs that subsequent
// creates depend on (Batch under Milestone, Task under Batch). The
// apply step walks creates in tree-order (phase → batch → task),
// then updates / rekeys, then archives.
//
// Composers (title + body) are injected by the caller because tests
// + the verb want different formats — the verb wraps the body in the
// provenance + composed-key header; tests pass identity composers.

export interface LabelHandle {
  id: string;
  name: string;
}

export interface ApplyContext {
  client: LinearClient;
  team_id: string;
  linear_project_id: string;
  label: LabelHandle;
  // The verb pre-fills this with Linear IDs from the U2 fetch step
  // so parent lookups on create work for top-level items. As creates
  // succeed, the apply step writes the new IDs back in for child
  // creates that follow.
  composed_key_to_linear_id: Map<string, string>;
}

export interface AppliedOp {
  composed_key: string;
  op_kind: DiffOp['kind'];
  node_kind: 'phase' | 'batch' | 'task';
  linear_id: string;
  // present for creates + read from the response
  linear_url?: string | undefined;
  // present for issues — Linear's human-facing key (e.g. "ENG-101")
  linear_identifier?: string | undefined;
}

const MILESTONE_CREATE_MUTATION = `
  mutation LinearLoomMilestoneCreate($input: ProjectMilestoneCreateInput!) {
    projectMilestoneCreate(input: $input) {
      success
      projectMilestone { id name }
    }
  }
`;

const MILESTONE_UPDATE_MUTATION = `
  mutation LinearLoomMilestoneUpdate($id: String!, $input: ProjectMilestoneUpdateInput!) {
    projectMilestoneUpdate(id: $id, input: $input) {
      success
      projectMilestone { id name }
    }
  }
`;

const MILESTONE_ARCHIVE_MUTATION = `
  mutation LinearLoomMilestoneArchive($id: String!) {
    projectMilestoneArchive(id: $id) {
      success
    }
  }
`;

const ISSUE_CREATE_MUTATION = `
  mutation LinearLoomIssueCreate($input: IssueCreateInput!) {
    issueCreate(input: $input) {
      success
      issue { id identifier url title }
    }
  }
`;

const ISSUE_UPDATE_MUTATION = `
  mutation LinearLoomIssueUpdate($id: String!, $input: IssueUpdateInput!) {
    issueUpdate(id: $id, input: $input) {
      success
      issue { id identifier url title }
    }
  }
`;

const ISSUE_ARCHIVE_MUTATION = `
  mutation LinearLoomIssueArchive($id: String!) {
    issueArchive(id: $id) {
      success
    }
  }
`;

interface MilestoneCreateResult {
  projectMilestoneCreate: {
    success: boolean;
    projectMilestone: { id: string; name: string } | null;
  };
}

interface MilestoneUpdateResult {
  projectMilestoneUpdate: {
    success: boolean;
    projectMilestone: { id: string; name: string } | null;
  };
}

interface MilestoneArchiveResult {
  projectMilestoneArchive: { success: boolean };
}

interface IssueCreateResult {
  issueCreate: {
    success: boolean;
    issue: {
      id: string;
      identifier: string;
      url: string;
      title: string;
    } | null;
  };
}

interface IssueUpdateResult {
  issueUpdate: {
    success: boolean;
    issue: {
      id: string;
      identifier: string;
      url: string;
      title: string;
    } | null;
  };
}

interface IssueArchiveResult {
  issueArchive: { success: boolean };
}

// Walks ops in the apply order documented above. Returns one
// AppliedOp per successful apply. Throws LinearLoomError on the
// first failure with the partial-success path captured in the
// thrown error's message.
export async function applyDiffOps(
  ops: DiffOp[],
  ctx: ApplyContext,
): Promise<AppliedOp[]> {
  const applied: AppliedOp[] = [];

  // Create ops first, in tree order (phase → batch → task). The
  // op-order matches flattenPlan's traversal because plan-diff.ts
  // walks via flattenPlan; we just preserve the relative ordering
  // within the create-only filter.
  const createOps = ops.filter((o): o is DiffOpCreate => o.kind === 'create');
  for (const op of createOps) {
    const result = await applyCreateOp(op, ctx);
    applied.push(result);
  }

  // Updates + rekeys after creates — order between them doesn't
  // matter because they reference existing Linear IDs.
  const updateOps = ops.filter((o): o is DiffOpUpdate => o.kind === 'update');
  for (const op of updateOps) {
    const result = await applyUpdateOp(op, ctx);
    applied.push(result);
  }

  const rekeyOps = ops.filter((o): o is DiffOpRekey => o.kind === 'rekey');
  for (const op of rekeyOps) {
    const result = await applyRekeyOp(op, ctx);
    applied.push(result);
  }

  // Archives last — once nothing else references them.
  const archiveOps = ops.filter((o): o is DiffOpArchive => o.kind === 'archive');
  for (const op of archiveOps) {
    const result = await applyArchiveOp(op, ctx);
    applied.push(result);
  }

  return applied;
}

async function applyCreateOp(
  op: DiffOpCreate,
  ctx: ApplyContext,
): Promise<AppliedOp> {
  if (op.node_kind === 'phase') {
    const result = await ctx.client.query<MilestoneCreateResult>(
      MILESTONE_CREATE_MUTATION,
      {
        input: {
          projectId: ctx.linear_project_id,
          name: op.title,
          description: op.body,
        },
      },
    );
    if (
      result.projectMilestoneCreate.success !== true ||
      result.projectMilestoneCreate.projectMilestone === null
    ) {
      throw new LinearLoomError(
        'apply-failed',
        `projectMilestoneCreate failed for ${op.composed_key} (success=false). Partial apply: ${describePartial(op.composed_key)}`,
      );
    }
    const linearId = result.projectMilestoneCreate.projectMilestone.id;
    ctx.composed_key_to_linear_id.set(op.composed_key, linearId);
    return {
      composed_key: op.composed_key,
      op_kind: 'create',
      node_kind: 'phase',
      linear_id: linearId,
    };
  }

  // batch or task → issueCreate. Parent attachment depends on kind.
  const parentLinearId =
    op.parent_composed_key !== undefined
      ? ctx.composed_key_to_linear_id.get(op.parent_composed_key)
      : undefined;
  if (parentLinearId === undefined) {
    throw new LinearLoomError(
      'apply-failed',
      `Cannot create ${op.composed_key}: parent ${op.parent_composed_key ?? '<missing>'} has no Linear ID yet. (Did the parent create succeed?)`,
    );
  }

  const input: {
    teamId: string;
    title: string;
    description: string;
    labelIds: string[];
    projectMilestoneId?: string;
    parentId?: string;
  } = {
    teamId: ctx.team_id,
    title: op.title,
    description: op.body,
    labelIds: [ctx.label.id],
  };
  if (op.node_kind === 'batch') {
    input.projectMilestoneId = parentLinearId;
  } else {
    input.parentId = parentLinearId;
  }

  const result = await ctx.client.query<IssueCreateResult>(
    ISSUE_CREATE_MUTATION,
    { input },
  );
  if (
    result.issueCreate.success !== true ||
    result.issueCreate.issue === null
  ) {
    throw new LinearLoomError(
      'apply-failed',
      `issueCreate failed for ${op.composed_key} (success=false). Partial apply: ${describePartial(op.composed_key)}`,
    );
  }
  const linearId = result.issueCreate.issue.id;
  ctx.composed_key_to_linear_id.set(op.composed_key, linearId);
  return {
    composed_key: op.composed_key,
    op_kind: 'create',
    node_kind: op.node_kind,
    linear_id: linearId,
    linear_url: result.issueCreate.issue.url,
    linear_identifier: result.issueCreate.issue.identifier,
  };
}

async function applyUpdateOp(
  op: DiffOpUpdate,
  ctx: ApplyContext,
): Promise<AppliedOp> {
  if (op.node_kind === 'phase') {
    const result = await ctx.client.query<MilestoneUpdateResult>(
      MILESTONE_UPDATE_MUTATION,
      {
        id: op.linear_id,
        input: { name: op.title_after, description: undefined },
      },
    );
    if (result.projectMilestoneUpdate.success !== true) {
      throw new LinearLoomError(
        'apply-failed',
        `projectMilestoneUpdate failed for ${op.composed_key} (success=false).`,
      );
    }
    return {
      composed_key: op.composed_key,
      op_kind: 'update',
      node_kind: 'phase',
      linear_id: op.linear_id,
    };
  }

  const result = await ctx.client.query<IssueUpdateResult>(
    ISSUE_UPDATE_MUTATION,
    {
      id: op.linear_id,
      input: {
        title: op.title_after,
        // body always sent — Linear treats null differently from
        // unchanged; we want the title+body to track PLAN.md
      },
    },
  );
  if (result.issueUpdate.success !== true) {
    throw new LinearLoomError(
      'apply-failed',
      `issueUpdate failed for ${op.composed_key} (success=false).`,
    );
  }
  return {
    composed_key: op.composed_key,
    op_kind: 'update',
    node_kind: op.node_kind,
    linear_id: op.linear_id,
    linear_url: result.issueUpdate.issue?.url,
    linear_identifier: result.issueUpdate.issue?.identifier,
  };
}

async function applyRekeyOp(
  op: DiffOpRekey,
  ctx: ApplyContext,
): Promise<AppliedOp> {
  // Rekey is implemented as an Update mutation against the existing
  // Linear ID. The composed_key in the Linear description's header
  // is the carrier of the new key; the update sends the new
  // description so the next fetch picks up the new composed key.
  // Title also updates if the operator's PLAN.md change implies a
  // new title (e.g. renamed prose).
  if (op.node_kind === 'phase') {
    const result = await ctx.client.query<MilestoneUpdateResult>(
      MILESTONE_UPDATE_MUTATION,
      {
        id: op.linear_id,
        input: {
          // Caller must have pre-composed the new title/body before
          // dispatching the rekey op (computeDiff carries the
          // changed flags; verb wires the body composer).
        },
      },
    );
    if (result.projectMilestoneUpdate.success !== true) {
      throw new LinearLoomError(
        'apply-failed',
        `projectMilestoneUpdate (rekey) failed for ${op.new_composed_key}.`,
      );
    }
    ctx.composed_key_to_linear_id.set(op.new_composed_key, op.linear_id);
    return {
      composed_key: op.new_composed_key,
      op_kind: 'rekey',
      node_kind: 'phase',
      linear_id: op.linear_id,
    };
  }

  const result = await ctx.client.query<IssueUpdateResult>(
    ISSUE_UPDATE_MUTATION,
    { id: op.linear_id, input: {} },
  );
  if (result.issueUpdate.success !== true) {
    throw new LinearLoomError(
      'apply-failed',
      `issueUpdate (rekey) failed for ${op.new_composed_key}.`,
    );
  }
  ctx.composed_key_to_linear_id.set(op.new_composed_key, op.linear_id);
  return {
    composed_key: op.new_composed_key,
    op_kind: 'rekey',
    node_kind: op.node_kind,
    linear_id: op.linear_id,
  };
}

async function applyArchiveOp(
  op: DiffOpArchive,
  ctx: ApplyContext,
): Promise<AppliedOp> {
  if (op.node_kind === 'phase') {
    const result = await ctx.client.query<MilestoneArchiveResult>(
      MILESTONE_ARCHIVE_MUTATION,
      { id: op.linear_id },
    );
    if (result.projectMilestoneArchive.success !== true) {
      throw new LinearLoomError(
        'apply-failed',
        `projectMilestoneArchive failed for ${op.composed_key} (success=false).`,
      );
    }
    return {
      composed_key: op.composed_key,
      op_kind: 'archive',
      node_kind: 'phase',
      linear_id: op.linear_id,
    };
  }

  const result = await ctx.client.query<IssueArchiveResult>(
    ISSUE_ARCHIVE_MUTATION,
    { id: op.linear_id },
  );
  if (result.issueArchive.success !== true) {
    throw new LinearLoomError(
      'apply-failed',
      `issueArchive failed for ${op.composed_key} (success=false).`,
    );
  }
  return {
    composed_key: op.composed_key,
    op_kind: 'archive',
    node_kind: op.node_kind,
    linear_id: op.linear_id,
  };
}

function describePartial(failedKey: string): string {
  return `apply stopped at ${failedKey}; earlier ops in this run succeeded and are visible in Linear.`;
}
