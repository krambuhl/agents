import { parseArgs } from 'node:util';
import { copyFileSync, existsSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { JellyError } from '../lib/errors.ts';
import { createSlug, SLUG_RE } from '../lib/project.ts';
import { type GitRunner, defaultGitRunner } from '../lib/git.ts';
import type { CliContext, DispatchResult } from '../lib/types.ts';

// `jelly research <slug-or-topic> --research-file=<path> --notes-file=<path>`
// files a pre-authored research dossier into projects/<slug>/ and
// commits. Unlike loom's research, it writes NO manifest, NO config,
// and NO events.jsonl — jelly's manifest is written by `jelly plan`
// (the manifest is write-once at plan time) and jelly keeps no event
// log. The verb is purely the filing mechanism; content authoring
// happens upstream (the /goal lead agent or the operator drafts the
// files this verb copies in).

function emit(value: unknown, pretty: boolean): string {
  return pretty ? JSON.stringify(value, null, 2) : JSON.stringify(value);
}

function errToResult(err: unknown): DispatchResult {
  if (err instanceof JellyError) {
    return { stderr: JSON.stringify(err.toPayload()), exitCode: 1 };
  }
  throw err;
}

function todayString(ctx: CliContext): string {
  return ctx.today ?? new Date().toISOString().slice(0, 10);
}

function gitRunnerOf(ctx: CliContext): GitRunner {
  return ctx.gitRunner ?? defaultGitRunner;
}

function repoRootOf(ctx: CliContext): string {
  return ctx.repoRoot ?? process.cwd();
}

const RESEARCH_OPTIONS = {
  'research-file': { type: 'string' as const },
  'notes-file': { type: 'string' as const },
  'no-commit': { type: 'boolean' as const },
  pretty: { type: 'boolean' as const },
};

export function researchVerb(rest: string[], ctx: CliContext): DispatchResult {
  const { values, positionals } = parseArgs({
    args: rest,
    options: RESEARCH_OPTIONS,
    allowPositionals: true,
    strict: false,
  });
  const slugOrTopic = positionals[0];
  const researchFile = values['research-file'];
  const notesFile = values['notes-file'];
  const noCommit = values['no-commit'] === true;
  const pretty = values.pretty === true;

  if (slugOrTopic === undefined) {
    return errToResult(
      new JellyError(
        'missing-args',
        'research requires a <slug-or-topic> positional argument',
      ),
    );
  }
  if (researchFile === undefined) {
    return errToResult(
      new JellyError('missing-args', 'research requires --research-file=<path>'),
    );
  }
  if (notesFile === undefined) {
    return errToResult(
      new JellyError('missing-args', 'research requires --notes-file=<path>'),
    );
  }

  // Cheap source-file validation before we mkdir/write anything in the
  // project tree — catches the common wrong-path mistake with a clean
  // error rather than a half-created project directory.
  if (!existsSync(researchFile)) {
    return errToResult(
      new JellyError(
        'research-file-not-found',
        `--research-file does not exist at ${researchFile}`,
      ),
    );
  }
  if (!existsSync(notesFile)) {
    return errToResult(
      new JellyError(
        'notes-file-not-found',
        `--notes-file does not exist at ${notesFile}`,
      ),
    );
  }

  const topicWasSlug = SLUG_RE.test(slugOrTopic);
  let slug: string;
  try {
    slug = topicWasSlug ? slugOrTopic : createSlug(slugOrTopic, todayString(ctx));
  } catch (err) {
    return errToResult(err);
  }

  const targetDir = join(ctx.projectsRoot, slug);
  const researchMdPath = join(targetDir, 'RESEARCH.md');
  const notesMdPath = join(targetDir, 'RESEARCH-NOTES.md');

  // Collision check on RESEARCH.md: committed → refuse (a committed
  // dossier means the project exists; re-running research on it is a
  // revise, which `jelly revise --target=research` (U5) owns).
  // Uncommitted → overwrite (recovery from a failed prior commit).
  if (existsSync(researchMdPath)) {
    const committed = gitRunnerOf(ctx).isCommitted(repoRootOf(ctx), researchMdPath);
    if (committed) {
      return errToResult(
        new JellyError(
          'research-exists-committed',
          `RESEARCH.md at ${researchMdPath} is already committed — use 'jelly revise --target=research' to revise a committed dossier`,
        ),
      );
    }
  }

  try {
    mkdirSync(targetDir, { recursive: true });
    copyFileSync(researchFile, researchMdPath);
    copyFileSync(notesFile, notesMdPath);
  } catch (err: unknown) {
    return errToResult(
      new JellyError(
        'research-write-failed',
        `writing RESEARCH.md/RESEARCH-NOTES.md failed: ${(err as Error).message}`,
      ),
    );
  }

  if (!noCommit) {
    try {
      gitRunnerOf(ctx).addAndCommit(
        repoRootOf(ctx),
        [researchMdPath, notesMdPath],
        `[jelly research] ${slug}`,
      );
    } catch (err) {
      return errToResult(err);
    }
  }

  return {
    stdout: emit(
      {
        slug,
        path: targetDir,
        research_path: 'RESEARCH.md',
        notes_path: 'RESEARCH-NOTES.md',
        committed: !noCommit,
      },
      pretty,
    ),
    exitCode: 0,
  };
}

// Verbless-namespace registry for cli/jelly.ts. `jelly research` is a
// single-handler namespace (the namespace IS the verb).
export const RESEARCH_VERBS = {
  research: researchVerb,
};
