# 0004. Fold the decentralized work-inventory into this project

- **Status**: accepted (supersedes the sibling recommendation in 0003)
- **Scope**: project scope

## Decision

The decentralized, site-annotated **work-distribution** axis (decision
0003) is **in scope for this project**, not a sibling. This project now
spans both axes of the same partitioning principle:

- **State storage** (Phases 1–5): per-phase manifests, per-record
  decisions, external repo, git-as-sync + pull-before-act.
- **Work distribution** (Phases 6–8): in-code site annotations + a shared
  migration dictionary, migration skills that find/pluck/transform site
  batches, and decentralized claim/lease so many `ev-goal` runs execute
  concurrently with no central inventory.

## Why

The operator wants one project. The two axes are not merely adjacent —
they **meet**: massively-parallel `ev-goal` runs over an annotated
codebase need exactly the cross-machine coherence (0002) and shared store
this project builds, so the claim/lease layer (Phase 8) depends on the
git-as-sync/awareness layer (Phase 4). Splitting them would force an
artificial cross-project dependency.

## Consequences

- The plan grows to **8 phases**; storage (1–5) and work-distribution
  (6–8) can largely proceed in parallel until Phase 8 joins them on the
  coherence layer (a deliberate dogfood of parallel work).
- The project title broadens to cover both storage and work distribution.
- 0003's *analysis* stands (the two axes are distinct concerns sharing
  DNA); only its "sibling project" recommendation is superseded.
