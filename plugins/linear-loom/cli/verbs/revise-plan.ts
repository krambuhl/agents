import { parseArgs } from 'node:util';
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { LinearLoomError } from '../lib/errors.ts';
import {
  type LinearMarker,
  type MarkerIO,
  markerPath,
  readMarker,
} from '../lib/marker.ts';
import { defaultGitRunner, type GitRunner } from '../lib/git.ts';
import { appendRevisionLogEntry } from '../lib/revision-log.ts';

// `linear-loom revise-plan <slug> --revision-file=<path> --rationale=<str>`
// — replaces PLAN.md with the contents of --revision-file, appends a
// dated `- <date> — <rationale>` entry to the document's `## Revision
// log` section (creating the section if it doesn't exist), and
// commits via git unless `--no-commit` is passed.
//
// Linear-side note: PLAN.md is git-only authority per DESIGN.md § 14
// (decisions-in-git posture for linear-loom). This verb does not
// re-upload PLAN.md to Linear — the Linear-side artifact under any
// loom-project is the Sub-Issue / Milestone tree synthesized by
// `linear-loom tasks generate`, not the plan markdown itself.
//
// Counterpart of loom's `loom revise-plan` (plugins/loom/cli/verbs/
// loom/plan.ts:252). Marker-based slug resolution diverges from
// loom's PLAN.md-presence resolution since linear-loom uses
// projects/<slug>/linear.json as the source-of-truth marker.

export interface RevisePlanContext {
  projectsRoot?: string;
  markerIO?: MarkerIO;
  gitRunner?: GitRunner;
  repoRoot?: string;
  readFileFn?: (path: string) => string;
  writeFileFn?: (path: string, contents: string) => void;
  existsFn?: (path: string) => boolean;
  now?: () => Date;
}

export interface DispatchResult {
  stdout?: string;
  stderr?: string;
  exitCode: number;
}

export async function revisePlan(
  rest: string[],
  ctx: RevisePlanContext = {},
): Promise<DispatchResult> {
  const { values, positionals } = parseArgs({
    args: rest,
    options: {
      'revision-file': { type: 'string' as const },
      rationale: { type: 'string' as const },
      'no-commit': { type: 'boolean' as const },
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
        'revise-plan requires a positional <slug> argument.',
        { namespace: 'revise-plan' },
      ),
    );
  }

  const revisionFile = values['revision-file'];
  if (typeof revisionFile !== 'string' || revisionFile.trim() === '') {
    return errToResult(
      new LinearLoomError(
        'missing-args',
        'revise-plan requires --revision-file=<path> (the new PLAN.md contents).',
        { namespace: 'revise-plan' },
      ),
    );
  }

  const rationale = values.rationale;
  if (typeof rationale !== 'string' || rationale.trim() === '') {
    return errToResult(
      new LinearLoomError(
        'missing-args',
        'revise-plan requires --rationale=<str> (the why for git history + Revision log).',
        { namespace: 'revise-plan' },
      ),
    );
  }

  const projectsRoot = ctx.projectsRoot ?? 'projects';
  const target = markerPath(slug.trim(), projectsRoot);

  let marker: LinearMarker;
  try {
    marker = readMarker(target, ctx.markerIO);
  } catch (err) {
    return errToResult(err);
  }

  const projectDir = join(projectsRoot, marker.slug);
  const planMdPath = join(projectDir, 'PLAN.md');
  const exists = ctx.existsFn ?? existsSync;
  if (!exists(planMdPath)) {
    return errToResult(
      new LinearLoomError(
        'plan-not-found',
        `no PLAN.md at ${planMdPath} — use /linear-loom-plan to create one`,
        { namespace: 'revise-plan' },
      ),
    );
  }

  const reader = ctx.readFileFn ?? defaultRead;
  let revisionContent: string;
  try {
    revisionContent = reader(revisionFile);
  } catch (err) {
    return errToResult(
      new LinearLoomError(
        'revision-read-failed',
        `cannot read revision file ${revisionFile}: ${(err as Error).message}`,
        { namespace: 'revise-plan' },
      ),
    );
  }

  const now = (ctx.now ?? defaultNow)();
  const date = now.toISOString().slice(0, 10);
  const composed = appendRevisionLogEntry(
    revisionContent,
    date,
    rationale.trim(),
  );

  const writer = ctx.writeFileFn ?? defaultWrite;
  try {
    writer(planMdPath, composed);
  } catch (err) {
    return errToResult(
      new LinearLoomError(
        'plan-write-failed',
        `writing PLAN.md failed: ${(err as Error).message}`,
        { namespace: 'revise-plan' },
      ),
    );
  }

  const noCommit = values['no-commit'] === true;
  if (!noCommit) {
    const gitRunner = ctx.gitRunner ?? defaultGitRunner;
    const repoRoot = ctx.repoRoot ?? process.cwd();
    try {
      gitRunner.addAndCommit(
        repoRoot,
        [planMdPath],
        `[linear-loom revise-plan] ${marker.slug}: ${rationale.trim()}`,
      );
    } catch (err) {
      return errToResult(err);
    }
  }

  return {
    stdout: emit(
      {
        slug: marker.slug,
        path: projectDir,
        committed: !noCommit,
        rationale: rationale.trim(),
      },
      values.pretty === true,
    ),
    exitCode: 0,
  };
}

function defaultRead(path: string): string {
  return readFileSync(path, 'utf8');
}

function defaultWrite(path: string, contents: string): void {
  writeFileSync(path, contents, 'utf8');
}

function defaultNow(): Date {
  return new Date();
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
