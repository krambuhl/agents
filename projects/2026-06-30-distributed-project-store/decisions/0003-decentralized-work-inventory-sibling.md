# 0003. Decentralized, site-annotated work inventories (sibling direction)

- **Status**: superseded by decision 0004 (folded into this project)
- **Scope**: cross-project direction — recorded so this project's storage
  model doesn't foreclose it

## Decision

Recognize a second axis of partitioning — **work distribution** — distinct
from this project's **state storage** axis, and ensure the storage model
does not assume a central work inventory.

The pattern (operator's recent practice): for large mechanical work
(migrations), invert the plan. Instead of a central inventory enumerating
every site that every run must load, **annotate each site in the code** —
a `TODO` with metadata + a small shared "migration dictionary" — and pair
it with **migration skills** that find and pluck sites. The **partition is
the site**; the inventory lives *in the codebase*, not in a central plan.
`ev-goal` can then fan out **massively concurrently**, each run claiming
some sites and pushing a PR, with **no central inventory to contend on**.

## Why

It is the same partitioning principle as decisions 0001/0002 taken to its
limit: a centralized inventory is itself a bottleneck and a write-conflict
surface. Site-local annotations remove the central state entirely — the
extreme case of "partition everything concurrently mutated."

## Relationship to this project

- **Different concern.** This project partitions *project state storage*
  (per-phase manifests, per-record decisions). The decentralized inventory
  partitions *work distribution* (per-site claims). They share DNA but
  solve different problems.
- **Non-foreclosure constraint.** The storage model must not bake in an
  assumption that a project always has a central, enumerated phase/plan.
  Per-phase partitioning (0001) already aligns: a "project" can be a thin
  shell whose phases are discovered/claimed rather than centrally listed.
- **Recommended as a sibling project**, not a phase here — its own
  research + plan (migration-dictionary format, site-annotation schema,
  claim/lease semantics so two `ev-goal` runs don't grab the same site,
  PR-per-batch ergonomics).

## Open question for the operator

Confirm sibling vs. fold-in. Default taken here: **sibling** — keep this
project on storage; spin the decentralized work-inventory model as its own
research thread when ready.
