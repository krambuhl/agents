# Build linear-loom — a personal CLI that syncs project artifacts between local work and Linear

**Slug**: `2026-05-21-linear-loom`
**Authored**: 2026-05-21
**Status**: plan, in progress (Phase 1 done; Phases 2-8 concrete)
**Research foundation**: [`RESEARCH.md`](RESEARCH.md) (consolidated into this project)
**Design spec**: [`plugins/linear-loom/docs/DESIGN.md`](../../plugins/linear-loom/docs/DESIGN.md) (21 architectural decisions; complete after Round 2 grill)

## Context

`linear-loom` is a new substrate plugin at `plugins/linear-loom/`
that adds a **personal CLI** for working on projects whose state
is mirrored between local files (git) and a Linear workspace. The
developer remains in the loop for every operation — there is no
automation, no polling, no orchestration brain, no infrastructure
beyond the developer's existing setup.

The workflow v1 supports:

1. **Project creation**: `linear-loom project create <slug>
   --linear-project=<id>` scaffolds the Linear-side artifacts
   alongside the local git project. Linear Project ID resolution
   is per-slug-only — no global default (DESIGN.md § 4).
2. **Research and planning**: `/linear-loom-research` and
   `/linear-loom-plan` conduct the conversational interview as
   today, but commit the resulting RESEARCH.md / INTERVIEW.md as
   Linear Documents (with the standard 3-line provenance header
   per DESIGN.md § 13). PLAN.md stays in git as the diff-able
   decision artifact.
3. **Plan-to-tasks generation**: `linear-loom tasks generate
   <slug>` reads PLAN.md and emits Linear Milestones / Issues /
   Sub-Issues per the stable-ID parser convention (DESIGN.md
   § 12.1–12.7). Re-runnable; PLAN.md is authoritative on drift;
   `--prune` required to archive Sub-Issues with in-flight work.
4. **Project check-in**: `linear-loom project status <slug>`
   reads the Linear-side state (active tasks, current phase) via
   the personal API key.
5. **Manual task pickup**: when the operator picks up a Linear
   Sub-Issue, they invoke `/ev-linear:ev-loop-interactive
   <slug> <phase>` on their machine. The loop calls
   `bin/linear-loom` to read project state, run the unit, write
   check-ins as comments on the Sub-Issue. PR-linkage is handled
   by Linear's native GitHub integration; on PR merge, the
   linked Sub-Issue auto-transitions to the workspace's mapped
   "merged" state (DESIGN.md § 20).

Linear is **the operator's view across projects**, not an
orchestration brain. No automatic dispatch; no agent-flow
router; no ephemeral-machine spin-up.

The architectural foundation remains the
[boundary-research dossier](RESEARCH.md) and is now fully
elaborated in [`plugins/linear-loom/docs/DESIGN.md`](../../plugins/linear-loom/docs/DESIGN.md)
across 21 resolved architectural decisions. The
**decision-vs-process axis** drives storage placement:

- **Decision artifacts** (PLAN.md, plan revisions, ADR log) → git
- **Process artifacts** (research, whiteboards, retros, INTERVIEW.md,
  status, check-ins, assignment) → Linear

Round 2 of the design grill (2026-05-22) made one architectural
pivot worth calling out at the plan level: **the `ev` plugin is
forked rather than made backend-aware** (DESIGN.md § 17).
`plugins/ev/` stays loom-only; a new `plugins/ev-linear/` plugin
carries linear-loom-only loop skills. Operator picks loop by
namespace. This means linear-loom v1's scope grows by one phase
(the ev-linear plugin work itself) but each individual ev plugin
has exactly one substrate target and no cross-CLI contract to
maintain.

The orchestration-and-ephemeral-machine vision (Symphony-shape,
Coder CLI per task, polling-driven dispatch) remains **explicitly
deferred to a future v2** project, not part of this scope.

## Scope

### In scope

- Plugin scaffolding for `plugins/linear-loom/` (mirrors loom's
  plugin layout where reasonable).
