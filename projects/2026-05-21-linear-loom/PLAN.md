# Build linear-loom — a personal CLI that syncs project artifacts between local work and Linear

**Slug**: `2026-05-21-linear-loom`
**Authored**: 2026-05-21
**Status**: plan, partial (Phases 1-2 concrete, 3+ sketched)
**Research foundation**: [`RESEARCH.md`](RESEARCH.md) (consolidated into this project)

## Context

`linear-loom` is a new substrate plugin at `plugins/linear-loom/`
that adds a **personal CLI** for working on projects whose state
is mirrored between local files (git) and a Linear workspace. The
developer remains in the loop for every operation — there is no
automation, no polling, no orchestration brain, no infrastructure
beyond the developer's existing setup (local machine and/or
pre-existing Coder box managed outside this project's scope).

The workflow v1 supports:

1. **Project creation**: `linear-loom project create <slug>`
   scaffolds the Linear-side artifacts (Linear project, custom
   fields, label taxonomy) alongside the local git project (per
   loom's existing project scaffolding).
2. **Research and planning**: when the operator runs `/loom-research`
   or `/loom-plan` inside the project, linear-loom mirrors the
   resulting RESEARCH.md / PLAN.md into Linear as documents or
   tasks (one task per research dossier; one task per plan).
   PLAN.md stays in git as the diff-able decision artifact;
   Linear gets a synchronized copy stakeholders can view.
3. **Plan-to-tasks generation**: once a PLAN.md is approved
   (merged), `linear-loom tasks generate <slug>` reads the plan's
   phases and deliverables and creates matching Linear tasks
   under the project — one per phase or deliverable, with the
   flow-type encoded as a Linear field/label.
4. **Project check-in**: `linear-loom project status <slug>`
   reads the Linear-side state (active tasks, current phase,
   open PRs) and surfaces a summary locally.
5. **Manual task pickup**: when the operator picks up a Linear
   task to work, they invoke the matching skill (`/loom-plan`,
   `/ev-loop-interactive`, etc.) on their local machine or
   pre-set-up Coder box. The CLI helps write status updates,
   comments, and results back to Linear as the work proceeds.

Linear is **the operator's view across projects**, not an
orchestration brain. Tasks generated from a plan show up in the
operator's Linear dashboard; the operator decides which to pick
up, when, and where to do the work. No automatic dispatch, no
agent-flow router, no ephemeral-machine spin-up.

This plan was originally scoped as a loom→Linear *migration*,
then reframed mid-interview to "linear-loom as additive parallel
toolkit," then reframed under pressure to "linear-loom IS the
orchestration substrate" — and now reframed *again* under the
weight of the whiteboard's operational-cost pressure to
**developer-in-the-loop personal CLI, no infrastructure**. See
`INTERVIEW.md` for the full decision sequence.

The architectural foundation remains the
[boundary-research dossier](RESEARCH.md): ADR community consensus
on in-repo decision records; Linear's product surface (Documents,
MCP server, agent model, no billable seats for agents); the
**decision-vs-process axis** that drives storage placement:

- **Decision artifacts** (PLAN.md, plan revisions, ADR log) → git
- **Process artifacts** (research, whiteboards, retros, INTERVIEW.md,
  events, status, check-ins, assignment) → Linear

The orchestration-and-ephemeral-machine vision (Symphony-shape,
Coder CLI per task, polling-driven dispatch) is **explicitly
deferred to a future v2** project, not part of this scope. The
whiteboard contributions from Phase 1 (orchestration concerns,
rate-limit budgets, secrets rotation, idempotency under race,
operator runbook) remain valuable input for that future project
but are out of scope for this v1.

## Scope

### In scope

- Plugin scaffolding for `plugins/linear-loom/` (mirrors loom's
  plugin layout where reasonable).
