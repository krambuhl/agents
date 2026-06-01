# 0004. Split sync-shared into per-tier verbs

- **Date**: 2026-05-28
- **Status**: accepted

## Context

During Phase 3 P3D3 of `2026-05-28-loom-adr` (cross-skill docs for the ADR-emit hook), `node scripts/sync-shared.ts` was invoked to propagate a new `## § ADR-emit hook` recipe from `plugins/commons/docs/SUBSTRATE-COMPOSITIONS.md` (the canonical source) to the four consumer copies in `plugins/{ev,griot,guild,loom}/docs/`.

The sync script is all-or-nothing across both content tiers (commons → consumers): it syncs `docs/` AND `cli/lib/` in one invocation. Pre-existing drift in `commons/cli/lib` vs the consumer `cli/lib` copies (commons had a substrate-wide refactor of `manifest-toml.ts` → `manifest.ts`, removal of `plan.ts`/`toml.ts`/`commit-discipline.ts`, addition of `checkin.ts`/`events.ts`/`session.ts`) cascaded into 17 test failures across ~20 consumer verb files when the sync corrected the consumer lib copies to match commons — the consumer verb files still import the old paths.

The 17-failure cascade was triggered by a docs-only edit. The blast radius forced D3 to scope down to docs-only and revert the cli/lib churn; the pre-existing drift is being addressed in a separate substrate-followups task. But the design constraint surfaced is broader than this incident.

Unit goal that surfaced this: Add cross-skill discoverability for the ADR-emit hook by extending loom-adr SKILL.md and adding a recipe to SUBSTRATE-COMPOSITIONS.md.

## Decision

Split `sync-shared.ts` into per-tier verbs: `sync-shared docs` and `sync-shared lib` (with `sync-shared all` as the convenience composition for the existing behavior). Per-tier verbs let an operator propagate a docs change without dragging cli/lib drift correction into the same PR. The all-tier composition stays available for substrate-wide refactors where both tiers should move together.

Alternative considered: keep one verb but gate execution on consumer-tier consistency — refuse to sync any tier if consumers are drifted on any other tier. This was rejected because it inverts the failure mode: today the script silently succeeds and may break consumer tests; the gated form would refuse to do useful work because of unrelated drift. The split-verbs shape isolates the operator's intent (docs change OR lib refactor) without conflating either with the other.

`--check` mode applies per-tier in the same way: `sync-shared docs --check` and `sync-shared lib --check` independently report drift, and CI gates on whichever subset matters for the PR being reviewed.

## Consequences

- **The decided shape (per-tier verbs `sync-shared docs`/`lib`/`all`) was not implemented as stated.** `2026-05-30-shared-insights` Phase 5 instead added scoping *flags* — `--only=<glob>` and `--exclude-lib` — to the single `sync-shared` entrypoint, reaching the same operator-intent isolation (propagate a docs change without dragging lib drift into the same run) with less surface, and additionally making a scoped run *copy-only* (it never deletes orphans), which a per-tier-verb split did not address.
- This makes the per-tier-verb decision **superseded in practice** by the flag approach. Per the append-only ADR convention, if the flag shape is adopted as canonical a future ADR should formally supersede this one — the ADR and the shipped mechanism currently disagree, which is itself the authoring-vs-runtime drift the remediation targets.
- `--check` stays a full-tree gate under the flag shape (scoping applies to the write path only), preserving the "CI gates on the whole tree" property this decision wanted from per-tier `--check`.
- Watch: reconcile the record with reality — either supersede this ADR toward the flag shape, or build the per-tier verbs as decided.
