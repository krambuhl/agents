import { parseArgs } from 'node:util';
import { execSync } from 'node:child_process';
import {
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  writeFileSync,
} from 'node:fs';
import { join } from 'node:path';
import { resolveProject } from '../../lib/project.ts';
import {
  manifestPath,
  readManifestFile,
} from '../../lib/manifest-toml.ts';
import {
  parseCheckinMarker,
  computeMarkerState,
} from '../../lib/pr-marker.ts';
import { LoomError } from '../../lib/errors.ts';
import { defaultGhRunner } from '../../lib/gh.ts';
import type { GhRunner } from '../../lib/gh.ts';
import type { CliContext, DispatchResult } from './project.ts';

const PR_URL_RE = /https:\/\/[^\s]*\/pull\/(\d+)/;

function emit(value: unknown, pretty: boolean): string {
  return pretty ? JSON.stringify(value, null, 2) : JSON.stringify(value);
}

function errToResult(err: unknown): DispatchResult {
  if (err instanceof LoomError) {
    return { stderr: JSON.stringify(err.toPayload()), exitCode: 1 };
  }
  throw err;
}

const DISCOVER_OPTIONS = {
  pretty: { type: 'boolean' as const },
  branch: { type: 'string' as const },
};

type PrViewResponse = {
  number: number;
  url: string;
  body: string;
  // gh's PR state: "OPEN" | "MERGED" | "CLOSED". Under derive-on-demand this
  // is the authoritative open/merged signal orientation reads (replacing the
  // retired pr-opened/pr-merged events).
  state: string;
  // ISO timestamp populated by gh when state === "MERGED"; absent for OPEN
  // and may be empty string for CLOSED-without-merge.
  mergedAt?: string;
};

function fetchPrForBranch(
  ghRunner: GhRunner,
  branch: string,
): PrViewResponse | null {
  // `gh pr view <branch>` (branch as a positional, NOT a `--head` flag —
  // `--head` belongs to `gh pr list`) resolves the PR for a branch, including
  // merged ones, and exits non-zero when none exists. We treat that as "no
  // PR" and return null.
  try {
    const stdout = ghRunner([
      'pr',
      'view',
      branch,
      '--json',
      'number,url,body,state,mergedAt',
    ]);
    return JSON.parse(stdout) as PrViewResponse;
  } catch {
    return null;
  }
}

export function prDiscover(rest: string[], ctx: CliContext): DispatchResult {
  const { values, positionals } = parseArgs({
    args: rest,
    options: DISCOVER_OPTIONS,
    allowPositionals: true,
    strict: false,
  });
  const slug = positionals[0];
  if (slug === undefined) {
    return errToResult(new LoomError('missing-slug', 'pr discover requires a slug'));
  }
  if (values.branch === undefined) {
    return errToResult(
      new LoomError('missing-args', 'pr discover requires --branch'),
    );
  }
  try {
    const projectPath = resolveProject(slug, ctx.projectsRoot);
    const { manifest } = readManifestFile(manifestPath(projectPath));
    const diskNumbers = manifest.checkins
      .filter((c) => c.branch === values.branch)
      .map((c) => Number.parseInt(c.number, 10))
      .filter((n) => !Number.isNaN(n))
      .sort((a, b) => a - b);

    const gh = ctx.ghRunner ?? defaultGhRunner;
    const pr = fetchPrForBranch(gh, values.branch);
    const marker = pr === null ? null : parseCheckinMarker(pr.body);
    const state = computeMarkerState(diskNumbers, marker);

    const result = {
      checkins: diskNumbers,
      marker_state: state,
      pr:
        pr === null
          ? null
          : prShape(pr),
    };
    return { stdout: emit(result, values.pretty === true), exitCode: 0 };
  } catch (err) {
    return errToResult(err);
  }
}

// Shared JSON projection of a fetched PR — number/url/state always present,
// mergedAt included when gh reported it (set on MERGED PRs, may be empty
// string or absent otherwise). Used by both `pr discover` and `pr wait` so
// the shape stays consistent across PR-state-observing verbs.
function prShape(pr: PrViewResponse): {
  number: number;
  url: string;
  state: string;
  mergedAt?: string;
} {
  const base = { number: pr.number, url: pr.url, state: pr.state };
  return pr.mergedAt !== undefined && pr.mergedAt !== ''
    ? { ...base, mergedAt: pr.mergedAt }
    : base;
}

