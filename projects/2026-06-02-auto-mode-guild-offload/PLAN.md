# Auto-mode guild offload

Promote the ev execution loops' `--mode=auto` from a per-contract-gate
trick into a session-level posture: while auto-mode is armed, the loop
runs a phase's deliverables autonomously, routing the in-loop questions
it would normally ask the human to guild agent panels, and surfaces to
the human at exactly one place — the PR. "Only release for PR" becomes
the loop's invariant.

The posture is defined once as a shared convention and wired into both
`ev-loop-interactive` (the primary loop) and `ev-loop-confidence`.

See [RESEARCH.md](./RESEARCH.md) for the feasibility dossier. Its
load-bearing finding reshaped this plan: Claude Code does **not** expose
its permission/auto-accept mode to a running skill, so the originally
intended trigger (couple to the harness auto-mode) is not buildable
today. The pre-authorized fallback is now the primary trigger — the loom
`--mode=auto` flag — and harness-coupling is deferred to an Open
Question behind an absent-by-default probe seam.

## Context

Both ev loops already implement a `--mode=auto` on the two-budget
convention (`docs/AGENT-CONVENTIONS.md`: 3 per-decision rounds x 5
per-session decisions; divergent questions go to plan panels, convergent
ones to evaluators). Today that auto-mode is narrow — in
`ev-loop-interactive` it replaces the human only at contract
negotiation, ADR-emit, and a scope-shift accept-flip. Every other in-loop
human touchpoint is still human, even under `--mode=auto`:

- deliverable decomposition confirm (Step 1),
- ordering picks in free mode,
- **execution forks** ("ask when you hit a fork", Step 2.2) — undefined
  for auto-mode,
- ADR title quality,
- the checkpoint / PR boundary (Step 7).

This project closes that gap inventory: under the armed posture, all of
those route to guild panels or resolve autonomously, and the loop runs
deliverable-to-deliverable to phase-done with no human stop before the PR.

The crux risk was the trigger. RESEARCH.md § A confirms ABSENT via three
independent checks (live `env` probe — no permission-mode var; GitHub
issue #6227 "Expose Active Permission Mode to Hooks" closed not-planned;
statusline payload schema carries no mode field). A second harness fact
compounds it: even in harness `auto` mode, Claude still asks when a skill
explicitly relies on it, so coupling to the harness would not silence the
loop's `AskUserQuestion` calls for free — the loop must re-route them
itself regardless. The flag is therefore the real trigger, not a
consolation prize.

## Scope

### In

- A **"Guild-offload posture"** section in `plugins/commons/docs/AGENT-CONVENTIONS.md`
  (canonical source; synced to consumers via `scripts/sync-shared.ts`)
  defining: the armed-trigger seam, the gate-to-resolver routing table
  (which in-loop question goes to which resolver), the fork-to-panel
  convergence rule, the release boundary semantics, and the escape hatch.
- **`loom pr open --draft`** support — `plugins/loom/cli/verbs/loom/pr.ts`
  `OPEN_OPTIONS` currently has no `--draft`; both the release-boundary
  option and the escape hatch depend on it (RESEARCH.md § D).
- An **absent-by-default harness-mode probe seam** — a small lib util
  that returns `unknown` today and is the single place a future harness
  signal would wire in. Ships inert; documents the deferred coupling.
- **`ev-loop-interactive`** wired to the posture: full in-loop gate
  coverage (decomposition auto-confirm, ordering auto-pick, execution
  fork -> `guild-plan` panel, ADR title generation), the release boundary
  (default phase-at-a-time open-PR-and-stop; `--phases=all` full-stack
  draft-PR auto-advance), and the escape hatch.
- **`ev-loop-confidence`** wired to the same convention, accounting for
  its divergences from interactive (tier-contracts vs unit-contracts,
  gate-and-ratchet between tiers as a natural autonomous stop,
  delegation default ON).

### Out / deferred

- **Harness-coupling as the live trigger.** Blocked on an upstream
  signal that is confirmed absent (issue #6227, not-planned). The probe
  seam ships inert; flipping it live is a future Open Question, not a
  phase.
- Any change to the two-budget *numbers* themselves — the posture reuses
  the existing 3x5 convention; only a new per-phase fork-panel cap is
  added (see Phase 2).
- New evaluator/plan agents. The posture composes the existing
  `guild-plan` / `guild-validate` panels; it does not staff new cells.

## Phases

### Phase 1 — Convention + substrate seams (setup / gate)

**Goal**: Land the backward-compatible substrate the loops will lean on,
with nothing wired to it yet. Define the posture once; add the two
missing CLI capabilities (draft PRs, the probe seam). Old paths
unaffected.

**Exit**:
- `plugins/commons/docs/AGENT-CONVENTIONS.md` gains a "Guild-offload
  posture" section: armed-trigger seam (loom flag primary, harness probe
  deferred), the gate-to-resolver routing table, the fork-to-panel
  convergence rule (caller applies convergence; `guild-plan` does not
  synthesize), the release boundary semantics, and the escape hatch.
