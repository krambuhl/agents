import { parseArgs } from 'node:util';
import { LinearClient } from '../lib/linear-client.ts';
import { resolveAuth } from '../lib/auth.ts';
import { LinearLoomError } from '../lib/errors.ts';
import {
  type LinearMarker,
  type MarkerIO,
  markerPath,
  readMarker,
} from '../lib/marker.ts';
import {
  mapPhaseStatusToLinearState,
  updateMilestoneState,
} from '../lib/milestones.ts';

// `linear-loom phase update <slug> --phase=N --status=<loom-status>`
// — DESIGN.md § 11.
//
// Transitions the Linear ProjectMilestone whose name parses as
// `<slug> · Phase N — <prose>` to a new state, mapping the loom-side
// PhaseStatus to Linear's ProjectMilestone state enum.
//
// One mutation, one milestone — no bulk operations on underlying
// Issues. § 11 names Linear Milestone state as the source-of-truth
// for phase status, and this verb is the write surface for that
// authority.

export interface PhaseContext {
  client?: LinearClient;
  resolveAuthFn?: typeof resolveAuth;
  projectsRoot?: string;
  markerIO?: MarkerIO;
}

export interface DispatchResult {
  stdout?: string;
  stderr?: string;
  exitCode: number;
}

interface ProjectMilestonesQueryResult {
  project: {
    id: string;
    projectMilestones: {
      nodes: Array<{
        id: string;
        name: string;
        state: string | null;
      }>;
    };
  } | null;
}

const PROJECT_MILESTONES_QUERY = `
  query LinearLoomPhaseUpdateMilestones($id: String!) {
    project(id: $id) {
      id
      projectMilestones {
        nodes {
          id
          name
          state
        }
      }
    }
  }
`;

// Duplicate of verbs/project.ts:286-302's parsePhaseFromMilestoneName.
// Canonical composer lives in verbs/tasks.ts:206-214 — if the
// "<slug> · Phase N — <prose>" naming convention changes there, both
// parsers need a matching update. Substrate-fix: extract to a shared
// lib/phase-naming.ts when a third caller emerges.
function parsePhaseFromMilestoneName(
  milestoneName: string,
  slug: string,
): { number: number; name: string } | null {
  const prefix = `${slug} · `;
  if (!milestoneName.startsWith(prefix)) return null;
  const rest = milestoneName.slice(prefix.length);
  const match = /^Phase\s+(\d+)\s*[—-]\s*(.+)$/.exec(rest);
  if (match === null) return null;
  const numberStr = match[1];
  const namePart = match[2];
  if (numberStr === undefined || namePart === undefined) return null;
  return {
    number: Number.parseInt(numberStr, 10),
    name: namePart.trim(),
  };
}