const OPEN_OPTIONS = {
  pretty: { type: 'boolean' as const },
  title: { type: 'string' as const },
  'body-file': { type: 'string' as const },
  branch: { type: 'string' as const },
  base: { type: 'string' as const },
  draft: { type: 'boolean' as const },
};

export function prOpen(rest: string[], ctx: CliContext): DispatchResult {
  const { values, positionals } = parseArgs({
    args: rest,
    options: OPEN_OPTIONS,
    allowPositionals: true,
    strict: false,
  });
  const slug = positionals[0];
  if (slug === undefined) {
    return errToResult(new LoomError('missing-slug', 'pr open requires a slug'));
  }
  if (values.title === undefined || values['body-file'] === undefined) {
    return errToResult(
      new LoomError('missing-args', 'pr open requires --title and --body-file'),
    );
  }
  try {
    resolveProject(slug, ctx.projectsRoot); // existence check
  } catch (err) {
    return errToResult(err);
  }
  const gh = ctx.ghRunner ?? defaultGhRunner;
  const ghArgs = ['pr', 'create', '--title', values.title, '--body-file', values['body-file']];
  if (values.branch !== undefined) {
    ghArgs.push('--head', values.branch);
  }
  // Forward --base so a stacked PR targets its parent branch rather than the
  // repo default. Omitted → gh defaults to the repo's default branch (main),
  // preserving the unstacked single-PR behavior.
  if (values.base !== undefined) {
    ghArgs.push('--base', values.base);
  }
  // Forward --draft so the loop's release-boundary / escape-hatch paths can
  // open a draft PR (gh's own `--draft` mechanism). Omitted → no flag, so the
  // default open stays a ready PR exactly as before.
  if (values.draft === true) {
    ghArgs.push('--draft');
  }
  let stdout: string;
  try {
    stdout = gh(ghArgs);
  } catch (err: unknown) {
    return errToResult(
      new LoomError('gh-failed', `gh pr create failed: ${(err as Error).message}`),
    );
  }
  const match = PR_URL_RE.exec(stdout);
  if (match === null) {
    return errToResult(
      new LoomError(
        'invalid-pr-url',
        `gh pr create did not return a parseable PR URL: ${stdout.trim()}`,
      ),
    );
  }
  const prNum = Number.parseInt(match[1] as string, 10);
  const url = match[0] as string;
  // PR state is derived on demand via `loom pr discover` (gh + the checkin
  // marker); `pr open` is a thin gh wrapper and records no event — there is
  // no manifest write, so the caller folds nothing into a state-only commit.
  return {
    stdout: emit({ pr: prNum, url }, values.pretty === true),
    exitCode: 0,
  };
}

const UPDATE_OPTIONS = {
  pretty: { type: 'boolean' as const },
  pr: { type: 'string' as const },
  'body-file': { type: 'string' as const },
};

export function prUpdate(rest: string[], ctx: CliContext): DispatchResult {
  const { values, positionals } = parseArgs({
    args: rest,
    options: UPDATE_OPTIONS,
    allowPositionals: true,
    strict: false,
  });
  const slug = positionals[0];
  if (slug === undefined) {
    return errToResult(new LoomError('missing-slug', 'pr update requires a slug'));
  }
  if (values.pr === undefined || values['body-file'] === undefined) {
    return errToResult(
      new LoomError('missing-args', 'pr update requires --pr and --body-file'),
    );
  }
  const prNum = Number.parseInt(values.pr, 10);
  if (Number.isNaN(prNum) || prNum < 0) {
    return errToResult(
      new LoomError('invalid-pr', `--pr must be a non-negative integer: ${values.pr}`),
    );
  }
  try {
    resolveProject(slug, ctx.projectsRoot); // existence check
  } catch (err) {
    return errToResult(err);
  }
  const gh = ctx.ghRunner ?? defaultGhRunner;
  try {
    gh(['pr', 'edit', String(prNum), '--body-file', values['body-file']]);
  } catch (err: unknown) {
    return errToResult(
      new LoomError('gh-failed', `gh pr edit failed: ${(err as Error).message}`),
    );
  }
  // PR body refresh is gh-only and records no event (no manifest write) —
  // current PR state is derived on demand via `loom pr discover`.
  return {
    stdout: emit({ pr: prNum }, values.pretty === true),
    exitCode: 0,
  };
}

