# agents

Marketplace for the **guild / griot / loom** agent framework, shipped
as a family of Claude Code plugins. Source-of-truth for skills,
subagents, CLIs, and accumulated learnings used across Evan's
projects (originally evolved in
[aart.camp](https://github.com/krambuhl/aart.camp), now lifted here
so other projects — and other machines — can consume it without
being coupled to one repo).

## Install

The marketplace ships as seven self-contained Claude Code plugins:

| Plugin | What it provides | Depends on |
|---|---|---|
| `commons@krambuhl` | Foundation substrate: cross-cutting helpers (shared CLI lib + agent-conventions docs + interview/review skills) used by the rest of the family | — |
| `griot@krambuhl` | Learnings substrate: `griot` CLI + `griot-*` skills + judge/rewriter agents | `commons` |
| `guild@krambuhl` | Antagonist-panel substrate: `guild` CLI + `guild-*` skills + `whiteboard-*` / `evaluator-*` / `generator-*` agents | `commons` |
| `loom@krambuhl` | Project substrate: `loom` CLI + `loom-*` skills (plans, research, sessions, checkins, retros, archives) | `commons`, `guild`, `griot` |
| `ev@krambuhl` | Execution loops: `ev-loop-confidence`, `ev-loop-interactive`, `ev-run` skills | `commons`, `loom`, `guild`, `griot` |
| `review-skill@krambuhl` | Standalone code-review skill | — |
| `agent-loop-full@krambuhl` | Meta-bundle: zero-content plugin that cascade-installs the full family | all six above |

### Recommended: turnkey install with `--scope user`

```bash
claude plugin marketplace add krambuhl/agents
claude plugin install agent-loop-full@krambuhl --scope user
```

`--scope user` writes the enabled-plugins record to
`~/.claude/settings.json` (per-user-global, never lands in any repo).
This is the recommended scope at Patreon and any environment where
**colleagues sharing the repo should NOT see the plugin in their own
Claude Code sessions**. See § Install scopes below for the load-
bearing rationale.

`agent-loop-full@krambuhl` is zero-content; its only job is to
cascade-install `commons` + `griot` + `guild` + `loom` + `ev` +
`review-skill` in dependency order. The cascade is a Claude Code
feature (confirmed empirically in the migration's V4 smoke test).
`commons` is the foundation substrate every other family plugin
depends on; substrate-kind dependencies are listed first in each
consumer's `dependencies` array (substrate-first ordering convention).

### Granular install (cherry-pick a plugin)

```bash
claude plugin marketplace add krambuhl/agents
claude plugin install loom@krambuhl --scope user
```

Each plugin's `dependencies` are declared in the marketplace
manifest, so installing `loom` also pulls in `guild` + `griot`.
Installing `griot` alone is fine too — no deps.

### Install scopes

Claude Code supports four scopes for plugin installs. The relevant
two:

- **`--scope user`** (recommended for personal + work machines):
  writes to `~/.claude/settings.json`. Per-user-global. **Invisible
  to colleagues by construction** — nothing about the install lands
  in any project repo.

- **`--scope local`** (per-project variant): writes to
  `<repo>/.claude/settings.local.json` inside the project you're in
  when you run `claude plugin install`. **Load-bearing requirement**:
  the consumer repo's `.gitignore` MUST include
  `.claude/settings.local.json`. If the file is accidentally
  committed, colleagues cloning the repo will have the plugin
  honored on their own Claude Code sessions at local-settings
  precedence — the file is gitignored by Claude Code *convention*,
  not enforcement. The migration's V1 verification established
  this empirically via the docs (`--scope project`'s
  "makes the plugin available to everyone who clones the project
  repository" doc language applies at local scope on whoever loads
  the repo). If you want a per-project install for any reason,
  triple-check the `.gitignore` first.

`--scope user` is the default recommended path because it avoids the
`.gitignore` footgun entirely.

### After install: per-project `griot init`

For consumer projects that want griot to land learnings/captures
into a project-local `learnings/` tree (so the rollup can grow over
time without polluting the user's global learnings), run inside
each consumer repo:

```bash
griot init
```

This idempotently creates `learnings/{session-notes,nightly}/` and
appends `learnings/` to the project's `.gitignore` if it's not
already present. No-ops on re-run.

## What's inside

| Dir | What | Count |
|---|---|---|
| `.claude-plugin/marketplace.json` | The marketplace catalog. Lists all 6 plugins + dependencies cascade. | 1 |
| `plugins/<name>/` | Per-plugin source trees. Each contains `.claude-plugin/plugin.json` (identity), `bin/<cli>` (entry shim w/ Node ≥24 check), `skills/` (slash commands), `agents/` (subagents), and `cli/` (synced from the canonical top-level `cli/`). | 6 |
| `skills/` | Canonical source-of-truth for slash-commandable skills — `/loom-plan`, `/loom-research`, `/guild-whiteboard`, `/loom-archive`, `/ev-run`, etc. The plugin trees mirror this. | 13 |
| `agents/` | Canonical source-of-truth for subagent definitions — `whiteboard-*`, `griot-*`, `evaluator-*`, `generator-*`. The plugin trees mirror this. | 28 |
| `cli/` | Canonical TypeScript implementation of `guild`, `griot`, `loom`. `scripts/sync-shared.ts` copies this into per-plugin `plugins/<name>/cli/` trees. | — |
| `scripts/sync-shared.ts` | Build script that propagates canonical sources into per-plugin trees. Run before commit if you've touched `cli/` or `skills/`. CI also drift-checks (`--check`). | — |
| `learnings/` | Accumulated craft knowledge — short markdown notes that show up in `griot use --as=llm` output for any plugin-enabled session. | 4+ |
| `docs/` | Substrate-wide conventions: `LOOM-CONVENTIONS.md`, `SUBSTRATE-COMPOSITIONS.md`, `PANEL-COMPOSITION.md`, `AGENT-CONVENTIONS.md`. | — |

## Authoring against this marketplace

Two source-of-truth directions feed the per-plugin trees under
`plugins/<name>/`, distinguished by where the canonical content
lives:

- **`commons-canonical`** (post-PR3 of the in-progress
  `repo-compartmentalize` project): cross-cutting content authored
  inside `plugins/commons/` — the shared TS lib at
  `plugins/commons/cli/lib/` and the substrate-wide docs at
  `plugins/commons/docs/`. `scripts/sync-shared.ts` mirrors these
  into each consumer plugin (lib → CLI-shipping plugins; docs →
  every plugin that cites `docs/X.md` in its skill bodies).
- **`root-canonical`** (legacy; dissolving in PR4): content at the
  repo root that hasn't yet moved into a plugin tree —
  `cli/verbs/<plugin>/`, `cli/<plugin>.ts`, `skills/<plugin-prefix>-*/`,
  and `agents/<plugin-prefix>-*.md`. Each consumer plugin receives
  its slice of this via `sync-shared.ts`. PR4 of
  `repo-compartmentalize` makes each plugin's tree authoritative
  for its own skills/agents/per-plugin CLI; PR9 deletes the root
  copies outright.

**DO NOT edit root `cli/lib/` or root `docs/` directly.** Both
directories exist as inert duplicates during the PR3→PR9 transition
(preserving the import chain for root `cli/verbs/*`'s
`../../lib/X.ts` references until PR4 dissolves it). Authoritative
edits land in `plugins/commons/cli/lib/` and `plugins/commons/docs/`.
PR9 deletes the root copies.

Workflow: edit the canonical sources (in `plugins/commons/` for
lib + docs, in `cli/verbs/<plugin>/` etc. for the rest), then run
`node scripts/sync-shared.ts` before committing. The repo's V10
tests in `scripts/sync-shared.test.ts` catch drift across both
directions; `node scripts/sync-shared.ts --check` is the read-only
invocation suitable for CI.

## Where this came from

- The framework originated in
  [aart.camp/.claude/](https://github.com/krambuhl/aart.camp/tree/main/.claude)
  as project-local tooling.
- Lifted into
  [`local-dev/agents/`](https://github.com/krambuhl/local-dev)
  in share-me PR #1 (2026-05-16).
- Promoted to this dedicated marketplace repo in share-me PR A
  (2026-05-17), so it's no longer coupled to any single project.
- Migrated from monolithic symlink-farm setup script into Claude
  Code plugins in
  [marketplace-portable-install](projects/archive/2026-05-19-marketplace-portable-install/PLAN.md)
  (2026-05-19), so consumers install via `claude plugin install`
  rather than cloning + running an idempotent setup script.

## License

Private; not yet open for external contribution.
