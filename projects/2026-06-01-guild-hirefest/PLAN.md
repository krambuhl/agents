# PLAN — guild-hirefest

## Context

Fill out the guild roster so it mirrors the RPI loop, staffed. The organizing principle (resolved in the plan interview): **a guild member's posture IS an RPI phase.** Loom already names the phases; guild's postures align to them one-to-one.

| Loom RPI phase | Guild posture(s) | Writes? | Staffed today |
|---|---|---|---|
| `loom research` | **research** (methodical — gather the evidence) | no | NO — the `researcher` phase is defined in `axes.toml` but has zero agents |
| `loom plan` | **plan** (synthesizer — reconcile into one coherent plan) | no | yes, as `whiteboard-*` (~11 domains) |
| `loom implement` (ev-loop) | **implementer -> reviewer -> fixer** | mixed | implementer/fixer: `css-architecture` only; reviewer: 8 domains |

The asymmetry the user noticed is the gap between this target and today: the write-capable pair (implementer/fixer) is a skeleton crew of one domain, and the `research` posture is unstaffed entirely. This plan closes both, makes every member constraint-aware, and aligns the read-only posture names to loom.

Research foundation: `projects/2026-06-01-future-workflow-adoption/RESEARCH.md` (write-capable expansion: wave order, the verify-grant gate, one-template-suffices, the `fusion-prompt.md` missing-fixer-block prerequisite) and `reference/WORKFLOWS-AGENT-POSTURES.md` (posture-to-phase mapping). No re-research.

**The escalation reframe (plan interview):** safety is not a deployment-time exclusion of judgment-heavy domains. Every domain is hired; "knowing your limits" is a runtime property of each agent. An agent attempts the work; when it cannot reach confidence — and the codebase and the other pipeline agents cannot lift it — it raises a sanctioned **operator-judgment-required** escalation instead of guessing. This generalizes the seed already in the verdict shape (`recusals`) and matches the substrate's advisory/blocking/`flagged-conflict` posture. So naming/a11y/react get implementers too; they escalate sooner.

## Vocabulary key (naming is architecture)

To kill the "one concept, many names" smell before it recompiles into every agent body:

