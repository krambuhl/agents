# PLAN — Distributed project store & decentralized work

## Context

Research foundation: `projects/2026-06-30-distributed-project-store/RESEARCH.md`.
Design decisions: `projects/2026-06-30-distributed-project-store/decisions/`.

One project, **two axes of the same partitioning principle** (decision
0004), plus the **authoring** and **autonomy/escalation** pieces that make
the decentralized axis usable:

- **State storage** (Phases 1–5): `projects/` state in an external shared
  git repo, partitioned per-phase, no central index (0001), coherence via
  pull-before-act (0002).
- **Work distribution** (Phases 6–8): in-code site annotations + a shared
  migration dictionary, authored by a new `/loom-runbook` skill (0005),
  executed by migration skills with decentralized claim/lease (0003/0004).
- **Autonomy & escalation** (Phase 9): autonomous dispatch keeps the human
  in **ADR moments** via a git-synced async question channel (0006).

The axes meet: massive `ev-goal` fan-out (Phase 8) and ADR-moment
escalation (Phase 9) both depend on the coherence layer (Phase 4).

This **partially reverses** the archived `2026-06-02-state-file-format-audit`
consolidation: distributed multi-write needs partition-independence.

## Scope

### In

- Split project state (`project.toml` + per-phase manifests, no central
  index); `revise-plan` reconciles per-phase descriptors; pull-before-act;
  project-scoped `decisions/`; external repo + git-as-sync; migration
  converter + conventions guard.
- Site-annotation schema + migration dictionary; the `/loom-runbook`
  authoring skill; migration execution skills; decentralized claim/lease.
- ADR-moment human escalation channel for autonomous dispatch.

### Out / deferred

- ev-env shipped-default ergonomics — separate quick PRs.
- Per-record decomposition of collections (RESEARCH.md option C).
- Auto-provisioning the external repo or per-migration dictionaries.
- Remote-control as an escalation transport — VERIFIED out of scope: a
  setup-token credential is inference-only and cannot establish Remote
  Control, which also needs a persistent full-scope interactive session
  (decision 0006). A different deployment, not built here.

## Phase 1 — Split format (project.toml + per-phase descriptor) + dual-read

**Depends on**: none

**Goal**: `project.toml` (meta/config only) + `phases/<N>/manifest.toml`
(descriptor + records), additively, with dual-read so legacy single-manifest
projects keep working.

1. Types + (de)serializers for both files.
2. Dual-read resolver: `project read`/`parse-plan`/`doctor` aggregate
   `phases/*` descriptors when present, else legacy.
3. Round-trip + dual-read tests.

**Exit**: split round-trips, aggregated index matches; legacy reads
unchanged; `npm test` green.

## Phase 2 — Flip writers + revise-plan to per-phase descriptors

**Depends on**: Phase 1

**Goal**: Per-phase writers AND `revise-plan` target per-phase files.

1. `checkin`/`events`/`session`/`retro`/`pr respond`/`findings harvest` and
   `phase update` write the current phase's manifest.
2. `revise-plan` reconciles per-phase descriptors (no central index).
3. Dependency reads resolve from the depended-on phase's manifest.
4. Concurrency test: different-phase writers + a cross-phase revise-plan
   merge with no conflict.

**Exit**: per-phase writes + revise-plan land per-phase; merge tests pass;
`npm test` green.

## Phase 3 — Project-scoped decision/ADR log

**Depends on**: Phase 1

**Goal**: `loom decision <slug> "<title>" --body-file=<path>` writes
`decisions/<NNNN>-<title>.md`, shared via the project repo.

1. Allocate next number, write + commit per-record markdown; `loom
   decision list`; surface in `project read`.
2. Optional `[adr-candidate]`-at-close capture hook.

**Exit**: `loom decision` writes a numbered ADR; cross-branch decisions
don't collide; `decisions/0001..0006` are the fixtures; `npm test` green.

## Phase 4 — External repo + git-as-sync/awareness; retire ev-env sidecar

**Depends on**: Phase 2

**Goal**: External shared repo home; git distributes AND surfaces it.

1. `LOOM_PROJECTS_ROOT` → external clone; write path commits + `pull
   --rebase` + pushes (disjoint per-phase files auto-merge).
2. **Pull-before-act** in the orient step each iteration.
3. ev dispatch reads/writes the workspace clone and pushes; local pulls on
   PR-wake; remove the tar-over-ssh sidecar.
4. Smoke across two clones; no sidecar path remains.

**Exit**: state + decisions round-trip across clones; pull-before-act
surfaces a peer write; `npm test` green.

## Phase 5 — Migration converter + conventions/regression guard

**Depends on**: Phase 2

**Goal**: Migrate existing manifests to the split format; re-anchor
conventions + invariant guard.

1. One-shot converter (`manifest.toml` → `project.toml` + per-phase
   manifests), modeled on `scripts/convert-loom-state-to-toml.ts`.
