import { parseArgs } from 'node:util';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { resolveProject } from '../../lib/project.ts';
import {
  appendEvent,
  appendPhase,
  manifestPath,
  readManifestFile,
  updatePhase,
  writeManifest,
} from '../../lib/manifest-toml.ts';
import { parsePlan } from '../../lib/plan.ts';
import { LoomError } from '../../lib/errors.ts';
import type { Event, ManifestPhase, PhaseStatus } from '../../lib/types.ts';
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

export function phaseRead(rest: string[], ctx: CliContext): DispatchResult {
  const { values, positionals } = parseArgs({
    args: rest,
    options: { pretty: { type: 'boolean' } },
    allowPositionals: true,
    strict: false,
  });
  const slug = positionals[0];
  const phaseArg = positionals[1];
  if (slug === undefined || phaseArg === undefined) {
    return errToResult(
      new LoomError('missing-args', 'phase read requires <slug> <N>'),
    );
  }
  const phaseNum = Number.parseInt(phaseArg, 10);
  if (Number.isNaN(phaseNum) || String(phaseNum) !== phaseArg) {
    return errToResult(
      new LoomError(
        'invalid-phase',
        `phase number must be an integer: ${phaseArg}`,
      ),
    );
  }
  try {
    const path = resolveProject(slug, ctx.projectsRoot);
    const { manifest } = readManifestFile(manifestPath(path));
    const phase = manifest.phases.find((p) => p.number === phaseNum);
    if (phase === undefined) {
      return errToResult(
        new LoomError(
          'phase-not-found',
          `phase ${phaseNum} not in project ${slug}`,
        ),
      );
    }
    return { stdout: emit(phase, values.pretty === true), exitCode: 0 };
  } catch (err) {
    return errToResult(err);
  }
}

export function phaseList(rest: string[], ctx: CliContext): DispatchResult {
  const { values, positionals } = parseArgs({
    args: rest,
    options: { pretty: { type: 'boolean' } },
    allowPositionals: true,
    strict: false,
  });
  const slug = positionals[0];
  if (slug === undefined) {
    return errToResult(
      new LoomError('missing-slug', 'phase list requires a slug'),
    );
  }
  try {
    const path = resolveProject(slug, ctx.projectsRoot);
    const { manifest } = readManifestFile(manifestPath(path));
    return { stdout: emit(manifest.phases, values.pretty === true), exitCode: 0 };
  } catch (err) {
    return errToResult(err);
  }
}

// `loom phase ready <slug>` — the FULL set of not-started phases whose
// dependencies are all satisfied, not just the single lowest-numbered one
// `/ev-run`'s §3 next-phase policy picks. Exists to back parallel dispatch
// (ADR-0012): fanning out N independent phases to N environments needs to
// know all of them at once, not just "the next one." §3's single-pick
// policy is unchanged — it can (and does) just take the lowest-numbered
// entry from this same set.
//
// A dependency is satisfied when the depended-on phase's manifest status is
// `completed` (mirrors §3 exactly). A dependsOn id with no matching manifest
// phase is treated as unsatisfied (conservative) and reported in
// `unresolvedDeps` rather than silently ignored.
export function phaseReady(rest: string[], ctx: CliContext): DispatchResult {
  const { values, positionals } = parseArgs({
    args: rest,
    options: { pretty: { type: 'boolean' } },
    allowPositionals: true,
    strict: false,
  });
  const slug = positionals[0];
  if (slug === undefined) {
    return errToResult(new LoomError('missing-slug', 'phase ready requires a slug'));
  }
  try {
    const path = resolveProject(slug, ctx.projectsRoot);
    const { manifest } = readManifestFile(manifestPath(path));

    const planMdPath = join(path, 'PLAN.md');
    if (!existsSync(planMdPath)) {
      return errToResult(new LoomError('plan-not-found', `no PLAN.md at ${planMdPath}`));
    }
    const { plan } = parsePlan(readFileSync(planMdPath, 'utf8'));

    const statusByNumber = new Map(manifest.phases.map((p) => [p.number, p.status]));
    const ready: ManifestPhase[] = [];
    const unresolvedDeps: Array<{ number: number; depId: string }> = [];

    for (const phase of manifest.phases) {
      if (phase.status !== 'not-started') continue;
      const parsed = plan.phasesById[String(phase.number)];
      const dependsOn = parsed?.dependsOn ?? [];
      let satisfied = true;
      for (const depId of dependsOn) {
        const depNumber = Number(depId);
        const depStatus = statusByNumber.get(depNumber);
        if (depStatus === undefined) {
          unresolvedDeps.push({ number: phase.number, depId });
          satisfied = false;
          continue;
        }
        if (depStatus !== 'completed') satisfied = false;
      }
      if (satisfied) ready.push(phase);
    }

    return {
      stdout: emit({ ready, unresolvedDeps }, values.pretty === true),
      exitCode: 0,
    };
  } catch (err) {
    return errToResult(err);
  }
}

function eventForTransition(
  prior: PhaseStatus,
  next: PhaseStatus,
  phaseNum: number,
  name: string,
  reason: string | undefined,
): Event | null {
  const now = new Date().toISOString();
  if (next === 'in-progress' && prior === 'blocked') {
    return { at: now, event: 'phase-unblocked', detail: { phase: phaseNum } };
  }
  if (next === 'in-progress') {
    return {
      at: now,
      event: 'phase-started',
      detail: { phase: phaseNum, name },
    };
  }
  if (next === 'completed') {
    return { at: now, event: 'phase-completed', detail: { phase: phaseNum } };
  }
  if (next === 'blocked') {
    return {
      at: now,
      event: 'phase-blocked',
      detail: { phase: phaseNum, reason: reason ?? '' },
    };
  }
  return null;
}

