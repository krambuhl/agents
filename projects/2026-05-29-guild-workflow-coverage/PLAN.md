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
**Status**: completed (PR #145). Personalities landed in `modes/personalities/`; the flat agents (`implementer-css-architecture.md`, `fixer-css-architecture.md`, `evaluator-css-architecture.md`, …) sit at the top level.
**Loop**: `/ev-loop-confidence` (mechanical transform — file moves plus path repoint).

### Phase 2 — Instantiate implementer and author fixer

**Goal**: the css-architecture proof domain has a generated implementer agent and a generated fixer agent, and the fixer phase fragment exists.

This is the feature work. Implementer (instantiate, no new fragment): add implementer to pragmatist.phases and to css-architecture's declared phases, add an implementer recipe, and regenerate — the fragment already exists. Fixer (author plus instantiate): write `modes/phases/fixer.md` — write-capable, correction-focused (takes verifier findings plus the artifact, applies the minimal fix, re-verifies, no self-approval), analogous to implementer but scoped to addressing flagged findings; add `axis.phase.fixer`; instantiate for css-architecture; regenerate. Proof domain only; expansion deferred.

**Exit**: both agents generate; codegen freshness passes; live-spawn smoke succeeds for implementer-css-architecture and fixer-css-architecture.
**Status**: in-progress. All three deliverables (D1 implementer-css-architecture, D2 fixer phase fragment, D3 fixer-css-architecture) are authored, approved, and merged (PR #148). The phase is held open on the single unproven exit criterion: the live-spawn smoke. It is reasoned-not-proven because the authoring session's agent registry was a pre-Phase-1 cache snapshot (the flat `guild:<agent>` types are not yet spawnable until the guild plugin cache re-syncs and Claude Code restarts).
**Close ritual**: the smoke needs a session whose agent registry carries the flat post-P1 namespace. Run `loom doctor` first — it now carries a guild cache-skew probe (`bca5148`, born from this phase's own pain) that flags a cached guild lagging source. Once the registry resolves the flat types, run the live-spawn smoke for `guild:implementer-css-architecture` and `guild:fixer-css-architecture`, then mark Phase 2 completed. As of this revision (2026-05-31) the registry already resolves both flat types — the cache has re-synced since the authoring session — so the smoke is runnable now without waiting for a further refresh.
**Loop**: `/ev-loop-interactive` (the fixer fragment is craft authoring; instantiation is config).

### Phase 3 — Wire postures into the workflow path

**Goal**: a single implement-verify-fix cycle runs end-to-end on css-architecture, with simplified name-mapping, no dangling generator references, and a defined write-capable output schema.

This is the cleanup. It mixes a low-risk mechanical change with a judgment-heavy design change, so it sequences as two deliverables (safe part first, per the mixed-risk splitting rule) within the one phase/PR:

**D1 — mechanical (land first, low risk).** Two pieces. (1) Simplify the name-mapping: post-flatten the workflow agentType is flat `guild:<agent>`, so the logical-to-workflow mapping collapses to near-trivial — confirm and simplify (the P2 checkins flagged derive-panel emitting a dangling/mis-fit `evaluator-react-api` for substrate `.ts` files and bare names needing manual mapping to spawnable types; that is the target). (2) Repair the dangling `generator-css-codemod` references in the specialist-evaluator gate-then-review sections so they name the implementer/fixer postures instead of the dropped `generator-css-codemod` (see `demo/FINDING-guild-generator-dangling-refs.md`). The refs are still live as of this revision — grep finds them in `PANEL-COMPOSITION.md`, `ev-loop-confidence`/`ev-loop-interactive` SKILLs, and `AGENT-CODEGEN.md`. PANEL-COMPOSITION.md is now synced-from-commons (`bf341b2` promoted it to the canonical source under an enforced drift gate, ADR-0007), so the repair edits `plugins/commons/docs/PANEL-COMPOSITION.md` and propagates via `node scripts/sync-shared.ts` — do NOT hand-edit the five consumer copies.

**D2 — design (judgment-heavy, reviewed in isolation).** Define the structured output contract for the write-capable postures: implementer/fixer return what-changed plus a self-check; verifiers return structured findings. The verifier-findings shape must be consistent with the just-landed `finding-emitted` event type (`f3178ab` + the guild-validate emission chain) — that event is panel telemetry (spawn-to-finding / recusal ratios), distinct from this inter-agent data contract, but the finding shape should align with it rather than introduce a parallel one.

**Exit**: a single implement-verify-fix cycle runs end-to-end on css-architecture; grep confirms no dangling generator-css-codemod references; `sync-shared --check` clean after the PANEL-COMPOSITION repair; the output schema validates against a real run.
**Loop**: `/ev-loop-interactive`.

## Dependencies

Strict 1 then 2 then 3. P2 instantiates into P1's flattened namespace; P3 wires P2's postures.

## Risks

- P1 namespace break. Anything hardcoding guild:generated, guild:retained, or guild:personalities breaks. Mitigation: grep plus update; derive-panel already emits bare names; the workflow registry auto-derives from the tree. The codegen outDir plus personality read-path change is the sharp edge — the freshness test gates it.
- P2 first pragmatist cell. pragmatist.phases is empty today; instantiating implementer is the first pragmatist cell and may surface fusion issues. fixer is a novel action-shaped fragment and may need iteration.
- P3 design surface. The output schema plus gate-then-review repair are judgment-heavy, not mechanical. The D1/D2 split isolates the mechanical doc+mapping work from the schema design so the design lands under focused review.

## Open questions

- The whiteboard-to-research rename and whether to instantiate the dormant researcher phase (deferred — different intent).
- implementer/fixer expansion to the full domain set (follow-up wave).
- ~~Exact landing spot for the personality fragments~~ — RESOLVED in P1: `modes/personalities/`.
- ~~fixer default personality~~ — RESOLVED in P2: pragmatist (axis.phase.fixer.default_personality).

## Decisions

- Restructure first — flattening `agents/` fixes the namespace the new postures land in; setup then feature then cleanup matches the three-phase pattern.
- Proof domain css-architecture first — validate the write-capable posture on one domain before mass-generating; lowest-complexity-first wave sequencing.
- Pipeline-only in P2 — the whiteboard-to-research rename is a different intent and splits off.
- implementer is instantiation, not authoring — axis.phase.implementer already exists; only fixer is authored from scratch. This corrects the research dossier.
- P3 sequences as D1 (mechanical: name-mapping + dangling-ref repair) then D2 (design: write-capable output schema) within one phase — mixed-risk, so the safe part lands first and the judgment-heavy schema is reviewed in isolation. One phase, one PR; the loop orders the deliverables.
- P2 stays in-progress until the live-spawn smoke actually runs — the empirical-proof posture is not waived. Authoring being merged (and, as of this revision, the flat namespace now resolving in the registry) is necessary but not sufficient for close; the smoke must run.

## Revision log


- 2026-05-31 — Reconcile with substrate landed May 30-31: P1 completed, P2 in-progress with a close ritual (cache re-synced, smoke now runnable), P3 sequenced into mechanical+design deliverables, absorbing the PANEL-COMPOSITION-synced-from-commons and finding-emitted-event shifts.

- **2026-05-31 (mechanical)** — Reconciled the plan with substrate that landed around it (PRs #145/#148 + the substrate-tempering and gate-coverage work of May 30–31). P1 marked completed; P2 marked in-progress with an explicit close ritual recording the cache-refresh dependency and the new `loom doctor` guild cache-skew probe (`bca5148`) as its pre-flight. P3 rewritten to sequence its deliverables (D1 mechanical name-mapping + dangling-ref repair, D2 design output-schema) per the mixed-risk splitting rule, and to absorb two context shifts: the dangling-ref repair now edits `plugins/commons/docs/PANEL-COMPOSITION.md` + sync-shared (canonicalized in `bf341b2` under the enforced drift gate, ADR-0007), and the verifier-findings schema must align with the landed `finding-emitted` event (`f3178ab`) rather than define a parallel shape. Two open questions resolved (personality landing spot, fixer default personality). Scope unchanged — no phase added or removed.
