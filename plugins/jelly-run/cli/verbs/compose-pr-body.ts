import { parseArgs } from 'node:util';
import { readFileSync } from 'node:fs';
import type { CliContext, DispatchResult, PhaseContext, ScoredField } from '../lib/types.ts';
import { JellyRunError } from '../lib/errors.ts';
import { defaultGitRunner } from '../lib/git.ts';
import { parsePhase } from '../lib/plan.ts';
import {
  classifyArchetype,
  scoreField,
  composePrBody,
  archetypeFields,
  deriveDiffSignals,
  type PrArchetype,
  type ScoringContext,
} from '../lib/pr.ts';

function errToResult(err: unknown): DispatchResult {
  if (err instanceof JellyRunError) {
    return { stderr: JSON.stringify(err.toPayload()), exitCode: 1 };
  }
  throw err;
}

// `jelly-run compose-pr-body --plan=<PLAN.md> --phase="<name>" [--base=main]`
//
// Emits a JSON draft: the classified archetype, every scored field (with
// confidence + derivation receipt), and the rendered markdown body. The
// /jelly-pr skill renders ALL fields in its preview, grills only the
// fields below the threshold, and gates PR-open on operator confirm.
// All deciding logic is pure (lib/pr.ts); this verb only gathers IO.
export function composePrBodyVerb(rest: string[], ctx: CliContext): DispatchResult {
  const { values } = parseArgs({
    args: rest,
    options: {
      plan: { type: 'string' },
      phase: { type: 'string' },
      base: { type: 'string' },
      pretty: { type: 'boolean' },
    },
    allowPositionals: true,
    strict: false,
  });
  if (values.plan === undefined || values.phase === undefined) {
    return errToResult(
      new JellyRunError(
        'missing-args',
        'compose-pr-body requires --plan=<PLAN.md path> and --phase="<phase name>"',
      ),
    );
  }
  const base = values.base ?? 'main';
  const repoRoot = ctx.repoRoot ?? process.cwd();
  const git = ctx.gitRunner ?? defaultGitRunner;

  try {
    const planText = readFileSync(values.plan, 'utf8');
    const phase: PhaseContext = parsePhase(planText, values.phase);
    const branch = git.currentBranch(repoRoot);
    const changedFiles = git.changedFiles(repoRoot, base);
    const diffStat = git.diffStat(repoRoot, base);
    const signals = deriveDiffSignals(changedFiles, planText);

    const scoringCtx: ScoringContext = {
      phase,
      branch,
      changedFiles,
      diffStat,
      ...signals,
    };

    const archetypeField = classifyArchetype(scoringCtx);
    const archetype = archetypeField.value as PrArchetype;

    // Title + archetype-specific fields + Risk level + Checklist. The
    // archetype's own field set carries Verification / Test plan where
    // applicable, so they are not added again here.
    const fieldNames = ['Title', ...archetypeFields(archetype), 'Risk level', 'Checklist'];
    const scored: ScoredField[] = fieldNames.map((f) => scoreField(f, scoringCtx));

    const body = composePrBody(scored);

    const draft = {
      archetype,
      // archetypeField first so its confidence is visible in the preview.
      fields: [archetypeField, ...scored],
      body,
    };
    return { stdout: JSON.stringify(draft, null, values.pretty === true ? 2 : 0), exitCode: 0 };
  } catch (err: unknown) {
    if (err instanceof JellyRunError) return errToResult(err);
    return errToResult(
      new JellyRunError(
        'compose-pr-body-failed',
        `could not compose PR body: ${(err as Error).message}`,
      ),
    );
  }
}
