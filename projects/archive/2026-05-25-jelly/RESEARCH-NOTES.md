# Research notes: jelly substrate

Companion to RESEARCH.md. Captures the research process the
session walked, in rough order, so a future reader can retrace why
the dossier landed where it did.

## Session arc (2026-05-24)

The research happened inline during a longer session that shipped
Phase 7 of linear-loom (PRs #49, #50, #51). After Phase 7 closed,
the operator surfaced a sharp question — "was all this even worth
it? Linear seems like it wants to drive more than this approach" —
which forced a retrospective on the substrate's posture vs.
Linear-native alternatives.

The investigation walked through:

1. **OpenAI Symphony** (released April 2026). Linear-as-control-plane
   for Codex agents. Confirmed the "Linear wants to drive" intuition
   was real; Symphony is the existence proof of that bet at scale.

2. **Anthropic's equivalent**. Not a 1:1 Symphony clone. Anthropic
   shipped Claude Managed Agents (May 2026) with three primitives:
   Multiagent Orchestration, Outcomes (self-grading via rubric +
   auto-provisioned grader), Dreaming (cross-session memory). The
   /goal command (Claude Code 2.1.139+) is the operator-facing
   entry; Agent View is the control-plane UI.

3. **Substrate value beyond orchestration**. The honest read: the
   ev-* loops are what Multiagent Orchestration replaces. But the
   loom record-keeping layer (manifest.json, checkins, events,
   retros, session notes, RESEARCH.md, INTERVIEW.md) is still
   valuable independent of orchestrator — it's a portable audit
   trail in files the operator owns.

4. **Five injection points the operator can wrap /goal with**:
   CLAUDE.md (with project-subdir inheritance for scope hygiene),
   `.claude/settings.json` hooks, `.claude/agents/*.md` subagents,
   `.mcp.json` MCP server tools, and the Skill tool for registered
   skills. Validated empirically via a six-probe scratch repo at
   `/Users/krambuhl/Sites/goal-substrate-probe/`.

5. **Sub-agent propagation is the load-bearing concern**. CLAUDE.md
   inherits to sub-agents; PLAN.md and goal-head do not.
   Project-scoped CLAUDE.md gives propagation + scope hygiene.

6. **Manifest discipline**. The operator surfaced a sharp constraint:
   PRs from the linear-loom work are "too long with machine
   specific nonsense." Single manifest.[format] + PLAN.md + ADRs
   only. The current substrate's per-checkin JSON files, per-event
   JSONL entries, per-session note markdown all contribute to PR
   noise. Jelly must tighten this.

## What we deliberately did NOT auto-spawn

The skill body's outer-RPI default is "if RESEARCH.md missing, spawn
/loom-research." We skipped that auto-spawn because the research
WAS the session — re-running it fresh-context would discard
findings already established (the probe results, the empirical
injection map, the .mcp.json fix). Operator chose this explicitly.

## What's still empirical-gap (carried to PLAN.md Open questions)

- Project-subdir CLAUDE.md propagation under /goal specifically.
- Outcomes-with-custom-rubrics composability with jelly-guild
  specialists.
- Manifest format choice (JSON / YAML / TOML).
- ADR file naming + location convention.
- Plugin marketplace dependency declaration (jelly-* depends on
  guild/loom, or replaces them?).