const COMMENTS_OPTIONS = {
  pretty: { type: 'boolean' as const },
  pr: { type: 'string' as const },
};

type GhPrCommentsResponse = {
  headRefName: string;
  comments: Array<{ id: number; author: unknown; body: string; createdAt: string }>;
};

export function prComments(rest: string[], ctx: CliContext): DispatchResult {
  const { values, positionals } = parseArgs({
    args: rest,
    options: COMMENTS_OPTIONS,
    allowPositionals: true,
    strict: false,
  });
  const slug = positionals[0];
  if (slug === undefined) {
    return errToResult(new LoomError('missing-slug', 'pr comments requires a slug'));
  }
  if (values.pr === undefined) {
    return errToResult(
      new LoomError('missing-args', 'pr comments requires --pr'),
    );
  }
  const prNum = Number.parseInt(values.pr, 10);
  if (Number.isNaN(prNum) || prNum < 0) {
    return errToResult(
      new LoomError('invalid-pr', `--pr must be a non-negative integer: ${values.pr}`),
    );
  }
  try {
    resolveProject(slug, ctx.projectsRoot); // existence check
  } catch (err) {
    return errToResult(err);
  }
  const gh = ctx.ghRunner ?? defaultGhRunner;
  let stdout: string;
  try {
    stdout = gh(['pr', 'view', String(prNum), '--json', 'comments,headRefName']);
  } catch (err: unknown) {
    return errToResult(
      new LoomError('gh-failed', `gh pr view failed: ${(err as Error).message}`),
    );
  }
  let parsed: GhPrCommentsResponse;
  try {
    parsed = JSON.parse(stdout) as GhPrCommentsResponse;
  } catch (err: unknown) {
    return errToResult(
      new LoomError('gh-invalid-output', `gh stdout was not valid JSON: ${(err as Error).message}`),
    );
  }
  return {
    stdout: emit(
      { pr: prNum, branch: parsed.headRefName, comments: parsed.comments },
      values.pretty === true,
    ),
    exitCode: 0,
  };
}

const RESPOND_OPTIONS = {
  pretty: { type: 'boolean' as const },
  'responses-file': { type: 'string' as const },
};

type ResponsesFile = {
  pr: number;
  branch: string;
  responses: Array<{ comment_id: number; body: string }>;
};

const RESPONSE_FILENAME_RE = /^response-(\d+)\.json$/;

function nextResponseNumber(dir: string): number {
  if (!existsSync(dir)) return 1;
  const entries = readdirSync(dir);
  let max = 0;
  for (const entry of entries) {
    const m = RESPONSE_FILENAME_RE.exec(entry);
    if (m !== null) {
      const n = Number.parseInt(m[1] as string, 10);
      if (!Number.isNaN(n) && n > max) max = n;
    }
  }
  return max + 1;
}

export function prRespond(rest: string[], ctx: CliContext): DispatchResult {
  const { values, positionals } = parseArgs({
    args: rest,
    options: RESPOND_OPTIONS,
    allowPositionals: true,
    strict: false,
  });
  const slug = positionals[0];
  if (slug === undefined) {
    return errToResult(new LoomError('missing-slug', 'pr respond requires a slug'));
  }
  const responsesFile = values['responses-file'];
  if (responsesFile === undefined) {
    return errToResult(
      new LoomError('missing-args', 'pr respond requires --responses-file'),
    );
  }
  let parsed: ResponsesFile;
  try {
    parsed = JSON.parse(readFileSync(responsesFile, 'utf8')) as ResponsesFile;
  } catch (err: unknown) {
    return errToResult(
      new LoomError(
        'responses-file-unreadable',
        `cannot read responses file ${responsesFile}: ${(err as Error).message}`,
      ),
    );
  }
  if (
    typeof parsed.pr !== 'number' ||
    typeof parsed.branch !== 'string' ||
    !Array.isArray(parsed.responses)
  ) {
    return errToResult(
      new LoomError(
        'invalid-responses-file',
        'responses file must have shape {pr, branch, responses[]}',
      ),
    );
  }
  let projectPath: string;
  try {
    projectPath = resolveProject(slug, ctx.projectsRoot);
  } catch (err) {
    return errToResult(err);
  }
  const responsesDir = join(projectPath, 'responses', parsed.branch);
  mkdirSync(responsesDir, { recursive: true });
  let nextN = nextResponseNumber(responsesDir);
  const paths: string[] = [];
  for (const r of parsed.responses) {
    const filename = `response-${String(nextN).padStart(2, '0')}.json`;
    const target = join(responsesDir, filename);
    const written = {
      comment_id: r.comment_id,
      body: r.body,
      created: new Date().toISOString(),
    };
    writeFileSync(target, `${JSON.stringify(written, null, 2)}\n`, 'utf8');
    paths.push(target);
    nextN += 1;
  }
  return {
    stdout: emit({ paths }, values.pretty === true),
    exitCode: 0,
  };
}

