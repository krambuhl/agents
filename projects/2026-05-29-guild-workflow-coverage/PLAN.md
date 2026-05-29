# PLAN — guild workflow coverage and agents restructure

**Project**: `guild-workflow-coverage`
**Loop**: per-phase (P1 `/ev-loop-confidence`, P2-P3 `/ev-loop-interactive`)
**Cadence**: stacked via `gt`, sequential 1 then 2 then 3, one PR per phase
**Research**: `projects/WORKFLOWS-AGENT-POSTURES.md` + `projects/WORKFLOWS-PARALLEL-ADOPTION.md` (validated in PR #142), with the correction in Context below

## Context

The workflow-adoption validation (#142) established the architecture: loom is the durable spine, workflows are a safe ephemeral leaf, the write boundary is loom's own Cat-1/2/3 invariant, and the per-task workflow pipeline is implementer then verifier then fixer.

Correction established while planning (from reading `plugins/guild/axes.toml` + `modes/phases/`): guild's matrix already models the write-capable half. `axis.phase.implementer` exists (write-capable, Edit/Write/Bash, default pragmatist), and its fragment states it outright — a personality composed in implementer phase IS the generator pattern; there is no separate generator axis. The Phase-7 U1 generator-drop was a reframe (generator-axis to implementer-phase), not a capability gap. The full RPI lifecycle is authored as phases: researcher, planner, reviewer, implementer. Only the fixer phase is genuinely unauthored, and implementer/researcher are uninstantiated (no domain/personality/recipe uses them; pragmatist.phases is empty), so zero agents generate from them.

So full workflow coverage is mostly instantiation, not authoring, and it lands cleaner if `agents/` is flattened first so the new agents get a clean `guild:<agent>` namespace instead of `guild:generated:<agent>`.

## Scope

### In
- P1: restructure `plugins/guild/agents/` — move the source out, flatten the spawnable agents to a flat top-level `agents/`.
- P2: instantiate the existing implementer phase and author plus instantiate a new fixer phase, both for the proof domain css-architecture.
- P3: wire the new postures into the workflow path — simplify the name-mapping, repair the dangling generator-css-codemod references, define the write-capable output schema.

### Out and deferred
- The whiteboard-to-research rename and instantiating the dormant researcher phase — a different intent (naming, not pipeline coverage). Tracked as an open question.
- Expanding implementer/fixer beyond css-architecture to the full domain set — a follow-up wave once the proof domain validates the pattern.
- synthesizer as a posture — likely the orchestrator's job, not a per-task agent.
- The ev-loop allowed-tools plus async Workflow-firing integration — the loop becoming the firing layer is downstream of having postures to fire; separate effort.

## Phases

### Phase 1 — Restructure the guild agents directory

**Goal**: `plugins/guild/agents/` holds only flat, spawnable agent files; all codegen source (axes.toml, the modes fragments, and the personality fragments) lives outside `agents/`.

This is the setup gate. Move `agents/personalities/` into `modes/` (joining `modes/domains/` + `modes/phases/` — personalities are axis fragments, not spawnable agents). Flatten `agents/generated/*` and `agents/retained/evaluator-contract-fit.md` to the flat top-level `agents/`. Repoint the codegen outDir and the fragment-resolution read-paths, and update all references (tests, derive-panel, sync-shared, any hardcoded generated/retained/personalities paths). The effect is that `guild:generated:evaluator-a11y` becomes `guild:evaluator-a11y` and the personality fragments stop registering as spawnable agents.

**Exit**: the guild-compile freshness test plus axes-schema and fragment-schema tests pass; `npm test` green; `node scripts/sync-shared.ts --check` clean; live-spawn smoke confirms the flat `guild:<agent>` types resolve.
**Loop**: `/ev-loop-confidence` (mechanical transform — file moves plus path repoint).

### Phase 2 — Instantiate implementer and author fixer

**Goal**: the css-architecture proof domain has a generated implementer agent and a generated fixer agent, and the fixer phase fragment exists.

This is the feature work. Implementer (instantiate, no new fragment): add implementer to pragmatist.phases and to css-architecture's declared phases, add an implementer recipe, and regenerate — the fragment already exists. Fixer (author plus instantiate): write `modes/phases/fixer.md` — write-capable, correction-focused (takes verifier findings plus the artifact, applies the minimal fix, re-verifies, no self-approval), analogous to implementer but scoped to addressing flagged findings; add `axis.phase.fixer`; instantiate for css-architecture; regenerate. Proof domain only; expansion deferred.

**Exit**: both agents generate; codegen freshness passes; live-spawn smoke succeeds for implementer-css-architecture and fixer-css-architecture.
**Loop**: `/ev-loop-interactive` (the fixer fragment is craft authoring; instantiation is config).

### Phase 3 — Wire postures into the workflow path

**Goal**: a single implement-verify-fix cycle runs end-to-end on css-architecture, with simplified name-mapping, no dangling generator references, and a defined write-capable output schema.

This is the cleanup. Post-flatten, workflow agentType is flat `guild:<agent>`, so the logical-to-workflow mapping collapses to near-trivial — confirm and simplify. Repair the specialist-evaluator gate-then-review sections in ev-loop-confidence, ev-loop-interactive, and PANEL-COMPOSITION.md to reference the implementer/fixer postures instead of the dropped generator-css-codemod (see `demo/FINDING-guild-generator-dangling-refs.md`). Define the structured output contract for the write-capable postures (implementer/fixer return what-changed plus a self-check; verifiers return structured findings).

**Exit**: a single implement-verify-fix cycle runs end-to-end on css-architecture; grep confirms no dangling generator-css-codemod references; the output schema validates against a real run.
**Loop**: `/ev-loop-interactive`.

## Dependencies

Strict 1 then 2 then 3. P2 instantiates into P1's flattened namespace; P3 wires P2's postures.

## Risks

- P1 namespace break. Anything hardcoding guild:generated, guild:retained, or guild:personalities breaks. Mitigation: grep plus update; derive-panel already emits bare names; the workflow registry auto-derives from the tree. The codegen outDir plus personality read-path change is the sharp edge — the freshness test gates it.
- P2 first pragmatist cell. pragmatist.phases is empty today; instantiating implementer is the first pragmatist cell and may surface fusion issues. fixer is a novel action-shaped fragment and may need iteration.
- P3 design surface. The output schema plus gate-then-review repair are judgment-heavy, not mechanical.

## Open questions

- The whiteboard-to-research rename and whether to instantiate the dormant researcher phase (deferred — different intent).
- implementer/fixer expansion to the full domain set (follow-up wave).
- Exact landing spot for the personality fragments (modes/personalities vs other) — confirm in P1.
- fixer default personality (pragmatist vs methodical).

## Decisions

- Restructure first — flattening `agents/` fixes the namespace the new postures land in; setup then feature then cleanup matches the three-phase pattern.
- Proof domain css-architecture first — validate the write-capable posture on one domain before mass-generating; lowest-complexity-first wave sequencing.
- Pipeline-only in P2 — the whiteboard-to-research rename is a different intent and splits off.
- implementer is instantiation, not authoring — axis.phase.implementer already exists; only fixer is authored from scratch. This corrects the research dossier.
