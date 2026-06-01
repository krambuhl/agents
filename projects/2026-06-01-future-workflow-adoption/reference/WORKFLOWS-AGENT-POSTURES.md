# Research: agent postures for a workflow-style setup

**Status**: research dossier (open). Companion to `WORKFLOWS-PARALLEL-ADOPTION.md`.
**Question**: what guild agent *postures* (role-types) does a dynamic-workflow setup require that guild doesn't currently ship?
**Evidence base**: the validation arc in `WORKFLOWS-PARALLEL-ADOPTION.md` + `demo/DEMO-RESULTS.md` (PR #142). Workflow mechanics, the write boundary, loop interleaving, kill recovery, and schema-output are all validated. This dossier picks up the *agent-authoring* half of the adoption.

## The shape we're staffing

A dynamic workflow fans an orchestrator out to N parallel tasks; each task is a pipeline:

```
orchestrator (kicks off N tasks, N can be 100s)
   └─ per task:  implementer → verifiers (×k) → fixer
                                                  └─ converge → orchestrator returns when done
```

This is distinct from **agent teams** (a peer mesh of agents communicating bidirectionally). Guild's `guild-spawn` is already the *workflow* shape — a coordinator fanning out to parallel workers — not the peer-mesh shape. Agent-teams is a separate pattern, out of scope here.

## Mapping the pipeline to guild's axes

Guild composes agents on three axes (`docs/AGENT-CODEGEN.md`): **personality × domain × phase**. The *posture* is the **phase** value:

| Pipeline role | Guild phase / posture | Write? | Status |
|---|---|---|---|
| research / plan (upfront) | `planner` → **whiteboard** | read-only | exists — rename candidate: `research` |
| implementer (per task) | — | **write** | **MISSING** |
| verifier (per task) | `reviewer` → **evaluator** | read-only | exists (≈ verifier) |
| fixer (per task) | — | **write** | **MISSING** |
| synthesize / converge | — | read-mostly | open — likely the orchestrator's job, not a posture |

The personality axis already staffs all of these (generative / methodical / pragmatist / skeptic / synthesizer) — e.g. `pragmatist × implementer` = "ship the simplest working thing"; `skeptic × verifier` = today's evaluator. **The gap is purely the missing *phase* values: `implementer` and `fixer`.**

## Core finding

Guild today is a **critique-and-explore** substrate — every posture it ships (evaluator, whiteboard) is **read-only**. A workflow pipeline also needs a **produce-and-correct** half: **implementer** (build the artifact from a spec) and **fixer** (apply targeted corrections from verifier findings, then re-check) — both **write-capable**.

This is the same gap the **Phase-7 U1 generator-drop** opened. `generator-css-codemod` was a write-capable implementer, dropped because "generator-shaped prose (how-to-transform, with carve-outs / output-shape / stopping-conditions) doesn't fit the (Scope / Concerns / Antipattern catalog / Good patterns / Vocabulary / Cross-domain notes) template the domain fragments follow." So:

- **Workflow adoption is the forcing function to re-introduce the write-capable half — properly, as matrix phases, not the ad-hoc generators that didn't fit.**
- **`implementer` and `fixer` need an *action-shaped* phase-fragment template** (how-to-transform / output-shape / stopping-conditions), distinct from the *critique-shaped* fragments `evaluator`/`whiteboard` use. This is the central authoring work, and it is exactly what U1 punted ("re-introducing generators is a future substrate question").
- **`implementer` ≠ `fixer`.** Implementer builds from a spec (greenfield or transform); fixer applies a *minimal* correction to a flagged artifact and re-verifies. Different prose shapes → two phases, not one.
- **The per-task pipeline is the ev-loop's "specialist-evaluator gate-then-review" pattern made first-class** — and that pattern still references the dropped `generator-css-codemod` (see `demo/FINDING-guild-generator-dangling-refs.md`). Workflow adoption both re-introduces the implementer and adds the `fixer` posture that gate-then-review never formalized.

## Open items (to come back to)

1. **Author the `implementer` and `fixer` phase-fragments** (action-shaped) and decide how the domain fragments feed them — domains today supply *critique* vocab; implementer/fixer need *transform* vocab. May need a domain-fragment extension or a parallel action-vocab section.
2. **`synthesizer`: posture or orchestrator?** Guild has `synthesizer` as a *personality*; whether the converge/return step needs its own *phase* posture, or is just the workflow script's job, is open. Lean: orchestrator's job for now.
3. **Rename `whiteboard` → `research`.** The read-only explorer is better named `research`; naming-is-architecture, and worth doing while we're touching the phase axis anyway.
4. **Write-output contract for write-capable postures.** Implementers/fixers write source files (Category-3-shaped per `projects/CONVENTIONS.md`). Per the write-boundary finding, a single implementer/fixer per task writing *its own* files preserves single-writer; confirm no parallel writers land on one file within a task.
5. **Output contract (prose vs schema).** Per the schema-output finding, verifiers can emit structured findings directly; implementers/fixers likely return a structured "what I changed" + a self-verdict. Define these schemas alongside the postures.
6. **PARKED — ev-run + `Workflow` in allowed-tools.** `ev-run` *can* hold `Workflow`; the real rule is "fire workflows for your own work, not a layer below." ev-run's own fan-out (auto-mode disambiguation) is sub-workflow-scale today, so the loops are the firing layer. The line in `WORKFLOWS-PARALLEL-ADOPTION.md` ("ev-run must not call Workflow — it is the router") is too absolute; soften to "ev-run fires workflows only for its own routing decisions, and today those are too small to be worth it; the loops are the firing layer." Come back and edit this.

## Next step

A proper `loom-research` dossier + `loom plan` for the adoption, with **implementer/fixer posture authoring as the first phase** — it is the prerequisite for any write-capable workflow pipeline, and it reverses the U1 generator-drop with a real template instead of an ad-hoc agent.
