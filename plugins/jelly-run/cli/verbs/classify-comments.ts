import { parseArgs } from 'node:util';
import { readFileSync } from 'node:fs';
import type { CliContext, DispatchResult } from '../lib/types.ts';
import { JellyRunError } from '../lib/errors.ts';
import { classifyComment, filterUnhandled, type ReviewComment } from '../lib/feedback.ts';

function errToResult(err: unknown): DispatchResult {
  if (err instanceof JellyRunError) {
    return { stderr: JSON.stringify(err.toPayload()), exitCode: 1 };
  }
  throw err;
}

// `jelly-run classify-comments [--file=<comments.json>] [--resolved=<id,id>] [--pretty]`
//
// Reads a ReviewComment[] (from --file or stdin), drops comments whose
// thread is already resolved (idempotent re-runs), classifies each, and
// emits the ClassifiedComment[] as JSON. The /jelly-pr-feedback skill
// pipes `gh`'s comment list in. Classification logic is pure
// (lib/feedback.ts); this verb only does the IO.
//
// `_ctx` is unused (the verb reads the comment list, not project state)
// but kept in the signature so every verb shares one shape.
export function classifyCommentsVerb(rest: string[], _ctx: CliContext): DispatchResult {
  const { values } = parseArgs({
    args: rest,
    options: {
      file: { type: 'string' },
      resolved: { type: 'string' },
      pretty: { type: 'boolean' },
    },
    allowPositionals: true,
    strict: false,
  });

  try {
    // --file when given, else stdin (fd 0).
    const raw = readFileSync(values.file ?? 0, 'utf8');
    let comments: ReviewComment[];
    try {
      comments = JSON.parse(raw) as ReviewComment[];
    } catch (err: unknown) {
      return errToResult(
        new JellyRunError('invalid-comments', `comments input is not valid JSON: ${(err as Error).message}`),
      );
    }
    if (!Array.isArray(comments)) {
      return errToResult(
        new JellyRunError('invalid-comments', 'comments input must be a JSON array of review comments'),
      );
    }

    const resolved = (values.resolved ?? '')
      .split(',')
      .map((s: string) => s.trim())
      .filter((s: string) => s.length > 0);

    const unhandled = filterUnhandled(comments, resolved);
    const classified = unhandled.map(classifyComment);

    return {
      stdout: JSON.stringify(classified, null, values.pretty === true ? 2 : 0),
      exitCode: 0,
    };
  } catch (err: unknown) {
    if (err instanceof JellyRunError) return errToResult(err);
    return errToResult(
      new JellyRunError('classify-comments-failed', `could not classify comments: ${(err as Error).message}`),
    );
  }
}
