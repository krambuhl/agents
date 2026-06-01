# 0005. Preserve plugin-local docs from sync orphan removal

- **Date**: 2026-05-28
- **Status**: accepted

## Context

Also during Phase 3 P3D3 of `2026-05-28-loom-adr`, the sync-shared run that exposed the cli/lib drift cascade (see ADR on splitting sync-shared into per-tier verbs) also surfaced a different policy collapse: the script treats every consumer-plugin `docs/` file without a `plugins/commons/docs/` counterpart as an orphan and removes it.

The concrete case: `plugins/guild/docs/AGENT-CODEGEN.md` is a guild-local doc with no commons counterpart. The sync deleted it on the assumption that consumer `docs/` files are exclusively mirrors of commons. The deletion was caught and reverted in D3, but the underlying policy assumption is wrong: consumer `docs/` trees can legitimately hold both (a) synced-from-commons copies AND (b) plugin-local docs that have no commons counterpart.

The substrate architecture per `CLAUDE.md` says `plugins/commons/docs/` is the canonical source for cross-cutting docs; the sync mirrors them into each consumer's `docs/` tree. The implicit assumption — that consumer `docs/` is *only* a sync target — is what the orphan-removal policy enforces. But the guild plugin (and potentially others as they grow) needs plugin-local docs for surfaces that are guild-specific (e.g. AGENT-CODEGEN.md describes guild's panel codegen pipeline, not a cross-cutting substrate concern).

Unit goal that surfaced this: Add cross-skill discoverability for the ADR-emit hook by extending loom-adr SKILL.md and adding a recipe to SUBSTRATE-COMPOSITIONS.md.

## Decision

Make plugin-local docs explicit and have `sync-shared.ts` preserve them. Two complementary mechanisms:

1. **Explicit marker convention**: a top-of-file comment marker (e.g. `<!-- plugin-local: not synced from commons -->`) on plugin-local docs declares them out-of-band. The sync script reads the marker and skips orphan-removal for marked files.
2. **Per-plugin manifest** (optional, additive): an explicit `docs/.plugin-local-manifest.json` listing plugin-local files. Belt-and-braces: redundant with the in-file marker but provides a single point to audit per-plugin doc autonomy. Optional because the in-file marker should be the primary mechanism; the manifest exists as a substrate-level invariant check.

The default behavior (when neither marker nor manifest is present) becomes "preserve unknown files in consumer docs/." This inverts the policy from silent-delete to fail-safe-preserve. An operator who wants the old aggressive cleanup can run `sync-shared docs --strict-orphan` explicitly.

This is consistent with the broader substrate philosophy of operator-opt-in destructive actions (cf. `/ev-run` § 0.5 working-tree-clean refusal-to-auto-discard).

## Consequences

- The default sync posture is fail-safe-preserve: an unknown file in a consumer `docs/` is kept, not deleted, unless `--strict-orphan` is passed explicitly — consistent with the substrate's operator-opt-in-for-destructive-actions philosophy (cf. `/ev-run` § 0.5 refusing to auto-discard a dirty tree).
- The in-file marker (`// sync-shared: plugin-local` / `<!-- sync-shared: plugin-local -->`) became the primary mechanism and ships in `sync-shared.ts` (`isPluginLocal`); the per-plugin manifest stayed optional and unbuilt — the marker proved sufficient.
- `2026-05-30-shared-insights` Phase 5 extended the same fail-safe-preserve reasoning: a *scoped* sync (`--only`/`--exclude-lib`) is copy-only and never deletes, because files outside the operator's stated scope are unmanaged this run, not orphans.
- Watch: `--strict-orphan` remains the one path that deletes; a marker typo silently re-exposes a plugin-local file to it.
