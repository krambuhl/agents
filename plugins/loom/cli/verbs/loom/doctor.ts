import { parseArgs } from 'node:util';
import { spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { join, resolve, sep } from 'node:path';
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

// --- guild cache-skew probe (gate-coverage P2) ---
//
// loom doctor preflights loom's manifest; this adds a workspace-level
// check that the RESOLVABLE guild (the `guild` on PATH — typically the
// installed plugin-cache binary) hasn't fallen behind the guild SOURCE
// tree. The symptom that motivated it: a cached guild predating a verb
// (e.g. `compile`), so codegen / live-spawn silently ran on stale state
// while a loom-only preflight stayed green.

/** Compare the verbs guild SOURCE declares against what the resolvable
 *  `guild` exposes. Returns a `warning` (advisory) when the resolvable CLI
 *  is MISSING verbs the source declares — the cache lags source. Returns
 *  null when resolvable covers source (equal, or resolvable carries extra
 *  dev-local verbs — not skew). Pure + parameterized so it tests without
 *  spawning anything. */
export function detectGuildSkew(
  sourceVerbs: readonly string[],
  resolvableVerbs: readonly string[],
): DoctorIssue | null {
  const resolvable = new Set(resolvableVerbs);
  const missing = sourceVerbs.filter((v) => !resolvable.has(v));
  if (missing.length === 0) return null;
  return {
    code: 'guild-cache-skew',
    severity: 'warning',
    detail:
      `the resolvable \`guild\` is missing ${missing.length} verb` +
      `${missing.length === 1 ? '' : 's'} the source declares ` +
      `(${missing.join(', ')}) — the cached guild lags source, so codegen ` +
      `/ live-spawn may run on stale state. Re-sync the plugin cache and ` +
      `restart.`,
  };
}

/** Query a guild CLI's declared verbs via the `candidates` list in its
 *  unknown-verb error. Graceful: returns null if the command can't run or
 *  its stderr doesn't parse — never throws. NODE_NO_WARNINGS keeps stderr
 *  clean JSON (some node versions print a type-stripping warning there). */
export function queryGuildVerbs(cmd: string, args: string[]): string[] | null {
  try {
    const r = spawnSync(cmd, [...args, '__loom-doctor-skewprobe__'], {
      encoding: 'utf8',
      env: { ...process.env, NODE_NO_WARNINGS: '1' },
    });
    if (r.error || typeof r.stderr !== 'string' || r.stderr.trim() === '') {
      return null;
    }
    const payload = JSON.parse(r.stderr.trim());
    return Array.isArray(payload.candidates) ? payload.candidates : null;
  } catch {
    return null;
  }
}

/** Workspace-level guild cache-skew check. `repoRoot` is the marketplace
 *  root (parent of projectsRoot). Skips (null) outside the marketplace
 *  repo, or when either guild CLI can't be queried — the signal is
 *  advisory and must never crash doctor or block on a missing `guild`. */
function checkGuildSkew(repoRoot: string): DoctorIssue | null {
  const sourceEntry = join(repoRoot, 'plugins', 'guild', 'cli', 'guild.ts');
  if (!existsSync(sourceEntry)) return null;
  const sourceVerbs = queryGuildVerbs('node', [sourceEntry]);
  const resolvableVerbs = queryGuildVerbs('guild', []);
  if (sourceVerbs === null || resolvableVerbs === null) return null;
  return detectGuildSkew(sourceVerbs, resolvableVerbs);
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
  // Workspace-level guild cache-skew probe (advisory; gate-coverage P2).
  // repoRoot = parent of projectsRoot. Degrades to null off-repo or when
  // guild can't be queried, so it never flips a healthy report.
  const skew = checkGuildSkew(resolve(ctx.projectsRoot, '..'));
  if (skew !== null) {
    report.issues.push(skew);
    report.ok = report.issues.every((i) => i.severity !== 'error');
  }
  return {
    stdout: emit(report, values.pretty === true),
    exitCode: report.ok ? 0 : 1,
  };
}

export const DOCTOR_VERBS = {
  doctor,
};
