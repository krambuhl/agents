# Interview — linear-loom plan

The walked decision tree that produced
`projects/2026-05-21-linear-loom/PLAN.md`.

## Frame check

**Recommendation**: frame as decision-vs-process axis migration
across loom artifacts (PLAN.md and revisions in git; everything
else to Linear); phases marked now/deferred.

**User answer**: "Frame lands — start interview."

## Decision 1 — Scope (initial)

**Recommendation**: Whole arc + substrate as one plan, phases
marked now/deferred.

**User answer**: "I dont want to migrate anything. this whole
project should be additive and leave the current agents skills and
plugins in shape, what I want to focus on is a replacement, we'll
call this `linear-loom` in the plugin directory space so we can
develop these in isolation."

**Rationale**: **major frame change** mid-interview. User
rejected the migration framing entirely. Replaced with greenfield
substrate-building in `plugins/linear-loom/`.

## Decision 1.5 — Slug treatment after re-frame

**Recommendation**: Birth a new project (`2026-05-21-linear-loom`)
with the boundary-research dossier as its foundation.

**User answer**: "Birth a new project for linear-loom (Recommended)."

## Decision 2 — v1 purpose

**Recommendation**: Minimal subset, designed from Linear
primitives.

**User answer**: "Architectural greenfield (designed from Linear
primitives, full surface)."

## Decision 3 — Design output shape

**Recommendation**: Single
`plugins/linear-loom/docs/DESIGN.md` (canonical pattern).

**User answer**: "Single DESIGN.md, canonical pattern (Recommended)."

## Decision 4 — Phase shape

**Recommendation**: Concrete Phases 1-2, sketch 3+, revise after
DESIGN.md.

**User answer**: "Concrete Phases 1-2, sketch 3+, revise post-
DESIGN.md (Recommended)."

## Decision 5 — Substrate composition (initial answer)

**Recommendation**: Compose substrate plugins (guild, griot, ev);
isolated from loom specifically.

**User answer**: "i'm not sure the answer to this yet... it will be
a later project to plug the linear-loom toolkit into loops and
orchestration."

**Rationale**: deferred to follow-on plan.

## Decision 6 — Reconsidering Decision 5 (the press)

**Recommendation** (during evaluator-pass review): the evaluator
approved the plan, but the user pressed back: "i do want to press
on the assumption that we should make linear driving a 2ndary
concern, this is a 1st pass idea."

**Decision shape offered**:
1. DESIGN.md addresses orchestration as first-class; v1 stays
   toolkit-narrow.
2. Full orchestration in v1 — design AND implement.
3. Reframe as "Linear-driven loom" — storage in service of
   orchestration.
4. Keep current plan; deferral is right.

**User answer**: "Full orchestration is in v1 — design AND
implement together."

**Rationale**: the user reversed Decision 5. The plan needs to
expand to include orchestration design and implementation in v1.
The "follow-on integration project" bucket loses orchestration.

## Decision 7 — Agent runtime model

**Recommendation**: Local runtime; defer per-task machines.

**Decision shape offered**:
1. Local runtime; defer Coder CLI.
2. Coder CLI integration in v1.
3. Bring-your-own-runtime contract.

**User initial answer**: "[dismissed — do not proceed]"

**Followed by**: "2 is close to what i want. Let me tell you what
I really want is to be able to put a project into linear and break
up the tasks and then have a [kanban] board where I can drag tasks
from [unstarted] in progress. [pull request] to complete or they
can be updated based on what's going on in the system and I would
like that I could tag the task with the type of agent flow I would
want to use so say in planning I would like the grill me to do the
work where sometimes I would want the iterative confidence live,
and sometimes I would want the white boarding guild or the
evaluator guild to be implied based on the type of task in the
linear board."

**Rationale**: the user articulated a much richer vision than the
runtime question alone surfaces. linear-loom is:

- A flow router: tasks tagged with agent-flow type; Linear UI is
  the operator dashboard.
- Driven by Linear workflow state transitions (operator action in
  any Linear view, system events, GitHub PR lifecycle).
- Dispatches matching agent flows on status-transition hooks
  (initially, transition into "In Progress" or equivalent).
- Agents run on ephemeral machines per task (Coder CLI or
  equivalent).
- Storage primitives serve the orchestration; they are not the
  point.

This is a sharper version of "Full orchestration in v1" and a
movement toward Option 3 from Decision 6 ("Reframe as Linear-driven
loom"). The plan was reshaped to reflect this vision.

## Decision 7.5 — Reshape check

**Recommendation**: vision right — reshape and re-run evaluator.

**User answer**: "Vision right — reshape and re-run evaluator."

## Decision 8 — Drop Kanban-specific framing

**User pushback** post-reshape: "i dont think kanban is perfect
for this, but some sort of status hook shit."

**Rationale**: the architectural primitive is the **status-
transition hook**, not the Kanban visual. Linear's UI (any view —
Kanban, list, calendar, whatever the operator picks) is the
dashboard, but the orchestration cares about workflow state
transitions, which fire webhooks regardless of which Linear view
the operator is using. PLAN.md updated to lead with "status
transition" framing and treat the visual as incidental.

## Convergence

Seven substantive decisions resolved (Decision 5 effectively
reversed by Decision 6). The plan was reshaped to reflect the
orchestration-first vision. Evaluator re-runs on the reshaped
plan as the final gate before commit.
