import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import type { DispatchResult, GriotCliContext } from './index.ts';
import { resolveProjectRoot } from './_project-root.ts';

/**
 * `griot doctor` — informational health check.
 *
 * v1 covers one footgun: if a session ran griot capture (or another
 * filesystem verb) from a nested cwd before the project-root walk-up
 * refactor (W3), it may have created a stray `<nested>/learnings/`
 * alongside the canonical `<project-root>/learnings/`. The warning
 * names both paths so the user can rm the stray.
 *
 * Exit code is 0 in both warning and ok cases — doctor is
 * informational, not gating. Use grep or downstream tooling to
 * detect warnings if you want to fail builds on them.
 */
export function doctorVerb(
  _rest: string[],
  ctx: GriotCliContext,
): DispatchResult {
  const cwd = resolve(ctx.cwd);
  const projectRoot = resolveProjectRoot(ctx.cwd);
  const cwdLearnings = resolve(cwd, 'learnings');
  const rootLearnings = resolve(projectRoot, 'learnings');

  // Divergence shape: cwd and project root differ AND both have
  // their own `learnings/`. If cwd === projectRoot the two paths
  // collapse and there's no divergence by definition.
  if (
    cwd !== projectRoot &&
    existsSync(cwdLearnings) &&
    existsSync(rootLearnings)
  ) {
    const message = [
      'griot doctor: cwd-vs-project-root divergence detected.',
      `  cwd learnings/:          ${cwdLearnings}`,
      `  project-root learnings/: ${rootLearnings}`,
      '  Captures and rollup reads now resolve to project-root.',
      '  If the cwd-side learnings/ holds session-notes you want to keep,',
      '  move them into the project-root tree before deleting the stray.',
    ].join('\n');
    return {
      stdout: message,
      exitCode: 0,
    };
  }

  return {
    stdout: 'griot doctor: ok',
    exitCode: 0,
  };
}
