# 0009. Fork ev-run (human-in-loop) and ev-goal (human-on-call)

- **Date**: 2026-06-19
- **Status**: proposed

## Context

Framed against Boris Cherny's three-stage history of the agent loop
(ReAct's reason→act→observe while-loop; AutoGPT's goal-pursuing
self-prompt; and "5–10 parallel sessions a human prompts by hand"),
the substrate today sits squarely at stage three. `/ev-run` is a
router a human re-invokes per phase: it picks the next actionable
phase, dispatches one loop, opens a PR, and **parks/stops**. The human
is always inside the process — even `--mode=auto` keeps the human at
the decision boundary by routing gates to panels rather than removing
the gate.

Cherny's "what comes next" is loop engineering: a small driver that
prompts the agent, reads the result, **evaluates** it, and repeats
until a goal is met or a stop condition fires — with the human moved
from *inside* the loop to *on call*. The substrate already owns every
component of that driver except the driver itself:

- **Goal/stop state** — `manifest.toml` phase statuses + `exitCriteria`
  are a progress ledger; "all phases merged" is a read over it.
- **Evaluate predicate** — `/guild-validate` panels + `[[findings]]` +
  the recurring-finding threshold are a far stronger acceptance test
  than the "did tests pass" most loops use.
- **Re-entry trigger** — the substrate already subscribes to PR
  activity at open and `/ev-run` step 3 already *parks* on that wake;
  it just stops instead of continuing.
- **Crash recovery** — `RECOVERY-STATUS.json` already resumes a
  failed sub-agent.

What is missing is the thin layer above the loop body that re-invokes
it without a human and knows when to stop. This ADR records the
decision to add that layer as a **second sibling verb** rather than a
mode flag on `/ev-run`.

## Decision

Add `/ev-goal` as the autonomous driver ("human-on-call", Cherny's
stage four) and keep `/ev-run` unchanged as the human-paired router
("human-in-loop", stage three). Both verbs dispatch to the **same**
`ev-loop-interactive` / `ev-loop-confidence` bodies, selected the same
way (PLAN per-phase override → manifest `[config].worker_bindings` →
`ev-loop-confidence` default). The bodies do not fork.

Load-bearing properties:

- **Shared body, different driver.** The two verbs differ only in
  three knobs, none of which live in the loop body:

  | Knob | `/ev-run` | `/ev-goal` |
  |------|-----------|------------|
  | Re-entry | Human re-invokes per phase | Self-drives; PR-merge/CI wake re-enters |
  | Stop | Phase close → STOP | Goal predicate met → auto-archive |
  | Check-in | Gates at every decision boundary | Gates only when a panel can't resolve |

- **One escalation primitive: `AskUserQuestion`.** v1 deliberately
  does NOT add Slack, push, or async recovery-parking for check-ins.
  `/ev-goal` escalates by calling `AskUserQuestion`; the Claude Code
  notification system surfaces it to the operator's device, and the
  operator's answer unblocks the loop. This is the *same* primitive
  `/ev-run` uses — the only difference is the threshold at which it
  fires (every decision vs. only-when-panels-deadlock). The async
  Slack-DM round-trip and parallel-while-blocked behavior are an
  explicit v2 (see Forward pointers).

- **Blocking check-ins are accepted for v1.** Because `AskUserQuestion`
  blocks, while a check-in is pending `/ev-goal` does not advance other
  dependency-unblocked phases in parallel. One serial driver that
  occasionally stops to ask is the agreed v1 cost: it is dramatically
  simpler than async parking, and "pause and ping me when stuck" is the
  correct posture before the loop is trusted to run unattended.

- **Goal predicate, default and overridable.** `/ev-goal` runs until
  its goal predicate is true. Default predicate: every `phases[].status
  == "completed"` (all phase PRs merged), after which it invokes
  `/loom-archive`. An explicit `--until=<predicate>` overrides (e.g.
  `--until=phase:5`, `--until=all-merged`).

