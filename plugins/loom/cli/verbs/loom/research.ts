import { parseArgs } from 'node:util';
import { copyFileSync, existsSync, mkdirSync } from 'node:fs';
import { join, relative } from 'node:path';
import { LoomError } from '../../lib/errors.ts';
import { createSlug } from '../../lib/project.ts';
import { type GitRunner, defaultGitRunner } from '../../lib/git.ts';
import {
  appendEvent,
  manifestPath as manifestPathFor,
  readManifestFile,
  writeManifest,
} from '../../lib/manifest-toml.ts';
import {
  writeLoomSubstrate,
  synthesizeManifestInit,
  synthesizeConfig,
} from '../../lib/adopt.ts';
import type { Event } from '../../lib/types.ts';

// Append one event into the project's manifest.toml [[events]] (load →
// append → write). The research verb records research-started before its
// commit and research-completed after, so each is its own read-modify-write.
function recordEvent(targetDir: string, event: Event): void {
  const mp = manifestPathFor(targetDir);
  const { manifest, token } = readManifestFile(mp);
  writeManifest(mp, appendEvent(manifest, event), { expect: token });
}

// `loom research` shares its context shape with plan/revise (today,
// gitRunner, repoRoot). Loom's umbrella `CliContext` (cli/verbs/project.ts)
// is structurally assignable to this type — see the comment on
// `PlanCliContext` for the same boundary.
export type ResearchCliContext = {
  projectsRoot: string;
  today?: string;
  gitRunner?: GitRunner;
  repoRoot?: string;
};

export type DispatchResult = {
  stdout?: string;
  stderr?: string;
  exitCode: number;
};

export type VerbHandler = (
  rest: string[],
  ctx: ResearchCliContext,
) => DispatchResult;

function emit(value: unknown, pretty: boolean): string {
  return pretty ? JSON.stringify(value, null, 2) : JSON.stringify(value);
}

function errToResult(err: unknown): DispatchResult {
  if (err instanceof LoomError) {
    return { stderr: JSON.stringify(err.toPayload()), exitCode: 1 };
  }
  throw err;
}

function todayString(ctx: ResearchCliContext): string {
  return ctx.today ?? new Date().toISOString().slice(0, 10);
}

function nowIso(): string {
  return new Date().toISOString();
}

function gitRunnerOf(ctx: ResearchCliContext): GitRunner {
  return ctx.gitRunner ?? defaultGitRunner;
}

function repoRootOf(ctx: ResearchCliContext): string {
  return ctx.repoRoot ?? process.cwd();
}

const SLUG_RE = /^\d{4}-\d{2}-\d{2}-[a-z0-9][a-z0-9-]*[a-z0-9]$/;

const RESEARCH_OPTIONS = {
  'research-file': { type: 'string' as const },
  'notes-file': { type: 'string' as const },
  'no-commit': { type: 'boolean' as const },
  'no-loom': { type: 'boolean' as const },
  pretty: { type: 'boolean' as const },
};

