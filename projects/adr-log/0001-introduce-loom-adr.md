# 0001. Introduce loom adr

- **Date**: 2026-05-28
- **Status**: accepted

## Context

In-repo ADRs are the only ADRs an agent actually reads. The linear-loom
research finding stands: external-system ADRs (Confluence, Notion, a
team wiki) are invisible to agentic loops at planning time, so the
canonical substrate needs a first-class verb for recording
architectural decisions that lives inside the workspace and ships with
the same git commit cadence as the rest of the substrate.

This work harvests an existing implementation. Jelly (`plugins/jelly-loom`,
PR #64, commit `d10133c`) shipped a working `jelly adr` verb with a
15-test suite and the same workspace-level placement decision. The
substrate-consolidation effort (PRs #68-#100) collapsed jelly into
canonical loom, but the salt-earth phase (PR #98) deleted the verb
without harvesting it. This ADR records the decision to re-introduce
the verb as canonical loom rather than rebuild from scratch.

## Decision

The `loom adr` verb writes ADRs to `projects/adr-log/NNNN-<title-slug>.md`
at workspace level with the following load-bearing properties:

- **Workspace-level placement, not per-project.** ADRs span projects;
  per-project numbering schemes diverge in practice (one project's
  ADR-0007 is unrelated to another's). One searchable place beats N
  searchable places. Per-project ADRs may ship as a v2 escape hatch
  (`--project=<slug>` flag) but workspace-level is the default and
  primary surface.

- **Numbering is `max(existing NNNN) + 1`, NOT `count + 1`.** A
  deleted or moved ADR leaves a permanent gap; the next number keeps
  climbing. This is the load-bearing invariant. Cross-references to
  "ADR-0007" in commit messages, PRs, and other ADRs must never
  silently re-point to a different decision if one is deleted. Pinned
  by a gap test in `plugins/loom/cli/verbs/loom/adr.test.ts`.

- **Append-only revision posture.** To revise an ADR, write a NEW ADR
  with `--status=superseded` body-linking to the prior number. Never
  edit the old file. There is no `loom adr supersede` sub-verb in v1
  — the convention is the contract. Operators who edit committed ADRs
  break the cross-reference invariant.

- **Freeform `--status` field.** Default `accepted`. Convention is
  `proposed | accepted | deprecated | superseded` but no enum
  enforcement in v1; tighten later if drift bites. Matches jelly
  d10133c.

- **Operator-paired concurrency assumption.** Two parallel `loom adr`
  invocations can race to claim the same number (both compute
  `max + 1` before either writes). Acceptable for v1 — the
  operator-paired use pattern makes the race rare. A `wx`-flag open
  or post-write `git status` check is a v2 mitigation if it becomes
  a real problem.

## Consequences

**Now easy that wasn't before.** Architectural decisions stop
disappearing into PR bodies. A future agent or engineer reading
`projects/adr-log/` sees the substrate's decisions in one place,
in chronological order, with the rationale preserved. The
`loom adr` skill (`plugins/loom/skills/loom-adr/SKILL.md`)
auto-fires on decision-recording prose, so capturing a decision is
one acknowledged AskUserQuestion away rather than a manual file
write.

**Now harder.** Operators must distinguish architectural decisions
(visible to others, load-bearing for future work) from local
decisions (project-scoped, captured by PLAN.md or the diff). The
skill's filter framing helps, but the filter is human judgment. A
too-eager skill produces ADR noise; a too-cautious skill produces
the same "decisions disappear" gap that motivated the work.

**Closed alternatives.** Per-project ADRs as the default
(rejected — divergent numbering). External-system ADRs (rejected —
agents don't read them). Generated `projects/adr-log/README.md`
index (deferred — `ls projects/adr-log/` is fine until the log
exceeds ~30 entries). Machine-readable supersession metadata
(deferred — convention in body text suffices in v1). MCP-wrapped
verb (deferred — loom doesn't currently expose MCP tools).

**Commits us to.** The numbering invariant. Every cross-reference
to "ADR-0007" anywhere (commit messages, PRs, other ADRs, code
comments) presumes 0007 means what it meant when written.
Renumbering, gap-filling, or reuse breaks every reference.
This commitment is permanent for as long as the adr-log exists.

**Watch for.** False-positive skill triggering — the autoinvoke
posture (`disable-model-invocation: false`) is the first such
loom-* skill; if the architectural-only framing in the SKILL.md
body proves too loose in practice, tighten it (e.g. require
explicit operator confirm in the skill's Process step 1, which is
already the documented gate).

## Forward pointers

- Phase 3 of `projects/2026-05-28-loom-adr` wires `loom adr` into
  `ev-loop-interactive`'s checkin close path so `[adr-candidate]`-
  marked `notes_for_pr` entries can be lifted into real ADRs at unit
  close. That's the first downstream consumer of this verb.
- The deferred `loom adr supersede` sub-verb (v2 if needed) would
  add machine-mediated supersession with a `--supersedes=NNNN` flag
  that updates the prior ADR's `## Status` line. v1 keeps that
  manual.
