---
name: linear-loom-revise-plan
description: >-
  Revise an existing PLAN.md for a Linear-backed loom-project via a
  flavor-routed grill-me interview. First question is always
  "mechanical or research-flavored?" — mechanical revisions go through
  evaluators-only and shell `bin/linear-loom revise-plan`;
  research-flavored revisions auto-spawn `/linear-loom-research`
  (focused on the revision question) before the evaluator pass and
  commit. Supports human-paired and `--mode=auto` with the substrate
  two-budget (3 rounds × 10 decisions). Auto-mode callers supply the
  flavor up front via `--flavor=`.
argument-hint: "<slug> [--flavor=mechanical|research] [--mode=auto]"
user-invocable: true
disable-model-invocation: true
allowed-tools: Read, Write, Bash, Skill, Agent, AskUserQuestion
---

# /linear-loom-revise-plan

Revise an existing PLAN.md via a flavor-routed interview. The skill
is the symmetric cousin of `/linear-loom-plan` (the birth path):
where `/linear-loom-plan` decides "do we need research first?" by
detecting RESEARCH.md, this skill asks the user (or the caller, in
auto-mode) "is this revision mechanical or research-flavored?" and
branches accordingly.

- **Mechanical revisions** rewrite the plan in place — phase shuffle,
  scope tightening, verification update, dependency adjustment — and
  go straight to the evaluator pass before commit.
- **Research-flavored revisions** introduce or restructure a
  load-bearing claim that needs grounding. The skill auto-spawns
  `/linear-loom-research` focused on the revision question, attaches
  the resulting research, then runs the evaluator pass and commits.

Operator-direct, not model-invocable per `linear-loom` DESIGN.md § 1.

This skill mirrors `/loom-revise-plan` per DESIGN.md § 14, with two
structural divergences: it shells to `bin/linear-loom revise-plan`
(not `bin/loom`) and the research sub-agent target is
`/linear-loom-research` (not `/loom-research`). Griot integration is
not part of the linear-loom plugin family — the rollup load + capture
writes that the loom-side skill carries are absent here.

**Format references**:
- `plugins/linear-loom/docs/DESIGN.md` (substrate authority + the
  decisions-in-git posture per § 6 + § 14).
- `plugins/ev/docs/AGENT-CONVENTIONS.md` § Auto-mode and the
  two-budget shape (convergence rule + the 3 × 10 default).
- `plugins/ev/docs/AGENT-CONVENTIONS.md` § Recovery from sub-agent
  failures (`RECOVERY-STATUS.json` shape + lifecycle).
- `skills/linear-loom-research/SKILL.md` (sub-agent target for the
  research-flavored branch).
- `skills/linear-loom-plan/SKILL.md` (sibling skill — birth path;
  this skill is the amend path).

## Inputs

- `<slug>` — required positional. The loom-project to revise (must
  have a `projects/<slug>/linear.json` marker AND a
  `projects/<slug>/PLAN.md` already committed).
- `--flavor=mechanical|research` (optional) — explicit flavor. In
  auto-mode, the caller MUST supply this; otherwise the skill cannot
  resolve the first question without human input.
- `--mode=auto` (optional) — run without human input. Requires
  `--flavor=` to be supplied.

## Process

### 1. Pre-flight + recovery check

- Confirm `bin/linear-loom` is on PATH.
- Resolve the slug via `bin/linear-loom project read <slug>` (which
  uses linear.json marker resolution). If the project doesn't exist,
  stop and surface the CLI error verbatim.
- Check for `projects/<slug>/RECOVERY-STATUS.json`:
  - Present AND `parent_skill === '/linear-loom-revise-plan'`:
    surface context + offer to resume (auto-accept in auto-mode).
    Resume from `resume_from`.
  - Present AND `parent_skill !== '/linear-loom-revise-plan'`: stop
    with error pointing the user at the named parent skill.
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

### 3a. Mechanical branch

If flavor is `mechanical`:

