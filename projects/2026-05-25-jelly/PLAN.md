# Plan: Jelly substrate

**Slug**: `2026-05-25-jelly`

**Status**: plan committed

**Research foundation**: [RESEARCH.md](./RESEARCH.md) (synthesized 2026-05-25 from a session that validated six substrate-probe injection points against Claude Code 2.1.x `/goal`).

## Context

Build the `jelly` plugin family — a substrate-shaped wrapper around Anthropic's `/goal` command + Multiagent Orchestration that preserves the operator-paired review posture of the loom/guild family while collapsing the substrate-shim surface that linear-loom + ev-linear carried.

The session that produced this plan empirically validated five injection points (`CLAUDE.md`, `.claude/settings.json` hooks, `.claude/agents/` subagents, `.mcp.json` MCP servers, Skill tool) and one structural caveat (subagent return values are lossy at the parent boundary). The jelly substrate is built on those validated surfaces.

Parallel to the existing `loom` + `guild` plugins; coexists indefinitely. Operators pick per-project which substrate to use; jelly is the preferred shape when the project's work fits Anthropic's hosted orchestration with one-PR-at-a-time review gates.

## Goal

Ship four marketplace plugins (`jelly-guild`, `jelly-loom`, `jelly-run`, plus a `jelly` meta-bundle) that together provide:

1. **Subagent propagation** (`jelly-guild`): specialist subagent registry with substrate baked into each agent's `tools:` list + body, plus a project-scoped `CLAUDE.md` template that propagates posture down the fleet.
2. **Record-keeping** (`jelly-loom`): tightened metadata discipline (single `manifest.toml` per project + `PLAN.md` + workspace-level ADR log; no `events.jsonl`, no per-checkin JSON files). Three CLI verbs (`jelly research`, `jelly plan`, `jelly revise`) + an `mcp__jelly__*` MCP wrapper.
3. **Orchestration injection** (`jelly-run`): a thin batch-cadence wrapper around `/goal` that reads PLAN.md + current state, composes a goal preamble, invokes `/goal`, and exits when the PR opens. Operator-driven review-and-merge cadence between tasks.
4. **Meta-bundle** (`jelly`): zero-content cascade installer for the three substrate plugins.

## Exit requirements

- All four plugins registered in `.claude-plugin/marketplace.json` and installable via `claude plugin install`.
- Empirical verification (M1 Phase 1.1) of two architectural assumptions: project-scoped `projects/<slug>/CLAUDE.md` propagates to sub-agents under `/goal`; Outcomes composability with custom subagents probed (either composes, or documented fallback to `/guild-validate` Skill invocations).
- Metadata discipline enforced: a typical jelly project PR touches the artifact files for that task + (optionally) one new ADR file + nothing else machine-generated. Manifest sees zero writes after project creation in the steady state.
- One real workstream dogfoods the full substrate end-to-end (M3); retro document and v1 lessons captured.

## Out of scope

- Migration of existing loom-backed projects to jelly. Jelly is parallel; loom-backed projects stay on loom.
- Replacing or deprecating `loom`, `guild`, `ev`, `linear-loom`, or `ev-linear` plugins. They survive untouched.
- Wrapping non-`/goal` Claude Code workflows (chat sessions, ad-hoc work). Jelly is `/goal`-shaped only.
- Building a non-Claude-Code orchestrator wrapper (e.g., Codex Symphony equivalent). Different fork target.
- Hosted side-channels for findings (e.g., a hosted dashboard for evaluator results). All findings surface via files / hook logs / CLI stdout per the substrate side-channel pattern.

## Milestones

### M1 — Substrate validated + foundation shipped

#### Phase 1.1 — Verify empirical assumptions

**Goal**: Probe the one remaining unverified architectural assumption before committing the substrate to it.

