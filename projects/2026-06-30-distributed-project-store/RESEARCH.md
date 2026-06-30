# RESEARCH: Distributed project store

Goal: store `projects/` state in an **external shared git repo** that all
machines (local + coder workspaces) read and write **asynchronously to
`main`**, so a project parallelized across containers can have its parts
updated concurrently without git write-conflicts.

## Problem statement

- Today project state lives **in this code repo** under
  `projects/<slug>/`. The user wants it in a **separate repo** all
  machines can clone and push to.
- Under parallelism, multiple containers update **different portions of
  the same project** concurrently. Two writers pushing to one `main`
  collide unless either (a) they pull→rebase→push around every write, or
  (b) the storage format is decomposed so concurrent writes touch
  disjoint files.

## Current state (observed)

- **State is consolidated into one file per project**:
  `projects/<slug>/manifest.toml` carries `[meta]`, `[config]`, and the
  array-of-tables sections `[[phases]]`, `[[events]]`, `[[checkins]]`,
  `[[sessions]]`, `[[retros]]`, `[[replies]]`, `[[findings]]`
  (`plugins/loom/cli/lib/manifest-toml.ts`, section markers at
  lines 481–502).
- **Every mutating verb rewrites the whole manifest** under an
  optimistic single-writer lock. `projects/CONVENTIONS.md` classifies
  `loom checkin write` / `session write` / `retro write` / `pr respond` /
  `events append` / `findings harvest` / `phase update` /
  `project scaffold` as **Category 3 — single-writer-serialized**, all
  targeting the one `manifest.toml` exception.
- **The conventions doc records the regression directly**: checkins /
  sessions / retros / pr-responses *"used to live here as partitioned
  per-record files. The state-file consolidation folded them into
  `manifest.toml` sections, which trades partition-independence for
  single-writer serialization — they are Category 3 now."*
- **The relocation hook already exists**: `plugins/loom/cli/loom.ts:187`
  resolves the projects root as `process.env.LOOM_PROJECTS_ROOT ??
  join(process.cwd(), 'projects')`. Pointing `LOOM_PROJECTS_ROOT` at a
  clone of an external repo is already supported.
- **Write surface** spans `checkin`, `events`, `session`, `retro`, `pr`
  (replies), `findings`, `phase`, `plan`, `project`, `research`, `adr`
  verbs; **read surface** is centralized in `project read`,
  `parse-plan`, `events read`, `doctor`.
- **Prior migration exists as a model**:
  `scripts/convert-loom-state-to-toml.ts` performed the *forward*
  consolidation; the reverse is a comparable, mechanical migration.

## Conflict mechanics (why format matters)

- Git merges edits to **disjoint files** cleanly; it conflicts only when
  two writers edit the **same region of the same file**.
- The consolidated manifest is one file, and every append (a checkin, an
  event, …) rewrites it and adds an array-of-tables block at/near EOF.
  Two machines each appending produce a **textual conflict at the same
  region** — exactly the common case under parallelism. Naive
  `rebase` can't resolve "both inserted a block here" without a semantic
  (TOML-aware) merge driver.
- Per-record files (the pre-consolidation Category-2 model) are
  conflict-free by construction: writer A adds
  `checkins/<branch>/03.json`, writer B adds `events/<ts>.json` →
  disjoint paths → git auto-merges. A conflict can only arise when two
  writers target the **same partition key**, which the partition design
  already rejects loudly.

## Options evaluated

**A. Pull-rebase only.** Keep the consolidated manifest; wrap every
write in fetch→rebase→push with retry. *Minimal storage change*, but the
array-append conflict is the **common** case under parallelism, so it
needs a custom TOML merge driver or it thrashes — and serializing all
writes through one file defeats the purpose of parallelizing.

**B. Pure less-flat.** Every record **and** every mutable datum
per-file, including phase status as per-phase files. *Zero shared-file
conflicts by construction*, but per-phase status files complicate
transitions and dependency reads, and it's the largest format + read
change.

**C. Hybrid — per-file collections + thin coordinated core
(recommended).** Partition the **append-only** collections back to
per-record files (conflict-free); keep a **thin** `manifest.toml` of
only the **mutable singletons** (`[meta]`, `[config]`, `[[phases]]`),
coordinated with pull→rebase→push. Conflict-free for the high-frequency
95% (checkins/events/sessions/retros/replies/findings); simple git
coordination for the rare, small core write (phase transitions).

## Recommendation: Hybrid (C)

- **Append-only collections → per-record files** under the partition
  keys `projects/CONVENTIONS.md` already names:
  - `checkins/<branch>/<NN>.json` — partition `(branch, NN)`
  - `events/<sortable-ts>-<rand>.json` — append-only, order-by-filename
  - `sessions/<date>-<letter>.json` — partition `(date, letter)`
  - `retros/<type>-<phase>-<tier>.json` — partition `(type, phase, tier)`
  - `replies/<branch>/<comment-id>.json` — partition `(branch, id)`
  - `findings/…` — append-only per-record (or keep `.jsonl` append, which
    is already Category-1 conflict-tolerant)
- **Thin core `manifest.toml`** = `[meta]`, `[config]`, `[[phases]]`
  only. Phase transitions are low-frequency and serialized per project
  via pull→rebase→push (small file, rare conflicts, cheap retry).
- **Reads aggregate** the collection directories. The read path is
  already centralized (`project read`, `parse-plan`), so aggregation is
  localized.

## Git-as-sync replaces the ev-env #6 sidecar

Confirmed direction: **the shared projects repo replaces the dispatch
sidecar-sync.** Every machine — local *and* coder workspace — clones the
external projects repo and points `LOOM_PROJECTS_ROOT` at it. A write is
`write file → commit → pull --rebase → push`. The coder dispatch flow no
longer needs tar-over-ssh: the in-workspace `/ev-run` reads/writes its
own clone and pushes to shared `main`; the local session pulls (PR-wake
re-entry pulls first) to observe progress. Git is the sync layer.

## Open questions / risks (for the plan to resolve)

1. **Core-write coordination protocol.** Define the
   pull→rebase→push-with-retry loop for the thin manifest; decide the
   merge posture when two machines flip **different** `[[phases]]`
   entries (should auto-merge) vs. the **same** phase (last-writer or
   reject-and-retry).
2. **Event ordering.** Order is already "undefined across concurrent
   writers" (Category 1); per-record event files need a **sortable
   filename** (timestamp + tiebreak) so reads can re-impose order.
3. **Migration.** A one-shot converter explodes each existing
   `manifest.toml` into per-record files + a thin core, mirroring
   `scripts/convert-loom-state-to-toml.ts` in reverse. Decide hard
   cutover vs. dual-read transition.
4. **Cross-file atomicity.** An operation that writes a checkin **and**
   flips phase status now spans two files/commits. Order so the
   immutable append lands first; accept the brief partial-state window.
5. **CLI surface.** Every write verb changes its target path; every read
   verb aggregates. Mechanical but broad; `parallel-work-invariant.test.ts`
   and `CONVENTIONS.md` must be updated to move the collections back to
   Category 2.
6. **External repo mechanics.** Private repo; auth for push from coder
   workspaces (reuse the workspace's git creds); `loom` gaining a
   pull/push seam or delegating to a thin wrapper.

## Scope boundary

This project covers the **external-repo + storage-format** change only.
The remaining ev-env shipped-default fixes (handle projection,
`--use-parameter-defaults`, multi-agent `{target}`, auth preflight,
up-retry) ship as **separate quick PRs** outside this plan.
