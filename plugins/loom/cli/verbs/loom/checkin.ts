import { parseArgs } from 'node:util';
import { readFileSync } from 'node:fs';
import { resolveProject } from '../../lib/project.ts';
import {
  appendCheckin,
  appendEvent,
  manifestPath,
  readManifestFile,
  writeManifest,
} from '../../lib/manifest-toml.ts';
import { LoomError } from '../../lib/errors.ts';
import type { Checkin, ManifestToml } from '../../lib/types.ts';
import type { CliContext, DispatchResult } from './project.ts';

function emit(value: unknown, pretty: boolean): string {
  return pretty ? JSON.stringify(value, null, 2) : JSON.stringify(value);
}

function errToResult(err: unknown): DispatchResult {
  if (err instanceof LoomError) {
    return { stderr: JSON.stringify(err.toPayload()), exitCode: 1 };
  }
  throw err;
}

// Checkins live in manifest.toml's [[checkins]] now. The list/read shape is
// unchanged ({number, branch, path}); `path` points at the one manifest the
// checkin lives in, since there is no per-checkin file anymore.
type CheckinSummary = { number: string; branch: string; path: string };

function listFromManifest(
  manifest: ManifestToml,
  mp: string,
  branch?: string,
): CheckinSummary[] {
  return manifest.checkins
    .filter((c) => branch === undefined || c.branch === branch)
    .map((c) => ({ number: c.number, branch: c.branch, path: mp }))
    .sort((a, b) => {
      if (a.branch !== b.branch) return a.branch < b.branch ? -1 : 1;
      return Number.parseInt(a.number, 10) - Number.parseInt(b.number, 10);
    });
}

const CHECKIN_OPTIONS = {
  pretty: { type: 'boolean' as const },
  branch: { type: 'string' as const },
  number: { type: 'string' as const },
};

export function checkinList(rest: string[], ctx: CliContext): DispatchResult {
  const { values, positionals } = parseArgs({
    args: rest,
    options: CHECKIN_OPTIONS,
    allowPositionals: true,
    strict: false,
  });
  const slug = positionals[0];
  if (slug === undefined) {
    return errToResult(new LoomError('missing-slug', 'checkin list requires a slug'));
  }
  try {
    const path = resolveProject(slug, ctx.projectsRoot);
    const mp = manifestPath(path);
    const { manifest } = readManifestFile(mp);
    const list = listFromManifest(manifest, mp, values.branch);
    return { stdout: emit(list, values.pretty === true), exitCode: 0 };
  } catch (err) {
    return errToResult(err);
  }
}

export function checkinRead(rest: string[], ctx: CliContext): DispatchResult {
  const { values, positionals } = parseArgs({
    args: rest,
    options: CHECKIN_OPTIONS,
    allowPositionals: true,
    strict: false,
  });
  const slug = positionals[0];
  if (slug === undefined) {
    return errToResult(new LoomError('missing-slug', 'checkin read requires a slug'));
  }
  if (values.branch === undefined || values.number === undefined) {
    return errToResult(
      new LoomError(
        'missing-args',
        'checkin read requires --branch and --number',
      ),
    );
  }
  try {
    const path = resolveProject(slug, ctx.projectsRoot);
    const { manifest } = readManifestFile(manifestPath(path));
    const checkin = manifest.checkins.find(
      (c) => c.branch === values.branch && c.number === values.number,
    );
    if (checkin === undefined) {
      return errToResult(
        new LoomError(
          'checkin-not-found',
          `checkin ${values.number} on ${values.branch} not found in ${slug}`,
        ),
      );
    }
    return { stdout: emit(checkin, values.pretty === true), exitCode: 0 };
  } catch (err) {
    return errToResult(err);
  }
}

export function checkinLatest(rest: string[], ctx: CliContext): DispatchResult {
  const { values, positionals } = parseArgs({
    args: rest,
    options: CHECKIN_OPTIONS,
    allowPositionals: true,
    strict: false,
  });
  const slug = positionals[0];
  if (slug === undefined) {
    return errToResult(new LoomError('missing-slug', 'checkin latest requires a slug'));
  }
  try {
    const path = resolveProject(slug, ctx.projectsRoot);
    const { manifest } = readManifestFile(manifestPath(path));
    const list = listFromManifest(manifest, manifestPath(path), values.branch);
    const latest = list[list.length - 1];
    if (latest === undefined) {
      return errToResult(
        new LoomError('no-checkins', 'no checkins for the given filter'),
      );
    }
    const checkin = manifest.checkins.find(
      (c) => c.branch === latest.branch && c.number === latest.number,
    );
    return { stdout: emit(checkin, values.pretty === true), exitCode: 0 };
  } catch (err) {
    return errToResult(err);
  }
}

const WRITE_OPTIONS = {
  pretty: { type: 'boolean' as const },
  'checkin-file': { type: 'string' as const },
};

export function checkinWrite(rest: string[], ctx: CliContext): DispatchResult {
  const { values, positionals } = parseArgs({
    args: rest,
    options: WRITE_OPTIONS,
    allowPositionals: true,
    strict: false,
  });
  const slug = positionals[0];
  if (slug === undefined) {
    return errToResult(new LoomError('missing-slug', 'checkin write requires a slug'));
  }
  const checkinFile = values['checkin-file'];
  if (checkinFile === undefined) {
    return errToResult(
      new LoomError('missing-args', 'checkin write requires --checkin-file'),
    );
  }
  let raw: string;
  try {
    raw = readFileSync(checkinFile, 'utf8');
  } catch (err: unknown) {
    return errToResult(
      new LoomError(
        'checkin-file-unreadable',
        `cannot read checkin file ${checkinFile}: ${(err as Error).message}`,
      ),
    );
  }
  let parsed: Checkin;
  try {
    parsed = JSON.parse(raw) as Checkin;
  } catch (err: unknown) {
    return errToResult(
      new LoomError(
        'invalid-checkin',
        `checkin file is not valid JSON: ${(err as Error).message}`,
      ),
    );
  }
  if (parsed.schema_version !== 1 || typeof parsed.number !== 'string' || typeof parsed.branch !== 'string') {
    return errToResult(
      new LoomError(
        'invalid-checkin',
        'checkin file is missing required fields (schema_version, number, branch)',
      ),
    );
  }
  try {
    const path = resolveProject(slug, ctx.projectsRoot);
    const mp = manifestPath(path);
    const { manifest, token } = readManifestFile(mp);
    // appendCheckin throws checkin-already-exists on a duplicate
    // (branch, number) — the create-once guarantee the per-file store
    // enforced at the filesystem.
    let next = appendCheckin(manifest, parsed);
    next = appendEvent(next, {
      at: new Date().toISOString(),
      event: 'checkin-created',
      detail: { number: parsed.number, branch: parsed.branch },
    });
    writeManifest(mp, next, { expect: token });
    const written = { path: mp, number: parsed.number, branch: parsed.branch };
    return { stdout: emit(written, values.pretty === true), exitCode: 0 };
  } catch (err) {
    return errToResult(err);
  }
}

export const CHECKIN_VERBS = {
  list: checkinList,
  read: checkinRead,
  latest: checkinLatest,
  write: checkinWrite,
};
