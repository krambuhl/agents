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
├── manifest.toml              # all machine state: [meta] + [config] +
│                              # [[phases]] + [[events]] + [[checkins]] +
│                              # [[sessions]] + [[revisions]] in one
│                              # sectioned TOML file
├── PLAN.md                    # the human-authored plan
├── INTERVIEW.md               # grill-me transcript from project birth
├── RECOVERY-STATUS.json       # present only when a sub-agent failed
│                              # mid-flight (see AGENT-CONVENTIONS.md)
├── retros/
│   ├── session-<phase>-<tier>.json
│   └── project.json
├── plans/
│   └── <phase>-<topic-slug>.md      # multi-perspective design artifacts
└── responses/                 # PR-comment response markdowns; created
    └── <branch>/              #   on-demand by `bin/loom pr respond`
        └── <id>.md            #   when an `address feedback on #N`
                               #   redirect triages comments
```

After a project is archived, the entire directory is moved to
`projects/archive/<slug>/`. See § Archive below.

**Pre-M1 layout**: prior to Phase 2 of substrate-consolidation,
project state lived in five separate files (`manifest.json`,
`config.json`, `events.jsonl`, `checkins/<branch>/<NN>.json`,
`sessions/<YYYY-MM-DD>-<letter>.json`). Phase 2 collapsed them into
one sectioned `manifest.toml`. The `checkins/` directory is gone
entirely; `bin/loom pr respond` writes to `responses/<branch>/<id>.md`
(see the layout tree above). PR-comment response markdowns are the
one residual of the pre-M1 per-file state model, but they live
alongside `manifest.toml` rather than nested inside the (deleted)
`checkins/` tree.

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

All loom-managed artifacts declare a top-level `schema_version: 1`
(`manifest.toml` carries it once in `[meta]`; retros and
`RECOVERY-STATUS.json` carry it at the root of their JSON file).
Evolution is **additive only**: new fields may appear in later
versions, but the existing fields' shapes are stable within a major
version. A breaking change bumps the major.

Schema version is **per artifact type** (manifest, retro,
recovery-status), not per project. A project may have a v1 manifest
alongside v1 retros — they all share the marketplace's current
substrate version. Inside `manifest.toml`, each `[[checkins]]` /
`[[sessions]]` / `[[revisions]]` entry also carries its own
`schema_version` field for forward-compat with per-record migrations.

The substrate **does not write schema migrations**: when the major
bumps, the loom CLI either reads both versions transparently or
fails loud with `unsupported-schema-version`. Migrations are
deferred until a real breaking change is justified.

## Artifact shapes

### `manifest.toml`

The consolidated source of truth for project state. Phase 2 of
substrate-consolidation folded `manifest.json` + `config.json` +
`events.jsonl` + `checkins/<branch>/<NN>.json` +
`sessions/<YYYY-MM-DD>-<letter>.json` into one sectioned TOML file.
Identity scalars and mutable status live in the `[meta]` and
`[config]` tables; per-record histories (phases, events, checkins,
sessions, revisions, retros, replies, findings) live in `[[<name>]]`
array-of-table sections.

**Write surface**: every loom verb that mutates state writes the
whole manifest under atomic temp + rename; append-only sections
(`[[events]]`, `[[checkins]]`, `[[sessions]]`, `[[revisions]]`,
`[[retros]]`, `[[replies]]`, `[[findings]]`) are only appended to by
CLI discipline. Single-writer-serialized per
`projects/CONVENTIONS.md` § Category 3. The hand-rolled, zero-dep
TOML parser (`plugins/loom/cli/lib/toml.ts`) encodes the nested
record bodies (`Checkin.contract`, `Event.detail`, etc) as inline
tables so the value tree round-trips.

The sub-sections below describe each table in the order they appear
in the file. A field marked nullable is encoded by **key omission**
— TOML has no null literal — and `readManifest` reconstructs the
typed shape from absence.

#### `[meta]`

The project's identity scalars and mutable top-level status. Set at
project birth by `bin/loom project scaffold` / `adopt`; mutated in
place by phase/state verbs.

```toml
[meta]
schema_version = 1
title = "<human-readable project title>"
slug = "<YYYY-MM-DD>-<topic-slug>"
started = "<YYYY-MM-DD>"
status = "active"            # "active" | "archived"
current_branch = "<branch>"  # nullable; encoded by absence
latest_checkin = "<NN>"      # nullable; encoded by absence
strategy = "interactive"     # free-form ("interactive", "confidence", ...)
```

Field notes:

- **`schema_version`**: lives here once for the whole file.
  `[config]` does not repeat it (`readManifest` synthesizes
  `Config.schema_version` from `[meta]`).
- **`status`**: `active` while the project is in flight; `archived`
  after `bin/loom project archive` runs.
- **`current_branch`** / **`latest_checkin`**: nullable scalars
  encoded by key omission.
- **`strategy`**: free-form. The router (`/ev-run`) reads this when
  `[config].worker_bindings` doesn't override.

#### `[config]`

Per-project overrides for substrate behavior. Set at project birth
with defaults; hand-edited afterward.

```toml
[config]
base_branch = "main"
reviewers = []
labels = []
verification = []
worker_bindings = {}
```

- **`base_branch`**: target branch for PRs.
- **`reviewers`**: GitHub usernames added to every PR opened by
  `bin/loom pr open` for this project.
- **`labels`**: GitHub labels applied to every PR.
- **`verification`**: commands run at phase close as part of the
  verification gate (currently unused; reserved for CI hookup).
- **`worker_bindings`**: `{ default = "<loop>", "phase-1" = "<loop>" }`
  overrides for which loop the router (`/ev-run`) dispatches to.

#### `[[phases]]`

Ordered list of phases. Phase numbers are 1-indexed and contiguous.
**Write surface**: `bin/loom phase update`.

```toml
[[phases]]
number = 1
name = "<phase title>"
status = "in-progress"       # not-started | in-progress | blocked | completed
branch = "<branch-name>"     # the branch carrying this phase's work
latest_checkin = "<NN>"      # most recent checkin number for this phase
blocked_reason = "<text>"    # only when status = blocked
```

PR open/merged/updated state is **not** carried on the phase entry
(removed in Phase 6 U2 of substrate-consolidation). It is derived on
demand from `gh` via `bin/loom pr discover` — see `[[events]]` below
for the broader retirement of pr-event vocabulary.

#### `[[events]]`

The project's append-only event log. Order is write-order; each
write goes through an atomic temp + rename of the whole manifest,
and the `[[events]]` section is only ever appended to by CLI
discipline.

```toml
[[events]]
at = "<ISO 8601 timestamp>"
event = "<event-name>"
detail = { ... }              # event-specific inline table
```

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
`pr-merged`, or `pr-updated` events. (Retired in Phase 6 U1 of
substrate-consolidation, commit-discipline option (d): state rides
the feature commit; derive PR state on demand.)

The PR-activity **subscription** registered at open (§ Compose PR,
"After open") does not reopen this. A subscription is a harness
*wake* mechanism — it lets a parked session resume when a review,
CI result, or merge lands — not a substrate event or cached state.
When woken, the substrate still derives the live PR state from `gh`
via `bin/loom pr discover`; the subscription decides *when* to look,
never *what is true*. So the no-`pr-*`-event invariant holds.

#### `[[checkins]]`

Per-unit-of-work immutable records. **Write surface**:
`bin/loom checkin write`. Each entry is the contract + execution +
verdict for one unit inside a phase, encoded as an array-of-table
entry whose nested `contract` / `execution` / `verdict` bodies are
inline tables (the encoding loom's TOML parser uses to round-trip
nested data).

```toml
[[checkins]]
schema_version = 1
number = "<NN>"
created = "<ISO 8601 timestamp>"
phase = { number = 1, name = "..." }
branch = "<branch>"
unit = "<one-line unit title>"
contract = { goal = "...", acceptance_criteria = [...], rules_applied = [...], disqualifiers = [...], inputs = [...] }
execution = { actions = [...], files_touched = [...], corrections = [...] }
scope = [...]
changes_since_previous = "..."
verdict = { result = "approved", reasons = [...] }   # result: "approved" | "flagged"
notes_for_pr = [...]
```

**Immutability rule**: once `bin/loom checkin write` appends a
checkin, the entry is read-only. Re-writing the same
`(branch, number)` pair fails with `checkin-already-exists`. Updates
to a unit's history go in subsequent checkins (e.g. a resolution
checkin after a flagged verdict).

Numbering is monotonic per branch: `01`, `02`, `03`, ... — kept as
strings (zero-padded to 2 digits in current usage but the substrate
stores whatever string the writer chose).

#### `[[sessions]]`

Session handoffs — the human-readable summary of what happened in a
working session. **Write surface**: `bin/loom session write`. The
date + letter pair is the partition (first session on a given date
= `a`, second = `b`, etc).

```toml
[[sessions]]
schema_version = 1
date = "<YYYY-MM-DD>"
letter = "a"                 # "a" | "b" | "c" | ...
phases_touched = [1, 2]
checkins_written = ["01", "02"]
pr_activity = ["...free-form lines..."]
what_happened = [...]
open_threads = [...]
notes = [...]
```

#### `[[revisions]]`

Plan revisions — the machine record of every `bin/loom revise-plan`
operation. **Write surface**: `bin/loom revise-plan` writes both
the manifest-side `[[revisions]]` entry and a dated PLAN.md
`## Revision log` line atomically (one rewrite covers both files),
so the two never drift. The human rationale lives in PLAN.md; this
section is the machine counterpart.

