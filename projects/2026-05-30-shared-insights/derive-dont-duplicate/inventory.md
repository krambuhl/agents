# Scope inventory — Phase 2 Derive-don't-duplicate

**Generated**: 2026-05-31
**Total items**: 3 files touched (+1 new shared module)
**Pattern**: hand-maintained duplicates of a truth that already lives in a single source — replace the duplicate with a derivation/import so it cannot drift.

## Items
- [ ] plugins/guild/modes/axes-schema.test.ts  (tier: 1, unit 1) — `CANONICAL_PHASES` hardcoded array → derive from parsed `[axis.phase.*]` keys + add a non-empty guard.
- [ ] plugins/guild/cli/verbs/guild/recipe.ts  (tier: 1, unit 2) — local `PHASE_PREFIX` → import from shared module.
- [ ] plugins/guild/cli/verbs/guild/compile/derive.ts  (tier: 1, unit 2) — local `PHASE_PREFIX` (identical copy) → import from shared module.
- [ ] plugins/guild/cli/verbs/guild/phase-prefix.ts  (tier: 1, unit 2, NEW) — the single source of truth for the phase→prefix map.

## Out of scope (noted, not absorbed)
- `CANONICAL_DOMAINS` / `CANONICAL_PERSONALITIES` in axes-schema.test.ts are the same hand-list shape but are NOT cross-axis foreign keys (nothing references them the way domains/personalities reference phases), so their hardcoded lists serve as leaf-completeness assertions ("axes.toml must declare these"). Deriving them would remove that guard with no drift-class benefit. The PLAN scopes this unit to phases (the proven-drift FK axis); leaving the leaf lists hardcoded is intentional, not an oversight.

## Tiers
- **Tier 1** (mechanical, clear before/after): both units. No Tier 2+.
