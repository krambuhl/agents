import { parseArgs } from 'node:util';
import { existsSync } from 'node:fs';
import { sep } from 'node:path';
import { resolveProject, listProjects } from '../../lib/project.ts';
import { manifestPath, readManifestFile } from '../../lib/manifest-toml.ts';
import { LoomError } from '../../lib/errors.ts';
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

type DoctorIssue = {
  code: string;
  severity: 'warning' | 'error';
  detail: string;
};

type DoctorReport = {
  slug: string;
  ok: boolean;
  issues: DoctorIssue[];
};

function checkProject(projectPath: string, slug: string): DoctorReport {
  const issues: DoctorIssue[] = [];
  const mp = manifestPath(projectPath);

  // Post-cutover, all state lives in one manifest.toml; a clean parse of it
  // certifies meta + config + the append-only sections in one read
  // (readManifest validates the required sections + schema version).
  if (!existsSync(mp)) {
    issues.push({
      code: 'manifest-missing',
      severity: 'error',
      detail: `manifest.toml not found at ${mp}`,
    });
  } else {
    // readManifest validates the required sections AND the schema version
    // (it throws manifest-unsupported-version for anything but v1), so a
    // clean parse is the whole health check; any failure is unreadable.
    try {
      readManifestFile(mp);
    } catch (err: unknown) {
      issues.push({
        code: 'manifest-unreadable',
        severity: 'error',
        detail: (err as Error).message,
      });
    }
  }

  return {
    slug,
    ok: issues.every((i) => i.severity !== 'error'),
    issues,
  };
}

export function doctor(rest: string[], ctx: CliContext): DispatchResult {
  const { values, positionals } = parseArgs({
    args: rest,
    options: { pretty: { type: 'boolean' } },
    allowPositionals: true,
    strict: false,
  });
  const slugArg = positionals[0];
  let projectPath: string;
  let slug: string;
  try {
    if (slugArg !== undefined) {
      projectPath = resolveProject(slugArg, ctx.projectsRoot);
      slug = slugArg;
    } else {
      // No slug → cwd discovery (same shape as project status).
      const cwd = ctx.cwdOverride ?? process.cwd();
      const all = [
        ...listProjects(ctx.projectsRoot),
        ...listProjects(ctx.projectsRoot, { archived: true }),
      ];
      const match = all.find(
        (p) => cwd === p.path || cwd.startsWith(p.path + sep),
      );
      if (match === undefined) {
        return errToResult(
          new LoomError(
            'not-in-project',
            `cwd ${cwd} is not inside a project directory`,
          ),
        );
      }
      projectPath = match.path;
      slug = match.slug;
    }
  } catch (err) {
    return errToResult(err);
  }
  const report = checkProject(projectPath, slug);
  return { stdout: emit(report, values.pretty === true), exitCode: 0 };
}

export const DOCTOR_VERBS = {
  doctor,
};
