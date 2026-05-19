# agents

Marketplace for the **guild / griot / loom** agent framework, shipped
as a family of Claude Code plugins. Source-of-truth for skills,
subagents, CLIs, and accumulated learnings used across Evan's
projects (originally evolved in
[aart.camp](https://github.com/krambuhl/aart.camp), now lifted here
so other projects — and other machines — can consume it without
being coupled to one repo).

## Install

The marketplace ships as six self-contained Claude Code plugins:

| Plugin | What it provides | Depends on |
|---|---|---|
| `griot@krambuhl` | Learnings substrate: `griot` CLI + `griot-*` skills + judge/rewriter agents | — |
| `guild@krambuhl` | Antagonist-panel substrate: `guild` CLI + `guild-*` skills + `whiteboard-*` / `evaluator-*` / `generator-*` agents | — |
| `loom@krambuhl` | Project substrate: `loom` CLI + `loom-*` skills (plans, research, sessions, checkins, retros, archives) | `guild`, `griot` |
| `ev@krambuhl` | Execution loops: `ev-loop-confidence`, `ev-loop-interactive`, `ev-run` skills | `loom`, `guild`, `griot` |
| `review-skill@krambuhl` | Standalone code-review skill | — |
| `agent-loop-full@krambuhl` | Meta-bundle: zero-content plugin that cascade-installs the full family | all five above |

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
cascade-install `griot` + `guild` + `loom` + `ev` + `review-skill`
in dependency order. The cascade is a Claude Code feature (confirmed
empirically in the migration's V4 smoke test).

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

The canonical sources live at the repo root (`cli/`, `skills/`,
`agents/`). The per-plugin trees under `plugins/<name>/` are
**generated**:

- Skill and agent files are mirrored from `skills/<name>/SKILL.md`
  and `agents/<name>.md` into `plugins/<plugin>/skills/<name>/` and
  `plugins/<plugin>/agents/<name>.md` respectively.
- CLI source files are mirrored from `cli/lib/`, `cli/verbs/<plugin>/`,
  and `cli/<plugin>.ts` into `plugins/<plugin>/cli/`.

Edit the canonical sources; run `scripts/sync-shared.ts` before
committing. The repo's V10 test (`scripts/sync-shared.test.ts`)
catches drift; `node scripts/sync-shared.ts --check` is the read-
only invocation suitable for CI.

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
  [marketplace-portable-install](projects/2026-05-19-marketplace-portable-install/PLAN.md)
  (2026-05-19), so consumers install via `claude plugin install`
  rather than cloning + running an idempotent setup script.

## License

Private; not yet open for external contribution.
