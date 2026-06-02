---
name: loom-revise-plan
description: >-
  Revise an existing PLAN.md via a flavor-routed grill-me interview.
  First question is always "mechanical or research-flavored?" —
  mechanical revisions go through evaluators-only and shell
  `bin/loom revise-plan`; research-flavored revisions auto-spawn
  `/loom-research` (focused on the revision question) before the
  evaluator pass and commit. Supports human-paired and `--mode=auto`
  with the substrate two-budget(3 rounds × 10 decisions). Auto-mode
  callers supply the flavor up front via `--flavor=`.
argument-hint: "<slug> [--flavor=mechanical|research] [--mode=auto]"
user-invocable: true
disable-model-invocation: true
allowed-tools: Read, Write, Bash, Skill, Agent, AskUserQuestion, Bash(loom *), Bash(griot *)
---

# /loom-revise-plan

Revise an existing PLAN.md via a flavor-routed interview. The skill
is the symmetric cousin of `/loom-plan` (the outer-RPI birth path):
where `/loom-plan` decides "do we need research first?" by detecting
RESEARCH.md, `/loom-revise-plan` asks the user (or the caller, in
auto-mode) "is this revision mechanical or research-flavored?" and
branches accordingly.

- **Mechanical revisions** rewrite the plan in place — phase shuffle,
  scope tightening, verification update, dependency adjustment — and
  go straight to the evaluator pass before commit.
- **Research-flavored revisions** introduce or restructure a
  load-bearing claim that needs grounding. The skill auto-spawns
  `/loom-research` focused on the revision question, attaches the
  resulting research, then runs the evaluator pass and commits.

**Format references**:
- `docs/AGENT-CONVENTIONS.md` § Auto-mode and the two-budget shape
  (convergence rule + the 3 × 10 default for `/loom-revise-plan`).
- `docs/AGENT-CONVENTIONS.md` § Recovery from sub-agent failures
  (`RECOVERY-STATUS.json` shape + lifecycle).
- `docs/SUBSTRATE-COMPOSITIONS.md` § Derive panel + § Capture finding.
- `skills/loom-research/SKILL.md` (the sub-agent target for the
  research-flavored branch).
- `skills/loom-plan/SKILL.md` (the sibling skill — birth path; this
  skill is the amend path).

## Inputs

- `<slug>` — required positional. The project to revise.
- `--flavor=mechanical|research` (optional) — explicit flavor. In
  auto-mode, the caller MUST supply this; otherwise the skill cannot
  resolve the first question without human input.
- `--mode=auto` (optional) — run without human input. Requires
  `--flavor=` to be supplied.

## Process

### 1. Pre-flight + recovery check

- Run `Bash("griot use --as=llm")` to load the learnings rollup.
- Resolve the slug via loom's standard resolution. If the project
  doesn't exist, stop with `project-not-found` (surface verbatim
  from `bin/loom`'s shape).
- Emit `plan-revise-started` with detail `{slug}` after pre-flight
  succeeds.
- Check for `projects/<slug>/RECOVERY-STATUS.json`:
  - Present AND `parent_skill === '/loom-revise-plan'`: surface
    context + offer to resume (auto-accept in auto-mode). Resume
    from `resume_from`.
  - Present AND `parent_skill !== '/loom-revise-plan'`: stop with
    error pointing the user at the named parent skill.
  - Absent: proceed to step 2.

### 2. Flavor routing — the first question

In **human-paired mode**: ask the user via `AskUserQuestion` (2-
option structured form):
- `mechanical` — "this revision is a plan rewrite without new
  research" (phase shuffle / scope tighten / verification update /
  dependency adjustment).
- `research` — "this revision introduces a load-bearing claim
  needing grounding."

In **auto-mode**: read `--flavor=` from the argv. If absent, stop
with a structured error pointing at the missing flag — auto-mode
cannot resolve this question without explicit input.

Emit `plan-revise-flavor-selected` with detail `{slug, flavor:
'mechanical' | 'research'}`.

### 3a. Mechanical branch

If flavor is `mechanical`:

