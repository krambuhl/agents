import { parseArgs } from 'node:util';
import { readFileSync } from 'node:fs';
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

// `linear-loom research <slug> --research-file=... --notes-file=...`
// (DESIGN.md § 13, PLAN.md Phase 4 D1)
//
// Uploads RESEARCH.md and RESEARCH-NOTES.md to Linear as Documents
// under the loom-project's bound Linear Project. Each Document gets
// the standard 3-line provenance header (DESIGN.md § 13). Operator
// runs this manually after the source markdown is on disk; the
// /linear-loom-research skill (Phase 4 U4) wraps it.

export interface ResearchContext {
  client?: LinearClient;
  resolveAuthFn?: typeof resolveAuth;
  projectsRoot?: string;
  markerIO?: MarkerIO;
  gitRunner?: GitRunner;
  repoRoot?: string;
  readFileFn?: (path: string) => string;
  now?: () => string;
}

export interface DispatchResult {
  stdout?: string;
  stderr?: string;
  exitCode: number;
}

export async function research(
  rest: string[],
  ctx: ResearchContext = {},
): Promise<DispatchResult> {
  const { values, positionals } = parseArgs({
    args: rest,
    options: {
      'research-file': { type: 'string' as const },
      'notes-file': { type: 'string' as const },
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
        'research requires a positional <slug> argument.',
        { namespace: 'research' },
      ),
    );
  }

  const researchFile = values['research-file'];
  const notesFile = values['notes-file'];
  if (typeof researchFile !== 'string' || researchFile.trim() === '') {
    return errToResult(
      new LinearLoomError(
        'missing-args',
        'research requires --research-file=<path>.',
        { namespace: 'research' },
      ),
    );
  }
  if (typeof notesFile !== 'string' || notesFile.trim() === '') {
    return errToResult(
      new LinearLoomError(
        'missing-args',
        'research requires --notes-file=<path>.',
        { namespace: 'research' },
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

  let researchBody: string;
  let notesBody: string;
  try {
    researchBody = reader(researchFile);
  } catch (err) {
    return errToResult(
      new LinearLoomError(
        'research-file-unreadable',
        `Cannot read --research-file=${researchFile}: ${(err as Error).message}`,
        { namespace: 'research' },
      ),
    );
  }
  try {
    notesBody = reader(notesFile);
  } catch (err) {
    return errToResult(
      new LinearLoomError(
        'notes-file-unreadable',
        `Cannot read --notes-file=${notesFile}: ${(err as Error).message}`,
        { namespace: 'research' },
      ),
    );
  }

  const researchTitle = `${marker.slug} · RESEARCH.md`;
  const notesTitle = `${marker.slug} · RESEARCH-NOTES.md`;

  const researchDocumentBody = composeDocumentBody(
    {
      loomProjectName: marker.slug,
      loomProjectLabel: marker.label.replace(/^loom-project:/, ''),
      github,
      branch,
      slug: marker.slug,
      filename: 'RESEARCH.md',
      syncedAt,
    },
    researchBody,
  );
  const notesDocumentBody = composeDocumentBody(
    {
      loomProjectName: marker.slug,
      loomProjectLabel: marker.label.replace(/^loom-project:/, ''),
      github,
      branch,
      slug: marker.slug,
      filename: 'RESEARCH-NOTES.md',
      syncedAt,
    },
    notesBody,
  );

  let researchDoc: CreatedDocument;
  let notesDoc: CreatedDocument;
  try {
    researchDoc = await createDocument({
      client,
      projectId: marker.linear_project_id,
      title: researchTitle,
      body: researchDocumentBody,
    });
  } catch (err) {
    return errToResult(err);
  }
  try {
    notesDoc = await createDocument({
      client,
      projectId: marker.linear_project_id,
      title: notesTitle,
      body: notesDocumentBody,
    });
  } catch (err) {
    return errToResult(
      err instanceof LinearLoomError
        ? new LinearLoomError(
            err.code,
            `${err.message} (RESEARCH.md uploaded as ${researchDoc.url}; RESEARCH-NOTES.md upload failed — re-run after fixing).`,
            { namespace: 'research' },
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
        documents: {
          research: { id: researchDoc.id, url: researchDoc.url, title: researchDoc.title },
          notes: { id: notesDoc.id, url: notesDoc.url, title: notesDoc.title },
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
