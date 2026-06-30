# 0001. Partition every concurrently-mutated unit — no central mutable index

- **Status**: accepted
- **Scope**: project-level (this project's storage model)

## Decision

There is **no central mutable index** for a project. Every unit that two
machines might write concurrently gets its own file, named by its
partition key:

- **Phase** is the execution partition. Each phase's descriptor — title,
  `dependsOn`, status, branch — lives **in that phase's own**
  `phases/<N>/manifest.toml`, alongside that phase's records
  (checkins/events/sessions/retros/replies/findings). "The plan index" is
  the *aggregate* of per-phase files, computed by reading the directory,
  not stored in one place.
- **Record** is the append partition. Decisions (`decisions/<NNNN>-*.md`),
  and any project-scoped learnings, are per-record files — concurrent adds
  from different machines land on different filenames.
- `project.toml` shrinks to **identity + config only** (`[meta]`,
  `[config]`), which is genuinely write-once at scaffold.

## Why

The earlier draft assumed the phase index was "near-static after
planning." It is not: looms self-regulate — a completing block can
re-path the plan, and `loom revise-plan` is a **top-level** concern for
exactly that reason. Under parallelism a peer machine may do the
re-pathing. A single `project.toml` index would be a hot, contended,
mutable surface — the thing partitioning exists to avoid.

## Consequences

- `loom revise-plan` reconciles **per-phase descriptors**: adding phase 6
  and making phase 5 depend on it writes `phases/6/manifest.toml` and
  edits `phases/5/manifest.toml` — partitioned, so concurrent re-paths of
  *different* phases don't conflict.
- A re-path of an **in-flight** phase contends on that phase's file with
  its worker; that is an inherent coordination event and is serialized
  (one loop per phase).
- `PLAN.md` remains the single serialized **narrative** (prose a human
  reads); the machine-actionable structure is the partitioned per-phase
  descriptors. revise-plan updates both; PLAN.md conflicts are accepted as
  the cost of a deliberate planning act.
- Reads aggregate per-phase files; the read path is already centralized
  (`project read`, `parse-plan`).