**Exit**:
- Project-scoped `projects/<slug>/CLAUDE.md` inheritance under `/goal` confirmed via a scratch repo probe (a sub-agent dispatched from `/goal` running with cwd inside the project subdir sees the subdir CLAUDE.md contents in addition to repo-root CLAUDE.md).
- Findings committed to `RESEARCH.md` via `jelly revise --target=research`.

**Depends on**: nothing.

**Risks**: probe result may invalidate the project-subdir injection path. If invalidated, revise `PLAN.md` via `jelly revise --target=plan` before Phase 1.2 begins — the substrate-posture propagation mechanism would need to be re-thought (likely fall back to repo-root CLAUDE.md with explicit per-project switching, or shift posture into subagent definition bodies + MCP tools only).

#### Phase 1.2 — `jelly-guild` substrate

**Goal**: Ship the subagent-propagation layer of jelly.

**Goal (updated)**: Ship the subagent-propagation layer of jelly under a three-axis decomposition — personality (HOW the agent operates) + domain (WHAT it knows) + phase (WHEN in lifecycle).

**Exit**:
- `plugins/jelly-guild/` exists with `.claude-plugin/plugin.json` + marketplace entry.
- **Subagent registry**: 5 personality files at `plugins/jelly-guild/agents/<personality>.md` — `skeptic`, `methodical`, `generative`, `pragmatist`, `synthesizer`. Each agent's `tools:` list includes Read (to load mode files at run-time) + `mcp__jelly__*` substrate tools.
- **Mode files** at `plugins/jelly-guild/modes/`:
  - `modes/domains/` (5 files): `composition`, `naming`, `abstraction`, `testing`, `a11y`. Architecture-shaped (portable across languages); language-specificity rides in the per-task brief.
  - `modes/phases/` (4 files): `researcher`, `planner`, `implementer`, `reviewer`. Phase mode shapes what the subagent does (implementer-phase declares Write + Edit; reviewer-phase declares verdict-format output).
  - Mode files are READ by personality subagents at dispatch time; they are NOT themselves registered as subagents.
- **Composition mechanism**: reference-based. Dispatcher passes the three mode names in the brief; subagent reads the three corresponding mode files at run-time to construct its identity for the task.
- **Paired rubrics**: each domain has a companion rubric at `plugins/jelly-guild/rubrics/<domain>.md` (markdown per-criterion scoring; Outcomes-callable via the auto-provisioned grader). Same conceptual content as the domain mode file, formatted for grader consumption. Manually synced in v1.
- **Project-scoped CLAUDE.md template** at `plugins/jelly-guild/templates/CLAUDE.md` (consumed by `jelly plan` on project birth + by `jelly revise --target=plan` when substrate posture changes).
- Plugin dependency declared: `[commons]`.

**Depends on**: Phase 1.1.

**Risks**: architecture-shaped domain set may be too abstract to catch concrete language-specific antipatterns — mitigated by per-task brief carrying language context; revisit in M3 dogfood if real misses surface. Mode-file resolution at run-time depends on subagents having Read in their `tools:` list — verified during Phase 1.1's empirical probe (subagent tool access under `/goal`). Paired domain/rubric synchronization drift — mitigated for v1 by manual coupling; v2 could derive both from a single source.

#### Phase 1.3 — `jelly-loom` substrate

**Goal**: Ship the record-keeping + plan-lifecycle layer of jelly.

**Exit**:
- `plugins/jelly-loom/` exists with `.claude-plugin/plugin.json` + marketplace entry.
- CLI verbs: `jelly research`, `jelly plan`, `jelly revise` (with `--target=plan|research`), `jelly adr` (for appending workspace-level ADRs).
- Manifest format: TOML; shape is identity + write-once `[config]` + write-once `[[phases]]` declarations + references (`plan_file`, `research_file`, `adr_log`). No per-PR mutation; richer than bare-minimum so the lead agent can look up project shape without parsing PLAN.md.
- ADR log at `projects/adr-log/` (workspace-level, NOT per-project). Numbering: `NNNN-<short-slug>.md`, sequential global across all projects.
- MCP server wrapper at `plugins/jelly-loom/mcp/server.{js,ts}` exposing the CLI verbs as first-class `mcp__jelly__*` tools (e.g., `mcp__jelly__plan`, `mcp__jelly__revise`, `mcp__jelly__adr`).
- Plugin dependency declared: `[commons]`.

