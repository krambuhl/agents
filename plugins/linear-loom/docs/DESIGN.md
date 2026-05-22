# linear-loom — DESIGN

**Status**: complete (Phase 1, Round 2). The architectural spine
is now 20 resolved decisions; the tasks-generate parser branch is
expanded with 7 sub-decisions in § 12. The earlier "Open
questions" section is folded back into the resolved decisions.
This doc will continue to evolve as Phase 2+ execution surfaces
new decisions, but no branches are currently flagged as open.

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

These 20 decisions form the architectural spine of linear-loom.
All are resolved; decision § 12 (tasks-generate parser) carries 7
nested sub-decisions from the Round 2 grill.

### 1. Skill architecture: minimal operator-direct surface

linear-loom ships exactly three slash commands in v1:
`/linear-loom-research`, `/linear-loom-plan`, and
`/linear-loom-archive` — the three operations the operator
invokes **directly** at project boundaries. Everything else that
might have been a skill (revise-plan, retro, session, checkin,
tasks-generate, configure) is CLI-only; loops that need to
compose those operations shell out to `bin/linear-loom <verb>`
rather than invoking an intermediate skill. Loom skills are not
touched. The "ambient skills are noise" principle: a skill that
exists only to be composed-by-a-loop is cognitive overhead in
the available-skills list and tempts operators into a half-shaped
direct-invocation UX.

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

**Per-slug-only resolution**: the marker file is the **sole**
source of truth for which Linear Project a loom-project nests
under. There is no global default, no per-repo default, and no
implicit inheritance. `linear-loom project create` requires
`--linear-project=<id>` explicitly on first invocation; the ID
is then persisted in `linear.json` and never re-resolved. The
operator who works against multiple Linear Projects passes the
flag every time they create a new project; the operator who
always uses the same Linear Project pays a small ceremony cost
in exchange for the certainty that the marker file is
authoritative.

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

**Rate-limit posture**: personal API key gives 1,500 req/hour
and 250K complexity points/hour. Estimated v1 traffic per
operator gesture (sized for a 10-phase project): project create
~5 calls; research upload ~3; plan upload + tasks-generate
~30-100; checkin write ~2; retro upload ~2; archive ~5. Daily
ceiling is wildly higher than expected v1 daily volume (well
under 200 requests for a typical day of operator work). No
budget tracker, no preemptive OAuth migration — Decision § 15
covers retry-on-429 with exponential backoff and that's the
extent of rate-limit handling. If a future v2 operator ever
flirts with the ceiling, OAuth migration is a Phase 7+ problem.

**Resolution scope**: `~/.linear-loom/config.json` carries
**auth only** (`api_key`). It does NOT carry a default Linear
Project ID, default loom-project name, or any other ambient
state. See § 4 for the per-slug marker-file resolution model.

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
matches existing Linear items by composed stable ID and updates
in place instead of duplicating. The parser convention is fully
specified below in seven sub-decisions; together they answer
"what does PLAN.md need to look like for tasks-generate to work,
and what happens when PLAN.md drifts."

#### 12.1. Subheading scheme: `## Phases` wrapper + ID-bracketed children

The parser recognizes a single `## Phases` section in PLAN.md.
Inside that section:

- `### Phase N [<short-name-N>] — <prose>` → Linear Milestone
- `#### Batch N [<short-name-N>] — <prose>` → Linear Issue
- `- [<short-name-N>] <prose>` → Linear Sub-Issue

Other top-level `##` sections in PLAN.md (Context, Scope, Risks,
Decisions log, etc.) are ignored — only the `## Phases` block
contributes Linear writes. Phase headings live at `###` (one
level deeper than `## Phases`), Batches at `####`, Tasks as bullet
list items. Batches are required — Tasks always hang under a
Batch, never directly under a Phase.

**Example**:

```markdown
## Phases

### Phase 1 [design-1] — DESIGN.md (concrete)

Goal prose...

#### Batch 1 [skeleton-1] — Write skeleton

- [decisions-1] Decision register
- [sketch-1] Architecture sketch
- [open-q-1] Open questions

#### Batch 2 [grill-1] — Grill open branches

- [parser-1] tasks-generate parser convention
- [skills-1] skills inventory

### Phase 2 [scaffold-1] — Plugin scaffolding

#### Batch 1 [bootstrap-1] — Bootstrap files

- [plugin-json-1] plugin.json
- [bin-1] bin/linear-loom entrypoint
```

#### 12.2. ID scope: scoped to parent

Each `[<short-name-N>]` ID is unique only within its immediate
parent. `[skeleton-1]` under Phase 1 is independent of any
`[skeleton-1]` under Phase 2; `[decisions-1]` under one Batch is
independent of `[decisions-1]` under another.

