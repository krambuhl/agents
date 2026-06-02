import { existsSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import type { DispatchResult, GriotCliContext } from './index.ts';
import { resolveProjectRoot } from './_project-root.ts';

// Subdirs scaffolded at init. session-notes is the active write path
// for `griot capture`; nightly is named in `use.ts`'s tier-separation
// prose as a path the LLM must NOT read at session time. Both are
// created so the on-disk shape self-documents the tier structure.
const LEARNINGS_SUBDIRS = ['session-notes', 'nightly'] as const;

// `griot init` deliberately does NOT gitignore learnings/. The substrate
// works precisely because learnings are committed: the corpus is shared,
// versioned, and compounding, and `griot capture` writes from parallel /
// cloud agents whose findings only reach `/griot-compact` if they land in
// version control. Gitignoring would silo each machine's captures and make
// the tree local-only — the opposite of the intended model. A consumer who
// truly wants local-only learnings can add the line themselves; it is not
// init's place to impose it. (Removed in the griot-init-correctness fix.)

type InitResult = {
  learnings_created: boolean;
  subdirs_created: ReadonlyArray<string>;
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

function renderStdout(action: InitResult): string {
  const parts: string[] = [];
  if (action.learnings_created) {
    parts.push('learnings/ created');
  }
  if (action.subdirs_created.length > 0) {
    parts.push(`subdirs created: ${action.subdirs_created.join(', ')}`);
  }
  if (parts.length === 0) {
    // Nothing to create — the tree already exists.
    return 'griot init: no changes (learnings tree already present)';
  }
  return `griot init: ${parts.join('; ')}`;
}

export function initVerb(
  _rest: string[],
  ctx: GriotCliContext,
): DispatchResult {
  const projectRoot = resolveProjectRoot(ctx.cwd);
  const tree = ensureLearningsTree(projectRoot);

  const action: InitResult = {
    learnings_created: tree.learningsCreated,
    subdirs_created: tree.subdirsCreated,
  };

  return {
    stdout: renderStdout(action),
    exitCode: 0,
  };
}
