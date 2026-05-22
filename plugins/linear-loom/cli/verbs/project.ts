import { parseArgs } from 'node:util';
import { LinearClient } from '../lib/linear-client.ts';
import { resolveAuth } from '../lib/auth.ts';
import { LinearLoomError } from '../lib/errors.ts';
import {
  type LinearMarker,
  type MarkerIO,
  labelForSlug,
  markerExists,
  markerPath,
  readMarker,
  writeMarker,
} from '../lib/marker.ts';

// `project` namespace verbs.
//
// `create`  (U2): bootstrap a loom-project's per-slug binding to a
//                 Linear Project. Verifies project exists, creates
//                 workspace-scoped loom-project:<slug> label, writes
//                 marker at projects/<slug>/linear.json.
// `read`    (U3): reads the marker + queries Linear; emits a
//                 loom-compatible JSON shape (DESIGN.md § 19 output
//                 contract). Schema at contracts/project-read.schema.json.
// `status`  (U4): operator-facing summary of active phase + recent
//                 Sub-Issue activity.

export interface ProjectContext {
  client?: LinearClient;
  resolveAuthFn?: typeof resolveAuth;
  projectsRoot?: string;
  markerIO?: MarkerIO;
  now?: () => string;
}

export interface DispatchResult {
  stdout?: string;
  stderr?: string;
  exitCode: number;
}

interface LinearProjectQueryResult {
  project: { id: string; name: string } | null;
}

interface LinearLabelLookupResult {
  issueLabels: {
    nodes: Array<{ id: string; name: string }>;
  };
}

interface LinearLabelCreateResult {
  issueLabelCreate: {
    success: boolean;
    issueLabel: { id: string; name: string } | null;
  };
}

const PROJECT_QUERY = `
  query LinearLoomProjectCreateLookup($id: String!) {
    project(id: $id) {
      id
      name
    }
  }
`;

const LABEL_LOOKUP_QUERY = `
  query LinearLoomLabelLookup($name: String!) {
    issueLabels(filter: { name: { eq: $name } }) {
      nodes {
        id
        name
      }
    }
  }
`;

const LABEL_CREATE_MUTATION = `
  mutation LinearLoomLabelCreate($name: String!) {
    issueLabelCreate(input: { name: $name }) {
      success
      issueLabel {
        id
        name
      }
    }
  }
`;

export async function projectCreate(
  rest: string[],
  ctx: ProjectContext = {},
): Promise<DispatchResult> {
  const { values, positionals } = parseArgs({
    args: rest,
    options: {
      'linear-project': { type: 'string' as const },
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
        'project create requires a positional <slug> argument.',
        { namespace: 'project', verb: 'create' },
      ),
    );
  }

  const linearProjectId = values['linear-project'];
  if (typeof linearProjectId !== 'string' || linearProjectId.trim() === '') {
    return errToResult(
      new LinearLoomError(
        'missing-linear-project',
        'project create requires --linear-project=<id> (no defaults; see DESIGN.md § 4).',
        { namespace: 'project', verb: 'create' },
      ),
    );
  }

  const projectsRoot = ctx.projectsRoot ?? 'projects';
  const target = markerPath(slug.trim(), projectsRoot);

  if (markerExists(target, ctx.markerIO)) {
    return errToResult(
      new LinearLoomError(
        'project-already-exists',
        `Marker already exists at ${target}. linear-loom project create is non-destructive — delete the marker manually or use a different slug to recreate.`,
        { namespace: 'project', verb: 'create' },
      ),
    );
  }

  let authResolution;
  try {
    authResolution = (ctx.resolveAuthFn ?? resolveAuth)();
  } catch (err) {
    return errToResult(err);
  }

  const client =
    ctx.client ?? new LinearClient({ apiKey: authResolution.apiKey });

  let projectResult: LinearProjectQueryResult;
  try {
    projectResult = await client.query<LinearProjectQueryResult>(
      PROJECT_QUERY,
      { id: linearProjectId.trim() },
    );
  } catch (err) {
    return errToResult(err);
  }

  if (projectResult.project === null) {
    return errToResult(
      new LinearLoomError(
        'linear-project-not-found',
        `No Linear Project with ID ${linearProjectId.trim()}.`,
        { namespace: 'project', verb: 'create' },
      ),
    );
  }

  const labelName = labelForSlug(slug.trim());

  let labelResult: { id: string; name: string; created: boolean };
  try {
    const lookup = await client.query<LinearLabelLookupResult>(
      LABEL_LOOKUP_QUERY,
      { name: labelName },
    );
    const existing = lookup.issueLabels.nodes.find(
      (n) => n.name === labelName,
    );
    if (existing !== undefined) {
      labelResult = { id: existing.id, name: existing.name, created: false };
    } else {
      const created = await client.query<LinearLabelCreateResult>(
        LABEL_CREATE_MUTATION,
        { name: labelName },
      );
      if (
        created.issueLabelCreate.success !== true ||
        created.issueLabelCreate.issueLabel === null
      ) {
        throw new LinearLoomError(
          'label-create-failed',
          `Linear API reported issueLabelCreate.success=false for ${labelName}.`,
        );
      }
      labelResult = {
        id: created.issueLabelCreate.issueLabel.id,
        name: created.issueLabelCreate.issueLabel.name,
        created: true,
      };
    }
  } catch (err) {
    return errToResult(err);
  }

  const marker: LinearMarker = {
    schema_version: 1,
    slug: slug.trim(),
    linear_project_id: projectResult.project.id,
    linear_project_name: projectResult.project.name,
    label: labelName,
    created: (ctx.now ?? defaultNow)(),
  };

  try {
    writeMarker(target, marker, ctx.markerIO);
  } catch (err) {
    return errToResult(
      new LinearLoomError(
        'marker-write-failed',
        `Could not write marker to ${target}: ${(err as Error).message}`,
        { namespace: 'project', verb: 'create' },
      ),
    );
  }

  return {
    stdout: emit(
      {
        marker_path: target,
        marker,
        label: {
          id: labelResult.id,
          name: labelResult.name,
          created: labelResult.created,
        },
        auth_source: authResolution.source,
      },
      values.pretty === true,
    ),
    exitCode: 0,
  };
}

