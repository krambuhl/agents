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

**D. Per-phase consolidated manifests (CHOSEN).** Partition by **phase**
— the grain at which work parallelizes — not by record-type. Stay
consolidated *within* a phase (one file a worker reads/writes for its
phase, machine-friendly), but give each phase its own `manifest.toml` so
two containers on different phases write **different files** → git
auto-merges. This keeps the consolidation the project values while making
parallel writes disjoint, and avoids the per-record file explosion of (C).

## Recommendation: Per-phase consolidated manifests (D)

Chosen over the per-record hybrid (C) on the operator's steer: stay
fairly consolidated, but split the one manifest **by phase**. The
parallelism grain *is* the phase (`/ev-run` dispatches per phase), so
per-phase files give each concurrent worker its own file.

Layout (in the project dir, which lives in the external shared repo):

```
projects/<slug>/
  project.toml             # [meta], [config] ONLY — identity + settings,
                           #   write-once at scaffold. NO central phase index.
  phases/<N>/manifest.toml # the phase DESCRIPTOR (title, dependsOn, status,
                           #   branch) + that phase's [[checkins]] [[events]]
                           #   [[sessions]] [[retros]] [[replies]] [[findings]]
  decisions/<NNNN>-<slug>.md   # project-scoped ADRs (per-record, shared via repo)
  PLAN.md RESEARCH.md INTERVIEW.md   # prose narrative (committed)
```

There is **no central mutable index** (decision 0001). Each phase's
descriptor — title, `dependsOn`, status, branch — lives **in that phase's
own** `manifest.toml`. "The plan index" is the *aggregate* of per-phase
files, computed by reading `phases/`. This is the correction to the
earlier "near-static index" assumption: looms self-regulate, a completing
block can re-path the plan, and under parallelism a peer may do the
re-pathing — so a single `project.toml` index would be a hot contended
surface, exactly what partitioning avoids.

- **No shared mutable file during parallel execution.** Phase status +
  descriptor live per-phase; dependency checks read the depended-on
  phase's manifest. `loom revise-plan` reconciles per-phase descriptors —
  re-pathing different phases writes different files.
- **Conflict surface shrinks to "two workers on the same phase,"** which
  the substrate already serializes (one loop per phase). Re-pathing an
  *in-flight* phase contends on that phase's file with its worker — an
  inherent coordination event, serialized.
- **`PLAN.md` is the one serialized narrative.** The machine-actionable
  structure is the partitioned per-phase descriptors; revise-plan updates
  both; PLAN.md conflicts are accepted as the cost of a deliberate
  planning act.
- **Consolidation preserved at the phase grain** — a worker reads/writes
  one file for its phase; only the *unit* of consolidation changed from
  project to phase.

## Cross-machine coherence (pull-before-act)

Partitioning makes peers' writes land conflict-free; it does not make them
**visible**. So git is the *awareness* layer too (decision 0002): every
loop iteration begins with `git -C $LOOM_PROJECTS_ROOT pull --rebase`
before orient/decide, so new per-phase descriptors, decisions, and
learnings from other machines arrive as new/updated files and are
re-read each iteration. A machine "checks in with main" by pulling, every
iteration.

## Work distribution: decentralized site-annotated inventory (in scope)

The second partitioning axis — **work distribution** — is **in scope**
(decisions 0003 + 0004). Where the storage axis partitions *project
state*, this partitions *the work itself*: for massively-parallel
mechanical work (large migrations), the inventory lives **in the code**,
not in a central plan.

- **Site annotation.** Each work site carries a structured `TODO`/`MIGRATE`
  comment with metadata: which migration it belongs to (a dictionary id),
  any per-site parameters, and claim state. The set of sites is discovered
  by scanning, never enumerated centrally.
- **Migration dictionary.** A small shared file maps a dictionary id → the
  transform spec/instructions for that migration. Written once; read by
  every run. This is the only shared artifact, and it is read-mostly.
- **Migration skills.** Skills scan for annotated sites, select a bounded
  **batch**, apply the dictionary transform per site, and open a PR — the
  "pluck off migration sites" loop.
- **Decentralized claim/lease.** Many `ev-goal` runs execute concurrently
  without two grabbing the same site. The **partition is the site** (plus
  the claiming branch/PR): a run claims a batch site-locally (annotation
  edit on its branch, or the open PR is the claim), and pull-before-act
  (decision 0002) lets runs see peers' open claims and skip them. No
  central registry to contend on.
