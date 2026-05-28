import { parseArgs } from 'node:util';
import { readFileSync } from 'node:fs';
import { resolveProject } from '../../lib/project.ts';
import {
  appendEvent,
  appendSession,
  manifestPath,
  readManifestFile,
  writeManifest,
} from '../../lib/manifest-toml.ts';
import { LoomError } from '../../lib/errors.ts';
import type { Checkin, Session } from '../../lib/types.ts';
import type { CliContext, DispatchResult } from './project.ts';

function sessionFilename(s: { date: string; letter: string }): string {
  return `${s.date}-${s.letter}.json`;
}

// Checkins sorted as the per-file store listed them (branch, then number) —
// the order session corrections are gathered in.
function sortedCheckins(checkins: Checkin[]): Checkin[] {
  return [...checkins].sort((a, b) => {
    if (a.branch !== b.branch) return a.branch < b.branch ? -1 : 1;
    return Number.parseInt(a.number, 10) - Number.parseInt(b.number, 10);
  });
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

const SESSION_OPTIONS = {
  pretty: { type: 'boolean' as const },
  filename: { type: 'string' as const },
  'since-checkin': { type: 'string' as const },
};

export function sessionList(rest: string[], ctx: CliContext): DispatchResult {
  const { values, positionals } = parseArgs({
    args: rest,
    options: SESSION_OPTIONS,
    allowPositionals: true,
    strict: false,
  });
  const slug = positionals[0];
  if (slug === undefined) {
    return errToResult(new LoomError('missing-slug', 'session list requires a slug'));
  }
  try {
    const path = resolveProject(slug, ctx.projectsRoot);
    const mp = manifestPath(path);
    const { manifest } = readManifestFile(mp);
    const list = manifest.sessions
      .map((s) => ({ filename: sessionFilename(s), path: mp }))
      .sort((a, b) => (a.filename < b.filename ? -1 : 1));
    return { stdout: emit(list, values.pretty === true), exitCode: 0 };
  } catch (err) {
    return errToResult(err);
  }
}

export function sessionRead(rest: string[], ctx: CliContext): DispatchResult {
  const { values, positionals } = parseArgs({
    args: rest,
    options: SESSION_OPTIONS,
    allowPositionals: true,
    strict: false,
  });
  const slug = positionals[0];
  if (slug === undefined) {
    return errToResult(new LoomError('missing-slug', 'session read requires a slug'));
  }
  if (values.filename === undefined) {
    return errToResult(
      new LoomError('missing-args', 'session read requires --filename'),
    );
  }
  try {
    const path = resolveProject(slug, ctx.projectsRoot);
    const { manifest } = readManifestFile(manifestPath(path));
    const session = manifest.sessions.find(
      (s) => sessionFilename(s) === values.filename,
    );
    if (session === undefined) {
      return errToResult(
        new LoomError(
          'session-not-found',
          `session ${values.filename} not found in ${slug}`,
        ),
      );
    }
    return { stdout: emit(session, values.pretty === true), exitCode: 0 };
  } catch (err) {
    return errToResult(err);
  }
}

export type CorrectionEntry = {
  text: string;
  checkin: string;
  branch: string;
};

export function sessionCorrections(rest: string[], ctx: CliContext): DispatchResult {
  const { values, positionals } = parseArgs({
    args: rest,
    options: SESSION_OPTIONS,
    allowPositionals: true,
    strict: false,
  });
  const slug = positionals[0];
  if (slug === undefined) {
    return errToResult(new LoomError('missing-slug', 'session corrections requires a slug'));
  }
  const sinceCheckin = values['since-checkin'];
  try {
    const path = resolveProject(slug, ctx.projectsRoot);
    const { manifest } = readManifestFile(manifestPath(path));
    const corrections: CorrectionEntry[] = [];
    for (const c of sortedCheckins(manifest.checkins)) {
      if (sinceCheckin !== undefined && c.number < sinceCheckin) continue;
      for (const text of c.execution.corrections ?? []) {
        corrections.push({ text, checkin: c.number, branch: c.branch });
      }
    }
    return { stdout: emit(corrections, values.pretty === true), exitCode: 0 };
  } catch (err) {
    return errToResult(err);
  }
}

const WRITE_OPTIONS = {
  pretty: { type: 'boolean' as const },
  'session-file': { type: 'string' as const },
};

export function sessionWrite(rest: string[], ctx: CliContext): DispatchResult {
  const { values, positionals } = parseArgs({
    args: rest,
    options: WRITE_OPTIONS,
    allowPositionals: true,
    strict: false,
  });
  const slug = positionals[0];
  if (slug === undefined) {
    return errToResult(new LoomError('missing-slug', 'session write requires a slug'));
  }
  const sessionFile = values['session-file'];
  if (sessionFile === undefined) {
    return errToResult(
      new LoomError('missing-args', 'session write requires --session-file'),
    );
  }
  let raw: string;
  try {
    raw = readFileSync(sessionFile, 'utf8');
  } catch (err: unknown) {
    return errToResult(
      new LoomError(
        'session-file-unreadable',
        `cannot read session file ${sessionFile}: ${(err as Error).message}`,
      ),
    );
  }
  let parsed: Session;
  try {
    parsed = JSON.parse(raw) as Session;
  } catch (err: unknown) {
    return errToResult(
      new LoomError(
        'invalid-session',
        `session file is not valid JSON: ${(err as Error).message}`,
      ),
    );
  }
  if (parsed.schema_version !== 1 || typeof parsed.date !== 'string' || typeof parsed.letter !== 'string') {
    return errToResult(
      new LoomError(
        'invalid-session',
        'session file is missing required fields (schema_version, date, letter)',
      ),
    );
  }
  try {
    const path = resolveProject(slug, ctx.projectsRoot);
    const mp = manifestPath(path);
    const { manifest, token } = readManifestFile(mp);
    const filename = sessionFilename(parsed);
    let next = appendSession(manifest, parsed);
    next = appendEvent(next, {
      at: new Date().toISOString(),
      event: 'session-saved',
      detail: { filename },
    });
    writeManifest(mp, next, { expect: token });
    return { stdout: emit({ path: mp, filename }, values.pretty === true), exitCode: 0 };
  } catch (err) {
    return errToResult(err);
  }
}

export const SESSION_VERBS = {
  list: sessionList,
  read: sessionRead,
  corrections: sessionCorrections,
  write: sessionWrite,
};
