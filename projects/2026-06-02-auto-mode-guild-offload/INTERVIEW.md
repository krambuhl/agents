# Interview — Auto-mode guild offload

The walked decision tree. One heading per resolved question:
recommendation, the user's answer, the rationale.

## Q1 — Execution fork resolution

**Question**: When the loop hits a genuine execution fork in auto-mode
(a "which way do I build this" decision that is not a contract ambiguity
and not an evaluator finding), how does it resolve without the human?

**Options**: plan panel decides | self-decide + evaluator gates | forks
forbidden -> escalate | tiered by risk.

**Answer**: **Plan panel decides** — spawn a `guild-plan` round on the
fork, synthesize the convergence into a decision, record it in the
checkin, proceed.

**Rationale**: Most faithful reading of "offload questions to the guild,"
and it reuses the same `guild-plan` call the loops already make at phase
start. RESEARCH.md § C flags the caveat that `guild-plan` returns no
synthesis, so the loop must apply the convergence rule itself — folded
into the Phase 2 contract.

## Q2 — Trigger

**Question**: What switches the loop into the guild-offload posture? The
phrase "while Claude's auto mode is enabled" is ambiguous between the
harness state and the loom flag.

**Options**: couple to harness auto-mode | extend the loom `--mode=auto`
flag | both (flag, auto-armed by harness).

**Answer**: **Couple to harness auto-mode** (the literal reading).

**Rationale at decision time**: matches the user's wording; ambient, no
per-invocation flag. Flagged at decision time as the highest-risk choice
because it depends on the harness exposing its mode to a running skill —
unverified. Superseded in practice by the RESEARCH.md § A finding (see
Q3 / the plan's pivot).

## Q3 — Signal fallback

**Question**: If the verification spike finds the harness does not
reliably expose its auto-mode to a running skill, what is the fallback?

**Options**: fall back to the loom flag | block on the signal | build our
own arming signal.

**Answer**: **Fall back to the loom flag** — ship the full posture behind
`--mode=auto`; the posture is the deliverable, the trigger is swappable.

**Rationale**: keeps the project shippable regardless of the spike. This
fallback was triggered: RESEARCH.md § A confirmed the harness signal is
ABSENT (live `env` probe, GitHub issue #6227 closed not-planned,
statusline schema), so the loom flag is now the primary trigger and
harness-coupling is deferred behind an inert probe seam.

## Q4 — Release boundary

**Question**: When auto-mode runs a phase with no in-loop stops, where
does the human re-enter?

**Options**: open PR, stop, human merges | open draft PR, auto-advance
phases | open PR, stop, human approves next phase.

**Answer**: **Option 1 as default, option 2 as an option.** Default:
run phase -> open PR -> stop -> human reviews/merges (PR review is the
release gate). Option: a depth knob (`--phases=all`-shaped) for full-stack
autonomous runs with draft PRs and phase auto-advance.

**Rationale**: phase-at-a-time matches "only releases for PR" most
literally and keeps git state clean; the full-stack option serves the
maximally-autonomous run when the operator wants it.

## Q5 — Loop scope

**Question**: Which loops get the posture — interactive only, both, or
interactive-now-convention-ready?

**Options**: interactive only | both loops, shared convention |
interactive now, convention-ready.

**Answer**: **Both loops, shared convention** in
`docs/AGENT-CONVENTIONS.md`.

**Rationale**: cohesive substrate-wide. Pulls `sync-shared` into the work
(the canonical doc lives in `plugins/commons/docs/`). RESEARCH.md § E
notes the confidence loop's auto-mode is thinner, so the convention adds
the offload there more than it extends it — accounted for in Phase 4 and
Risk R6 (write the convention gate-agnostic).

## Q6 — Escape hatch

**Question**: When the autonomous run hits budget-exhaust or a deadlock
mid-phase, how does it fail given nobody is watching until the PR?

**Options**: draft PR + surface, stop | stop cold, no PR | park the fork,
keep going.

**Answer**: **Draft PR + surface, stop** — open a draft PR with
work-so-far, write the unresolved decisions into the PR body +
`UNRESOLVED.md`, emit `auto-mode-budget-exhausted`, stop.

**Rationale**: turns a stall into a reviewable artifact; the human wakes
to a partial they can read plus a clear "here is what I could not decide"
list. Depends on the `loom pr open --draft` capability added in Phase 1.
