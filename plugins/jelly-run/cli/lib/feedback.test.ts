import { test, expect } from 'vitest';
import {
  classifyComment,
  buildDispatchTasks,
  filterUnhandled,
  type ReviewComment,
  type ClassifiedComment,
} from './feedback.ts';
import { CONFIDENCE, GRILL_THRESHOLD } from './pr.ts';

function comment(overrides: Partial<ReviewComment> = {}): ReviewComment {
  return { id: 'c1', threadId: 't1', body: '', outdated: false, ...overrides };
}

// ========================================================================
// THE yield invariant — the single most important test in this unit.
// The substrate must NEVER auto-dispatch anything but high-confidence
// fixed-intent. Everything else yields to the operator.
// ========================================================================

test('buildDispatchTasks dispatches ONLY high-confidence fixed-intent', () => {
  const classified: ClassifiedComment[] = [
    { id: 'a', body: 'rename x to y', classification: 'fixed-intent', confidence: CONFIDENCE.high, derivation: '' },
    { id: 'b', body: 'should we?', classification: 'ambiguous', confidence: CONFIDENCE.high, derivation: '' },
    { id: 'c', body: 'lgtm', classification: 'discussion-only', confidence: CONFIDENCE.high, derivation: '' },
    { id: 'd', body: 'outdated', classification: 'stale', confidence: CONFIDENCE.high, derivation: '' },
    { id: 'e', body: 'maybe fix this', classification: 'fixed-intent', confidence: CONFIDENCE.medium, derivation: '' },
  ];
  const tasks = buildDispatchTasks(classified);
  expect(tasks).toHaveLength(1);
  expect(tasks[0]!.commentId).toBe('a');
});

test('buildDispatchTasks never dispatches an ambiguous comment', () => {
  const tasks = buildDispatchTasks([
    { id: 'x', body: 'is this right?', classification: 'ambiguous', confidence: CONFIDENCE.high, derivation: '' },
  ]);
  expect(tasks).toEqual([]);
});

test('buildDispatchTasks never dispatches a LOW/MEDIUM-confidence fixed-intent (it grills instead)', () => {
  const tasks = buildDispatchTasks([
    { id: 'x', body: 'something', classification: 'fixed-intent', confidence: CONFIDENCE.medium, derivation: '' },
    { id: 'y', body: 'something', classification: 'fixed-intent', confidence: CONFIDENCE.low, derivation: '' },
  ]);
  expect(tasks).toEqual([]);
});

// ---------- classification ----------

test('classifyComment: GitHub-outdated comment -> stale (never dispatched)', () => {
  const c = classifyComment(comment({ outdated: true, body: 'rename x to y' }));
  expect(c.classification).toBe('stale');
  // even though the body is a directive, outdated wins and it won't dispatch
  expect(buildDispatchTasks([c])).toEqual([]);
});

test('classifyComment: a question with an imperative verb is ambiguous, NOT fixed-intent', () => {
  // The yield bias: "should we rename X?" is the operator asking, not
  // directing — must not auto-dispatch.
  const c = classifyComment(comment({ body: 'should we rename this to fooBar?' }));
  expect(c.classification).toBe('ambiguous');
  expect(buildDispatchTasks([c])).toEqual([]);
});

test('classifyComment: a short directive imperative -> fixed-intent, high confidence', () => {
  const c = classifyComment(comment({ body: 'rename `foo` to `bar` here' }));
  expect(c.classification).toBe('fixed-intent');
  expect(c.confidence).toBeGreaterThanOrEqual(GRILL_THRESHOLD);
  expect(buildDispatchTasks([c])).toHaveLength(1);
});

test('classifyComment: imperative buried in a long comment -> fixed-intent but grills (medium)', () => {
  const longBody =
    'I was thinking about the broader architecture here and how it relates to ' +
    'the rest of the system and the various tradeoffs we discussed last week, ' +
    'and after all that you should probably extract this into a helper at some point.' +
    ' '.repeat(50);
  const c = classifyComment(comment({ body: longBody }));
  expect(c.classification).toBe('fixed-intent');
  expect(c.confidence).toBeLessThan(GRILL_THRESHOLD);
  expect(buildDispatchTasks([c])).toEqual([]);
});

test('classifyComment: praise -> discussion-only', () => {
  expect(classifyComment(comment({ body: 'lgtm, nice work' })).classification).toBe('discussion-only');
});

test('classifyComment: unclassifiable -> ambiguous at LOW confidence (always grills)', () => {
  const c = classifyComment(comment({ body: 'hmm.' }));
  expect(c.classification).toBe('ambiguous');
  expect(c.confidence).toBeLessThan(GRILL_THRESHOLD);
});

// ---------- idempotent re-run dedupe ----------

test('filterUnhandled drops comments whose thread is already resolved', () => {
  const comments = [
    comment({ id: 'c1', threadId: 't1' }),
    comment({ id: 'c2', threadId: 't2' }),
  ];
  const remaining = filterUnhandled(comments, ['t1']);
  expect(remaining).toHaveLength(1);
  expect(remaining[0]!.id).toBe('c2');
});

test('filterUnhandled falls back to comment id when there is no thread', () => {
  const comments = [comment({ id: 'c1', threadId: undefined })];
  expect(filterUnhandled(comments, ['c1'])).toEqual([]);
});

test('filterUnhandled keeps everything when nothing is resolved', () => {
  const comments = [comment({ id: 'c1', threadId: 't1' }), comment({ id: 'c2', threadId: 't2' })];
  expect(filterUnhandled(comments, [])).toHaveLength(2);
});
