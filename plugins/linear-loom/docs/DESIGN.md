# linear-loom — DESIGN

**Status**: skeleton. The 17 architectural decisions from the
2026-05-22 grill session are captured below; remaining detail
branches (tasks-generate parser convention, skills inventory, PR
state mapping, per-project config defaults) are open. This doc
will grow with subsequent grilling and Phase 1 execution.

**Related**:
- Plan: `projects/2026-05-21-linear-loom/PLAN.md`
- Research foundation: `projects/2026-05-21-linear-loom/RESEARCH.md`
- Round 1 whiteboard:
  `projects/2026-05-21-linear-loom/whiteboards/1-design-md-composition.md`

## Topic

linear-loom is a substrate plugin that adds a **personal CLI**
for working on projects whose state is mirrored between local
files (git) and a Linear workspace. The CLI does deterministic
mechanical writes; skills do conversational work. The CLI calls
the Linear GraphQL API directly; agents read Linear via MCP
during their work. Loom remains untouched; linear-loom is
additive.

## Decision register

These 17 decisions form the architectural spine of linear-loom.
Each is resolved unless explicitly marked open.

### 1. Skill architecture: new parallel skills

linear-loom ships its own slash commands (`/linear-loom-research`,
`/linear-loom-plan`, etc.) that mirror loom's structurally but
route to the linear-loom CLI. Loom skills are not touched. Some
duplication of skill body content; clean separation; each
substrate evolves independently.

### 2. Write path = CLI + Linear API; read path = MCP

`bin/linear-loom` calls Linear's GraphQL API directly (Bearer
token auth). Agents reading Linear state mid-work use Linear's
official MCP server. Honors the mechanical/loose split,
preserves substrate family coherence (every plugin has a `bin/`
CLI), keeps mechanical writes outside the conversational token
budget.

### 3. CLI verb surface mirrors loom 1:1

`linear-loom project create`, `linear-loom research`,
`linear-loom plan`, `linear-loom revise-plan`,
`linear-loom checkin write`, `linear-loom phase update`, etc.
Each verb does the full flow including any git writes (e.g.
`linear-loom plan` writes PLAN.md to git AND mirrors INTERVIEW
to Linear). New verbs unique to linear-loom: `linear-loom
configure`, `linear-loom tasks generate`, `linear-loom project
status` (Linear-side read).

### 4. On-disk project layout: same `projects/<slug>/` as loom

