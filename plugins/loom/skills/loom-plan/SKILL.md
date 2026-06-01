---
name: loom-plan
description: >-
  Birth a PLAN.md via relentless grill-me interview, grounded in a
  prior RESEARCH.md (attached if present; auto-spawned via
  /loom-research if missing). Evaluator panel runs against the
  proposed PLAN.md via bin/guild derive-panel + /guild-validate
  before commit. Supports human-paired and `--mode=auto` flows with
  the substrate two-budget(3 rounds × 10 decisions). Use when the
  user wants a plan grounded in research; for lighter "I know what I
  want" scaffolding, just answer the interview questions tersely
  and the loop closes fast. Dispatches deterministic file IO
  through `bin/loom plan`.
argument-hint: "<topic or short description> [--mode=auto]"
user-invocable: true
disable-model-invocation: true
allowed-tools: Read, Write, Bash, Skill, Agent, AskUserQuestion
---

# /loom-plan

Birth a plan via the outer half of the RPI (Research → Plan → Implement)
loop. The skill detects whether the project has a research foundation
(`RESEARCH.md` at project root); if absent, it auto-spawns
`/loom-research` as a fresh-context sub-agent via the Agent tool, waits
for the research dossier to commit, and then proceeds with the plan
interview. If present, the research is attached as input to the
strawman draft.

This is the canonical project-birth path. There's no lighter
alternative skill — when you "know what you want," just answer the
interview's questions tersely and the loop closes fast.

**Format references**:
- `docs/AGENT-CONVENTIONS.md` § Auto-mode and the two-budget shape
  (convergence rule + the 3 × 10 default for `/loom-plan`).
- `docs/AGENT-CONVENTIONS.md` § Recovery from sub-agent failures
  (`RECOVERY-STATUS.json` shape + lifecycle).
- `docs/SUBSTRATE-COMPOSITIONS.md` § Derive panel (the
  `bin/guild derive-panel` invocation pattern).
- `docs/SUBSTRATE-COMPOSITIONS.md` § Capture finding (griot
  integration for `[portable]` markers).
- `skills/loom-research/SKILL.md` (the research half of the RPI loop;
  this skill auto-spawns it).

## Inputs

- `<topic or short description>` — what the plan is about. Required.
- `--mode=auto` (optional) — run without human input. Auto-mode uses
  the evaluator panel and (when needed) the plan panel to drive
  resolution instead of asking the operator. See § Human / auto
  duality.
- `--research-flavor=<text>` (optional, auto-mode only) — when an
  auto-mode caller knows the revision flavor for the inner-RPI
  callback path (Phase 5), pre-supply it here to skip the
  flavor-routing grill-me question.

## Process

### 1. Pre-flight + recovery check

- Run `Bash("griot use --as=llm")` to load the learnings rollup
  per the substrate startup-brief convention.
- Resolve the slug from the topic (same kebab-case derivation as
  `/loom-research`).
- After pre-flight completes (slug resolved, learnings loaded,
  recovery check below cleared), emit `plan-started` with detail
  `{slug, topic: <positional-arg if not a full slug, else null>}`.
  This single emit per session marks the session boundary in the
  events.jsonl trail.
- Check for `projects/<slug>/RECOVERY-STATUS.json`:
  - Present AND `parent_skill === '/loom-plan'`: surface the failure
    context (`failed_step`, `context.last_decision`, partial
    `PLAN.md` snippet) and offer to resume. Auto-mode auto-accepts.
    Resume from `resume_from` (typically the next un-resolved
    interview question or the evaluator-iteration step).
  - Present AND `parent_skill !== '/loom-plan'`: stop with an error
    pointing the user at the named parent skill.
  - Absent: proceed to step 2.

### 2. RESEARCH.md detection + outer-RPI dispatch

Check for `projects/<slug>/RESEARCH.md`:

- **Present**: emit `plan-research-attached` event. Read the file.
  The strawman draft (step 4) treats every claim in `RESEARCH.md` as
  input — the plan answers "given this research, what's the plan"
  rather than "what should we research, then plan."