```toml
[[revisions]]
timestamp = "<ISO 8601>"
target = "PLAN.md"           # the revised artifact (extensible)
seq = 1                      # 1-based revision number
```

#### `[[retros]]`

Project and session retrospectives — the consolidated home for what
were `retros/<filename>.json` files. **Write surface**: `bin/loom retro
write` appends the retro into `[[retros]]`. The create-once guard
(session retros unique by `(phase, tier)`, project retros singleton)
lives in the verb, since the append helper is a plain append. Reads are
manifest-first with a fallback to the legacy `retros/` files for
pre-flip projects (forward-only).

```toml
[[retros]]
schema_version = 1
type = "session"             # "session" | "project"
created = "<ISO 8601>"
phase = 2                    # session retros only
tier = 1                     # session retros only
findings = [{ category = "kept-well", description = "...", evidence = "..." }]
```

#### `[[replies]]`

Replies the loop posted to PR review comments — the consolidated home
for what were `responses/<branch>/response-NN.json` files. **Write
surface**: `bin/loom pr respond` appends each reply into `[[replies]]`.
An append-only log (a reply to the same comment can legitimately
recur), so there is no dedup guard; `branch` carries the former
partition key.

```toml
[[replies]]
comment_id = 12345           # the gh review-comment id
body = "..."
branch = "<phase-branch>"
created = "<ISO 8601>"
```

