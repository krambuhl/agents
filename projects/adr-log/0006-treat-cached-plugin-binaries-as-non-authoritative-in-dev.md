# 0006. Treat cached plugin binaries as non-authoritative in dev

- **Date**: 2026-05-29
- **Status**: accepted

## Context

Sub-unit 1b of the substrate-tempering Phase 1 papercut sweep set out to wire `loom plan` to backfill manifest phases. The re-scope and the unit's first contract both stated that the `loom phase add` verb "doesn't exist" and the mechanism "must be built" — a claim taken from the cached `loom` binary on PATH, which listed only `read`/`list`/`update`. The source already had `phaseAdd` (create-once, tested, registered in `PHASE_VERBS`). The same cache-vs-source lag had already misled `parse-plan` (source edits invisible to the cached binary, so verification needed `node …/loom.ts`) and `derive-panel` (`panel-spec-unreadable` on the cached binary, clean on source) earlier in the same session, and `loom doctor` reported `ok:true` throughout — it checks manifest readability, not verb-staleness. The wrong "phase add doesn't exist" fact reached a committed PLAN before it was caught.

Unit goal that surfaced this: wire `loom plan` to backfill PLAN phases into the manifest and repair this project's manifest.

## Decision

Treat the cached plugin binaries (`loom`, `guild` on PATH) as **non-authoritative** during substrate development. Prefer the repo-source entrypoints — `node plugins/<plugin>/cli/<cli>.ts` — for any check whose answer depends on current source: verb existence, parser behavior, panel derivation, and any edit-then-verify loop. The cached binary is acceptable only for operations known to be stable across the lag.

Corollary follow-up: `loom doctor` should grow a cache-vs-source skew check (e.g. compare the installed binary's verb set or version against the repo source) so the lag is detected rather than silently trusted. `loom doctor` returning `ok:true` is not evidence the installed binary matches source.

## Consequences

- The corollary follow-up landed: `2026-05-30-shared-insights` Phase 1 grew `loom doctor`'s cache-vs-source skew checks — `guild-cache-skew` (the resolvable binary's verb set vs source) and `guild-codegen-drift` (committed agent bodies vs source fragments) — both bootstrapped from source, never the cached binary. `loom doctor`'s `ok:true` is no longer silent on binary staleness.
- The "use `node plugins/<plugin>/cli/<cli>.ts` for any source-dependent check" rule held throughout that remediation — every phase ran loom/guild ops via the source entrypoints, and the freshness preflight surfaced a real stale cached `guild` (missing `compile`/`recipe`) on its first live run.
- The lag is now *detected* (advisory), not *fixed*: the operator still re-syncs the plugin cache and restarts when the skew warning fires. The gate is visibility at dispatch, not auto-remediation — an auto-recompile would be a write path, deliberately excluded.
- Watch: a cached binary so stale its error contract predates the skew probe reports as `present-but-unqueryable` (a warning), not green — the "guard needs guarding" case Phase 1 closed.
