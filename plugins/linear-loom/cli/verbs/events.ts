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
  synthesizeFromLinear,
  type SynthesizedEvent,
} from '../lib/events-synthesis.ts';

// `linear-loom events read <slug>` — DESIGN.md § 8.
//
// Synthesizes a loom-compat events array from Linear's native audit
// data: Project.createdAt, Milestone.createdAt, and Sub-Issue
// comments (each of which carries one rendered checkin per U2 +
// DESIGN § 7).
//
// Mirrors loom's `events read` argv surface (--since / --event /
// --limit / --pretty) so ev-linear's loop body can consume the same
// shape it would have from loom's events.jsonl.

export interface EventsContext {
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

interface EventsReadQueryResult {
  project: {
    id: string;
    createdAt: string;
    projectMilestones: {
      nodes: Array<{ id: string; name: string; createdAt: string }>;
    };
  } | null;
  issues: {
    nodes: Array<{
      id: string;
      comments: {
        nodes: Array<{ id: string; createdAt: string; body: string }>;
      };
    }>;
  };
}

const EVENTS_READ_QUERY = `
  query LinearLoomEventsRead($projectId: String!, $labelName: String!) {
    project(id: $projectId) {
      id
      createdAt
      projectMilestones {
        nodes {
          id
          name
          createdAt
        }
      }
    }
    issues(
      filter: { labels: { name: { eq: $labelName } } }
      first: 250
    ) {
      nodes {
        id
        comments(first: 100) {
          nodes {
            id
            createdAt
            body
          }
        }
      }
    }
  }
`;

export async function eventsRead(
  rest: string[],
  ctx: EventsContext = {},
): Promise<DispatchResult> {
  const { values, positionals } = parseArgs({
    args: rest,
    options: {
      since: { type: 'string' as const },
      event: { type: 'string' as const },
      limit: { type: 'string' as const },
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
        'events read requires a positional <slug> argument.',
        { namespace: 'events', verb: 'read' },
      ),
    );
  }

  let limit: number | undefined;
  if (typeof values.limit === 'string') {
    const parsed = Number.parseInt(values.limit, 10);
    if (!Number.isInteger(parsed) || parsed < 0) {
      return errToResult(
        new LinearLoomError(
          'invalid-limit',
          `events read --limit="${values.limit}" must be a non-negative integer.`,
          { namespace: 'events', verb: 'read' },
        ),
      );
    }
    limit = parsed;
  }

  // Validate --since here so a malformed value fails fast (before any
  // Linear round-trip). ISO-8601 timestamps lex-compare correctly,
  // so we don't need Date arithmetic — just confirm the value parses
  // as a real date.
  if (typeof values.since === 'string') {
    const ts = Date.parse(values.since);
    if (Number.isNaN(ts)) {
      return errToResult(
        new LinearLoomError(
          'invalid-since',
          `events read --since="${values.since}" is not a parseable ISO date.`,
          { namespace: 'events', verb: 'read' },
        ),
      );
    }
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

  let queryResult: EventsReadQueryResult;
  try {
    queryResult = await client.query<EventsReadQueryResult>(
      EVENTS_READ_QUERY,
      {
        projectId: marker.linear_project_id,
        labelName: marker.label,
      },
    );
  } catch (err) {
    return errToResult(err);
  }

  if (queryResult.project === null) {
    return errToResult(
      new LinearLoomError(
        'linear-project-not-found',
        `No Linear Project with ID ${marker.linear_project_id} (from linear.json marker).`,
        { namespace: 'events', verb: 'read' },
      ),
    );
  }

  let events: SynthesizedEvent[] = synthesizeFromLinear({
    slug: marker.slug,
    project: { createdAt: queryResult.project.createdAt },
    milestones: queryResult.project.projectMilestones.nodes,
    issues: queryResult.issues.nodes.map((i) => ({
      id: i.id,
      comments: i.comments.nodes,
    })),
  });

  // Apply argv filters in the order loom's `events read` does:
  // since → event → limit. Matches the loom verb's behavior so
  // consumers swapping data sources see the same shape.
  if (typeof values.since === 'string') {
    events = events.filter((e) => e.at >= (values.since as string));
  }
  if (typeof values.event === 'string') {
    events = events.filter((e) => e.event === values.event);
  }
  if (limit !== undefined) {
    events = events.slice(0, limit);
  }

  return {
    stdout: emit(
      {
        schema_version: 1,
        slug: marker.slug,
        events,
      },
      values.pretty === true,
    ),
    exitCode: 0,
  };
}

export const EVENTS_VERBS: Record<
  string,
  (rest: string[], ctx?: EventsContext) => Promise<DispatchResult>
> = {
  read: eventsRead,
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
