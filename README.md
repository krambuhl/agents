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
| `commons@krambuhl` | Foundation substrate: cross-cutting helpers (shared CLI lib + agent-conventions docs + interview/review skills) used by the rest of the family | — |
| `griot@krambuhl` | Learnings substrate: `griot` CLI + `griot-*` skills + judge/rewriter agents | `commons` |
| `guild@krambuhl` | Antagonist-panel substrate: `guild` CLI + `guild-*` skills + `whiteboard-*` / `evaluator-*` / `generator-*` agents | `commons` |
| `loom@krambuhl` | Project substrate: `loom` CLI + `loom-*` skills (plans, research, sessions, checkins, retros, archives) | `commons`, `guild`, `griot` |
| `ev@krambuhl` | Execution loops: `ev-loop-confidence`, `ev-loop-interactive`, `ev-run` skills | `commons`, `loom`, `guild`, `griot` |
| `agent-loop-full@krambuhl` | Meta-bundle: zero-content plugin that cascade-installs the full family | all five above |

### Recommended: turnkey install with `--scope user`

Register the marketplace once per machine:

```bash
claude plugin marketplace add krambuhl/agents
```

Then install the full family via the cascade meta-bundle:

```bash
claude plugin install agent-loop-full@krambuhl --scope user
```

`--scope user` writes the enabled-plugins record to
`~/.claude/settings.json` (per-user-global, never lands in any repo).
This is the recommended scope at Patreon and any environment where
**colleagues sharing the repo should NOT see the plugin in their own
Claude Code sessions**. See § Install scopes below for the load-
bearing rationale.

`agent-loop-full@krambuhl` is zero-content; its only job is to
cascade-install `commons` + `griot` + `guild` + `loom` + `ev`
in dependency order. The cascade is a Claude Code
feature (confirmed empirically in the migration's V4 smoke test).
`commons` is the foundation substrate every other family plugin
depends on; substrate-kind dependencies are listed first in each
consumer's `dependencies` array (substrate-first ordering convention).

### Granular install (cherry-pick a plugin)

If the marketplace is already registered (see above), just install
the plugin you want:

```bash
claude plugin install loom@krambuhl --scope user
```

Each plugin's `dependencies` are declared in the marketplace
manifest, so installing `loom` also pulls in `commons` + `guild` +
`griot`. Installing `griot` alone is fine too — pulls in `commons`.

## Upgrade

Most plugins in the krambuhl marketplace omit the `version` field in
their `plugin.json` — per Claude Code's docs, "if you omit `version`
and host this marketplace in git, every commit automatically counts
as a new version." The marketplace adopted that posture so high-
velocity dev doesn't require a version-bump ritual on every content
change.

To pull the latest commits across every plugin from every marketplace
on this machine:

```bash
claude plugin update
```

To upgrade just this family's plugins (leaves other marketplaces
alone):

```bash
claude plugin update agent-loop-full@krambuhl
```

Plugin updates **are version-gated** on the `version` field. If a
specific plugin pins itself with `"version": "x.y.z"` in its
`plugin.json` (none in this marketplace do today, but the upstream
ev/guild/loom plugins could opt in later), `claude plugin update`
is a no-op for that plugin unless the field changes. The auto-track
posture above sidesteps this by leaving the field unset.

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
| `plugins/<name>/` | Per-plugin source trees. Each is self-contained: `.claude-plugin/plugin.json` (identity), `bin/<cli>` (entry shim w/ Node ≥24 check), `skills/` (slash commands), `agents/` (subagents), and `cli/` (TypeScript implementation). The plugin tree is authoritative for everything it ships. | 6 |
| `plugins/commons/` | Foundation substrate plugin: cross-cutting helpers (`cli/lib/` and `docs/`) that the other plugins receive via `scripts/sync-shared.ts`. Also ships the shared skills (`grill-me`, `find-skills`, `review-skill`). | 1 (within plugins/) |
| `scripts/sync-shared.ts` | Build script that propagates `plugins/commons/{cli/lib,docs}/` into consumer plugin trees. Run after editing `plugins/commons/`. CI also drift-checks (`--check`). | — |
| `projects/` | Loom-managed project artifacts: PLAN.md / RESEARCH.md / checkins / sessions / retros. Append-only at runtime; archived projects live under `projects/archive/`. | — |
| `learnings/` | Accumulated craft knowledge — short markdown notes that show up in `griot use --as=llm` output for any plugin-enabled session. | 4+ |

## Authoring against this marketplace

Each plugin under `plugins/<name>/` is the authoritative source for
its own content: skills, agents, per-plugin CLI verbs, and entry
points all live in the plugin tree. The only cross-cutting content
that `scripts/sync-shared.ts` mirrors is what lives under
`plugins/commons/` (the substrate-source plugin):

- **`plugins/commons/cli/lib/`** — shared TypeScript lib. Mirrored
  via the `commons-canonical` sync direction into every CLI-shipping
  consumer plugin's `cli/lib/`.
- **`plugins/commons/docs/`** — substrate-wide conventions docs.
  Mirrored into every doc-citing consumer plugin's `docs/` (lib
  consumers + `ev`, which cites docs/X.md in skills without shipping
  a CLI).

Everything else — `plugins/<plugin>/skills/`, `plugins/<plugin>/agents/`,
`plugins/<plugin>/cli/verbs/<plugin>/`, `plugins/<plugin>/cli/<plugin>.ts`,
and their tests — is plugin-authoritative. Edit there directly; no
sync step touches those files.

Workflow:
1. Edit the authoritative source (in the appropriate plugin tree, or
   in `plugins/commons/` for cross-cutting lib/docs).
2. Run `node scripts/sync-shared.ts` if you touched `plugins/commons/`
   (otherwise no sync needed — your edit is already in the
   authoritative location).
3. Commit.

CI gates on `node scripts/sync-shared.ts --check` to catch drift in
the commons-canonical mirror.

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
