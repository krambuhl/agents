# Build linear-loom — a Linear-driven flow router for agent orchestration

**Slug**: `2026-05-21-linear-loom`
**Authored**: 2026-05-21
**Status**: plan, partial (Phases 1-2 concrete, 3+ sketched)
**Research foundation**: [`RESEARCH.md`](RESEARCH.md) (consolidated into this project from the earlier boundary-research dossier)

## Context

`linear-loom` is a new substrate plugin at `plugins/linear-loom/`
that turns a Linear workspace into the operator dashboard and
flow router for agent work. The architectural primitive is the
**status transition**: when a Linear issue's workflow state
changes — by operator action in whatever Linear view they prefer
(Kanban, list, calendar, etc.), by a system-emitted event, or by
GitHub PR lifecycle — linear-loom observes the transition and
dispatches the matching agent flow. Issues carry a label or
custom field declaring **what kind of agent flow** should run
(`planning`, `iterative-confidence`, `whiteboarding`,
`evaluator-panel`, etc.). The agent flow runs on an ephemeral
machine spun up via Coder CLI (or equivalent) and reports back to
Linear as work proceeds.

**Transition observation in v1 is polling-based**, not webhook-
based. A GitHub Actions scheduled workflow (cron, 5-minute
nominal interval) polls Linear for issues in the dispatchable
states, finds new transitions, and triggers Coder workspace
spin-ups. This sidesteps the need for a publicly reachable
webhook receiver, removes the "always-on server" infrastructure
burden, and matches the architecture OpenAI Symphony itself uses
(agents poll Linear rather than receive webhooks). The tradeoff is
latency: up to ~5 minutes between a status change and a machine
spinning up, with possible drift to 10-15 minutes during GitHub
Actions high-load periods. Webhook-driven low-latency dispatch is
named as a Phase N upgrade path once the polling pattern proves
itself in dogfood use.

Linear is not a secondary storage medium in this design. It is the
**operator UI and the orchestration brain**. The status transition
is the orchestration primitive; the Linear view (whatever the
operator prefers) is the dashboard. Storage primitives (in git or
in Linear) exist *because* the orchestration needs them, not as an
independent concern.

Loom remains untouched. linear-loom develops in `plugins/linear-loom/`
as a parallel additive substrate.

The architectural foundation is documented in this project's
[RESEARCH.md](RESEARCH.md) (originally a separate boundary-research
project, since consolidated under linear-loom). It surveys: ADR
community consensus on in-repo decision records;
Linear's product surface (Documents, MCP server, agent model, no
billable seats for agents); OpenAI Symphony's prior art for "Linear
as agent control plane" (April 2026, polling-based); and the
**decision-vs-process axis** that drives storage placement:

- **Decision artifacts** (PLAN.md, plan revisions, ADR log) → git
- **Process artifacts** (research, whiteboards, retros, INTERVIEW.md,
  events, status, check-ins, assignment) → Linear

This plan was originally scoped as a loom→Linear *migration*, then
re-framed mid-interview to "build linear-loom as a parallel
toolkit," then re-framed *again* under pressure to its current
shape: **linear-loom is the Linear-driven flow router; storage and
toolkit primitives are in service of that purpose**. See
`INTERVIEW.md` for the full decision sequence.

## Scope

### In scope

- Plugin scaffolding for `plugins/linear-loom/` (mirrors loom's
  plugin layout where reasonable; diverges where the orchestration
  model motivates it).
