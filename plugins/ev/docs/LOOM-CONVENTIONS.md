# Loom conventions

Artifact shapes, event vocabulary, and slug-resolution semantics
for the loom project substrate. This is the file shape contract
between the loom CLI (`bin/loom` / `cli/loom.ts`) and any skill or
human that reads project state.

Companion docs: [`AGENT-CONVENTIONS.md`](./AGENT-CONVENTIONS.md)
for cross-skill rituals; [`SUBSTRATE-COMPOSITIONS.md`](./SUBSTRATE-COMPOSITIONS.md)
for named recipes that wrap the verbs documented here.

## Project layout

A loom project lives under `projects/<slug>/` with the following
shape. Every file documented below is described in its own
section further down.

```
projects/<slug>/
├── manifest.json              # project state, single source of truth
├── config.json                # per-project overrides
├── PLAN.md                    # the human-authored plan
├── INTERVIEW.md               # grill-me transcript from project birth
├── events.jsonl               # append-only event log
├── RECOVERY-STATUS.json       # present only when a sub-agent failed
│                              # mid-flight (see AGENT-CONVENTIONS.md)
├── checkins/
│   └── <branch>/
│       ├── 01.json            # numbered unit-of-work records
│       ├── 02.json
│       └── responses/
│           └── <id>.md        # responses to PR comments (optional)
├── sessions/
│   └── <YYYY-MM-DD>-<letter>.json   # session handoffs
├── retros/
│   ├── session-<phase>-<tier>.json
│   └── project.json
└── whiteboards/
    └── <phase>-<topic-slug>.md      # multi-perspective design artifacts
```

After a project is archived, the entire directory is moved to
`projects/archive/<slug>/`. See § Archive below.

## Branch naming

Phase execution branches (cut by `/ev-loop-interactive` and
`/ev-loop-confidence` at phase start) follow:

```
<project-name>.<phase-lazy-name>
```

- **`<project-name>`** — the project slug with the leading
  `YYYY-MM-DD-` date prefix stripped. The substrate-canonical project
  handle. Example: `2026-05-19-marketplace-portable-install` →
  `marketplace-portable-install`.
- **`<phase-lazy-name>`** — a short human handle for the phase,
  drawn from the phase's prose name in PLAN.md when one exists, or
  a one-word lazy descriptor when it doesn't (`migration`,
  `cleanup`, `bootstrap`, etc). Lowercase, hyphen-separated, no
  numeric prefix needed — the dot in the pattern is the boundary,
  not a number. If PLAN.md gives the phase no descriptive name, fall
  back to `phase-N` (e.g. `phase-2`) as a mechanical default.

Examples:

```
marketplace-portable-install.migration
loom-absorb-draft.phase-7-griot-writes
trout-sunset.bootstrap
my-project.cleanup
```

The dot separator (`.`) is intentional: it distinguishes phase
execution branches from loom-managed branches (which use prefix
verbs like `plan-`, `archive-`, `retro-`) and from arbitrary
non-loom branches. A reader seeing a dot in a branch name knows
the slug structure before the dot and the phase scope after.

**Loom-managed branches** keep their existing prefix conventions
and do NOT use this pattern:

- `plan-<project-name>` — branch holding the initial plan commit,
  cut by `/loom-plan`.
- `archive-<project-name>` — branch holding the archive commit,
  cut by `/loom-archive`.

This convention is enforced by the loops (where they cut
branches), not by the verbs. `bin/loom phase update --branch=...`
accepts any string the loop supplies.

## Schema versioning

All JSON artifacts declare a top-level `schema_version: 1`.
Evolution is **additive only**: new fields may appear in later
versions, but the existing fields' shapes are stable within a major
version. A breaking change bumps the major.

Schema version is **per artifact type** (manifest, checkin,
session, retro), not per project. A project may have a v1 manifest
alongside a v1 checkin alongside a v1 session — they all share
the marketplace's current substrate version.

The substrate **does not write schema migrations**: when the major
bumps, the loom CLI either reads both versions transparently or
fails loud with `unsupported-schema-version`. Migrations are
deferred until a real breaking change is justified.

## Artifact shapes

### `manifest.json`

