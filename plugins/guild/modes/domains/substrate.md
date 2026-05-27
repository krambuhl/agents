# Domain: substrate

## Scope

The shape of the CLI-owned state and coordination layer: the loom
event log, the project manifest, checkins, agent-registry definitions,
and the `guild`/`griot`/`loom` verbs that read and write them.
Substrate is the work that makes other work parallel-safe, replayable,
and observable across sessions — the state machine underneath every
loop. It is not infrastructure (CI/deploy), not tooling (editor
config), not DX (consumer ergonomics). The lens asks whether a proposed
change preserves the substrate's invariants or quietly breaks them.

This is a **design-phase domain** — researcher and planner, upstream of
any unit contract. It has **no reviewer cell**: there is no
substrate evaluator, because the substrate state is small enough that
the `contract-fit` lens covers correctness after the fact. This
domain's value is upstream — pressing on the shape before the contract
is written.

## Concerns

- **CRUD-vs-orchestration boundary.** Does a verb belong in `bin/loom`
  (low-level state: append an event, read the manifest, write a
  checkin) or in a composition layer (a `scripts/` workflow, a skill
  body, a loop step)? Smell: a `scripts/` command reaching directly
  into substrate files, creating a second write path. Inverse smell: a
  `bin/loom` verb that knows workflow context (which phase, which
  deliverable). Find the seam and respect it.
- **Append-only invariants under parallelism.** The event log is the
  source of truth. Any new write path must be append-only and
  idempotent under concurrent sessions. If a change requires mutating
  an existing event, rewriting history, or coordinating ordering
  between writers, the substrate is asking for a different shape.
- **Parallel-session safety.** If two sessions run concurrently against
  the same project, what breaks? Which files does the design write,
  and are those writes safe under interleaving? Two appends to an
  event log are fine; two rewrites of the manifest are a race; two
  sessions creating the same checkin number conflict.
- **Family-shape consistency for new artifact types.** When a new
  agent, event type, phase, or skill family joins, does it follow the
  existing family's conventions or start a parallel one? A new
  antagonist-panel member joins as `evaluator-foo`, not `reviewer-foo`.
  Parallel naming costs forever; cohesion compounds.
- **Schema-version evolution.** Substrate state is read by future
  sessions. Schema changes need a migration story — additive-only by
  default, version-tagged when not. Soft-extension (an optional field,
  a backward-tolerant loader) survives; hard migration (rename a field,
  reshape a value) needs a version bump or a one-time scripted cutover.
- **Idempotency of CLI verbs.** Running a verb twice should either
  produce the same end state or fail loudly with "already done." The
  antipattern is silent double-effect — appending two events on a
  double call, corrupting state on retry. Press on what happens when
  the network dies mid-verb and the user re-runs.
- **Cost-of-substrate.** Substrate decisions compound across sessions —
  a `bin/loom` verb runs in everyone's session, a registered agent
  loads at every session start, an event-log schema change touches
  every event ever written. Press on whether the cost lives in the
  right place (invocation-time, session-time, write-time) and matches
  the value.

## Good patterns

- **Append-only over mutate-in-place.** Event-log shape over
  key-value-state shape; when state changes, the change is an event and
  current state is a fold over events.
- **Loom does CRUD, scripts do composition.** `bin/loom` verbs are
  primitives (read one thing, write one thing, append one event);
  composed workflows live in scripts, skill bodies, or loop steps that
  call primitives.
- **Existing family vocabulary for new artifacts** — a new
  agent/verb/event/artifact adopts the family's naming, frontmatter,
  and shape rather than a parallel convention.
- **Soft-extension schemas** — new fields optional, old fields
  backward-tolerant for at least one `schema_version` bump, hard
  migrations explicit and one-time.
- **Idempotency by construction** — a verb's contract makes
  double-invocation safe by design, not by reviewer vigilance. If the
  only way to be safe is "remember not to run it twice," the shape is
  wrong.
- **Family-shape consistency over local optimality** — match the
  existing family even when a parallel name reads slightly better in
  isolation; cohesion compounds.

## Vocabulary

- **CRUD-vs-orchestration** — the seam between primitive state
  manipulation (`bin/loom`) and composed workflow (scripts/skills)
- **append-only** — a write surface that only adds, never mutates or
  reorders, safe under concurrent writers by construction
- **parallel-session safety** — correctness when two sessions interleave
  writes to the same project state
- **family-shape consistency** — a new artifact adopting its family's
  naming and structural conventions
- **schema-version evolution** — additive-by-default change with a
  migration story for pre-dating readers
- **idempotency** — running a verb twice yields the same state or fails
  loudly, never silent double-effect
- **cost-of-substrate** — the compounding per-session price of a
  substrate decision, and whether it lives in the right place

## Cross-domain notes

- Phase scoping: this domain is **planner/researcher-only**, with no
  reviewer cell — `contract-fit` covers after-the-fact correctness, so
  the value here is upstream shape advice.
- Boundary with the **skeptic** personality: the skeptic asks "do we
  need this at all, what's the cheaper version, what breaks"; this
  domain asks "given we *are* doing it, what shape fits the substrate's
  invariants." Premise vs. shape.
- Boundary with the **design-systems** recipe (composition +
  abstraction + tokens + naming): design-systems owns naming
  consistency and semantic vocabulary; this domain leads on invariant
  preservation. "Does the name fit the family" is theirs; "does the
  *shape* fit the family" is this domain's.
- Boundary with **performance**: overlaps on cost-of-substrate; defer
  to `performance` on measurement, lead on whether the cost lives in
  the right place by design.
- Boundary with **test-unit** / **test-integration**: when a substrate
  verb needs a test, the test domains own tier and shape; this domain
  presses on whether the verb is shaped to be testable (CRUD primitives
  unit-test easily; orchestrations need integration tests).