- Read the current `PLAN.md`. Run a grill-me interview tightly
  scoped to the revision (e.g. "which phase needs the scope
  change?", "what's the new verification command?"). One question
  at a time, opinionated recommendation each turn, mirrors
  `/linear-loom-plan`'s posture.
- Synthesize the candidate revised PLAN.md.
- Skip to step 5 (evaluator pass).

### 3b. Research-flavored branch

If flavor is `research`:

- Ask one grill-me question to crystallize the **revision question**
  (the single load-bearing claim that needs research). In auto-mode,
  the caller's invocation message MUST carry the revision question
  as part of the topic; if absent, stop with a structured error.
- Spawn `/linear-loom-research` as a fresh-context sub-agent via
  the `Agent` tool with `subagent_type=linear-loom-research` and a
  brief carrying the revision question + `--mode=auto`. Wait.
- On sub-agent success: read the committed `RESEARCH.md` (or its
  appended dossier — for project-level research already present, the
  sub-agent's append-vs-fresh behavior is the same open question the
  loom-side `/loom-revise-plan` documents in its Open Questions
  section; linear-loom inherits the same gap until a future
  `bin/linear-loom revise-research` verb ships). Proceed to step 4.
- On sub-agent failure: write own `RECOVERY-STATUS.json` with
  `parent_skill=/linear-loom-revise-plan`,
  `failed_step=research-spawn`,
  `context.sub_agent_recovery_path=<path>`, exit non-zero.

### 4. Synthesize revised PLAN.md (research-flavored)

Read the new research dossier. Read the current PLAN.md. Run a
short grill-me on how the new research changes the plan. Synthesize
the candidate revised PLAN.md.

For mechanical revisions, step 3a synthesized the candidate
directly. Either way, the candidate is ready for the evaluator
pass.

### 5. Evaluator pass

Same shape as `/linear-loom-plan` step 6:

- Write candidate PLAN.md to `/tmp/linear-loom-revise-plan-<slug>.md`.
- Derive evaluator panel via `bin/guild derive-panel` (or fall back to
  `evaluator-contract-fit` only for markdown-only artifacts).
- Invoke `/guild-validate`. Audit rubric is plan-shape coherence
  (same rubric as `/linear-loom-plan`'s panel) PLUS revision-specific
  checks: every changed section names what changed and why; the
  Revision log section is updated.

Iteration cap is 3 rounds per flag. Persistent flags go to
`UNRESOLVED.md` and are surfaced in the final report.

### 6. Compose rationale + commit via CLI

A rationale is required for `bin/linear-loom revise-plan` (it goes
into the git commit message AND the Revision log entry). The skill
synthesizes a one-sentence rationale from the grill-me trail (or
takes a user-supplied override in interactive mode).

Write the candidate to a temp path:

```
/tmp/linear-loom-revise-plan-<slug>.md
```

Invoke:

```
Bash("linear-loom revise-plan <slug> \
  --revision-file=/tmp/linear-loom-revise-plan-<slug>.md \
  --rationale=<the synthesized rationale>")
```

If the CLI errors (`marker-unreadable`, `plan-not-found`,
`missing-args`, `revision-read-failed`, `plan-write-failed`),
surface verbatim and stop.

### 7. Report

```
Revised plan: <title>
Flavor: <mechanical | research>
Research spawned: <yes — path to new RESEARCH.md / no>
Rationale: <one line>
Evaluator panel: <verdict>, <blocking_count> blocking, <advisory_count> advisory
Next: continue with /ev-linear:ev-loop-interactive <slug> <phase>, or re-run this skill if the revision didn't land cleanly.
```

## Human / auto duality

Per the substrate's two-budget convention:
- **Per-decision rounds**: 3.
- **Per-session decisions**: 10.

In auto-mode, the flavor MUST be supplied via `--flavor=` (the skill
cannot answer the first question without human input). For
research-flavored auto-mode invocations, the revision question MUST
also be supplied in the invocation message.

Budget exhaust writes the standard three artifacts (partial revised
PLAN.md + `UNRESOLVED.md` + `RECOVERY-STATUS.json`). Unlike
`/loom-revise-plan`, this skill does NOT emit
`plan-revise-budget-exhausted` to an event log — linear-loom has no
`events append` verb (DESIGN.md § 8). The conversation transcript +
the `RECOVERY-STATUS.json` artifact are the substrate trace.

## Recovery flow

This skill's `RECOVERY-STATUS.json` use follows the canonical shape
documented in `plugins/ev/docs/AGENT-CONVENTIONS.md` § Recovery from
sub-agent failures. Skill-specific field usage:

- `parent_skill`: `/linear-loom-revise-plan`.
- `failed_step` and `resume_from`: `research-spawn`,
  `interview-<question-id>`, `evaluator-iteration`, `cli-commit`.
- `context`: carries the flavor decision (so resume doesn't re-ask
  the first question), the revision question (research-flavored
  only), the partial revised PLAN.md path, and optionally
  `sub_agent_recovery_path` pointing at the sub-agent's recovery
  file when the research-flavored branch's sub-agent failed.

On re-invocation against a slug with `RECOVERY-STATUS.json` whose
`parent_skill` is `/linear-loom-revise-plan`, the skill reads the
file, surfaces context, and resumes. Successful re-invocation that
produces a committed revised PLAN.md deletes the file per the
convention.

## Rules

- **The first question is ALWAYS flavor.** No shortcut to mechanical
  without asking; no shortcut to research without asking. The
  resolution shapes everything downstream.
- **Auto-mode REQUIRES `--flavor=` and (for research) a revision
  question in the topic.** No default flavor — defaults silently
  hide the routing decision.
- **Same sub-agent orchestration rules as `/linear-loom-plan`.** Agent
  tool for fresh-context spawn; parent owns recovery writes on
  sub-agent failure.
- **Rationale is mandatory.** `bin/linear-loom revise-plan` rejects
  empty rationale (`missing-args`) per the CLI shape.
- **Don't write directly into `projects/<slug>/PLAN.md`.** All
  revision IO goes through `bin/linear-loom revise-plan`.
- **No griot.** The linear-loom plugin family does not compose griot.
  If the operator wants the learnings rollup loaded during the
  session, they invoke `/griot-use` manually before the skill.
- **No emojis.**

## Failure modes

- Auto-mode + missing `--flavor=`: stop with structured error.
- Auto-mode + research-flavor + missing revision question: stop
  with structured error.
- Sub-agent fails OR budget-exhausts during research-flavored
  branch: write own `RECOVERY-STATUS.json`, exit non-zero.
- `RECOVERY-STATUS.json` exists with different `parent_skill`: stop
  with error.
- Evaluator pass flags persist past round budget: documented in
  `UNRESOLVED.md`, removed from committed PLAN.md, commit proceeds.
- `bin/linear-loom revise-plan` returns `marker-unreadable` or
  `plan-not-found` or `revision-read-failed` or `plan-write-failed`:
  surface verbatim, stop.
- Empty rationale (shouldn't happen — the skill synthesizes one,
  and the user can override interactively): if it slips through,
  CLI returns `missing-args`; surface verbatim.

## Open questions (carried from loom-revise-plan)

- **Research-flavored revisions on a project that already has
  `RESEARCH.md`**: does the sub-agent append under a new `## Shift
  N — <revision question>` heading, or produce a separate
  `RESEARCH-<revision-slug>.md`? Inherited from
  `/loom-revise-plan`'s same open question. Future work: extend
  `bin/linear-loom research` with an `--append` flag, or ship a
  `linear-loom revise-research` verb.
