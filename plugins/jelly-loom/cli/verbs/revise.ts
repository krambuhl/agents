import { parseArgs } from 'node:util';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { JellyError } from '../lib/errors.ts';
import { resolveProject } from '../lib/project.ts';
import { type GitRunner, defaultGitRunner } from '../lib/git.ts';
import type { CliContext, DispatchResult } from '../lib/types.ts';

// `jelly revise <slug> --target=plan|research --revision-file=<path>
//  --rationale=<str> [--no-commit]` replaces PLAN.md or RESEARCH.md with
// new content and appends a `## Revision log` entry. Generalizes loom's
// revise-plan to a --target-selected file.

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

// Target → the file it revises.
const TARGET_FILES: Record<string, string> = {
  plan: 'PLAN.md',
  research: 'RESEARCH.md',
};

// Insert a new revision-log entry into the content. If a
// `## Revision log` section exists, the entry goes directly under the
// heading (newest-first); otherwise a fresh section is appended.
// Ported from loom's appendRevisionLogEntry.
export function appendRevisionLogEntry(
  content: string,
  date: string,
  rationale: string,
): string {
  const entry = `- ${date} — ${rationale}`;
  const headingRe = /^## Revision log\s*$/m;
  const match = content.match(headingRe);
  if (match === null) {
    const sep = content.endsWith('\n') ? '\n' : '\n\n';
    return `${content.trimEnd()}${sep}\n## Revision log\n\n${entry}\n`;
  }
  const headingStart = match.index ?? 0;
  const headingEnd = headingStart + (match[0]?.length ?? 0);
  const before = content.slice(0, headingEnd);
  const after = content.slice(headingEnd);
  const afterTrimmed = after.replace(/^\n+/, '');
  return `${before}\n\n${entry}\n\n${afterTrimmed}`;
}

const REVISE_OPTIONS = {
  target: { type: 'string' as const },
  'revision-file': { type: 'string' as const },
  rationale: { type: 'string' as const },
  'no-commit': { type: 'boolean' as const },
  pretty: { type: 'boolean' as const },
};

export function reviseVerb(rest: string[], ctx: CliContext): DispatchResult {
  const { values, positionals } = parseArgs({
    args: rest,
    options: REVISE_OPTIONS,
    allowPositionals: true,
    strict: false,
  });
  const slug = positionals[0];
  const target = values.target;
  const revisionFile = values['revision-file'];
  const rationale = values.rationale;
  const noCommit = values['no-commit'] === true;
  const pretty = values.pretty === true;

  if (slug === undefined) {
    return errToResult(new JellyError('missing-args', 'revise requires a <slug> positional'));
  }
  if (target === undefined) {
    return errToResult(
      new JellyError('missing-args', 'revise requires --target=plan|research'),
    );
  }
  if (!Object.hasOwn(TARGET_FILES, target)) {
    return errToResult(
      new JellyError(
        'invalid-target',
        `--target must be 'plan' or 'research' (got '${target}')`,
      ),
    );
  }
  if (revisionFile === undefined) {
    return errToResult(
      new JellyError('missing-args', 'revise requires --revision-file=<path>'),
    );
  }
  if (rationale === undefined || rationale.trim() === '') {
    return errToResult(
      new JellyError(
        'missing-args',
        'revise requires --rationale=<str> (the why for git history + the Revision log)',
      ),
    );
  }

  let targetDir: string;
  try {
    targetDir = resolveProject(slug, ctx.projectsRoot);
  } catch (err) {
    return errToResult(err);
  }

  const targetFileName = TARGET_FILES[target] as string;
  const targetPath = join(targetDir, targetFileName);
  if (!existsSync(targetPath)) {
    return errToResult(
      new JellyError(
        'target-not-found',
        `no ${targetFileName} at ${targetPath} — use 'jelly ${target === 'plan' ? 'plan' : 'research'}' to create one`,
      ),
    );
  }

  let revisionContent: string;
  try {
    revisionContent = readFileSync(revisionFile, 'utf8');
  } catch (err: unknown) {
    return errToResult(
      new JellyError(
        'revision-read-failed',
        `cannot read revision file ${revisionFile}: ${(err as Error).message}`,
      ),
    );
  }

  const composed = appendRevisionLogEntry(revisionContent, todayString(ctx), rationale);

  try {
    writeFileSync(targetPath, composed);
  } catch (err: unknown) {
    return errToResult(
      new JellyError(
        'revise-write-failed',
        `writing ${targetFileName} failed: ${(err as Error).message}`,
      ),
    );
  }

  const resolvedSlug = targetDir.split('/').pop() ?? slug;

  if (!noCommit) {
    try {
      gitRunnerOf(ctx).addAndCommit(
        repoRootOf(ctx),
        [targetPath],
        `[jelly revise] ${resolvedSlug} (${target}): ${rationale}`,
      );
    } catch (err) {
      return errToResult(err);
    }
  }

  return {
    stdout: emit(
      { slug: resolvedSlug, path: targetDir, target, committed: !noCommit, rationale },
      pretty,
    ),
    exitCode: 0,
  };
}

export const REVISE_VERBS = {
  revise: reviseVerb,
};
