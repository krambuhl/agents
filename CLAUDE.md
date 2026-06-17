# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Repository purpose

This repo is a Claude Code **plugin marketplace** named `krambuhl`. It ships six plugins forming the **guild / griot / loom / ev** agent framework. The marketplace catalog lives at `.claude-plugin/marketplace.json`; each plugin under `plugins/<name>/` is self-contained and authoritative for its own content.

## Commands

```bash
npm install              # install vitest (test harness)
npm test                 # run all vitest tests once
npm run test:watch       # watch mode
npx vitest run <path>    # run a single test file
npx vitest run -t "<name>"  # run tests by name pattern

node scripts/sync-shared.ts          # propagate repo-root docs/ into doc-consumer plugins (ev, loom)
node scripts/sync-shared.ts --check  # drift check
npm run check                        # alias for the drift check — what the pre-commit hook + CI run
```

Node ≥22.6 is required for the test harness (`package.json` engines); plugin bin shims enforce Node ≥24 at runtime for end users.

## Architecture

### Plugin family (dependency order)

`commons` → `griot` / `guild` → `loom` → `ev` → `agent-loop-full` (zero-content meta-bundle that cascade-installs the family). Dependencies are declared in `.claude-plugin/marketplace.json`; Claude Code resolves and cascade-installs them.

### Cross-cutting docs are synced; everything else is plugin-authoritative

The repo-root `docs/` tree (cross-cutting convention docs — `AGENT-CONVENTIONS`, `LOOM-CONVENTIONS`, `PANEL-COMPOSITION`, `SUBSTRATE-COMPOSITIONS`) is the **canonical source** for cross-cutting content. Because a skill that cites `docs/X.md` reads it from its own self-contained plugin at install time, each doc-consuming plugin needs a physical copy; `scripts/sync-shared.ts` mirrors `docs/**` into every doc-consumer's `docs/` tree (today `ev` and `loom`). After editing anything in `docs/`, run the sync script before committing. The drift check is **enforced** (ADR-0007), not honor-system: a pre-commit hook (`.githooks/pre-commit`, auto-configured by the `prepare` npm script on `npm install`) blocks a drifted commit, and the `sync-check` GitHub Actions workflow (`.github/workflows/sync-check.yml`) fails the PR. Run `npm run check` to verify before committing.

`commons` is **skills-only** — it ships `grill-me`, `find-skills`, and `review-skill` and nothing else (no CLI, no docs). Everything else — `plugins/<plugin>/skills/`, `agents/`, `cli/` (entrypoint, verbs, and lib), and tests — is **plugin-authoritative**. Edit in place; no sync touches those files. (`loom` owns the only `cli/lib/`; its shared utilities — `errors`, `gh`, `git`, `pr-marker`, `retro` — carry the `// sync-shared: plugin-local` marker.)

### Plugin layout

Each consumer plugin (`griot`, `guild`, `loom`, `ev`) follows:

- `.claude-plugin/plugin.json` — identity
- `bin/<cli>` — bash entry shim (symlink-safe path resolution + Node ≥24 enforcement), execs `cli/<cli>.ts` via Node's TS loader
- `cli/<cli>.ts` + `cli/verbs/<cli>/<verb>.ts` — verb-dispatch CLI
- `cli/lib/` — plugin-owned shared lib (only `loom` has one; edit in place)
- `docs/` — synced copy of repo-root `docs/` for doc-citing plugins (do not edit directly)
- `skills/<name>/SKILL.md` — slash-command skills surfaced to Claude Code
- `agents/<name>.md` — subagent definitions

`plugins/commons` ships only `skills/` (`grill-me`, `find-skills`, `review-skill`) — no CLI, no docs; `plugins/agent-loop-full` is content-free.

### Runtime data (not source)

- `projects/` — Loom-managed project artifacts (PLAN.md, RESEARCH.md, checkins, sessions, retros). Append-only at runtime; archived projects live under `projects/archive/`.
- `learnings/` — accumulated craft notes surfaced via `griot use --as=llm`. Per-consumer-project `learnings/` trees are created by `griot init`.

## Editing workflow

1. Identify the authoritative source: repo-root `docs/` for cross-cutting convention docs, otherwise the plugin tree where the file lives.
2. If you touched `docs/`, run `node scripts/sync-shared.ts`.
3. Run `npm test`.
4. Commit.

Test files live next to the code (`*.test.ts`). Marketplace-level invariant tests live in `scripts/` (e.g. `marketplace-manifest.test.ts`, `plugin-bin-shims.test.ts`, `skill-bodies-call-bare-commands.test.ts`, `sync-shared.test.ts`).
