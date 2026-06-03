# INTERVIEW — State file-format de-drift

The decision tree walked to compose this plan. Research foundation: `projects/2026-06-02-state-file-format-audit/RESEARCH.md`.

## Q1 — How far should this plan reach?

**Recommendation:** Prose de-drift (Tier A) + a regression guard (Tier B), with the dead-code tail (Tier C) deferred to a separate follow-up.

**Context that drove the question:** the dossier's Finding 4 scoped the cleanup to prose. The planning sweep found more — commons still ships an orphaned JSON-substrate lib (`cli/lib/adopt.ts` + `manifest.ts`/`config.ts`/`events.ts`) that writes the retired five-file model, is imported by no live verb, yet is mirrored into `griot`/`guild`; and two tests encode the old model. That is a different conceptual change (code cleanup, medium risk) than fixing stale prose.

**Answer:** Prose + guard; dead-code as a separate follow-up.

**Rationale:** Tier A (doc accuracy) and Tier C (code cleanup) are different kinds of change and, per the one-thing-per-PR rule, should not share a diff. Splitting ships the safe, high-clarity prose fix now and isolates the riskier archaeology (which needs a per-lib dead-code proof and ADR-0005 orphan handling) into its own effort.

## Q2 — PR cadence for the prose fix + guard?

**Recommendation:** Two-PR stack (fix → guard), matching three-phase orthodoxy so a red guard never has to land.

**Answer:** Single PR (fix + guard together).

**Rationale:** The whole change is small and non-behavioral; correcting the vocabulary and locking it in with a guard that passes on arrival is one coherent, trivially-reviewable diff. The stack ceremony would add overhead without materially aiding review at this size.

## Defaulted decisions (no separate question; stated and accepted)

- **Guard design:** scan only the should-be-current prose surfaces (5 skill bodies + `AGENT-CONVENTIONS.md` + `projects/CONVENTIONS.md`); forbid the retired trio there; allowlist the sanctioned `LOOM-CONVENTIONS.md` history. Do not scan `cli/lib`, fixtures, or the stale tests (those are Tier C). Rationale: keeps false-positives near zero and the guard meaningful.
- **Contextual replacement:** each of the ~11 occurrences is read in its sentence and rewritten to the consolidated `manifest.toml` reality, not blanket-substituted. Rationale: several occurrences are file-list collapses (`manifest.json, config.json, events.jsonl` → `manifest.toml`), not 1:1 renames.
- **Branch:** RESEARCH + PLAN birth-bundle stays on `ev-agent.state-file-format-audit.research`; execution stacks via `gt`. Rationale: research and plan are one RPI birth.
- **No plan panel:** the decision tree is fully resolved and the change is bounded; a multi-perspective design panel would be theater. The evaluator pass is the gate.