- `scripts/sync-shared.ts` run; the new doc section is mirrored into all
  consumer plugins; `npm run check` is green.
- `plugins/loom/cli/verbs/loom/pr.ts` `OPEN_OPTIONS` gains `--draft`,
  composing `gh pr create --draft`. Default (no flag) behavior unchanged.
- A harness-mode probe util (e.g. `plugins/commons/cli/lib/harness-mode.ts`)
  exported, returning `'unknown'` today, with a documented single wire-in
  point for a future signal. Synced.
- `pr.test.ts` asserts `--draft` composes the draft flag and that its
  absence does not. A probe-util unit test asserts the inert `'unknown'`
  return.
- Real-CLI smoke: `loom pr open --draft` against a fixture branch opens a
  draft PR (recorded in checkin notes_for_pr, not committed).
- Full repo suite green.

**Depends on**: nothing.

### Phase 2 — ev-loop-interactive: in-loop autonomy + fork-to-panel

**Goal**: Under the armed posture, `ev-loop-interactive` runs a phase's
unit loop with no human stop. Close the in-loop gate inventory and define
how execution forks resolve via a panel. Release boundary is NOT touched
here (the loop still checkpoints as today) — this phase is purely the
in-loop autonomy.

**Exit**:
- `ev-loop-interactive` SKILL.md, under the armed posture: deliverable
  decomposition auto-confirms (no human gate), free-mode ordering
  auto-picks (sequential default), ADR titles are generated rather than
  prompted.
- **Execution fork -> panel**: a genuine mid-execution fork spawns a
  `guild-plan` round on the fork; the loop applies the convergence rule
  to the panel's perspectives (since `guild-plan` returns no synthesis),
  records the decision in the checkin, and proceeds.
- **Empty-roster safety**: if the `plan-*` roster is empty (glob returns
  zero), a fork hits the escape hatch — it MUST NOT self-decide.
- A per-phase **fork-panel cap** is defined (extends the two-budget
  convention); exceeding it routes to the escape hatch.
- The loop makes **no `AskUserQuestion` calls** under the armed posture
  (RESEARCH.md § A: the harness would not silence them anyway) — every
  would-be question is routed or escaped.
- Skill-body invariant tests green (`skill-bodies-call-bare-commands`
  etc.).
- Dry-run: run the loop `--mode=auto` on a toy phase; observe no human
  prompt mid-phase and a fork routed to `guild-plan`. Recorded in
  notes_for_pr.
- `evaluator-contract-fit` panel on the revised SKILL.md returns
  approved (or flags addressed).

**Depends on**: Phase 1 (convention defines the routing table + escape
hatch the loop cites).

### Phase 3 — ev-loop-interactive: release boundary + escape hatch

**Goal**: Define where the human re-enters. Default: run the phase, open
the PR, stop. Option: `--phases=all` builds the whole stack with draft
PRs, auto-advancing across phases. Escape hatch turns a stall into a
reviewable draft.

**Exit**:
- Default posture: at phase close the loop opens the PR via § Compose PR
  and STOPS — the human reviews/merges on GitHub. One phase per
  invocation.
