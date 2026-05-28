# Research notes — substrate consolidation

Scratch provenance behind [RESEARCH.md](./RESEARCH.md). Citations are to the fork plugins as they existed at planning time (pre-deletion); they will not resolve after M4.

## /goal (§ 1)
- No `goal.*` file anywhere under `~/.claude` (plugin caches, `commands/`). `claude` symlinks to `~/.local/share/claude/versions/2.1.150`.
- Skill tool contract: "Do not use this tool for built-in CLI commands (like /help, /clear, etc.)."
- Probe memory (`goal-substrate-probe-findings-may-2026`) verified skills work *inside* /goal — the inward direction. jelly-run assumed the outward direction.

## Agent axes (§ 2)
- `plugins/jelly-guild/agents/personality-base.md` — three-axis composition mechanism (read domain + phase mode files at dispatch).
- Frontmatter delta: `plugins/jelly-guild/agents/skeptic.md` tools = `Read, Glob, Grep, Bash, Write, Edit, mcp__jelly__*` (broad) vs `plugins/guild/agents/evaluator-a11y.md` tools = `Read, Glob, Grep, Bash(npm run lint:*), Bash(npm run build:*), Bash(npm run test:a11y:*), Bash(git status:*), Bash(git diff:*)` (narrowed).
- guild agent inventory: 9 evaluator-*, 8 whiteboard-*, generator-css-codemod, 3 *-base files.
- Turn-budget evidence: memory `evaluator-packet-turn-budget` (maxTurns=5 bailouts).
- Canonical taxonomy decided: 5 personalities, 12 core domains, 4 phases, contract-fit special, design-systems as recipe, project-local domain extension.

## TOML state (§ 3)
- `plugins/jelly-loom/cli/lib/manifest.ts` — hand-rolled TOML parser; `manifest-invalid-toml` structured errors.
- Sample `manifest.toml` shape observed in `projects/2026-05-26-loom-pr-reconcile-verb/manifest.toml`: `[config]`, `[[phases]]`, `schema_version`.
- loom state spread: `plugins/loom/cli/lib/{manifest,events,checkin,session,config}.ts`.
- Node strip-only hazards: memories `node-strip-only-no-parameter-properties`, `jsdoc-star-slash-node-ts-stripper`.

## Revision (§ 4)
- loom: `plugins/loom/cli/lib/types.ts:169+` (`plan-revise-*` event family).
- jelly-loom: `revise` verb — "Replace PLAN.md or RESEARCH.md with a revision and append to its revision log."

## linear-loom / ev-linear (§ 5)
- Build-out: linear-loom ~57 TS files (11 verbs, 17 lib, 28 tests); ev-linear spec-only (3 SKILL.md, no cli/lib).
- Harvest: `plugins/ev-linear/docs/SUBSTRATE-COMPOSITIONS.md` (recipes); ev-linear skill Preflight sections (command -v); `plugins/linear-loom/cli/lib/plan-parser.ts`.
- Out: `plugins/linear-loom/cli/lib/{linear-state,marker}.ts` (composed keys, marker files); `plugins/linear-loom/contracts/*.schema.json` (output contracts).

## Deletion safety (§ 6)
- No cross-plugin TS imports into the canonical trio. Only reference: `plugins/commons/cli/marketplace-manifest.test.ts`.
- ev-linear → linear-loom (one-way). No jelly ↔ linear coupling. No fork → canonical coupling.
