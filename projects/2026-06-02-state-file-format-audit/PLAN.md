# PLAN — State file-format de-drift

## Context

Research foundation: `projects/2026-06-02-state-file-format-audit/RESEARCH.md`.

The dossier established that the system's state-persistence design is coherent and the JSON/JSONL → single-`manifest.toml` consolidation is complete in the runtime (19/19 project manifests are TOML; zero live legacy state files). The remaining problem is prose lag: convention docs and skill bodies still name the retired `manifest.json` / `config.json` / `events.jsonl` model (RESEARCH.md Finding 4).

The planning sweep extended the dossier in one material way: the drift is not only prose. Commons still ships an orphaned JSON-substrate lib cluster (`cli/lib/adopt.ts` and its `manifest.ts`/`config.ts`/`events.ts` dependencies) that writes the old five-file model, is imported by no live verb, yet is mirrored into `griot` and `guild` by `scripts/sync-shared.ts`. Two tests (`parallel-work-invariant.test.ts`, `lib/adopt.test.ts`) still encode that model. This dead-code tail is a **different conceptual change** (code cleanup, medium risk) and is explicitly **deferred** to a follow-up plan — see Deferred follow-up.

This plan covers prose accuracy plus a regression guard, shipped as a single PR.

## Scope

### In

- Correct the retired-format vocabulary to the consolidated `manifest.toml` reality in the should-be-current prose surfaces:
  - `plugins/commons/docs/AGENT-CONVENTIONS.md` — line 24 (the `LOOM-CONVENTIONS.md` shape parenthetical) and line 195 (the RECOVERY-STATUS.json "alongside `manifest.json`" line). Commons-canonical: requires a `scripts/sync-shared.ts` run so the synced doc copies follow.
  - `projects/CONVENTIONS.md` — lines 70, 71, 73, 91 (names `manifest.json` as the live single-writer exception and as the `loom phase update` target). Runtime doc, edit in place (not commons-synced).
  - Five skill bodies: `plugins/ev/skills/ev-loop-interactive/SKILL.md`, `plugins/ev/skills/ev-loop-confidence/SKILL.md`, `plugins/ev/skills/ev-run/SKILL.md`, `plugins/loom/skills/loom-plan/SKILL.md`, `plugins/loom/skills/loom-research/SKILL.md` — each names the dead trio in report templates / file lists.
- Add a regression guard test under `plugins/commons/cli/` (matching the existing invariant-test pattern, e.g. `skill-bodies-call-bare-commands.test.ts`) that scans the should-be-current prose surfaces and fails on any retired-trio reference, with an allowlist constant for sanctioned exceptions.
- Replacements are **contextual, not blind find-replace**: e.g. `loom-research`'s step-7 file list (`manifest.json, config.json, events.jsonl, checkins/, sessions/`) collapses to `manifest.toml`; `loom-plan`'s step-9 list likewise; the `AGENT-CONVENTIONS.md:195` RECOVERY line just swaps the extension. Each of the ~11 occurrences is read in its sentence before editing.

### Out (this plan)

- The Tier-C dead-code reconciliation (see Deferred follow-up).
- `plugins/commons/docs/LOOM-CONVENTIONS.md` lines 43-44 and 127-128 — these are legitimate historical "project state used to live in five files" context, not stale current-state claims. Left untouched and added to the guard's allowlist.
- All `cli/fixtures/*` JSON/JSONL files — test scaffolding, not live state; not prose.

### Deferred follow-up (Tier C — its own plan)

Remove the orphaned commons JSON substrate (`cli/lib/adopt.ts` plus the `manifest.ts`/`config.ts`/`events.ts` it transitively pulls, where confirmed dead), reconcile or delete `lib/adopt.test.ts` and `parallel-work-invariant.test.ts`, and prune the sync mirror so the dead libs stop propagating to `griot`/`guild`. Gated on a per-lib dead-code proof (no live importer across source + synced copies) and ADR-0005 orphan-sweep handling (`--strict-orphan`). Recorded here so the finding is not lost; not executed by this plan.

