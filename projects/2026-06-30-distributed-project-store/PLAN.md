# PLAN — Distributed project store (per-phase manifests, external repo)

## Context

Research foundation: `projects/2026-06-30-distributed-project-store/RESEARCH.md`.

Keep `projects/` state in an **external shared git repo** all machines
(local + coder workspaces) read and write asynchronously to `main`, so a
project parallelized across containers updates concurrently without git
write-conflicts.

Chosen storage model (RESEARCH.md option **D**, on the operator's steer):
stay **fairly consolidated**, but split the one project `manifest.toml`
**by phase**. The parallelism grain is the phase (`/ev-run` dispatches per
phase), so each phase gets its own `phases/<N>/manifest.toml`; two
containers on different phases write different files → git auto-merges. A
near-static `project.toml` holds `[meta]`/`[config]`/the phase index.
Project-level decisions get a per-project `decisions/` ADR log that
travels in the shared repo.

This **partially reverses** the archived `2026-06-02-state-file-format-audit`
consolidation (which folded everything into one manifest, optimizing
single-writer reads); distributed multi-write needs partition-independence,
and the phase is the right partition.

## Scope

### In

- Split project state into a near-static `project.toml` (meta/config/phase
  index) + per-phase `phases/<N>/manifest.toml` (status + that phase's
  checkins/events/sessions/retros/replies/findings).
- A **project-scoped** decision/ADR log at `projects/<slug>/decisions/`,
  shared via the project repo (distinct from workspace `adr-log/`).
- **External shared repo** via `LOOM_PROJECTS_ROOT`; **git as the sync
  layer**, replacing the ev-env #6 dispatch sidecar-sync.
- **Migration converter** (single consolidated manifest → project.toml +
  per-phase manifests) and updates to `CONVENTIONS.md` +
  `parallel-work-invariant.test.ts`.

### Out / deferred

- ev-env shipped-default ergonomics (handle projection,
  `--use-parameter-defaults`, multi-agent `{target}`, auth preflight,
  up-retry) — separate quick PRs.
- **Per-record** decomposition of collections (RESEARCH.md option C) —
  rejected for the coarser, more consolidated per-phase split.
- Auto-provisioning the external repo — operators point
  `LOOM_PROJECTS_ROOT` at a clone they own.

## Phase 1 — project.toml + per-phase manifest format + dual-read

**Depends on**: none

**Goal**: Introduce the split format (a near-static `project.toml` index +
`phases/<N>/manifest.toml`) additively. Readers **dual-read** — resolve
state from the split format if present, else the legacy single manifest —
so nothing flips yet and existing projects keep working.

1. `cli/lib/`: types + (de)serializers for `project.toml` (meta, config,
   `[[phases]]` index = number/title/dependsOn/branch) and
   `phases/<N>/manifest.toml` (status + the six collections).
2. Dual-read resolver: `project read` / `parse-plan` / `doctor` read the
   split format when `phases/` exists, else fall back to the legacy single
   `manifest.toml`.
3. Round-trip + dual-read tests: a split project reads back; a legacy
   single-manifest project still reads identically.

**Exit**: split format round-trips; legacy projects read unchanged;
`npm test` green; no writer flipped yet.

## Phase 2 — Flip writers to per-phase manifests

**Depends on**: Phase 1

**Goal**: Point the per-phase writers at `phases/<N>/manifest.toml`.
`checkin write` / `events append` / `session write` / `retro write` /
`pr respond` / `findings harvest` write into the **current phase's**
manifest; `phase update` writes that phase's `status` there. `project.toml`
stays near-static.

1. Repoint each writer at the phase manifest for its phase number; record
   phase status in the per-phase file.
2. Dependency reads (`parse-plan` dependsOn satisfaction, `/ev-run` §3)
   resolve a depended-on phase's status from its per-phase manifest.
3. Concurrency test: two workers updating **different** phases write
   different files → a git merge of the two has no conflict.

**Exit**: a fresh checkin/event/status-flip lands in the right
`phases/<N>/manifest.toml`; `project.toml` is untouched by per-phase work;
the two-phase merge test passes; `npm test` green.

## Phase 3 — Project-scoped decision/ADR log

**Depends on**: Phase 1

**Goal**: A `loom` verb that writes project-level decisions into
`projects/<slug>/decisions/<NNNN>-<title>.md`, so project learnings travel
in the shared repo — distinct from the workspace `adr-log/`.

1. `loom decision <slug> "<title>" --body-file=<path>` (or
   `loom adr --project=<slug>`): allocate the next zero-padded number,
   write the markdown into the project's `decisions/`, commit into the
   project dir. Append-only per-record → concurrent writes from different
   machines never collide.
2. Read/list: `loom decision list <slug>`; surface in `project read`.
3. Wire an optional capture point (e.g. an `[adr-candidate]` note at unit
   close routes to a project decision, mirroring the existing workspace
   ADR-emit hook) — design only if cheap; otherwise leave manual.

**Exit**: `loom decision` writes a numbered ADR into
`projects/<slug>/decisions/`; two decisions from different branches don't
collide; `npm test` green.

## Phase 4 — External repo + git-as-sync; retire the ev-env sidecar

**Depends on**: Phase 2

**Goal**: Make the external shared repo the home for project state and let
git distribute it, replacing the ev-env #6 dispatch sidecar-sync.

1. Document + harden `LOOM_PROJECTS_ROOT` pointing at a clone of an
   external projects repo; the write path commits + `pull --rebase` +
   pushes so all machines converge on `main`. Because per-phase work
   touches disjoint files, racing pushes auto-merge; only the near-static
   `project.toml` needs the rebase retry.
2. ev dispatch: the in-workspace `/ev-run` reads/writes the workspace's
   own clone and pushes; the local session pulls (PR-wake re-entry pulls
   first). Remove the planned tar-over-ssh sidecar-sync path.
3. Smoke: a dispatched run writes phase state to the shared repo across
   two clones; a local pull observes it; no sidecar-sync code path remains.

**Exit**: phase state round-trips through the external repo across two
clones; the dispatch flow carries no sidecar-sync; `npm test` green.

## Phase 5 — Migration converter + conventions/regression guard

**Depends on**: Phase 2

**Goal**: Migrate existing consolidated manifests to the split format and
re-anchor the conventions + invariant guard.

1. A one-shot converter: each existing `manifest.toml` → `project.toml`
   (meta/config/phase index) + `phases/<N>/manifest.toml` (status +
   that phase's records, bucketed by the records' phase fields). Model:
   `scripts/convert-loom-state-to-toml.ts`, adapted.
2. Update `projects/CONVENTIONS.md` and
   `scripts/parallel-work-invariant.test.ts`: per-phase manifests are
   partitioned by `{phase}` (Category 2); `decisions/` is partitioned
   per-record; `project.toml` is the remaining Category-3 exception.
3. Decide hard-cutover (drop Phase-1 dual-read after migration) vs.
   keeping dual-read as a permanent legacy backstop; record the decision
   as a project decision (Phase 3).

**Exit**: the converter migrates a real archived manifest to the split
format; conventions + invariant test reflect the per-phase partition; the
dual-read decision is recorded; `npm test` green.

## Revision log

- 2026-06-30 — Switch storage model from per-record hybrid to per-phase consolidated manifests (operator steer: stay consolidated, split by phase); add project-scoped decisions/ ADR log
