// Review-comment classification + dispatch-task building for
// /jelly-pr-feedback.
//
// Pure + testable (the testable-core posture): the verb gathers comments
// via `gh` and hands them here; this module never touches IO. The
// load-bearing invariant — the substrate NEVER auto-resolves an ambiguous
// comment — is enforced HERE, in buildDispatchTasks, not in skill prose:
// only HIGH-confidence fixed-intent comments become tasks. Everything
// else (ambiguous, stale, discussion-only, and low-confidence fixed-intent)
// yields to the operator.
//
// Reuses the confidence model from pr.ts so the whole plugin shares one
// threshold + band vocabulary.

import { CONFIDENCE, GRILL_THRESHOLD } from './pr.ts';

export type CommentClassification =
  | 'fixed-intent'
  | 'ambiguous'
  | 'stale'
  | 'discussion-only';

// A review comment as gathered from `gh` (the fields we classify on).
export type ReviewComment = {
  // The GitHub review-comment id.
  id: string;
  // The review THREAD id (used to resolve the thread once handled). May
  // be absent for non-threaded issue comments.
  threadId?: string;
  body: string;
  // GitHub marks a review comment outdated when its diff hunk no longer
  // exists — a reliable `stale` signal.
  outdated: boolean;
};

export type ClassifiedComment = {
  id: string;
  threadId?: string;
  body: string;
  classification: CommentClassification;
  confidence: number;
  derivation: string;
};

// A unit of work for an implementer agent. Only HIGH-confidence
// fixed-intent comments produce one.
export type DispatchTask = {
  commentId: string;
  threadId?: string;
  instruction: string;
};

// A question or a hedge: the operator is asking, not directing. Trumps an
// imperative verb in the same comment ("should we rename X?" is a
// question, not a rename instruction).
const QUESTION_OR_HEDGE_RE =
  /\?|\b(not sure|thoughts|wdyt|should we|should this|is this|are we|do we|maybe|consider|what about|why not|could we|i wonder)\b/i;

// A directive: the operator is telling us to do a specific thing.
const IMPERATIVE_RE =
  /\b(rename|remove|delete|drop|add|use|extract|move|fix|replace|change|inline|split|merge|revert|make|wrap|unwrap|hoist|memoize|guard|simplify|rework|pull out|factor out)\b/i;

// Praise / FYI / non-actionable.
const DISCUSSION_RE =
  /\b(lgtm|looks good|love this|nice|til|for context|fyi|thanks|thank you|great|clean|agreed|makes sense)\b/i;

export function classifyComment(comment: ReviewComment): ClassifiedComment {
  const base = { id: comment.id, threadId: comment.threadId, body: comment.body };
  const text = comment.body.trim();

  // 1. GitHub's outdated flag is a reliable stale signal.
  if (comment.outdated) {
    return {
      ...base,
      classification: 'stale',
      confidence: CONFIDENCE.high,
      derivation: 'GitHub marked the comment outdated (its diff hunk no longer exists)',
    };
  }

  // 2. A question/hedge means the operator is asking — NEVER auto-acted
  //    on, even if it contains an imperative verb. This is the yield
  //    bias: when in doubt, ambiguous.
  if (QUESTION_OR_HEDGE_RE.test(text)) {
    return {
      ...base,
      classification: 'ambiguous',
      confidence: CONFIDENCE.high,
      derivation: 'reads as a question / hedge — the operator is asking, not directing',
    };
  }

  // 3. A clear directive with no question is fixed-intent. Confidence is
  //    HIGH only when the comment is reasonably short + directive; a long
  //    comment with a buried imperative drops to MEDIUM so it grills
  //    rather than auto-dispatches (false-negative bias).
  if (IMPERATIVE_RE.test(text)) {
    const directive = text.length <= 200;
    return {
      ...base,
      classification: 'fixed-intent',
      confidence: directive ? CONFIDENCE.high : CONFIDENCE.medium,
      derivation: directive
        ? 'short, directive imperative — a clear fixed-intent instruction'
        : 'imperative present but buried in a long comment — confirm the intended fix',
    };
  }

  // 4. Praise / FYI with no directive.
  if (DISCUSSION_RE.test(text)) {
    return {
      ...base,
      classification: 'discussion-only',
      confidence: CONFIDENCE.high,
      derivation: 'praise / FYI with no actionable directive',
    };
  }

  // 5. Could not classify — default to ambiguous at LOW confidence so it
  //    always grills. We never guess fixed-intent.
  return {
    ...base,
    classification: 'ambiguous',
    confidence: CONFIDENCE.low,
    derivation: 'no clear directive, question, or praise signal — needs the operator',
  };
}

// THE yield invariant. Only HIGH-confidence fixed-intent comments become
// dispatchable tasks. Ambiguous / stale / discussion-only — and
// low-confidence fixed-intent — produce NOTHING; they yield to the
// operator. This is enforced in pure code, not skill prose, so it is
// unit-testable and cannot drift.
export function buildDispatchTasks(classified: ClassifiedComment[]): DispatchTask[] {
  return classified
    .filter((c) => c.classification === 'fixed-intent' && c.confidence >= GRILL_THRESHOLD)
    .map((c) => ({ commentId: c.id, threadId: c.threadId, instruction: c.body }));
}

// Idempotent re-run dedupe: drop comments whose thread (or comment id, as
// a fallback) is already resolved. The handled set is GitHub's durable
// resolved-thread state (read by the verb), not a local ledger — so
// re-invoking /jelly-pr-feedback after a partial run does not re-dispatch
// already-handled comments.
export function filterUnhandled(
  comments: ReviewComment[],
  resolvedIds: ReadonlyArray<string>,
): ReviewComment[] {
  const resolved = new Set(resolvedIds);
  return comments.filter((c) => {
    if (c.threadId !== undefined && resolved.has(c.threadId)) return false;
    if (resolved.has(c.id)) return false;
    return true;
  });
}