## Phase 1 — Prose de-drift and regression guard

**Depends on**: none

Single PR. One conceptual change: bring the prose into line with the consolidated TOML reality and lock it in.

1. Edit the ~11 occurrences across the two convention docs and five skill bodies (contextual replacement per Scope/In).
2. Run `node scripts/sync-shared.ts` to propagate the `AGENT-CONVENTIONS.md` edit into consumer doc copies; confirm `npm run check` (the drift check) is green.
3. Add the regression guard test: scan the defined prose set, forbid `manifest.json` / `config.json` / `events.jsonl`, allowlist the sanctioned `LOOM-CONVENTIONS.md` history lines. The test passes on the cleaned tree (green on arrival).
4. Prove the guard bites: assert it flags a planted retired-trio string (in-test fixture), so it is not a no-op.

**Exit criteria**: targeted grep over the prose set returns zero retired-trio references; `npm test` green (including the new guard); `npm run check` green; the five edited skills read coherently in context.

## Dependencies

None external. Phase 1 is self-contained. The deferred Tier-C follow-up may optionally sequence after this PR lands but does not block it.

## Verification

- This runnable grep over the in-scope prose set returns zero matches:
  `grep -rn 'manifest\.json\|config\.json\|events\.jsonl' plugins/commons/docs/AGENT-CONVENTIONS.md projects/CONVENTIONS.md plugins/ev/skills/ev-loop-interactive/SKILL.md plugins/ev/skills/ev-loop-confidence/SKILL.md plugins/ev/skills/ev-run/SKILL.md plugins/loom/skills/loom-plan/SKILL.md plugins/loom/skills/loom-research/SKILL.md`
- The new guard test (a) passes on the cleaned tree and (b) fails against a planted reference — both asserted.
- `npm run check` passes (commons-sync drift check; ADR-0007 enforces it via pre-commit hook + CI).
- `npm test` passes.
- Read-through of the five edited skill bodies confirms no replacement broke a sentence or a report template.

## Risks

- **Severity: low.** Documentation- and test-only; no runtime behavior changes. Revert is a single-PR revert.
- **Guard false-positive** if the allowlist misses a sanctioned historical mention → mitigated by scoping the scan to the defined prose set and an explicit allowlist; full `npm test` before commit.
- **Sync gate** — editing the commons-canonical `AGENT-CONVENTIONS.md` without running `sync-shared` will be blocked by the pre-commit hook / `sync-check` CI (ADR-0007). Mitigation: step 2 runs the sync and verifies `npm run check`.
- **Source vs cache** — skill edits land in the `plugins/` source tree; the installed plugin cache refreshes out-of-band (ADR-0006). Not blocking; flagged for the executor so they verify against source, not the cached copy.

## Open questions

- Tier-C sequencing: spin the dead-code follow-up immediately after this lands, or batch it later. Whoever takes it should confirm the per-lib dead-code proof first.
- Whether the guard should later widen to CLI verb-code report strings — out of scope until Tier C removes the dead code those strings would otherwise trip on.

## Decisions

- Scope = prose de-drift (A) + regression guard (B); dead-code reconciliation (C) deferred to a separate plan. (Interview Q1.)
- Single PR for the fix + guard, rather than a two-PR stack. (Interview Q2.)
- Guard scans only should-be-current prose surfaces (5 skills + `AGENT-CONVENTIONS.md` + `projects/CONVENTIONS.md`) with a history allowlist; it does not scan `cli/lib`, fixtures, or the stale tests. (Default, accepted.)
- Replacements are contextual per occurrence, not blind find-replace. (Default, accepted.)
- The RESEARCH + PLAN birth-bundle co-locates on the `ev-agent.state-file-format-audit.research` branch; execution stacks on top via `gt`. (Default, accepted.)
- A multi-perspective plan panel was not spawned: the change is a bounded doc/test fix with a fully-resolved decision tree, so a design panel would be theater. The evaluator pass remains the gate. (Default, accepted.)