- Read the current `PLAN.md`. Run a grill-me interview tightly
  scoped to the revision (e.g. "which phase needs the scope
  change?", "what's the new verification command?"). One question
  at a time, opinionated recommendation each turn, mirrors
  `/loom-plan`'s posture.
- Synthesize the candidate revised PLAN.md.
- Skip to step 5 (evaluator pass).

### 3b. Research-flavored branch

If flavor is `research`:

- Ask one grill-me question to crystallize the **revision question**
  (the single load-bearing claim that needs research). In auto-mode,
  the caller's invocation message MUST carry the revision question
  as part of the topic; if absent, stop with a structured error.
- Emit `plan-revise-research-spawned` with detail `{slug,
  revision_question: <the crystallized question>}`.
- Spawn `/loom-research` as a fresh-context sub-agent via the
  `Agent` tool with `subagent_type=loom-research` and a brief
  carrying the revision question + `--mode=auto`. Wait.
- On sub-agent success: read the committed `RESEARCH.md` (or its
  appended dossier — for project-level research already present,
  the sub-agent should append to that file; this is one of the
  open questions in the substrate that Phase 4 surfaces but doesn't
  fully resolve — see Notes for the PR). Proceed to step 4.
- On sub-agent failure: write own `RECOVERY-STATUS.json` with
  `parent_skill=/loom-revise-plan`, `failed_step=research-spawn`,
  `context.sub_agent_recovery_path=<path>`, exit non-zero. Same
  pattern as `/loom-plan`'s outer-RPI failure.

### 4. Synthesize revised PLAN.md (research-flavored)

Read the new research dossier. Read the current PLAN.md. Run a
short grill-me on how the new research changes the plan. Synthesize
the candidate revised PLAN.md.

For mechanical revisions, step 3a synthesized the candidate
directly. Either way, the candidate is ready for the evaluator
pass.

### 5. Evaluator pass

Same shape as `/loom-plan` step 6:

- Write candidate PLAN.md to `/tmp/loom-revise-plan-<slug>.md`.
- Derive evaluator panel via § Derive panel.
- Emit `plan-revise-panel-spawned` with the derived agent list.
- Invoke `/guild-validate`. Audit rubric is plan-shape coherence
  (same rubric as `/loom-plan`'s panel) PLUS revision-specific
  checks: every changed section names what changed and why; the
  Revision log section is updated.
- Emit `plan-revise-panel-verdict` with verdict + counts.

Iteration cap is 3 rounds per flag. Persistent flags go to
`UNRESOLVED.md`.

### 6. Compose rationale + commit via CLI

A rationale is required for `bin/loom revise-plan` (it goes into
the git commit message AND the Revision log entry). The skill
synthesizes a one-sentence rationale from the grill-me trail (or
takes a user-supplied override in interactive mode).

Write the candidate to a temp path:

```
/tmp/loom-revise-plan-<slug>.md
```

Invoke:

```
Bash("loom revise-plan <slug> \
  --revision-file=/tmp/loom-revise-plan-<slug>.md \
  --rationale=<the synthesized rationale>")
```

Emit `plan-revised` with detail `{slug, plan_path, rationale}`
after the CLI commit succeeds.

If the CLI errors (`project-not-found`, `plan-not-found`,
`missing-args`), surface verbatim and stop.

### 7. Report

```
Revised plan: <title>
Flavor: <mechanical | research>
Research spawned: <yes — path to new RESEARCH.md / no>
Rationale: <one line>
Evaluator panel: <verdict>, <blocking_count> blocking, <advisory_count> advisory
Next: continue with /ev-loop-interactive <slug> <phase>, or re-run this skill if the revision didn't land cleanly.
```

## Human / auto duality

Per `docs/AGENT-CONVENTIONS.md`:
- **Per-decision rounds**: 3.
- **Per-session decisions**: 10.

In auto-mode, the flavor MUST be supplied via `--flavor=` (the skill
cannot answer the first question without human input). For
research-flavored auto-mode invocations, the revision question MUST
also be supplied in the invocation message.

Budget exhaust emits `plan-revise-budget-exhausted` with `reason:
'decision-budget' | 'round-budget'` and writes the standard three
artifacts (partial revised PLAN.md + `UNRESOLVED.md` +
`RECOVERY-STATUS.json`).

## Recovery flow

This skill's `RECOVERY-STATUS.json` use follows the canonical shape
documented in `docs/AGENT-CONVENTIONS.md` § Recovery from sub-agent
failures verbatim. Skill-specific field usage:

- `parent_skill`: `/loom-revise-plan`.
- `failed_step` and `resume_from`: `research-spawn`,
  `interview-<question-id>`, `evaluator-iteration`, `cli-commit`.
- `context`: carries the flavor decision (so resume doesn't re-ask
  the first question), the revision question (research-flavored
  only), the partial revised PLAN.md path, and optionally
  `sub_agent_recovery_path` pointing at the sub-agent's recovery
  file when the research-flavored branch's sub-agent failed.

On re-invocation against a slug with `RECOVERY-STATUS.json` whose
`parent_skill` is `/loom-revise-plan`, the skill reads the file,
surfaces context, and resumes. Successful re-invocation that
produces a committed revised PLAN.md deletes the file per the
convention.

## Griot integration

At each evaluator panel close (step 5), scan findings for
`[portable]` markers and write captures via § Capture finding —
same pattern as `/loom-plan` and `/loom-research`.

Hardcoded writes via § Capture finding on:

- `plan-revise-budget-exhausted` — substrate signal (same as the
  other budget-exhausted captures).
- (No equivalent of `plan-research-auto-spawned`'s hardcoded write
  here — the research-flavored branch is the EXPECTED revision
  shape when research is needed, not a gap signal.)

## Rules

- **The first question is ALWAYS flavor.** No shortcut to mechanical
  without asking; no shortcut to research without asking. The
  resolution shapes everything downstream.
- **Auto-mode REQUIRES `--flavor=` and (for research) a revision
  question in the topic.** No default flavor — defaults silently
  hide the routing decision.
- **Same sub-agent orchestration rules as `/loom-plan`.** Agent tool
  for fresh-context spawn; sub-agent has its own startup brief
  including `bin/griot use --as=llm`; parent owns recovery writes
  on sub-agent failure.
- **Rationale is mandatory.** `bin/loom revise-plan` rejects empty
  rationale (`missing-args`) per the CLI shape.
- **Don't write directly into `projects/<slug>/PLAN.md`.** All
  revision IO goes through `bin/loom revise-plan`.
- **No emojis.**

## Failure modes

- Auto-mode + missing `--flavor=`: stop with structured error.
- Auto-mode + research-flavor + missing revision question: stop
  with structured error.
- Sub-agent fails OR budget-exhausts during research-flavored
  branch: write own `RECOVERY-STATUS.json`, emit
  `plan-revise-budget-exhausted` with appropriate reason, exit
  non-zero.
- `RECOVERY-STATUS.json` exists with different `parent_skill`: stop
  with error.
- Evaluator pass flags persist past round budget: documented in
  `UNRESOLVED.md`, removed from committed PLAN.md, commit proceeds.
- `bin/loom revise-plan` returns `project-not-found` or
  `plan-not-found`: surface verbatim, stop.
- Empty rationale (shouldn't happen — the skill synthesizes one,
  and the user can override interactively): if it slips through,
  CLI returns `missing-args`; surface verbatim.

## Open questions (Phase 4 surfaces, defers resolution)

- **Research-flavored revisions on a project that already has
  `RESEARCH.md`**: does the sub-agent append to the existing dossier
  under a new `## Shift N — <revision question>` heading, or does it
  produce a separate `RESEARCH-<revision-slug>.md` file? PLAN.md
  Phase 3 doesn't fully specify the append-vs-separate behavior;
  `/loom-research` today writes RESEARCH.md fresh and would refuse
  on `research-exists-committed`. Phase 4 punts this to operator
  judgment: the skill description says "the sub-agent should append
  to that file" but the CLI doesn't yet support the append path.
  Future work: the `loom research append` subverb (the research
  verb-family's append-with-provenance path) is the intended home for
  this — append a provenance-stamped block to the existing RESEARCH.md
  rather than refusing or overwriting.