- **A complete upfront DESIGN.md** at
  `plugins/linear-loom/docs/DESIGN.md` covering:
  - **Orchestration model**: Linear workflow states; status-
    transition observation via GitHub Actions polling (cadence,
    query shape, idempotency); dispatch logic; agent-runtime model
    (ephemeral Coder CLI machines). Webhook-driven dispatch is
    explicitly out of v1 but the design should leave a clean seam
    for adding it later.
  - **Agent flow taxonomy**: which flows are exposed as Linear-
    routable, how each is invoked, how each composes existing
    substrate plugins (`loom`, `guild`, `ev`, `griot`).
  - **Linear schema**: custom fields, workflow states, label
    taxonomy for flow-type encoding.
  - **Polling architecture**: query design against Linear's
    complexity-points budget; cadence; idempotency keys to handle
    repeated polling without duplicate spin-ups; reconciliation
    behavior on missed iterations.
  - **Coder CLI integration**: machine lifecycle, auth distribution
    to ephemeral machines, cost monitoring, teardown reliability.
  - **Storage primitives**: per the decision-vs-process axis —
    what lives in git, what lives in Linear, addressing scheme.
  - **CLI surface and skill surface**: every linear-loom verb and
    slash command.
  - **Failure modes**: missed polling cycle, race conditions in
    multi-agent pickup, machine spin-up failure, agent flow
    failure, Coder CLI outage.
- **Implementation of the full orchestration surface in v1**:
  Linear project bootstrap, label-to-flow router, GitHub Actions
  polling workflow, Coder CLI machine harness, GitHub PR linkage.
- **Dogfood deployment**: linear-loom used against a real project
  (likely linear-loom's own remaining development as the dogfood
  subject).

### Out of scope (explicitly deferred to follow-on plans)

- **Webhook-driven dispatch**. v1 uses polling. Webhook reception
  is named as a Phase N upgrade once polling latency becomes the
  binding constraint. DESIGN.md leaves the seam clean.
- **Multi-operator coordination at scale**: v1 assumes a single
  operator interacting with a single Linear workspace. Multi-
  operator concurrency edge cases are deferred.
- **Cross-workspace orchestration**: v1 targets one Linear
  workspace. Multi-workspace routing is later.
- **Symphony-shaped 500%-PR-volume scaling concerns**: v1 ships
  the orchestration pattern; scaling it to OpenAI-Symphony
  throughput is a separate scaling project.