The Linear-side **stable key** for any node is the composed
path: `<phase-id>.<batch-id>.<task-id>` (or `<phase-id>.<batch-id>`
for Batches; `<phase-id>` for Phases). The parser computes the
composed key on every parse and uses it to match existing Linear
items. A Sub-Issue at composed key
`design-1.skeleton-1.decisions-1` is the canonical identity that
survives re-runs and cross-references.

#### 12.3. Reconciliation policy: PLAN.md is authoritative

On every `tasks generate` run the parser computes a full diff
between PLAN.md and Linear (matched by composed stable key) and
applies it in this shape:

- **New ID in PLAN.md** → create the corresponding Milestone /
  Issue / Sub-Issue. Initialize description with the
  PLAN.md-anchor header (see § 13) and the prose body.
- **Updated prose under existing ID** → update title and body in
  Linear (see § 12.5 for the exact synced surface).
- **Vanished ID** → archive / cancel the corresponding Linear
  item (see § 12.4 for the active-work safety hatch).
- **Reordered nodes under unchanged parents** → no Linear change.
  Order is incidental; Linear's UI provides ordering via Milestone
  state and Sub-Issue sub-ordering, which are operator-managed.

The plan is the spec; Linear mirrors it. Plan revisions are
expected to be the **common case** (the operator articulated this
explicitly during the Round 2 grill), so the reconciliation is
optimised for them rather than for a one-shot create.

#### 12.4. In-flight safety: `--prune` required for archive of active work

The "vanished ID → archive" branch of § 12.3 is gated by
"in-flight work" detection. Before archiving a Linear item, the
parser checks for any of these signs of active work:

- linked PR currently open;
- comments newer than 7 days;
- workflow state other than `Backlog` or `Todo`.

If any of those are present, the CLI refuses to archive by default
and prints the list of affected IDs with the in-flight signal that
blocked each. The operator either restores the ID to PLAN.md (the
plan revision was a mistake) or re-runs with
`linear-loom tasks generate --prune` to acknowledge "yes, archive
these on purpose." Default-safe; one extra step on intentional
drops.

Vanished IDs with **no** signs of in-flight work are archived
silently (they're trivially-recoverable Backlog items the
operator chose to drop before any work happened).

#### 12.5. Sync surface: title + body only; Linear-side metadata untouched

On both create and update, the parser writes:

- **Title** (Milestone / Issue / Sub-Issue) from the heading prose.
- **Description / Body** from any prose under the bullet plus the
  PLAN.md-anchor header line (per § 13).

And **enforces** (idempotently):

- The `loom-project:<name>` Linear Label on Issues and Sub-Issues.
- The parent (Milestone for Issues; Issue for Sub-Issues), matched
  by composed-ID lookup.

The parser leaves these **alone**, on both first create and
subsequent updates:

- Workflow state (operator drives this from the Linear UI).
- Assignee.
- Labels other than the enforced `loom-project:<name>` identity
  label.
- Estimate, priority, dates.
- Comments.

PLAN.md describes "what the task is"; Linear-side metadata is
operator-managed. The parser never mutates state-of-work fields.

#### 12.6. Rename detection: explicit `was=<old-id>` annotation

When the operator wants to rename an ID, they annotate the new
heading:

```markdown
- [architecture-1 was=sketch-1] Architecture sketch
```

The parser detects the `was=` annotation and re-keys the existing
Linear record from the old composed key to the new one. Title /
body sync as usual; comments, PR links, workflow state, and
history are preserved on the same Linear record.

Without the annotation, a disappearing-and-reappearing ID under
the same parent is treated as an **independent** delete-and-create
pair. § 12.4's in-flight safety then kicks in to protect any work
on the disappearing ID, so the worst case is two Sub-Issues
visible in Linear (the operator sees the duplication and adds the
`was=` to fix). No fuzzy similarity-based guessing.

#### 12.7. Idempotency on transient failure

Every Linear API write is keyed by composed stable ID. If a
`tasks generate` run partially fails (network blip mid-write),
the next run picks up exactly where the previous one stopped:
items that committed last time match on stable ID and update
in-place; items that didn't commit are created. § 15's
exponential-backoff retry handles 5xx and 429 inline within a
single run. No special crash-recovery state; the diff
re-computed from PLAN.md + Linear is the source of truth.

### 13. PLAN.md ↔ Linear cross-references: bidirectional

PLAN.md cites Linear URLs (CLI returns URLs after creating
Documents; skill writes them into PLAN.md drafts). Every Linear
Document gets a standard 3-line header prepended by the CLI
before upload:

```markdown
**Project**: <loom-project-name> (loom-project: <name>)
**Source**: github.com/<org>/<repo>/tree/<branch>/projects/<slug>/<file>
**Last synced**: <ISO-8601 timestamp>

---

<verbatim body of the source file>
```

