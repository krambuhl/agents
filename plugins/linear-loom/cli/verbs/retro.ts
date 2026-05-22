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

// `linear-loom retro <slug> --type=<type> --retro-file=<path>`
// (PLAN.md Phase 4 D3).
//
// Uploads a retrospective markdown file to Linear as a Document under
// the loom-project's bound Linear Project. `--type` is operator-
// supplied (e.g. "phase-3", "project", "phase-7-followup") and
// becomes part of the Document title and filename in the provenance
// header. No git commit — retros are operator-curated, the
// /linear-loom-archive skill (U3) will decide whether and where to
// commit them; this verb just handles the Linear-side upload.

export interface RetroContext {
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

// Retro types are operator-supplied so the substrate doesn't constrain
// the vocabulary, but we enforce a kebab-case shape so the filename +
// title pattern reads cleanly. Reject leading/trailing dashes, uppercase
// chars, and whitespace.
const RETRO_TYPE_PATTERN = /^[a-z0-9]+(-[a-z0-9]+)*$/;

export async function retro(
  rest: string[],
  ctx: RetroContext = {},
): Promise<DispatchResult> {
  const { values, positionals } = parseArgs({
    args: rest,
    options: {
      type: { type: 'string' as const },
      'retro-file': { type: 'string' as const },
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
        'retro requires a positional <slug> argument.',
        { namespace: 'retro' },
      ),
    );
  }

  const retroType = values.type;
  const retroFile = values['retro-file'];
  if (typeof retroType !== 'string' || retroType.trim() === '') {
    return errToResult(
      new LinearLoomError(
        'missing-args',
        'retro requires --type=<kebab-case-name>.',
        { namespace: 'retro' },
      ),
    );
  }
  if (!RETRO_TYPE_PATTERN.test(retroType.trim())) {
    return errToResult(
      new LinearLoomError(
        'invalid-retro-type',
        `--type=${retroType} must be kebab-case (lowercase a-z, 0-9, hyphens; no leading/trailing dashes).`,
        { namespace: 'retro' },
      ),
    );
  }
  if (typeof retroFile !== 'string' || retroFile.trim() === '') {
    return errToResult(
      new LinearLoomError(
        'missing-args',
        'retro requires --retro-file=<path>.',
        { namespace: 'retro' },
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

  let retroBody: string;
  try {
    retroBody = reader(retroFile);
  } catch (err) {
    return errToResult(
      new LinearLoomError(
        'retro-file-unreadable',
        `Cannot read --retro-file=${retroFile}: ${(err as Error).message}`,
        { namespace: 'retro' },
      ),
    );
  }

  const retroFilename = `RETRO-${retroType.trim()}.md`;
  const retroTitle = `${marker.slug} · RETRO-${retroType.trim()}`;

  const retroDocumentBody = composeDocumentBody(
    {
      loomProjectName: marker.slug,
      loomProjectLabel: marker.label.replace(/^loom-project:/, ''),
      github,
      branch,
      slug: marker.slug,
      filename: retroFilename,
      syncedAt,
    },
    retroBody,
  );

  let retroDoc: CreatedDocument;
  try {
    retroDoc = await createDocument({
      client,
      projectId: marker.linear_project_id,
      title: retroTitle,
      body: retroDocumentBody,
    });
  } catch (err) {
    return errToResult(err);
  }

  return {
    stdout: emit(
      {
        slug: marker.slug,
        linear_project_id: marker.linear_project_id,
        branch,
        synced_at: syncedAt,
        retro_type: retroType.trim(),
        document: {
          id: retroDoc.id,
          url: retroDoc.url,
          title: retroDoc.title,
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
