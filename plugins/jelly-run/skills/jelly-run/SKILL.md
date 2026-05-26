---
name: jelly-run
description: >-
  Operator entry point for a jelly run. Composes a /goal preamble from a
  project's PLAN.md + git state (via the jelly-run CLI), gates on the
  Claude Code version, invokes /goal to execute the phase WITHOUT opening
  a PR, and on yield auto-chains /jelly-pr in the same session to compose
  and open the PR under operator review. Thin glue over the jelly-run CLI
  verbs; the deterministic logic lives in the CLI (cli/lib/*), not here.
argument-hint: "<project-slug> [--phase=\"<phase name>\"]"
user-invocable: true
allowed-tools: Bash, Read, Skill, AskUserQuestion
---

# /jelly-run

Drive one phase of a jelly project: hand `/goal` a well-formed preamble,
let it do the work, then chain straight into PR composition. jelly owns
the PR boundary — `/goal` never opens the PR; `/jelly-pr` does, under
operator review.

This skill is **thin glue**. Every deterministic decision (preamble
shape, version gate) is a `jelly-run` CLI verb the skill shells out to —
so the logic is unit-tested in `cli/lib/`, not encoded in this prose.

## Arguments

- `<project-slug>` — the jelly-loom-managed project (resolves to
  `projects/<slug>/PLAN.md`).
- `--phase="<phase name>"` — the PLAN.md phase heading to run (e.g.
  `"Phase 2.1"`). If omitted, ask the operator which phase.

## Process

### 1. Preflight — version gate (refuses, does not warn)

```
jelly-run preflight
```

This reads `claude --version` and exits non-zero if the running Claude
Code is older than the `/goal` floor. **If it exits non-zero, STOP** and
surface the structured error verbatim — do not proceed on a guess. A
silently-wrong preamble (or a yield-detection failure) would strand the
work without yielding, violating the non-negotiable yield-to-operator
posture.

### 2. Compose the /goal preamble

Resolve the PLAN.md path (`projects/<slug>/PLAN.md`) and the phase name
(from `--phase`, else ask). Then:

```
jelly-run compose-preamble --plan=projects/<slug>/PLAN.md --phase="<phase name>" --base=<base branch>
```

The verb emits the goal-text on stdout: the phase goal + exit criteria +
current git state, with an explicit prohibition on opening a PR. Use the
verb's stdout **verbatim** as the goal text — do not edit it or append a
"now open a PR" instruction (the prohibition is the load-bearing
invariant).

### 3. Invoke /goal (no PR in the goal text)

Invoke `/goal` via the `Skill` tool, passing the composed preamble as the
goal text. Let `/goal` orchestrate the phase to completion.

**Yield = /goal returning control.** Invoking `/goal` is a blocking
skill call: when `/goal` finishes the work and returns control to this
skill body, that return IS the yield. Continue to step 4.

> Assumption flagged for the M3 dogfood (Phase 3.1): this skill treats
> `/goal` as a skill call that returns control to the caller on
> completion. If `/goal` instead yields to the operator without returning
> to the caller, this auto-chain needs the Stop-hook-marker variant
> instead — verify the control-flow during the first real dogfood run.

### 4. Auto-chain /jelly-pr

Once `/goal` yields, invoke `/jelly-pr` via the `Skill` tool in the same
session, passing the slug + phase. `/jelly-pr` runs the evaluator panel,
composes a confidence-scored draft PR body, grills the operator only on
low-confidence fields, and gates PR-open on operator confirmation.

Do not open the PR yourself — that is `/jelly-pr`'s job, deliberately, so
the panel + confidence-gated review always precede a PR.

## Rules

- **Thin glue.** No deterministic logic in this prose — shell out to the
  `jelly-run` CLI verbs. If you find yourself encoding a decision here,
  it belongs in `cli/lib/` with a test.
- **Never put a PR instruction in the goal text.** jelly owns the PR
  boundary.
- **Preflight gates.** A non-zero `jelly-run preflight` stops the run.
- **No emojis.**

## Failure modes

- `jelly-run preflight` non-zero → stop, surface the error, do not invoke
  `/goal`.
- PLAN.md or the named phase not found (`compose-preamble` errors with
  `phase-not-found`) → surface it; the operator likely mistyped the phase
  name or slug.
- `/goal` does not return control (yields to operator instead) → the
  auto-chain cannot fire automatically; tell the operator to run
  `/jelly-pr <slug> --phase="<name>"` once `/goal` is done.
