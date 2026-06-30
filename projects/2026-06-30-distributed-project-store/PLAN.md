# PLAN — Distributed project store & decentralized work

## Context

Research foundation: `projects/2026-06-30-distributed-project-store/RESEARCH.md`.
Design decisions: `projects/2026-06-30-distributed-project-store/decisions/`.

One project, **two axes of the same partitioning principle** (decision
0004):

- **State storage** (Phases 1–5): keep `projects/` state in an external
  shared git repo, partitioned so parallel machines never write-conflict.
  No central index — each phase's descriptor lives in its own
  `phases/<N>/manifest.toml` (decision 0001); coherence is pull-before-act
  (decision 0002).
- **Work distribution** (Phases 6–8): for massively-parallel mechanical
  work, the inventory lives **in the code** (site annotations + a shared
  migration dictionary), plucked by migration skills, with decentralized
  claim/lease so many `ev-goal` runs execute concurrently with no central
  inventory (decisions 0003 + 0004).

The two meet: massive `ev-goal` fan-out (Phase 8) depends on the
cross-machine coherence layer (Phase 4).

This **partially reverses** the archived `2026-06-02-state-file-format-audit`
consolidation: distributed multi-write needs partition-independence.

## Scope

### In

- Split project state: `project.toml` (meta/config only) + per-phase
  `phases/<N>/manifest.toml` (descriptor + records). No central index.
- `loom revise-plan` reconciles per-phase descriptors; pull-before-act
  coherence; project-scoped `decisions/` ADR log.
- External shared repo via `LOOM_PROJECTS_ROOT`; git as sync + awareness;
  replaces ev-env #6 sidecar. Migration converter + conventions guard.
- Site-annotation schema + migration dictionary format; migration skills
  (find/pluck/transform a batch); decentralized claim/lease for concurrent
  `ev-goal`.

### Out / deferred

- ev-env shipped-default ergonomics (handle projection,
  `--use-parameter-defaults`, multi-agent `{target}`, auth preflight,
  up-retry) — separate quick PRs.
- Per-record decomposition of collections (RESEARCH.md option C).
- Auto-provisioning the external repo or the per-migration dictionaries —
  operators author/point at them.

## Phase 1 — Split format (project.toml + per-phase descriptor) + dual-read

**Depends on**: none

**Goal**: Introduce `project.toml` (meta/config only) and
`phases/<N>/manifest.toml` (descriptor + records) additively, with
dual-read so legacy single-manifest projects keep working.

1. Types + (de)serializers for `project.toml` and `phases/<N>/manifest.toml`
   (descriptor: number/title/dependsOn/status/branch + the six collections).
2. Dual-read resolver: `project read` / `parse-plan` / `doctor` build the
   index by aggregating `phases/*` descriptors when present, else legacy.
3. Round-trip + dual-read tests.

**Exit**: split format round-trips, aggregated index matches; legacy reads
unchanged; `npm test` green; no writer flipped.

## Phase 2 — Flip writers + revise-plan to per-phase descriptors

**Depends on**: Phase 1

**Goal**: Point per-phase writers AND `revise-plan` at per-phase files.

1. `checkin`/`events`/`session`/`retro`/`pr respond`/`findings harvest`
   write into the current phase's manifest; `phase update` writes that
   phase's status/branch there.
2. `revise-plan` reconciles per-phase descriptors (add/repath a phase
   writes the affected phase files + PLAN.md), no central index rewrite.
3. Dependency reads resolve a depended-on phase's status from its manifest.
4. Concurrency test: two workers on different phases (and a revise-plan of
   one phase while a worker updates another) merge with no conflict.

**Exit**: per-phase writes + revise-plan land per-phase; different-phase
merge tests pass; `npm test` green.

## Phase 3 — Project-scoped decision/ADR log

**Depends on**: Phase 1

**Goal**: `loom decision <slug> "<title>" --body-file=<path>` writes
`projects/<slug>/decisions/<NNNN>-<title>.md`, shared via the project repo.

1. Allocate next number, write + commit per-record markdown (conflict-free
   across machines). `loom decision list`; surface in `project read`.
2. Optional `[adr-candidate]`-at-close capture hook (only if cheap).

