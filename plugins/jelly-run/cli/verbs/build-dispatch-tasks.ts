import { parseArgs } from 'node:util';
import { readFileSync } from 'node:fs';
import type { CliContext, DispatchResult } from '../lib/types.ts';
import { JellyRunError } from '../lib/errors.ts';
import { buildDispatchTasks, type ClassifiedComment } from '../lib/feedback.ts';

function errToResult(err: unknown): DispatchResult {
  if (err instanceof JellyRunError) {
    return { stderr: JSON.stringify(err.toPayload()), exitCode: 1 };
  }
  throw err;
}

// `jelly-run build-dispatch-tasks [--file=<classified.json>] [--pretty]`
//
// Reads a ClassifiedComment[] (from --file or stdin) and emits the
// DispatchTask[] for the implementer agents. The yield invariant lives in
// the pure buildDispatchTasks (lib/feedback.ts): ONLY high-confidence
// fixed-intent comments become tasks; ambiguous / stale / discussion-only
// / low-confidence comments yield to the operator and produce nothing.
//
// `_ctx` is unused but kept in the signature for verb-shape uniformity.
export function buildDispatchTasksVerb(rest: string[], _ctx: CliContext): DispatchResult {
  const { values } = parseArgs({
    args: rest,
    options: {
      file: { type: 'string' },
      pretty: { type: 'boolean' },
    },
    allowPositionals: true,
    strict: false,
  });

  try {
    const raw = readFileSync(values.file ?? 0, 'utf8');
    let classified: ClassifiedComment[];
    try {
      classified = JSON.parse(raw) as ClassifiedComment[];
    } catch (err: unknown) {
      return errToResult(
        new JellyRunError('invalid-classified', `classified input is not valid JSON: ${(err as Error).message}`),
      );
    }
    if (!Array.isArray(classified)) {
      return errToResult(
        new JellyRunError('invalid-classified', 'classified input must be a JSON array of classified comments'),
      );
    }

    const tasks = buildDispatchTasks(classified);
    return {
      stdout: JSON.stringify(tasks, null, values.pretty === true ? 2 : 0),
      exitCode: 0,
    };
  } catch (err: unknown) {
    if (err instanceof JellyRunError) return errToResult(err);
    return errToResult(
      new JellyRunError('build-dispatch-tasks-failed', `could not build dispatch tasks: ${(err as Error).message}`),
    );
  }
}