The single source of truth for project state. **Write surface**:
`bin/loom project scaffold` (creates), `bin/loom project adopt`
(creates from existing layout), `bin/loom phase update` (mutates).
Single-writer-serialized per `projects/CONVENTIONS.md` § Category
3.

```json
{
  "schema_version": 1,
  "title": "<human-readable project title>",
  "slug": "<YYYY-MM-DD>-<topic-slug>",
  "started": "<YYYY-MM-DD>",
  "status": "active" | "archived",
  "current_branch": "<branch-name>" | null,
  "latest_checkin": "<checkin-number>" | null,
  "strategy": "<free-form>",
  "phases": [
    {
      "number": 1,
      "name": "<phase title>",
      "status": "not-started" | "in-progress" | "blocked" | "completed",
      "branch": "<branch-name>",
      "latest_checkin": "<NN>",
      "blocked_reason": "<text>",
      "pr": { "number": 42, "url": "...", "state": "open" | "merged" | "closed" }
    }
  ]
}
```

Field notes:

- **`status`**: `active` while the project is in flight;
  `archived` after `bin/loom project archive` runs.
- **`current_branch`**: top-level branch reference. Today, no CLI
  verb writes this field; phase-level `branch` on each phase entry
  carries the active branch. Field reserved for future use.
- **`latest_checkin`** (top-level and per-phase): tracks the most
  recent checkin number, set on every `checkin write`. May lag
  during in-flight execution.
- **`strategy`**: free-form string set at project birth. Common
  values: `"interactive"`, `"confidence"`. The router (`/ev-run`)
  reads this when no `worker_bindings` in `config.json` overrides.
- **`phases[]`**: ordered list. Phase numbers are 1-indexed and
  contiguous.

### `config.json`

Per-project overrides for substrate behavior. **Write surface**:
`bin/loom project scaffold` (creates with defaults); hand-edited
afterward.

```json
{
  "schema_version": 1,
  "base_branch": "main",
  "reviewers": [],
  "labels": [],
  "verification": [],
  "worker_bindings": {}
}
```

- **`base_branch`**: target branch for PRs.
- **`reviewers`**: GitHub usernames added to every PR opened by
  `bin/loom pr open` for this project.
- **`labels`**: GitHub labels applied to every PR.
- **`verification`**: commands run at phase close as part of the
  verification gate (currently unused; reserved for CI hookup).
- **`worker_bindings`**: `{ "default": "<loop-name>", "phase-1": "<loop-name>" }`
  overrides for which loop the router (`/ev-run`) dispatches to.

### `PLAN.md`

Human-authored project plan. **Write surface**: `bin/loom plan`
(creates initial) and `bin/loom revise-plan` (mutates).
Single-writer-serialized.

Document shape (loose, conventional):

- `# <Title>`
- `## Context`
- `## Scope` with `**In:**` / `**Out:**` / `**Deferred:**` bullet
  lists.
- `## Phases` containing one `### Phase N: <name>` per phase, each
  with deliverables described in prose and a `**Verifies:**`
  trailer.
- `## Dependencies`
- `## Verification`
- `## Risks`
- `## Open questions`
- `## Decisions`
- `## Revision log` (append-only inside the file; each revision
  adds a dated bullet at the bottom)

Phase headings are the load-bearing structure for the router and
loops: phase numbers and `## Phase N:` headings must match the
manifest's `phases[].number` and `phases[].name`.

### `INTERVIEW.md`

Grill-me transcript from project birth, kept as audit trail of why
the plan looks the way it does. **Write surface**: `bin/loom plan`
writes this once at project creation. Not subsequently mutated
(future: `bin/loom plan-amend` may extend it).

### `events.jsonl`

The project's event log. **Write surface**: every loom verb that
mutates state appends an event. **Append-only** per
`projects/CONVENTIONS.md` § Category 1.

Format: one JSON object per line, no trailing newlines inside
objects. Order is write-order. The substrate guarantees that
record boundaries are line-buffered so concurrent appends from
different processes don't corrupt each other (though they may
interleave).

Event vocabulary (current set):

