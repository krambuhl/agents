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
CLAUDE.md inheritance** — `projects/<slug>/CLAUDE.md` is loaded
ONLY when cwd is inside that subdir, but is still inherited by all
sub-agents in the session via the standard CLAUDE.md stacking.

This is the strongest single injection-point insight for the
jelly rebuild.

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

- **Per-project CLAUDE.md propagation under /goal**: documented to
  inherit; not yet probe-verified for `/goal` specifically (the
  probe used repo-root CLAUDE.md). Worth a Phase 1 verification
  step.
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
