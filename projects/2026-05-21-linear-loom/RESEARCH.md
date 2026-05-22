# Where should loom's project memory live? Linear, git, or both?

**Slug**: `2026-05-21-loom-linear-memory-boundary`
**Authored**: 2026-05-21
**Status**: research dossier, evidence-anchored

## Topic

This dossier surveys where engineering teams (and AI-agent operators)
store project memory in 2026, and uses that survey to inform a
boundary decision for loom: which loom artifacts should remain in
git, which should migrate to Linear, and what the migration shape
looks like across near-, mid-, and long-term horizons.

The question is motivated by an immediate symptom (loom files
clutter code-PR diffs) and a longer-term ambition (Linear as the
orchestration substrate for agent swarms). Each of these pulls on
the boundary differently, and the dossier separates them.

## User-stated frame

The interview (see `RESEARCH-NOTES.md`) converged on the following
position from the project owner:

- **Immediate pain**: loom files clutter code-PR diffs. Reviewers
  scroll past `events.jsonl`, `manifest.json`, check-ins, etc. to
  find the code change. (Source: user statement, this interview.)
- **Independent pulls toward Linear** (each survives even if
  diff-clutter is fixed): non-engineering visibility (PMs,
  designers, stakeholders); assignment / due dates / cross-project
  status; Linear's cross-tool integration surface (GitHub, Slack,
  calendar). (Source: user, this interview.)
- **Long-term ambition**: Linear as orchestration substrate for
  agent swarms — work queue (agents pull issues) + state machine
  (workflow states route to different agent roles). (Source: user,
  this interview.)
- **Proposed boundary**: `PLAN.md` stays in git (diff-able,
  code-coupled, PR-reviewable). Everything else — RESEARCH,
  whiteboards, units, retros, events, status — migrates to Linear
  documents/issues. Griot remains a separate memory layer; guild
  remains the panel/evaluator substrate. (Source: user, this
  interview.)

## Findings

### ADRs and decision records: in-repo wins by consensus