linear-loom projects use the same `projects/<slug>/` path. The
local contents are minimal: PLAN.md, `revisions/` (when that
substrate change ships), `adr/` (when ADR substrate ships), and
a `linear.json` marker file recording the Linear Project ID +
loom-project name + schema version. Presence of `linear.json`
(vs loom's `manifest.json`) signals which backend a slug uses.

### 5. Linear schema mapping

- **Linear Project** = umbrella container; can host one OR MORE
  loom projects (operator chooses granularity).
- **Loom project** = namespace prefix within its Linear Project;
  invariant that prefix is unique within parent.
- **Loom Phase** = **Linear Milestone**, title prefixed
  (`<loom-project> · Phase N — <name>`).
- **Loom Batch** = Linear Issue, title prefixed.
- **Loom Task** = Linear Sub-Issue under its Batch.
- **Linear Documents** = flat under the Linear Project, title
  prefixed.

### 6. Loom-project identity: title prefix + label

Every Milestone, Issue, Sub-Issue, and Document carries the
`<loom-project> · ` title prefix. Issues and Sub-Issues
additionally carry a `loom-project:<name>` Linear Label for
filtering. Documents don't support labels — discoverability is
title-prefix-only.

### 7. Check-ins: comments on the Sub-Issue

Each unit check-in becomes one comment on the Linear Sub-Issue
that represents the loom Task. Comment body is the rendered
check-in (markdown from the JSON record). The Issue's comment
thread becomes the unit's history.

### 8. No separate event log

Drop `events.jsonl` as a substrate concept in linear-loom.
Linear natively tracks Document creation/edit timestamps, Issue
creation, status changes, comment additions — these IS the
event trail. Stakeholder-visible status moments (phase-
completed, plan-committed) can optionally use Linear's Project
Updates feature but are not required substrate.

### 9. Auth: personal API key

CLI reads `LINEAR_API_KEY` from environment, with fallback to
`~/.linear-loom/config.json`. Operator generates a Linear
personal API key once in Linear settings. No OAuth flow in v1.
Rate limits documented as 1,500 req/hour or 250K complexity
points (confirm with Linear before any volume work).

### 10. Schema setup: proactive `linear-loom configure`

`linear-loom configure --linear-project=<id>` is a one-time
schema bootstrap per Linear Project. Idempotent. Creates the
required labels, custom fields (none in v1 — labels only),
Document templates. Re-runnable safely. Replaces any
"lazy-create" approach with explicit setup.

### 11. Status authority: Linear is source-of-truth

Phase status lives on Linear Milestone state. Task status lives
on Linear Sub-Issue workflow state. `linear.json` holds only
static binding info (Linear Project ID, loom-project name,
schema version) — no status fields. Skills read status via MCP
when needed. No local copy = no sync conflicts.

### 12. `linear-loom tasks generate` semantics

Manual trigger after PLAN.md PR merges. Idempotent — re-running
matches existing Linear items by title/identifier prefix and
updates instead of duplicating. Parses PLAN.md by a strict
subheading convention:
- `## Phase N — <name>` → Milestone
- `### Batch X — <name>` → Issue
- Task list items → Sub-Issue

**Open**: exact subheading shape, task-identifier convention,
how to reconcile renames/deletions. To be resolved in a future
grill round.

### 13. PLAN.md ↔ Linear cross-references: bidirectional

PLAN.md cites Linear URLs (CLI returns URLs after creating
Documents; skill writes them into PLAN.md drafts). Linear
Documents include a header line with the GitHub URL pointing to
the project's PLAN.md (`github.com/<org>/<repo>/tree/<branch>/
projects/<slug>/PLAN.md`). Either direction navigable in one
click.

### 14. Skill body: re-designed interview tailored to linear-loom

`/linear-loom-research` and `/linear-loom-plan` are NOT mirrors
of loom skills — they're re-designed interviews. They contain
additional Linear-side bootstrap questions (which Linear Project
to nest under; does this loom-project already exist) alongside
the substrate-shared interview content (grill-me, shift
detection, whiteboard, evaluator pass).

### 15. Failure handling: fail loudly + idempotent retry

CLI retries with exponential backoff on transient errors
(timeout, 429, 5xx). Idempotency at the substrate level (check
before create by title-prefix) prevents duplicates on retry.
Fatal errors (auth, schema missing, name conflict) fail loudly
with structured stderr JSON and non-zero exit. Operator handles
fatal errors by re-running with fixes.

### 16. Coexistence: per-slug substrate choice

loom-backed and linear-loom-backed projects can coexist in the
same repo, distinguished by marker file (`manifest.json` vs
`linear.json`). Per-slug independence; operators gradually
adopt linear-loom for new projects. Marker conflict (both files
present for the same slug) errors loudly. No conversion utility
in v1.

### 17. `/ev-loop-interactive` becomes backend-aware

Small touch to the `ev` plugin: `/ev-loop-interactive` peeks
the marker file at `projects/<slug>/` and routes substrate
calls to the correct CLI (`bin/loom` or `bin/linear-loom`).
Substrate contract: linear-loom CLI returns loom-compatible
JSON shapes for read verbs (`project read`, `events read`) so
the loop can route transparently. loom plugin untouched; only
ev plugin grows backend-awareness.

## Architecture sketch

### Skill flow (e.g. `/linear-loom-research`)

1. Operator invokes `/linear-loom-research <topic>` in Claude
   Code session.
2. Skill conducts the grill-me interview (LLM, conversational).
3. Skill writes RESEARCH.md + RESEARCH-NOTES.md to temp files.
4. Skill runs fact-check evaluator pass.
5. Skill invokes `bin/linear-loom research <slug>
   --research-file=... --notes-file=...`.
6. CLI:
   - Reads `projects/<slug>/linear.json` (or creates project on
     auto-adopt).
   - Uploads RESEARCH.md as Linear Document
     (`<loom-project> · Research: <topic>`).
   - Uploads RESEARCH-NOTES.md as Linear Document
     (`<loom-project> · Research interview: <topic>`).
   - Applies `loom-project:<name>` label, if Issues are also
     created (research itself creates only Documents, no
     Issues).
   - Returns Linear Document URLs on stdout (JSON).
7. Skill reports completion + URLs to operator.

### Skill flow (`/linear-loom-plan`)

Similar shape; final commit writes PLAN.md to git AND
INTERVIEW.md as a Linear Document.

### CLI flow (`linear-loom tasks generate <slug>`)

1. Reads `projects/<slug>/PLAN.md`.
2. Parses by subheading convention (open detail).
3. For each Phase: creates or updates a Linear Milestone
   (matched by title prefix).
4. For each Batch under a Phase: creates or updates a Linear
   Issue under that Milestone.
5. For each Task under a Batch: creates or updates a Linear
   Sub-Issue under that Issue.
6. Applies `loom-project:<name>` label to each Issue and
   Sub-Issue.
7. Returns generated/updated count + URLs.

### State authority

| Concept | Source of truth |
|---------|-----------------|
| PLAN.md content | git |
| Plan revisions | git |
| ADR log | git |
| RESEARCH dossier | Linear Document |
| Research interview | Linear Document |
| Whiteboards | Linear Documents (one per whiteboard) |
| Retros | Linear Documents (one per retro) |
| Session handoffs | Linear Documents (one per session) |
| Phase status | Linear Milestone state |
| Task status | Linear Sub-Issue workflow state |
| Loom-project name binding | `projects/<slug>/linear.json` |
| Linear Project ID | `projects/<slug>/linear.json` |
| Schema version | `projects/<slug>/linear.json` |
| Loom-project identity in Linear | title prefix + Issue label |
| Substrate event trail | Linear's native audit (no separate log) |

## Open questions (remaining branches to grill)

- **PLAN.md → tasks-generate parser convention**: exact subheading
  shape, task-identifier scheme, how to handle renames/deletions
  across re-runs (decision #12 detail).
- **Skills inventory**: which `/linear-loom-*` skills ship in v1
  vs deferred? Minimum viable: `/linear-loom-research`,
  `/linear-loom-plan`. Probably also `/linear-loom-revise-plan`,
  `/linear-loom-retro`. Defer: `/linear-loom-session` and
  others.
- **PR-related state mapping**: `pr-opened` and `pr-merged` events
  today flow through loom CLI's pr verbs. In linear-loom, the
  Linear-native GitHub integration handles most of this — but the
  exact CLI surface for `linear-loom pr open/update/merge` needs
  detail.
- **Per-loom-project config defaults**: does `~/.linear-loom/
  config.json` carry a default Linear Project ID across all
  loom-projects in a repo? Per-repo override? Per-project
  override flag?
- **Loop integration testability**: the substrate contract
  requiring linear-loom CLI to return loom-compatible JSON
  shapes for read verbs — what's the contract spec, how is it
  verified, what tests live in ev plugin vs linear-loom plugin?
- **Document templates content**: what's the default Research
  dossier template? Whiteboard? Retro? Optional but valuable
  for shape consistency.
- **Rate-limit reconciliation**: confirm whether
  personal-API-key rate limits (1,500 req/hour vs 250K
  complexity points) or OAuth's 3M complexity points is the
  actual constraint at our v1 volume.
