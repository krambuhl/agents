import { parseArgs } from 'node:util';
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { LinearClient } from '../lib/linear-client.ts';
import { resolveAuth } from '../lib/auth.ts';
import { LinearLoomError } from '../lib/errors.ts';
import {
  type LinearMarker,
  type MarkerIO,
  markerPath,
  readMarker,
} from '../lib/marker.ts';
import { defaultGitRunner, type GitRunner } from '../lib/git.ts';
import {
  composeDocumentBody,
  createDocument,
  type CreatedDocument,
} from '../lib/documents.ts';

// `linear-loom plan <slug> --plan-file=... --interview-file=...`
// (PLAN.md Phase 4 D2).
//
// Two-sided verb: writes PLAN.md to git (projects/<slug>/PLAN.md,
// committed via the GitRunner) AND uploads INTERVIEW.md as a Linear
// Document with the standard provenance header.
//
// Mirrors loom's plan-verb shape: refuses overwrite when PLAN.md is
// already committed at the target path. The /linear-loom-plan skill
// (Phase 4 U3) wraps this; operators may also call it directly.

export interface PlanContext {
  client?: LinearClient;
  resolveAuthFn?: typeof resolveAuth;
  projectsRoot?: string;
  markerIO?: MarkerIO;
  gitRunner?: GitRunner;
  repoRoot?: string;
  readFileFn?: (path: string) => string;
  writeFileFn?: (path: string, content: string) => void;
  mkdirFn?: (path: string, opts: { recursive: true }) => void;
  now?: () => string;
}

export interface DispatchResult {
  stdout?: string;
  stderr?: string;
  exitCode: number;
}

export async function plan(
  rest: string[],
  ctx: PlanContext = {},
): Promise<DispatchResult> {
  const { values, positionals } = parseArgs({
    args: rest,
    options: {
      'plan-file': { type: 'string' as const },
      'interview-file': { type: 'string' as const },
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
        'plan requires a positional <slug> argument.',
        { namespace: 'plan' },
      ),
    );
  }

  const planFile = values['plan-file'];
  const interviewFile = values['interview-file'];
  if (typeof planFile !== 'string' || planFile.trim() === '') {
    return errToResult(
      new LinearLoomError(
        'missing-args',
        'plan requires --plan-file=<path>.',
        { namespace: 'plan' },
      ),
    );
  }
  if (typeof interviewFile !== 'string' || interviewFile.trim() === '') {
    return errToResult(
      new LinearLoomError(
        'missing-args',
        'plan requires --interview-file=<path>.',
        { namespace: 'plan' },
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

  let authResolution;
  try {
    authResolution = (ctx.resolveAuthFn ?? resolveAuth)();
  } catch (err) {
    return errToResult(err);
  }

  const client =
    ctx.client ?? new LinearClient({ apiKey: authResolution.apiKey });
  const gitRunner = ctx.gitRunner ?? defaultGitRunner;
  const repoRoot = ctx.repoRoot ?? process.cwd();
  const reader = ctx.readFileFn ?? defaultRead;
  const writer = ctx.writeFileFn ?? defaultWrite;
  const mkdirFn = ctx.mkdirFn ?? defaultMkdir;
  const now = ctx.now ?? defaultNow;
  const syncedAt = now();

  let branch: string;
  let github;
  try {
    branch = gitRunner.currentBranch(repoRoot);
    github = gitRunner.githubRemote(repoRoot);
  } catch (err) {
    return errToResult(err);
  }

  let planBody: string;
  let interviewBody: string;
  try {
    planBody = reader(planFile);
  } catch (err) {
    return errToResult(
      new LinearLoomError(
        'plan-file-unreadable',
        `Cannot read --plan-file=${planFile}: ${(err as Error).message}`,
        { namespace: 'plan' },
      ),
    );
  }
  try {
    interviewBody = reader(interviewFile);
  } catch (err) {
    return errToResult(
      new LinearLoomError(
        'interview-file-unreadable',
        `Cannot read --interview-file=${interviewFile}: ${(err as Error).message}`,
        { namespace: 'plan' },
      ),
    );
  }

  const planTargetRel = join('projects', slug.trim(), 'PLAN.md');
  const planTargetAbs = join(repoRoot, planTargetRel);

  if (gitRunner.isCommitted(repoRoot, planTargetRel)) {
    return errToResult(
      new LinearLoomError(
        'plan-already-committed',
        `${planTargetRel} is already committed on the current branch. Use linear-loom revise-plan to land a revision; plan is for first-write only.`,
        { namespace: 'plan' },
      ),
    );
  }

  try {
    mkdirFn(dirname(planTargetAbs), { recursive: true });
    writer(planTargetAbs, planBody);
  } catch (err) {
    return errToResult(
      new LinearLoomError(
        'plan-write-failed',
        `Could not write ${planTargetRel}: ${(err as Error).message}`,
        { namespace: 'plan' },
      ),
    );
  }

  try {
    gitRunner.addAndCommit(
      repoRoot,
      [planTargetRel],
      `[linear-loom plan] ${slug.trim()}: initial PLAN.md`,
    );
  } catch (err) {
    return errToResult(err);
  }

  const interviewDocumentBody = composeDocumentBody(
    {
      loomProjectName: marker.slug,
      loomProjectLabel: marker.label.replace(/^loom-project:/, ''),
      github,
      branch,
      slug: marker.slug,
      filename: 'INTERVIEW.md',
      syncedAt,
    },
    interviewBody,
  );

  let interviewDoc: CreatedDocument;
  try {
    interviewDoc = await createDocument({
      client,
      projectId: marker.linear_project_id,
      title: `${marker.slug} · INTERVIEW.md`,
      body: interviewDocumentBody,
    });
  } catch (err) {
    return errToResult(
      err instanceof LinearLoomError
        ? new LinearLoomError(
            err.code,
            `${err.message} (PLAN.md committed at ${planTargetRel}; INTERVIEW.md upload failed — re-run after fixing).`,
            { namespace: 'plan' },
          )
        : err,
    );
  }

  return {
    stdout: emit(
      {
        slug: marker.slug,
        linear_project_id: marker.linear_project_id,
        branch,
        synced_at: syncedAt,
        plan: {
          path: planTargetRel,
          committed: true,
        },
        documents: {
          interview: {
            id: interviewDoc.id,
            url: interviewDoc.url,
            title: interviewDoc.title,
          },
        },
      },
      values.pretty === true,
    ),
    exitCode: 0,
  };
}

function defaultRead(path: string): string {
  return readFileSync(path, 'utf8');
}

function defaultWrite(path: string, content: string): void {
  writeFileSync(path, content);
}

function defaultMkdir(path: string, opts: { recursive: true }): void {
  mkdirSync(path, opts);
}

function defaultNow(): string {
  return new Date().toISOString();
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
