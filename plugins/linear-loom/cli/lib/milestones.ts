import { LinearClient } from './linear-client.ts';
import { LinearLoomError } from './errors.ts';

// Linear ProjectMilestone state-write lib.
//
// The `linear-loom phase update` verb (DESIGN.md § 11) transitions a
// Linear ProjectMilestone's state by composed-key-resolved phase
// number. § 11 names Linear as the source-of-truth for phase status,
// so this is the write surface for that authority.
//
// Linear's ProjectMilestoneUpdateInput exposes `state` as a string
// field with a fixed enum (backlog | planned | started | paused |
// completed | canceled). If a future Linear schema change rejects
// the write, we surface the API error rather than silently
// degrading — explicit failure is better than ambiguous partial
// success.
//
// Loom's PhaseStatus (`not-started | in-progress | blocked |
// completed`) doesn't map cleanly onto Linear's enum in every case
// — `blocked` has no clean analog. mapPhaseStatusToLinearState
// throws `status-not-mappable` for `blocked` and any unrecognized
// value; operators wanting "blocked" semantics use a Linear label
// or comment instead.

interface LinearMilestoneUpdateResult {
  projectMilestoneUpdate: {
    success: boolean;
    projectMilestone: {
      id: string;
      name: string;
      state: string | null;
    } | null;
  };
}

const MILESTONE_UPDATE_MUTATION = `
  mutation LinearLoomPhaseUpdateMilestoneState($id: String!, $input: ProjectMilestoneUpdateInput!) {
    projectMilestoneUpdate(id: $id, input: $input) {
      success
      projectMilestone {
        id
        name
        state
      }
    }
  }
`;

export interface UpdateMilestoneStateArgs {
  client: LinearClient;
  milestoneId: string;
  state: string;
}

export interface UpdatedMilestone {
  id: string;
  name: string;
  state: string | null;
}

export async function updateMilestoneState(
  args: UpdateMilestoneStateArgs,
): Promise<UpdatedMilestone> {
  const result = await args.client.query<LinearMilestoneUpdateResult>(
    MILESTONE_UPDATE_MUTATION,
    {
      id: args.milestoneId,
      input: { state: args.state },
    },
  );
  if (
    result.projectMilestoneUpdate.success !== true ||
    result.projectMilestoneUpdate.projectMilestone === null
  ) {
    throw new LinearLoomError(
      'milestone-update-failed',
      `Linear projectMilestoneUpdate reported success=false for milestone ${args.milestoneId} (state=${args.state}). Check that the Linear API key has Project-write permission and that the requested state is in Linear's accepted enum.`,
    );
  }
  const milestone = result.projectMilestoneUpdate.projectMilestone;
  return { id: milestone.id, name: milestone.name, state: milestone.state };
}

// Forward mapping: loom PhaseStatus → Linear ProjectMilestone state.
//
// Read-direction mapping lives in verbs/project.ts:
// mapMilestoneStateToPhaseStatus. The two are mirror inverses for
// the four overlapping values; `blocked` is loom-only with no Linear
// analog.
export function mapPhaseStatusToLinearState(status: string): string {
  switch (status) {
    case 'not-started':
      return 'planned';
    case 'in-progress':
      return 'started';
    case 'completed':
      return 'completed';
    case 'canceled':
      return 'canceled';
    case 'blocked':
      throw new LinearLoomError(
        'status-not-mappable',
        `loom status "blocked" has no Linear ProjectMilestone state analog (Linear's enum: backlog | planned | started | paused | completed | canceled). Use a Linear label or comment to mark a phase as blocked instead.`,
      );
    default:
      throw new LinearLoomError(
        'status-not-mappable',
        `loom status "${status}" is not a recognized PhaseStatus. Accepted: not-started | in-progress | completed | canceled.`,
      );
  }
}
