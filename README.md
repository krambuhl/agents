# agents

Marketplace for the **draft / guild / griot / loom** agent framework.
Private. Source-of-truth for skills, subagents, CLIs, and accumulated
learnings used across Evan's projects (originally evolved in
[aart.camp](https://github.com/krambuhl/aart.camp), now lifted here
so other projects — and other machines — can consume it without
being coupled to one repo).

## Install

One command per machine:

```bash
gh repo clone krambuhl/agents ~/Sites/agents
cd ~/Sites/agents && ./install.sh
```

`install.sh` is idempotent — safe to re-run after every `git pull`.
It wires three things:

- `~/.agents/{skills,agents,cli,learnings}` — symlinks back into this
  clone (per-item for skills + agents so `npx skills add` content can
  coexist; whole-dir for cli + learnings).
- `~/.claude/{skills,agents}/<name>` — symlink farm using relative
  `../../.agents/...` targets (matches the existing skills-CLI
  convention; portable across Mac/Linux).
- `bin/{draft,guild,griot,loom}` — chicken-and-egg shims regenerated
  inside this clone, so `bin/loom adopt` is invokable from the
  marketplace itself before any consumer project has its own bin
  shims.

The script refuses to clobber existing non-symlink entries in
`~/.agents/` or `~/.claude/`. Anything `npx skills add` or other tools
have installed stays untouched.

## Per-project adoption

Once the marketplace is installed, any project that wants the
framework's loops to work runs:

```bash
cd <some-project>
~/Sites/agents/bin/loom adopt
```

`bin/loom adopt` creates that project's own `bin/{draft,guild,griot,loom}`
shims pointing at `~/.agents/cli/` (which resolves back into this
marketplace). After adoption, the framework's skills and loops
resolve `bin/<cli>` cwd-relative as designed.

## What's inside

| Dir | What | Count |
|---|---|---|
| `skills/` | Slash-commandable skills — `/draft-plan`, `/guild-whiteboard`, `/loom-archive`, etc. | 12 |
| `agents/` | Subagent definitions for the Claude Code Agent tool — `whiteboard-*`, `griot-*`, `evaluator-*`, `generator-*`. Plus `PANEL-COMPOSITION.md` design doc. | 28 |
| `cli/` | The TypeScript implementation of `draft`, `guild`, `griot`, `loom` (substrate plumbing for plans, panels, learnings, archival). | — |
| `learnings/` | Accumulated craft knowledge — short markdown notes that show up in `bin/griot use --as=llm` output for any framework-enabled session. | 4 |

## Skills-CLI compatibility

The marketplace structure is compatible with [`npx skills`](https://skills.sh).
Individual skills can be installed without the full framework:

```bash
npx skills add krambuhl/agents@<skill-name>
```

The skills CLI installs to `~/.agents/skills/` (real directory). The
marketplace's `install.sh` installs to the same path (symlinks).
Both modes coexist — install whichever skills you want however.

## Where this came from

- The framework originated in
  [aart.camp/.claude/](https://github.com/krambuhl/aart.camp/tree/main/.claude)
  as project-local tooling.
- Lifted into
  [`local-dev/agents/`](https://github.com/krambuhl/local-dev)
  in share-me PR #1 (2026-05-16).
- Promoted to this dedicated marketplace repo in share-me PR A
  (2026-05-17), so it's no longer coupled to any single project.
- Planning context:
  [share-me PLAN.md](https://github.com/krambuhl/local-dev/blob/main/projects/2026-05-16-share-me/PLAN.md).
