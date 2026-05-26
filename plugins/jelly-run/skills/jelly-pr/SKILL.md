---
name: jelly-pr
description: >-
  Auto-chained from /jelly-run (rarely invoked directly). Runs a
  jelly-guild evaluator panel on the branch diff, composes a draft PR
  body from PLAN.md + the diff with per-field confidence scores (via the
  jelly-run CLI), grills the operator ONLY on low-confidence fields,
  renders a final preview of ALL fields, and gates PR-open on operator
  confirmation. Idempotent: refuses to open a second PR for a branch that
  already has one open. Thin glue over the jelly-run CLI + jelly-guild
  panel; deterministic scoring lives in the CLI (cli/lib/pr.ts).
argument-hint: "<project-slug> --phase=\"<phase name>\" [--base=main]"
user-invocable: true
allowed-tools: Bash, Read, Agent, AskUserQuestion
---

# /jelly-pr

Turn a finished branch into a reviewed PR. Run the panel, draft the body,
grill only where the substrate is unsure, and open the PR only after the
operator confirms. The operator holds the final judgment at the PR
boundary — the substrate does its pass first, then yields.

Thin glue: the confidence scoring + body composition are `jelly-run`
CLI verbs (`cli/lib/pr.ts`, unit-tested). This prose orchestrates; it
does not re-implement the scoring.

## Arguments

- `<project-slug>` — the jelly project (`projects/<slug>/PLAN.md`).
- `--phase="<phase name>"` — the PLAN.md phase this PR closes.
- `--base=<branch>` — base branch (default `main`).

## Process

### 1. Idempotency precheck — one PR per branch

```
gh pr list --head "$(git rev-parse --abbrev-ref HEAD)" --state open --json number,url
```

If a result comes back, an open PR already exists for this branch. **Do
not open a second one.** Surface the existing PR's number + URL and stop
(the operator can refresh it via review, or run `/jelly-pr-feedback` once
that ships in U4). This mirrors jelly-loom's `isCommitted` collision
gate — idempotency by reading durable state (GitHub), not a local ledger.

### 2. Run the jelly-guild evaluator panel on the diff

Make a scratch dir for verdicts (the lossy-subagent-boundary finding: a
parent cannot read a subagent's return value, so each reviewer writes to
a file):

```
SCRATCH="$(mktemp -d)"
```

Dispatch 2-3 jelly-guild **personalities** in **reviewer phase** in
parallel (one `Agent` message, multiple calls) against the branch diff.
Pick `subagent_type`s from the jelly-guild personalities (`skeptic`,
`methodical`, `pragmatist`, ...) and name diff-relevant **domains**
(`composition`, `naming`, `testing`, `abstraction`, `a11y`) in each
brief. Each brief must end with:

> domain: `<domain>`, phase: reviewer. Evaluate the diff at `<paths>`
> against the `<domain>` rubric. Your return value is NOT readable by the
> caller (lossy parent boundary) — write your verdict to
> `<SCRATCH>/<personality>-<domain>.verdict` as `VERDICT: approved|flagged`
> followed by your reasons. That file is the channel.

After the dispatch returns, read every `*.verdict` file in `$SCRATCH` and
aggregate: any `flagged` → surface the blocking reasons to the operator
before composing the body (they inform the draft + the operator's call).
This is the substrate's pass; it does not gate autonomously — the
operator decides at the preview.

### 3. Compose the draft PR body

```
jelly-run compose-pr-body --plan=projects/<slug>/PLAN.md --phase="<phase name>" --base=<base> --pretty
```

Parse the JSON: `{archetype, fields: [{field, value, confidence, derivation}], body}`.

### 4. Preview ALL fields (the visible-skip requirement)

Render **every** field — not just the uncertain ones — with its value,
confidence, and derivation receipt. The operator must see what the
substrate decided NOT to ask about, so a wrong high-confidence guess is
visible rather than silently shipped. The grill narrows attention; it
never narrows the surface.

### 5. Grill ONLY the low-confidence fields

For each field whose `confidence` is below the grill threshold (the CLI
marks these; they are the `medium`/`low` band), ask the operator to
confirm or rewrite the value — one field at a time via `AskUserQuestion`
or a natural-language follow-up. Apply the operator's edits. Leave
high-confidence fields as-is unless the operator edits them from the
preview.

### 6. Final preview + operator-gated open

Render the final body (all fields, post-grill) and the panel summary, and
ask the operator to confirm opening the PR. Only on explicit confirmation:

```
gh pr create --base <base> --head "$(git rev-parse --abbrev-ref HEAD)" --title "<Title field value>" --body "<composed body>"
```

Then clean up the scratch dir. Report the opened PR's URL.

## Rules

- **Thin glue.** Scoring + composition are CLI verbs; this prose only
  orchestrates the panel, the grill, and the open.
- **Preview is total; the grill is partial.** Always show all fields;
  only ask about the low-confidence ones.
- **Yield-to-operator.** Never open the PR without explicit confirmation.
  Never auto-resolve a panel flag — surface it and let the operator
  decide.
- **One PR per branch.** The idempotency precheck is mandatory.
- **Side-channel for panel verdicts.** Reviewers write to files; do not
  rely on the (lossy) Agent return value.
- **No emojis.**

## Failure modes

- An open PR already exists → stop with its URL (step 1).
- `gh` not authenticated / no remote → surface the `gh` error; the
  branch + body are ready, so the operator can open it manually.
- A reviewer subagent writes no verdict file → treat as a `parse-failure`
  flag and surface it; do not silently drop the missing reviewer.
- `compose-pr-body` errors (`phase-not-found`) → surface; likely a
  mistyped phase name.