// ---------------------------------------------------------------------------
// pr wait — poll gh until terminal state, timeout, or gh-failure threshold
// ---------------------------------------------------------------------------
//
// Values for --interval / --timeout are SECONDS (no unit suffix). Upgrade
// path is `30s` / `30m` duration parsing once a second time-based flag lands
// somewhere in the CLI; until then, document the unit in --help and recipe.
//
// The verb is read-only against gh + manifest. It writes nothing, emits no
// events. The "no pr-* event" decision (LOOM-CONVENTIONS.md:255-263 from
// Phase-6 U1 of substrate-consolidation) is load-bearing for this design;
// adding pr-wait-started / pr-wait-merged would re-open that closed argument.
//
// Re-resolves PR on each poll (does not cache PR number from the first poll)
// so a force-push that closes the old PR and opens a new one with a different
// number is visible to the caller. The verb returns the LAST observed PR
// number, not the first.

const WAIT_OPTIONS = {
  pretty: { type: 'boolean' as const },
  branch: { type: 'string' as const },
  interval: { type: 'string' as const },
  timeout: { type: 'string' as const },
  quiet: { type: 'boolean' as const },
};

const DEFAULT_WAIT_INTERVAL_SEC = 30;
const DEFAULT_WAIT_TIMEOUT_SEC = 1800;
const GH_FAILURE_THRESHOLD = 3;

type WaitExitReason = 'merged' | 'closed' | 'timeout' | 'gh-failed';

type WaitResult = {
  number?: number;
  url?: string;
  state: string;
  exitReason: WaitExitReason;
  mergedAt?: string;
  lastError?: string;
};

function defaultSleepMs(ms: number): void {
  // Sync sleep — the CLI dispatch path returns DispatchResult (not Promise),
  // so we can't await. Delegate to /bin/sleep which blocks deterministically.
  // Tests inject ctx.sleepMs to skip the actual wait.
  execSync(`sleep ${ms / 1000}`, { stdio: 'ignore' });
}

function defaultNowMs(): number {
  return Date.now();
}

