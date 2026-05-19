import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import type { DispatchResult, GriotCliContext } from './index.ts';
import { resolveProjectRoot } from './_project-root.ts';

// Subdirs scaffolded at init. session-notes is the active write path
// for `griot capture`; nightly is named in `use.ts`'s tier-separation
// prose as a path the LLM must NOT read at session time. Both are
// created so the on-disk shape self-documents the tier structure.
const LEARNINGS_SUBDIRS = ['session-notes', 'nightly'] as const;

// The single line `griot init` appends to .gitignore. The trailing
// slash makes the entry directory-specific so a future top-level
// `learnings.md` file isn't accidentally swept under it.
const GITIGNORE_LINE = 'learnings/';

type InitResult = {
  learnings_created: boolean;
  subdirs_created: ReadonlyArray<string>;
  gitignore_amended: 'created' | 'appended' | 'unchanged';
};

function ensureLearningsTree(projectRoot: string): {
  learningsCreated: boolean;
  subdirsCreated: string[];
} {
  const learningsDir = join(projectRoot, 'learnings');
  const learningsExisted = existsSync(learningsDir);

  const subdirsCreated: string[] = [];
  for (const subdir of LEARNINGS_SUBDIRS) {
    const path = join(learningsDir, subdir);
    if (!existsSync(path)) {
      mkdirSync(path, { recursive: true });
      subdirsCreated.push(subdir);
    }
  }

  return {
    learningsCreated: !learningsExisted,
    subdirsCreated,
  };
}

function amendGitignore(projectRoot: string): InitResult['gitignore_amended'] {
  const path = join(projectRoot, '.gitignore');

  if (!existsSync(path)) {
    writeFileSync(path, `${GITIGNORE_LINE}\n`, 'utf8');
    return 'created';
  }

  const existing = readFileSync(path, 'utf8');
  const lines = existing.split('\n');
  // Match on the trimmed line so `learnings/`, `learnings/ ` (trailing
  // whitespace), and `learnings/` already are treated as equivalent.
  // Don't match `learnings/foo` — those are deeper paths that don't
  // satisfy the directory-level ignore.
  const alreadyPresent = lines.some((line: string) => line.trim() === GITIGNORE_LINE);
  if (alreadyPresent) {
    return 'unchanged';
  }

  // Preserve existing trailing newline behavior: if the file ends
  // with a newline, append `learnings/\n` after it; if not, insert a
  // newline before our line so we don't fuse onto the last entry.
  const needsSeparator = existing.length > 0 && !existing.endsWith('\n');
  const addition = `${needsSeparator ? '\n' : ''}${GITIGNORE_LINE}\n`;
  writeFileSync(path, existing + addition, 'utf8');
  return 'appended';
}

function renderStdout(action: InitResult): string {
  const parts: string[] = [];
  if (action.learnings_created) {
    parts.push('learnings/ created');
  }
  if (action.subdirs_created.length > 0) {
    parts.push(`subdirs created: ${action.subdirs_created.join(', ')}`);
  }
  parts.push(`.gitignore ${action.gitignore_amended}`);
  if (parts.length === 1) {
    // Only .gitignore line was logged and it's "unchanged" — single-line
    // no-op summary.
    return `griot init: no changes (${action.gitignore_amended})`;
  }
  return `griot init: ${parts.join('; ')}`;
}

export function initVerb(
  _rest: string[],
  ctx: GriotCliContext,
): DispatchResult {
  const projectRoot = resolveProjectRoot(ctx.cwd);
  const tree = ensureLearningsTree(projectRoot);
  const gitignore = amendGitignore(projectRoot);

  const action: InitResult = {
    learnings_created: tree.learningsCreated,
    subdirs_created: tree.subdirsCreated,
    gitignore_amended: gitignore,
  };

  return {
    stdout: renderStdout(action),
    exitCode: 0,
  };
}
