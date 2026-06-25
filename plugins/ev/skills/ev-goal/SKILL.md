---
name: ev-goal
description: >-
  Autonomous driver over a project — the "human-on-call" sibling of
  /ev-run (ADR-0009). Self-drives phase after phase toward a goal
  predicate (default: all phases merged),
  re-entering on PR-merge/CI wake, evaluating each phase with the guild
  panel substrate, and pausing to ask only when a panel can't resolve a
  decision. Reuses the existing ev-loop-* bodies unchanged. Use when the
  user wants a project (or its mechanical tail) driven to completion
  without picking each phase by hand.
argument-hint: "<project-slug-or-path> [--until=<predicate>] [--env[=<provider>]]"
user-invocable: true
disable-model-invocation: true
allowed-tools: Read, Skill, Bash, AskUserQuestion, Bash(loom *), Bash(guild *), Bash(griot *), Bash(ev *)
---

# /ev-goal

Autonomous driver. Same loop bodies as `/ev-run`, different control
posture: instead of dispatching one phase and parking, it **drives to a
goal predicate**, re-entering itself on the PR-activity wake, and
escalates to the operator via `AskUserQuestion` only when the auto-mode
panel posture can't resolve a decision. The fork rationale and the v1
scope boundary live in
`projects/adr-log/0009-fork-ev-run-human-in-loop-and-ev-goal-human-on-call.md`.

Invocations of `/ev-run`, `/ev-loop-*`, and `/loom-archive` below mean
`Skill(skill: <name>, args: "…")` — the Skill tool is how the driver
re-uses those bodies. CLI invocations like `loom pr discover` mean
`Bash("loom pr discover <args>")`. Citing "`/ev-run`'s § 3" means apply
that skill's documented procedure; it does not mean shell out to a
verb.

## Relationship to /ev-run

`/ev-goal` reuses, verbatim, `/ev-run`'s Preflight (Tiers 1–3),
§ 0.5 Sync git state, § 1 Orient, § 1.5 Load learnings, § 3 next-phase
policy, and § 4 Dispatch. It does **not** re-implement them — it cites
them. The only behavior it overrides is what happens at the two points
where `/ev-run` hands control back to a human:

| Point | `/ev-run` behavior | `/ev-goal` override |
|-------|--------------------|---------------------|
| Phase has an open PR, nothing else unblocked (§3) | Park and stop | Park, **stay subscribed, re-enter on wake** |
| Phase close | Open PR, STOP | Open PR, **loop to next phase** |
| Decision a panel can't resolve | (n/a — human is present) | `AskUserQuestion`, block, continue on answer |
| Goal predicate satisfied | (n/a) | Invoke `/loom-archive`, stop |

## Arguments

- `<project-slug-or-path>` — resolved by loom's standard slug
  resolution, exactly as `/ev-run`.
- `--until=<predicate>` — the goal/stop condition. Default
  `all-merged` (every `phases[].status == "completed"`). Recognized
  forms: `--until=phase:<N>` (stop after phase N merges) and
  `--until=all-merged` (explicit default). Any other predicate → stop
  and ask before driving anything.

`--mode=auto` is **implied** and need not be passed; `/ev-goal` always
runs the auto-mode panel-offload posture (see § Escalation).

`--env[=<provider>]` opts into provisioned-environment execution exactly
as `/ev-run` — `/ev-goal` reuses `/ev-run`'s § Environment provisioning
verbatim (provision-or-reuse before each dispatch, fall back to local on
any `env-*` error, route loop commands via `ev env exec`). Because the
handle is project-slug-keyed, every drive-loop iteration and every
PR-wake re-entry reuses the one environment for the project. v1 leaves
teardown manual; a v2 forward pointer is "tear down at goal-converge,
alongside the `/loom-archive` step" (ADR-0010 § Forward pointers).

## Process

### 0. Preflight + orient (delegate to /ev-run's sections)

Run `/ev-run`'s Preflight, § 0.5, § 1, and § 1.5 unchanged. Load
learnings once per `/ev-goal` invocation (session-scoped), not per
iteration. Emit `goal-loop-entered` with `{slug, until, decision_budget,
round_budget}` once, after orientation succeeds.

### 1. Drive loop

Repeat until the goal predicate (§ Goal predicate) is true:

1. **Pick the next actionable phase** using `/ev-run`'s § 3 policy
   (in-progress first; else lowest-numbered `not-started` whose
   `loom parse-plan` dependencies are all `completed`).

2. **If a phase is actionable:** dispatch it via `/ev-run`'s § 4 — the
   body is `/ev-loop-interactive` or `/ev-loop-confidence`, selected by
   the same precedence (PLAN per-phase override → `[config].worker_bindings`
   → `ev-loop-confidence` default) — passing the implied auto-mode
   posture. On the loop body's return,
   emit `goal-loop-iteration` with `{slug, phase, outcome}` and continue
   the drive loop (back to step 1).

