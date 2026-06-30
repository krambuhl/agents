---
name: loom-runbook
description: >-
  Birth a decentralized work inventory — a runbook (migration dictionary)
  plus in-code site annotations and the execution wiring — from a topic or a
  prior RESEARCH.md. The decentralized sibling of /loom-plan: where /loom-plan
  emits a central PLAN.md + phases, /loom-runbook emits MIGRATE:<dict-id>
  annotations at the work sites + a small shared runbook they reference, so
  /ev-goal can fan out massively with no central inventory to contend on. Use
  for large mechanical work (migrations, codemods, sweeps) where the partition
  is the site. Dispatches site scanning through `loom runbook scan`.
argument-hint: "<topic or short description> [--research=<path>] [--mode=auto]"
user-invocable: true
disable-model-invocation: true
allowed-tools: Read, Write, Edit, Bash, Skill, AskUserQuestion, Bash(loom *), Bash(guild *)
---

# /loom-runbook

Author the **decentralized work inventory** for a large mechanical effort.
Where `/loom-plan` produces a central `PLAN.md` + per-phase state,
`/loom-runbook` produces three things that live **in the code**, so the
inventory never becomes a central bottleneck (project
`2026-06-30-distributed-project-store`, decisions 0003/0004/0005):

1. **A runbook** — a small shared migration dictionary: `<dict-id>` → the
   transform spec for that migration.
2. **Site annotations** — a `MIGRATE:<dict-id> [key=value …]` marker at each
   work site. The set of sites is discovered by scanning, never listed
   centrally.
3. **Execution wiring** — the runbook is the thing `/ev-goal` points at to
   pluck and transform site batches (Phases 7–8).

## Inputs

- `<topic or short description>` — what the migration accomplishes.
- `--research=<path>` — a `RESEARCH.md` to ground the runbook (analogous to
  `/loom-plan`'s research grounding). If absent and the work is non-trivial,
  offer to spawn `/loom-research` first.
- `--mode=auto` — run the substrate auto-mode posture (per
  `docs/AGENT-CONVENTIONS.md`); the human-paired default interviews.

## Process

### 1. Frame the migration(s)

Interview (grill-me, recommendation-first) to pin, per migration:

- **`dict-id`** — a kebab-case stable id (e.g. `rename-foo`, `drop-legacy-X`).
- **What changes** — the precise transform, stated so a worker can apply it
  to one site without further context (the runbook entry is the spec).
- **How a site is recognized** — the predicate that identifies a site
  (a call pattern, an import, a deprecated API), so annotations land in the
  right places.
- **Per-site params** — any `key=value` context a site carries (e.g.
  `target=bar`).

In `--mode=auto`, `evaluator-contract-fit` reads the topic/RESEARCH.md and
proposes the dict-ids + specs; the operator's interview answers override.

### 2. Write the runbook (migration dictionary)

Author a TOML runbook at `runbooks/<name>.toml` — one table per migration:

```toml
[rename-foo]
description = "Rename foo() to bar() and update imports"
runbook = "Replace `foo(` with `bar(`; add the bar import; drop the foo import if now unused."
```

The `runbook` field is the worker-facing transform spec. Keep it
self-contained — a worker applies it to a single site with only the site +
this entry. Commit the runbook (it is the one shared, read-mostly artifact).

### 3. Seed the site annotations

Place a `MIGRATE:<dict-id> [params]` marker at each site, in a comment in the
site's own language:

```
// MIGRATE:rename-foo target=bar
```

Seed by whichever is cheaper for the migration: a scripted pass that inserts
the marker at every recognized site, or a guided per-site placement. The
inventory now lives in the code — there is no central list to maintain.

### 4. Verify the inventory resolves

```
loom runbook scan <root> --dict=runbooks/<name>.toml
```

The verb enumerates every annotated site and resolves each against the
runbook. **`unknown` must be 0** — a non-zero count means a site references a
dict-id the runbook doesn't define (a typo'd marker, or a missing entry).
Resolve before handing off.

### 5. Hand off to execution

The runbook + annotations are now the work queue. `/ev-goal` (runbook
execution mode, Phases 7–8) plucks a bounded batch of sites, applies each
site's runbook entry, and opens a PR — fanning out across machines with the
**site as the partition** and no central inventory to contend on. A migration
is done when `loom runbook scan` returns zero sites for its dict-id.

## Relationship to /loom-plan and /ev-goal

- `/loom-plan` → `PLAN.md` + phases: bounded, sequenced, project-managed work.
- `/loom-runbook` → runbook + annotations: massively-parallel mechanical work
  with no central inventory.

Both are downstream of `/loom-research` and both feed `/ev-run` / `/ev-goal`.
The modes can mix — a planned phase whose body is a runbook fan-out.

## Rules

- **Inventory in the code, never central.** Do not produce a file that lists
  every site; the markers + scan are the inventory.
- **Self-contained runbook entries.** A worker must be able to transform a
  site from its marker + its dict entry alone.
- **Zero unknowns before handoff.** `loom runbook scan --dict` must resolve
  every site.
- **No emojis.**

## Failure modes

- Non-zero `unknown` from `loom runbook scan` → a marker references a missing
  dict-id; fix the marker or add the entry.
- Ambiguous site predicate (annotations land in wrong/too many places) →
  tighten the recognizer in step 1 and re-seed.
- Trivial / one-off work → this is the wrong tool; use `/loom-plan` or just
  do it. The runbook overhead only pays off at scale.
