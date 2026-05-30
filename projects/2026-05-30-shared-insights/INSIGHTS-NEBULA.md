# Insights — agents-nebula (last 30 days)

Source: Claude Code `/insights` report, generated 2026-05-30.
Window: 2026-05-10 → 2026-05-30 · 56 sessions (34 analyzed) · 389 messages · 175h · 114 commits.

This doc captures the month's usage analysis for the agent-framework marketplace. It is a snapshot, not a living spec — the friction items here are the ones worth designing against next.

## What's working

- **Phased PR ship-and-resume loops.** Entire multi-phase projects driven with a "keep going" cadence — each phase executes, opens a PR, auto-resumes after merge. The Research→Plan→Implement discipline lands fully-validated, tested, stacked PRs phase after phase (linear-loom, guild-matrix-precompile, PR-flow).
- **Adversarial plan-grilling before code.** `grill-me` decision interviews and antagonist/panel validation harden plans before implementation. Resolving every open decision branch up front produced master plans that passed antagonist panels on the first execution pass.
- **Root-cause diagnosis then remediation scaffolding.** When something drifts, diagnose the true cause and scaffold a structured fix project rather than patching symptoms — commons divergence traced to an unenforced gate (→ 4-phase plan), missing loom skills traced to the installed-copy-vs-source-tree mismatch.

## What tripped us up

Ranked by cost, not frequency.

### 1. Output token-limit blowups (highest cost)

Roughly 11 sessions were rendered unanalyzable because responses exceeded the output maximum during long `ev-run`/`loom` runs — entire transcripts wiped. This is a response-shape problem, not a code problem: one giant end-of-run summary instead of incremental per-phase progress. Hit hardest during the dense, multi-phase "keep going" loops.

**Direction:** stream progress per-phase; cap individual responses; never emit one mega-summary at the end of a long run.

### 2. Buggy first attempts that only surface at the gate

Generated edits introduced bugs caught only at test/validation gates, costing extra diagnose-and-fix cycles:

- Moving `axes.toml` broke fragment path resolution (double `modes/`) and a relative import — caught only after a test-count drop and the `--check` gate.
- A hardcoded `CANONICAL_PHASES` array omitted `fixer`, causing three failures in `axes-schema.test.ts`.

**Direction:** a PostToolUse hook running `npm test` + `sync-shared --check` after edits would catch this whole class before "done." After any file move, verify import and fragment paths resolve.

### 3. Tooling assumptions biting mid-loop

Orchestration skills, evaluators, and git automation failed silently or partially, forcing manual workarounds:

- `loom-research` auto-spawn failed twice (missing subagent, disabled model invocation); `loom plan` seeded 1 phase instead of 4.
- Graphite branch stacking silently bundled multiple units; `gt submit` failed entirely, requiring a `gh` fallback.
- Source-tree vs installed-marketplace-copy confusion when debugging plugin tooling (a wrong cause was asserted, then retracted).

**Direction:** before invoking multi-phase loops, verify subagents/parsers/branch-stacking are configured. As a standard first step in plugin/skill debugging, confirm whether the source tree or an installed copy is being run, and show the resolved path.

## Suggestions surfaced by the report

- **Output Length section** in CLAUDE.md — keep responses bounded, chunk large work, emit incremental progress.
- **PR Workflow** — prefer `gt submit`; auto-fall-back to `gh pr create` when Graphite fails (synced-repos / non-ff upstream).
- **Hooks** — auto-run the test suite and `--check` codegen gate after `Edit`/`Write` so the buggy-first-attempt class is caught at the source.
- **Custom Skills** — codify the repeatable orchestration steps (ship-pr, the gate sequence) to reduce off-rails state and manual fixups.

## On the horizon

- **Fully autonomous multi-phase loops** — drop the manual "keep going": an orchestrator that auto-resumes on merge, runs the next phase, clears antagonist panels, and pauses only for genuine strategic forks.
- **Parallel agents across independent phases** — fan out independent deliverables into concurrent subagents on isolated worktrees, with a coordinator stacking PRs in dependency order.
- **Self-healing test-driven iteration** — treat the test suite and `--check` gates as a fitness function; never declare done on a red suite.
