# Research notes — loom-linear-memory-boundary

Raw interview transcript and per-shift whiteboard contributions
for the research dossier at `RESEARCH.md`.

## Interview transcript

### Round 1 — Frame the topic

**User**: we just started using linear. im pretty sure a bunch of
the file saving we do with loom could be placed somewhere in linear
and avoid a bunch of mess in our git repository. what does the
landscape look like rn to do this? how are others saving project
memory? where? we are dealing with an influx of PRs so using git
seems awful and metadata would be perfect to put in linear in my
head. press me on this. help me understand.

**Assistant frame back** (paraphrase): you want to know whether
some of loom's git-resident artifacts (PLAN.md, RESEARCH.md,
events.jsonl, manifest.json, whiteboards, retros, check-ins)
should migrate to Linear now that Linear is the team
system-of-record — motivated by PR-volume pain — and you want a
survey of how other teams handle project memory. Slug proposal:
`loom-linear-memory-boundary` (the question is *where to draw the
line*, not whether to migrate wholesale).

**Hot take laid down before pressing**:

- Agent-readable, code-coupled context (`PLAN.md`, `RESEARCH.md`,
  whiteboards, retros, units) belongs with code: agents read with
  `Read`/`Grep`; diff-ability matters; moving to Linear means
  rebuilding the agent-readability layer via MCP/API.
- Status / event metadata (`events.jsonl`, `manifest.json` status,
  check-ins, PR linkage, owner) is Linear-shaped and probably
  should migrate.
- The PR-influx pain might be a *presentation* problem, not a
  storage problem — cheaper fix is `.gitattributes
  linguist-generated=true projects/**` + CODEOWNERS rules, before
  any Linear migration.

### Round 2 — Isolate the symptom

**Question asked**: which of these symptoms is hitting hardest right
now — diff-clutter, merge conflicts on shared loom files, projects/
sprawl, or two-places-for-status reconciliation?

**User answer**: "Loom files clutter code-PR diffs."

### Round 3 — Test whether Linear pull survives a diff fix

**Question asked**: if the diff-clutter were solved tomorrow via
.gitattributes + CODEOWNERS, would the pull toward Linear survive?
And if so, what's the independent reason?

**User answer**: "2 and 3 and 4 are more of my drive. i like the
idea of something which I can use to visualize and store all the
project management state. long term linear feels like the place to
orchestrate large agent swarms."

(Options 2/3/4 = non-engineering visibility / assignment + due
dates / cross-tool integration. Plus the long-term ambition for
Linear as agent-swarm orchestrator.)

### Round 4 — Resolve the swarm-orchestrator shape

**Question asked**: when you picture "Linear orchestrating an agent
swarm," which architecture is closest in your head — dashboard,
work queue, state machine, or human-swarm interface?

**User answer**: "2 and 3 are a good idea of my goals. i think long
term griot is just memory as it improves. but guild will continue
to be relevant."

(Options 2/3 = Linear as work queue + Linear coordinating
multi-agent state machine. Plus the system breakdown: griot as
memory layer, guild as panel substrate, Linear as orchestration.)

### Round 5 — Loom's future role

**Assistant flag** before asking: whiteboards and unit contracts
are read by agents *during* the next phase of work. Migrating them
to Linear means every execution loop becomes an API-call against
Linear instead of a `Read` on a local file — latency, auth, rate
limits, and break of the "everything is in this repo" property.
Flagged but not pressed; surfaced in RESEARCH.md risks.

**Question asked**: if Linear becomes the orchestration brain
long-term, what happens to loom — shrink to runtime files only;
die entirely with everything moving to Linear via MCP; continue as
a Linear adapter; or continue unchanged with Linear bolted on top?

**User answer**: "i think somewhere between 2 and 1. I think there
will continue to be value to reviewing/revising the actual PLAN.md
file in our PRs, we can probably store pretty much everything else
(research, whiteboards, units, retros) into linear documents."

### Interview convergence

The interview converged on a coherent architectural position
without firing any domain shifts under the
`/loom-research` skill's vocab-delta-plus-stated-cue rule. Each user
message refined the prior frame rather than reorienting away from
it. No per-shift whiteboards were composed.

## Whiteboard contributions

None — no domain shifts fired. See "Interview convergence" above.

## Landscape survey notes

Raw landscape-survey findings used to ground claims in `RESEARCH.md`:

### Linear's product surface

- **Project Documents**: Markdown editor (same as Issues), code
  snippets, inline comments, @mention references to issues and
  projects, templates, collaborative real-time editing. Versioning
  is limited: shows last-edit metadata and supports revert; no rich
  diff documented. Source: linear.app/docs/project-documents.
- **MCP server**: official, hosted at `https://mcp.linear.app/mcp`,
  OAuth 2.1 with dynamic client registration, Bearer-token auth
  supported. Native client support in Claude and Cursor. Tools
  cover issue/project/comment find-create-update; third-party
  documentation enumerates `list_documents` and `get_document` for
  Document reads. Sources: linear.app/docs/mcp; Composio's Linear
  toolkit docs.
- **AI Agent model**: agent delegation puts the human as primary
  assignee and the agent as contributor. Agents `@`-mentioned,
  delegated, comment, collaborate on documents. **Agents are NOT
  counted as billable seats on any plan.** Source:
  linear.app/docs/agents-in-linear.
- **API rate limits**: 3M complexity points/hour authenticated;
  10K cap per single query; complexity = property × 0.1 + object
  × 1 × pagination. Source: linear.app/developers/rate-limiting.
- **Strategic direction**: CEO declared "issue tracking is dead" in
  March 2026, signaling agent-first investment. Source: The
  Register coverage.

### OpenAI Symphony (Linear as agent control plane)

- Released ~April 2026. Architecture: agents poll Linear for
  assigned-and-Todo issues; status transitions Todo → In Progress
  → In Review → Done; agent posts PR-summary comment on PR open;
  GitHub webhook on merge transitions issue to Done.
- State distribution: Linear holds issue status, assignments,
  priorities, relationships, audit history. Agent workspace
  (ephemeral, built on Cursor SDK) holds working state. Git holds
  code + PRs.
- "500% PR increase" reported from OpenAI internal teams without
  baseline / size / duration methodology — treat as architectural
  validation, not as a multiplier to quote.
- Sources: MindStudio's Symphony Spec writeup; Help Net Security
  coverage.

### ADR community consensus on in-repo storage

- ThoughtWorks: ADRs in source control "so that there is a record
  that remains in sync with the code itself." Source: Martin
  Fowler bliki.
- Agent-era reasoning (2026 commentary): in-repo records get
  indexed by agent frameworks at planning time; Confluence /
  SharePoint / Notion records "will not be read at decision time."
  Source: Rickpollick — ADR comeback.

### Notion vs Linear

- Common pattern is "Notion for documentation, Linear for issue
  tracking." Forcing one tool into both roles produces compromises
  — Notion's tracking is weaker, Linear's docs are weaker. Sources:
  StackFYI, Nuclino comparisons.

### GitHub Projects

- Strongest free option for GitHub-native teams but PM features
  "still feel like additions to a code platform rather than
  first-class capabilities." No agent-first investment comparable
  to Linear's MCP + agent model. Source: Cloudy Unicorn comparison.
