# 0009. External projects-repo layout: projects/ + .claude config split

- **Status**: accepted
- **Scope**: Phase 4 (external repo)

## Decision

The external shared projects repo is self-contained — it carries both the
project data and the config to operate it:

```
[projects-repo]/
  projects/                     # all project dirs; LOOM_PROJECTS_ROOT -> here
    <slug>/ { project.toml, phases/<N>/manifest.toml, decisions/, PLAN.md, … }
    archive/
  .claude/
    settings.json               # COMMITTED, shared
    settings.local.json         # GITIGNORED, per-machine
```

- `LOOM_PROJECTS_ROOT` points at `[projects-repo]/projects`.
- ev resolves provider config from the **projects repo's** `.claude/`
  (`dirname(LOOM_PROJECTS_ROOT)/.claude`), not by walking up from the cwd
  you happened to run `/ev-run` from. Config travels with the data;
  discovery is deterministic.

## Config split (load-bearing)

`.claude/settings.local.json` is machine-local and **gitignored** by
convention (the `/ev-run` § 0.5 dirty-tree check even excludes it). So the
coder config is split:

- **`settings.json` (committed, shared)** — the `ev.environment.providers`
  *templates* (coder/fella command shapes, the dispatch template). All
  clones get them; this is what should travel with the projects repo.
- **`settings.local.json` (gitignored, per-machine)** — only the **active
  provider selection** (`provider: "coder"` at work, `"fella"` at home) and
  any local overrides. Uncommitted, so one repo serves both a coder
  workspace and a home machine.
- **Secrets** (`CLAUDE_CODE_OAUTH_TOKEN`, `GRAPHITE_AUTH_TOKEN`, …) live in
  coder secrets / machine env — **never** in a settings file.

## Why

The operator's instinct (config + projects in one repo) makes the projects
repo an "operate this" unit. The committed/local split keeps it portable —
shared templates travel, per-machine provider/secret choices don't — and
resolving config relative to `LOOM_PROJECTS_ROOT` removes the
"which cwd's `.claude/`?" ambiguity.

## Consequences

- ev's config discovery gains a rule: prefer the projects-repo `.claude/`
  (relative to `LOOM_PROJECTS_ROOT`) for `ev.environment` config (Phase 4).
- The projects repo is the home for both project state AND the env config
  that operates it; the code repo stays just plugins + the code under work.
- A committed `settings.json` in the projects repo must contain **no
  secrets** — enforce in review / a guard.
