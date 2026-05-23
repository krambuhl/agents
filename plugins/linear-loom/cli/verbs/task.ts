import { parseArgs } from 'node:util';
import { readFileSync } from 'node:fs';
import { LinearClient } from '../lib/linear-client.ts';
import { resolveAuth } from '../lib/auth.ts';
import { LinearLoomError } from '../lib/errors.ts';
import {
  type LinearMarker,
  type MarkerIO,
  markerPath,
  readMarker,
} from '../lib/marker.ts';
import { fetchLinearState, type LinearState } from '../lib/linear-state.ts';
import { createComment } from '../lib/comments.ts';

// `linear-loom task comment <slug> --task=<composed-key> --body=...`
//
// Posts a comment on the Linear Sub-Issue whose composed_key matches
// the given task. Primitive that DESIGN.md § 7's checkin-write
// substrate composes on (`linear-loom checkin write`, shipped in
// Phase 6 U2, builds a rendered checkin body and dispatches here).
//
// Idempotency note: comments are append-only on Linear's side, so
// re-running this verb with the same body creates a duplicate
// comment. The substrate doesn't deduplicate — that's the operator's
// responsibility, since legitimate use cases include posting the
// same message twice (e.g. status updates).

export interface TaskContext {
  client?: LinearClient;
  resolveAuthFn?: typeof resolveAuth;
  projectsRoot?: string;
  markerIO?: MarkerIO;
  readFileFn?: (path: string) => string;
}

export interface DispatchResult {
  stdout?: string;
  stderr?: string;
  exitCode: number;
}

export async function taskComment(
  rest: string[],
  ctx: TaskContext = {},
): Promise<DispatchResult> {
  const { values, positionals } = parseArgs({
    args: rest,
    options: {
      task: { type: 'string' as const },
      body: { type: 'string' as const },
      'body-file': { type: 'string' as const },
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
        'task comment requires a positional <slug> argument.',
        { namespace: 'task', verb: 'comment' },
      ),
    );
  }

  const composedKey = values.task;
  if (typeof composedKey !== 'string' || composedKey.trim() === '') {
    return errToResult(
      new LinearLoomError(
        'missing-task-id',
        'task comment requires --task=<composed-key> (the stable ID identifying the Sub-Issue per DESIGN.md § 12.2).',
        { namespace: 'task', verb: 'comment' },
      ),
    );
  }

  const bodyArg = values.body;
  const bodyFile = values['body-file'];
  const hasBody = typeof bodyArg === 'string' && bodyArg !== '';
  const hasBodyFile = typeof bodyFile === 'string' && bodyFile !== '';

  if (!hasBody && !hasBodyFile) {
    return errToResult(
      new LinearLoomError(
        'missing-body',
        'task comment requires either --body=<text> or --body-file=<path>.',
        { namespace: 'task', verb: 'comment' },
      ),
    );
  }
  if (hasBody && hasBodyFile) {
    return errToResult(
      new LinearLoomError(
        'conflicting-body',
        'task comment accepts --body OR --body-file, not both.',
        { namespace: 'task', verb: 'comment' },
      ),
    );
  }

  let body: string;
  if (hasBody) {
    body = bodyArg as string;
  } else {
    const reader = ctx.readFileFn ?? defaultRead;
    try {
      body = reader(bodyFile as string);
    } catch (err) {
      return errToResult(
        new LinearLoomError(
          'body-file-unreadable',
          `Cannot read --body-file at ${bodyFile as string}: ${(err as Error).message}`,
          { namespace: 'task', verb: 'comment' },
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

  let linearState: LinearState;
  try {
    linearState = await fetchLinearState({
      client,
      linearProjectId: marker.linear_project_id,
      labelName: marker.label,
    });
  } catch (err) {
    return errToResult(err);
  }

  const node = linearState.by_composed_key.get(composedKey.trim());
  if (node === undefined) {
    return errToResult(
      new LinearLoomError(
        'task-not-found',
        `No Linear Sub-Issue with composed_key "${composedKey.trim()}" under loom-project label "${marker.label}". Re-run linear-loom tasks generate --apply first if the PLAN.md node is new.`,
        { namespace: 'task', verb: 'comment' },
      ),
    );
  }
  if (node.kind === 'phase') {
    return errToResult(
      new LinearLoomError(
        'task-target-is-milestone',
        `composed_key "${composedKey.trim()}" resolves to a Linear ProjectMilestone (Phase), which does not accept comments. Comments are only supported on Issues (Batches and Tasks).`,
        { namespace: 'task', verb: 'comment' },
      ),
    );
  }

  let comment;
  try {
    comment = await createComment({
      client,
      issueId: node.linear_id,
      body,
    });
  } catch (err) {
    return errToResult(err);
  }

  return {
    stdout: emit(
      {
        slug: marker.slug,
        task: {
          composed_key: node.composed_key,
          linear_id: node.linear_id,
        },
        comment: {
          id: comment.id,
          url: comment.url,
        },
      },
      values.pretty === true,
    ),
    exitCode: 0,
  };
}

export const TASK_VERBS: Record<
  string,
  (rest: string[], ctx?: TaskContext) => Promise<DispatchResult>
> = {
  comment: taskComment,
};

function defaultRead(path: string): string {
  return readFileSync(path, 'utf8');
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
