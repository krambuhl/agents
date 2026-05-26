---
name: jelly-pr-feedback
description: >-
  Operator-invoked after leaving PR review comments. Gathers the PR's
  review comments, classifies each (fixed-intent / ambiguous / stale /
  discussion-only) with confidence via the jelly-run CLI, surfaces the
  substrate's pass, grills ONLY on ambiguous + low-confidence comments,
  dispatches implementer agents for high-confidence fixed-intent fixes,
  and resolves handled review threads so re-invocation is safe.
  Interactive-only and yield-to-operator: the substrate NEVER
  auto-resolves an ambiguous comment. Thin glue over the jelly-run CLI;
  classification + the dispatch-or-yield decision are pure CLI verbs.
argument-hint: "<PR#> [--base=main]"
user-invocable: true
allowed-tools: Bash, Read, Agent, AskUserQuestion
---

# /jelly-pr-feedback

Close the review loop on a PR through explicit, visible turns:

> **operator turn** (review + comment) → **substrate turn** (classify +
> propose) → **agent turn** (dispatch the fixed-intent fixes) → back to
> the operator.

No scoreboards, no mechanics — the turn structure *is* the game. The
substrate does its pass first, then **yields**: it never auto-acts on an
ambiguous comment.

This skill is **thin glue**. The classification and the
dispatch-or-yield decision are pure `jelly-run` CLI verbs
(`cli/lib/feedback.ts`, unit-tested) — the yield invariant (only
high-confidence fixed-intent dispatches) is enforced in code, not this
prose.

## Arguments

- `<PR#>` — the pull request to process.
- `--base=<branch>` — base branch (default `main`).

## Process

### 1. Operator turn (already happened)

The operator left review comments. This skill starts after that.

### 2. Gather comments + already-resolved threads

```
gh pr view <PR#> --json reviewThreads
```

Map each review-thread comment to `{id, threadId, body, outdated}`
(`outdated` is GitHub's "diff hunk no longer exists" flag → the `stale`
signal). Collect the IDs of threads GitHub already marks **resolved** —
those are handled; re-invocation must skip them.

### 3. Substrate turn — classify (the CLI decides, not this prose)

Pipe the comments to the classifier, passing the resolved thread IDs so
they are dropped (idempotent re-runs):

```
echo '<comments JSON>' | jelly-run classify-comments --resolved=<resolvedThreadId,...> --pretty
```

Surface the aggregated result to the operator: counts per class, and for
each comment its `classification`, `confidence`, and `derivation`. This
is the substrate showing its work before anyone acts.

### 4. Operator turn — grill ONLY the uncertain ones

For each comment that is `ambiguous` **or** a low-confidence
`fixed-intent` (below the grill threshold the CLI marks), ask the
operator — one at a time via `AskUserQuestion` — what they intend:
- promote to a concrete fix (the operator supplies the instruction →
  reclassify it as a high-confidence fixed-intent with that instruction),
- or leave it (discussion / skip — it will NOT dispatch).

Do **not** grill `stale`, `discussion-only`, or high-confidence
`fixed-intent` comments — those are either non-actionable or already
clear. Never promote an ambiguous comment yourself; only the operator's
answer can turn it into a task.

### 5. Build dispatch tasks (the yield invariant, in code)

Pipe the post-grill classified set to:

```
echo '<classified JSON>' | jelly-run build-dispatch-tasks --pretty
```

Only high-confidence fixed-intent comments come back as tasks.
Everything else has yielded to the operator and produces nothing.

### 6. Agent turn — dispatch implementers (results via side-channel)

For each task, dispatch an implementer via the `Agent` tool with the
comment's instruction + the file/line context. Because a subagent's
return value is lossy at the parent boundary, instruct each implementer
to write what it changed to a side-channel file (e.g. a commit + a line
in a scratch log) rather than relying on the Agent result text. Read the
side-channel to report what landed.

### 7. Resolve handled threads (idempotency key)

For each comment whose fix was dispatched, resolve its review thread so a
re-run skips it:

```
gh api graphql -f query='mutation { resolveReviewThread(input: {threadId: "<threadId>"}) { thread { isResolved } } }'
```

Resolving is keyed on the thread ID — durable GitHub state, not a local
ledger. A second `/jelly-pr-feedback <PR#>` reads these as resolved in
step 2 and does not re-dispatch them.

### 8. Back to the operator

Report the turn: what was classified, what you grilled on, what was
dispatched + landed, what threads were resolved, and what remains (open
ambiguous comments the operator chose to leave). The operator reviews the
fixes and may comment again — re-invoking this skill starts the next
turn, safely skipping the resolved threads.

## Rules

- **Interactive-only.** No `--mode=auto`. The operator's judgment is the
  point; there is no autonomous path past an ambiguous comment.
- **Yield on ambiguity.** The substrate never auto-resolves or
  auto-dispatches an ambiguous comment. It classifies, surfaces, and
  waits.
- **The CLI decides dispatch.** `build-dispatch-tasks` is the only thing
  that turns a comment into work — do not hand-pick tasks in this prose.
- **One resolve per handled thread.** Idempotency rides on GitHub's
  resolved-thread state; never build a local handled-comments file.
- **Side-channel for agent results.** Implementers write what they did to
  a durable surface; do not trust the (lossy) Agent return value.
- **No emojis.**

## Failure modes

- `gh` not authenticated / PR not found → surface the `gh` error; nothing
  to classify.
- A comment the operator leaves ambiguous → it stays open (unresolved
  thread); reported in step 8, picked up again on the next invocation.
- An implementer dispatch fails / writes no side-channel entry → treat as
  unhandled, do NOT resolve its thread (so the next run retries it), and
  surface the failure to the operator.
- All comments resolved/stale/discussion-only → nothing to dispatch; report
  that the loop is clear and stop.
