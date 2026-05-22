---
name: linear-loom-plan
description: >-
  Birth a PLAN.md for a Linear-backed loom-project. Runs an interview
  (with Linear-specific bootstrap covering Linear Project selection +
  loom-project identity), produces PLAN.md + INTERVIEW.md, and commits
  PLAN.md to git + uploads INTERVIEW.md to Linear as a Document via
  `bin/linear-loom plan`. Use after `/linear-loom-research` (or
  independently) to lock the project's phase decomposition.
argument-hint: "<slug-or-topic>"
user-invocable: true
disable-model-invocation: true
allowed-tools: Read, Write, Bash, AskUserQuestion
---

# /linear-loom-plan

Birth a PLAN.md for a Linear-backed loom-project. The plan lives in
git for PR review (decisions-in-git per the loom-Linear memory split);
the interview transcript uploads to Linear so the planning context
travels with the project artifacts. After `linear-loom tasks generate`
(Phase 5) lands, the operator runs it against the committed PLAN.md to
emit Linear Sub-Issues per phase / batch / task.

This skill diverges from `/loom-plan` per DESIGN.md § 14: Linear-side
bootstrap questions front the interview; INTERVIEW.md lands in Linear
as a Document rather than as a git-committed artifact; the parser
convention (DESIGN.md § 12) shapes the structure of PLAN.md.

Operator-direct, not model-invocable (DESIGN.md § 1).

## Inputs

- `<slug-or-topic>` — an existing loom-project slug or a topic to
  bootstrap a new one. If a `projects/<slug>/linear.json` marker
  exists, the skill skips the Linear-side bootstrap and runs the
  interview directly.

## Process

### 1. Pre-flight + slug resolution

- Confirm `bin/linear-loom` is on PATH.
- Treat `$ARGUMENTS` as the slug if it's already kebab-case and a
  marker exists at `projects/<slug>/linear.json`. Otherwise treat it
  as a topic and propose a slug; confirm with the operator.

### 2. Linear-side bootstrap (only when marker is absent)

Identical to `/linear-loom-research` step 2:

- Ask which Linear Project to nest under (no defaults — DESIGN.md
  § 4).
- Confirm the slug.
- Shell to `linear-loom project create <slug> --linear-project=<id>`
  to write the marker and create the `loom-project:<slug>` label.

If the marker already exists, skip this step.

### 3. Check for collision

Refuse overwriting an existing committed PLAN.md. The CLI verb itself
gates on this with `plan-already-committed`, but check up front so the
operator doesn't waste an interview on a path that won't commit:

```
Bash("git ls-files --error-unmatch projects/<slug>/PLAN.md 2>/dev/null && echo committed || echo absent")
```

If "committed" appears, stop and direct the operator at
`linear-loom revise-plan` (when it ships) or a manual git rebase to
land a revision rather than first-write.

### 4. Plan interview (grill-me posture)

Walk the operator through the plan structure. Linear-specific
prompts plus the substrate-shared plan content:

- **What's the goal?** One sentence; the operator's framing.
- **What does done look like?** Concrete verifiable criteria.
- **Phases**: walk through the proposed phase decomposition. For
  each phase: name, goal, deliverables, branch. Phase names match
  the milestone-title convention `<slug> · Phase N — <name>` so the
  later `tasks generate` parser (Phase 5) can match them in Linear.
- **Batches per phase**: where the phase has more than one
  conceptual chunk, identify Batches per DESIGN.md § 12.1.
- **Risks**: name the things that could break this plan.
- **Open questions**: what still needs research (the trigger for a
  `/linear-loom-research` follow-up or the inner-RPI hop if
  ev-linear's loop is running).

Ask **one** question at a time. Recommend an answer first, then
ask. Track open threads as you go.

### 5. Synthesize PLAN.md and INTERVIEW.md

Write two files locally:

- **PLAN.md** at a temp path (e.g. `/tmp/<slug>-PLAN.md`). The CLI
  will copy it to `projects/<slug>/PLAN.md` and commit. Follow the
  parser convention in DESIGN.md § 12.1 (`## Phases` wrapper, ID-
  bracketed children) so Phase 5's `tasks generate` works against
  it without operator surgery.
- **INTERVIEW.md** at a temp path (e.g. `/tmp/<slug>-INTERVIEW.md`).
  The transcript of the interview, including every question / answer
  / recommendation. This is the receipt for the synthesis and gets
  uploaded to Linear.

### 6. Commit + upload via the CLI

Shell to:

```
Bash("linear-loom plan <slug> --plan-file=/tmp/<slug>-PLAN.md --interview-file=/tmp/<slug>-INTERVIEW.md --pretty")
```

The verb:
- Refuses overwrite via `plan-already-committed` if PLAN.md is in
  HEAD (defense in depth — step 3's check is best-effort).
- Writes `projects/<slug>/PLAN.md`.
- Commits with `[linear-loom plan] <slug>: initial PLAN.md`.
- Uploads INTERVIEW.md as a Linear Document with the standard
  provenance header.

The CLI emits a structured JSON success including the Linear
Document URL.

### 7. Report

Tell the operator:

- The committed `projects/<slug>/PLAN.md` path.
- The Linear INTERVIEW.md Document URL.
- The next step: open a PR for the PLAN.md commit (operator-side;
  the skill doesn't auto-open PRs in v1).
- Any open questions or `[unsourced]` markers worth a follow-up.

## Rules

- **One question at a time.** Same grill-me posture as
  `/linear-loom-research`.
- **PLAN.md follows the parser convention** (DESIGN.md § 12.1). The
  `tasks generate` verb in Phase 5 will fail to parse anything else;
  the skill's responsibility is producing parseable output.
- **No git push from this skill.** The CLI commits to the current
  branch; the operator pushes when ready.
- **No emojis** in committed prose.

## Failure modes

- Slug collision (PLAN.md already committed) → stop, direct to
  revise-plan workflow.
- Linear API auth failure → pass-through.
- Interview cancelled mid-flight → no commit, no upload. Temp files
  may persist for the operator to inspect.
- `linear-loom plan` errors post-interview → temp files are
  preserved at their `/tmp/` paths so the operator can re-run the
  CLI directly after fixing the cause.
