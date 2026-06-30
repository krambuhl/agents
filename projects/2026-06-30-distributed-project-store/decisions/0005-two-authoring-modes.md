# 0005. Two RPI authoring modes: central plan and decentralized runbook

- **Status**: accepted
- **Scope**: project scope (work-distribution axis)

## Decision

`/loom-research` feeds **two** downstream authoring skills, not one:

- **Central** — `/loom-plan` → `PLAN.md` + per-phase manifests. Persistent
  project state, a phase graph, project-managed. Best when the work is
  bounded, sequenced, and worth tracking centrally.
- **Decentralized** — a new `/loom-runbook` → **in-code TODO/`MIGRATE`
  annotations** + a **runbook** (the migration dictionary: the transform
  spec each annotation references) + the **execution skills** that pluck
  and transform sites. The inventory lives in the code, not a central
  plan. Best for massively-parallel mechanical work (large migrations).

Both outputs are consumed by `/ev-run` and `/ev-goal`.

## Why

`/loom-plan`'s persistent upfront state is a perfect project-management
substrate, but it is the wrong shape for work that wants to fan out across
many machines with no central inventory to contend on (decisions
0003/0004). The same research should be able to emit *either* shape. One
research source, two authoring modes.

## Consequences

- `/loom-runbook` is a new loom skill, the decentralized sibling of
  `/loom-plan` (this project, Phase 6). It emits the annotation +
  dictionary format Phase 6 defines, from a `RESEARCH.md`.
- `/ev-goal` gains a **runbook execution mode** (Phases 7–8): pluck a batch
  of annotated sites and transform them, vs. drive a phase graph.
- The modes can mix: a centrally-planned project may have one phase whose
  body is a runbook fan-out.
