import { parseArgs } from 'node:util';
import {
  copyFileSync,
  existsSync,
  mkdirSync,
  readFileSync,
  writeFileSync,
} from 'node:fs';
import { basename, join, relative } from 'node:path';
import { LoomError } from '../../lib/errors.ts';
import { createSlug, resolveProject } from '../../lib/project.ts';
import { type GitRunner, defaultGitRunner, commitState } from '../../lib/git.ts';
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
  storeAutosync?: boolean;
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
  // append / show flags (harmless on init, which ignores them)
  section: { type: 'string' as const },
  'fact-file': { type: 'string' as const },
  citing: { type: 'string' as const },
  phase: { type: 'string' as const },
};

// `init` — today's copy-in behavior: take a slug-or-topic + a prepared
// RESEARCH.md / RESEARCH-NOTES.md and scaffold the dossier (auto-adopting
// loom + emitting research-started/-completed). The verb-family's other
// members (append, show) land in the next unit; `amend` is the
// `/loom-research --mode=amend` skill, not a CLI verb.
export function researchInit(
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
        'research init requires a <slug-or-topic> positional argument',
      ),
    );
  }
  if (researchFile === undefined) {
    return errToResult(
      new LoomError(
        'missing-args',
        'research init requires --research-file=<path>',
      ),
    );
  }
  if (notesFile === undefined) {
    return errToResult(
      new LoomError('missing-args', 'research init requires --notes-file=<path>'),
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
      commitState(
        gitRunnerOf(ctx),
        repoRootOf(ctx),
        filesToCommit,
        `[loom research] ${slug}`,
        { push: ctx.storeAutosync === true },
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

// `append` — add a provenance-stamped, append-only block to an existing
// RESEARCH.md. The block is a `## <section>` heading + a `loom:provenance`
// HTML comment carrying strict JSON (slug, phase?, session?, at, citing),
// then the freeform prose from --fact-file. Provenance is derived from the
// substrate: `session` is the latest session-handoff filename stem,
// `phase` is --phase or the in-progress phase. Append-only: prior blocks
// are never read-modified, only new content is added at the end.
//
// Block boundaries are implicit (next `## ` heading or `---`), per the
// chosen format — so the appended prose must not itself contain a `## `
// heading or a bare `---`, or `show --section` would mis-split it.
export function researchAppend(
  rest: string[],
  ctx: ResearchCliContext,
): DispatchResult {
  const { values, positionals } = parseArgs({
    args: rest,
    options: RESEARCH_OPTIONS,
    allowPositionals: true,
    strict: false,
  });
  const slug = positionals[0];
  const section = values.section;
  const factFile = values['fact-file'];
  const citing = values.citing;
  const noCommit = values['no-commit'] === true;
  const pretty = values.pretty === true;

  if (slug === undefined) {
    return errToResult(
      new LoomError('missing-args', 'research append requires a <slug> positional argument'),
    );
  }
  if (section === undefined || section === '') {
    return errToResult(
      new LoomError('missing-args', 'research append requires --section=<heading>'),
    );
  }
  if (factFile === undefined) {
    return errToResult(
      new LoomError('missing-args', 'research append requires --fact-file=<path>'),
    );
  }
  if (citing === undefined) {
    return errToResult(
      new LoomError('missing-args', 'research append requires --citing=<source>'),
    );
  }
  if (!existsSync(factFile)) {
    return errToResult(
      new LoomError('fact-file-not-found', `--fact-file does not exist at ${factFile}`),
    );
  }

  let targetDir: string;
  try {
    targetDir = resolveProject(slug, ctx.projectsRoot);
  } catch (err) {
    return errToResult(err);
  }
  const researchMdPath = join(targetDir, 'RESEARCH.md');
  if (!existsSync(researchMdPath)) {
    return errToResult(
      new LoomError(
        'research-not-found',
        `no RESEARCH.md at ${researchMdPath} — run 'loom research init' first`,
      ),
    );
  }

  // Provenance, derived from the manifest. `session` = latest handoff
  // filename stem (omitted if none saved yet); `phase` = --phase override
  // or the in-progress phase (omitted if neither).
  const { manifest } = readManifestFile(manifestPathFor(targetDir));
  const resolvedSlug = basename(targetDir);
  // The session id is the handoff's `<date>-<letter>` stem (the filename
  // minus .json). Session records store date + letter, not the filename.
  const lastSession = manifest.sessions[manifest.sessions.length - 1];
  const session =
    lastSession !== undefined
      ? `${lastSession.date}-${lastSession.letter}`
      : undefined;
  let phase: number | undefined;
  if (values.phase !== undefined) {
    const parsed = Number.parseInt(values.phase, 10);
    if (Number.isNaN(parsed) || String(parsed) !== values.phase) {
      return errToResult(
        new LoomError('invalid-phase', `--phase must be an integer: ${values.phase}`),
      );
    }
    phase = parsed;
  } else {
    phase = manifest.phases.find((p) => p.status === 'in-progress')?.number;
  }

  const provenance: Record<string, unknown> = { slug: resolvedSlug };
  if (phase !== undefined) provenance.phase = phase;
  if (session !== undefined) provenance.session = session;
  provenance.at = nowIso();
  provenance.citing = citing;

  const factText = readFileSync(factFile, 'utf8').replace(/\s+$/, '');
  const block = `\n## ${section}\n<!-- loom:provenance\n${JSON.stringify(provenance)}\n-->\n\n${factText}\n`;

  // Append-only: normalize the existing file to a single trailing newline,
  // then add the new block. Prior bytes are otherwise untouched.
  const existing = readFileSync(researchMdPath, 'utf8').replace(/\n*$/, '\n');
  writeFileSync(researchMdPath, existing + block, 'utf8');

  if (!noCommit) {
    try {
      commitState(
        gitRunnerOf(ctx),
        repoRootOf(ctx),
        [researchMdPath],
        `[loom research] append "${section}" to ${resolvedSlug}`,
        { push: ctx.storeAutosync === true },
      );
    } catch (err) {
      return errToResult(err);
    }
  }

  return {
    stdout: emit(
      { slug: resolvedSlug, section, path: researchMdPath, provenance, committed: !noCommit },
      pretty,
    ),
    exitCode: 0,
  };
}

// `show` — read the dossier, or a single `## <section>` block (boundary =
// the next `## ` heading or a `---` line, or EOF). Output is JSON
// ({slug, path, section?, content}); --pretty indents it.
export function researchShow(
  rest: string[],
  ctx: ResearchCliContext,
): DispatchResult {
  const { values, positionals } = parseArgs({
    args: rest,
    options: RESEARCH_OPTIONS,
    allowPositionals: true,
    strict: false,
  });
  const slug = positionals[0];
  const section = values.section;
  const pretty = values.pretty === true;

  if (slug === undefined) {
    return errToResult(
      new LoomError('missing-args', 'research show requires a <slug> positional argument'),
    );
  }
  let targetDir: string;
  try {
    targetDir = resolveProject(slug, ctx.projectsRoot);
  } catch (err) {
    return errToResult(err);
  }
  const researchMdPath = join(targetDir, 'RESEARCH.md');
  if (!existsSync(researchMdPath)) {
    return errToResult(
      new LoomError(
        'research-not-found',
        `no RESEARCH.md at ${researchMdPath} — run 'loom research init' first`,
      ),
    );
  }
  const fullContent = readFileSync(researchMdPath, 'utf8');
  const resolvedSlug = basename(targetDir);

  if (section === undefined) {
    return {
      stdout: emit({ slug: resolvedSlug, path: researchMdPath, content: fullContent }, pretty),
      exitCode: 0,
    };
  }

  // Extract the named section: from its `## <section>` heading to the next
  // `## ` heading or a standalone `---`, or EOF.
  const lines = fullContent.split('\n');
  const startIdx = lines.findIndex((l: string) => l.trimEnd() === `## ${section}`);
  if (startIdx === -1) {
    return errToResult(
      new LoomError('section-not-found', `no '## ${section}' section in ${researchMdPath}`),
    );
  }
  let endIdx = lines.length;
  for (let i = startIdx + 1; i < lines.length; i++) {
    const line = lines[i] as string;
    if (line.startsWith('## ') || line.trimEnd() === '---') {
      endIdx = i;
      break;
    }
  }
  const content = lines.slice(startIdx, endIdx).join('\n').replace(/\n+$/, '\n');
  return {
    stdout: emit({ slug: resolvedSlug, section, path: researchMdPath, content }, pretty),
    exitCode: 0,
  };
}

// `loom research` subverb registry for cli/loom.ts. `init` scaffolds the
// dossier; `append` adds provenance-stamped blocks; `show` reads it. The
// `/loom-research --mode=amend` skill composes `append`; there is no
// `amend` CLI verb.
export const RESEARCH_VERBS = {
  init: researchInit,
  append: researchAppend,
  show: researchShow,
};