- **Custom Linear UI extensions**: v1 relies entirely on Linear's
  native UI (any view — Kanban, list, calendar, etc., per the
  operator's preference). No custom plugins or browser extensions.
- **Migration of existing loom projects to linear-loom**: not
  built. Existing loom projects continue to use loom.

### Out of scope (genuinely not happening)

- Replacing or modifying loom's behavior.
- Cross-imports between linear-loom and loom code paths.
- Reading or writing each other's project directories.

## Phases

### Phase 1 — DESIGN.md (concrete)

**Goal**: Produce `plugins/linear-loom/docs/DESIGN.md` — the
complete upfront design covering the full orchestration surface
above, polling-based for v1.

**Output**: One Markdown file at the path above. Doc-only PR.

**Verification**: `guild-validate` pass against DESIGN.md.
DESIGN.md touches multi-domain concerns (orchestration, security/
auth, distributed-system failure modes, agent-runtime model), so
the expected panel includes `evaluator-contract-fit` plus
whichever specialist evaluators cover security/auth review and
distributed-system architecture review at panel-derive time. If a
needed lens does not yet exist as a registered evaluator, that
gap is itself a Phase 1 sub-decision (either accept the gap and
proceed with human review, or stage the lens-creation as a
prerequisite). Plus human read-through; explicit sign-off in PR
body.

**Branch**: `ev-agent.linear-loom.design`

### Phase 2 — Plugin scaffolding (concrete)

**Goal**: Create the empty-but-loadable `plugins/linear-loom/`
plugin so subsequent phases have a real target.

**Output**:
- `plugins/linear-loom/plugin.json` with appropriate `version`.
- `plugins/linear-loom/{cli,skills,docs,bin,agents}` skeletons.
- Minimal CLI entrypoint that prints help.
- TypeScript build configuration mirroring loom's setup.
- README + SETUP doc explaining Linear auth + Coder CLI auth for
  local development.

**Verification**: Plugin loads cleanly via marketplace; `bin/
linear-loom --help` runs without error; TypeScript + lint pass.

**Branch**: `ev-agent.linear-loom.scaffold`

### Phase 3+ — Sketch (revise PLAN.md after Phase 1)

DESIGN.md will reveal the concrete implementation decomposition.
At sketch level, expect roughly:

- **Phase 3.x** — Linear project bootstrap (creates Linear project,
  custom fields, workflow states, label taxonomy; creates git
  PLAN.md skeleton).
- **Phase 4.x** — Polling infrastructure: a GitHub Actions
  scheduled workflow that polls Linear, identifies new
  dispatchable transitions, and triggers Coder workspace spin-up
  via `repository_dispatch` or direct Coder CLI invocation. PR
  lifecycle linkage via Linear's native GitHub integration.
- **Phase 5.x** — Agent flow adapters, one phase per flow type.
  Expected flows: `planning` (composes `/loom-plan` /
  `/grill-me`), `iterative-confidence` (composes
  `/ev-loop-confidence`), `iterative-interactive` (composes
  `/ev-loop-interactive`), `whiteboarding` (composes
  `/guild-whiteboard`), `evaluator-panel` (composes
  `/guild-validate`). DESIGN.md confirms the final taxonomy.
- **Phase 6.x** — Coder CLI machine harness: ephemeral machine
  spin-up per task; auth distribution to machine; teardown +
  budget enforcement.
- **Phase 7** — Dogfood: use linear-loom against a real project
  end-to-end. Identifies follow-on plans.

After Phase 1 lands, run:

```
/loom-revise-plan 2026-05-21-linear-loom \
  --revision-file=<refreshed PLAN.md> \
  --rationale="DESIGN.md complete; decomposing Phase 3+ into concrete per-component phases"
```

The revision captures the concrete decomposition; the original
plan stays in `revisions/` per the convention.

## Dependencies

- **Linear workspace** with admin permissions sufficient to
  configure custom fields, workflow states, and labels.
- **Linear MCP server** access (`mcp.linear.app/mcp`) with OAuth
  2.1 or API-key auth.
  - Citation: [Linear Docs — MCP server](https://linear.app/docs/mcp).
- **Coder CLI** (or equivalent ephemeral-machine substrate). v1
  picks one; DESIGN.md compares alternatives and justifies the
  pick.
- **GitHub Actions** for the polling workflow. The repo must allow
  scheduled workflows (`schedule: cron`) and `repository_dispatch`
  events. Nominal cadence is 5 minutes (GitHub's minimum); expect
  occasional drift to 10-15 minutes during platform high-load
  periods.
- **Linear ↔ GitHub integration**: v1 plans to use Linear's native
  GitHub integration for issue↔PR linkage and PR-merge → issue
  transitions. Agent-side GitHub auth for PR *creation* (branch
  push, gh CLI invocation from inside the ephemeral machine) is a
  separate concern DESIGN.md addresses.
- **Anthropic API key distribution** to ephemeral machines. Each
  spun-up Coder machine needs a scoped Anthropic API key to run
  the agent flow. Storage at rest, narrow scope, expiration are
  all DESIGN.md concerns.
- **TypeScript / Node toolchain** mirroring loom's plugin setup.
- **Existing substrate plugins** (`loom`, `guild`, `ev`, `griot`):
  the agent flow adapters in Phase 5 COMPOSE these via the `Skill`
  tool surface; linear-loom does NOT import their internals. The
  composition is at runtime via skill invocation, not at the code
  level.

## Verification

| Phase | Verification approach |
|-------|-----------------------|
| Phase 1 (DESIGN.md) | `guild-validate` pass; human read-through; explicit PR-body sign-off. |
| Phase 2 (Scaffolding) | Plugin installs cleanly via marketplace; `linear-loom --help` runs; TypeScript + lint pass; plugin appears in Claude Code's plugin list. |
| Phase 3+ | Per-component verification defined in DESIGN.md. Expected mix: unit tests against mocked Linear API + Coder CLI; integration tests against a sandbox Linear workspace + a real Coder dev instance; end-to-end smoke tests in the dogfood phase. |

## Risks

- **Linear API rate limits at agent scale**. Now a PRIMARY risk
  because orchestration is in v1, not deferred. The polling
  pattern's query budget against the 3M points/hour ceiling
  matters here: narrow filters (assignee + workflow state +
  pagination limit), modest cadence (5+ minutes), and per-issue
  idempotency keys are the mitigation. DESIGN.md sets the steady-
  state query design.
  - Citation: [Linear Developers — Rate limiting](https://linear.app/developers/rate-limiting).
- **Polling staleness window**. With GH Actions on 5-minute cron
  and possible platform drift to 10-15 minutes, the operator-
  perceived latency between dragging a task to In Progress and a
  machine spinning up is ~5-15 minutes. For dogfood use this is
  acceptable; for production-scale use it may not be. Mitigation:
  document the latency profile clearly; if the bound becomes
  binding, escalate to webhook-driven dispatch (out of v1).
- **GH Actions schedule drift / failure**. GitHub's scheduled
  workflows can be delayed or skipped during high-load periods.
  Mitigation: each polling run is idempotent (uses a "last
  observed transition" cursor in a Linear custom field or in the
  repo); a missed cycle simply gets caught by the next one.
  DESIGN.md defines the cursor model.
- **Race conditions in multi-agent task pickup**. If two polling
  runs (or a polling run + a manual trigger) race to claim the
  same task, who wins? Linear's assignment field can serve as a
  claim mechanism. The race semantics around "set assignee
  atomically" need testing. DESIGN.md decides claim protocol.
- **Coder CLI availability, cost, and teardown reliability**.
  Ephemeral machines that fail to tear down become expensive
  rapidly. v1 needs a hard budget cap, a max-machine-age timer,
  and an external reaper as a backstop. DESIGN.md specifies.
- **Auth distribution to ephemeral machines**. Each fresh Coder
  machine needs Linear API auth + GitHub auth + Anthropic API
  auth + any workflow-specific secrets, scoped to the task. Stored
  secrets at rest, narrow scopes, expiration. DESIGN.md addresses.
- **Agent flow adapter divergence**. Each flow has its own I/O
  shape, success criteria, and failure modes. Without a shared
  adapter contract, each adapter risks drifting into a bespoke
  shape that's hard to maintain. DESIGN.md defines the adapter
  contract before any flow is implemented.
- **Operator confusion between loom and linear-loom**. Two
  substrates with overlapping mental models. Mitigation: clear
  naming, prominent README pointers, DESIGN.md explicitly states
  "use linear-loom for orchestrated work; loom for single-track
  pairing" or similar positioning.

## Open questions

- **Custom field vs label** for flow-type encoding. Linear has
  both. Custom fields are more structured (typed values, query-
  friendly); labels are looser but more visually obvious in the
  Linear UI. DESIGN.md picks one. (Polling-friendliness leans
  toward custom-field; visual clarity leans toward label.)
- **Polling cursor model** for tracking "what we've already
  dispatched": Linear custom field on the issue, a state file in
  the repo, or a Coder-side ledger. DESIGN.md picks.
- **Polling cadence vs upgrade threshold**: when is 5-15 minute
  latency the binding constraint, and what's the trigger for
  escalating to webhook-driven dispatch? DESIGN.md names the
  upgrade criteria so the threshold isn't ad hoc later.
- **Coder CLI ↔ alternatives** (Modal, dedicated Docker runner
  pool, GitHub Codespaces, fly.io machines). DESIGN.md compares
  and justifies the v1 pick.
- **Agent identity per ephemeral machine**: does each task's
  machine get a unique Linear agent identity (for clearer audit
  trail) or do all machines share one identity (for simpler auth
  setup)? DESIGN.md decides.
- **PR linkage shape**: Linear's native GitHub integration vs
  custom integration via PR-event polling. DESIGN.md compares.
- **Cost monitoring + budget caps** for ephemeral machines: hard
  ceiling per task, per project, per day? Soft alerts? DESIGN.md
  defines policy.
- **adr-log substrate integration** with linear-loom. The user's
  earlier vision of `adr-log` in git remains; linear-loom can
  reference it as an artifact category. Implementation is its own
  substrate concern, deferred from this plan.

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

## Revision log

- 2026-05-22 — Commit to polling-via-GitHub-Actions for v1 orchestration trigger; webhook-driven dispatch deferred to Phase N. Matches Symphony's documented architecture and removes the always-on server dependency.