- **A complete upfront DESIGN.md** at
  `plugins/linear-loom/docs/DESIGN.md` covering:
  - **CLI surface**: every linear-loom verb (project create,
    project status, project pull, project push, research mirror,
    plan mirror, tasks generate, task comment, task status, etc.)
    with args + behavior.
  - **Linear schema**: workspace structure (project, tasks per
    research/plan/phase/deliverable), custom fields, label
    taxonomy.
  - **Sync model**: when does the CLI write to Linear (explicit
    operator gesture? after each substrate-skill output?
    idempotency keys; conflict resolution on bidirectional sync).
  - **Composition with existing substrate skills**: how
    `/loom-research`, `/loom-plan`, `/loom-revise-plan`,
    `/ev-loop-interactive`, `/ev-loop-confidence`, `/guild-validate`
    integrate. Likely shape: substrate skills run unchanged; the
    CLI runs as a post-step that mirrors outputs to Linear, or
    runs as a wrapping skill (e.g.
    `/linear-loom-research <slug>` invokes `/loom-research`
    then mirrors).
  - **Storage primitives**: per the decision-vs-process axis from
    RESEARCH.md.
  - **Skill surface**: any linear-loom slash commands.
  - **Failure modes**: Linear API down, partial sync, schema
    drift, conflict on bidirectional edit, malformed PLAN.md
    during tasks-generate parsing.
- **Implementation of the personal-CLI surface in v1**: project
  bootstrap, sync engine, plan-to-tasks generation, status
  reporting, manual write-back.