ThoughtWorks and the broader ADR community recommend storing
architecture decision records in source control, in the same
repository as the code they describe, "so that there is a record
that remains in sync with the code itself."
(Source: [bliki: Architecture Decision Record](https://martinfowler.com/bliki/ArchitectureDecisionRecord.html);
[adr.github.io](https://adr.github.io/).)

The 2026 commentary explicitly names an agent-era reason: "if you
put your ADRs in version control alongside your code, modern
agentic frameworks will index them, retrieve the relevant ones at
planning time, and use them as constraints in the plan they
generate. … if the records live in a Confluence space that nobody
opens, in a SharePoint folder, or in a Notion workspace separate
from the codebase, the records will not be read at decision time."
(Source: [Rickpollick — ADR comeback: anchoring agentic engineering teams](https://rickpollick.com/blog/adr-comeback-anchoring-agentic-engineering-teams).)

This finding is direct evidence supporting the user's instinct that
`PLAN.md` belongs in git. PLAN.md is functionally an
implementation-time decision record — agents read it during
execution, reviewers read it during code review, and its evolution
co-changes with the code. The same reasoning applies to whiteboard
artifacts that agents read mid-flow (unit contracts, in
particular).

### Linear Documents: what they actually support

Linear's Project Documents feature supports a Markdown editor
shared with Issues, code snippets, headers, inline comments,
@mention references to issues and projects, document templates,
and collaborative editing with real-time sync. Versioning is
limited: the UI shows when a document was last edited and by whom,
and supports "revert to a previous version" via a menu — but
detailed diff capabilities and a comprehensive edit-history
timeline are not documented in Linear's official docs.
(Source: [Linear Docs — Project documents](https://linear.app/docs/project-documents).)

This is sufficient for longer-form, write-once-read-many artifacts
(research dossiers, retros, whiteboard notes after the fact). It is
weaker than git for any artifact where the *evolution* matters as
much as the final state — i.e. anything you'd `git blame` to
understand a decision.

### Linear MCP server: agent read/write capabilities

Linear ships an official MCP server at `https://mcp.linear.app/mcp`
using OAuth 2.1 with dynamic client registration and Bearer-token
auth.
(Source: [Linear Docs — MCP server](https://linear.app/docs/mcp).)

The MCP server's tool surface, per the official docs, covers
"finding, creating, and updating objects in Linear like issues,
projects, and comments." Third-party documentation enumerates
additional tools available including `list_documents` and
`get_document`, meaning Documents are agent-readable.
(Sources: [Linear Docs — MCP server](https://linear.app/docs/mcp);
[Composio — Linear MCP Integration](https://composio.dev/toolkits/linear);
[lsmc-bio/linear-mcp](https://github.com/lsmc-bio/linear-mcp) for
fuller third-party MCP surfaces covering initiatives, milestones,
cycles, attachments, labels, and documents.)

Linear API rate limits are generous for normal use: authenticated
requests get 3,000,000 complexity points per hour, with a 10,000
point cap on any single query. Complexity is calculated per object
× pagination, so list queries with high pagination defaults can be
expensive.
(Source: [Linear Developers — Rate limiting](https://linear.app/developers/rate-limiting).)

For high-volume swarm use, this is a hypothesis worth pricing
before swarming: a polling loop with many agents querying issues
every few seconds could plausibly burn through points if queries
fetch large nested object graphs. The arithmetic is concrete given
the published limits — 10K points per single query × N agents × M
polls/hour against the 3M/hour ceiling — but the actual coefficient
depends on per-query complexity. Symphony's documented pattern
(one agent polling Linear for assigned issues with narrow,
filtered queries) is the precedent for staying inside the ceiling
by keeping queries narrow and infrequent.

### Linear agent model and pricing

Linear's official agent model treats AI agents as first-class
participants. When an issue is delegated to an agent, the human
user remains the primary assignee and the agent becomes a
contributor — accountability stays with the human, action moves to
the agent. Agents can be `@`-mentioned, delegated issues by
assignment, create/reply to comments, and "collaborate on projects
and documents."
(Source: [Linear Docs — AI Agents](https://linear.app/docs/agents-in-linear).)

Crucially for swarms: **agents are not counted as billable seats in
Linear** on any plan tier, including the free tier.
(Source: [Linear Docs — AI Agents](https://linear.app/docs/agents-in-linear).)
This removes the per-agent licensing cost that would otherwise make
swarms expensive in proportion to swarm size.

Webhook event coverage for agents (e.g. `AgentSessionEvent`) is
documented in third-party sources but not directly readable on the
Linear public docs page surveyed here.
(Source: [MindStudio — Issue Trackers as AI Agent Infrastructure](https://www.mindstudio.ai/blog/issue-trackers-ai-agent-infrastructure-jira-linear).)
The official developer docs at `linear.app/developers/agents`
likely cover this in detail; that page was not directly fetched in
this research pass and is an open follow-up.

Linear's CEO publicly declared "issue tracking is dead" in March
2026, framing the company's bet on agentic AI as a category shift,
not a feature add.
(Source: [The Register — Linear adopts agentic AI as CEO declares issue tracking dead](https://www.theregister.com/software/2026/03/26/linear-adopts-agentic-ai-as-ceo-declares-issue-tracking-dead/5227428).)
This is strategic posture, not capability — but it suggests Linear
is actively investing in agent infrastructure rather than treating
it as an integration afterthought.

### OpenAI Symphony: the closest prior art

OpenAI publicly released **Symphony** in April 2026 as an
orchestration layer that turns Linear into a control plane for
Codex coding agents. Each open Linear task gets assigned a
dedicated agent workspace; agents run continuously, pull work from
Linear in the same pattern a human engineer would, and engineers
review the output.
(Source: [Help Net Security — OpenAI releases Symphony to automate Codex work through Linear](https://www.helpnetsecurity.com/2026/04/28/openai-symphony-codex-orchestration-linear/).)

The reported architecture:

- **Polling loop**: queries Linear for issues where assignee is the
  agent account and status is "Todo", ordered by priority.
- **State transitions**: Todo → In Progress → In Review → Done.
- **PR creation**: agent posts a summary comment, transitions issue
  to In Review, awaits human review.
- **PR merge**: GitHub webhook fires, issue transitions to Done.
- **State distribution**: Linear holds issue status, assignments,
  priorities, labels, relationships, audit history. Per MindStudio's
  writeup, the agent workspace is ephemeral and built on the Cursor
  SDK with GitHub integration; it holds working state. Git holds
  the code and PRs.
(Source: [MindStudio — OpenAI's Symphony Spec](https://www.mindstudio.ai/blog/openai-symphony-spec-linear-agent-control-plane-500-percent-pr-increase).)

A "500% PR increase" claim is published as a result from "OpenAI's
internal teams" but lacks methodology — no team size, baseline, or
duration. Treat the magnitude as a claim, not as load-bearing
evidence; the *architectural pattern* is the durable finding, not
the multiplier.

The Symphony pattern is direct prior art for the user's stated
ambition. It validates the work-queue-plus-state-machine shape
(both of the user's selected options 2+3 in the swarm-shape
question) as a real architecture, not a hypothetical.

### Notion / Confluence: the cautionary tale

A common pattern is "Notion for documentation and planning, Linear
for issue tracking and sprint management."
(Source: [Notion vs Linear 2026 — StackFYI](https://www.stackfyi.com/blog/notion-vs-linear-2026).)
The agent-era critique of Notion-for-docs is identical to the ADR
critique: docs in a separate workspace are not read at decision
time. Forcing one tool into both roles produces compromises —
Notion's issue tracking is weaker than Linear, Linear's docs are
weaker than Notion.
(Source: [Notion vs Linear — Nuclino](https://www.nuclino.com/solutions/linear-vs-notion).)

For loom's case, this argues for: don't pick Notion. The
either/or is between **git** (code-coupled, agent-native via the
file system) and **Linear** (orchestration-coupled, agent-native
via MCP). A third tool would just add a third place to look.

### GitHub Projects: ruled out for this use case

GitHub Projects/Issues is the natural alternative to Linear given
the team already uses GitHub. The 2026 reviews are consistent: it's
the strongest free option for GitHub-native teams, but project
management features "still feel like additions to a code platform
rather than first-class capabilities," and cross-team planning
requires workarounds or external tools.
(Source: [Linear vs GitHub Issues — Cloudy Unicorn](https://www.cloudyunicorn.com/github-issues-vs-linear).)

Synthesis: for the user's "Linear as orchestration brain"
trajectory, this dossier judges GitHub Projects a step backward
relative to Linear — it lacks Linear's agent-first feature
investment and its MCP server. (The factual basis is the cited
review and Linear's own MCP and agent docs; the judgment is the
dossier's.)

## Synthesis: the proposed boundary, pressure-tested

The user's proposed split (`PLAN.md` in git, everything else in
Linear) holds up against the landscape, with caveats:

### Stays in git (high-confidence)

- **PLAN.md**: code-coupled, diff-able, PR-reviewable. Matches ADR
  in-repo consensus. Agents read it during execution; reviewers
  read it during PR review. Migration would lose `git blame` on
  plan changes and break the "plan and code land in the same PR"
  property.
- **Unit contracts** (`units/*.md`): agents read these mid-flow in
  `/ev-loop-interactive` and `/ev-loop-confidence`. Putting them in
  Linear adds an MCP round-trip per unit-of-work. The user's
  proposal puts these in Linear; this dossier flags the
  agent-read-loop ergonomics as a concrete tradeoff (not a
  blocker — Linear MCP supports it — but a latency / auth /
  rate-limit consideration at swarm scale).

### Migrates to Linear (high-confidence)

- **events.jsonl** and **status fields in manifest.json**: this is
  exactly Linear's shape. Linear has activity feeds, audit history,
  and state transitions natively. Loom's per-project events log
  duplicates a feature Linear already ships.
- **PR linkage and check-ins**: Linear has first-class GitHub
  integration and comment threads. Loom's per-unit check-in writes
  would mirror cleanly to Linear issue comments.
- **Cross-project status, assignment, due dates**: Linear's native
  domain. Loom does not model these at all today.

### Migrates to Linear Documents (medium-confidence)

- **RESEARCH.md** (this very dossier): plausibly fine as a Linear
  Document. Loses git-style version diff but gains
  non-engineering-stakeholder access. Linear MCP supports
  `get_document` so agents can still read it.
- **Retros**: Linear Documents are explicitly listed as a target
  for "specs, PRDs, and status updates" in Linear's docs
  (Source: [Linear Docs — Project documents](https://linear.app/docs/project-documents)).
  Retros fit this shape.
- **Whiteboards**: write-once-read-many artifacts. Linear Documents
  are adequate IF the agent-read pattern is the post-shift "read
  what the panel said" rather than mid-flow "compose a plan from
  whiteboard contributions." If the latter, see "unit contracts"
  caveat above.

### Open question: griot capture surface

The user noted griot remains the memory layer. Today, griot's
capture pathway writes to local files (`bin/griot capture`). If
events/retros migrate to Linear, griot's "where do I notice
something worth remembering" trigger needs to either (a) keep
reading local loom artifacts that haven't migrated, or (b) read
Linear via MCP. This is a follow-up to scope, not a blocker.

## Recommended migration sequence

Three phases, ordered by reversibility and value:

### Phase 1 — Diff presentation fix (this week)

Solve the immediate pain without touching storage. Add
`projects/** linguist-generated=true` to `.gitattributes` (collapses
loom files in GitHub PR diffs by default). Add a CODEOWNERS rule
for `projects/` so loom file changes don't auto-request review from
code reviewers. Convention: loom updates commit separately from
code changes when possible.
(Sources: [GitHub Docs — Customizing how changed files appear](https://docs.github.com/en/repositories/working-with-files/managing-files/customizing-how-changed-files-appear-on-github);
[GitHub Docs — About CODEOWNERS](https://docs.github.com/en/repositories/managing-your-repositories-settings-and-features/customizing-your-repository/about-code-owners).)

This is a 1-PR fix. It removes the loud symptom and **buys time to
sequence the deeper migration deliberately** rather than under
diff-clutter pressure.

### Phase 2 — Status / events / assignment to Linear (next quarter)

Migrate the metadata layer:

- Loom continues to write `events.jsonl` and `manifest.json` locally
  (no break to existing skills).
- Add a loom event hook: every event also POSTs to Linear via MCP
  (or via direct GraphQL). Issues are auto-created per project;
  events become Linear issue comments or activity entries.
- Cross-project status, assignment, due dates live in Linear from
  day one. Loom's `manifest.json` mirrors current status from
  Linear (Linear becomes source of truth for status).
- Loom's `bin/loom pr open` already creates a GitHub PR; extend it
  to link the PR to the corresponding Linear issue automatically.

This is the **Symphony architectural pattern** applied to your
existing substrate: Linear as the cross-project orchestration brain,
loom as the per-project working substrate.

### Phase 3 — Long-form artifacts to Linear Documents (mid-term)

Once Phase 2 is settled and loom→Linear sync is reliable, migrate:

- New research dossiers compose to both a temp file (for the
  existing `bin/loom research` flow) **and** a Linear Document.
- Retros land as Linear Documents on close.
- Whiteboard panel outputs land as Linear Documents per round.
- `PLAN.md` stays in git, unchanged.

Old projects' artifacts stay in `projects/archive/` — no
backfill required. Just stop creating *new* files of these types in
git going forward.

### Phase 4 (aspirational) — Linear as work queue

If/when the swarm grows past human supervision per task: implement
Symphony-style polling. Agents query Linear for assigned issues,
work, comment back, transition state. Loom becomes a per-session
working folder; Linear becomes the queue. This is the long arc.

## Risks and open questions

- **Linear API rate limits at swarm scale** (hypothesis, not
  observed today): 3M points/hour is generous, but a sloppy polling
  loop could plausibly burn it at swarm scale. Symphony's
  narrow-query pattern is the precedent for staying inside the
  ceiling — design queries narrowly (specific assignee + status +
  pagination limit) before going swarm-scale.
- **Linear Documents version history is weak**: revert-only, no
  rich diff. For research/retros this is fine. For anything
  PLAN.md-shaped (decision evolution matters), git remains
  superior — which is why PLAN.md staying in git is the right call.
- **Loom→Linear sync failure modes**: what happens when Linear is
  down or rate-limited mid-event-write? Loom needs a local-first
  write with eventual-consistent sync to Linear, not synchronous
  writes that block agent work.
- **Agent webhook detail**: Linear's `linear.app/developers/agents`
  page was not directly fetched in this research pass. The
  webhook event model (`AgentSessionEvent` shape, retry semantics,
  payload structure) needs verification before Phase 2 builds
  anything.
- **Griot capture surface across the boundary**: how does griot
  notice memo-worthy events when half the events are in Linear?
  Either griot reads Linear via MCP, or griot stays purely
  loom-local and only sees local events. Worth deciding before
  Phase 2.
- **"500% PR increase" is unverified**: don't quote it as
  justification. The Symphony *architecture* is the durable
  finding.

## Whiteboard contributions

No domain shifts fired during the interview — the conversation
converged within a single domain through successive refinements
(diff-clutter → independent pulls → swarm orchestration shape →
loom future boundary). Per the `/loom-research` skill's per-shift
whiteboard rule, no whiteboards were composed for this dossier.

The interview transcript is preserved in `RESEARCH-NOTES.md`.

## Sources

- [Linear Docs — Project documents](https://linear.app/docs/project-documents)
- [Linear Docs — MCP server](https://linear.app/docs/mcp)
- [Linear Docs — AI Agents](https://linear.app/docs/agents-in-linear)
- [Linear Developers — Rate limiting](https://linear.app/developers/rate-limiting)
- [Linear changelog — Agent MCP support (April 2026)](https://linear.app/changelog/2026-04-23-linear-agent-mcp-support)
- [Help Net Security — OpenAI releases Symphony](https://www.helpnetsecurity.com/2026/04/28/openai-symphony-codex-orchestration-linear/)
- [MindStudio — OpenAI's Symphony Spec on Linear](https://www.mindstudio.ai/blog/openai-symphony-spec-linear-agent-control-plane-500-percent-pr-increase)
- [MindStudio — Issue Trackers as AI Agent Infrastructure](https://www.mindstudio.ai/blog/issue-trackers-ai-agent-infrastructure-jira-linear)
- [The Register — Linear adopts agentic AI](https://www.theregister.com/software/2026/03/26/linear-adopts-agentic-ai-as-ceo-declares-issue-tracking-dead/5227428)
- [Composio — Linear MCP Integration for AI Agents](https://composio.dev/toolkits/linear)
- [lsmc-bio/linear-mcp — third-party MCP server with fuller surface](https://github.com/lsmc-bio/linear-mcp)
- [Martin Fowler bliki — Architecture Decision Record](https://martinfowler.com/bliki/ArchitectureDecisionRecord.html)
- [adr.github.io — Architectural Decision Records](https://adr.github.io/)
- [Rickpollick — ADR comeback: anchoring agentic engineering teams](https://rickpollick.com/blog/adr-comeback-anchoring-agentic-engineering-teams)
- [Notion vs Linear 2026 — StackFYI](https://www.stackfyi.com/blog/notion-vs-linear-2026)
- [Notion vs Linear — Nuclino](https://www.nuclino.com/solutions/linear-vs-notion)
- [Linear vs GitHub Issues — Cloudy Unicorn](https://www.cloudyunicorn.com/github-issues-vs-linear)
- [GitHub Docs — Customizing how changed files appear](https://docs.github.com/en/repositories/working-with-files/managing-files/customizing-how-changed-files-appear-on-github)
- [GitHub Docs — About CODEOWNERS](https://docs.github.com/en/repositories/managing-your-repositories-settings-and-features/customizing-your-repository/about-code-owners)
