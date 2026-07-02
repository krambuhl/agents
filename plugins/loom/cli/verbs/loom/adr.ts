import { parseArgs } from 'node:util';
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { LoomError } from '../../lib/errors.ts';
import { kebabCase } from '../../lib/project.ts';
import { type GitRunner, defaultGitRunner, commitState } from '../../lib/git.ts';
import type { CliContext, DispatchResult } from './project.ts';

// `loom adr "<title>" [--body-file=<path>] [--status=<status>]
//  [--no-commit]` appends a workspace-level Architectural Decision
// Record at projects/adr-log/NNNN-<title-slug>.md with sequential
// GLOBAL numbering (max existing + 1). The adr-log is workspace-level,
// NOT per-project — the one bit of cross-project shared state in loom.

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

// The next ADR number for the adr-log: max existing NNNN + 1 (NOT
// count + 1 — numbers are never reused, so a deleted ADR leaves a
// permanent gap and the next number keeps climbing). Returns 1 for an
// absent or empty adr-log. Zero-padding is applied by the caller.
export function nextAdrNumber(adrLogDir: string): number {
  if (!existsSync(adrLogDir)) return 1;
  let max = 0;
  for (const name of readdirSync(adrLogDir)) {
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

function composeAdr(
  numberStr: string,
  title: string,
  date: string,
  status: string,
  body: string,
): string {
  return [
    `# ${numberStr}. ${title}`,
    '',
    `- **Date**: ${date}`,
    `- **Status**: ${status}`,
    '',
    body.trimEnd(),
    '',
  ].join('\n');
}

const ADR_OPTIONS = {
  'body-file': { type: 'string' as const },
  status: { type: 'string' as const },
  'no-commit': { type: 'boolean' as const },
  pretty: { type: 'boolean' as const },
};

export function adrVerb(rest: string[], ctx: CliContext): DispatchResult {
  const { values, positionals } = parseArgs({
    args: rest,
    options: ADR_OPTIONS,
    allowPositionals: true,
    strict: false,
  });
  const title = positionals[0];
  const bodyFile = values['body-file'];
  const status = values.status ?? 'accepted';
  const noCommit = values['no-commit'] === true;
  const pretty = values.pretty === true;

  if (title === undefined || title.trim() === '') {
    return errToResult(
      new LoomError('missing-args', 'adr requires a non-empty "<title>" positional argument'),
    );
  }

  const slug = kebabCase(title);
  if (slug.length < 2) {
    return errToResult(
      new LoomError(
        'invalid-title',
        `title '${title}' slugifies to '${slug}' (must produce at least 2 slug chars)`,
      ),
    );
  }

  let body: string;
  if (bodyFile === undefined) {
    body = '## Context\n\n<!-- TODO: what forces the decision? -->\n\n## Decision\n\n<!-- TODO: what was decided? -->\n\n## Consequences\n\n<!-- TODO: what follows from it? -->';
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

  const adrLogDir = join(ctx.projectsRoot, 'adr-log');
  const number = nextAdrNumber(adrLogDir);
  const numberStr = padNumber(number);
  const fileName = `${numberStr}-${slug}.md`;
  const adrPath = join(adrLogDir, fileName);

  const content = composeAdr(numberStr, title, todayString(ctx), status, body);

  try {
    mkdirSync(adrLogDir, { recursive: true });
    writeFileSync(adrPath, content);
  } catch (err: unknown) {
    return errToResult(
      new LoomError('adr-write-failed', `writing the ADR failed: ${(err as Error).message}`),
    );
  }

  if (!noCommit) {
    try {
      commitState(gitRunnerOf(ctx), repoRootOf(ctx), [adrPath], `[loom] adr ${numberStr}: ${title}`, { push: ctx.storeAutosync === true });
    } catch (err) {
      return errToResult(err);
    }
  }

  return {
    stdout: emit(
      { number: numberStr, slug, path: adrPath, status, committed: !noCommit },
      pretty,
    ),
    exitCode: 0,
  };
}

export const ADR_VERBS = {
  adr: adrVerb,
};
