import { parseArgs } from 'node:util';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { resolveProject } from '../../lib/project.ts';
import { readRetro, listRetros, retroFilename } from '../../lib/retro.ts';
import {
  appendEvent,
  appendRetro,
  manifestPath,
  readManifestFile,
  writeManifest,
} from '../../lib/manifest-toml.ts';
import { LoomError } from '../../lib/errors.ts';
import type { CliContext, DispatchResult } from './project.ts';
import type { Retro, RetroType } from '../../lib/types.ts';

function emit(value: unknown, pretty: boolean): string {
  return pretty ? JSON.stringify(value, null, 2) : JSON.stringify(value);
}

function errToResult(err: unknown): DispatchResult {
  if (err instanceof LoomError) {
    return { stderr: JSON.stringify(err.toPayload()), exitCode: 1 };
  }
  throw err;
}

const RETRO_OPTIONS = {
  pretty: { type: 'boolean' as const },
  type: { type: 'string' as const },
  phase: { type: 'string' as const },
  tier: { type: 'string' as const },
};

function asRetroType(s: string | undefined): RetroType | undefined {
  if (s === 'session' || s === 'project') return s;
  return undefined;
}

export function retroList(rest: string[], ctx: CliContext): DispatchResult {
  const { values, positionals } = parseArgs({
    args: rest,
    options: RETRO_OPTIONS,
    allowPositionals: true,
    strict: false,
  });
  const slug = positionals[0];
  if (slug === undefined) {
    return errToResult(new LoomError('missing-slug', 'retro list requires a slug'));
  }
  try {
    const path = resolveProject(slug, ctx.projectsRoot);
    const typeFilter = asRetroType(values.type);
    const { manifest } = readManifestFile(manifestPath(path));
    // Manifest-first union: new retros from [[retros]] (source 'manifest'),
    // then pre-flip file retros (source 'file'). No key overlap under
    // forward-only. Manifest entries carry no path (they live in the manifest).
    const manifestList = manifest.retros
      .filter((r) => typeFilter === undefined || r.type === typeFilter)
      .map((r) => ({
        filename: retroFilename(r),
        type: r.type,
        source: 'manifest' as const,
      }));
    const fileList = listRetros(path, { type: typeFilter }).map((s) => ({
      filename: s.filename,
      type: s.type,
      path: s.path,
      source: 'file' as const,
    }));
    return {
      stdout: emit([...manifestList, ...fileList], values.pretty === true),
      exitCode: 0,
    };
  } catch (err) {
    return errToResult(err);
  }
}

export function retroRead(rest: string[], ctx: CliContext): DispatchResult {
  const { values, positionals } = parseArgs({
    args: rest,
    options: RETRO_OPTIONS,
    allowPositionals: true,
    strict: false,
  });
  const slug = positionals[0];
  if (slug === undefined) {
    return errToResult(new LoomError('missing-slug', 'retro read requires a slug'));
  }
  const type = asRetroType(values.type);
  if (type === undefined) {
    return errToResult(
      new LoomError(
        'missing-args',
        'retro read requires --type=session|project',
      ),
    );
  }
  let filename: string;
  if (type === 'project') {
    filename = 'project.json';
  } else {
    if (values.phase === undefined || values.tier === undefined) {
      return errToResult(
        new LoomError(
          'missing-args',
          'retro read --type=session requires --phase and --tier',
        ),
      );
    }
    filename = `phase-${values.phase}-tier-${values.tier}.json`;
  }
  try {
    const path = resolveProject(slug, ctx.projectsRoot);
    // Manifest-first: new retros live in [[retros]]. Fall back to the file
    // store for pre-flip (forward-only) projects.
    const { manifest } = readManifestFile(manifestPath(path));
    const found = manifest.retros.find((r) =>
      type === 'project'
        ? r.type === 'project'
        : r.type === 'session' &&
          String(r.phase) === values.phase &&
          String(r.tier) === values.tier,
    );
    if (found) {
      return { stdout: emit(found, values.pretty === true), exitCode: 0 };
    }
    const retro = readRetro(join(path, 'retros', filename));
    return { stdout: emit(retro, values.pretty === true), exitCode: 0 };
  } catch (err) {
    return errToResult(err);
  }
}

const WRITE_OPTIONS = {
  pretty: { type: 'boolean' as const },
  'retro-file': { type: 'string' as const },
};

export function retroWrite(rest: string[], ctx: CliContext): DispatchResult {
  const { values, positionals } = parseArgs({
    args: rest,
    options: WRITE_OPTIONS,
    allowPositionals: true,
    strict: false,
  });
  const slug = positionals[0];
  if (slug === undefined) {
    return errToResult(new LoomError('missing-slug', 'retro write requires a slug'));
  }
  const retroFile = values['retro-file'];
  if (retroFile === undefined) {
    return errToResult(
      new LoomError('missing-args', 'retro write requires --retro-file'),
    );
  }
  let raw: string;
  try {
    raw = readFileSync(retroFile, 'utf8');
  } catch (err: unknown) {
    return errToResult(
      new LoomError(
        'retro-file-unreadable',
        `cannot read retro file ${retroFile}: ${(err as Error).message}`,
      ),
    );
  }
  let parsed: Retro;
  try {
    parsed = JSON.parse(raw) as Retro;
  } catch (err: unknown) {
    return errToResult(
      new LoomError(
        'invalid-retro',
        `retro file is not valid JSON: ${(err as Error).message}`,
      ),
    );
  }
  if (parsed.schema_version !== 1 || (parsed.type !== 'session' && parsed.type !== 'project')) {
    return errToResult(
      new LoomError(
        'invalid-retro',
        'retro file is missing required fields (schema_version, type)',
      ),
    );
  }
  try {
    const path = resolveProject(slug, ctx.projectsRoot);
    const mp = manifestPath(path);
    const { manifest, token } = readManifestFile(mp);
    // Create-once guard, moved out of writeRetro's filesystem check into the
    // verb: appendRetro is a plain append (Phase-1 decision), so the verb owns
    // immutability. A session retro is unique by (phase, tier); a project
    // retro is a singleton.
    const duplicate = manifest.retros.some((r) =>
      parsed.type === 'project'
        ? r.type === 'project'
        : r.type === 'session' &&
          r.phase === parsed.phase &&
          r.tier === parsed.tier,
    );
    if (duplicate) {
      const label =
        parsed.type === 'project'
          ? 'project'
          : `phase-${parsed.phase}-tier-${parsed.tier}`;
      return errToResult(
        new LoomError(
          'retro-already-exists',
          `retro ${label} already exists (retros are immutable)`,
        ),
      );
    }
    const detail: { type: RetroType; phase?: number; tier?: number } = { type: parsed.type };
    if (parsed.type === 'session') {
      detail.phase = parsed.phase;
      detail.tier = parsed.tier;
    }
    // One read-modify-write: append the retro into [[retros]] and the
    // retro-written breadcrumb into [[events]], then write the manifest once.
    const next = appendEvent(appendRetro(manifest, parsed), {
      at: new Date().toISOString(),
      event: 'retro-written',
      detail,
    });
    writeManifest(mp, next, { expect: token });
    const result: { section: 'retros'; type: RetroType; phase?: number; tier?: number } = {
      section: 'retros',
      type: parsed.type,
    };
    if (parsed.type === 'session') {
      result.phase = parsed.phase;
      result.tier = parsed.tier;
    }
    return { stdout: emit(result, values.pretty === true), exitCode: 0 };
  } catch (err) {
    return errToResult(err);
  }
}

export const RETRO_VERBS = {
  list: retroList,
  read: retroRead,
  write: retroWrite,
};
