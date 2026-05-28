# Plan: Guild matrix + pre-compile pipeline

**Slug**: `2026-05-28-guild-matrix-precompile`

**Status**: plan committed (drafted from grill-me interview; no `/loom-plan` pre-flight research dossier)

**Research foundation**: none — this plan was birthed from a grill-me session against the existing `plugins/guild/` source. Existing structure inspected: `panel.manifest.toml`, `tools-map.toml`, `cli/verbs/guild/generate.ts`, `modes/{domains,phases}/`, `agents/personalities/`, `agents/generated/`. No empirical probes were run; any assumption marked **[ASSUMED]** below is a research-phase target.

## Context

Today's `plugins/guild/` compiles agents from a 3-axis source (personality × domain × phase) via a hand-curated `panel.manifest.toml` + `tools-map.toml` fed through `guild generate`. The fold is pure text concat; the manifest lists the *needed* set rather than the cross-product, and the per-cell personality choice (e.g. `(planner, a11y) → generative`) is encoded only by manifest presence with no first-class declaration anywhere.

The dominant authoring pain is **deciding which (phase, domain, personality) cells a new axis value should occupy** — a judgment call repeated each time the matrix grows, with no declarative metadata to anchor the decision. Secondary pain: the generated output is Frankenstein prose (three labeled fragments concatenated) rather than a single coherent voice.

This plan rebuilds the matrix as declarative axis metadata in a single `axes.toml` at plugin root and rebuilds the pre-compile step as a multi-stage, LLM-fused, cache-backed pipeline driven by a `/guild-compile` skill. Big-bang migration: the existing `panel.manifest.toml`, `tools-map.toml`, and `guild generate` verb are replaced atomically.

## Goal

Ship a rebuilt `plugins/guild/` whose source-of-truth is `axes.toml` (declarations of axes, recipes, singletons, retained) and whose compilation is a multi-stage pipeline ending in **max-effort LLM voice fusion** at compile time, with a committed source-hash cache so CI's drift check verifies generated agents without any API call.

The matrix becomes a true cross-product: at each (phase, domain) cell, *every* personality that declares fit emits its own agent. The current roster's "one personality per cell" curation moves from data-model invariant to a recipe-layer selection (`guild-spawn` resolves a recipe name to a chosen voice; callers may override per-cell).

## Exit requirements