export function researchVerb(
  rest: string[],
  ctx: ResearchCliContext,
): DispatchResult {
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
  const noLoom = values['no-loom'] === true;
  const pretty = values.pretty === true;

  if (slugOrTopic === undefined) {
    return errToResult(
      new LoomError(
        'missing-args',
        'research requires a <slug-or-topic> positional argument',
      ),
    );
  }
  if (researchFile === undefined) {
    return errToResult(
      new LoomError(
        'missing-args',
        'research requires --research-file=<path>',
      ),
    );
  }
  if (notesFile === undefined) {
    return errToResult(
      new LoomError('missing-args', 'research requires --notes-file=<path>'),
    );
  }

  // Cheap source-file validation before we mkdir/write anything in the
  // project tree. Catches the common "wrong path" mistake with a clean
  // error rather than a half-created project directory.
  if (!existsSync(researchFile)) {
    return errToResult(
      new LoomError(
        'research-file-not-found',
        `--research-file does not exist at ${researchFile}`,
      ),
    );
  }
  if (!existsSync(notesFile)) {
    return errToResult(
      new LoomError(
        'notes-file-not-found',
        `--notes-file does not exist at ${notesFile}`,
      ),
    );
  }

  const topicWasSlug = SLUG_RE.test(slugOrTopic);
  let slug: string;
  try {
    slug = topicWasSlug
      ? slugOrTopic
      : createSlug(slugOrTopic, todayString(ctx));
  } catch (err) {
    return errToResult(err);
  }

  const targetDir = join(ctx.projectsRoot, slug);
  const researchMdPath = join(targetDir, 'RESEARCH.md');
  const notesMdPath = join(targetDir, 'RESEARCH-NOTES.md');

  // Collision check on RESEARCH.md: committed → refuse (matches the
  // plan-exists-committed shape); uncommitted → overwrite (failed-
  // commit recovery path). A future `loom revise-research` verb is
  // listed under Deferred in PLAN.md; for now revisions go through
  // re-running with a fresh research file in a clean project state.
  if (existsSync(researchMdPath)) {
    const committed = gitRunnerOf(ctx).isCommitted(
      repoRootOf(ctx),
      researchMdPath,
    );
    if (committed) {
      return errToResult(
        new LoomError(
          'research-exists-committed',
          `RESEARCH.md at ${researchMdPath} is already committed — re-running 'loom research' on a committed project is not supported (Deferred: loom revise-research)`,
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
      new LoomError(
        'research-write-failed',
        `writing RESEARCH.md/RESEARCH-NOTES.md failed: ${(err as Error).message}`,
      ),
    );
  }

  // Auto-adopt loom substrate, matching plan.ts's shape. Skipped on
  // --no-loom or when manifest.json already exists. The `loom_adopted`
  // boolean tracks this fresh-adoption case; the `loom_present` boolean
  // below covers both fresh-adopt and the "manifest already there"
  // recovery path, which is what we key event emission on.
  const filesToCommit = [researchMdPath, notesMdPath];
  const manifestPath = manifestPathFor(targetDir);
  const manifestPreexisted = existsSync(manifestPath);
  const adoptLoom = !noLoom && !manifestPreexisted;
  if (adoptLoom) {
    try {
      writeLoomSubstrate({
        projectDir: targetDir,
        slug,
        config: synthesizeConfig(),
        manifestInit: synthesizeManifestInit(slug, todayString(ctx)),
      });
      // All state lives in the single manifest.toml now (config.json /
      // events.jsonl folded in), so it is the only state file to commit.
      filesToCommit.push(manifestPath);
    } catch (err: unknown) {
      return errToResult(
        new LoomError(
          'loom-adopt-failed',
          `auto-adopting loom failed: ${(err as Error).message}`,
        ),
      );
    }
  }

  // Emit research-started + research-completed events when an
  // events.jsonl is present (either freshly adopted or pre-existing).
  // The --no-loom + no-pre-existing-manifest case skips event emission
  // by design: there's no event sink to write into. PLAN.md 3.3 dictates
  // these emissions; the verb is the first CLI-side caller — the skill
  // (D2) emits the rest (shift, panel, fact-check, budget-exhausted).
  const loomPresent = adoptLoom || manifestPreexisted;
  if (loomPresent) {
    try {
      recordEvent(targetDir, {
        at: nowIso(),
        event: 'research-started',
        detail: { slug, topic: topicWasSlug ? null : slugOrTopic },
      });
    } catch (err: unknown) {
      return errToResult(err);
    }
  }

  if (!noCommit) {
    try {
      gitRunnerOf(ctx).addAndCommit(
        repoRootOf(ctx),
        filesToCommit,
        `[loom research] ${slug}`,
      );
    } catch (err) {
      return errToResult(err);
    }
  }

  // research-completed lands after the commit so the events.jsonl
  // contains both signals of a successful run by the time downstream
  // readers look at it. If the commit step itself failed (above), the
  // verb has already returned with an error and this never fires —
  // events.jsonl will then carry a research-started without a matching
  // completion, which is the correct signal for partial-failure
  // forensics.
  if (loomPresent) {
    try {
      recordEvent(targetDir, {
        at: nowIso(),
        event: 'research-completed',
        detail: {
          slug,
          research_path: relative(targetDir, researchMdPath) || 'RESEARCH.md',
          notes_path:
            relative(targetDir, notesMdPath) || 'RESEARCH-NOTES.md',
        },
      });
    } catch (err: unknown) {
      return errToResult(err);
    }
  }

  return {
    stdout: emit(
      {
        slug,
        path: targetDir,
        committed: !noCommit,
        loom_adopted: adoptLoom,
        events_emitted: loomPresent,
      },
      pretty,
    ),
    exitCode: 0,
  };
}

// Verbless-namespace registry for cli/loom.ts. `loom research` is
// wired the same way `loom plan` / `loom revise-plan` / `loom doctor`
// are: a single-handler namespace.
export const RESEARCH_VERBS = {
  research: researchVerb,
};
