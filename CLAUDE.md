# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Repository purpose

This repo is a Claude Code **plugin marketplace** named `krambuhl`. It ships five plugins forming the **guild / loom / ev** agent framework. The marketplace catalog lives at `.claude-plugin/marketplace.json`; each plugin under `plugins/<name>/` is self-contained and authoritative for its own content.

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

npm run eval:validate                # promptfoo config check for the skill eval suites (no model calls)
npm run eval:write-as-me             # run the write-as-me suite against a live model (needs `claude /login`)
npm run eval:pr-comments             # same for pr-comments
npm run eval:skills                  # both suites
npm run eval:view                    # open the promptfoo result viewer
```

Skill evals are offline regression suites, not part of `npm test`: they call a model, so run them on demand when changing a skill. Each lives at `plugins/<plugin>/skills/<skill>/evals/` (`promptfooconfig.yaml`, `prompt.txt`, `tests.yaml`, `fixtures/`). The provider loads the plugin straight from the tree (`plugins: [{type: local, path: ../../..}]`) so the skill under test is the file next door. `scripts/skill-evals.test.ts` is the static tripwire that keeps the wiring honest without a model call. The judge uses Claude Code's local oauth credential (`apiKeyRequired: false`); set `ANTHROPIC_API_KEY` instead if there is no logged-in `claude`.

Node ≥22.6 is required for the test harness (`package.json` engines); plugin bin shims enforce Node ≥24 at runtime for end users.

## Architecture

### Plugin family (dependency order)

`commons` → `guild` → `loom` → `ev` → `agent-loop-full` (zero-content meta-bundle that cascade-installs the family). Dependencies are declared in `.claude-plugin/marketplace.json`; Claude Code resolves and cascade-installs them.

### Cross-cutting docs are synced; everything else is plugin-authoritative

The repo-root `docs/` tree (cross-cutting convention docs — `AGENT-CONVENTIONS`, `LOOM-CONVENTIONS`, `PANEL-COMPOSITION`, `SUBSTRATE-COMPOSITIONS`) is the **canonical source** for cross-cutting content. Because a skill that cites `docs/X.md` reads it from its own self-contained plugin at install time, each doc-consuming plugin needs a physical copy; `scripts/sync-shared.ts` mirrors `docs/**` into every doc-consumer's `docs/` tree (today `ev` and `loom`). After editing anything in `docs/`, run the sync script before committing. The drift check is **enforced** (ADR-0007), not honor-system: a pre-commit hook (`.githooks/pre-commit`, auto-configured by the `prepare` npm script on `npm install`) blocks a drifted commit, and the `sync-check` GitHub Actions workflow (`.github/workflows/sync-check.yml`) fails the PR. Run `npm run check` to verify before committing.

`commons` ships **skills, one agent, and hooks** — `grill-me`, `find-skills`, `review-skill`, `write-as-me`, `pr-comments`, the `writing-judge` subagent that `write-as-me` calls, plus the activation log and the write-as-me gate under `hooks/` — and no CLI, no docs. Everything else — `plugins/<plugin>/skills/`, `agents/`, `cli/` (entrypoint, verbs, and lib), and tests — is **plugin-authoritative**. Edit in place; no sync touches those files. (`loom` owns the only `cli/lib/`; its shared utilities — `errors`, `gh`, `git`, `pr-marker`, `retro` — carry the `// sync-shared: plugin-local` marker.)

### Plugin layout

Each consumer plugin (`guild`, `loom`, `ev`) follows:

- `.claude-plugin/plugin.json` — identity
- `bin/<cli>` — bash entry shim (symlink-safe path resolution + Node ≥24 enforcement), execs `cli/<cli>.ts` via Node's TS loader
- `cli/<cli>.ts` + `cli/verbs/<cli>/<verb>.ts` — verb-dispatch CLI
- `cli/lib/` — plugin-owned shared lib (only `loom` has one; edit in place)
- `docs/` — synced copy of repo-root `docs/` for doc-citing plugins (do not edit directly)
- `skills/<name>/SKILL.md` — slash-command skills surfaced to Claude Code
- `skills/<name>/evals/` — optional promptfoo regression suite for that skill (today `write-as-me` and `pr-comments`)
- `agents/<name>.md` — subagent definitions
- `hooks/hooks.json` + scripts — plugin hooks, registered by Claude Code on install (only `commons` has them)

`plugins/commons` ships `skills/` (`grill-me`, `find-skills`, `review-skill`, `write-as-me`, `pr-comments`), `agents/writing-judge.md` (the llm-as-judge subagent `write-as-me` runs its drafts through, at most three rounds), and `hooks/` — no CLI, no docs; `plugins/agent-loop-full` is content-free. The hooks are an activation log (every skill activation and every `writing-judge` run; `skill-report.sh` summarizes it) and the write-as-me gate (`require-judge.sh`, PreToolUse): a call that ships text under the engineer's name (`git commit`, `gh pr create/edit/comment/review`, `gh api` writes to pulls or comments, stack submits, the GitHub MCP PR and comment tools, an Edit/Write that adds comment lines to a source file) is blocked until a `writing-judge` run in the session covers it; one judge loop covers one shipped text. `WRITE_AS_ME_GATE=off` disables it. `scripts/commons-hooks.test.ts` drives both scripts with synthetic events (needs `jq`). `write-as-me` owns how text reads; `pr-comments` owns the procedure for closing out a PR's review and defers all prose to `write-as-me`.

### Runtime data (not source)

- `projects/` — Loom-managed project artifacts (PLAN.md, RESEARCH.md, checkins, sessions, retros). Append-only at runtime; archived projects live under `projects/archive/`.
- `learnings/` — accumulated craft notes, kept as plain markdown. Left over from the retired `griot` plugin; no CLI reads them now.

## Editing workflow

1. Identify the authoritative source: repo-root `docs/` for cross-cutting convention docs, otherwise the plugin tree where the file lives.
2. If you touched `docs/`, run `node scripts/sync-shared.ts`.
3. Run `npm test`.
4. Commit.

Test files live next to the code (`*.test.ts`). Marketplace-level invariant tests live in `scripts/` (e.g. `marketplace-manifest.test.ts`, `plugin-bin-shims.test.ts`, `skill-bodies-call-bare-commands.test.ts`, `sync-shared.test.ts`).
