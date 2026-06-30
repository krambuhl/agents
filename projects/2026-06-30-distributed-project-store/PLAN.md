# PLAN — Distributed project store (multi-writer-safe, external repo)

## Context

Research foundation: `projects/2026-06-30-distributed-project-store/RESEARCH.md`.

The goal is to keep `projects/` state in an **external shared git repo**
that all machines (local + coder workspaces) read and write
asynchronously to `main`, so a project parallelized across containers can
have its parts updated concurrently without git write-conflicts.

This plan **partially reverses** the archived
`2026-06-02-state-file-format-audit` consolidation, which folded
checkins/sessions/retros/responses/findings into one `manifest.toml`. That
consolidation optimized for single-writer, single-machine reads and
explicitly *"trades partition-independence for single-writer
serialization"* (`projects/CONVENTIONS.md`). Distributed multi-write
inverts the priority: partition-independence is exactly what lets two
machines write the same project concurrently and have git auto-merge.

Deciding principle (the hybrid from RESEARCH.md): an **append-only
collection** earns per-record files (conflict-free parallel writes); the
small set of **mutable singletons** (meta, config, phase status) stays in
a thin `manifest.toml` core coordinated with pull→rebase→push.

## Scope

### In

- Decompose the append-only collections — `[[checkins]]`, `[[events]]`,
  `[[sessions]]`, `[[retros]]`, `[[replies]]`, `[[findings]]` — from
  manifest sections back to **per-record partitioned files**, restoring
  the Category-2 model `CONVENTIONS.md` describes.
- A **thin core** `manifest.toml` of `[meta]` / `[config]` / `[[phases]]`
  only, with a git pull→rebase→push coordination seam for the rare core
  write.
- **External shared repo** via `LOOM_PROJECTS_ROOT`; **git as the sync
  layer**, replacing the ev-env #6 dispatch sidecar-sync.
- A **migration converter** (existing consolidated manifests → per-record
  files + thin core) and updates to `CONVENTIONS.md` +
  `parallel-work-invariant.test.ts`.

### Out / deferred

- The ev-env shipped-default ergonomics (handle projection,
  `--use-parameter-defaults`, multi-agent `{target}`, auth preflight,
  up-retry) — separate quick PRs, not phases here.
- **Pure less-flat** (per-phase status files) — rejected in RESEARCH.md;
  phase status stays in the thin coordinated core.
- A managed external-repo provisioning tool — operators point
  `LOOM_PROJECTS_ROOT` at a clone they own; auto-provisioning is future.

## Phase 1 — Per-record storage lib + dual-read readers

**Depends on**: none

**Goal**: Add per-record file writers/readers for the six collections
under their partition paths, additively. Readers **union** the legacy
manifest sections with the new per-record files (dual-read), so nothing
flips yet and existing manifests keep working. Most carefully reviewed PR.

1. `cli/lib/`: per-record path scheme + (de)serializer for each
   collection — `checkins/<branch>/<NN>.json`, `events/<sortable-ts>-<rand>.json`,
   `sessions/<date>-<letter>.json`, `retros/<type>-<phase>-<tier>.json`,
   `replies/<branch>/<comment-id>.json`, `findings/<signature>.json`.
2. Dual-read aggregation: each collection reader returns the union of the
   manifest section AND the per-record dir, de-duped on the partition key.
3. Round-trip + dual-read tests: a per-record write is read back; a
   manifest-only project still reads; a mixed project unions correctly.

**Exit**: per-record records round-trip; readers union old + new; a real
pre-existing manifest still reads identically; `npm test` green; no writer
flipped yet.

## Phase 2 — Flip the collection writers to per-record files

**Depends on**: Phase 1

**Goal**: Point `loom checkin write` / `events append` / `session write` /
`retro write` / `pr respond` / `findings harvest` at per-record files
instead of manifest sections. The core manifest stops growing those
sections; Phase-1 readers already union.

1. Repoint each writer at its per-record path; stop appending to the
   manifest section.
2. Event filenames carry a **sortable** key (timestamp + tiebreak) so the
   reader re-imposes order (Category-1 "undefined order across writers"
   already accepted).
3. Concurrency test: simulate two writers adding **different** records →
   disjoint files → a git merge of the two with no conflict.

**Exit**: a fresh checkin/event/session/retro/reply/finding lands as a
per-record file, not a manifest section; the core manifest is unchanged by
those verbs; the two-writer merge test passes; `npm test` green.

## Phase 3 — Thin core + git coordination seam

**Depends on**: Phase 2

**Goal**: Reduce `manifest.toml` to `[meta]` / `[config]` / `[[phases]]`,
and add a git coordination seam for core writes.

1. Drop the now-empty `[[checkins]]`/`[[events]]`/`[[sessions]]`/
   `[[retros]]`/`[[replies]]`/`[[findings]]` from the core type +
   serializer (readers still resolve old data via Phase-1 dual-read).
2. A `loom` git-sync seam: `pull --rebase` before a core write, `push`
   after, with retry-on-reject. Define the phase merge posture —
   **different** `[[phases]]` entries edited concurrently must auto-merge;
   the **same** phase edited twice rejects-and-retries loud.
3. Tests: a simulated concurrent flip of two **different** phases merges
   clean; a same-phase double-flip rejects/retries rather than silently
   overwriting.

**Exit**: core is meta/config/phases only; core writes go through
pull→rebase→push; the different-phase merge and same-phase collision tests
pass; `npm test` green.

## Phase 4 — External repo + git-as-sync; retire the ev-env sidecar

**Depends on**: Phase 3

**Goal**: Make the external shared repo the home for project state and let
git distribute it, replacing the ev-env #6 dispatch sidecar-sync.

1. Document + harden `LOOM_PROJECTS_ROOT` pointing at a clone of an
   external projects repo; the loop's write path commits + pulls --rebase
   + pushes (Phase-3 seam) so all machines converge on `main`.
2. ev dispatch: the in-workspace `/ev-run` reads/writes the workspace's
   own clone and pushes; the local session pulls (PR-wake re-entry pulls
   first) to observe progress. Remove the planned tar-over-ssh sidecar-sync
   path.
3. Smoke: a dispatched run writes project state to the shared repo; a
   local pull observes it; no sidecar-sync code path remains.

**Exit**: project state round-trips through the external repo across two
clones; the dispatch flow carries no sidecar-sync; `npm test` green.

## Phase 5 — Migration converter + conventions/regression guard

**Depends on**: Phase 2

**Goal**: Migrate existing consolidated manifests to the per-record format
and re-anchor the conventions + invariant guard.

1. A one-shot converter that explodes each existing `manifest.toml`'s
   collection sections into per-record files + a thin core (model:
   `scripts/convert-loom-state-to-toml.ts`, reversed).
2. Update `projects/CONVENTIONS.md` (the six collections move from
   Category 3 back to Category 2) and
   `scripts/parallel-work-invariant.test.ts` to match.
3. Decide hard-cutover (drop Phase-1 dual-read after migration) vs.
   keeping dual-read as a permanent backstop; record the decision.

**Exit**: the converter migrates a real archived manifest; conventions +
invariant test reflect the Category-2 move; the dual-read decision is
recorded; `npm test` green.