| Event | Detail shape | Emitted by |
|-------|-------------|------------|
| `project-initialized` | `{}` | `bin/loom project scaffold` / `adopt` |
| `phase-started` | `{ phase, name }` | `bin/loom phase update --status=in-progress` |
| `phase-completed` | `{ phase }` | `bin/loom phase update --status=completed` |
| `phase-blocked` | `{ phase, reason }` | `bin/loom phase update --status=blocked --reason=...` |
| `phase-unblocked` | `{ phase }` | `bin/loom phase update --status=in-progress` (from blocked) |
| `checkin-created` | `{ number, branch }` | `bin/loom checkin write` |
| `session-saved` | `{ filename }` | `bin/loom session write` |
| `retro-written` | `{ type, phase?, tier? }` | `bin/loom retro write` |
| `archived` | `{ destination }` | `bin/loom project archive` |
| `note` | `{ text }` | `bin/loom events note` (free-form annotation) |

Phases 3-7 of the loom-absorb-draft project add ~25 more event
types in clusters (`research-*`, `plan-*`, `rpi-*`,
`auto-mode-*`). The vocabulary is **additive** — new event names
may appear, but existing consumers read events by name and ignore
unknown ones, so the schema does not need a version bump.

PR open/merged/updated state is **not** an event. It is derived on
demand from `gh` via `bin/loom pr discover`, which reads
`gh pr view <branch>` (number, url, and merge state) plus the checkin
marker in the PR body. `bin/loom pr open` and `bin/loom pr update` are
thin `gh` wrappers that record nothing — there are no `pr-opened`,
`pr-merged`, or `pr-updated` events.

### `checkins/<branch>/<NN>.json`

Per-unit-of-work immutable records. **Write surface**:
`bin/loom checkin write`. **Partitioned** per
`projects/CONVENTIONS.md` § Category 2.

Each checkin is the contract + execution + verdict for one unit
inside a phase. Shape:

```json
{
  "schema_version": 1,
  "number": "<NN>",
  "created": "<ISO 8601 timestamp>",
  "phase": { "number": 1, "name": "..." },
  "branch": "<branch>",
  "unit": "<one-line unit title>",
  "contract": {
    "goal": "...",
    "acceptance_criteria": ["..."],
    "rules_applied": ["..."],
    "disqualifiers": ["..."],
    "inputs": ["..."]
  },
  "execution": {
    "actions": ["..."],
    "files_touched": ["..."],
    "corrections": ["..."]
  },
  "scope": ["..."],
  "changes_since_previous": "...",
  "verdict": {
    "result": "approved" | "flagged",
    "reasons": ["..."]
  },
  "notes_for_pr": ["..."]
}
```

**Immutability rule**: once `bin/loom checkin write` writes a
`<NN>.json`, the file is read-only. Re-writing the same `<NN>`
fails with `checkin-already-exists`. Updates to a unit's history
go in subsequent checkins (e.g. a resolution checkin after a
flagged verdict).

Numbering is monotonic per branch: `01`, `02`, `03`, ... — kept
as strings (zero-padded to 2 digits in current usage but the
substrate stores whatever string the writer chose).

### `sessions/<YYYY-MM-DD>-<letter>.json`

Session handoffs — the human-readable summary of what happened in
a working session. **Write surface**: `bin/loom session write`.
**Partitioned** per `projects/CONVENTIONS.md` § Category 2 (the
date + letter pair is the partition).

Shape:

```json
{
  "schema_version": 1,
  "date": "<YYYY-MM-DD>",
  "letter": "a" | "b" | "c" | ...,
  "phases_touched": [1, 2],
  "checkins_written": ["01", "02"],
  "pr_activity": ["...free-form lines..."],
  "what_happened": ["..."],
  "open_threads": ["..."],
  "notes": ["..."]
}
```

The `letter` partitions multiple sessions on the same date (first
session = `a`, second = `b`, etc).

### `retros/<filename>.json`

Retrospectives — kept-well / improvement / process-change / follow-
up findings from a session or the whole project. **Write surface**:
`bin/loom retro write`. **Partitioned** by retro type and (for
session retros) phase/tier.

Two shapes — `session` and `project`:

