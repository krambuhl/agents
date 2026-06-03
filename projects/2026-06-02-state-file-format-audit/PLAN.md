# PLAN — Consolidate project state into manifest.toml

## Context

Research foundation: `projects/2026-06-02-state-file-format-audit/RESEARCH.md`.

The dossier established (descriptively) that the consolidation from a five-file JSON/JSONL model to a single sectioned `manifest.toml` is complete for meta/config/phases/events/checkins/sessions/revisions, and that the residual issues are prose drift. This plan is the prescriptive follow-on: extend the consolidation to the **remaining project state files that still litter PR diffs** — retros, PR responses, and guild findings — pushing structured single-writer records into the manifest and demoting transient files to gitignored scratch. Prose stays in markdown.

The deciding principle (this session's pairing): a project artifact earns its own file only if it is (a) prose a human reads or edits, (b) written concurrently and cannot be serialized, or (c) workspace-scoped rather than project-scoped. Everything else — single-writer structured records — belongs mechanically in the manifest.

This supersedes the prior de-drift plan, which becomes the documentation slice of Phase 4.

## Scope

### In

Three new append-only manifest sections, plus the writer/harvest/cleanup work to fill them:

- **`[[retros]]`** — `loom retro` currently writes `retros/<name>.json` file-per-record (an explicit `retro.ts:156` decision this plan reverses) and only routes a `retro-written` event into the manifest. Flip it to append the retro body into `[[retros]]`, mirroring `[[checkins]]`.
- **`[[responses]]`** — `loom pr respond` currently writes `responses/<branch>/response-NN.json`. Flip it to append into `[[responses]]`, carrying the `branch` partition key as a field.
- **`[[findings]]`** — guild evaluators write `.guild-findings.jsonl` concurrently (`O_APPEND`, multi-writer). They CANNOT write the single-writer manifest directly (optimistic-lock thrash). Instead: keep the jsonl as a transient write-buffer during the parallel panel, then **harvest** it into `[[findings]]` at the serial unit/phase close. The harvest seam lives in the loom/ev-loop layer; guild's writer stays plugin-agnostic.

Demote to gitignored scratch (never committed):

- `.guild-findings.jsonl` — harvested then ignored.
- `RECOVERY-STATUS.json` — a mid-failure resume file that cannot live inside the manifest it recovers; deleted on successful resume.

Stays markdown (committed), no change: `PLAN.md`, `INTERVIEW.md`, `RESEARCH.md`, `RESEARCH-NOTES.md`, `UNRESOLVED.md`, `plans/*.md`, ad-hoc working docs, and `adr-log/*.md` (workspace-scoped).

### Out / deferred

- **Migrating existing projects' loose files.** Forward-only: writers change; existing active projects keep their current `retros/`, `responses/`, and `.guild-findings.jsonl`, and the file-per-record READERS are retained to read that old data. Archived projects stay frozen. A one-time fold-in codemod is a possible future effort, not this plan.
- **The orphaned commons JSON substrate** (`commons/cli/lib/adopt.ts` + dead `manifest.ts`/`config.ts`/`events.ts`, the two stale tests, sync-mirror pruning) — still a separate conceptual change (dead-code removal), still deferred to its own plan, gated on a per-lib dead-code proof + ADR-0005 orphan handling.

## Phase 1 — Manifest schema + write lib for the new sections

**Depends on**: none

**Goal**: Add `[[retros]]`, `[[responses]]`, `[[findings]]` to the manifest type, serializer, and append helpers — additively. Nothing flips yet; the old file-writers still work, so this PR is backward-compatible and the most carefully reviewed.

1. `cli/lib/types.ts`: add the three section element types and the arrays on `ManifestToml`. Mind the two distinct "finding" concepts: the `[[retros]]` element is a whole `Retro {type, phase?, tier?, created, findings: RetroFinding[]}` (it *contains* the existing `RetroFinding`); the `[[findings]]` element is a harvested guild finding — name it `GuildFinding {evaluator, code, evidence, severity, branch?, unit?, signature, harvested_at}` (NOT `ManifestFinding`, to keep provenance clear against `RetroFinding`); `[[responses]]` element is `Response {comment_id, body, branch, created}`.
2. `cli/lib/manifest-toml.ts`: extend parse + stringify for the three array-of-tables sections; missing sections default to `[]` so existing manifests keep parsing. Add `appendRetro`/`appendResponse`/`appendFinding` mirroring `appendCheckin`/`appendSession`.
3. Round-trip tests: `parse(stringify(m))` deep-equals `m` with the new sections populated; a real pre-existing manifest (no new sections) still parses to empty arrays.

**Exit**: new sections round-trip; the `manifest-real.toml` fixture (which lacks them) still parses with empty arrays; `npm test` green; no writer or verb behavior changed yet.

## Phase 2 — Flip the writers and add the harvest seam

**Depends on**: Phase 1

**Goal**: Point `loom retro` and `loom pr respond` at the manifest sections, add findings harvest at close, and gitignore the two scratch files. New projects stop emitting loose state files.

1. `verbs/loom/retro.ts` + `lib/retro.ts`: append the retro into `[[retros]]` via `appendRetro` instead of `writeRetro`-to-file; keep the `retro-written` event. Retain the file READER for forward-only old-data reads.
2. `verbs/loom/pr.ts`: append responses into `[[responses]]` instead of `responses/<branch>/*.json`; retain the file reader.
3. New `loom findings harvest --slug --branch --unit` verb: read `projects/<slug>/.guild-findings.jsonl`, fold rows into `[[findings]]` (dedupe on guild's `signature`), single-writer at close. Wire the call into the `ev-loop-interactive` and `ev-loop-confidence` unit/phase close choreography — NOT mid-panel. Guild's `findings append` writer is unchanged.
4. `.gitignore`: add `projects/**/.guild-findings.jsonl` and `projects/**/RECOVERY-STATUS.json`.

**Exit**: a fresh retro and a fresh PR response land in `manifest.toml`, not in `retros/`/`responses/`; harvest folds findings into `[[findings]]` at close and only at close; the two scratch files are gitignored; `npm test` green; a scaffold-and-close smoke creates no new `retros/`/`responses/` files.

## Phase 3 — Remove the dead file-write paths

**Depends on**: Phase 2

**Goal**: Behavioral cleanup only — delete the now-unused file-per-record WRITE paths once Phase 2 has proven the manifest path. No docs, no tests-of-vocabulary; this PR is the "old code removal" unit and is kept separate from the documentation work so its risk profile is isolated.

1. Delete the dead file-WRITE paths (`lib/retro.ts` `writeRetro` file branch, `pr.ts` response-file write). Retain the file READERS for forward-only old-data reads — only the writers are removed.

**Exit**: no file-per-record WRITE path remains in `retro`/`pr` verbs; the readers still resolve old projects' loose files; a scaffold-and-close smoke creates no loose state files; `npm test` green.

## Phase 4 — Docs de-drift, conventions, and the regression guard

**Depends on**: Phase 3

**Goal**: Documentation and test work — bring docs and skills into line with the consolidated reality (absorbing the prior de-drift plan), document the new sections and scratch convention, and lock the vocabulary with a guard. Separated from Phase 3 because it is documentation + a test, not a behavioral change.

1. Documentation de-drift (the prior plan, extended): fix the stale `manifest.json`/`config.json`/`events.jsonl` references in `commons/docs/AGENT-CONVENTIONS.md`, `projects/CONVENTIONS.md`, and the five skill bodies (`ev-loop-interactive`, `ev-loop-confidence`, `ev-run`, `loom-plan`, `loom-research`); additionally update those skills' file-list/report templates to reflect retros/responses/findings-in-manifest and the scratch files.
2. `commons/docs/LOOM-CONVENTIONS.md`: document the `[[retros]]`/`[[responses]]`/`[[findings]]` sections, the harvest seam, and the gitignored-scratch convention.
3. Add the regression guard test under `commons/cli/` (forbid the retired trio in the should-be-current prose surfaces, with a history allowlist). Run `node scripts/sync-shared.ts`; confirm `npm run check` green.

**Exit**: targeted grep over the prose set returns zero retired-trio references; the guard passes and is proven to bite a planted reference; `LOOM-CONVENTIONS.md` documents the new sections; `npm test` and `npm run check` green.

## Dependencies

Linear: Phase 1 (schema, additive) → Phase 2 (flip writers + harvest) → Phase 3 (remove dead write-paths) → Phase 4 (docs + conventions + guard). Phase 1 must land before any writer flips so the manifest can hold the data; Phase 3's removal waits on Phase 2 proving the manifest path; Phase 4 documents the end state after removal. The deferred existing-project migration and the commons dead-code follow-up depend on Phase 4 but are out of this plan.

## Verification

- **Phase 1**: round-trip tests pass; a real legacy manifest fixture parses with empty new sections (no crash on absent sections).
- **Phase 2**: integration smoke — scaffold a project, write a retro + a PR response + harvest findings, assert the data is in `manifest.toml` and no `retros/`/`responses/` files were created; assert harvest runs only at close; `git status` shows the scratch files untracked.
- **Phase 3**: a scaffold-and-close smoke creates no loose `retros/`/`responses/` files; old projects' readers still resolve their loose files; `npm test` green.
- **Phase 4**: `grep -rn 'manifest\.json\|config\.json\|events\.jsonl'` over the prose set returns zero; guard test passes on the clean tree and fails on a planted reference; `npm run check` (sync drift) green; `npm test` green.
- Cross-cutting: existing project read-paths still work (forward-only readers retained); manifest diffs for an appended section are clean `+N lines`, not whole-file churn.

## Risks

- **Schema back-compat** (medium): existing manifests lack the new sections. Mitigation — parser treats absent sections as `[]`; Phase 1 exit explicitly tests a legacy fixture.
- **Cross-plugin coupling** (medium): findings harvest reads guild's file into loom's manifest. Mitigation — harvest lives in the loom/ev layer; guild's writer is untouched, so guild stays usable standalone.
- **Concurrency regression** (high if mishandled): harvesting mid-panel would reintroduce the single-writer thrash the jsonl exists to avoid. Mitigation — harvest ONLY at serial unit/phase close; Phase 2 exit asserts this.
- **Manifest growth** (low): the manifest absorbs more data. Accepted tradeoff (fewer files for a larger file); the append-stable serializer keeps git diffs clean. Named, not mitigated away.
- **Forward-only mixed model** (low): old projects keep loose files. Mitigation — readers retained; documented in `LOOM-CONVENTIONS.md`.
- Revert: each phase is a single-PR revert; Phase 1 is inert without Phase 2, so a Phase 2/3 revert leaves the schema harmlessly present.

## Open questions

- Harvest packaging: a `loom findings harvest` CLI verb called by the ev-loop close step (deterministic IO + orchestration split, the established pattern) vs inlining the fold in the skill. Lean: the CLI verb.
- Findings dedupe key on harvest — reuse guild's computed `signature` (assumed stable); confirm in Phase 2.
- Whether `[[responses]]` should retain per-branch ordering semantics or is a flat branch-tagged list (lean: flat list with a `branch` field, ordering by `created`).

## Decisions

- Roll `retros`, `responses`, and `findings` into the manifest; prose stays markdown; ADRs stay (workspace-scoped). (This session.)
- Findings via **harvest-at-close** with a transient gitignored jsonl — not naive roll-in (breaks concurrent append) and not a committed jsonl. (Findings fork.)
- **Forward-only** migration: writers change, existing loose files + their readers are retained, archived projects frozen. (Migration-scope fork.)
- `RECOVERY-STATUS.json` demoted to gitignored scratch (cannot live in the manifest it recovers).
- The harvest seam lives in the loom/ev layer, keeping guild plugin-agnostic.
- The prior docs/skills de-drift folds into Phase 3; the commons orphaned-JSON-substrate cleanup remains a separate deferred follow-up.

## Revision log

- 2026-06-02 — Fix dependsOn to the parser's required 'Phase N' form (bare integers parse to []); fix stale Phase 3->4 ref in Context