The header is mechanical and identical across every uploaded
Document type (RESEARCH.md, RESEARCH-NOTES.md, INTERVIEW.md,
whiteboards, retros). It gives the operator (and any Linear
viewer) immediate context: which loom-project the Document
belongs to, where the source file lives in git if they want to
edit alongside, and when this Document was last synced.

Sub-Issues get the analogous anchor inside their Linear
description (the `**Source**:` line points at the PLAN.md
section that defined the Task). Either direction is navigable in
one click.

No auto-generated table-of-contents in v1; the v1 dogfood loop
will surface whether that's missing before committing to the
extra parser logic.

### 14. Skill body: re-designed interview tailored to linear-loom

`/linear-loom-research`, `/linear-loom-plan`, and
`/linear-loom-archive` are NOT line-by-line mirrors of their
loom counterparts — they're re-designed interviews. They contain
additional Linear-side bootstrap questions (which Linear Project
to nest under; does this loom-project already exist within that
Linear Project; what's the loom-project's namespace prefix)
alongside the substrate-shared interview content (grill-me,
shift detection, whiteboard, evaluator pass). On commit, the
skills shell out to the CLI for the actual Linear API writes
(`bin/linear-loom research`, `bin/linear-loom plan`,
`bin/linear-loom archive`), preserving the conversational /
mechanical split.

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

### 18. Substrate-contract specification: JSON Schema + per-plugin golden fixtures

The contract that lets `/ev-loop-interactive` route to either
backend transparently is specified as JSON Schema files in a
shared location:

```
plugins/loom/contracts/
  project-read.schema.json
  events-read.schema.json
  session-list.schema.json
```

loom authored the shape first, so the schema lives in the loom
plugin's tree; linear-loom imports it as a relative-path
dependency. Both `bin/loom` and `bin/linear-loom` validate their
own read-verb outputs against the schema in their own test
suites with golden-fixture cases:

```
plugins/loom/cli/__tests__/output-contract.test.ts
plugins/linear-loom/cli/__tests__/output-contract.test.ts
```

The `ev` plugin trusts the contract without itself running a
cross-CLI integration test. This isolates the dependency: each
CLI is responsible for its own conformance; the ev plugin only
needs to read the schema (or a TypeScript projection of it) to
type its parsed-output handling. No sandbox Linear workspace
required for CI; no slow integration tests; tooling failures
surface at the source rather than at the consumer.

### 19. PR linkage: lean on Linear's native GitHub integration

linear-loom does NOT mirror loom's `pr open / update / merged`
verbs. Linear's native GitHub integration — configured once per
workspace, outside this project's scope — detects PR mentions of
Linear Issue IDs in commit messages and PR bodies and auto-links
the PR to the corresponding Issue or Sub-Issue. On PR merge,
Linear's native integration also auto-transitions the linked
Issue to the workspace's mapped "merged" state.

linear-loom's job is simply to ensure that any agent opening a
PR for a linear-loom-backed unit includes the Linear Issue ID
in the PR body. The conventional shape:

```markdown
## Summary

...

Linear: LIN-42 (Sub-Issue [<composed-stable-key>])
```

One less surface to maintain; relies on the operator's workspace
config (documented in `plugins/linear-loom/README.md` as a
prerequisite, alongside `LINEAR_API_KEY`).

### 20. Rate-limit handling: personal-API-key budget is fine

v1 expected daily traffic (well under 200 calls/day for typical
operator gestures) sits two orders of magnitude below the
personal-API-key ceiling (1,500 req/hour, 250K complexity
points/hour). The CLI does not track rate-limit budget locally,
does not warn on approaching limits, and does not implement
budget-driven throttling. § 15's retry-with-exponential-backoff
handles the rare transient 429. OAuth migration is **not** part
of v1; if a future v2 operator's traffic profile ever flirts
with the personal-API-key ceiling, OAuth migration is a Phase 7+
extension that can land additively without breaking the v1
auth contract.

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

## Open questions

None at the architectural-spine level. The seven branches flagged
as open after Round 1 were resolved in the 2026-05-22 Round 2
grill and folded back into the decision register:

| Round 1 open question | Now resolved in |
|------------------------|-----------------|
| Tasks-generate parser convention | § 12 (7 sub-decisions) |
| Skills inventory | § 1, § 14 |
| PR-related state mapping | § 19 |
| Per-loom-project config defaults | § 4, § 9 |
| Loop integration testability | § 18 |
| Document templates content | § 13 |
| Rate-limit reconciliation | § 9, § 20 |

New open questions will inevitably surface during Phase 2
(scaffolding) and Phase 3+ (implementation). Append them to this
section as they emerge; resolve them in subsequent grill rounds
or as the dogfood loop forces a decision.