#### `[[findings]]`

Guild evaluator findings, harvested from the concurrent
`.guild-findings.jsonl` scratch stream. **Write surface**: `bin/loom
findings harvest <slug>` folds the jsonl into `[[findings]]`, deduped on
`signature`, idempotently. This is the serial, single-writer harvest
that runs at unit/phase close — never mid-panel, because the jsonl is a
many-writer `O_APPEND` buffer and the manifest is single-writer.
`harvested_at` is the fold-in time; `branch`/`unit` are optional
attribution. The harvest seam lives in the loom/ev layer (it reads
guild's file); guild's findings-append writer is untouched.

```toml
[[findings]]
evaluator = "evaluator-test-unit"
code = "<finding-code>"
evidence = "..."
severity = "advisory"        # "blocking" | "advisory"
signature = "<content hash>"
harvested_at = "<ISO 8601>"
branch = "<branch>"          # optional attribution
unit = "01"                  # optional attribution
```

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
manifest's `[[phases]].number` and `[[phases]].name`.

### `INTERVIEW.md`

Grill-me transcript from project birth, kept as audit trail of why
the plan looks the way it does. **Write surface**: `bin/loom plan`
writes this once at project creation. Not subsequently mutated
(future: `bin/loom plan-amend` may extend it).

### `retros/<filename>.json`

Retrospectives — kept-well / improvement / process-change / follow-
up findings from a session or the whole project. **Legacy file format**:
new retros are written into the manifest's `[[retros]]` section (see
above); this file shape is now read-only, resolved by the `retro
read`/`list` fallback for pre-flip projects. **Partitioned** by retro
type and (for
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

### `plans/<phase>-<topic-slug>.md`

Multi-perspective design artifacts produced by `/guild-plan`.
**Write surface**: `bin/guild plan {init,append}`. **Single-
writer-serialized** per `projects/CONVENTIONS.md` § Category 3
(the round-numbering invariant requires serial appends).

Shape:

```markdown
# Plan: <topic>

## Round 1

### From <engineer-name-1>

<verbatim engineer body>

### From <engineer-name-2>

<verbatim engineer body>

## Round 2

...
```

Per the always-on plan step in `/ev-loop-interactive` (and
the dedicated plan spawns in `/loom-research`), each phase
typically has one round-1 plan at `plans/<phase>-<topic-slug>.md`.

### `RECOVERY-STATUS.json`

Present only when a sub-agent invocation failed mid-flight. See
[`AGENT-CONVENTIONS.md`](./AGENT-CONVENTIONS.md) § Recovery from
sub-agent failures for the full shape. Lives at the project root
alongside `manifest.toml`.

**Gitignored scratch.** `RECOVERY-STATUS.json` and the
`.guild-findings.jsonl` evaluator stream are transient and not
committed (`.gitignore` excludes `projects/**/.guild-findings.jsonl`
and `projects/**/RECOVERY-STATUS.json`). Recovery state cannot live in
the manifest it recovers; the findings stream folds into `[[findings]]`
at close via `bin/loom findings harvest`. Everything else under
`projects/<slug>/` is committed.

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