2. Update `CONVENTIONS.md` + `parallel-work-invariant.test.ts` (per-phase =
   Cat 2; `decisions/` per-record; `project.toml` write-once Cat 3).
3. Decide hard-cutover vs permanent dual-read; record as a decision.

**Exit**: converter migrates a real manifest; conventions updated; `npm
test` green.

## Phase 6 — Site-annotation schema + migration dictionary + `/loom-runbook`

**Depends on**: none

**Goal**: Define the decentralized inventory format AND the authoring skill
that emits it (decision 0005). The inventory lives in the code, not a
central plan.

1. Annotation grammar — a `MIGRATE:<dict-id>` comment carrying metadata
   (dictionary id, per-site params, optional claim state) + a scanner that
   enumerates annotated sites.
2. Migration dictionary format: `<dict-id>` → transform spec; read-mostly.
3. `/loom-runbook` skill: from a `RESEARCH.md` (or topic), interview-author
   the runbook (dictionary) + the plan for seeding site annotations + the
   execution skills — the decentralized sibling of `/loom-plan`. Dispatches
   deterministic IO through a loom verb, mirroring `/loom-plan`.

**Exit**: the scanner enumerates sites and resolves dictionary entries;
`/loom-runbook` produces a runbook + annotation plan from research; `npm
test` green.

## Phase 7 — Migration execution skills: find, pluck, transform a batch

**Depends on**: Phase 6

**Goal**: Skills that select a bounded batch of sites, apply the dictionary
transform per site, and open a PR — runnable under `ev-goal`.

1. Migration skill: scan → select a bounded batch → transform per site →
   compose a PR; handled sites marked done in the diff.
2. `ev-goal` runbook execution mode: dispatch the migration skill instead of
   a phase loop.

**Exit**: a run plucks a batch and opens a PR; handled sites marked done;
`npm test` green.

## Phase 8 — Decentralized claim/lease + massive concurrency

**Depends on**: Phase 7, Phase 4

**Goal**: Many `ev-goal` runs execute concurrently without two grabbing the
same site — no central registry.

1. Claim mechanism: site-local (annotation claimed on the run's branch) or
   PR-based (the open PR is the claim); partition = site + branch/PR.
2. Coherence: pull-before-act so runs see peers' open claims and skip them.
3. Massive-concurrency ergonomics: batch sizing, PR-per-batch, double-claim
   dedupe (loser yields).

**Exit**: N concurrent runs partition the sites with no double-work or
central inventory; `npm test` green.

## Phase 9 — ADR-moment escalation: live control-plane bus + durable fallback

**Depends on**: Phase 3, Phase 4

**Goal**: Keep the human in **ADR moments** during autonomous/dispatch runs
via **two composed buses** (decisions 0006/0007/0008): a **live
control-plane** bus for real-time worker→host question routing and
cross-env coordination, with the **durable git store** as fallback +
system of record. Worker remote-control is verified out of scope (0006).

1. **ADR-moment classification**: reuse the `[adr-candidate]` marker /
   ADR-emit hook + a severity threshold to decide escalate-vs-auto-decide.
2. **Live control-plane bus (primary)**: a broker interface
   (`ask(question)→answer`, `publish(learning)`, `subscribe`) backed by an
   operator-configured transport — idiomatic candidate an **MCP broker the
   host runs**, alt. HTTP long-poll / pub-sub. On an ADR moment the worker
   **posts-and-waits** on the bus so the operator can intervene and direct
   traffic in near-real-time.
3. **Host/broker relay** (decision 0007): the operator's driving session
   (host — full-scope login, human-attended, optionally remote-controllable)
   receives the live question and surfaces it via `AskUserQuestion`
   (locally) or Remote Control (operator away), then answers over the bus.
4. **Durable fallback + record** (decisions 0006/0008): if the live bus is
   down or times out, the worker writes a partitioned `questions/<id>.md`
   and **parks** that phase/site (others proceed); the host relays it from
   the store; the answer is committed and picked up on the next
   pull-before-act. Every live exchange is also committed, keeping the store
   the system of record.
5. **Cross-env learning broadcast**: workers `publish` fresh learnings on
   the live bus so peer envs pick them up promptly; the griot learnings tree
   (committed) is the durable record. Same dual-bus shape.
6. Record (VERIFIED, decision 0006) that **worker** remote-control is **not
   available** (inference-only scope; needs a persistent full-scope
   interactive session; take-the-wheel not async escalation) — it belongs
   to the host, never the workers.

**Exit**: an ADR-moment routes to the operator over the live bus and a
returned answer resumes the worker promptly; with the live bus down, the
same exchange completes durably through the store; a published learning
reaches a peer env; routine decisions still auto-resolve; `npm test` green.

## Revision log

- 2026-06-30 — Two buses (decision 0008): live control-plane bus (primary) for real-time worker->host AskUserQuestion routing + cross-env learning broadcast, with the durable git store as fallback + system of record. Reworks Phase 9