const PHASE_STATUSES: ReadonlySet<PhaseStatus> = new Set([
  'not-started',
  'in-progress',
  'blocked',
  'completed',
]);

export function phaseUpdate(rest: string[], ctx: CliContext): DispatchResult {
  const { values, positionals } = parseArgs({
    args: rest,
    options: {
      pretty: { type: 'boolean' },
      status: { type: 'string' },
      branch: { type: 'string' },
      reason: { type: 'string' },
      pr: { type: 'string' },
      url: { type: 'string' },
      'pr-state': { type: 'string' },
    },
    allowPositionals: true,
    strict: false,
  });
  // PR state is derived on demand via `loom pr discover` (gh pr view + the
  // checkin marker), not stored on the phase row and not emitted as events —
  // see manifest-toml.ts:299-302 and types.ts:83-86. Fail loud rather than
  // accept-and-drop the flags, which would mislead operators into thinking
  // the manifest tracks PR state.
  if (
    values.pr !== undefined
    || values.url !== undefined
    || values['pr-state'] !== undefined
  ) {
    return errToResult(
      new LoomError(
        'pr-flags-unsupported',
        '--pr/--url/--pr-state are not stored on the phase or emitted as events; PR state is derived on demand via `loom pr discover` (see manifest-toml.ts:299-302 and types.ts:83-86 for the derive-don\'t-store decision)',
      ),
    );
  }
  const slug = positionals[0];
  const phaseArg = positionals[1];
  if (slug === undefined || phaseArg === undefined) {
    return errToResult(
      new LoomError('missing-args', 'phase update requires <slug> <N>'),
    );
  }
  const phaseNum = Number.parseInt(phaseArg, 10);
  if (Number.isNaN(phaseNum) || String(phaseNum) !== phaseArg) {
    return errToResult(
      new LoomError(
        'invalid-phase',
        `phase number must be an integer: ${phaseArg}`,
      ),
    );
  }
  const status = values.status;
  if (status === undefined || !PHASE_STATUSES.has(status as PhaseStatus)) {
    return errToResult(
      new LoomError(
        'missing-args',
        'phase update requires --status=(not-started|in-progress|blocked|completed)',
      ),
    );
  }
  if (status === 'blocked' && values.reason === undefined) {
    return errToResult(
      new LoomError('missing-args', 'status=blocked requires --reason'),
    );
  }
  try {
    const path = resolveProject(slug, ctx.projectsRoot);
    const { manifest, token } = readManifestFile(manifestPath(path));
    const phase = manifest.phases.find((p) => p.number === phaseNum);
    if (phase === undefined) {
      return errToResult(
        new LoomError(
          'phase-not-found',
          `phase ${phaseNum} not in project ${slug}`,
        ),
      );
    }
    const prior = phase.status;
    const updated: ManifestPhase = { ...phase, status: status as PhaseStatus };
    if (values.branch !== undefined) updated.branch = values.branch;
    if (status === 'blocked') updated.blocked_reason = values.reason;
    let next = updatePhase(manifest, phaseNum, updated);
    const event = eventForTransition(
      prior,
      status as PhaseStatus,
      phaseNum,
      phase.name,
      values.reason,
    );
    if (event !== null) {
      next = appendEvent(next, event);
    }
    writeManifest(manifestPath(path), next, { expect: token });
    return { stdout: emit(updated, values.pretty === true), exitCode: 0 };
  } catch (err) {
    return errToResult(err);
  }
}

export function phaseAdd(rest: string[], ctx: CliContext): DispatchResult {
  const { values, positionals } = parseArgs({
    args: rest,
    options: {
      pretty: { type: 'boolean' },
      number: { type: 'string' },
      name: { type: 'string' },
      status: { type: 'string' },
      branch: { type: 'string' },
    },
    allowPositionals: true,
    strict: false,
  });
  const slug = positionals[0];
  if (slug === undefined) {
    return errToResult(new LoomError('missing-args', 'phase add requires <slug>'));
  }
  const numberArg = values.number;
  if (numberArg === undefined) {
    return errToResult(
      new LoomError('missing-args', 'phase add requires --number=<N>'),
    );
  }
  const phaseNum = Number.parseInt(numberArg, 10);
  if (Number.isNaN(phaseNum) || String(phaseNum) !== numberArg) {
    return errToResult(
      new LoomError(
        'invalid-phase',
        `phase number must be an integer: ${numberArg}`,
      ),
    );
  }
  const name = values.name;
  if (name === undefined || name === '') {
    return errToResult(
      new LoomError('missing-args', 'phase add requires --name=<name>'),
    );
  }
  const status = values.status ?? 'not-started';
  if (!PHASE_STATUSES.has(status as PhaseStatus)) {
    return errToResult(
      new LoomError(
        'invalid-status',
        `--status must be one of not-started|in-progress|blocked|completed: ${status}`,
      ),
    );
  }
  try {
    const path = resolveProject(slug, ctx.projectsRoot);
    const { manifest, token } = readManifestFile(manifestPath(path));
    const newPhase: ManifestPhase = {
      number: phaseNum,
      name,
      status: status as PhaseStatus,
    };
    if (values.branch !== undefined) newPhase.branch = values.branch;
    const next = appendPhase(manifest, newPhase);
    writeManifest(manifestPath(path), next, { expect: token });
    return { stdout: emit(newPhase, values.pretty === true), exitCode: 0 };
  } catch (err) {
    return errToResult(err);
  }
}

export const PHASE_VERBS = {
  read: phaseRead,
  list: phaseList,
  ready: phaseReady,
  update: phaseUpdate,
  add: phaseAdd,
};
