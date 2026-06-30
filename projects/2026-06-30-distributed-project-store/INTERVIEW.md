# INTERVIEW — Distributed project store

Plan interview record. Decisions that shaped `PLAN.md`.

## Forks resolved

1. **Conflict-handling approach → Hybrid.** Per-record files for the
   append-only collections (conflict-free parallel writes) + a thin
   coordinated manifest core (meta/config/phases). Rejected pure
   pull-rebase (array-append is the common conflict; serializes the thing
   we parallelized) and pure less-flat (per-phase status files complicate
   transitions).

2. **Shared repo replaces ev-env #6 sidecar-sync → Yes.** Git is the sync
   layer; every machine + workspace clones the projects repo via
   `LOOM_PROJECTS_ROOT`.

3. **Scope → storage + repo only.** ev-env shipped-default ergonomics
   ship as separate PRs.

## Phasing rationale

Mirrors the backward-safe shape of the archived
`2026-06-02-state-file-format-audit` plan (which this partially
reverses): additive dual-read lib (P1) → flip writers (P2) → thin core +
git coordination (P3) → external repo / git-as-sync (P4) → migration +
conventions guard (P5). P5's converter depends only on P2 (format
defined), so it can run in parallel with P3/P4.

## Open during execution

- Exact per-record serialization (JSON vs TOML per file) — settle in P1.
- The same-phase concurrent-flip merge posture (reject+retry vs
  last-writer) — settle in P3 with a test.
- Hard-cutover vs permanent dual-read — settle in P5.
