# 0012. Parallel dispatch and PR convergence for /ev-goal

- **Date**: 2026-07-02
- **Status**: proposed (fan-out primitives shipped; convergence procedure documented, unvalidated live)

## Context

ADR-0010/0011 gave the loop layer one environment per dispatch: `/ev-run`'s
§3 next-phase policy deliberately picks the single lowest-numbered
`not-started` phase whose dependencies are satisfied, and `--env=coder`
provisions one handle for that one phase. This is correct for the common
case — most phases are sequential — but a project that is **partitioned to
be independent** (several phases with no `dependsOn` between them) gets no
benefit from having N idle CPU-months of human attention between PRs: they
could all be worked at once.

The ask: `/ev-goal <slug> --env=coder` should be able to (a) find every
phase that's simultaneously unblocked, (b) provision one environment per
phase and dispatch all of them **concurrently**, then (c) once their PRs
are open, have a **lead** session **converge** them — order them by
dependency and stack them (rather than leaving N independent PRs off
`main` that a reviewer has to sequence by hand) — before handing back to
the normal PR-activity-driven merge cascade.

Two structural gaps stood in the way, both closed in this ADR:

1. **No primitive exposed the full ready set.** `/ev-run`'s §3 computes
   "is *a* phase ready" inline in prose, and picks one. Nothing returned
   "here are all N."
2. **One handle per subject.** `ev env up/dispatch <slug>` derives the
   handle from the slug alone (ADR-0010's `deriveHandle`) — dispatching
   phase 2 and phase 3 of the *same* project would both resolve to the
   *same* handle and collide.

## Decision

**Ship the two primitives fan-out needs; document the procedure as a v1
skill-level addition to `/ev-goal`; leave the live multi-box round-trip as
an operator-validated forward step** (consistent with how ADR-0011 shipped
dispatch mode itself — seam first, live proof after).

### 1. `loom phase ready <slug>` — the full ready set

A new loom verb, sibling to `phase list`/`phase read`. Returns **every**
`not-started` phase whose `dependsOn` (from `loom parse-plan`) are all
`completed` — not just the lowest-numbered one. `/ev-run`'s §3 single-pick
policy is **unchanged**; it can (and should) just take the lowest-numbered
entry from this same set — this ADR adds a capability, it does not change
existing single-dispatch behavior. A `dependsOn` id with no matching
manifest phase is reported in `unresolvedDeps` rather than silently
treated as satisfied or silently dropped.

### 2. `ev env <op> <subject> --tag=<x>` — disambiguated handles

A new flag on `up`/`exec`/`status`/`down`/`dispatch`. When present, the
**handle** (and only the handle) gets `-<sanitized-tag>` appended — applied
**after** `deriveHandle`, not before, so a 3-word slug doesn't silently
truncate the tag away (the whole point of the first-3-words cap is
descriptiveness, not "leaves no room for a suffix"; truncation trades the
*base*, never the tag, to stay within `maxLen`). `{slug}`/`{run}` are
**unaffected** — they still name the one real project, so the in-env
`/ev-run <slug> <phase> --mode=auto` resolves correctly regardless of which
tagged handle it's running in. Without `--tag`, behavior is byte-identical
to before (ADR-0010).

### 3. The `/ev-goal --env=coder --parallel` procedure (skill-level)

Documented in `ev-goal`'s SKILL.md as a variant of § Environment
provisioning + §3, gated behind an explicit `--parallel` flag (not
automatic — auto-fanning-out on any multi-ready-set would be a surprising
default for a flag whose whole contract today is "one environment"):

1. Compute the ready set: `loom phase ready <slug>`.
2. If `ready.length <= 1`, behave exactly as `/ev-goal --env=coder` today
   (single dispatch, §3's normal pick) — `--parallel` is a no-op when
   there is nothing to parallelize.
3. If `ready.length > 1`: for each ready phase N, concurrently:
   `Bash("ev env up <slug> --tag=p<N>")`, gate on
   `Bash("ev env status <slug> --tag=p<N>")`, then
   `Bash("ev env dispatch <slug> --phase=<N> --tag=p<N>")`. Each in-env
   `/ev-run` opens its own PR against `main` off the tree state at the
   time it was provisioned (the ready set was computed to have no
   `dependsOn` between these phases, so this is safe — none of them is
   waiting on another's code).
4. **Park and subscribe to all N PRs** — the existing "open a PR,
   subscribe, move on" posture (§3), generalized from one PR to N.

### 4. Convergence — the "return" step

When `/ev-goal` re-enters on a wake and finds **all** of a parallel
batch's PRs open (none still dispatching), run convergence before
resuming the normal goal loop:

1. `loom pr discover` each phase's branch to confirm all N are open and
   green (or at least not failing) — a batch with one phase still
   dispatching is not yet ready to converge; keep parking.
2. Order the N branches by phase number (a proxy for the plan's intended
   read order — the ready set had no *dependency* order among them, but
   the plan's phase numbering is still the intended presentation order).
3. **Stack via graphite**: `gt track` each branch if not already tracked,
   then retarget each PR's base sequentially — phase *i*'s branch bases
   onto phase *i-1*'s branch instead of `main` — so the batch reads as one
   ordered stack for review rather than N siblings. This is a **review/
   merge-ordering** choice, not a correctness requirement (the phases have
   no code dependency on each other by construction); operators who'd
   rather keep them as independent PRs can skip this step.
4. Resume the normal goal loop — PR-activity wake and merge-cascade
   advance each phase exactly as a single-dispatch batch would.

## Consequences

**Now possible.** A partitionable project can have its independent phases
worked simultaneously across N environments, converging to a reviewable
stack instead of leaving the operator to notice "these are all open, I
should order them" by hand.

**Deliberately NOT done here.**
- **Auto-detection of `--parallel`.** Explicit flag only, v1. Auto-fan-out
  on every multi-ready-set would change `/ev-goal`'s existing resource
  footprint (N environments instead of one) without the operator asking
  for it.
- **Cross-phase conflict handling.** The ready-set computation guarantees
  no *declared* dependency between the fanned-out phases, but says nothing
  about incidental file overlap. A merge conflict during convergence's
  rebase-to-stack step is a real possibility for a project that was
  optimistically "partitioned cleanly" but wasn't. Convergence must
  surface a rebase conflict as a stop-and-ask, never auto-resolve.
- **Teardown timing.** Unaddressed here, same as ADR-0010/0011 — v1
  leaves dispatch-mode environments running for reuse.
- **Live validation.** `loom phase ready` and `--tag` are unit-tested; the
  full parallel-dispatch-then-converge round-trip on real `coder`
  infrastructure has not yet been run. Per ADR-0011's precedent, this is
  expected to surface real-environment findings (a fresh box's readiness
  race, `gt` auth in a dispatch box, etc.) that this ADR cannot anticipate
  from the seam alone.

## Forward pointers

- **Auto-detect fan-out eligibility** — extend ADR-0010's v2 "agent
  decides env-need" pointer to also decide parallel-vs-single once ready
  sets are commonly > 1 in practice.
- **Conflict-aware convergence** — a preflight that dry-run-rebases each
  branch onto the prior one and reports (not applies) conflicts before
  committing to a stack order, so the operator can choose an order that
  avoids known collisions.
- **Partial-batch teardown** — tear down a fanned-out environment as soon
  as its phase's PR opens (dispatch mode's job there is done), rather than
  waiting for the whole batch or leaving it for manual `ev env down`.
