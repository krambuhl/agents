import { parseArgs } from 'node:util';
import { resolveProject } from '../../lib/project.ts';
import {
  manifestPath,
  readManifestFile,
  appendEvent,
  writeManifest,
} from '../../lib/manifest-toml.ts';
import { LoomError } from '../../lib/errors.ts';
import type { Event, EventName } from '../../lib/types.ts';
import type { CliContext, DispatchResult } from './project.ts';

// Read + filter the project's events from manifest.toml's [[events]],
// reproducing the legacy readEvents() filter semantics (event name, since
// timestamp, leading-N limit) so the verbs' output is unchanged by the
// storage move.
function readEvents(
  projectPath: string,
  opts: { since?: string; event?: EventName; limit?: number } = {},
): Event[] {
  const { manifest } = readManifestFile(manifestPath(projectPath));
  const filtered = manifest.events.filter((e) => {
    if (opts.event !== undefined && e.event !== opts.event) return false;
    if (opts.since !== undefined && e.at < opts.since) return false;
    return true;
  });
  if (opts.limit !== undefined && opts.limit >= 0) {
    return filtered.slice(0, opts.limit);
  }
  return filtered;
}

function emit(value: unknown, pretty: boolean): string {
  return pretty ? JSON.stringify(value, null, 2) : JSON.stringify(value);
}

function errToResult(err: unknown): DispatchResult {
  if (err instanceof LoomError) {
    return { stderr: JSON.stringify(err.toPayload()), exitCode: 1 };
  }
  throw err;
}

const EVENTS_OPTIONS = {
  pretty: { type: 'boolean' as const },
  since: { type: 'string' as const },
  event: { type: 'string' as const },
  limit: { type: 'string' as const },
  detail: { type: 'string' as const },
};

// Event names are kebab-case (lowercase letters/digits, single hyphens) —
// 'evaluator-spawned', 'phase-completed'. Validation is structural only:
// membership in the EventName union is NOT checked at runtime. loom's posture
// is deliberately lenient (reconstructEvent casts event-name strings loosely,
// and loom still parses fossil pr-* events it no longer types); a per-name
// runtime allowlist would reintroduce the stale-list burden the type union
// already guards at compile time for typed callers.
const KEBAB_EVENT_NAME = /^[a-z0-9]+(-[a-z0-9]+)*$/;

export function eventsRead(rest: string[], ctx: CliContext): DispatchResult {
  const { values, positionals } = parseArgs({
    args: rest,
    options: EVENTS_OPTIONS,
    allowPositionals: true,
    strict: false,
  });
  const slug = positionals[0];
  if (slug === undefined) {
    return errToResult(
      new LoomError('missing-slug', 'events read requires a slug'),
    );
  }
  let limit: number | undefined;
  if (values.limit !== undefined) {
    const parsed = Number.parseInt(values.limit, 10);
    if (Number.isNaN(parsed) || parsed < 0) {
      return errToResult(
        new LoomError('invalid-limit', `--limit must be a non-negative integer: ${values.limit}`),
      );
    }
    limit = parsed;
  }
  try {
    const path = resolveProject(slug, ctx.projectsRoot);
    const events = readEvents(path, {
      since: values.since,
      event: values.event as EventName | undefined,
      limit,
    });
    return { stdout: emit(events, values.pretty === true), exitCode: 0 };
  } catch (err) {
    return errToResult(err);
  }
}

export function eventsLatest(rest: string[], ctx: CliContext): DispatchResult {
  const { values, positionals } = parseArgs({
    args: rest,
    options: EVENTS_OPTIONS,
    allowPositionals: true,
    strict: false,
  });
  const slug = positionals[0];
  if (slug === undefined) {
    return errToResult(
      new LoomError('missing-slug', 'events latest requires a slug'),
    );
  }
  try {
    const path = resolveProject(slug, ctx.projectsRoot);
    const events = readEvents(path, {
      event: values.event as EventName | undefined,
    });
    if (events.length === 0) {
      return errToResult(
        new LoomError('no-events', 'no events match the filter'),
      );
    }
    const latest = events[events.length - 1];
    return { stdout: emit(latest, values.pretty === true), exitCode: 0 };
  } catch (err) {
    return errToResult(err);
  }
}

export function eventsAppend(rest: string[], ctx: CliContext): DispatchResult {
  const { values, positionals } = parseArgs({
    args: rest,
    options: EVENTS_OPTIONS,
    allowPositionals: true,
    strict: false,
  });
  const slug = positionals[0];
  if (slug === undefined) {
    return errToResult(
      new LoomError('missing-slug', 'events append requires a slug'),
    );
  }
  const name = values.event;
  if (name === undefined || name === '') {
    return errToResult(
      new LoomError('missing-args', 'events append requires --event=<name>'),
    );
  }
  if (!KEBAB_EVENT_NAME.test(name)) {
    return errToResult(
      new LoomError(
        'invalid-event-name',
        `--event must be kebab-case (lowercase letters/digits, single hyphens): ${name}`,
      ),
    );
  }
  // --detail is optional; defaults to {} (some events carry empty detail, e.g.
  // project-initialized). When present it must parse to a plain JSON object —
  // not an array, primitive, or null.
  let detail: Record<string, unknown> = {};
  if (values.detail !== undefined) {
    let parsed: unknown;
    try {
      parsed = JSON.parse(values.detail);
    } catch (err: unknown) {
      return errToResult(
        new LoomError(
          'invalid-detail',
          `--detail is not valid JSON: ${(err as Error).message}`,
        ),
      );
    }
    if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
      return errToResult(
        new LoomError('invalid-detail', '--detail must be a JSON object'),
      );
    }
    detail = parsed as Record<string, unknown>;
  }
  try {
    const path = resolveProject(slug, ctx.projectsRoot);
    const mp = manifestPath(path);
    const { manifest, token } = readManifestFile(mp);
    // Name cast leniently to EventName (see KEBAB_EVENT_NAME note). appendEvent
    // dedupes on (name + deepEqual detail), so an identical re-append is a no-op.
    const event = {
      at: new Date().toISOString(),
      event: name as EventName,
      detail,
    } as Event;
    const next = appendEvent(manifest, event);
    writeManifest(mp, next, { expect: token });
    return { stdout: emit(event, values.pretty === true), exitCode: 0 };
  } catch (err) {
    return errToResult(err);
  }
}

export const EVENTS_VERBS = {
  read: eventsRead,
  latest: eventsLatest,
  append: eventsAppend,
};
