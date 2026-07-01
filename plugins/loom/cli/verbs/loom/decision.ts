import { parseArgs } from 'node:util';
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { LoomError } from '../../lib/errors.ts';
import { kebabCase, resolveProject } from '../../lib/project.ts';
import { type GitRunner, defaultGitRunner, commitState } from '../../lib/git.ts';
import type { CliContext, DispatchResult } from './project.ts';

// `loom decision <slug> "<title>" [--body-file=<path>] [--status=<status>]
//  [--scope=<text>] [--no-commit]` records a PROJECT-SCOPED decision at
// projects/<slug>/decisions/NNNN-<title-slug>.md with numbering scoped to
// that project's decisions/ dir (Phase 3, distributed-project-store). Unlike
// `loom adr` (workspace-level, projects/adr-log/), a project decision travels
// WITH the project so every machine working it sees it (decisions 0001/0009).
// `loom decision list <slug>` lists them. Append-only per-record markdown:
// concurrent writes from different machines land on different filenames.

function emit(value: unknown, pretty: boolean): string {
  return pretty ? JSON.stringify(value, null, 2) : JSON.stringify(value);
}

function errToResult(err: unknown): DispatchResult {
  if (err instanceof LoomError) {
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

// Max existing NNNN + 1 (never reuse a number — a deleted decision leaves a
// permanent gap). Returns 1 for an absent/empty decisions dir.
export function nextDecisionNumber(decisionsDir: string): number {
  if (!existsSync(decisionsDir)) return 1;
  let max = 0;
  for (const name of readdirSync(decisionsDir)) {
    const match = name.match(/^(\d{4})-.*\.md$/);
    if (match === null) continue;
    const n = Number.parseInt(match[1] as string, 10);
    if (n > max) max = n;
  }
  return max + 1;
}

function padNumber(n: number): string {
  return String(n).padStart(4, '0');
}

function composeDecision(
  numberStr: string,
  title: string,
  date: string,
  status: string,
  scope: string,
  body: string,
): string {
  return [
    `# ${numberStr}. ${title}`,
    '',
    `- **Status**: ${status}`,
    `- **Scope**: ${scope}`,
    `- **Date**: ${date}`,
    '',
    body.trimEnd(),
    '',
  ].join('\n');
}

const DECISION_OPTIONS = {
  'body-file': { type: 'string' as const },
  status: { type: 'string' as const },
  scope: { type: 'string' as const },
  'no-commit': { type: 'boolean' as const },
  pretty: { type: 'boolean' as const },
};

function decisionsDirFor(ctx: CliContext, slug: string): string {
  // resolveProject throws project-not-found / slug-ambiguous for a bad slug.
  return join(resolveProject(slug, ctx.projectsRoot), 'decisions');
}

function writeDecision(rest: string[], ctx: CliContext): DispatchResult {
  const { values, positionals } = parseArgs({
    args: rest,
    options: DECISION_OPTIONS,
    allowPositionals: true,
    strict: false,
  });
  const slug = positionals[0];
  const title = positionals[1];
  const pretty = values.pretty === true;

  if (slug === undefined || slug.trim() === '') {
    return errToResult(
      new LoomError('missing-args', 'decision requires a <slug> positional argument'),
    );
  }
  if (title === undefined || title.trim() === '') {
    return errToResult(
      new LoomError('missing-args', 'decision requires a non-empty "<title>" positional argument'),
    );
  }

  const titleSlug = kebabCase(title);
  if (titleSlug.length < 2) {
    return errToResult(
      new LoomError(
        'invalid-title',
        `title '${title}' slugifies to '${titleSlug}' (must produce at least 2 slug chars)`,
      ),
    );
  }

  const bodyFile = values['body-file'];
  let body: string;
  if (bodyFile === undefined) {
    body = '## Decision\n\n<!-- TODO -->\n\n## Why\n\n<!-- TODO -->\n\n## Consequences\n\n<!-- TODO -->';
  } else {
    if (!existsSync(bodyFile)) {
      return errToResult(
        new LoomError('body-file-not-found', `--body-file does not exist at ${bodyFile}`),
      );
    }
    try {
      body = readFileSync(bodyFile, 'utf8');
    } catch (err: unknown) {
      return errToResult(
        new LoomError('body-read-failed', `cannot read --body-file ${bodyFile}: ${(err as Error).message}`),
      );
    }
  }

  let decisionsDir: string;
  try {
    decisionsDir = decisionsDirFor(ctx, slug);
  } catch (err) {
    return errToResult(err);
  }

  const number = nextDecisionNumber(decisionsDir);
  const numberStr = padNumber(number);
  const fileName = `${numberStr}-${titleSlug}.md`;
  const decisionPath = join(decisionsDir, fileName);
  const status = values.status ?? 'accepted';
  const scope = values.scope ?? 'project scope';
  const content = composeDecision(numberStr, title, todayString(ctx), status, scope, body);

  try {
    mkdirSync(decisionsDir, { recursive: true });
    writeFileSync(decisionPath, content);
  } catch (err: unknown) {
    return errToResult(
      new LoomError('decision-write-failed', `writing the decision failed: ${(err as Error).message}`),
    );
  }

  if (values['no-commit'] !== true) {
    try {
      commitState(gitRunnerOf(ctx), repoRootOf(ctx), [decisionPath], `[loom] decision ${numberStr}: ${title}`, { push: ctx.storeAutosync === true });
    } catch (err) {
      return errToResult(err);
    }
  }

  return {
    stdout: emit(
      { number: numberStr, slug, title_slug: titleSlug, path: decisionPath, status, scope, committed: values['no-commit'] !== true },
      pretty,
    ),
    exitCode: 0,
  };
}

function listDecisions(rest: string[], ctx: CliContext): DispatchResult {
  const { values, positionals } = parseArgs({
    args: rest,
    options: { pretty: { type: 'boolean' as const } },
    allowPositionals: true,
    strict: false,
  });
  const slug = positionals[0];
  if (slug === undefined || slug.trim() === '') {
    return errToResult(
      new LoomError('missing-args', 'decision list requires a <slug> positional argument'),
    );
  }

  let decisionsDir: string;
  try {
    decisionsDir = decisionsDirFor(ctx, slug);
  } catch (err) {
    return errToResult(err);
  }

  const items: { number: string; file: string }[] = [];
  if (existsSync(decisionsDir)) {
    for (const name of readdirSync(decisionsDir).sort()) {
      const match = name.match(/^(\d{4})-.*\.md$/);
      if (match === null) continue;
      items.push({ number: match[1] as string, file: name });
    }
  }
  return { stdout: emit({ slug, decisions: items }, values.pretty === true), exitCode: 0 };
}

// Verbless namespace: the first arg is `list` (sub-verb) or the project slug
// (write). `loom decision <slug> "<title>"` writes; `loom decision list <slug>`
// lists.
export function decisionVerb(rest: string[], ctx: CliContext): DispatchResult {
  if (rest[0] === 'list') {
    return listDecisions(rest.slice(1), ctx);
  }
  return writeDecision(rest, ctx);
}

export const DECISION_VERBS = {
  decision: decisionVerb,
};
