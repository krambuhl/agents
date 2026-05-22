import { parseArgs } from 'node:util';
import { LinearClient } from '../lib/linear-client.ts';
import { resolveAuth } from '../lib/auth.ts';
import { LinearLoomError } from '../lib/errors.ts';

// `linear-loom configure --linear-project=<id>` — idempotent schema
// bootstrap (DESIGN.md § 10).
//
// v1 scope: validates auth and that the named Linear Project exists +
// is accessible. Labels, custom fields, and Document templates are
// underspec'd in DESIGN.md § 10 relative to what they map to in
// Linear's actual data model (the only label the system manages
// today is `loom-project:<name>`, and that's per-loom-project — owned
// by `project create`, not configure). The verb is therefore
// trivially idempotent in v1 because there's nothing per-Linear-
// Project to mutate yet. Future verbs that surface a real
// per-Linear-Project schema obligation (Document templates for
// research/plan/retro uploads in Phase 4, possibly) extend this verb
// rather than getting their own bootstrap.

export interface ConfigureContext {
  client?: LinearClient;
  resolveAuthFn?: typeof resolveAuth;
}

export interface DispatchResult {
  stdout?: string;
  stderr?: string;
  exitCode: number;
}

export interface ConfigureResult {
  linear_project: {
    id: string;
    name: string;
  };
  auth_source: 'env' | 'config-file';
  schema_version: 1;
  bootstrapped: {
    labels: 'deferred-no-system-managed-labels-at-configure-scope';
    custom_fields: 'none-in-v1';
    document_templates: 'deferred-to-phase-4-mirroring';
  };
}

interface LinearProjectQueryResult {
  project: { id: string; name: string } | null;
}

const PROJECT_QUERY = `
  query LinearLoomConfigureProjectLookup($id: String!) {
    project(id: $id) {
      id
      name
    }
  }
`;

export async function configure(
  rest: string[],
  ctx: ConfigureContext = {},
): Promise<DispatchResult> {
  const { values } = parseArgs({
    args: rest,
    options: {
      'linear-project': { type: 'string' as const },
      pretty: { type: 'boolean' as const },
    },
    allowPositionals: true,
    strict: false,
  });

  const linearProjectId = values['linear-project'];
  if (typeof linearProjectId !== 'string' || linearProjectId.trim() === '') {
    return errToResult(
      new LinearLoomError(
        'missing-linear-project',
        'configure requires --linear-project=<id> (no defaults; see DESIGN.md § 4).',
        { namespace: 'configure' },
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

  let queryResult: LinearProjectQueryResult;
  try {
    queryResult = await client.query<LinearProjectQueryResult>(PROJECT_QUERY, {
      id: linearProjectId.trim(),
    });
  } catch (err) {
    return errToResult(err);
  }

  if (queryResult.project === null) {
    return errToResult(
      new LinearLoomError(
        'linear-project-not-found',
        `No Linear Project with ID ${linearProjectId.trim()} (the key is wrong, the project does not exist, or the API key cannot see it).`,
        { namespace: 'configure' },
      ),
    );
  }

  const result: ConfigureResult = {
    linear_project: {
      id: queryResult.project.id,
      name: queryResult.project.name,
    },
    auth_source: authResolution.source,
    schema_version: 1,
    bootstrapped: {
      labels: 'deferred-no-system-managed-labels-at-configure-scope',
      custom_fields: 'none-in-v1',
      document_templates: 'deferred-to-phase-4-mirroring',
    },
  };
  return {
    stdout: emit(result, values.pretty === true),
    exitCode: 0,
  };
}

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