- `plugins/guild/axes.toml` exists and is the single declarative source for domains, personalities, phases, recipes, singletons, and retained agents. Each axis value carries its own constraints (which phases a domain occupies; which phases a personality fits; phase tool base + writes flag; etc.).
- `plugins/guild/panel.manifest.toml` and `plugins/guild/tools-map.toml` are deleted.
- `plugins/guild/cli/verbs/guild/generate.ts` is deleted; replaced by stage-named verbs under `cli/verbs/guild/compile/` (one file per stage) plus a thin `cli/verbs/guild/compile.ts` orchestrator.
- `plugins/guild/skills/guild-compile/SKILL.md` exists; `/guild-compile` is the only entry point operators run for a full build. The skill drives Claude itself to perform the LLM fusion in-session at max effort (Opus + extended thinking; no fallback to a cheaper model).
- `agents/generated/.cache.toml` (or per-cell `.cache/<cell-id>.toml`) is committed alongside the generated agents. Each entry records `{source_hashes: {phase, domain, personality}, output_hash, fused_at}`.
- CI gate: `node scripts/sync-shared.ts --check` is augmented (or paralleled by `guild compile --check`) to verify, for every committed agent: (a) source hashes recompute to the cached values, (b) the agent file content hashes to the cached `output_hash`. Mismatch is a fail-loud drift error. **No API key in CI.**
- Pipeline stages exist as named, independently-runnable steps: `parse` → `validate` → `derive` → `resolve` → `compose` → `emit`. Each is testable in isolation; `compose` is the only stage that requires LLM in-session.
- `validate` enforces coherence lints: domain tool-grant references a phase that doesn't exist; personality declares fit at a phase with `writes=false` while requesting Write; retained agent collides with a derived cell id; etc.
- `compose` deduplicates overlapping guidance across the three fragments before fusion (e.g. when personality + domain both say "watch for premature abstraction", the input prompt sees it once).
- `--project-dir` off-rails escape hatch is removed. Project-local one-offs (e.g. aart.camp's `sketch-ideation`) are hand-authored under `agents/retained/` like `evaluator-contract-fit`, and listed in `axes.toml` [[retained]].
- Today's `agents/generated/evaluator-*.md` and `agents/generated/whiteboard-*.md` rosters are replaced by the new cross-product emit. The new roster will be **larger** than today's curated set (multiple personality voices per cell where multiple personalities declare fit); recipes capture today's curation as named defaults.
- `panel-manifest-consistency.test.ts` and `generated-panel.test.ts` are replaced by tests rooted in the new pipeline: schema test for `axes.toml`, derive-stage cross-product test, compose-stage dedup test, cache-coherence test (every committed agent's hashes are reproducible from sources).
- `bin/guild derive-panel` (used by `/loom-plan` per `docs/SUBSTRATE-COMPOSITIONS.md`) keeps a stable CLI surface — same flags, same output shape — re-implemented over the new data model.

## Out of scope

- Migrating the `loom`, `griot`, `ev`, or `commons` plugins. Only `guild` changes.
- A staged behind-flag rollout. Big-bang is the chosen rollout shape; no parallel codepath, no `guild-v2` plugin alongside.
- Reproducing today's roster identity. The new roster is allowed (expected) to differ — both in cell count (more agents, cross-product not curated) and in body prose (LLM-fused voice, not concatenated fragments). Recipes preserve today's *selection*, not today's *text*.
- Multiple emit profiles (core vs. consumer vs. minimal). The compile produces exactly one set of generated agents per source state.
- Project-local off-rails layering. Removed entirely; consumers hand-author one-off agents.
- A separate provenance footer in emitted agents. Provenance lives in the committed cache, not in agent bodies. (Considered, deferred.)
- Mid-flight reuse of the existing `guild generate` verb. It is deleted in the same PR that lands the new pipeline.

## Milestones

### M1 — Matrix data model

#### Phase 1.0 — Rewrite fragments as labeled-section markdown

**Goal**: Convert today's prose-to-be-concat'd fragments under `plugins/guild/modes/{domains,phases}/*.md` and `plugins/guild/agents/personalities/*.md` into structured markdown with stable section headings, so LLM fusion + dedup operate on a labeled-section signal rather than free prose.

**Exit**:
- Every domain fragment exposes the same heading set (e.g. `## Identity`, `## Watch for`, `## Output shape`, `## Common failure modes`). Heading set is documented in `docs/AGENT-CODEGEN.md`.
- Every phase fragment exposes its own stable heading set (e.g. `## Posture`, `## Responsibilities`, `## Tool envelope`).
- Every personality fragment exposes its own (`## Disposition`, `## Voice cues`, `## When this voice helps`).
- A fragment-schema test asserts every file under `modes/` and `agents/personalities/` carries the required headings for its axis.
- `compose` dedup keys on heading + body so cross-fragment overlap is identifiable mechanically before LLM fusion sees the bundle.

**Depends on**: nothing (can run before or in parallel with 1.1).

**Risks**: rewriting voice while preserving meaning is the kind of work that quietly loses nuance. Mitigation: do this phase BEFORE the conversion script + LLM fusion land, so the human-authored rewrite is the authoritative source the rest of the pipeline operates on. Treat the diff vs. today's fragments as the deliverable — review per-fragment.

#### Phase 1.1 — Author `axes.toml` schema

**Goal**: Lock the TOML shape that replaces `panel.manifest.toml` + `tools-map.toml` and folds in per-axis-value declarative constraints.

**Exit**:
- `plugins/guild/axes.toml` drafted with five top-level sections: `[axis.domain.<name>]`, `[axis.personality.<name>]`, `[axis.phase.<name>]`, `[[recipes]]`, `[[singletons]]`, `[[retained]]`.
- Domain entries declare `phases = [...]` (which phases this domain occupies) and `tool_grants = [...]` (additive per phase that runs verification).
- Personality entries declare `phases = [...]` (which phases this voice fits) and `disposition` (free-text, used as input to LLM fusion).
- Phase entries declare `base_tools = [...]`, `writes: bool`, and `default_personality` (for recipe default selection).
- Recipe entries name a curated subset of `(phase, domain, personality)` cells for `guild-spawn`. Singleton entries (e.g. `whiteboard-skeptic`) declare a `(phase, personality)` pair with no domain. Retained entries name hand-authored agents codegen never touches.
- A schema-validator test (`axes-schema.test.ts`) asserts the TOML parses, every referenced phase exists, every recipe cell is derivable from the cross-product, no retained agent collides with a derived cell id.
- A one-shot conversion script translates today's `panel.manifest.toml` + `tools-map.toml` + per-fragment evidence into the new `axes.toml`. The script is throwaway (not committed long-term) but a snapshot of its output is the seed `axes.toml`.

**Depends on**: nothing.

**Risks**: the cross-product symmetric model **[ASSUMED]** doesn't break any case the curated manifest currently expresses. Probe: enumerate the current 9 reviewer + 6 planner + 1 singleton roster and verify each lands in the new model as either (a) a derivable cross-product cell, (b) a recipe-selected default, or (c) a singleton/retained. Any case that resists classification is a schema gap to address before locking the shape.

#### Phase 1.2 — Multi-stage pipeline skeleton

**Goal**: Lay down the `parse → validate → derive → resolve → compose → emit` stage modules with the non-LLM stages fully implemented; `compose` stubbed (text-concat fallback) so the pipeline produces *something* end-to-end before fusion lands.

**Exit**:
- `cli/verbs/guild/compile/parse.ts`, `validate.ts`, `derive.ts`, `resolve.ts`, `compose.ts`, `emit.ts` each export a pure function `(input) → output` with co-located `*.test.ts`.
- `cli/verbs/guild/compile.ts` orchestrator runs stages in order, threads cache lookup before `compose`, writes outputs at `emit`.
- `validate` implements the coherence lints from § Exit requirements; each lint has a fixture-driven test that asserts the failure message localizes the offending cell.
- `derive` computes the cross-product as the intersection of declared constraints; returns a deterministic ordered list of cells.
- `resolve` produces, per cell, the three source fragments + the tool fold (`phase.base_tools ∪ domain.tool_grants` at verification phases; phase base only elsewhere).
- `compose` v0: concatenate the three fragments with section headers; emit dedup-marker comments where overlap is detected (real dedup lands in M2).
- `emit` writes per-cell agent files to `agents/generated/` and updates `.cache.toml`.

**Depends on**: 1.1.

**Risks**: stage boundaries chosen on paper may not survive contact with the LLM fusion stage's input requirements (e.g. fusion may want richer per-cell metadata than `resolve` currently surfaces). Mitigation: 1.3 explicitly revisits the `resolve → compose` boundary before fusion lands.

### M2 — Voice fusion

#### Phase 2.1 — `/guild-compile` skill + LLM fusion

**Goal**: Wire the `compose` stage to in-session LLM fusion driven by the `/guild-compile` skill, at max-effort (Opus + extended thinking), with the committed source-hash cache making re-runs cheap.

**Exit**:
- `plugins/guild/skills/guild-compile/SKILL.md` exists with `allowed-tools: Read, Write, Bash` and a body that: (1) shells out to `guild compile --stage=parse,validate,derive,resolve` to get the per-cell input bundles, (2) for each cell whose source hashes don't match the cache, performs in-session fusion of the three fragments into a single coherent agent body using max-effort reasoning, (3) shells out to `guild compile --stage=emit` with the fused bodies to write outputs + update the cache.
- The fusion prompt template is checked in at `plugins/guild/skills/guild-compile/fusion-prompt.md` and is itself versioned (its hash is part of every cell's cache entry — changing the prompt invalidates all caches).
- `compose` dedup is real: overlapping guidance between personality + domain fragments is collapsed in the input bundle before fusion sees it, so the LLM operates on minimal non-redundant source material.
- `guild compile --check` (or augmented `sync-shared.ts --check`) verifies that every committed agent file hashes to its cache `output_hash` and every source fragment hashes to its cache entry. Passes without any API call; fails loud on drift.
- A smoke test asserts that a no-source-change re-run of `/guild-compile` is a no-op (all cells cache-hit; zero fusion calls).

**Depends on**: 1.2.

**Risks**: fusion non-determinism — even at low temperature, the LLM may produce different bodies for the same inputs across runs, defeating the cache's purpose. Mitigation: cache the *output*, not just the inputs; once a cell is fused, the committed body is canonical and re-fusion only happens when source hashes change. Quality variance is accepted as the cost of "max effort"; the operator reviews the diff at commit time. Token cost is one-time per source change; the cache amortizes.

A second risk: the fusion prompt may need to evolve as the operator sees output quality. Treating the prompt's hash as a cache key means a prompt edit invalidates every cell — expected and acceptable, but flag it so the operator isn't surprised by a 30-cell refusion when tuning the prompt.

#### Phase 2.2 — Delete and replace

**Goal**: Remove the old data-model + pipeline artifacts and replace today's roster with the new cross-product emit. Big-bang.

**Exit**:
- `plugins/guild/panel.manifest.toml` deleted.
- `plugins/guild/tools-map.toml` deleted.
- `plugins/guild/cli/verbs/guild/generate.ts` deleted (along with `parse-and-aggregate.ts`, `recipe.ts`, and any other generate-only modules — verified by grep).
- `plugins/guild/cli/verbs/guild/derive-panel.ts` re-implemented over `axes.toml`; CLI surface (flags + stdout shape) unchanged so `/loom-plan` keeps working.
- `plugins/guild/agents/generated/evaluator-*.md` and `whiteboard-*.md` replaced by the new cross-product emit (committed by running `/guild-compile`).
- `plugins/guild/panel-manifest-consistency.test.ts` and `generated-panel.test.ts` deleted; replacement tests (per § Exit requirements) green.
- `plugins/guild/agents/personalities/personality-base.md` retained or merged into the fusion prompt — explicit decision recorded in PLAN.md retro.
- `evaluator-contract-fit.md` migrated from `agents/` to `agents/retained/` and listed in `axes.toml` [[retained]].
- `npm test` passes.
- Recipes in `axes.toml` reproduce today's curated `guild-spawn` defaults (so the human-facing dispatch experience is unchanged on the default path even though the catalog grew).

**Depends on**: 2.1.

**Risks**: an existing consumer (loom, ev, or aart.camp) silently depends on a specific generated agent filename or front-matter shape that the new emit changes. Mitigation: pre-flight grep across `plugins/loom`, `plugins/ev`, and known consumer repos for `evaluator-*` / `whiteboard-*` references; document any contract surface and preserve it. A second risk: the larger cross-product roster bloats the agents/ tree to a point that hurts grep / load times — accept until measured; mitigate later with on-demand emit if it bites.

### M3 — Settle

#### Phase 3.1 — Retro + learnings capture

**Goal**: Capture what the rebuild taught about declarative axis matrices and LLM-compiled agents so the next substrate edit benefits.

**Exit**:
- `projects/2026-05-28-guild-matrix-precompile/retros/landed.md` written.
- At least two `griot capture`s land under `learnings/` covering: (a) what voice the LLM fusion converged on vs. the hand-authored fragments (where it improved, where it regressed), (b) the cache invalidation surprises (which prompt edits trigger N-cell refusions and how to budget for that).
- README cross-references updated if anything in `docs/AGENT-CODEGEN.md` or `docs/SUBSTRATE-COMPOSITIONS.md` was made stale by the rebuild.

**Depends on**: 2.2.

**Risks**: none load-bearing.

## Open questions (research-phase targets)

These were left unresolved by the grill-me interview and need answers before or during implementation:

1. **Exact `axes.toml` schema.** The high-level sections are decided; the field names, nested-table shape (e.g. `personality_per_phase` vs. separate per-phase blocks), and how `tool_grants` express phase-specificity all need to be drafted and pressure-tested against the conversion script's output in 1.1.
2. **LLM fusion prompt design.** The fusion prompt template at `plugins/guild/skills/guild-compile/fusion-prompt.md` is the load-bearing artifact of the whole system. Initial draft will need iteration; budget for it in 2.1. Open: does the prompt receive the three fragments as raw text, as structured slots, or as a pre-rendered concat? Does it see the cell's `(phase, domain, personality)` triple as metadata or only as embedded context? Does it have access to the operator's intent ("this is the cell where the skeptic voice reviews react code") as a separate framing?
3. **Cache file shape.** Single `agents/generated/.cache.toml` mapping cell-id → hashes, or per-cell sidecar `agents/generated/<cell-id>.cache.toml`? Single-file is simpler to read; per-cell-sidecar is friendlier to git diffs when one cell refuses. Decide in 2.1 from a few sample diffs.
4. **Today's roster's fate as a snapshot.** Before deleting `agents/generated/`, snapshot it to `projects/2026-05-28-guild-matrix-precompile/before/` so the retro (3.1) can diff old voice vs. new voice qualitatively. Not load-bearing for correctness — load-bearing for the learning capture.
5. **`bin/guild derive-panel` callers.** Confirm the CLI surface used by `/loom-plan` and document any other callers before reimplementing — the contract test for this verb is its current behavior, not a spec doc.

## Provenance

This plan was drafted from a grill-me interview conducted in a Claude Code session on 2026-05-28. Decisions locked via `AskUserQuestion` multiple-choice; the full decision trail is preserved in the session transcript. No `RESEARCH.md` dossier exists; the research-phase work above stands in for one. The `/loom-plan` skill's normal post-draft evaluator-panel pass (`bin/guild derive-panel + /guild-validate`) was **not** run — out-of-band, since `/loom-plan` itself is not installed in this session.
