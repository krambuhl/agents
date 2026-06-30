# PLAN — Distributed project store (per-phase manifests, external repo)

## Context

Research foundation: `projects/2026-06-30-distributed-project-store/RESEARCH.md`.
Design decisions: `projects/2026-06-30-distributed-project-store/decisions/`.

Keep `projects/` state in an **external shared git repo** all machines
(local + coder workspaces) read and write asynchronously to `main`, so a
project parallelized across containers updates concurrently without git
write-conflicts.

Storage model (decision 0001): **partition every concurrently-mutated
unit**. There is **no central mutable index**. Each phase's descriptor
(title, `dependsOn`, status, branch) lives in **its own**
`phases/<N>/manifest.toml` alongside that phase's records; `project.toml`
holds only `[meta]`/`[config]` (write-once). "The plan index" is the
aggregate of per-phase files. Coherence across machines is
**pull-before-act** (decision 0002). A decentralized *work*-inventory axis
is recorded as a sibling (decision 0003), kept out of scope.

This **partially reverses** the archived `2026-06-02-state-file-format-audit`
consolidation: distributed multi-write needs partition-independence, and
the phase is the right partition.

## Scope

### In

- Split project state: `project.toml` (meta/config only) + per-phase
  `phases/<N>/manifest.toml` carrying the phase **descriptor**
  (title/dependsOn/status/branch) **and** that phase's
  checkins/events/sessions/retros/replies/findings. No central index.
- `loom revise-plan` reconciles **per-phase descriptors** (add/repath a
  phase = write the affected phases' files).
- **Pull-before-act** coherence: the loop pulls the projects repo each
  iteration so peers' descriptors/decisions/learnings are visible.
- A **project-scoped** decision/ADR log at `projects/<slug>/decisions/`,
  shared via the project repo (distinct from workspace `adr-log/`).
- **External shared repo** via `LOOM_PROJECTS_ROOT`; **git as the sync +
  awareness layer**, replacing the ev-env #6 dispatch sidecar-sync.
- **Migration converter** + updates to `CONVENTIONS.md` +
  `parallel-work-invariant.test.ts`.

### Out / deferred

- ev-env shipped-default ergonomics (handle projection,
  `--use-parameter-defaults`, multi-agent `{target}`, auth preflight,
  up-retry) — separate quick PRs.
- **Per-record** decomposition of collections (RESEARCH.md option C) —
  rejected for the coarser per-phase split.
- **Decentralized site-annotated work inventory** (decision 0003) —
  sibling project; this project must not foreclose it but does not build
  it.
- Auto-provisioning the external repo — operators point
  `LOOM_PROJECTS_ROOT` at a clone they own.

## Phase 1 — Split format (project.toml + per-phase descriptor) + dual-read

**Depends on**: none

**Goal**: Introduce `project.toml` (meta/config only) and
`phases/<N>/manifest.toml` (descriptor + records) additively. Readers
**dual-read** — resolve from the split format if `phases/` exists, else the
legacy single manifest — so nothing flips yet and existing projects work.

1. `cli/lib/`: types + (de)serializers for `project.toml` (meta, config)
   and `phases/<N>/manifest.toml` (descriptor: number/title/dependsOn/
   status/branch + the six collections).
2. Dual-read resolver: `project read` / `parse-plan` / `doctor` build the
   phase index by **aggregating** `phases/*/manifest.toml` descriptors when
   the split format is present, else read the legacy single manifest.
3. Round-trip + dual-read tests: a split project reads back (index built
   from per-phase files); a legacy single-manifest project still reads.

**Exit**: split format round-trips and the aggregated index matches; legacy
projects read unchanged; `npm test` green; no writer flipped yet.

## Phase 2 — Flip writers + revise-plan to per-phase descriptors

**Depends on**: Phase 1

**Goal**: Point per-phase writers AND `revise-plan` at the per-phase files.

1. `checkin write` / `events append` / `session write` / `retro write` /
   `pr respond` / `findings harvest` write into the **current phase's**
   manifest; `phase update` writes that phase's `status`/`branch` there.
2. `revise-plan` reconciles **per-phase descriptors** — adding/repathing a
   phase writes the affected `phases/<N>/manifest.toml` files (and the
   PLAN.md narrative); it no longer rewrites a central index.
3. Dependency reads (`parse-plan` dependsOn, `/ev-run` §3) resolve a
   depended-on phase's status from its per-phase manifest.
4. Concurrency test: two workers updating **different** phases write
   different files → a git merge has no conflict; a revise-plan that
   repaths phase A while a worker updates phase B also merges clean.

**Exit**: per-phase writes + revise-plan land in the right per-phase files;
`project.toml` is untouched by execution/replan of other phases; the
different-phase merge tests pass; `npm test` green.

## Phase 3 — Project-scoped decision/ADR log

**Depends on**: Phase 1

**Goal**: A `loom` verb that writes project-level decisions into
`projects/<slug>/decisions/<NNNN>-<title>.md`, so project learnings travel
in the shared repo — distinct from the workspace `adr-log/`.

1. `loom decision <slug> "<title>" --body-file=<path>`: allocate the next
   zero-padded number, write the markdown into the project's `decisions/`,
   commit into the project dir. Append-only per-record → concurrent writes
   from different machines never collide.
2. Read/list: `loom decision list <slug>`; surface in `project read`. The
   loop re-reads decisions each iteration (pull-before-act, Phase 4).
3. Optional capture hook: an `[adr-candidate]` note at unit close routes to
   a project decision (mirror the workspace ADR-emit hook) — only if cheap.

**Exit**: `loom decision` writes a numbered ADR into `decisions/`; two
decisions from different branches don't collide; `npm test` green. (The
`decisions/0001..0003` hand-authored in this project become the format
fixtures.)