**Depends on**: Phase 1.1.

**Risks**: tight metadata discipline trades audit-trail richness for cleanliness; recovery and forensics get harder without `events.jsonl`. Mitigated via richer write-once manifest config + git log + PR state as the derived audit trail.

### M2 — Orchestration layer

#### Phase 2.1 — `jelly-run` substrate

**Goal**: Ship the orchestration layer of jelly — three skills that wrap `/goal` with operator-paired grill-gates at the PR boundary.

**Exit**:
- `plugins/jelly-run/` exists with `.claude-plugin/plugin.json` + marketplace entry.
- Three skills shipped inside the plugin:
  - **`/jelly-run`** (operator-invoked, top-level): composes `/goal` preamble from PLAN.md + git state; invokes `/goal` (without "open PR" in goal text); on yield, auto-chains `/jelly-pr` in the same session.
  - **`/jelly-pr`** (auto-chained from `/jelly-run`; rarely operator-invoked directly): autonomously runs evaluator panel on the diff; composes a draft PR body from PLAN.md + diff + archetype template with confidence scores per field; grills operator only on low-confidence fields; final preview gates PR-open.
  - **`/jelly-pr-feedback <PR#>`** (operator-invoked after leaving review comments): auto-classifies comments (fixed-intent / ambiguous / stale / discussion-only); runs evaluator panel on diff + comments to propose remedies; surfaces aggregated remedies to operator; grills only on low-confidence remedies + truly ambiguous comments; dispatches implementer agents with fixed-intent tasks.
- **Turn-based feedback protocol**: explicit, visible turns — operator turn (review + comment) → substrate turn (auto-classify + evaluator pass) → agent turn (dispatch fixed-intent fixes) → loop back to operator. No scoreboards or mechanics; the structure IS the game.
- **Yield-to-operator constraint**: `/jelly-pr-feedback` is interactive-only; substrate NEVER auto-resolves ambiguous comments. Substrate does its pass first (auto-classify + evaluator panel) then yields to operator for final judgment.
- Plugin dependencies: `[commons, jelly-guild, jelly-loom]`.

**Depends on**: Phase 1.2, Phase 1.3.

**Risks**: `/goal` API may evolve; preamble shape may break under future Claude Code versions — mitigated via version-pinning notes + explicit `claude --version` check in preflight. Confidence-scoring derivation for draft-then-grill is heuristic; over-confident classifications could skip needed grills — mitigated by always showing final preview before PR opens. Evaluator panel cost adds 30-60s per PR-open + per feedback round; accepted as quality-for-cost trade-off; revisit if friction becomes real during M3 dogfood.

#### Phase 2.2 — `jelly` meta-bundle

**Goal**: Ship the meta-plugin that cascade-installs the three substrate plugins.

**Exit**:
- `plugins/jelly/` exists with zero-content `.claude-plugin/plugin.json` + marketplace entry.
- Marketplace dependencies cascade-install commons + jelly-guild + jelly-loom + jelly-run.
- `claude plugin install jelly` results in all four plugins enabled.

**Depends on**: Phase 2.1.

**Risks**: marketplace dependency-resolution edge cases (depth, ordering). Mitigated via empirical test on a fresh `~/.claude/` install during Phase 2.2's last task.

### M3 — Dogfood

#### Phase 3.1 — Dogfood against a real workstream

**Goal**: Exercise the full jelly substrate against a real (non-synthetic) workstream to surface integration issues.