export async function phaseUpdate(
  rest: string[],
  ctx: PhaseContext = {},
): Promise<DispatchResult> {
  const { values, positionals } = parseArgs({
    args: rest,
    options: {
      phase: { type: 'string' as const },
      status: { type: 'string' as const },
      pretty: { type: 'boolean' as const },
    },
    allowPositionals: true,
    strict: false,
  });

  const slug = positionals[0];
  if (typeof slug !== 'string' || slug.trim() === '') {
    return errToResult(
      new LinearLoomError(
        'missing-slug',
        'phase update requires a positional <slug> argument.',
        { namespace: 'phase', verb: 'update' },
      ),
    );
  }

  const phaseArg = values.phase;
  if (typeof phaseArg !== 'string' || phaseArg.trim() === '') {
    return errToResult(
      new LinearLoomError(
        'missing-phase-number',
        'phase update requires --phase=<N> (an integer matching a Phase milestone in Linear).',
        { namespace: 'phase', verb: 'update' },
      ),
    );
  }
  const phaseNumber = Number.parseInt(phaseArg.trim(), 10);
  if (!Number.isInteger(phaseNumber) || phaseNumber <= 0) {
    return errToResult(
      new LinearLoomError(
        'invalid-phase-number',
        `phase update --phase="${phaseArg}" is not a positive integer.`,
        { namespace: 'phase', verb: 'update' },
      ),
    );
  }

  const loomStatus = values.status;
  if (typeof loomStatus !== 'string' || loomStatus.trim() === '') {
    return errToResult(
      new LinearLoomError(
        'missing-status',
        'phase update requires --status=<loom-status> (one of: not-started | in-progress | completed | canceled).',
        { namespace: 'phase', verb: 'update' },
      ),
    );
  }

  // Map first — fail fast on unrecognized status before any Linear
  // round-trip.
  let linearState: string;
  try {
    linearState = mapPhaseStatusToLinearState(loomStatus.trim());
  } catch (err) {
    return errToResult(err);
  }

  const projectsRoot = ctx.projectsRoot ?? 'projects';
  const target = markerPath(slug.trim(), projectsRoot);

  let marker: LinearMarker;
  try {
    marker = readMarker(target, ctx.markerIO);
  } catch (err) {
    return errToResult(err);
  }

  let authResolution;
  try {
    authResolution = (ctx.resolveAuthFn ?? resolveAuth)();
  } catch (err) {
    return errToResult(err);
  }

  const client =
    ctx.client ?? new LinearClient({ apiKey: authResolution.apiKey });

  let queryResult: ProjectMilestonesQueryResult;
  try {
    queryResult = await client.query<ProjectMilestonesQueryResult>(
      PROJECT_MILESTONES_QUERY,
      { id: marker.linear_project_id },
    );
  } catch (err) {
    return errToResult(err);
  }

  if (queryResult.project === null) {
    return errToResult(
      new LinearLoomError(
        'linear-project-not-found',
        `No Linear Project with ID ${marker.linear_project_id} (from linear.json marker).`,
        { namespace: 'phase', verb: 'update' },
      ),
    );
  }

  let targetMilestone: { id: string; name: string; state: string | null; phaseName: string } | null = null;
  for (const m of queryResult.project.projectMilestones.nodes) {
    const parsed = parsePhaseFromMilestoneName(m.name, marker.slug);
    if (parsed === null) continue;
    if (parsed.number === phaseNumber) {
      targetMilestone = {
        id: m.id,
        name: m.name,
        state: m.state,
        phaseName: parsed.name,
      };
      break;
    }
  }

  if (targetMilestone === null) {
    return errToResult(
      new LinearLoomError(
        'phase-not-found',
        `No Linear ProjectMilestone matching "${marker.slug} · Phase ${phaseNumber} — *" under loom-project ${marker.slug}. Re-run linear-loom tasks generate --apply if the Phase is new.`,
        { namespace: 'phase', verb: 'update' },
      ),
    );
  }

  const stateBefore = targetMilestone.state;

  let updated;
  try {
    updated = await updateMilestoneState({
      client,
      milestoneId: targetMilestone.id,
      state: linearState,
    });
  } catch (err) {
    return errToResult(err);
  }

  return {
    stdout: emit(
      {
        slug: marker.slug,
        phase: {
          number: phaseNumber,
          name: targetMilestone.phaseName,
          milestone_id: targetMilestone.id,
        },
        status: {
          before: stateBefore,
          after: updated.state,
          requested_loom: loomStatus.trim(),
          requested_linear: linearState,
        },
      },
      values.pretty === true,
    ),
    exitCode: 0,
  };
}

export const PHASE_VERBS: Record<
  string,
  (rest: string[], ctx?: PhaseContext) => Promise<DispatchResult>
> = {
  update: phaseUpdate,
};

function emit(value: unknown, pretty: boolean): string {
  return pretty ? JSON.stringify(value, null, 2) : JSON.stringify(value);
}

function errToResult(err: unknown): DispatchResult {
  if (err instanceof LinearLoomError) {
    return {
      stderr: `${JSON.stringify(err.toPayload())}\n`,
      exitCode: 1,
    };
  }
  throw err;
}
