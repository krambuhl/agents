import { parseArgs } from 'node:util';
import { readFileSync } from 'node:fs';
import type { CliContext, DispatchResult, GitState } from '../lib/types.ts';
import { JellyRunError } from '../lib/errors.ts';
import { defaultGitRunner } from '../lib/git.ts';
import { parsePhase } from '../lib/plan.ts';
import { composePreamble } from '../lib/goal.ts';

function errToResult(err: unknown): DispatchResult {
  if (err instanceof JellyRunError) {
    return { stderr: JSON.stringify(err.toPayload()), exitCode: 1 };
  }
  throw err;
}

// `jelly-run compose-preamble --plan=<PLAN.md> --phase="<name>" [--base=main]`
//
// Gathers git state (via the injected runner) + the named phase from
// PLAN.md, then emits the /goal preamble string on stdout. Pure
// composition lives in lib/goal.ts; this verb only does the IO.
export function composePreambleVerb(rest: string[], ctx: CliContext): DispatchResult {
  const { values } = parseArgs({
    args: rest,
    options: {
      plan: { type: 'string' },
      phase: { type: 'string' },
      base: { type: 'string' },
    },
    allowPositionals: true,
    strict: false,
  });
  if (values.plan === undefined || values.phase === undefined) {
    return errToResult(
      new JellyRunError(
        'missing-args',
        'compose-preamble requires --plan=<PLAN.md path> and --phase="<phase name>"',
      ),
    );
  }
  const base = values.base ?? 'main';
  const repoRoot = ctx.repoRoot ?? process.cwd();
  const git = ctx.gitRunner ?? defaultGitRunner;

  try {
    const planText = readFileSync(values.plan, 'utf8');
    const phase = parsePhase(planText, values.phase);
    const gitState: GitState = {
      branch: git.currentBranch(repoRoot),
      baseBranch: base,
      changedFiles: git.changedFiles(repoRoot, base),
      diffStat: git.diffStat(repoRoot, base),
    };
    const preamble = composePreamble(phase, gitState);
    return { stdout: preamble, exitCode: 0 };
  } catch (err: unknown) {
    if (err instanceof JellyRunError) return errToResult(err);
    return errToResult(
      new JellyRunError(
        'compose-preamble-failed',
        `could not compose preamble: ${(err as Error).message}`,
      ),
    );
  }
}
