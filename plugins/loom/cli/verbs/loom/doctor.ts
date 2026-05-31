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

/** Probe the RESOLVABLE `guild` (the one on PATH) for its verb list,
 *  distinguishing three states the freshness gate must treat differently:
 *  - `absent`: no `guild` on PATH at all (spawn ENOENT) — nothing installed
 *    to lag behind source; skip silently.
 *  - `unqueryable`: a `guild` ran (or exists) but its verb list couldn't be
 *    read — its unknown-verb error shape didn't parse. This is ITSELF a skew
 *    signal: a cache so stale its error contract predates this probe. The
 *    old `null`-on-everything collapse hid this case as green (the "guard
 *    needs guarding" gap) — surface it instead of swallowing it.
 *  - `ok`: verbs read cleanly. */
export type ResolvableProbe =
  | { state: 'absent' }
  | { state: 'unqueryable' }
  | { state: 'ok'; verbs: string[] };

export function probeResolvableGuild(
  cmd = 'guild',
  args: string[] = [],
): ResolvableProbe {
  let r: ReturnType<typeof spawnSync>;
  try {
    r = spawnSync(cmd, [...args, '__loom-doctor-skewprobe__'], {
      encoding: 'utf8',
      env: { ...process.env, NODE_NO_WARNINGS: '1' },
    });
  } catch {
    return { state: 'unqueryable' };
  }
  if (r.error) {
    // ENOENT = the command isn't on PATH → absent. Any other spawn error
    // (EACCES, etc.) = present-but-couldn't-run → unqueryable.
    const code = (r.error as { code?: string }).code;
    return code === 'ENOENT' ? { state: 'absent' } : { state: 'unqueryable' };
  }
  if (typeof r.stderr !== 'string' || r.stderr.trim() === '') {
    return { state: 'unqueryable' };
  }
  try {
    const payload = JSON.parse(r.stderr.trim());
    return Array.isArray(payload.candidates)
      ? { state: 'ok', verbs: payload.candidates as string[] }
      : { state: 'unqueryable' };
  } catch {
    return { state: 'unqueryable' };
  }
}

/** Workspace-level guild cache-skew check. `repoRoot` is the marketplace
 *  root (parent of projectsRoot). Skips (null) outside the marketplace
 *  repo, or when the guild SOURCE can't be queried. The resolvable side is
 *  probed via the absent/unqueryable/ok trichotomy so a present-but-stale
 *  guild surfaces a warning rather than reporting green. */
function checkGuildSkew(repoRoot: string): DoctorIssue | null {
  const sourceEntry = join(repoRoot, 'plugins', 'guild', 'cli', 'guild.ts');
  if (!existsSync(sourceEntry)) return null;
  const sourceVerbs = queryGuildVerbs('node', [sourceEntry]);
  if (sourceVerbs === null) return null;
  const resolvable = probeResolvableGuild();
  switch (resolvable.state) {
    case 'absent':
      // No `guild` on PATH — nothing installed to lag source. Skip.
      return null;
    case 'unqueryable':
      return {
        code: 'guild-cache-skew',
        severity: 'warning',
        detail:
          'a `guild` is on PATH but its verb list could not be read ' +
          '(unrecognized error shape) — likely a cache so stale its CLI ' +
          'predates this probe, so codegen / live-spawn may run on stale ' +
          'state. Re-sync the plugin cache and restart, or run guild from ' +
          'source: `node plugins/guild/cli/guild.ts`.',
      };
    case 'ok':
      return detectGuildSkew(sourceVerbs, resolvable.verbs);
  }
}

// --- guild codegen-drift probe (shared-insights Phase 1, D1) ---
//
// Structural shape of `guild compile --check` stdout — the JSON contract
// loom consumes across the PROCESS boundary (deliberately NOT a source
// import: loom and guild are separate plugins; the freshness check is a
// subprocess call with a JSON contract, same as the verb probe above).
// Mirrors guild's CheckResult.
type GuildCheckResult = {
  ok: boolean;
  drift: {
    cells_with_source_drift: { id: string; axis: string }[];
    cells_with_output_drift: string[];
    cells_with_prompt_drift: string[];
    cells_missing_cache_entry: string[];
    cells_missing_on_disk: string[];
    stale_cache_entries: string[];
  };
};