- **research** = the `loom research` posture = methodical read-only evidence-gathering. Phase token `research` (renamed from the vestigial `researcher`). Agents `research-*`.
- **plan** = the `loom plan` posture = synthesizer read-only design-exploration. Phase token `plan` (renamed from `planner`). Agents `plan-*` (renamed from `whiteboard-*`). The "whiteboard" metaphor retires.
- **reviewer** = the gating verify posture. **`verifier` (the dynamic-workflows diagram's word) and `evaluator-*` (the established agent surface) are aliases for `reviewer`.** The phase token stays `reviewer`; the agent surface stays `evaluator-*` (renaming 8 evaluators + the guild-validate/parse-and-aggregate/derive-panel machinery is out of scope and not worth it). The alias is documented, not re-tokenized.
- **implementer**, **fixer** = the write postures inside `loom implement`. Unchanged tokens.
- **operator-judgment-required** = the escalation outcome (names the meaning, not the mechanism), generalizing `recusals`.

## Scope

**In:**
- A universal **constraint-awareness + escalation contract** in the codegen fusion template, so every compiled agent (every posture x domain) knows its constraints and the `operator-judgment-required` protocol.
- The `operator-judgment-required` outcome + per-agent **structured confidence signal** (enum/score) + escalation flag in `parse-and-aggregate` (generalizing `recusals`), raisable by self-assessment OR machine-detected pipeline convergence-failure.
- **RPI posture-name alignment:** `whiteboard-*` -> `plan-*`; phase tokens `planner` -> `plan`, `researcher` -> `research`.
- **Staff the `research` posture** (read-only, methodical) across **every domain that has a `plan` agent** (full RPI symmetry) — currently zero agents.
- **Hire `implementer` + `fixer`** across all artifact-producing domains, wave-sequenced mechanical-first.
- Codegen prerequisites: the missing `fixer` guidance block in `fusion-prompt.md`; implementer/fixer output-contract schemas; the deferred `validate.ts writes` coherence lint; an upfront reviewer-gap inventory.

**Out (deferred to follow-on plans):**
- **Deployment refinement** — teaching guild's composition layer (recipes / derive-panel / a possible derive-pipeline verb) to assemble the implementer->reviewer->fixer pipeline rather than flat panels. Its own `/loom-plan`.
- **Workflow execution** — running the pipeline as a live dynamic workflow (deferred per `future-workflow-adoption`: no `workflows/` plugin component type, no timeline). Build the guild side only.
- **Loop-layer routing** of `operator-judgment-required` to the human (the ev-loop / AskUserQuestion seam). The outcome must EXIST now so deployment can consume it; wiring it to the operator is deployment work.
- **Renaming the `evaluator-*` agent surface** to `reviewer-*` — out of scope; the alias is documented instead.

**Posture coverage:** the design-exploration domains (`abstraction`, `composition`, `performance`, `substrate`) stay **read-only and constraint-aware** — they get research/plan postures but no implementer/fixer (no concrete artifact to write or verify-gate). Full roster means every agent knows its lane, not every domain gets every posture.

## Phases

### Phase 1 — Escalation contract + codegen prerequisites (setup gate)

The carefully-reviewed setup PR. Small judgment core, large mechanical fan-out (a fusion-template edit invalidates the codegen cache, so the whole existing roster recompiles and inherits the contract).

- Add a universal `## Constraints` + `## Escalation` section to the fusion template / phase fragments: each agent states what it is authorized to do, what is out of its lane, and the `operator-judgment-required` protocol. Each agent emits a **structured confidence signal** (enum/score) + escalation flag in its output, so the convergence-failure path is **machine-detectable** (the aggregator compares confidence across the implementer -> reviewer -> fixer stages, not prose).
- Extend `parse-and-aggregate`: add the `operator-judgment-required` outcome + the per-agent confidence/escalation field; generalize `recusals` into it.
- Add the missing `fixer` guidance block + role-mapping entry to `fusion-prompt.md` (verified gap; required for deterministic multi-domain fixer fusion).
- Define the **distinct** implementer vs fixer output contracts (both no-self-verdict — the reviewer gates — both carrying the confidence/escalation field):
  - **implementer** (builds from a spec; greenfield or transform): `{artifact, description, verification-evidence, corrections, confidence, escalation?}`.
  - **fixer** (applies the *minimal* correction to a reviewer-flagged artifact, then re-verifies — it does not rebuild): `{corrected-artifact, fix->finding mapping, re-verification-evidence, confidence, escalation?}`.
  - The distinction is load-bearing: implementer input = spec, stop = meets spec; fixer input = artifact + findings, stop = findings cleared. Different prose, different stopping conditions — two phases, not one.
- **Reviewer-gap inventory** (promoted from advisory): enumerate, against `axes.toml`, which artifact domains lack a `reviewer` cell and which lack a runnable verify grant — these become explicit prerequisites for their write-hire wave.
- Recompile the existing roster via `/guild-compile`; the whole panel becomes constraint-aware.

Verification: schema round-trips through `parse-and-aggregate` (asserted even though the consumer is deferred, so the seam does not rot); a body-shape test asserts every compiled agent carries Constraints/Escalation; `guild-compile` smoke; spot-check a sample of regenerated bodies (uniform diff).

### Phase 2 — RPI posture-name alignment

A rename is its own conceptual unit, and per the naming evaluator it must be split where it turns structural:

- **Phase 2a (mechanical rename):** `whiteboard-*` agents -> `plan-*`; update recipes, the `guild-whiteboard` skill references, `derive-panel`/PANEL-COMPOSITION, docs. Grep-gated (zero residual `whiteboard`).
- **Phase 2b (structural phase-token reconciliation):** rename the phase-axis tokens `planner` -> `plan` and `researcher` -> `research`, so phase token = agent surface = loom verb. Schema-tested (this moves `phases = [...]` membership and `default_personality` references, so it is behavioral, not a pure rename — kept separate from 2a).

Verification: `guild-compile` smoke; grep gate for residual `whiteboard`/`planner`/`researcher`; recipes still derive the expected panels; the naming evaluator gates this phase.

### Phase 3 — Staff the `research` posture

The read-only completion of the roster. Add `research-*` agents (methodical, read-only, constraint-aware via Phase 1) at the `research` phase across **every domain that has a `plan` agent** — full RPI symmetry, since investigation precedes both planning and implementing — including the design-exploration domains (research existing patterns before exploring design). New cells inherit the escalation contract.

- Add `research` to each target domain's `phases` in `axes.toml`; add a `research-default` recipe; recompile; Live-spawn smoke.

Verification: `guild-compile` + Live-spawn smoke; the research agents resolve and produce methodical evidence-gathering output distinct from `plan-*`.

### Phase 4 — Hire implementer/fixer (wave-sequenced)

The high-volume write-capable migration. Each wave adds `implementer`/`fixer` (and a `reviewer` cell where the Phase-1 inventory found one missing) to a domain's `phases` + seed recipes, confirms/adds a runnable verify grant, recompiles, and Live-spawn smokes. New cells inherit the Phase-1 escalation contract.

- **Wave 4a — tokens** (mechanical: literal -> token). Proves the pattern. One PR.
- **Wave 4b — test-unit, test-integration, nextjs** (contract-shaped, runnable verify). One PR per domain or grouped by verify-grant similarity.
- **Wave 4c — naming, a11y, react** (judgment-heavy). Hired with the escalation contract as the load-bearing guardrail; sequenced last so the pattern is proven before the agents most likely to escalate. Isolated PRs, extra review.

Verification per wave: confirm the runnable verify grant is present in `axes.toml` (add as a prerequisite step if absent); `guild-compile` + Live-spawn smoke per the `plugins/guild/CLAUDE.md` checklist; log to `learnings/session-notes/`.

### Phase 5 — Cleanup / coherence (close the loop)

- Re-introduce the deferred `validate.ts` `writes` coherence lint (gate write-phase cells against a reviewer + verify-grant invariant).
- Fix stale `generator-*` references (`marketplace.json`, `plugins/guild/CLAUDE.md`); reconcile the generator-drop record in `AGENT-CODEGEN.md`.
- Full-roster `guild-compile` + Live-spawn smoke; refresh the Live-spawn smoke checklist for the expanded roster.

## Dependencies

- Phase 1 gates everything (the contract lives in the template; all later compiles inherit it; the reviewer-gap inventory feeds Phase 4).
- Phase 2 (alignment) lands before 3 and 4 so freshly-staffed/hired cells are not renamed afterward. 2a precedes 2b.
- Phase 3 (staff research, read-only) precedes Phase 4 (write-capable hire) — read-only before write, a deliberate risk gradient.
- Phase 5 depends on the full roster.
- The deferred **deployment** plan depends on this plan (it consumes the roster + the escalation outcome).

## Verification

- **Codegen:** `guild-compile` smoke after every template/axes edit; `.cache.toml` provenance stays coherent.
- **Live-spawn:** the `plugins/guild/CLAUDE.md` Live-spawn smoke per wave (a subagent cannot confirm spawn resolution; an operator/live check is required), logged to `learnings/session-notes/`.
- **Tests:** every agent body carries Constraints/Escalation (body-shape test); the escalation outcome round-trips `parse-and-aggregate`; `axes-schema` covers the new cells and the renamed phase tokens; the Phase-5 coherence lint passes.
- **Evaluator-gated:** each migration PR runs the antagonist panel; the naming evaluator specifically gates Phase 2.
- Happo/VRT: n/a (agent prose, not UI).

## Risks

- **Template edit -> full recompile (large diff).** Phase 1 regenerates every agent body. Mitigate: uniform/mechanical change, evaluator-gated, sample-spot-checked; it is a feature (whole roster becomes constraint-aware at once), not a defect.
- **Autonomous write-agents on judgment-heavy domains.** Mitigated BY the escalation contract (the plan's thesis) + the reviewer gate + the fact that workflow execution (the unsupervised-write path) is deferred, so writes stay operator-supervised for now.
- **Fusion non-determinism at scale.** The single existing fixer cell fused by generalizing from the implementer branch; multi-domain fixer fusion needs the Phase-1 `fusion-prompt.md` fixer block.
- **Phase 2b is behavioral, not cosmetic.** Renaming phase tokens moves `phases = [...]` membership and `default_personality` refs. Mitigate: split from 2a, schema-tested, naming-evaluator-gated.
- **Escalation outcome has no consumer yet.** The contract/outcome exists before the loop-layer routing that surfaces it (deployment work). Forward-compatible seam; Phase-1 round-trip test keeps it from rotting.

## Open questions

None outstanding — all resolved during the interview (see Decisions). Execution-time specifics (exact per-domain verify-grant lines, which domains the Phase-1 inventory finds reviewer-less) are tasks for the loop, not unresolved plan decisions.

## Decisions

- The guild roster mirrors the RPI loop; postures align to loom phases (research / plan / implement[implementer->reviewer->fixer]) (plan interview).
- Vocabulary key adopted: `reviewer`=verifier=`evaluator-*` surface; `research`/`plan` phase tokens align to loom verbs (plan interview + naming evaluator).
- Phase-token form: **bare-verb** (`research`/`plan`), load-bearing for the three-way alignment (phase token = agent surface = loom verb); not reverting to doer forms (plan interview + naming evaluator).
- `whiteboard-*` -> `plan-*`; `research` posture staffed in this plan, across **every domain that has a `plan` agent** (full RPI symmetry) (plan interview).
- `implementer` and `fixer` are **distinct postures**: implementer builds from a spec (stop = meets spec); fixer applies the minimal correction to a flagged artifact and re-verifies (stop = findings cleared). Distinct output contracts; the `fusion-prompt.md` fixer block (Phase 1) makes fixer first-class (plan interview).
- Full roster, not a gated subset — judgment-heavy domains hired with escalation as the guardrail (plan interview).
- Constraint-awareness + escalation lives in the fusion template, uniform across the roster; raisable by self-assessment AND machine-detected pipeline convergence-failure, via a **structured confidence signal** each agent emits (plan interview).
- Design-exploration domains stay read-only (research/plan), no write postures (plan interview).
- Wave PRs: **one PR per domain** (each domain is its own conceptual unit / verify grant) (plan interview).
- Build the escalation outcome on the existing verdict machinery (`recusals`/advisory/`flagged-conflict`), not a net-new subsystem.
- Deployment refinement and workflow execution deferred to follow-on plans (plan interview; `future-workflow-adoption`).
