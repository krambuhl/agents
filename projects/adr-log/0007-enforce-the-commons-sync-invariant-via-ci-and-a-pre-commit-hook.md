# 0007. Enforce the commons-sync invariant via CI and a pre-commit hook

- **Date**: 2026-05-30
- **Status**: accepted

## Context

The `[PR3]/[PR6]` restructure made `plugins/commons/cli/lib/` and `plugins/commons/docs/` the canonical source for cross-cutting content, with `scripts/sync-shared.ts` mirroring them into each consumer plugin. CLAUDE.md documented the alignment as a CI gate — "run the sync script before committing — CI will fail otherwise (`--check` mode)."

No such enforcement existed. There was no `.github/`, no CI workflow, no npm script, and no git hook running `sync-shared --check`. The invariant was honor-system. Under a burst of ~6-7 parallel-agent PRs (#142-#150) the mirrors silently forked: `commons/cli/lib/types.ts` froze at its one [PR3] commit while loom's kept evolving (~110 loom-specific lines), `adopt/config/project.ts` diverged, and the orphan-sweep had turned destructive (it deleted loom's plugin-local lib). `sync-shared --check` was RED on main (19 records) with nothing catching it. Surfaced and reconciled across phases 1-3 of `2026-05-30-commons-sync-reconciliation`; this ADR records the phase-4 enforcement that stops it recurring.

## Decision

Enforce the commons-sync invariant in code, not by convention. Three layers:

1. **CI** — `.github/workflows/sync-check.yml` runs `npm run check` (`sync-shared --check`) + `npm test` on every `pull_request` and on `push` to `main`. The unbypassable gate at merge.
2. **Pre-commit hook** — `.githooks/pre-commit` runs `--check` at commit-time so drift never gets pushed. Auto-activated via the `prepare` npm script (`git config core.hooksPath .githooks`), so a fresh clone gets the hook on `npm install`. A committed `.githooks/` + `core.hooksPath` is used rather than husky, to avoid an npm dependency. Bypassable with `git commit --no-verify` by intent.
3. **`npm run check`** — the local-ergonomics alias the hook and CI both invoke.

The root cause was two-fold and both halves are addressed: (a) a documented-but-unenforced gate (the claim without the mechanism — now the mechanism exists and CLAUDE.md's claim is true); and (b) the fork only compounds under parallelism — honor-system sync survives one careful agent but collapses under many, so enforcement must be mechanical.

## Consequences

- A divergent mirror now fails before merge (CI) and before push (hook). Verified end-to-end: a deliberately-drifted commit is blocked by the pre-commit hook, and `--check` exits 1 on drift / 0 clean. CLAUDE.md's "CI will fail otherwise" is no longer fiction.
- `npm install` runs `prepare`, setting `core.hooksPath` to `.githooks` — the hook activates automatically. A contributor who never runs `npm install` won't get the hook locally, but CI still gates them at PR time. CI's `npm ci` also runs `prepare`; setting `core.hooksPath` in the CI checkout is harmless (no commits happen there).
- The hook adds a fast `--check` (a sub-second file-walk + byte-compare, no tests) to every commit; `--no-verify` is the documented escape hatch.
- CI also runs `npm test`, so the workflow doubles as the repo's general PR gate (catching test regressions), slightly beyond sync-drift — an intentional, low-cost broadening.
- The original failure class — commons/consumer mirrors silently forking under parallel agents — can no longer happen quietly: it is caught at commit-time or at PR-time.
