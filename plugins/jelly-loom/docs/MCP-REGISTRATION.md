# Registering the jelly MCP server

The jelly MCP server (`plugins/jelly-loom/mcp/server.ts`) exposes the
jelly-loom verbs as first-class `mcp__jelly__*` tools under `/goal`:
`mcp__jelly__research`, `mcp__jelly__plan`, `mcp__jelly__revise`,
`mcp__jelly__adr`. The jelly-guild personalities declare
`mcp__jelly__*` in their `tools:` allowlist, so once the server is
registered they can call the substrate verbs directly.

This unit ships the server + this doc, **not** a live `.mcp.json`.
Registration is a per-repo / per-session concern — `jelly-run`
(Phase 2.1) will write the live `.mcp.json` as part of session setup.
Until then, register manually as below.

## Where it goes

Project-scoped MCP servers are registered in a `.mcp.json` at the
**repo root** — NOT in `.claude/settings.json` (whose `mcpServers`
key is silently ignored; this is the empirically-confirmed Phase 1.1
finding, see the project's `RESEARCH.md` § Phase 1.1 follow-up and
the open feature request anthropics/claude-code#5350).

## The registration

```json
{
  "mcpServers": {
    "jelly": {
      "command": "node",
      "args": ["<JELLY_LOOM_DIR>/mcp/server.ts"]
    }
  }
}
```

The server name `jelly` is what produces the `mcp__jelly__*` tool
prefix — keep it exactly `jelly` so the personalities'
`mcp__jelly__*` allowlist matches.

### Resolving `<JELLY_LOOM_DIR>`

- **In the agents repo itself** (where jelly-loom lives at
  `plugins/jelly-loom/`): use `plugins/jelly-loom/mcp/server.ts`.
- **In a consumer repo** that installed jelly-loom from the
  marketplace: the plugin lives under
  `~/.claude/plugins/cache/<owner>/jelly-loom/<sha>/`, so the path is
  `~/.claude/plugins/cache/<owner>/jelly-loom/<sha>/mcp/server.ts`.
  `jelly-run` resolves this install path when it writes the
  `.mcp.json`.

### Context the server reads

The server derives its `CliContext` from the environment + cwd:

- `JELLY_PROJECTS_ROOT` (default `<cwd>/projects`) — where projects
  live.
- `JELLY_REPO_ROOT` (default `cwd`) — the repo root the verbs commit
  against and where `jelly plan` manages the repo-root CLAUDE.md
  `@`-line.

Set these in the `.mcp.json` server `env` block if the defaults
don't match the consuming repo's layout.

## Verifying

From the repo root after adding `.mcp.json`:

```bash
claude mcp list          # should show: jelly: node ... - ✓ Connected
claude mcp get jelly     # shows scope + connection status
```

**Trust-dialog caveat**: the first `claude` invocation in a repo with
a new `.mcp.json` prompts the workspace trust dialog to approve the
MCP server. Approve once; subsequent invocations skip it.
