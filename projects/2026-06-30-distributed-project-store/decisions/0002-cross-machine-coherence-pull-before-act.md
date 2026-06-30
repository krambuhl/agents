# 0002. Cross-machine coherence via pull-before-act

- **Status**: accepted
- **Scope**: project-level (this project's sync protocol)

## Decision

Git is the **awareness** layer, not just the storage layer. Every loop
iteration begins by refreshing the projects repo —
`git -C $LOOM_PROJECTS_ROOT pull --rebase` — *before* the orient/decide
step, so a machine sees peers' new phase descriptors, decisions, and
learnings as new/updated files. A machine "checks in with main" by
pulling, on every iteration, not on a timer.

## Why

Partitioning (decision 0001) makes peers' writes land **conflict-free**,
but conflict-free is not the same as **visible**. A machine working phase
3 must still learn that a peer finished phase 2, recorded a new decision
that changes an approach, or re-pathed the plan. Without a pull-before-act
discipline, machines drift on stale state.

## Consequences

- The loop's orient step (today `/ev-run` § 0.5 git-sync) extends to pull
  the **projects repo** clone, not just fetch the code repo.
- Because most peer writes are **new per-record/per-phase files**, the
  rebase is conflict-free in the common case; only the rare shared file
  (`PLAN.md` narrative, an in-flight phase's descriptor) can conflict, and
  those are coordination points by nature.
- New decisions/learnings from peers are **read fresh each iteration** —
  the project decision log and learnings are an input the loop re-reads,
  not a one-time load.
- This is the mechanism behind "machines check in with main for new ADRs
  and learnings from other machines."
