<!--
  jelly-guild project-scoped CLAUDE.md template.

  `jelly plan` (jelly-loom, Phase 1.3) instantiates this file at
  projects/<slug>/CLAUDE.md on project birth and fills the
  {{PLACEHOLDER}} slots. `jelly revise --target=plan` re-runs the
  instantiation when substrate posture changes.

  PROPAGATION: this file does NOT auto-discover under /goal. Claude
  Code's CLAUDE.md discovery walks UP from the session cwd to the
  filesystem root; it does not walk DOWN into project subdirectories.
  For this posture to reach /goal's lead agent and its dispatched
  subagents, the repo-root CLAUDE.md must @-import it:

      @projects/{{PROJECT_SLUG}}/CLAUDE.md

  `jelly plan` manages that @-line in the repo-root CLAUDE.md (insert
  on project birth; swap/remove on archive or session-switch).
  Empirically confirmed 2026-05-25 — see the project's RESEARCH.md
  § Phase 1.1 follow-up. Subagents inherit the session-wide CLAUDE.md,
  so once the lead agent sees this posture, the dispatched fleet does
  too — no per-dispatch brief threading required.
-->

# {{PROJECT_TITLE}}

**Slug**: `{{PROJECT_SLUG}}`
**Substrate**: jelly (operator-paired `/goal` orchestration with
one-PR-at-a-time review gates)
**Plan**: [PLAN.md](./PLAN.md)

{{PROJECT_CONTEXT}}

## Substrate posture for this project

This project runs under the **jelly** substrate. Anthropic's `/goal`
orchestration owns the lead-agent loop; jelly owns the substrate
opinions — specialist dispatch, record-keeping, and the
operator-paired review cadence. When you work in this project, follow
the posture below.

### Specialist dispatch — the three-axis model

jelly-guild specialists are composed from three orthogonal axes at
dispatch time. You dispatch a **personality** subagent (the only
registered `subagent_type`s) and name a **domain** and a **phase** in
the brief; the personality reads the two corresponding mode files and
constructs its combined identity.

- **Personality (HOW)** — `subagent_type` is one of: `skeptic`
  (sharp critical), `methodical` (slow critical), `generative`
  (expand the design space), `pragmatist` (decide), `synthesizer`
  (reconcile).
- **Domain (WHAT)** — name one in the brief: `composition`, `naming`,
  `abstraction`, `testing`, `a11y`. The personality reads
  `plugins/jelly-guild/modes/domains/<domain>.md`.
- **Phase (WHEN)** — name one in the brief: `researcher`, `planner`,
  `implementer`, `reviewer`. The personality reads
  `plugins/jelly-guild/modes/phases/<phase>.md`.

Example dispatch brief: *"domain: composition, phase: reviewer.
Evaluate the diff at <paths> against the composition rubric."* —
dispatched to `subagent_type=skeptic` gives you a sharp composition
reviewer that emits a verdict.

### Dispatch patterns

The dispatch pattern — which phase, and how many personalities in
parallel — determines the shape of work, not the personality files:

- **Whiteboard** = multiple personalities dispatched in parallel in
  `researcher` or `planner` phase against a shared artifact. No
  verdict; each contributes an attributed perspective. Use for design
  exploration.
- **Evaluator panel** = one or more personalities dispatched in
  `reviewer` phase against an artifact. Each emits a verdict; an
  aggregating layer combines them. Use to gate a unit of work.
- **Generator** = a single personality dispatched in `implementer`
  phase against a unit contract. Write-capable; produces the
  artifact. Use to execute a unit.

### Outcomes grading

Each domain has a paired rubric at
`plugins/jelly-guild/rubrics/<domain>.md`, formatted for Anthropic
Outcomes' auto-provisioned grader. When using Outcomes to grade
against a domain, point the grader at the rubric. The rubric and its
domain mode are the same conceptual content in two formats (manually
synced in v1; the mode is canonical on drift).

### Review cadence — operator-paired, PR-boundary

jelly is operator-paired. The substrate does its pass first (dispatch,
evaluate, compose); the operator holds the final judgment at the PR
boundary. Do not auto-merge. Do not auto-resolve ambiguous review
feedback — surface the substrate's analysis and yield to the operator
for the call. One PR at a time; each PR does one conceptual unit of
change.

## Project conventions

{{PROJECT_CONVENTIONS}}

## Pointers

- **Plan**: [PLAN.md](./PLAN.md) — milestones, phases, decisions.
- **Research**: [RESEARCH.md](./RESEARCH.md) — the empirical
  foundation this project rests on.
- **Personalities**: `plugins/jelly-guild/agents/<personality>.md`
- **Domain modes**: `plugins/jelly-guild/modes/domains/<domain>.md`
- **Phase modes**: `plugins/jelly-guild/modes/phases/<phase>.md`
- **Rubrics**: `plugins/jelly-guild/rubrics/<domain>.md`