- **Dogfood deployment**: use linear-loom against a real project
  (likely linear-loom's own remaining development).

### Out of scope (deferred to a future v2 / follow-on)

- **All automation**: no GitHub Actions polling, no scheduled
  workflows, no webhook reception. The CLI runs when the
  operator runs it.
- **Coder CLI integration**: the operator already has a Coder box
  ready (managed outside this project). v1 does not provision,
  configure, or tear down Coder machines.
- **Agent-flow router / label-driven dispatch**: v1 does not
  inspect a task's flow-type label and auto-invoke the matching
  skill. The operator manually picks up a task and runs the skill
  they want.
- **Ephemeral machines per task**: v1 has no concept of
  per-task machine lifecycle.
- **Symphony-shaped orchestration**: deferred to a future v2.
- **Public HTTPS webhook receiver**: not needed.
- **Multi-operator coordination**: v1 is single-operator.
- **Migration of existing loom projects to linear-loom**: not
  built. Existing loom projects continue to use loom.

### Out of scope (genuinely not happening)

- Replacing or modifying loom's behavior.
- Cross-imports between linear-loom and loom code paths.
- Reading or writing each other's project directories.

## Phases

### Phase 1 — DESIGN.md (concrete)

**Goal**: Produce `plugins/linear-loom/docs/DESIGN.md` covering
the personal-CLI surface, Linear schema, sync model, composition
with existing substrate skills, storage primitives, failure modes.

**Output**: One Markdown file at the path above. Doc-only PR.

**Verification**: `guild-validate` pass against DESIGN.md
(`evaluator-contract-fit` baseline plus naming/design-systems
lenses for the CLI vocabulary review). Human read-through.
Explicit PR-body sign-off.

**Branch**: `ev-agent.linear-loom.design` (already cut).

**Whiteboard input**: round 1 contributions at
`projects/2026-05-21-linear-loom/whiteboards/1-design-md-composition.md`
remain valuable. Apply selectively — many engineers addressed
orchestration concerns now out of scope, but their substantive
input on CLI verb shape (substrate-engineer, react-architect),
vocabulary discipline (design-systems), Linear schema choices
(custom fields vs labels), commenting microcopy (a11y), source-
of-truth-per-artifact (substrate-engineer), and operator runbook
(skeptic) translates cleanly to the personal-CLI scope.

### Phase 2 — Plugin scaffolding (concrete)

**Goal**: Create the empty-but-loadable `plugins/linear-loom/`
plugin so subsequent phases have a real target.

**Output**:
- `plugins/linear-loom/plugin.json`
- `plugins/linear-loom/{cli,skills,docs,bin,agents}` skeletons
- Minimal CLI entrypoint that prints help
- TypeScript build configuration mirroring loom's setup
- README + SETUP doc explaining Linear MCP / API auth setup for
  local development

**Verification**: Plugin loads cleanly via marketplace;
`linear-loom --help` runs; TypeScript + lint pass.

**Branch**: `ev-agent.linear-loom.scaffold`

### Phase 3+ — Sketch (revise PLAN.md after Phase 1)

DESIGN.md will reveal the concrete implementation decomposition.
At sketch level, expect roughly:

- **Phase 3.x** — Project lifecycle verbs:
  `linear-loom project create`, `linear-loom project status`,
  `linear-loom project pull`, `linear-loom project push`.
- **Phase 4.x** — Substrate mirroring:
  `linear-loom research mirror`, `linear-loom plan mirror`,
  `linear-loom retro mirror`. May be auto-triggered via post-
  skill hooks or invoked manually — DESIGN.md decides.
- **Phase 5.x** — Plan-to-tasks generation:
  `linear-loom tasks generate <slug>` reads a finalized PLAN.md
  and emits Linear tasks per phase/deliverable.
- **Phase 6.x** — Manual write-back verbs:
  `linear-loom task comment`, `linear-loom task status`,
  `linear-loom task close`.
- **Phase 7** — Dogfood: use linear-loom against a real project
  end-to-end.

After Phase 1 lands, run:

```
/loom-revise-plan 2026-05-21-linear-loom \
  --revision-file=<refreshed PLAN.md> \
  --rationale="DESIGN.md complete; decomposing Phase 3+ into concrete per-component phases"
```

## Dependencies

- **Linear workspace** with admin permissions sufficient to
  configure custom fields, labels, and the project schema.
- **Linear MCP server** access (`mcp.linear.app/mcp`) with OAuth
  2.1 or API-key auth.
  - Citation: [Linear Docs — MCP server](https://linear.app/docs/mcp).
- **TypeScript / Node toolchain** mirroring loom's plugin setup.
- **Existing substrate plugins** (`loom`, `guild`, `ev`, `griot`):
  linear-loom either composes them at runtime (operator invokes
  the existing skill, linear-loom mirrors output) or wraps them
  in `/linear-loom-*` shims (decision in DESIGN.md). No code-
  level imports.
- **The operator's own Coder/dev environment**, set up outside
  this project. v1 does not provision or manage it.

## Verification

| Phase | Verification approach |
|-------|-----------------------|
| Phase 1 (DESIGN.md) | `guild-validate` pass; human read-through; explicit PR-body sign-off. |
| Phase 2 (Scaffolding) | Plugin installs cleanly via marketplace; `linear-loom --help` runs; TypeScript + lint pass; plugin appears in Claude Code's plugin list. |
| Phase 3+ | Per-component verification defined in DESIGN.md. Expected mix: pure-logic unit tests (sync diff computation, plan-parsing for tasks-generate); integration tests against a sandbox Linear workspace for actual API calls. |

## Risks

- **Sync conflicts on bidirectional edit**. If the operator edits
  a Linear task's body in the Linear UI between two CLI sync
  runs, and locally also edits the mirrored file, the next sync
  has to decide what to do. Mitigation: define a per-artifact
  source-of-truth (substrate-engineer's whiteboard contribution
  applies here directly), avoid bidirectional sync where
  possible, surface conflicts loudly for the operator to resolve.
  DESIGN.md addresses.
- **Linear schema drift**. If the operator's Linear workspace
  schema evolves (renamed labels, new workflow states), the
  CLI's assumptions break silently. Mitigation: an explicit
  `linear-loom schema verify` command run at session start;
  schema_version field on the project; clear error on mismatch
  with migration guidance.
- **Linear API errors and partial sync**. Network failure mid-
  sync leaves state inconsistent. Mitigation: idempotent CLI
  operations (re-running the same command produces the same
  state), explicit retry-from-checkpoint semantics, clear
  reporting of what synced vs what didn't.
- **PLAN.md parsing for tasks-generate**. Reading a markdown
  file into structured task list is fragile — markdown is loose.
  Mitigation: PLAN.md author-side conventions enforced
  (subheadings for phases, bulleted deliverables), parser
  rejects ambiguous structure with a helpful error rather than
  silently misinterpreting.
- **Vocabulary divergence between loom and linear-loom CLI
  verbs**. Loom uses `loom plan`, `loom unit`, etc.; if
  linear-loom invents parallel verbs for analogous concepts, the
  operator-confusion risk surfaces. Mitigation: deliberate
  mirroring (per the design-systems whiteboard contribution).
- **Operator-confusion between loom and linear-loom**. Two
  substrates with overlapping mental models in the same plugins/
  directory. Mitigation: clear README pointers, DESIGN.md states
  the positioning explicitly.

## Open questions

- **Custom field vs label** for flow-type encoding on tasks.
  Custom field gives a closed enum; label gives a freer surface.
  DESIGN.md picks one as source of truth.
- **Mirroring trigger**: post-skill auto-mirror via hook, or
  explicit `linear-loom mirror` invocation by operator? Hook
  feels nice but introduces invisible side effects; explicit
  invocation is louder but adds a step.
- **PLAN.md schema for tasks-generate**: what subheading
  structure does the parser expect? DESIGN.md defines.
- **Two-way vs one-way sync per artifact**. Some artifacts
  (PLAN.md) are git-source-of-truth and one-way to Linear; some
  (task status) might be Linear-source-of-truth and one-way to
  local; some (task comments) might be bidirectional. DESIGN.md
  defines per artifact.
- **adr-log substrate integration** with linear-loom: same
  decision-vs-process axis applies; ADR log stays in git. v1
  doesn't need to do anything special unless the operator wants
  ADRs mirrored to Linear.
- **Future-v2 orchestration story**: when (if ever) does v1
  evolve into the polling/dispatch/ephemeral-machine vision?
  Named as a separate project, not this plan.

## Decisions log

- 2026-05-21: **Project reframed mid-interview** from "loom→Linear
  migration" to "build linear-loom as parallel additive
  substrate." Migration framing dropped.
- 2026-05-21: New slug `2026-05-21-linear-loom`. Boundary-research
  dossier cited as foundation.
- 2026-05-21: **v1 purpose = architectural greenfield, full
  surface.** Designed from Linear's primitives forward.
- 2026-05-21: **Phase 1 output = single
  `plugins/linear-loom/docs/DESIGN.md`** (canonical pattern).
- 2026-05-21: **Phase shape**: Phases 1-2 concrete; Phases 3+
  sketched; revise PLAN.md after Phase 1 lands.
- 2026-05-21: Substrate composition initially deferred → then
  **RECONSIDERED**: orchestration is the *purpose* of linear-loom,
  not a follow-on concern. Storage primitives serve the
  orchestration.
- 2026-05-21: **v1 includes the full orchestration surface**:
  flow router, agent-flow adapters, status-transition handlers,
  Coder CLI machine harness, PR linkage. Linear's UI (any view —
  Kanban, list, calendar) is the operator surface; the
  orchestration primitive is the status transition, not the
  visual.
- 2026-05-21: **Agent runtime = ephemeral machines per task** via
  Coder CLI (or equivalent — DESIGN.md picks). Symphony-shape.
- 2026-05-21: **Transition observation in v1 is polling-based via
  GitHub Actions schedule**, not webhook-based. Matches Symphony's
  documented architecture. Sidesteps the "always-on server"
  infrastructure burden. Tradeoff is 5-15 minute latency between
  status change and machine spin-up. Webhook-driven dispatch
  named as a Phase N upgrade path.
- 2026-05-22: **Phase 1 whiteboard surfaced significant
  operational complexity** (multi-writer cursor consistency,
  Linear API rate-limit budget across orchestrator+agents,
  secrets rotation in ephemeral-machine model, race conditions in
  multi-agent pickup, operator runbook gap). Aggregate weight of
  these concerns motivated a v1 scope reduction.
- 2026-05-22: **v1 reframed to personal CLI, developer-in-the-
  loop, zero new infrastructure.** No GitHub Actions, no polling,
  no Coder integration, no agent-flow router, no automation.
  Linear is the operator's cross-project view + storage mirror
  for research/plan/retro/task artifacts. The orchestration
  vision (Symphony-shape, polling-driven dispatch, ephemeral
  machines) is explicitly deferred to a future v2 project, not
  part of this scope. Whiteboard contributions on orchestration
  concerns remain valuable input for that future v2.

## Revision log

- 2026-05-22 — v1 scope reduction: from full orchestration substrate to personal CLI / developer-in-the-loop. Whiteboard round 1 surfaced operational complexity (multi-writer cursor consistency, rate-limit budget at swarm scale, secrets rotation in ephemeral-machine model, race conditions, runbook gap) that motivated pulling Coder CLI integration, GH Actions polling, agent-flow router, and ephemeral machines OUT of v1. Linear becomes the operator's cross-project view + storage mirror; no automation. Orchestration vision explicitly deferred to a future v2 project.