- **Missing**: emit `plan-research-auto-spawned` event. Spawn
  `/loom-research` as a fresh-context sub-agent via the `Agent` tool
  with `subagent_type=loom-research` and a brief carrying the topic
  + the explicit `--mode=auto` flag (so the sub-agent runs without
  human input). Wait for the sub-agent to return. Re-check for
  `RESEARCH.md`:
  - Present (sub-agent committed cleanly): read it and proceed as in
    the Present branch above.
  - Still missing OR sub-agent emitted `research-budget-exhausted`:
    write our own `RECOVERY-STATUS.json` (parent_skill=/loom-plan,
    failed_step=`research-auto-spawn`, resume_from=`research-auto-spawn`,
    context={topic, sub_agent_recovery_path:
    `projects/<slug>/RECOVERY-STATUS.json`}) and exit non-zero. The
    next `/loom-plan` invocation against the same slug resumes from
    the sub-agent's own recovery file rather than re-spawning blind.

Note: the sub-agent's startup brief MUST include
`bin/griot use --as=llm` per the substrate convention (the
`/loom-research` skill body handles this in its own step 1; no
additional caller-side instruction needed).

### 3. Frame the topic

Treat `$ARGUMENTS` as the topic. Summarize back what you heard plus
the load-bearing claims from `RESEARCH.md` (attached or
just-completed). Ask the user to confirm or refine before pressing
into the interview.

In auto-mode, frame by composing a one-sentence topic + a
3-sentence research summary as the strawman frame and proceed
directly to step 4.

### 4. Grill-me interview (relentless, one decision at a time)

Walk the decision tree branch by branch. The grill-me posture is
one question at a time, opinionated recommendation first,
structured form via `AskUserQuestion` when 2-4 discrete options
apply. The substrate-decision categories — Scope, Phases,
Dependencies, Verification, PR cadence, Loop strategy, Risks,
Decisions — are the canonical interview shape; every question's
recommendation is justified against a citable claim from
`RESEARCH.md` where applicable.

In auto-mode, the "user" is the evaluator panel + (when needed) the
plan panel for divergent questions. A round with zero new
questions (silent panel) is convergence. See § Human / auto duality.

For each open interview question, emit no event by default
(interviews are conversational at this granularity; the evaluator
pass at step 6 is where panel events fire). The skill is responsible
for tracking the **decision count** for budget purposes; one resolved
interview question or one accepted recommendation = one decision.

### 5. Propose the slug + synthesize PLAN.md + INTERVIEW.md

