# Insights — agents-boulder: recurring friction (2026-05)

**Provenance:** synthesized from the Claude Code `/insights` report of 2026-05-30 (window 2026-05-10 → 2026-05-30; 34 of 56 sessions analyzed; 175h, 114 commits, 389 messages), cross-checked against friction observed live in the guild-workflow-coverage phase-2 session on 2026-05-30. Source report: `~/.claude/usage-data/report-2026-05-30-121433.html`.

## Summary

The friction over the last month is not in reasoning or design — it concentrates at **integration seams**: places where two copies of a truth (cache vs. working tree, test fixture vs. source, duplicated maps, hardcoded paths) drift out of sync, and where bespoke-workflow preconditions are assumed but not enforced before dispatch. The verify-loop reliably catches these, which is why they read as tolerable rework rather than failures — but it catches them *late*, after a failed spawn, a test-count drop, or a `--check`. Moving the catch earlier is the lever.

## The recurring trip-ups (ranked by cost)

### 1. Stale-snapshot / unenforced-precondition drift

A workflow dispatches against runtime state it assumes but does not verify.

- **Report instances:** loom phase-seeding bugs; Graphite stacking failures (`gt submit` broke → `gh` fallback); `/goal` is a native built-in, not model-invocable, which blocked the jelly-run approach entirely and forced a strategic pivot; auto-spawned subagents missing or model-invocation disabled.
- **Live instance (2026-05-30):** the cached `guild` CLI on PATH predated the `compile` verb (`unknown-verb: compile`), and the Agent-tool registry was a pre-flatten cache snapshot — newly-generated agents were not spawnable until a cache re-sync + restart. A preflight existed (`loom doctor` Tier 2) but probes only loom, so guild's skew passed unchecked.
- **Pattern:** the runtime (plugin cache, agent registry, installed verbs) lags the working tree, and nothing checks the gap before work begins.

### 2. Duplicated truth falling out of sync

A second copy of a value or path that no one updates when the source changes.

- `CANONICAL_PHASES` hardcoded in the axes schema test, omitting a phase — observed at least twice: the original "missing `fixer`," and again on 2026-05-30 when `fixer` was authored but the hardcoded list wasn't updated, so it read green until a later unit *referenced* the phase.
- File relocations breaking path resolution (`double modes/`) and relative imports — surfaced only downstream by a `--check` gate or a test-count drop.
- `PHASE_PREFIX` duplicated across `derive.ts` and `recipe.ts`, kept in sync by hand.
- **Pattern:** the truth is duplicated rather than derived; the copies drift silently and the gap only shows when exercised.

### 3. Output overflow wiping sessions

- **Report:** roughly a third of sessions were rendered unanalyzable by responses exceeding a "500 output-token maximum," plus API 529 (Overloaded) errors fragmenting iterative planning loops.
- **Caveat — verify before acting:** the 500-token figure is implausibly small for normal Claude Code output (sessions in this same window produced far larger responses without tripping it). It more likely points to a specific misconfigured `max_tokens`, a particular call path, or an analyzer artifact than to a general "responses are too long" problem. The right remedy diverges accordingly: raise a budget (config bug) vs. write large deliverables to files and summarize in chat (a real cap). Diagnose which before changing habits.

## Through-line

All three are integration-seam failures, not reasoning failures. They cost rework cycles, not disasters — the verify-and-correct loop catches them — but it catches them late, after the work has already proceeded on a wrong assumption.

## Recommendations

1. **Narrow, once-per-dispatch preflight over blunt per-edit hooks.** A `PostToolUse` hook running the full suite on every `Edit` is too noisy — it would fire dozens of times in a single phase. Target the seams that actually rot: cache-vs-working-tree freshness for guild (does the installed/cached CLI match the source? is the agent registry current?), and a codegen `--check` after any `modes/` or schema-file relocation.
2. **Derive, don't duplicate.** The durable fix for category 2 is structural rather than guarded: derive `CANONICAL_PHASES` from the `[axis.phase.*]` keys instead of hardcoding it; collapse the dual `PHASE_PREFIX` maps to a single source. This deletes a class of "looked green, broke later" rather than catching it after the fact. (Squarely within guild-workflow-coverage phase 3's "simplify the name-mapping" scope.)
3. **Resolve the output-limit question empirically** before adopting a writing-style change — confirm whether the 500-token cap is real and where it originates.

## Related

- Memory: `guild-codegen-cache-skew` (the cache-vs-working-tree lag, with the repo-local-node workaround).
- guild-workflow-coverage phase 3 ("wire postures into the workflow path") inherits the name-mapping and write-capable-tool-floor findings that surfaced while exercising these seams.