/** Run `guild compile --check` from SOURCE — never the resolvable cached
 *  binary, per ADR-0006: the freshness verdict must come from the thing it
 *  certifies, not the artifact under suspicion. `--check` self-computes its
 *  prompt-hash from the in-plugin fusion-prompt.md, so `ok`/`drift` are
 *  honest without loom passing one. Returns null off-repo, when the check
 *  can't run, or when its output doesn't parse — advisory only, never
 *  crashes or blocks doctor. Pure/effectful split: this is the effectful
 *  half; classification is `detectCodegenDrift`. */
export function runCodegenCheck(repoRoot: string): GuildCheckResult | null {
  const sourceEntry = join(repoRoot, 'plugins', 'guild', 'cli', 'guild.ts');
  if (!existsSync(sourceEntry)) return null;
  let r: ReturnType<typeof spawnSync>;
  try {
    // cwd = repoRoot: `compile --check`'s default axes/output paths are
    // marketplace-root-relative (plugins/guild/modes/axes.toml).
    r = spawnSync('node', [sourceEntry, 'compile', '--check'], {
      cwd: repoRoot,
      encoding: 'utf8',
      env: { ...process.env, NODE_NO_WARNINGS: '1' },
    });
  } catch {
    return null;
  }
  if (r.error || typeof r.stdout !== 'string' || r.stdout.trim() === '') {
    return null;
  }
  try {
    const parsed = JSON.parse(r.stdout.trim());
    if (
      typeof parsed?.ok !== 'boolean' ||
      typeof parsed?.drift !== 'object' ||
      parsed.drift === null
    ) {
      return null;
    }
    return parsed as GuildCheckResult;
  } catch {
    return null;
  }
}

/** Pure: map a `guild compile --check` result to an advisory DoctorIssue.
 *  null when the check passed, couldn't run (null), or named no drifted
 *  cells. Always `warning` — codegen staleness is advisory and never flips
 *  report.ok (a false-positive hard-stop trains operators to bypass the
 *  gate). The detail names the drifted cells + the exact remediation
 *  command (diagnostic-readability: exact artifact, exact fix). Parameterized
 *  so it tests without spawning. */
export function detectCodegenDrift(
  result: GuildCheckResult | null,
): DoctorIssue | null {
  if (result === null) return null;
  const d = result.drift;
  // cellId → reason tag; a Map dedupes cells flagged by multiple categories.
  // All six axes count: `--check` self-computes the prompt-hash now, so
  // prompt-drift is a real "the fusion template changed, re-fuse" signal,
  // not the standalone-'' false positive it used to be.
  const drifted = new Map<string, string>();
  for (const c of d.cells_with_source_drift) drifted.set(c.id, 'source');
  for (const id of d.cells_with_output_drift) drifted.set(id, 'output');
  for (const id of d.cells_with_prompt_drift) drifted.set(id, 'prompt');
  for (const id of d.cells_missing_on_disk) drifted.set(id, 'missing-on-disk');
  for (const id of d.cells_missing_cache_entry) drifted.set(id, 'uncached');
  for (const id of d.stale_cache_entries) drifted.set(id, 'stale-cache');
  if (drifted.size === 0) return null;
  const ids = [...drifted.keys()];
  const shown = ids.slice(0, 6).join(', ');
  const more = ids.length > 6 ? `, +${ids.length - 6} more` : '';
  return {
    code: 'guild-codegen-drift',
    severity: 'warning',
    detail:
      `${drifted.size} guild agent${drifted.size === 1 ? '' : 's'} out of ` +
      `sync with source (${shown}${more}) — the committed agent bodies no ` +
      `longer match their source fragments/cache, so live-spawned agents may ` +
      `be stale. Recompile from source and restart: ` +
      '`node plugins/guild/cli/guild.ts compile`.',
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
  // Workspace-level guild freshness probes (advisory). repoRoot = parent of
  // projectsRoot. Both bootstrap from guild SOURCE, never the cached binary
  // (ADR-0006), and degrade to null off-repo or when guild can't be probed,
  // so they never flip a healthy report. `guild-cache-skew` = verb-set lag;
  // `guild-codegen-drift` = committed agent bodies vs source-fragment hashes.
  const repoRoot = resolve(ctx.projectsRoot, '..');
  for (const issue of [
    checkGuildSkew(repoRoot),
    detectCodegenDrift(runCodegenCheck(repoRoot)),
  ]) {
    if (issue !== null) report.issues.push(issue);
  }
  report.ok = report.issues.every((i) => i.severity !== 'error');
  return {
    stdout: emit(report, values.pretty === true),
    exitCode: report.ok ? 0 : 1,
  };
}

export const DOCTOR_VERBS = {
  doctor,
};