interface LinearProjectReadResult {
  project: {
    id: string;
    name: string;
    url: string;
    projectMilestones: {
      nodes: Array<{
        id: string;
        name: string;
        sortOrder: number;
        state: string | null;
        targetDate: string | null;
      }>;
    };
  } | null;
}

const PROJECT_READ_QUERY = `
  query LinearLoomProjectRead($id: String!) {
    project(id: $id) {
      id
      name
      url
      projectMilestones {
        nodes {
          id
          name
          sortOrder
          state
          targetDate
        }
      }
    }
  }
`;

// Phase parse: matches "<slug> · Phase N — <name>" or
// "<slug> · Phase N - <name>" (different dash glyphs operators
// might type). The slug prefix is enforced so loom-project's
// milestones don't collide with other loom-projects under the same
// Linear Project (DESIGN.md § 5 + § 6).
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

// Status mapping (DESIGN.md § 11: Linear Milestone state is the
// source of truth). Linear's projectMilestone.state is a string
// field with values that map cleanly to loom's three-state phase
// status. Unknown values pass through as `unknown` so the operator
// sees them rather than getting silently normalized.
function mapMilestoneStateToPhaseStatus(state: string | null): string {
  if (state === null) return 'unknown';
  switch (state.toLowerCase()) {
    case 'backlog':
    case 'unstarted':
    case 'planned':
      return 'not-started';
    case 'started':
    case 'in_progress':
    case 'in-progress':
      return 'in-progress';
    case 'completed':
    case 'done':
      return 'completed';
    case 'canceled':
    case 'cancelled':
      return 'canceled';
    default:
      return 'unknown';
  }
}

export async function projectRead(
  rest: string[],
  ctx: ProjectContext = {},
): Promise<DispatchResult> {
  const { values, positionals } = parseArgs({
    args: rest,
    options: {
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
        'project read requires a positional <slug> argument.',
        { namespace: 'project', verb: 'read' },
      ),
    );
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

  let queryResult: LinearProjectReadResult;
  try {
    queryResult = await client.query<LinearProjectReadResult>(
      PROJECT_READ_QUERY,
      { id: marker.linear_project_id },
    );
  } catch (err) {
    return errToResult(err);
  }

  if (queryResult.project === null) {
    return errToResult(
      new LinearLoomError(
        'linear-project-not-found',
        `No Linear Project with ID ${marker.linear_project_id} (the marker may point at a deleted Project, or the API key cannot see it).`,
        { namespace: 'project', verb: 'read' },
      ),
    );
  }

  const project = queryResult.project;
  const phases = project.projectMilestones.nodes
    .map((milestone) => {
      const parsed = parsePhaseFromMilestoneName(milestone.name, marker.slug);
      if (parsed === null) return null;
      return {
        number: parsed.number,
        name: parsed.name,
        status: mapMilestoneStateToPhaseStatus(milestone.state),
        linear_milestone_id: milestone.id,
        ...(milestone.targetDate !== null
          ? { target_date: milestone.targetDate }
          : {}),
      };
    })
    .filter(
      (entry): entry is Exclude<typeof entry, null> => entry !== null,
    )
    .sort((a, b) => a.number - b.number);

  const output = {
    schema_version: 1,
    slug: marker.slug,
    title: project.name,
    started: marker.created,
    status: 'active',
    linear: {
      project_id: project.id,
      project_name: project.name,
      project_url: project.url,
    },
    phases,
  };

  return {
    stdout: emit(output, values.pretty === true),
    exitCode: 0,
  };
}

export const PROJECT_VERBS: Record<
  string,
  (rest: string[], ctx?: ProjectContext) => Promise<DispatchResult>
> = {
  create: projectCreate,
  read: projectRead,
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

function defaultNow(): string {
  return new Date().toISOString();
}