3. **If nothing is actionable because a phase's PR is open** (the
   `/ev-run` §3 "subscribed/park" case): do **not** stop. Park and
   yield to the PR-activity wake. When the wake fires, the harness
   re-enters `/ev-goal`, which resumes from § 0 (re-orient: live PR
   state via `loom pr discover`) and re-evaluates the drive loop. On
   merge, the phase is `completed`, its dependents unblock, and the
   drive loop advances. This wake-driven re-entry IS the loop's
   iteration when work is gated on review/CI.

   In the local `gh`-only fallback (no subscription available), fall
   back to `/ev-run`'s § Wait for merge blocking poll, then re-evaluate.

4. **If nothing is actionable and no PR is open** (genuine stall):
   escalate via § Escalation — this is a decision the driver can't make
   alone (e.g. all remaining phases blocked on an external dependency).

### 2. Goal reached → archive

When the goal predicate is true, emit `goal-loop-converged` with
`{slug, phases_completed, iterations}` and invoke `/loom-archive
<slug>`. Stop.

## Goal predicate

Evaluated against the manifest each drive-loop turn:

- `all-merged` (default): every `phases[].status == "completed"`.
- `phase:<N>`: phase `<N>` status is `completed`.

The predicate is a pure read over manifest state (refreshed in § 0
orient); it never caches PR state. A phase counts toward the goal only
once its PR is merged — `loom pr discover` is the source of truth, the
manifest status its reconciled reflection.

## Escalation

`/ev-goal` runs the standard auto-mode posture (per
`docs/AGENT-CONVENTIONS.md`: divergent decisions → `guild-plan`,
convergent → evaluator panels, autonomous defaults auto-decided;
default budget **3 rounds × 3 decisions** at the driver surface). The
single difference from a headless run: when that posture **exhausts its
budget** on a decision — the point at which `/ev-run` and the loop
bodies would write `UNRESOLVED.md` and stop — `/ev-goal` instead:

1. Calls `AskUserQuestion` with the unresolved decision, the candidate
   options the panel weighed, and a recommendation. The Claude Code
   notification system surfaces this to the operator's device.
2. **Blocks** until answered. (v1 accepts that other unblocked phases do
   not advance while blocked — see ADR-0009. v2 makes this non-blocking.)
3. On answer, records it, emits `goal-loop-escalated` with `{slug,
   phase, decision, resolution: 'operator'}`, and resumes the drive
   loop.

`AskUserQuestion` is the **only** escalation channel in v1. No Slack, no
push, no async parking for check-ins. Crash recovery (a sub-agent dying
mid-phase) still uses `RECOVERY-STATUS.json` per
`docs/AGENT-CONVENTIONS.md` — that is orthogonal to escalation.

## Events

Driver-level additions to the manifest event stream, mirroring the
existing `auto-mode-*` vocabulary:

- `goal-loop-entered` — `{slug, until, decision_budget, round_budget}`
- `goal-loop-iteration` — `{slug, phase, outcome}`
- `goal-loop-converged` — `{slug, phases_completed, iterations}`
- `goal-loop-escalated` — `{slug, phase, decision, resolution}`

Each is appended with the same bare command existing skills use for
skill-side events — `loom events append <slug> --event=<name>
--detail=<json>` (run as `Bash("loom events append …")`); there is no
dedicated verb. Event names are an open kebab-case set, so no allowlist
needs editing, but the four are typed in `plugins/loom/cli/lib/types.ts`
alongside the `auto-mode-*` events for compile-time callers.

The existing `auto-mode-entered` / `auto-mode-converged` /
`auto-mode-budget-exhausted` events still fire from the loop bodies and
panels underneath; the `goal-loop-*` events record the driver wrapping
them.

## Rules

- **Same bodies, never forked.** `/ev-goal` adds no work step the loop
  bodies don't already own. If a behavior belongs in execution, it goes
  in `ev-loop-*`, not here.
- **Single next-phase policy.** Next-phase selection is `/ev-run`'s § 3,
  cited not copied. Drift between the two is a bug.
- **The wake decides when to look, never what is true.** Always
  re-derive PR state via `loom pr discover` on re-entry.
- **Escalate, don't guess, on unresolved decisions.** Budget exhaust →
  `AskUserQuestion`, not a silent default.
- **No emojis.**

## Failure modes

- Project not found → forward the loom error; suggest `/loom-plan`.
- Unknown `--until` predicate → stop and ask before driving.
- Manifest-vs-git drift → `/ev-run`'s § Grill-me drift handling, but
  resolved via the auto-mode panel first; escalate only on budget
  exhaust.
- PR closed without merging → do not auto-advance past an unmerged
  parent (same hard rule as `/ev-run` §3 `closed`); escalate.
- All phases done → invoke `/loom-archive` and stop (the success path,
  not a failure).
