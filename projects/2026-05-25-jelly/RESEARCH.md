# Research: jelly substrate

## Context

How does an operator wrap Anthropic's `/goal` + Multiagent
Orchestration in a substrate that preserves the opinions of the
loom/guild substrate family (record-keeping, antagonist evaluation,
plan revision) without the substrate-shim overhead that the
linear-loom + ev-linear plugins ended up carrying?

The session that produced this research validated a six-probe scratch
repo against Claude Code 2.1.x `/goal` to find out which injection
points actually compose. The findings are the empirical foundation
this plan rests on.

## Empirical findings (validated 2026-05-24 via probe repo)

The probe is at `/Users/krambuhl/Sites/goal-substrate-probe/`. All
six probes ran cleanly after one config-path correction. Five
injection points reach the lead agent of `/goal`; four of those
propagate down to sub-agents in the fleet.

### Validated injection points

| Injection point | Verified | Propagates to sub-agents? |
|----------------|----------|---------------------------|
| `CLAUDE.md` (project + repo, inherited stack) | ✓ | Yes — inherited by every agent in the session |
| `.claude/settings.json` hooks (Stop, PostToolUse, etc.) | ✓ | Yes — fires on tool calls regardless of which agent ran them |
| `.claude/agents/<name>.md` custom subagents | ✓ | Self (each subagent has its own body) |
| `.mcp.json` MCP servers at project root | ✓ | Yes (if subagent's `tools:` list includes them) |
| Skill tool (registered loom-*/guild-*/jelly-* skills) | ✓ | Yes (if subagent's `tools:` allows Skill) |
| PLAN.md substrate-posture section | ✓ (lead only) | No — lead reads it; sub-agents only if instructed |
| Goal-text prelude (`/goal "..."` head) | ✓ (lead only) | No — stops at the lead boundary |

### Two non-obvious findings worth keeping

1. **Subagent return value is lossy at the parent boundary.**
   When the lead agent dispatches a subagent via the Agent tool, the
   subagent's WORK happens (verified) but its OUTPUT comes back as a
   terse summary, not the full transcript. Sentinel strings emitted
   inside the subagent never bubbled up to the lead. Implication:
   substrate orchestration that uses subagent dispatch CANNOT rely
   on parsing the parent-visible Agent result. Findings must
   surface via a side-channel — file, hook log, structured CLI
   stdout parse (the pattern `/guild-validate` already uses via
   `bin/guild parse-and-aggregate`).

2. **Project-scoped MCP belongs in `<project>/.mcp.json`, NOT in
   `.claude/settings.json`'s `mcpServers` key.** The settings.json
   key is silently ignored. The canonical path is `.mcp.json` at
   the project root, shared via git. `.claude` subdirectory MCP is
   an open feature request (anthropics/claude-code#5350), not
   implemented as of CC 2.1 (May 2026).

### Quality difference: CLAUDE.md vs PLAN.md / goal-head

Sub-agents inherit CLAUDE.md but NOT PLAN.md or goal-head. So if
substrate posture lives only in PLAN.md / goal-head, the lead
agent must thread it into every sub-agent brief — and the lossy-
parent-boundary finding means verifying the threading worked is
fiddly. CLAUDE.md propagates naturally to the fleet.

Trade-off: CLAUDE.md applies to ALL Claude Code work in the repo
(unwanted scope creep). The middle ground is **project-scoped
CLAUDE.md composition** — `projects/<slug>/CLAUDE.md` is composed
into the parent session's context via explicit `@`-import from
repo-root CLAUDE.md, then inherited by all sub-agents in the
session via the standard CLAUDE.md stacking.

This is the strongest single injection-point insight for the
jelly rebuild. See § Phase 1.1 follow-up below for the empirical
verification of which subdir-CLAUDE.md mechanism actually works.

### Phase 1.1 follow-up: project-subdir CLAUDE.md probe (2026-05-25)

The repo-root probe (2026-05-24) confirmed CLAUDE.md inheritance
when the session cwd contains the CLAUDE.md directly. A second probe
ran 2026-05-25 to close the remaining open question: under `/goal`,
how does a `projects/<slug>/CLAUDE.md` (a *subdirectory* of the
session cwd) reach the lead agent and dispatched subagents?

The probe lives at `/tmp/jelly-claude-md-probe/` (scratch; safe to
delete after these findings are committed). It tests three sentinels
under one `/goal` invocation from the repo root:

| Sentinel | Source | Mechanism tested | Result (lead) | Result (subagent) |
|----------|--------|------------------|---------------|-------------------|
| `SENTINEL-PARENT-CLAUDE-MD` | `./CLAUDE.md` at session cwd | Sanity — repo-root CLAUDE.md loads | ✓ visible | ✓ visible |
| `SENTINEL-CHILD-VIA-IMPORT` | `projects/test-slug/CLAUDE.md`, referenced by `@projects/test-slug/CLAUDE.md` in parent | `@`-import composition | ✓ visible | ✓ visible |
| `SENTINEL-CHILD-VIA-AUTODISCOVER` | `projects/test-slug-autodiscover/CLAUDE.md`, NOT referenced | Filesystem-walk auto-discovery into subdirs | ✗ NOT visible | ✗ NOT visible |

**Verdicts**:

- **`@`-import composition** under `/goal`: **CONFIRMED**. Both the
  lead agent and the dispatched subagent (`probe-reporter`, verified
  via `agent_type` in the PostToolUse hook payload) saw
  `SENTINEL-CHILD-VIA-IMPORT` from the @-imported subdir file.
- **Filesystem-walk auto-discovery into subdirs** under `/goal`:
  **INVALIDATED**. Neither the lead agent nor the subagent saw
  `SENTINEL-CHILD-VIA-AUTODISCOVER`. Claude Code's CLAUDE.md
  discovery walks UP from cwd to root; it does not walk DOWN into
  child directories.
- **Subagent CLAUDE.md visibility**: the dispatched subagent sees
  the **same** CLAUDE.md context the lead agent sees. CLAUDE.md is
  session-wide in CC 2.1, not per-agent. Substrate posture
  propagated via parent CLAUDE.md (with or without `@`-import)
  reaches the entire fleet automatically.

**Implications for Phase 1.2 substrate posture** (jelly-guild):

1. The `jelly-guild/templates/CLAUDE.md` is **the project-scoped
   substrate-posture file**, but it reaches the lead agent + fleet
   ONLY when the repo-root CLAUDE.md explicitly references it via
   `@projects/<slug>/CLAUDE.md`. There is no auto-discovery to lean
   on. PLAN.md's original "subdir CLAUDE.md propagates by
   filesystem-walk" assumption is invalidated; the @-import fallback
   IS the canonical mechanism.
2. `jelly plan` (the verb that scaffolds a new project, shipped in
   Phase 1.3) MUST also update the repo-root `CLAUDE.md` to insert
   the `@projects/<slug>/CLAUDE.md` line when a new project is
   created. Project archival (or session-switching between projects)
   should remove/swap the @-line so only the active project's
   posture is loaded.
3. **No fallback reshape needed** — `@`-import works under `/goal`
   uniformly for lead and subagent. The risk flagged in PLAN.md §
   Phase 1.1 Risks ("subdir injection invalidated → revise PLAN.md")
   does not fire; Phase 1.2 proceeds as planned with the @-import
   detail substituted for filesystem-walk.
4. Substrate-posture propagation to dispatched specialists
   (`subagent_type=jelly-guild-skeptic` etc.) is **automatic** once
   the lead agent's CLAUDE.md context includes the posture. No
   per-dispatch brief threading required. This matches and confirms
   the "CLAUDE.md propagates naturally to the fleet" insight above.

**Probe artifacts** (for reproducibility):

- `/tmp/jelly-claude-md-probe/CLAUDE.md` — parent file with parent sentinel + @-import directive.
- `/tmp/jelly-claude-md-probe/projects/test-slug/CLAUDE.md` — file pulled in via @-import.
- `/tmp/jelly-claude-md-probe/projects/test-slug-autodiscover/CLAUDE.md` — file NOT referenced (autodiscover test).
- `/tmp/jelly-claude-md-probe/projects/baseline/` — empty subdir (control; never emitted any sentinel, as expected).
- `/tmp/jelly-claude-md-probe/.claude/agents/probe-reporter.md` — subagent that introspected its own context and emitted SUBAGENT-SEES-* / SUBAGENT-MISSING-* lines.
- `/tmp/jelly-claude-md-probe/hook-log/post-tool-use.log` — captured the subagent's `agent_type` envelope + sentinel echo lines.

## Alternative substrates considered

Three positions exist in the May 2026 landscape:

1. **Operator-paired CLI** (linear-loom + ev-linear, what we
   shipped). Git is plan authority. Operator drives via CLI verbs.
   Loom-shaped audit trail in files. Most portable; highest
   supervision overhead.

2. **Linear-driven autonomous** (OpenAI's Symphony, April 2026).
   Linear board IS the agent control plane. Agents poll, run
   continuously, escalate on failure. Minimal supervision. Tied to
   Linear + Codex.

3. **Anthropic-hosted orchestration** (Claude Managed Agents +
   `/goal`, May 2026). Anthropic hosts the orchestration loop
   (Multiagent Orchestration, Outcomes, Dreaming). Operator brings
   goal-text + tools; Anthropic brings the lead-agent loop.

The jelly substrate targets position 3 but preserves loom's
record-keeping. Anthropic owns the orchestration; loom-shaped
artifacts (manifest, PLAN.md, ADRs) own the audit trail.

## Architectural decisions surfaced (during the session)

These are pre-research decisions the operator made in the session
that informed the plan target:

1. **Three plugins nested under `jelly`**: `jelly-guild`,
   `jelly-loom`, `jelly-run`. Each owns one layer of the substrate
   split (specialists / record-keeping / orchestration injection).

2. **Metadata discipline**: tight constraint on machine-readable
   metadata files. Single `manifest.[format]` per project + PLAN.md
   + Architectural Decision Records (ADRs). NO sprawling
   `manifest.json` + `events.jsonl` + `config.json` + multiple
   `.json` checkin files. The operator's read: "PRs are too long
   with machine-specific nonsense."

3. **Sub-agent propagation is the load-bearing concern.** Anthropic
   Managed Agents + `/goal` already orchestrate; the substrate's
   job is to ensure the FLEET (sub-agents) follows the operator's
   posture without each one needing explicit instructions per
   dispatch. Project-scoped CLAUDE.md inheritance is the canonical
   propagation path.

4. **Tools-as-substrate over prose-as-substrate.** Wrapping CLI
   verbs as MCP servers (in `.mcp.json`) makes the substrate
   *automatic* — agents reach for the registered tools naturally
   rather than needing prose instructions to know what to do.
   Hooks enforce; tools enable; prose only fills the remaining gaps.

## Open questions (carry into PLAN.md)

- ~~**Per-project CLAUDE.md propagation under /goal**~~: **CLOSED
  2026-05-25** by the Phase 1.1 probe above. Mechanism: explicit
  `@projects/<slug>/CLAUDE.md` in the repo-root CLAUDE.md (not
  filesystem-walk auto-discovery). Lead + subagent both see the
  imported file; substrate posture reaches the whole fleet via
  one @-line. See § Phase 1.1 follow-up.
- **Outcomes-with-custom-rubrics** (Anthropic Managed Agents API
  side): can rubrics reference jelly's specialist agents? Or are
  they purely auto-provisioned graders? The Outcomes loop's
  composability with jelly-guild specialists is unverified.
- **Manifest format**: JSON vs YAML vs TOML. The operator wants
  ONE format; choice is open. Probably JSON for parser ergonomics,
  but TOML reads better as a manifest. Plan-time decision.
- **ADR format + location**: `projects/<slug>/adrs/NNNN-<slug>.md`
  vs `decisions/` or similar. Plan-time decision.
- **Plugin marketplace registration**: the agents-repo marketplace
  has `commons`, `griot`, `guild`, `loom`, `linear-loom`, `ev`,
  `ev-linear`, `agent-loop-full`. Adding `jelly`,
  `jelly-guild`, `jelly-loom`, `jelly-run` makes 12. Plan-time
  question: does jelly-* depend on guild/loom (parallel-substrate
  pattern, like linear-loom), or replace them?

## References

- Probe repo: `/Users/krambuhl/Sites/goal-substrate-probe/`
  (specifically `RESULTS.md` for the validated injection map).
- Memory: `feedback_goal_substrate_probe_findings.md` (May 2026,
  in agents-repo memory).
- Memory: `feedback_ev_to_ev_linear_port_patterns.md` (three
  port patterns for parallel-substrate plugins).
- The full session conversation (2026-05-24, this session).
- Anthropic docs on `/goal`: code.claude.com/docs/en/goal.
- Anthropic docs on hooks: code.claude.com/docs/en/hooks.
- Anthropic docs on MCP: code.claude.com/docs/en/mcp.
- Anthropic docs on subagents: code.claude.com/docs/en/sub-agents.
- Open feature request anthropics/claude-code#5350 (project MCP
  config in `.claude/` subdirectory).
- linear-loom DESIGN.md sections: § 17 (parallel-plugin framing),
  § 18 (griot excision), § 8 (no events log).