```json
// session retro
{
  "schema_version": 1,
  "type": "session",
  "created": "<ISO 8601>",
  "phase": 1,
  "tier": 1,
  "findings": [
    { "category": "kept-well" | "improvement" | "process-change" | "follow-up",
      "description": "...",
      "evidence": "..." }
  ]
}

// project retro
{
  "schema_version": 1,
  "type": "project",
  "created": "<ISO 8601>",
  "findings": [ ... ]
}
```

Session retros land under `retros/session-<phase>-<tier>.json` (one
per phase/tier combination). The project retro lands at
`retros/project.json` and is the artifact `/loom-archive` writes
at project close.

### `whiteboards/<phase>-<topic-slug>.md`

Multi-perspective design artifacts produced by `/guild-whiteboard`.
**Write surface**: `bin/guild whiteboard {init,append}`. **Single-
writer-serialized** per `projects/CONVENTIONS.md` § Category 3
(the round-numbering invariant requires serial appends).

Shape:

```markdown
# Whiteboard: <topic>

## Round 1

### From <engineer-name-1>

<verbatim engineer body>

### From <engineer-name-2>

<verbatim engineer body>

## Round 2

...
```

Per the always-on whiteboard step in `/ev-loop-interactive` (and
the dedicated whiteboard spawns in `/loom-research`), each phase
typically has one round-1 whiteboard at `whiteboards/<phase>-<topic-slug>.md`.

### `RECOVERY-STATUS.json`

Present only when a sub-agent invocation failed mid-flight. See
[`AGENT-CONVENTIONS.md`](./AGENT-CONVENTIONS.md) § Recovery from
sub-agent failures for the full shape. Lives at the project root
alongside `manifest.json`.

## Slug-resolution semantics

The loom CLI's `resolveProject(slugOrPath)` helper resolves a
user-supplied slug or path into an absolute project directory.
The substrate convention:

A **slug** matches `SLUG_RE = /^\d{4}-\d{2}-\d{2}-[a-z0-9][a-z0-9-]*[a-z0-9]$/`,
i.e. `<YYYY-MM-DD>-<topic-slug>` where the topic-slug is
lowercase alphanumeric plus dashes.

A **date-less suffix** matches `DATELESS_RE = /^[a-z0-9][a-z0-9-]*[a-z0-9]$/`,
i.e. just the topic part (`loom-cli`) without the date prefix.

A **path** is anything starting with `/` (absolute) or `.`
(relative).

Resolution order:

1. **Path**: resolve immediately. Existence check; error on miss.
2. **Full slug**: scan `projects/<active>/` first, then
   `projects/archive/`. Error on miss.
3. **Date-less suffix**: scan active projects with
   `slug.endsWith(\`-<suffix>\`)`. Single match → resolve. Multiple
   matches → `slug-ambiguous` error with candidates list. No match
   → scan archive with same logic.

The active-first ordering means in-flight projects shadow archived
ones; only completed-and-archived projects need a full slug for
disambiguation if their topic suffix is reused.

## Archive

`bin/loom project archive` moves a project from `projects/<slug>/`
to `projects/archive/<slug>/` and sets the manifest's `status` to
`"archived"`. The move is a directory rename; no file content
changes. Subsequent slug resolution finds the project in the
archive scan.

Archived projects are still readable: `bin/loom project read
<slug>` works against archived slugs. Mutating verbs against
archived projects are not currently blocked at the CLI layer but
are out-of-bounds by convention.

The archive flow is one of the inputs to the griot pipeline: the
project retro lands in `learnings/retros/project/` (via
`/loom-archive`'s retro write), and the project's final state
contributes to the substrate-wide learnings rollup.

## Where loop bodies and skills come in

Skills like `/ev-loop-interactive`, `/ev-loop-confidence`,
`/ev-run`, and `/loom-archive` orchestrate the loom CLI's verbs
into higher-level workflows. They cite recipes from
[`SUBSTRATE-COMPOSITIONS.md`](./SUBSTRATE-COMPOSITIONS.md) (e.g.
`§ Checkin write`, `§ Phase update`) that document the CLI call
shape with idempotency story + failure modes + which loops use
them. Recipes are the orchestration layer between loop bodies and
this conventions doc's artifact shapes.
