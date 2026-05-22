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
  writeMarker,
} from '../lib/marker.ts';

// `project` namespace verbs.
//
// `create` (this unit / U2): bootstrap a loom-project's per-slug
// binding to a Linear Project. Verifies the Linear Project exists,
// creates a workspace-scoped `loom-project:<slug>` label (idempotent
// — looks up existing first), writes the marker file at
// projects/<slug>/linear.json.
//
// `read` and `status` ship in U3 + U4 of Phase 3.

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

export const PROJECT_VERBS: Record<
  string,
  (rest: string[], ctx?: ProjectContext) => Promise<DispatchResult>
> = {
  create: projectCreate,
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