**Exit**: `loom decision` writes a numbered ADR; cross-branch decisions
don't collide; the hand-authored `decisions/0001..0004` are the fixtures;
`npm test` green.

## Phase 4 — External repo + git-as-sync/awareness; retire ev-env sidecar

**Depends on**: Phase 2

**Goal**: External shared repo home for project state; git distributes AND
surfaces it; replaces the ev-env #6 sidecar.

1. `LOOM_PROJECTS_ROOT` → external-repo clone; write path commits +
   `pull --rebase` + pushes (disjoint per-phase files auto-merge).
2. **Pull-before-act**: the orient step pulls the projects clone each
   iteration so peers' descriptors/decisions/learnings are visible.
3. ev dispatch reads/writes the workspace's clone and pushes; local pulls
   on PR-wake re-entry; remove the tar-over-ssh sidecar path.
4. Smoke across two clones; no sidecar-sync code path remains.

**Exit**: state + decisions round-trip across clones; pull-before-act
surfaces a peer write; no sidecar-sync; `npm test` green.

## Phase 5 — Migration converter + conventions/regression guard

**Depends on**: Phase 2

**Goal**: Migrate existing consolidated manifests to the split format and
re-anchor conventions + the invariant guard.

1. One-shot converter: `manifest.toml` → `project.toml` + per-phase
   manifests (records bucketed by phase). Model:
   `scripts/convert-loom-state-to-toml.ts`, adapted.
2. Update `projects/CONVENTIONS.md` + `parallel-work-invariant.test.ts`:
   per-phase manifests partitioned by `{phase}` (Cat 2); `decisions/`
   per-record; `project.toml` a write-once Cat-3 exception.
3. Decide hard-cutover vs permanent dual-read; record as a decision.

**Exit**: converter migrates a real manifest; conventions + invariant test
updated; dual-read decision recorded; `npm test` green.

## Phase 6 — Site-annotation schema + migration dictionary

**Depends on**: none

**Goal**: Define the in-code work inventory: a structured site annotation +
a small shared migration dictionary. The inventory lives in the code, not
a central plan.

1. Annotation grammar — a `MIGRATE:<dict-id>` comment carrying metadata
   (dictionary id, per-site params, optional claim state) — plus a scanner
   that enumerates annotated sites across the tree.
2. Migration dictionary format: a file mapping `<dict-id>` → transform
   spec/instructions; read-mostly, the only shared artifact.
3. Tests: the scanner finds sites; a dictionary id resolves to its spec.

**Exit**: a scanner enumerates annotated sites and resolves their
dictionary entries with no central inventory; `npm test` green.

## Phase 7 — Migration skills: find, pluck, transform a batch

**Depends on**: Phase 6

**Goal**: Skills that select a bounded batch of sites, apply the dictionary
transform per site, and open a PR — the "pluck off migration sites" loop —
runnable under `ev-goal`.

1. A migration skill: scan (Phase 6) → select a bounded batch → drive the
   transform per site → compose a PR; mark handled sites (annotation
   removed/updated by the PR diff).
2. `ev-goal` wiring: a dispatch shape that runs the migration skill instead
   of a phase loop.

**Exit**: a single run plucks a batch and opens a PR; handled sites are
marked done in the diff; `npm test` green.

## Phase 8 — Decentralized claim/lease + massive concurrency

**Depends on**: Phase 7, Phase 4

**Goal**: Many `ev-goal` runs execute concurrently without two grabbing the
same site — claim/lease with no central registry, riding the coherence
layer.

1. Claim mechanism: site-local (annotation marked claimed on the run's
   branch) or PR-based (the open PR is the claim); partition = site +
   branch/PR.
2. Coherence: pull-before-act (Phase 4 / decision 0002) so runs see peers'
   open claims/PRs and skip claimed sites.
3. Massive-concurrency ergonomics: batch sizing, PR-per-batch, dedupe of
   double-claims (loser yields).

**Exit**: N concurrent runs partition the annotated sites with no
double-work and no central inventory; double-claim collisions resolve by
the site/branch partition; `npm test` green.

## Revision log

- 2026-06-30 — Fold the decentralized work-distribution axis into this project (decision 0004): one project, two partitioning axes. Plan grows to 8 phases (storage 1-5 + work-distribution 6-8)
