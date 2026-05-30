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

node scripts/sync-shared.ts          # propagate plugins/commons/{cli/lib,docs}/ into consumer plugins
node scripts/sync-shared.ts --check  # drift check
npm run check                        # alias for the drift check — what the pre-commit hook + CI run
```

Node ≥22.6 is required for the test harness (`package.json` engines); plugin bin shims enforce Node ≥24 at runtime for end users.

## Architecture

### Plugin family (dependency order)

`commons` → `griot` / `guild` → `loom` → `ev` → `agent-loop-full` (zero-content meta-bundle that cascade-installs the family). Dependencies are declared in `.claude-plugin/marketplace.json`; Claude Code resolves and cascade-installs them.

### `commons` is substrate, not just a plugin

`plugins/commons/cli/lib/` (shared TypeScript lib) and `plugins/commons/docs/` (cross-cutting conventions docs) are the **canonical source** for cross-cutting content. `scripts/sync-shared.ts` mirrors them into every consumer plugin's `cli/lib/` and `docs/` trees. After editing anything in `plugins/commons/cli/lib/` or `plugins/commons/docs/`, run the sync script before committing. The drift check is **enforced** (ADR-0007), not honor-system: a pre-commit hook (`.githooks/pre-commit`, auto-configured by the `prepare` npm script on `npm install`) blocks a drifted commit, and the `sync-check` GitHub Actions workflow (`.github/workflows/sync-check.yml`) fails the PR. Run `npm run check` to verify before committing.

Everything else — `plugins/<plugin>/skills/`, `agents/`, `cli/verbs/<plugin>/`, `cli/<plugin>.ts`, and tests — is **plugin-authoritative**. Edit in place; no sync touches those files.

### Plugin layout

Each consumer plugin (`griot`, `guild`, `loom`, `ev`) follows:

- `.claude-plugin/plugin.json` — identity
- `bin/<cli>` — bash entry shim (symlink-safe path resolution + Node ≥24 enforcement), execs `cli/<cli>.ts` via Node's TS loader
- `cli/<cli>.ts` + `cli/verbs/<cli>/<verb>.ts` — verb-dispatch CLI
- `cli/lib/` — synced copy of `plugins/commons/cli/lib/` (do not edit directly)
- `docs/` — synced copy of `plugins/commons/docs/` for doc-citing plugins (do not edit directly)
- `skills/<name>/SKILL.md` — slash-command skills surfaced to Claude Code
- `agents/<name>.md` — subagent definitions

`plugins/commons` itself ships `skills/` (`grill-me`, `find-skills`, `review-skill`) and the canonical `cli/lib/` + `docs/` but no CLI entry; `plugins/agent-loop-full` is content-free.

### Runtime data (not source)

- `projects/` — Loom-managed project artifacts (PLAN.md, RESEARCH.md, checkins, sessions, retros). Append-only at runtime; archived projects live under `projects/archive/`.
- `learnings/` — accumulated craft notes surfaced via `griot use --as=llm`. Per-consumer-project `learnings/` trees are created by `griot init`.

## Editing workflow

1. Identify the authoritative source: `plugins/commons/{cli/lib,docs}/` for cross-cutting, otherwise the plugin tree where the file lives.
2. If you touched `plugins/commons/cli/lib/` or `plugins/commons/docs/`, run `node scripts/sync-shared.ts`.
3. Run `npm test`.
4. Commit.

Test files live next to the code (`*.test.ts`). Marketplace-level invariant tests live in `plugins/commons/cli/` (e.g. `marketplace-manifest.test.ts`, `plugin-bin-shims.test.ts`, `skill-bodies-call-bare-commands.test.ts`).
