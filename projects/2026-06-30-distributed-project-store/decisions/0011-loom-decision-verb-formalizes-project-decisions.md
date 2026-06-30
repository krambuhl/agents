# 0011. loom decision verb formalizes project decisions

- **Status**: accepted
- **Scope**: Phase 3
- **Date**: 2026-06-30

## Decision

Project decisions are written by `loom decision <slug> "<title>"
[--body-file] [--status] [--scope]`, which allocates the next zero-padded
number (max + 1, never reused) and writes
`projects/<slug>/decisions/NNNN-<title-slug>.md`. `loom decision list
<slug>` enumerates them. Distinct from `loom adr` (workspace-level
`projects/adr-log/`).

## Why

Phase 3 of distributed-project-store. Decisions 0001-0010 were hand-authored
in this format; this verb formalizes it so project-level learnings/decisions
are written mechanically and travel with the project (decisions 0001/0009).
Append-only per-record markdown: concurrent writes from different machines
land on different filenames, so the decision log is conflict-free under the
distributed store.

## Consequences

- `decisions/0001-0010` become the format fixtures; 0011 (this entry) is the
  first written by the verb.
- A later unit surfaces decisions in `loom project read` and wires an
  `[adr-candidate]`-at-close capture hook.
