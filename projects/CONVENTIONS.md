# Project conventions

Marketplace-wide invariants for the loom / draft / guild / griot substrate.
This file holds invariants that constrain how mutating CLI verbs may
write to substrate state. The companion registry of every mutating
verb and its category lives in
`cli/parallel-work-invariant.test.ts`, which asserts this doc and the
registry stay aligned.

## Parallel-work invariant

Every mutating verb in the four CLI families belongs to exactly one
of three concurrency categories. The category determines what
guarantees the substrate provides when the verb is invoked
concurrently from two or more sessions against the same slug.

### Category 1 — append-only

The verb appends a new record to a file. Concurrent appends from
multiple writers are safe as long as each write is a complete record
boundary (line-buffered for `.jsonl`, complete record for other
formats). The substrate accepts that record ordering across
concurrent writers is undefined — order is determined by which write
won the race.

Examples:
- `guild findings append` (writes to `.guild-findings.jsonl`)
- `loom event append` (writes to `events.jsonl`)
- `griot operator-checks log-intervention` (writes to operator log)

### Category 2 — partitioned

The verb writes to a path that includes a partition variable
(`{branch}`, `{date}-{letter}`, `{kind}`, `{id}`, `{name}`,
`{folder}`, `{NN}`). Concurrent writers landing in different
partitions are independent — no shared file. Concurrent writers
landing in the same partition (same `{NN}` checkin number for the
same branch, e.g.) collide. The substrate's job is to reject the
second write loud (e.g. `checkin-already-exists` for partitioned
checkin paths) rather than silently overwrite.

Examples:
- `loom checkin write` (target:
  `projects/<slug>/checkins/{branch}/{NN}.json`)
- `loom session write` (target:
  `projects/<slug>/sessions/{date}-{letter}.json`)
- `loom retro write` (target:
  `projects/<slug>/retros/{kind}.json`)
- `loom pr respond` (target:
  `projects/<slug>/checkins/{branch}/responses/{id}.md`)
- `griot capture` (target:
  `learnings/session-notes/{folder}/`)

### Category 3 — single-writer-serialized

The verb writes to a fixed path that is not partitioned. Two
concurrent writers will collide on the same file. The substrate's
guarantee here is *softer*: the file is one of a small declared set
of "exception" files where single-writer-at-a-time is an accepted
assumption of the loom-managed workflow. Operating two such writers
against the same slug at the same time is undefined behavior;
callers are responsible for ensuring serial access.

Each Category-3 verb MUST declare which exception it writes to,
chosen from the declared exceptions set below.

Examples:
- `draft revise` (target: `projects/<slug>/PLAN.md`,
  exception: `PLAN.md`)
- `loom phase update` (target: `projects/<slug>/manifest.json`,
  exception: `manifest.json`)
- `loom project scaffold` (target:
  `projects/<slug>/manifest.json`, exception: `manifest.json`)
- `guild whiteboard init` (target:
  `projects/<slug>/whiteboards/{name}.md`, exception:
  `whiteboard`)
- `guild whiteboard append` (target:
  `projects/<slug>/whiteboards/{name}.md`, exception:
  `whiteboard`)

### Declared exceptions

The declared exception set names every fixed-path file where the
substrate accepts single-writer assumptions. A new Category-3 verb
that targets a fixed path NOT named here requires a new exception
entry in this section AND a corresponding line in the registry.

- **`PLAN.md`** — the project plan. Mutated by `draft revise`. The
  plan changes when the work changes; the loom-managed workflow
  has the user serializing revisions.
- **`manifest.json`** — the project manifest. Mutated by
  `loom phase update` and `loom project scaffold`. The manifest is
  the single source of truth for project state; serial access is a
  property of the human-driven loom session model.
- **`whiteboard`** — the per-phase whiteboard artifact.
  `guild whiteboard {init,append}` write here; concurrent rounds
  against the same whiteboard file are unsupported and would
  corrupt the round-numbering invariant.
- **`gitignore-amendment`** — a consumer-repo `.gitignore` file at
  the project root. `griot init` writes here to add a `learnings/`
  entry if one isn't already present. The write is idempotent
  (second-run-is-noop) and the line is appended at the end of the
  file preserving trailing newline behavior. Concurrent `griot
  init` runs against the same consumer repo are an unsupported
  shape; the verb assumes a serialized human invoking it during
  plugin onboarding.

## Category 4 — generated-from-upstream

The verb's output is deterministically derived from upstream source
files (typically a shared tree the verb walks). Concurrent runs
against unchanged upstream input converge to the same final state;
concurrent runs against an upstream that is being edited mid-run
have undefined behavior — the substrate's contract is that callers
serialize their upstream-mutation with their generator runs.

Conceptually different from Category 3 in two ways: the target is
typically multiple files (a whole generated tree, not a single
fixed path), and idempotency holds across re-runs by construction
rather than by the verb being a no-op when state matches.

Examples:
- `sync-shared` — script lands in workstream W7 of the
  marketplace-portable-install migration. Reads top-level
  `cli/lib/` + `cli/verbs/<family>/` and writes per-plugin subsets
  under `plugins/<name>/cli/`. The CI drift-detection check
  (V10 case (c)) catches forgotten re-runs by mutating a per-plugin
  file post-sync and asserting non-zero exit.