- **A complete upfront DESIGN.md** at
  `plugins/linear-loom/docs/DESIGN.md` — **DONE** (Phase 1, PRs
  #31 and #32; 21 decisions resolved across Round 1 + Round 2).
- **Implementation of the personal-CLI surface in v1**:
  - Project lifecycle verbs (`project create`, `project status`,
    `project read`).
  - Substrate mirroring (`research`, `plan`, `retro` — upload
    Documents to Linear with the standard provenance header).
  - `tasks generate` with the stable-ID parser, in-flight safety,
    `--prune` flag, `was=` rename annotation, and bidirectional
    cross-reference writes.
  - Manual write-back (`checkin write`, `phase update`, `task
    comment`).
- **`plugins/ev-linear/` plugin** carrying linear-loom-only loop
  skills (`ev-linear:ev-run`, `ev-linear:ev-loop-interactive`,
  `ev-linear:ev-loop-confidence`). Derivatives of the `ev` plugin
  bodies with every `bin/loom` call site replaced by
  `bin/linear-loom`. Griot integration excised entirely from
  ev-linear (DESIGN.md § 18). guild composition (`/guild-validate`,
  `/guild-whiteboard`) preserved unchanged.
- **Dogfood deployment**: birth a new small linear-loom-backed
  project and exercise the full substrate end-to-end (constraints
  specified in Phase 8; concrete topic chosen at Phase 8 start).

### Out of scope (deferred to a future v2 / follow-on)

- **All automation**: no GitHub Actions polling, no scheduled
  workflows, no webhook reception.
- **Coder CLI integration** and ephemeral machines per task.
- **Agent-flow router / label-driven dispatch**.
- **Symphony-shaped orchestration**.
- **Public HTTPS webhook receiver**.
- **Multi-operator coordination**.
- **Migration of existing loom projects to linear-loom**. Existing
  loom projects continue to use loom + the existing ev plugin.
- **Loom sunset**. `plugins/ev/` and `plugins/loom/` coexist with
  `plugins/ev-linear/` and `plugins/linear-loom/` indefinitely
  after this project completes; deprecation is a separate
  follow-on workstream.

### Out of scope (genuinely not happening)

- Replacing or modifying loom's behavior.
- Cross-imports between linear-loom and loom code paths.
- Reading or writing each other's project directories.
- Adding griot back into ev-linear absent concrete evidence of
  value.

## Phases

### Phase 1 — DESIGN.md (done)

**Goal**: Produce `plugins/linear-loom/docs/DESIGN.md` covering
the personal-CLI surface, Linear schema, sync model, composition
with existing substrate skills, storage primitives, failure modes,
and the ev-linear fork.

**Status**: complete. Round 1 (PR #31) shipped a 17-decision
skeleton; Round 2 (PR #32) resolved the 7 open branches and added
the ev-fork + griot-excision rework, for a final 21-decision
spine.

**Output**: `plugins/linear-loom/docs/DESIGN.md`, 648 lines.

### Phase 2 — Plugin scaffolding (concrete)

**Goal**: Create the empty-but-loadable `plugins/linear-loom/`
plugin so subsequent phases have a real target.

**Output**:
- `plugins/linear-loom/plugin.json`
- `plugins/linear-loom/{cli,skills,docs,bin,agents,contracts}`
  skeletons.
- Minimal `bin/linear-loom` entrypoint that prints help and
  routes to verb stubs.
- TypeScript build configuration mirroring loom's setup.
- README + SETUP.md explaining Linear personal-API-key setup,
  the per-slug `linear.json` marker convention, and the
  `linear-loom configure` bootstrap step.
- `plugins/linear-loom/contracts/` skeleton (empty schemas to be
  filled in as verbs ship, per DESIGN.md § 19).

**Verification**: Plugin loads cleanly via marketplace;
`linear-loom --help` runs; TypeScript + lint pass.

**Branch**: `ev-agent.linear-loom.scaffold`

### Phase 3 — Project lifecycle verbs (concrete)

**Goal**: Ship the read/create/status verbs that every downstream
phase depends on.

**Output**:
- `linear-loom project create <slug> --linear-project=<id>` —
  creates Linear-side artifacts (labels, identity prefix
  registration); writes `projects/<slug>/linear.json`. Per-slug
  resolution only; no defaults.
- `linear-loom project read <slug>` — emits loom-compatible JSON
  shape (per DESIGN.md § 19) so `ev-linear` can consume it.
  Output schema lives in
  `plugins/linear-loom/contracts/project-read.schema.json`.
- `linear-loom project status <slug>` — operator-facing summary
  of active tasks, current phase, recent comments.
- `linear-loom configure --linear-project=<id>` — idempotent
  schema bootstrap (labels, custom fields, Document templates).

**Verification**: Unit tests against mocked Linear API client;
golden-fixture tests against the JSON Schema in
`plugins/linear-loom/contracts/`; manual smoke test against a
sandbox Linear workspace.

**Branch**: `ev-agent.linear-loom.project-verbs`

### Phase 4 — Substrate mirroring (concrete)

**Goal**: Ship the verbs that the conversational substrate skills
(`/linear-loom-research`, `/linear-loom-plan`, future
`/linear-loom-retro`) shell out to.

**Output**:
- `linear-loom research <slug> --research-file=... --notes-file=...`
  — uploads RESEARCH.md and RESEARCH-NOTES.md as Linear Documents
  with the standard 3-line provenance header.
- `linear-loom plan <slug> --plan-file=... --interview-file=...`
  — writes PLAN.md to git, uploads INTERVIEW.md as a Linear
  Document.
- `linear-loom retro <slug> --type=... --retro-file=...` —
  uploads a retro as a Linear Document.
- `/linear-loom-research`, `/linear-loom-plan`,
  `/linear-loom-archive` slash-command skills (the three
  operator-direct skills per DESIGN.md § 1).

**Verification**: Unit tests for Document body assembly (header
+ source); manual smoke test of `/linear-loom-research`
end-to-end against a sandbox workspace.

**Branch**: `ev-agent.linear-loom.mirroring`

### Phase 5 — Plan-to-tasks generation (concrete)

**Goal**: Ship the most load-bearing verb in linear-loom.

**Output**:
- `linear-loom tasks generate <slug>` parsing PLAN.md per the
  stable-ID convention (DESIGN.md § 12.1).
- Composed-ID matching for re-run idempotency (§ 12.2, § 12.7).
- PLAN.md-authoritative reconciliation (§ 12.3) with `--prune`
  flag gating archive of Sub-Issues with in-flight work (§ 12.4).
- Title + body sync only on update; Linear-side metadata left
  alone (§ 12.5).
- `was=<old-id>` rename annotation support (§ 12.6).
- Bidirectional cross-reference writes (PLAN.md gets Linear URLs
  written into Phase headings; Linear Documents get the standard
  provenance header) per § 13.

**Verification**: Unit tests against PLAN.md parser fixtures
covering each sub-decision's edge cases; integration test of
diff-and-apply against a sandbox workspace covering create /
update / archive paths; explicit `--prune` flow tested with
synthetic in-flight signals.

**Branch**: `ev-agent.linear-loom.tasks-generate`

### Phase 6 — Manual write-back verbs (concrete)

**Goal**: Ship the verbs that ev-linear's loop body will call
during unit execution.

**Output**:
- `linear-loom checkin write <slug> --unit=NN --checkin-file=...`
  — posts the rendered check-in as a comment on the Linear
  Sub-Issue (DESIGN.md § 7).
- `linear-loom phase update <slug> --phase=N --status=...` —
  transitions the Linear Milestone (Milestone state is Linear's
  authority per § 11).
- `linear-loom task comment <slug> --task=<composed-id> --body=...`
  — generic comment-on-Sub-Issue verb (used by ev-linear and
  optionally by the operator).
- `linear-loom events read <slug>` — synthesizes a loom-compatible
  events-read JSON shape FROM Linear's native audit data (no
  `events.jsonl` per § 8). Schema in
  `plugins/linear-loom/contracts/events-read.schema.json`.

**Verification**: Unit tests for each verb's argv parsing and
Linear-API call shape; integration tests against a sandbox
workspace.

**Branch**: `ev-agent.linear-loom.writeback`

### Phase 7 — ev-linear plugin (concrete)

**Goal**: Ship the parallel `plugins/ev-linear/` plugin that
exercises the now-complete linear-loom CLI.

**Output**:
- `plugins/ev-linear/plugin.json`, marker files,
  `{skills,bin,docs}` skeletons.
- `ev-linear:ev-run` — router; reads `projects/<slug>/linear.json`,
  dispatches to the right ev-linear loop skill. Derived from
  `ev:ev-run`; every `bin/loom` call replaced with
  `bin/linear-loom`; griot integration deleted.
- `ev-linear:ev-loop-interactive` — human-paired execution loop.
  Derived from `ev:ev-loop-interactive`; same fork pattern.
- `ev-linear:ev-loop-confidence` — tiered-transform execution
  loop. Derived from `ev:ev-loop-confidence`; same fork pattern.
- Composes `/guild-validate` and `/guild-whiteboard` unchanged.
- Plugin dependencies declared: `linear-loom + guild` (no `loom`,
  no `griot`).

**Verification**: Plugin loads cleanly; `/ev-linear:ev-run` runs
against a sandbox linear-loom-backed project; loop skills'
output matches the same shape as the ev plugin's outputs
(modulo the substrate references).

**Branch**: `ev-agent.linear-loom.ev-linear`

### Phase 8 — Dogfood (concrete)

**Goal**: Exercise the full linear-loom + ev-linear substrate
against a real workstream to surface integration issues.

**Constraints** (PLAN.md fixes the constraints now; the concrete
topic is chosen at Phase 8 start based on whatever's next on the
substrate roadmap by then):

- Linear-loom-backed project (`linear.json` marker; not loom).
- 1–3 phases total, 3–5 deliverables per phase.
- Real workstream, not a synthetic demo.
- Exercises every verb at least once: `project create`,
  `project read`, `project status`, `configure`, `research`,
  `plan`, `retro`, `tasks generate` (including a re-run with
  PLAN.md drift), `checkin write`, `phase update`,
  `task comment`, `events read`.
- Exercises both ev-linear loop modes (`ev-loop-interactive` for
  at least one phase; `ev-loop-confidence` for at least one
  tier-shaped phase if such a phase exists in the dogfood
  project).
- Includes at least one plan revision via `/loom-revise-plan`
  (mechanical flavor; tests the cross-reference write paths).

**Output**:
- A completed dogfood project archived via
  `/linear-loom-archive`.
- A retro Document in Linear.
- A short "v1 lessons" follow-on document (in this project's
  archive or as a separate workstream) capturing integration
  issues that surfaced.

**Verification**: Operator judgment + retro. Substrate is
considered v1-complete if the dogfood completes without
substrate-side blockers (linear-loom CLI failures, ev-linear
loop crashes, schema breakage).

**Branch**: `ev-agent.linear-loom.dogfood` (umbrella for the
dogfood project itself — dogfood project lives at its own
`projects/<slug>/` path).

## Dependencies

- **Linear workspace** with admin permissions sufficient to
  configure custom fields, labels, and the project schema.
- **Linear personal API key** (`LINEAR_API_KEY` env var or
  `~/.linear-loom/config.json` auth fallback per DESIGN.md § 9).
- **Linear MCP server** access for any agent runtime that reads
  Linear state mid-work (DESIGN.md § 2).
- **Linear's native GitHub integration** configured in the
  operator's Linear workspace (DESIGN.md § 20). Out-of-band
  configuration; not provisioned by linear-loom itself.
- **TypeScript / Node toolchain** mirroring loom's plugin setup.
- **Existing substrate plugins** (`guild`): linear-loom and
  ev-linear both compose `/guild-validate` and `/guild-whiteboard`
  via the Skill tool. No code-level imports across plugins.
- **DESIGN.md** at `plugins/linear-loom/docs/DESIGN.md` — the
  authoritative architectural spec. Every Phase 3+ implementation
  decision grounds in a DESIGN.md section reference.

## Verification

| Phase | Verification approach |
|-------|-----------------------|
| Phase 1 (DESIGN.md) | DONE — `guild-validate` pass; human read-through; PR #31 + #32 sign-off. |
| Phase 2 (Scaffolding) | Plugin installs cleanly via marketplace; `linear-loom --help` runs; TypeScript + lint pass; plugin appears in Claude Code's plugin list. |
| Phase 3 (Project verbs) | Unit tests against mocked Linear API client; JSON Schema golden-fixture tests; manual smoke test against sandbox Linear workspace. |
| Phase 4 (Mirroring) | Unit tests for Document body assembly; manual smoke test of `/linear-loom-research` end-to-end. |
| Phase 5 (Tasks-generate) | Unit tests against PLAN.md parser fixtures covering each sub-decision's edge cases; integration test of diff-and-apply covering create/update/archive paths; `--prune` flow tested with synthetic in-flight signals. |
| Phase 6 (Write-back) | Unit tests for argv parsing and Linear-API call shape; integration tests against sandbox workspace. |
| Phase 7 (ev-linear) | Plugin loads cleanly; ev-linear:ev-run runs against sandbox linear-loom-backed project; loop output matches ev-plugin output shape modulo substrate references. |
| Phase 8 (Dogfood) | Operator judgment + retro. Substrate v1-complete if dogfood completes without substrate-side blockers. |

## Risks

- **Sync conflicts on bidirectional edit**. Mitigated by
  per-artifact source-of-truth tables (DESIGN.md § State
  authority) — PLAN.md is authoritative for plans; Linear is
  authoritative for status; sub-issue body sync is title + body
  only (§ 12.5). Bidirectional edit on a Sub-Issue body between
  PLAN.md edits gets overwritten on next `tasks generate`;
  documented as expected behavior.
- **Linear schema drift**. Mitigated by `linear-loom configure
  --verify` (Phase 3 verifies schema on every CLI invocation;
  fails loudly on mismatch with migration guidance).
- **Linear API errors and partial sync**. Mitigated by composed-
  stable-ID idempotency (§ 12.7) and exponential-backoff retry
  (§ 15). Re-running the same verb after a partial failure
  picks up where it left off.
- **PLAN.md parsing for tasks-generate**. Mitigated by the
  stable-ID convention (§ 12.1) which removes ambiguity — the
  parser either finds a valid `[<short-name-N>]` token or
  errors out with a structural error pointing at the line.
- **ev plugin duplication overhead**. With the fork (§ 17),
  `plugins/ev/` and `plugins/ev-linear/` carry parallel loop
  bodies that will diverge over time. Mitigated by the bounded
  size of each (a few hundred lines per skill); periodic
  re-syncing of substrate-skill shape between the two plugins
  is its own follow-on hygiene workstream. Acceptable cost vs.
  the unbounded cost of a cross-CLI substrate-contract
  abstraction.
- **Griot-excised ev-linear loops drift further from ev**. With
  griot fully out (§ 18), ev-linear loops lose the rollup-load
  channel that brings substrate-wide learnings into a fresh
  session. Mitigated by operator awareness — if griot proves
  out, the loop's startup brief is one CLI call to re-add. If
  it doesn't prove out, no re-add is needed.
- **Vocabulary divergence between loom and linear-loom CLI
  verbs**. Mitigated by DESIGN.md § 3's 1:1 verb mirroring rule.
- **Operator confusion between loom and linear-loom AND between
  ev and ev-linear**. Mitigated by clear README pointers and
  the per-slug marker file disambiguating substrate choice
  per-project.

## Open questions

The architectural open questions resolved in Phase 1 (Round 1 +
Round 2 grills) are all closed. Phase 2+ execution may surface
new open questions; append them here as they emerge.

- **Linear MCP server configuration during agent runtime**: how
  exactly does an agent invoked inside an `ev-linear` loop pick
  up Linear MCP access? `bin/linear-loom` writes via the
  personal API key; agents reading mid-work need MCP. Phase 7
  resolves once ev-linear's loop body is concrete.
- **Sub-Issue events synthesis**: `linear-loom events read`
  needs to synthesize a loom-events-shaped JSON output from
  Linear's native audit data. Linear's audit surface has known
  gaps (no native "phase started" event; phase transitions are
  derived from Milestone state changes). Phase 6 surfaces the
  exact synthesis rules.

## Decisions log

- 2026-05-21: **Project reframed mid-interview** from "loom→Linear
  migration" to "build linear-loom as parallel additive
  substrate."
- 2026-05-21: New slug `2026-05-21-linear-loom`. Boundary-research
  dossier cited as foundation.
- 2026-05-21: **Phase 1 output = single
  `plugins/linear-loom/docs/DESIGN.md`** (canonical pattern).
- 2026-05-21: **Phase shape**: Phases 1-2 concrete; Phases 3+
  sketched; revise PLAN.md after Phase 1 lands.
- 2026-05-22: **v1 reframed to personal CLI, developer-in-the-
  loop, zero new infrastructure** (revision #1). Whiteboard
  round 1 surfaced operational complexity (multi-writer cursor
  consistency, rate-limit budget at swarm scale, secrets
  rotation in ephemeral-machine model, race conditions, runbook
  gap) that motivated pulling Coder CLI integration, GH Actions
  polling, agent-flow router, and ephemeral machines OUT of v1.
- 2026-05-22: **DESIGN.md Round 1 grill** resolved 17
  architectural decisions; skeleton committed via PR #31.
- 2026-05-22: **DESIGN.md Round 2 grill** resolved 7 open
  branches via 13 new decisions (now expanded to 21 total),
  AND reworked § 17 + § 18 + § 19 to fork the ev plugin instead
  of making ev-loop backend-aware. Committed via PR #32.
- 2026-05-22: **ev plugin forks** (DESIGN.md § 17). `plugins/ev/`
  stays loom-only; new `plugins/ev-linear/` plugin carries
  linear-loom-only loop skills. No backend-routing layer. Loom
  sunset deferred indefinitely.
- 2026-05-22: **Griot fully excised from ev-linear** (DESIGN.md
  § 18). No rollup load at session start; no capture writes
  anywhere in the loop body.
- 2026-05-22: **Plan revision #2** (this revision): decompose
  Phase 3+ from sketch into concrete Phases 3-8 (project verbs,
  mirroring, tasks-generate, write-back, ev-linear, dogfood).
  One PR per cluster phase. Dogfood vehicle: birth a new small
  linear-loom-backed project at Phase 8 start; constraints
  named in PLAN.md, topic chosen then.

## Revision log


- 2026-05-22 — Phase 3+ decomposition + ev-linear addition: DESIGN.md is complete after Round 2; decompose previously-sketched Phase 3+ into concrete Phases 3-8 (one PR per cluster), add Phase 7 for the plugins/ev-linear/ plugin work that the Round 2 § 17 fork introduced, fix dogfood vehicle as constraint-named with topic deferred to Phase 8 start.

- 2026-05-22 — v1 scope reduction (revision #1): from full
  orchestration substrate to personal CLI / developer-in-the-
  loop. Whiteboard round 1 surfaced operational complexity that
  motivated pulling Coder CLI integration, GH Actions polling,
  agent-flow router, and ephemeral machines OUT of v1.
- 2026-05-22 — Phase 3+ decomposition + ev-linear addition
  (revision #2): DESIGN.md is complete after Round 2 grill;
  this revision decomposes the previously-sketched Phase 3+
  into concrete Phases 3-8 (one PR per cluster) and adds Phase
  7 for the `plugins/ev-linear/` plugin that the Round 2 § 17
  rework introduced. Dogfood vehicle constraints fixed; concrete
  topic deferred to Phase 8 start.