## Phase 4 — External repo + git-as-sync/awareness; retire the ev-env sidecar

**Depends on**: Phase 2

**Goal**: Make the external shared repo the home for project state, let git
distribute **and surface** it, replacing the ev-env #6 dispatch sidecar.

1. `LOOM_PROJECTS_ROOT` points at a clone of an external projects repo. The
   write path commits + `pull --rebase` + pushes; per-phase work touches
   disjoint files so racing pushes auto-merge.
2. **Pull-before-act**: the loop's orient step pulls the projects-repo clone
   each iteration (decision 0002), so peers' descriptors/decisions/learnings
   are visible before deciding.
3. ev dispatch: the in-workspace `/ev-run` reads/writes the workspace's own
   clone and pushes; the local session pulls on PR-wake re-entry. Remove the
   planned tar-over-ssh sidecar-sync path.
4. Smoke: a dispatched run writes phase state to the shared repo across two
   clones; a peer pull observes it; no sidecar-sync code path remains.

**Exit**: phase state + decisions round-trip across two clones; pull-before-
act surfaces a peer's write; the dispatch flow carries no sidecar-sync;
`npm test` green.

## Phase 5 — Migration converter + conventions/regression guard

**Depends on**: Phase 2

**Goal**: Migrate existing consolidated manifests to the split format and
re-anchor the conventions + invariant guard.

1. A one-shot converter: each existing `manifest.toml` → `project.toml`
   (meta/config) + `phases/<N>/manifest.toml` (descriptor + that phase's
   records, bucketed by the records' phase fields). Model:
   `scripts/convert-loom-state-to-toml.ts`, adapted.
2. Update `projects/CONVENTIONS.md` and
   `scripts/parallel-work-invariant.test.ts`: per-phase manifests are
   partitioned by `{phase}` (Category 2); `decisions/` is per-record;
   `project.toml` is a small Category-3 exception (write-once identity).
3. Decide hard-cutover (drop Phase-1 dual-read after migration) vs.
   permanent dual-read backstop; record the decision as a project decision
   (Phase 3).

**Exit**: the converter migrates a real archived manifest to the split
format; conventions + invariant test reflect the per-phase partition; the
dual-read decision is recorded; `npm test` green.

## Revision log

- 2026-06-30 — No central index: partition the phase index into per-phase descriptors (decision 0001); add pull-before-act cross-machine coherence (0002); note decentralized work-inventory sibling (0003)