**Exit**:
- One project at `projects/<date>-<dogfood-slug>/` (operator picks topic at phase start) runs end-to-end via jelly.
- Exercises every jelly verb at least once: `jelly research`, `jelly plan`, `jelly revise --target=research`, `jelly revise --target=plan`, `jelly adr`, `jelly run`, plus the "address feedback on #N" redirect.
- Retro document captures v1 lessons; ADR(s) added to `projects/adr-log/` for any architectural decisions surfaced during dogfood.

**Depends on**: Phase 2.2.

**Risks**: dogfood topic choice affects what surfaces. Mitigated by picking something with real substrate-stress (multi-phase, parallel PR review pressure, scope-shift mid-flight) rather than a trivial demo.

## Decisions log

- 2026-05-25 — **Plugin family shape**: four marketplace plugins (`jelly-guild`, `jelly-loom`, `jelly-run`, + `jelly` meta-bundle). Pattern matches `agent-loop-full`.
- 2026-05-25 — **Dependency posture**: parallel to existing `loom` + `guild` plugins; both families coexist indefinitely. Per-project choice of substrate.
- 2026-05-25 — **Manifest format**: TOML, single `manifest.toml` per project. Format chosen for PR-diff readability + comment support.
- 2026-05-25 — **Manifest shape**: identity + write-once `[config]` + write-once `[[phases]]` declarations + references. No per-PR mutation; richer than bare-minimum to support lead-agent lookup.
- 2026-05-25 — **PLAN.md hierarchy**: project > milestone > phase. Tasks NOT declared in PLAN.md — lead agent decomposes at `/goal`-time.
- 2026-05-25 — **Review gate**: PR-only (no pre-execution scope confirm). `/goal` runs, opens PR, exits; operator drives review-and-merge cadence.
- 2026-05-25 — **ADR location**: `projects/adr-log/` at workspace level (NOT per-project). Sequential global numbering: `NNNN-<short-slug>.md`.
- 2026-05-25 — **CLI verbs**: `jelly research`, `jelly plan`, `jelly revise --target=plan|research`, `jelly adr`. All shipped in `jelly-loom`.
- 2026-05-25 — **No events log**: jelly drops `events.jsonl`; audit trail derived from git + PRs + ADR log + RESEARCH.md history.
- 2026-05-25 — **Outcomes composability**: per `platform.claude.com/docs/en/managed-agents/define-outcomes`, Outcomes uses an **auto-provisioned grader** reading a rubric markdown document; it does NOT dispatch to custom subagents. jelly-guild specialists therefore ship as **paired files**: subagent body for Skill-callable dispatch via `/guild-validate`, and a rubric markdown for Outcomes-callable grading. Same content, two surfaces.
- 2026-05-25 — **Feedback round-trip trigger**: explicit operator re-invocation — `/jelly-run <slug> "address feedback on #N"` — after the operator leaves PR comments. No polling, no webhook. Operator drives cadence; the substrate stays out of background-process territory.
- 2026-05-25 — **Migration tooling**: out of scope. Existing loom-backed projects stay on loom; both families coexist indefinitely. jelly is opt-in at project-birth time. Explicit migration tooling lands only if dogfood (Phase 3.1) surfaces a real need.
- 2026-05-25 — **Agent decomposition axes**: three orthogonal axes — Personality (HOW the agent operates) + Domain (WHAT it knows) + Phase (WHEN in lifecycle). 5 + 5 + 4 = 14 mode files; N+M+P additive scaling avoids the N*M*P cross-product agent explosion.
- 2026-05-25 — **Composition mechanism**: reference-based. Dispatcher names the three modes in the brief; subagent reads its three mode files at run-time to construct identity. Subagents need Read in their `tools:` list.
- 2026-05-25 — **Subagent structural mapping**: personalities are the registered subagents (callable via `subagent_type=<personality>`); domains + phases are mode files under `plugins/jelly-guild/modes/` (read by subagents at dispatch time; not themselves registered). Rubrics pair with domains under `plugins/jelly-guild/rubrics/` for the Outcomes-callable surface.
- 2026-05-25 — **Personalities v1 (5 files)**: `skeptic`, `methodical`, `generative`, `pragmatist`, `synthesizer`. Two critical postures (sharp + slow), one generative, one decisional, one synthetic.
- 2026-05-25 — **Domains v1 (5 files)**: `composition`, `naming`, `abstraction`, `testing`, `a11y`. Architecture-shaped rather than language-shaped — portable across languages, language-specificity rides in the per-task brief.
- 2026-05-25 — **Phases v1 (4 files)**: `researcher`, `planner`, `implementer`, `reviewer`. Phase mode shapes whether the subagent reads, proposes, writes, or audits.
- 2026-05-25 — **Generators absorbed into the 3-axis model**: today's `generator-css-codemod`-shaped write-capable specialists become `(personality + domain + implementer-phase)` with Write + Edit declared in the implementer-phase mode file. No fourth axis.
- 2026-05-25 — **Whiteboard + evaluator collapse to dispatch patterns**: today's `whiteboard-*` agents = "multiple personalities dispatched in parallel against a shared artifact, research/planner phase, no-verdict mode". Today's `evaluator-*` agents = "single personality dispatched with reviewer phase + verdict-format output". The agent files don't carry whiteboard-ness or evaluator-ness; the dispatch pattern + phase mode does.
- 2026-05-25 — **PR-boundary skills inside `jelly-run`**: `/jelly-pr` (auto-chained after `/goal`) and `/jelly-pr-feedback` (operator-invoked) ship as skills inside the existing `jelly-run` plugin. No 5th plugin; the PR boundary IS part of orchestration.
- 2026-05-25 — **Chained PR-open flow**: `/jelly-run` invokes `/goal` without "open PR" in goal text; on `/goal` yield, auto-invokes `/jelly-pr` in the same session. `/jelly-pr` grills on shape, opens PR. Single operator invocation for the whole work-to-PR-open arc.
- 2026-05-25 — **Draft-then-grill at PR-open**: substrate composes full PR body from PLAN.md + diff + archetype template with per-field confidence scores. High-confidence fields fill silently; low-confidence fields fire grill-me. Final preview gates PR-open. Grill only on uncertainty — matches the substrate's load-bearing principle.
- 2026-05-25 — **Evaluator panel at PR-open**: panel runs autonomously after `/goal` yields, before draft body composition. Findings feed the preview as risk signals. Blocking findings surface options (address before opening / open with caveat in body / re-dispatch `/goal`); approved findings silently inform the preview.
- 2026-05-25 — **PR feedback flow (auto-classify → panel → grill)**: `/jelly-pr-feedback` auto-classifies comments (fixed-intent / ambiguous / stale / discussion-only); evaluator panel proposes remedies for diff + comments; aggregated remedies surface to operator; operator grills only on low-confidence remedies + truly ambiguous comments. Bias toward agent autonomy — operator yield is the FINAL judgment, not the first.
- 2026-05-25 — **Yield-to-operator on feedback**: `/jelly-pr-feedback` is interactive-only; substrate NEVER auto-resolves ambiguous comments. The yield point is the load-bearing principle of the PR-feedback substrate.
- 2026-05-25 — **Structural gamification**: turn-based protocol (operator turn / substrate turn / agent turn) makes the feedback loop's structure explicit and visible. No scoreboards, no quantification, no critique-the-operator. The grill IS the game.

## Open questions

- **Project-subdir CLAUDE.md propagation under `/goal`**: documented as inheritance behavior (Claude Code stacks CLAUDE.md from filesystem root down to cwd) + empirically confirmed for repo-root CLAUDE.md via the prior probe at `/Users/krambuhl/Sites/goal-substrate-probe/`, but NOT yet empirically probed for `projects/<slug>/CLAUDE.md` specifically. **Phase 1.1 closes this.** If invalidated, the project-scoped substrate-posture loses its primary propagation mechanism — fallback options exist (repo-root CLAUDE.md with explicit project gating; subagent-body-only posture; MCP-tool-only posture) but each is a substrate reshape.
