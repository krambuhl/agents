import { LinearClient } from './linear-client.ts';
import { LinearLoomError } from './errors.ts';

// Linear-side state fetch for `linear-loom tasks generate`.
//
// Given a Linear Project ID + the loom-project's identity label,
// fetches Milestones (= Phases), Issues (= Batches), and
// Sub-Issues (= Tasks) and parses each one's `**Composed key**: ...`
// header to derive its stable identity (DESIGN.md § 12.2).
//
// The output is a flat map from composed-key → LinearStateNode so
// the diff step (plan-diff.ts) can match by composed key without
// caring about Linear's API response shape.

export type LinearStateKind = 'phase' | 'batch' | 'task';

export interface LinearStateNode {
  composed_key: string;
  kind: LinearStateKind;
  linear_id: string;
  title: string;
  description: string;
  state_type: string | undefined;
  parent_linear_id: string | undefined;
}

export interface LinearState {
  by_composed_key: Map<string, LinearStateNode>;
  unkeyed: LinearStateNode[];
}

interface LinearTasksStateResult {
  project: {
    id: string;
    projectMilestones: {
      nodes: Array<{
        id: string;
        name: string;
        description: string | null;
      }>;
    };
  } | null;
  issues: {
    nodes: Array<{
      id: string;
      title: string;
      description: string | null;
      parent: { id: string } | null;
      projectMilestone: { id: string } | null;
      state: { type: string };
    }>;
  };
}

const TASKS_STATE_QUERY = `
  query LinearLoomTasksState($projectId: String!, $labelName: String!) {
    project(id: $projectId) {
      id
      projectMilestones {
        nodes {
          id
          name
          description
        }
      }
    }
    issues(
      filter: { labels: { name: { eq: $labelName } } }
      first: 250
    ) {
      nodes {
        id
        title
        description
        parent {
          id
        }
        projectMilestone {
          id
        }
        state {
          type
        }
      }
    }
  }
`;

const COMPOSED_KEY_LINE = /^\*\*Composed key\*\*:\s*([a-z0-9](?:[a-z0-9.\-]*[a-z0-9])?)\s*$/m;

// Exported so the diff step + tests can read composed keys from a
// raw description string without re-running the regex.
export function parseComposedKey(description: string | null): string | undefined {
  if (description === null || description === '') return undefined;
  const match = COMPOSED_KEY_LINE.exec(description);
  if (match === null || match[1] === undefined) return undefined;
  return match[1];
}

export interface FetchLinearStateArgs {
  client: LinearClient;
  linearProjectId: string;
  labelName: string;
}

export async function fetchLinearState(
  args: FetchLinearStateArgs,
): Promise<LinearState> {
  const result = await args.client.query<LinearTasksStateResult>(
    TASKS_STATE_QUERY,
    { projectId: args.linearProjectId, labelName: args.labelName },
  );

  if (result.project === null) {
    throw new LinearLoomError(
      'linear-project-not-found',
      `No Linear Project with ID ${args.linearProjectId}.`,
    );
  }

  const byComposedKey = new Map<string, LinearStateNode>();
  const unkeyed: LinearStateNode[] = [];

  // Milestones → Phase candidates.
  for (const milestone of result.project.projectMilestones.nodes) {
    const node: LinearStateNode = {
      composed_key: '',
      kind: 'phase',
      linear_id: milestone.id,
      title: milestone.name,
      description: milestone.description ?? '',
      state_type: undefined,
      parent_linear_id: undefined,
    };
    const key = parseComposedKey(milestone.description);
    if (key === undefined) {
      // Milestone with no composed-key header — ignore. Either
      // operator-created Milestone unrelated to linear-loom, or a
      // Milestone created before this plugin's identity scheme
      // landed.
      unkeyed.push(node);
      continue;
    }
    node.composed_key = key;
    byComposedKey.set(key, node);
  }

  // Issues → Batch or Task candidates. parent === null → Batch
  // (top-level Issue under a Milestone); parent !== null → Task
  // (Sub-Issue under an Issue).
  for (const issue of result.issues.nodes) {
    const kind: LinearStateKind = issue.parent === null ? 'batch' : 'task';
    const node: LinearStateNode = {
      composed_key: '',
      kind,
      linear_id: issue.id,
      title: issue.title,
      description: issue.description ?? '',
      state_type: issue.state.type,
      parent_linear_id:
        issue.parent !== null
          ? issue.parent.id
          : issue.projectMilestone !== null
            ? issue.projectMilestone.id
            : undefined,
    };
    const key = parseComposedKey(issue.description);
    if (key === undefined) {
      unkeyed.push(node);
      continue;
    }
    node.composed_key = key;
    byComposedKey.set(key, node);
  }

  return { by_composed_key: byComposedKey, unkeyed };
}

// Build the standard linear-loom Linear-side description body
// (DESIGN.md § 13 + the composed-key extension). The first three
// header lines are machine-parseable; the body that follows is the
// prose from PLAN.md.
export interface LinearDescriptionContext {
  composed_key: string;
  source_url: string;
  synced_at: string;
}

export function composeLinearDescription(
  ctx: LinearDescriptionContext,
  proseBody: string,
): string {
  return [
    `**Composed key**: ${ctx.composed_key}`,
    `**Source**: ${ctx.source_url}`,
    `**Last synced**: ${ctx.synced_at}`,
    '',
    '---',
    '',
    proseBody,
  ].join('\n');
}