Confirm the kebab-case slug with the user before proceeding, then
synthesize `PLAN.md` from the resolved interview tree (Context /
Scope / Phases / Dependencies / Verification / Risks / Open
questions / Decisions) and synthesize `INTERVIEW.md` as the walked
decision tree (one heading per resolved question, with the
recommendation, the user's answer, and the rationale).

The `## Context` section of `PLAN.md` SHOULD cite `RESEARCH.md` as
the research input (one-line backlink) so a future reader of the
plan sees the foundation.

### 6. Evaluator pass

Before showing the proposed PLAN.md to the user (or accepting in
auto-mode):

- Write the candidate PLAN.md to a temp path
  (`/tmp/loom-plan-<slug>.md`).
- Derive the evaluator panel via § Derive panel:
  `Bash("guild derive-panel --files=/tmp/loom-plan-<slug>.md")`.
  For a markdown plan, the fallback rules yield
  `evaluator-contract-fit` alone; with PANEL-COMPOSITION.md readable,
  the panel may expand.
- Emit `plan-panel-spawned` event with the derived evaluator list.
- Invoke `/guild-validate` via the `Skill` tool with the derived
  agents and a packet whose Contract section asks the panel to
  audit the PLAN.md for **plan-shape coherence**: phases each map
  to one PR, dependencies are explicit, verification is concrete,
  risks are named with mitigations, scope is sharp (in/out/deferred
  rather than just "what's in").
- The skill receives a structured verdict. Emit `plan-panel-verdict`
  with `verdict`, `blocking_count?`, `advisory_count?`.

If the verdict is `flagged`:
- **Human-paired**: surface the findings to the user one at a time;
  iterate on each via grill-me follow-up; re-run the panel after the
  candidate is revised.
- **Auto-mode**: iterate by addressing each blocking finding
  directly (re-synthesize the affected section) and re-run the
  panel. Per-decision round budget caps iteration at 3 rounds per
  flag.

A finding that persists past the round budget joins `UNRESOLVED.md`
and is removed from the candidate PLAN.md.

### 7. Show + approve (or auto-mode accept)

- **Human-paired**: surface the post-panel PLAN.md to the user.
  They read it. They either approve or redirect for one more
  round.
- **Auto-mode**: silent panel + no unresolved findings →
  auto-accept and proceed to step 8.

### 8. Write temp files + commit via the CLI

The candidate PLAN.md is already at `/tmp/loom-plan-<slug>.md` (from
step 6). Compose the INTERVIEW.md to
`/tmp/loom-interview-<slug>.md`.

Invoke:

```
Bash("loom plan <slug-or-topic> \
  --plan-file=/tmp/loom-plan-<slug>.md \
  --interview-file=/tmp/loom-interview-<slug>.md")
```

`bin/loom plan` auto-adopts the loom substrate by default (same
behavior under the loom CLI surface). The
CLI emits no events directly — the orchestration events (started /
completed) are skill-side.

Emit `plan-completed` after the CLI commit succeeds.

If the CLI errors (`plan-exists-committed`, etc.), surface verbatim
and stop. The user resolves and re-invokes (or uses
`/loom-revise-plan` if the intent was to update an existing plan).

### 9. Report

One short paragraph in this shape:

```
Created plan: <title>
Research foundation: <path to RESEARCH.md, or "auto-spawned this session">
Location: projects/<slug>/
Files: PLAN.md, INTERVIEW.md, manifest.json, config.json, events.jsonl, checkins/, sessions/
Evaluator panel: <verdict>, <blocking_count> blocking, <advisory_count> advisory
Next: run /ev-loop-interactive <slug> <phase> to execute the first phase, or /loom-revise-plan <slug> --revision-file=... --rationale=... to amend.
```

## Sub-agent orchestration

The skill spawns sub-agents in two places:

1. **`/loom-research`** in step 2 (RESEARCH.md missing).
2. (Future: Phase 5's inner-RPI hop will spawn `/loom-research` +
   `/loom-revise-plan` from `/ev-loop-interactive`'s scope-shift
   path. This skill's recovery shape generalizes to that flow.)

The sub-agent invocation uses the `Agent` tool, not the `Skill`
tool. The distinction matters: `Agent` spawns a fresh-context
sub-agent (no inherited conversation); `Skill` runs in the parent's
context. Sub-agents need their own learnings load
(`bin/griot use --as=llm` in their startup brief).

On sub-agent failure (timeout, partial commit, budget-exhausted),
the parent (this skill) writes its own `RECOVERY-STATUS.json` to
the slug. The sub-agent may have ALSO written its own — that's
fine; the parent's recovery file references the sub-agent's by
path so a resumer can decide whether to retry the sub-agent or
escalate.

## Human / auto duality

Per `docs/AGENT-CONVENTIONS.md` § Auto-mode and the two-budget
shape, the substrate default for this skill:
- **Per-decision rounds**: 3.
- **Per-session decisions**: 10.

Decisions for this skill = resolved interview questions OR
accepted/rejected evaluator findings during the iteration step.

Auto-mode runs until one of:
- **Silent panel**: the evaluator pass returns `approved` AND no
  panel raised a new question this round.
- **Budget exhaust**: 3 × 10 cap hit.

Budget exhaust writes the standard three artifacts (partial
`PLAN.md` + `UNRESOLVED.md` + `RECOVERY-STATUS.json`), emits
`plan-budget-exhausted` with `reason: 'decision-budget' |
'round-budget'`, and exits non-zero.

## Recovery flow

This skill's `RECOVERY-STATUS.json` use follows the canonical shape
documented in `docs/AGENT-CONVENTIONS.md` § Recovery from sub-agent
failures verbatim. No extensions, no overrides. Skill-specific use
of the existing fields:

- `parent_skill`: `/loom-plan`.
- `failed_step` and `resume_from`: one of `research-auto-spawn`,
  `interview-<question-id>`, `evaluator-iteration`, `cli-commit`.
- `context`: carries the partial PLAN.md temp file path, the last
  resolved interview question (for resume-from-here semantics), and
  if applicable a `sub_agent_recovery_path` field pointing at the
  research sub-agent's own recovery file.

On re-invocation against a slug with `RECOVERY-STATUS.json` whose
`parent_skill` is `/loom-plan`, the skill reads the file, surfaces
context (or auto-accepts in auto-mode), and resumes. Successful
re-invocation that produces a committed PLAN.md deletes the file
per the convention.

## Griot integration

At each evaluator panel close (step 6), scan the panel's findings
output for `[portable]` markers and write matching captures via
§ Capture finding (the `bin/griot capture --evaluator-finding=...`
pathway). The classification surface gap noted in `/loom-research`
applies here too — the integration intent is recorded; the verb
extension is a Phase 7 follow-up.

Hardcoded writes via § Capture finding on:

- `plan-budget-exhausted` — the budget-exhaust pattern itself is
  substrate signal worth promoting (the same as
  `research-budget-exhausted`).
- `plan-research-auto-spawned` — the fact that a plan needed
  research is substrate signal: a plan birthed without prior
  research means the user-facing path failed to surface the gap.
  Worth capturing as a `catalog-gap` once that classification
  ships.

## Rules

- **Outer RPI is the default path.** If a project doesn't have a
  RESEARCH.md, this skill spawns `/loom-research` rather than
  proceeding plan-only. The Implement half is downstream
  (`/ev-loop-interactive`).
- **Cite the research in PLAN.md.** Every recommendation grounded in
  research SHOULD reference the RESEARCH.md claim it leans on.
- **Don't write directly into `projects/<slug>/PLAN.md`.** All file
  IO goes through `bin/loom plan`.
- **Sub-agent failure recovery is the parent's job.** This skill
  writes its own `RECOVERY-STATUS.json` when `/loom-research`
  fails; the sub-agent may also write one. Both can coexist (the
  parent's references the child's by path).
- **Evaluator pass before commit.** Always. Same gate posture as
  `/loom-research`'s fact-check.
- **`/loom-plan` vs `bin/loom plan`** are distinct surfaces. The
  skill carries the conversation + orchestration; the CLI carries
  the deterministic file IO + git seam.
- **No emojis.**

## Failure modes

- Topic too small for a plan (one PR, no phases): suggest the user
  just do the work directly. Stop without spawning research or
  shelling to `bin/loom plan`.
- `RESEARCH.md` missing AND `/loom-research` sub-agent fails OR
  budget-exhausts: write own `RECOVERY-STATUS.json`, emit
  `plan-budget-exhausted` with appropriate reason, exit non-zero.
  Next invocation resumes from the sub-agent's recovery file.
- `RECOVERY-STATUS.json` exists with a different `parent_skill`:
  stop with an error pointing the user at the named skill.
- Evaluator pass flags persist past round budget: documented in
  `UNRESOLVED.md` and removed from the committed PLAN.md. The skill
  does NOT block commit on per-finding budget exhaust — convergence
  on most + UNRESOLVED.md for the few is the substrate's escape
  hatch.
- `bin/loom plan` returns `plan-exists-committed`: surface verbatim,
  stop. Suggest `/loom-revise-plan` for the update intent.
- Interview drags past 10 decisions without converging in auto-mode:
  budget-exhaust write + non-zero exit. In human-paired mode,
  propose a checkpoint at decision 8 (the user can defer the rest
  to Open questions).
