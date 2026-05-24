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
import {
  parseCheckinFile,
  renderCheckinToMarkdown,
} from '../lib/render-checkin.ts';

// `linear-loom checkin write <slug> --task=<composed-key>
// --checkin-file=<path>` — DESIGN.md § 7.
//
// Reads a loom-shape Checkin JSON record, renders it as markdown,
// posts it as a comment on the Linear Sub-Issue whose composed_key
// matches `--task`. Composes against U1's `createComment` lib.
//
// The Sub-Issue's comment thread is the substrate-native "unit
// history" surface — every checkin becomes one immutable comment;
// re-posting creates a duplicate rather than editing (matches U1's
// append-only stance).

export interface CheckinContext {
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

export async function checkinWrite(
  rest: string[],
  ctx: CheckinContext = {},
): Promise<DispatchResult> {
  const { values, positionals } = parseArgs({
    args: rest,
    options: {
      task: { type: 'string' as const },
      'checkin-file': { type: 'string' as const },
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
        'checkin write requires a positional <slug> argument.',
        { namespace: 'checkin', verb: 'write' },
      ),
    );
  }

  const composedKey = values.task;
  if (typeof composedKey !== 'string' || composedKey.trim() === '') {
    return errToResult(
      new LinearLoomError(
        'missing-task-id',
        'checkin write requires --task=<composed-key> identifying the Linear Sub-Issue to comment on.',
        { namespace: 'checkin', verb: 'write' },
      ),
    );
  }

  const checkinFile = values['checkin-file'];
  if (typeof checkinFile !== 'string' || checkinFile.trim() === '') {
    return errToResult(
      new LinearLoomError(
        'missing-checkin-file',
        'checkin write requires --checkin-file=<path> pointing at a loom-shape Checkin JSON record.',
        { namespace: 'checkin', verb: 'write' },
      ),
    );
  }

  const reader = ctx.readFileFn ?? defaultRead;
  let raw: string;
  try {
    raw = reader(checkinFile);
  } catch (err) {
    return errToResult(
      new LinearLoomError(
        'checkin-file-unreadable',
        `Cannot read --checkin-file at ${checkinFile}: ${(err as Error).message}`,
        { namespace: 'checkin', verb: 'write' },
      ),
    );
  }

  let checkin;
  try {
    checkin = parseCheckinFile(raw);
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
        { namespace: 'checkin', verb: 'write' },
      ),
    );
  }
  if (node.kind === 'phase') {
    return errToResult(
      new LinearLoomError(
        'task-target-is-milestone',
        `composed_key "${composedKey.trim()}" resolves to a Linear ProjectMilestone (Phase), which does not accept comments. Comments are only supported on Issues (Batches and Tasks).`,
        { namespace: 'checkin', verb: 'write' },
      ),
    );
  }

  const body = renderCheckinToMarkdown(checkin);
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
        checkin: {
          number: checkin.number,
          branch: checkin.branch,
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

export const CHECKIN_VERBS: Record<
  string,
  (rest: string[], ctx?: CheckinContext) => Promise<DispatchResult>
> = {
  write: checkinWrite,
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
