# 0008. Support partial lib-consumers via LIB_MIRROR_ALLOWLIST

- **Date**: 2026-05-30
- **Status**: accepted

## Context

`sync-shared` mirrors `plugins/commons/cli/lib/` into each CLI-shipping consumer (`COMMONS_CONSUMERS.lib` = griot, guild, loom), historically assuming every consumer mirrors ALL of `commons/cli/lib`. That held for griot and guild. But loom had forked AHEAD of commons: it consolidated the manifest stack into a TOML model (`manifest-toml.ts` / `plan.ts` / `toml.ts`, all plugin-local) and derives PR state from gh instead of storing it. So loom's `adopt/config/project/types.ts` diverged for loom-specific reasons, and its `checkin/events/manifest/session.ts` were consolidated away entirely.

Treating loom as a full consumer meant `sync-shared --check` reported 8 false drift records for it (4 divergent + 4 missing), and a real sync would have overwritten loom's forked files with commons's older model — the destructive behavior this project set out to fix. The genuinely-shared surface between loom and commons is only 5 byte-identical utility files (`errors/gh/git/pr-marker/retro`). Surfaced and resolved in phase 2 of `2026-05-30-commons-sync-reconciliation`.

## Decision

Support **partial lib-consumers** via `LIB_MIRROR_ALLOWLIST` in `scripts/sync-shared.ts`: a consumer listed there mirrors ONLY the named `commons/cli/lib` basenames; consumers absent from the map mirror all of `commons/cli/lib` as before. loom is the first partial consumer, mirroring only the 5 shared utilities.

Everything else in loom's `cli/lib` is loom-owned, handled by two complementary mechanisms:
- Its forked files (`adopt/config/project/types.ts` + the manifest-toml stack) carry the `// sync-shared: plugin-local` marker (ADR-0005); once the allowlist excludes them from the plan they would read as orphans, and the marker preserves them from the sweep.
- The files loom consolidated away (`checkin/events/manifest/session.ts`) are simply not planned for loom, so they produce no "missing" record.

The framing is deliberate: loom didn't *drift*, it forked *ahead*. The allowlist makes "loom shares only the stable substrate utilities and owns its evolved manifest stack" an explicit, enforced fact rather than an accident.

## Consequences

- loom's 8 false drift records cleared with zero change to loom's lib logic — the planner gained an allowlist and loom's 4 forked files each gained a one-line marker.
- `commons/cli/lib` stays the older multi-file model that griot and guild mirror fully; loom's divergence is now first-class, not a defect to be "corrected" by a resync.
- Future consumers that fork ahead, or that only need a subset, follow the same pattern: add a `LIB_MIRROR_ALLOWLIST` entry and mark the plugin-local files. A consumer that should mirror everything simply stays out of the map (the default).
- Trade-off: a partial consumer no longer auto-receives NEW commons lib files — by design (a forked-ahead consumer should not blindly absorb commons changes), at the cost that a genuinely-shared new utility must be added to the consumer's allowlist explicitly.
- Risk: if loom and commons later need to re-converge on a file, the allowlist entry must be updated and the loom-local version reconciled — the same work this project did, but now scoped and explicit rather than silent.