export function prWait(rest: string[], ctx: CliContext): DispatchResult {
  const { values, positionals } = parseArgs({
    args: rest,
    options: WAIT_OPTIONS,
    allowPositionals: true,
    strict: false,
  });
  const slug = positionals[0];
  if (slug === undefined) {
    return errToResult(new LoomError('missing-slug', 'pr wait requires a slug'));
  }
  if (values.branch === undefined) {
    return errToResult(
      new LoomError('missing-args', 'pr wait requires --branch'),
    );
  }

  const intervalSec = values.interval === undefined
    ? DEFAULT_WAIT_INTERVAL_SEC
    : Number.parseInt(values.interval, 10);
  if (
    Number.isNaN(intervalSec) ||
    intervalSec <= 0 ||
    String(intervalSec) !== values.interval && values.interval !== undefined
  ) {
    return errToResult(
      new LoomError(
        'invalid-interval',
        `--interval must be a positive integer (seconds): ${values.interval}`,
      ),
    );
  }
  const timeoutSec = values.timeout === undefined
    ? DEFAULT_WAIT_TIMEOUT_SEC
    : Number.parseInt(values.timeout, 10);
  if (
    Number.isNaN(timeoutSec) ||
    timeoutSec <= 0 ||
    String(timeoutSec) !== values.timeout && values.timeout !== undefined
  ) {
    return errToResult(
      new LoomError(
        'invalid-timeout',
        `--timeout must be a positive integer (seconds): ${values.timeout}`,
      ),
    );
  }

  try {
    resolveProject(slug, ctx.projectsRoot); // existence check
  } catch (err) {
    return errToResult(err);
  }

  const gh = ctx.ghRunner ?? defaultGhRunner;
  const sleepMs = ctx.sleepMs ?? defaultSleepMs;
  const nowMs = ctx.nowMs ?? defaultNowMs;
  const quiet = values.quiet === true;
  const pretty = values.pretty === true;
  const branch = values.branch;
  const intervalMs = intervalSec * 1000;
  const deadlineMs = nowMs() + timeoutSec * 1000;

  if (!quiet) {
    process.stderr.write(
      `pr wait: polling branch=${branch}, interval=${intervalSec}s, timeout=${timeoutSec}s\n`,
    );
  }

  let consecutiveFailures = 0;
  let lastError: string | undefined;
  let lastPr: PrViewResponse | null = null;
  let isFirstPoll = true;

  while (true) {
    // Inline gh call so we distinguish "PR not found" (gh non-zero with
    // expected message) from "gh threw an error" (network / auth / rate
    // limit). fetchPrForBranch's null-swallowing semantics are right for
    // prDiscover (no PR → marker_state=new) but lossy here.
    let pr: PrViewResponse | null = null;
    let pollFailed = false;
    try {
      const stdout = gh(['pr', 'view', branch, '--json', 'number,url,body,state,mergedAt']);
      pr = JSON.parse(stdout) as PrViewResponse;
    } catch (err: unknown) {
      pollFailed = true;
      lastError = (err as Error).message;
    }

    if (isFirstPoll && pr === null) {
      // First poll returned no PR — fail loud. The wait verb assumes the PR
      // already exists; opening it is pr open's job.
      return errToResult(
        new LoomError(
          'pr-not-found',
          `pr wait: no PR found for branch ${branch} on first poll. Open it with pr open first.`,
        ),
      );
    }
    isFirstPoll = false;

    if (pollFailed) {
      consecutiveFailures += 1;
      if (consecutiveFailures >= GH_FAILURE_THRESHOLD) {
        // Terminal gh failure — break silence even when --quiet is set.
        const result: WaitResult = {
          state: lastPr?.state ?? 'UNKNOWN',
          exitReason: 'gh-failed',
          lastError: lastError ?? 'gh failed N consecutive times',
        };
        if (lastPr !== null) {
          result.number = lastPr.number;
          result.url = lastPr.url;
        }
        process.stderr.write(
          `pr wait: gh failed ${consecutiveFailures} consecutive times — exiting (last error: ${result.lastError})\n`,
        );
        return { stdout: emit(result, pretty), exitCode: 0 };
      }
    } else if (pr !== null) {
      consecutiveFailures = 0;
      lastPr = pr;
      if (pr.state !== 'OPEN') {
        const exitReason: WaitExitReason = pr.state === 'MERGED' ? 'merged' : 'closed';
        const result: WaitResult = {
          number: pr.number,
          url: pr.url,
          state: pr.state,
          exitReason,
        };
        if (exitReason === 'merged' && pr.mergedAt !== undefined && pr.mergedAt !== '') {
          result.mergedAt = pr.mergedAt;
        }
        if (!quiet) {
          process.stderr.write(
            `pr wait: branch=${branch} reached terminal state ${pr.state} (exitReason=${exitReason})\n`,
          );
        }
        return { stdout: emit(result, pretty), exitCode: 0 };
      }
    }

    // Timeout check after poll, before sleep — so a successful poll at the
    // deadline still gets recorded; only a NEXT-poll attempt past the deadline
    // exits with timeout.
    if (nowMs() >= deadlineMs) {
      const result: WaitResult = {
        state: lastPr?.state ?? 'OPEN',
        exitReason: 'timeout',
      };
      if (lastPr !== null) {
        result.number = lastPr.number;
        result.url = lastPr.url;
      }
      if (!quiet) {
        process.stderr.write(
          `pr wait: branch=${branch} timeout after ${timeoutSec}s\n`,
        );
      }
      return { stdout: emit(result, pretty), exitCode: 0 };
    }

    if (!quiet) {
      const state = lastPr?.state ?? 'unknown';
      process.stderr.write(
        `pr wait: state=${state} consecutive_failures=${consecutiveFailures} next in ${intervalSec}s\n`,
      );
    }
    sleepMs(intervalMs);
  }
}

export const PR_VERBS = {
  discover: prDiscover,
  open: prOpen,
  update: prUpdate,
  comments: prComments,
  respond: prRespond,
  wait: prWait,
};