- **`--mode=auto` is implied.** `/ev-goal` runs the existing auto-mode
  posture by default (divergent decisions → `guild-plan`, convergent →
  evaluator panels, autonomous defaults auto-decided). `AskUserQuestion`
  fires only when that posture exhausts its budget — i.e. `/ev-goal`'s
  check-in IS the auto-mode budget-exhausted branch, redirected from
  "write `UNRESOLVED.md` and stop" to "ask and continue".

- **The wake is when-to-look, never what-is-true.** As today, a
  PR-activity wake re-enters the driver, which re-derives live PR state
  via `loom pr discover`. `/ev-goal` adds no cached PR state.

## Consequences

**Now easy that wasn't before.** A project (or its mechanical tail)
can be driven to completion unattended: `/ev-goal <slug>` runs phase
after phase, evaluating each with the panel substrate, opening PRs,
re-entering on merge, and archiving when done — pausing only to ask
when a decision genuinely can't be panel-resolved. The operator's job
moves toward authoring/revising PLAN.md (the loop's spec) and reviewing
merged PRs (the loop's output).

**Now harder.** Two verbs to keep coherent. The risk is drift between
`/ev-run` and `/ev-goal` parking/re-entry logic, since both implement
step-3-style "what's the next actionable phase" reasoning. Mitigation:
the next-phase policy stays single-sourced in prose both skills cite,
and the loop bodies remain the only place work happens.

**Mixed-driver projects.** Because both verbs write the same manifest,
an operator can drive exploratory phases with `/ev-run` and hand the
tail to `/ev-goal --until=all-merged`. The manifest is the shared
contract; whichever driver runs next reads the same goal-state. This is
a feature, but it means neither verb may assume it was the only driver
this project has seen.

**Closed alternatives.** A `--autonomous` flag on `/ev-run` (rejected
— overloads a "thin router" with a fundamentally different control
posture; the parking-vs-looping fork is large enough to confuse the
body). Slack-MCP escalation in v1 (deferred — no Slack MCP is wired in
the target environment, and the inbound round-trip needs message-read
support the post-only case lacks; `AskUserQuestion` + notifications
covers v1). Async recovery-parking so other phases proceed while one
phase awaits a human (deferred to v2 — requires the non-blocking
escalation channel first).

**Commits us to.** `AskUserQuestion` as the substrate's single
human-escalation primitive across both drivers. Any future Slack/push
channel must degrade to this, not replace it.

**Watch for.** An `/ev-goal` that asks too often (escalation threshold
too low) is just a slow `/ev-run`; one that asks too rarely ships
panel-unresolved decisions unattended. The threshold is the auto-mode
budget shape (default 3×3 per `docs/AGENT-CONVENTIONS.md`); tune there,
not by special-casing `/ev-goal`.

## Forward pointers

- **v2 — non-blocking escalation.** A pluggable escalation channel with
  a fallback ladder: (1) Slack MCP DM + readable thread → full async
  round-trip; (2) Slack MCP post-only → notify-and-park, resume by
  re-invoking; (3) no MCP → `BLOCKED.md` + a manifest `blocked` event
  the operator polls. Once escalation is non-blocking, `/ev-goal` can
  advance other dependency-unblocked phases while one phase awaits a
  human (Cherny's "5–10 parallel sessions", automated).
- **v2 — the loop primitive trio.** `/ev-goal` is the `/goal`
  (run-until-condition) member of Cherny's `/loop` `/goal` `/schedule`
  set. Siblings on the same driver layer, different triggers: an
  interval `loom babysit` (re-run on a timer to auto-fix CI / cluster
  PR comments via worktree sub-agents) and a cron `ev-schedule`
  (nightly griot rollup recompute, `loom doctor` sweep).
- **Driver-level events.** `/ev-goal` should emit `goal-loop-entered`,
  `goal-loop-iteration` (per phase advance), and `goal-loop-converged`
  / `goal-loop-escalated` so the manifest event stream records the
  autonomous run, mirroring the existing `auto-mode-*` vocabulary.