- `--phases=all` (or equivalent depth knob): the loop opens a **draft**
  PR per phase (Phase 1's `--draft`) and auto-advances to the next phase
  without a human stop, building the stack.
- **Escape hatch**: on budget-exhaust or unresolvable deadlock mid-phase,
  the loop opens a draft PR with work-so-far, writes `UNRESOLVED.md` and
  the undecided forks into the PR body, emits `auto-mode-budget-exhausted`,
  and stops.
- Auto-mode events extended to cover the new boundary
  (`auto-mode-converged` at clean phase close; the exhaust path reuses
  the existing event).
- Dry-runs: (1) clean phase -> open PR + stop; (2) `--phases=all` ->
  draft PRs + advance; (3) forced budget-exhaust -> draft PR + UNRESOLVED.
  Recorded in notes_for_pr.
- `evaluator-contract-fit` panel on the revised SKILL.md approved.
- Full repo suite green.

**Depends on**: Phase 1 (`--draft`), Phase 2 (the in-loop autonomy this
boundary closes over).

### Phase 4 — ev-loop-confidence: adopt the posture

**Goal**: Wire the same convention into the confidence loop, accounting
for its structural divergences from interactive. Because confidence's
auto-mode is thinner, the convention *adds* the offload here more than it
*extends* an existing branch.

**Exit**:
- `ev-loop-confidence` SKILL.md cites the Guild-offload posture
  convention and applies it at the tier granularity: tier-contracts
  (not unit-contracts) are the negotiated unit; the gate-and-ratchet
  between tiers is treated as the natural autonomous stop / checkpoint.
- Release boundary + escape hatch applied at tier/phase close consistent
  with Phase 3's semantics.
- Delegation-default-ON (confidence's existing default) is preserved
  under the posture.
- Skill-body invariant tests green.
- Dry-run: a confidence tier under `--mode=auto` offloads a fork and
  ratchets without a human stop. Recorded in notes_for_pr.
- `evaluator-contract-fit` panel approved.
- Full repo suite green.

**Depends on**: Phase 1 (convention), Phase 3 (release boundary +
escape-hatch semantics this phase mirrors).

## Verification

- **Per phase**: full vitest suite green; `npm run check` (sync drift)
  green; skill-body invariant tests green for the skill phases.
- **Phase 1** is CLI/doc work — verified by unit tests + a real-CLI
  draft-PR smoke against a fixture.
- **Phases 2-4** are skill-body behavior changes, the hard-to-test tier.
  Primary gates: (1) dry-runs of the loop under `--mode=auto` observing
  the autonomous behavior and the offload/escape paths, (2) the
  `evaluator-contract-fit` panel on each revised SKILL.md, (3) the
  existing skill-body invariant tests. This is the project's soft spot —
  see Risk R4.

## Risks

- **R1 — Trigger signal absent (confirmed).** Mitigated by design: the
  loom `--mode=auto` flag is the primary trigger; harness-coupling is
  deferred behind an inert probe. No phase is gated on the signal.
- **R2 — `guild-plan` does not synthesize.** The fork-to-panel path must
  apply the convergence rule itself; on an empty `plan-*` roster it must
  hit the escape hatch and never self-decide (Phase 2 exit criteria).
- **R3 — Per-fork panels are slow/expensive.** Bounded by the per-phase
  fork-panel cap (Phase 2); exceeding it routes to the escape hatch
  rather than spinning.
- **R4 — Skill-body behavior is hard to verify deterministically.** The
  autonomy lives in prose, not code. Mitigated by dry-runs + evaluator
  panels + invariant tests, but residual risk remains; the dry-run
  observations are the load-bearing evidence and must be recorded in
  notes_for_pr for the reviewer.
- **R5 — `AskUserQuestion` regressions.** The harness will not silence
  these in auto-mode, so any stray call mid-phase breaks the "no human
  stop" invariant. The loop must route/escape every would-be question; a
  skill-body check that the armed path contains no `AskUserQuestion` is a
  candidate guard.
- **R6 — Confidence/interactive divergence.** The convention must be
  written abstractly enough to cover tier-contracts and unit-contracts
  both; if it over-fits interactive, Phase 4 will fight it. Write the
  convention gate-agnostic in Phase 1.

## Open questions

- **Harness-coupling, live.** Revisit when/if Claude Code ships a
  permission-mode signal to skills/hooks (track issue #6227). The probe
  seam from Phase 1 is the wire-in point; flipping it live is a small
  follow-up project, not a phase here.
- **Exact fork-panel cap number.** Settle at Phase 2 execution; default
  proposal is a small integer (e.g. 2-3 fork-panels per phase before
  escape).

## Decisions

- **Fork resolution -> guild-plan panel.** A genuine execution fork
  spawns a `guild-plan` round; the loop applies the convergence rule and
  records the decision. (Interview Q1.)
- **Trigger -> loom `--mode=auto` flag (pivoted).** Originally
  harness-coupling (Q2); RESEARCH.md § A confirmed that signal absent, so
  the pre-authorized fallback (Q3) is promoted to primary. Harness probe
  ships inert.
- **Release boundary.** Default phase-at-a-time: run phase -> open PR ->
  stop -> human merges. Option `--phases=all`: draft PR per phase +
  auto-advance the stack. (Q4.)
- **Loop scope -> both loops, shared convention** in
  `AGENT-CONVENTIONS.md`. (Q5.)
- **Escape hatch -> draft PR + UNRESOLVED.md + budget-exhausted event,
  stop.** (Q6.)
- **PR cadence**: one PR per phase, stacked via `gt`
  (`ev-agent.auto-mode-guild-offload.<phase>`). Phases 2 and 3 split the
  interactive-loop work into two conceptual units (in-loop autonomy vs
  release boundary) so each PR is one reviewable change.