- **Why it belongs here.** This is the same partitioning principle as the
  storage axis, and the two **meet**: massive `ev-goal` fan-out needs the
  cross-machine coherence and shared store this project builds, so the
  claim/lease layer depends on the git-as-sync/awareness layer. Folding
  them avoids an artificial cross-project dependency (decision 0004).

## Two authoring modes (decision 0005)

`/loom-research` should feed **two** downstream authoring skills:

- **`/loom-plan` (central)** — `PLAN.md` + per-phase manifests; persistent,
  project-managed, sequenced. The existing path.
- **`/loom-runbook` (decentralized, new)** — emits the in-code TODO/`MIGRATE`
  annotations + the runbook (migration dictionary) + the execution skills,
  from a `RESEARCH.md`. The authoring half of the work-distribution axis.

Both are consumed by `/ev-run` and `/ev-goal`; the modes can mix (a planned
phase whose body is a runbook fan-out). One research source, two shapes.

## Autonomy & the human in ADR moments (decision 0006)

Dispatch forces `--mode=auto` so the headless inner run never hangs on a
question (ADR-0011 §5) — but that routes *every* decision to the guild
panels. The posture this project adopts: panels handle **routine**
decisions; an **ADR-moment** decision **escalates to the human**, never
to a panel.

The escalation channel is the **shared store** itself: on an ADR-moment the
run records an async question as a partitioned record and parks that
phase/site; the operator answers via a commit (or a web UI that commits);
the loop resumes on the next pull-before-act. This is the v2 non-blocking
escalation ADR-0009 deferred, realized by the coherence layer.

**Constraint (VERIFIED):** "enable `/remote-control` on the coder box" is
**not available** for the subscription-token autonomy setup. Verified
against the Claude Code docs + GitHub issue #33105 (decision 0006): a
`setup-token`/`CLAUDE_CODE_OAUTH_TOKEN` credential is **inference-only and
cannot establish Remote Control sessions** (it lacks the
`user:sessions:claude_code` scope, which only interactive `/login`
grants); Remote Control also needs a **persistent process**, which headless
`claude -p` is not; and it is a *take-the-wheel* model, not async
escalation. So the git-synced question/answer is the **only** escalation
transport for the autonomous path; remote control belongs to a different
(full-scope, persistent, interactive) deployment this project does not
build.

## Git-as-sync replaces the ev-env #6 sidecar

Confirmed direction: **the shared projects repo replaces the dispatch
sidecar-sync.** Every machine — local *and* coder workspace — clones the
external projects repo and points `LOOM_PROJECTS_ROOT` at it. A write is
`write file → commit → pull --rebase → push`. The coder dispatch flow no
longer needs tar-over-ssh: the in-workspace `/ev-run` reads/writes its
own clone and pushes to shared `main`; the local session pulls (PR-wake
re-entry pulls first) to observe progress. Git is the sync layer.

## Project-scoped decisions (ADRs in the project repo)

Today `loom adr` writes **workspace-level** `projects/adr-log/` — code-repo
conventions, in the code repo. But project-level learnings and decisions
(why this project chose X, a constraint discovered mid-build) should
travel **with the project** so every machine working it sees them. So add
a **project-scoped** decision log: a `loom` verb writes
`projects/<slug>/decisions/<NNNN>-<title>.md`, committed into the project
dir and therefore distributed through the shared projects repo.

- Workspace ADRs (`projects/adr-log/`) stay where they are — they are
  about the *substrate/code*, not a single project.
- Project ADRs (`projects/<slug>/decisions/`) are append-only per-record
  markdown (numbered), so concurrent decision writes from different
  machines land on different filenames — conflict-free, same as the
  per-phase manifests.
- This is the natural home for the "project level learnings/decisions are
  shared to the project repo" requirement.

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

This project covers **both** the external-repo + storage-format change
(Phases 1–5) **and** the decentralized work-distribution model (Phases
6–8) — one project, two partitioning axes that meet at the coherence
layer (decision 0004). The remaining ev-env shipped-default fixes (handle
projection, `--use-parameter-defaults`, multi-agent `{target}`, auth
preflight, up-retry) ship as **separate quick PRs** outside this plan.
