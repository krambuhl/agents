# 0010. Record→phase bucketing for the split store

- **Status**: accepted (Phase 1)
- **Scope**: Phase 1 split-format implementation

## Decision

When a consolidated `manifest.toml` is split into `project.toml` +
`phases/<N>/manifest.toml`, records bucket as:

- **Per-phase** (`phases/<N>/manifest.toml`): the phase descriptor +
  **checkins** (by `checkin.phase.number`) + **session retros** (by
  `retro.phase`). These carry an explicit phase number.
- **Project-level** (`project.toml`): `meta`, `config`, **revisions**,
  **sessions** (span phases via `phases_touched`, so not phase-owned),
  **events**, **replies**, **findings**, and the **project retro**.

**Orphans are lossless, not dropped.** A checkin or session-retro whose
`phase.number` has no matching phase descriptor falls back to the
project level, so `compose(split(m))` preserves every record. (Real
archived manifests carry such records — the round-trip test over all real
manifests caught a drop bug and drove this rule.)

## Why

The phase is the parallelism partition (decision 0001), so records that
carry an explicit phase belong in that phase's file — different-phase
workers then touch different files. Records that are project-scoped
(sessions span phases; revisions are the plan log) or carry no direct
phase number (replies by branch, findings by unit, events as the project
log) stay project-level for now.

## Deferred (later Phase-1/2 units)

Tightening the phase association of `replies` (via branch→phase),
`findings` (via unit→phase), and phase-scoped `events` so they too
partition per-phase. Unit 1 keeps them project-level; the round-trip
contract (no record lost) holds regardless.

## Implementation

`plugins/loom/cli/lib/split-store.ts` — additive `splitManifest` /
`composeManifest` reusing the existing manifest serializer for each part;
`split-store.test.ts` round-trips over every real manifest in the repo.
