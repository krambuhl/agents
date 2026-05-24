---
name: ev-linear:ev-loop-interactive
description: >-
  Execution loop for human-paired work against a linear-loom-backed
  project. Runs a phase as a sequence of deliverables, each with its
  own unit contract and evaluator checkpoint. Supports sequential
  (ordered) and free (user picks next) deliverable ordering.
  Dispatches to bin/linear-loom CLI directly; composes
  /guild-validate; composes no other loop. Use when a phase is
  exploratory, creative, or otherwise not a bulk transform.
argument-hint: "<project-slug-or-path> <phase-number>"
user-invocable: true
allowed-tools: Read, Write, Edit, Bash, Agent, Skill
---

# /ev-linear:ev-loop-interactive

Execute one phase of a linear-loom-backed project as a human-paired
loop: discrete deliverables, per-deliverable contract and checkpoint.
The human drives order when ordering is free; the loop keeps the
substrate honest.

Parallel to `/ev-loop-interactive` (ev plugin) per DESIGN.md § 17 —
the substrate target is linear-loom, not loom. Griot integration is
excised entirely per § 18 (no rollup load, no capture writes, no
recurring-threshold append). Auto-mode and scope-shift event
emissions are dropped (linear-loom has no `events append` per § 8);
the panel-based decision logic itself stays, with the conversation as
the only audit trail.

**Composes**: `bin/linear-loom` CLI (via Bash) for substrate
operations; `/guild-validate` (via the Skill tool) for the antagonist
panel.
**Spawns** (Agent tool, fresh-context): `/linear-loom-research` +
`/linear-loom-revise-plan` on the inner-RPI accept path of § Scope-shift
detection (see step 5 of the unit loop).
**Does not compose**: other loops. Substrate plumbing dispatches
directly to the CLIs (see § Substrate compositions).

**Format references**:
- `plugins/linear-loom/docs/DESIGN.md` (substrate authority for the
  linear-loom verb surface — § 5 + § 6 milestone naming, § 7 checkin
  comments, § 8 audit-from-Linear, § 11 Milestone state).
- `plugins/ev/docs/AGENT-CONVENTIONS.md` § Auto-mode + the
  two-budget shape (cross-plugin doc reference; not duplicated here).

Skill invocations like `/guild-validate` below mean
`Skill(skill: <name>, args: "…")`. CLI invocations like
`linear-loom phase update` mean `Bash("linear-loom phase update
<args>")`. Antagonist evaluation runs through `/guild-validate`,
which spawns evaluator agents in parallel via `/guild-spawn`; the
loop itself never calls the `Agent` tool directly EXCEPT on the
inner-RPI sub-sequence (see step 5).

## Preflight

Before doing anything else, verify the substrate CLIs are on PATH.
The marketplace `dependencies` cascade handles install-time + enable-
time correctness; this skill-body check catches the runtime case
where a user disabled a dep plugin mid-session.

Run:

```
Bash("command -v linear-loom guild >/dev/null 2>&1 || { echo '/ev-linear:ev-loop-interactive requires linear-loom + guild plugins on PATH. Enable them with: claude plugin enable linear-loom@krambuhl guild@krambuhl' >&2; exit 1; }")
```

If exit code is non-zero, stop and surface the message to the
operator verbatim — do not proceed with any other step.

## Substrate compositions

Every substrate operation this loop performs dispatches directly to
`bin/linear-loom` or `bin/guild` — no `bin/griot` (§ 18), no ambient
skills, no trout scripts. The unit loop steps below cite recipes by
name (e.g. "checkpoint per § Compose PR"). All `§ <Recipe>` references
in this body resolve in `docs/SUBSTRATE-COMPOSITIONS.md`. For
linear-loom verb shapes, see
`plugins/linear-loom/docs/DESIGN.md`.

## Arguments

- `<project-slug-or-path>` — resolved by linear-loom's standard slug
  resolution (full slug → date-less suffix → relative or absolute
  path). If missing or unresolved, stop and ask the user for the
  project.
- `<phase-number>` — which phase to run. If missing, default to the
  next non-`completed` phase from the manifest and confirm with the
  user before proceeding. If the named phase is already `completed`,
  stop and ask whether to re-run or pick a different phase.

## Ordering

Read the phase entry in PLAN.md to determine ordering:

- **Sequential** — deliverables are numbered and must run in order.
  The loop picks the next one automatically.
- **Free** — deliverables are a set. The loop presents them and asks
  the user to pick.

If PLAN.md doesn't specify, default to **free** and ask.

## Phase-level process

### Whiteboard

Every phase runs a multi-engineer design pass **once before Step 1**
(deliverable enumeration). The whiteboard output becomes shared
reference material for every unit in the phase (cited in each unit's
contract `Inputs:` line). This step is **always-on**: the loop
invokes `/guild-whiteboard` at phase start regardless of explicit
configuration; an optional PLAN.md block overrides defaults.

**Default behavior** (no `**Whiteboard**:` block in PLAN.md):
- `engineers` = all currently registered `whiteboard-*` agents,
  resolved via glob of `.claude/agents/whiteboard-*.md`.
- `topic` = the phase name (e.g. "Whiteboard mechanism + engineers"
  for Phase 3).
- `rounds` = 1.

**Override** — optional PLAN.md block, placed immediately under the
phase's prose paragraph:

```
**Whiteboard**: engineers=<comma-separated names>; topic=<one-line topic>; rounds=<N>
```

Any field in the block overrides the corresponding default. Partial
blocks are allowed.

**Whiteboard artifact path**:
`projects/<slug>/whiteboards/<phase-number>-<topic-slug>.md`. Create
the parent directory if it doesn't exist.

**Per-round invocation**: for each round 1..N, invoke
`/guild-whiteboard` via the `Skill` tool with `engineers=<list>`,
`brief=<topic + any phase context>`, `whiteboard=<path>`. The skill
auto-detects round number from existing file state, so re-running is
idempotent.

**Bootstrapping case (no engineers registered)**: if the
`.claude/agents/whiteboard-*.md` glob returns zero matches AND no
explicit `engineers=` override is given, log a one-line note ("no
whiteboard engineers registered — skipping whiteboard step") and
proceed directly to Step 0.

### Step 0. Pre-flight

- Refresh state per § State refresh.
- Working tree clean, verification baseline.
- **Branch state**. If the manifest's phase has no `branch` yet (first
  unit in this phase), cut a fresh branch from updated `main` —
  `git checkout main && git pull --ff-only origin main && git checkout
  -b <branch-name>` — using the `<project-name>.<phase-lazy-name>`
  convention (e.g. `linear-loom.dogfood`). Otherwise confirm the
  current branch matches the manifest's recorded phase branch; if not,
  stop and ask whether to switch.

### Step 1. Enumerate deliverables

Parse the phase's deliverables from PLAN.md. Each deliverable becomes
one unit. If the phase names 5 deliverables, you expect 5 checkins.

Show the list to the user with status markers (done, in-progress, not
started) pulled from existing checkins on this branch.

### Step 2. Unit loop

For each deliverable (picked per the ordering rule):

1. **Negotiate.** Draft the unit contract for this deliverable and
   write it into a new numbered checkin (Contract section only).
   The negotiation has two shapes, selected by where ambiguity sits
   in the drafted contract:

   - **Default (clean draft):** show the full contract to the user
     and ask for a single approve/redirect on the whole thing. The
     human reads what you agreed to and either approves or redirects
     in one round. This is the path when the contract has no
     ambiguous fields — every acceptance criterion is concrete,
     every input is named, every disqualifier is sharp.

   - **Grill-me on ambiguous fields:** if any contract field reads
     as ambiguous, walk the user through ONLY those fields as
     separate one-at-a-time questions before showing the full
     contract for the final approve/redirect. "Ambiguous" here is
     concrete:
     - **Empty `inputs[]`** — the contract names no files/lines/
       documents the unit reads from.
     - **Hedge-worded acceptance criteria** — phrases like "should
       probably," "might want to," "ideally," "consider whether,"
       or any AC that doesn't tell a reviewer how to falsify it.
     - **Undefined disqualifiers** — `disqualifiers[]` empty
       AND the unit touches more than two files (small surfaces
       can survive with no disqualifiers; larger ones need them).

     Per-field walks use `AskUserQuestion` (or natural-language
     follow-ups when the field needs free-form input) one question
     at a time.

   **Auto-mode** (the loop's `--mode=auto` flag, or upstream
   caller-supplied auto-mode signal): the user is replaced by
   `evaluator-contract-fit` auditing the contract against the
   unit's inputs. The evaluator returns `approved` (treated as
   the user's "approve"), `flagged` (treated as a redirect — each
   flagged finding becomes one round of ambiguity-walk addressing
   the underlying field). Convergence rule: silent panel
   (`approved` with zero findings) OR two-budget exhaust. Defaults
   are **per-decision rounds = 3** and **per-session ambiguities =
   5** per the substrate convention. On budget exhaust, the unit
   fails to negotiate cleanly — the loop surfaces the unresolved
   ambiguities to the operator with a structured error and stops.
   Auto-mode does NOT auto-commit a half-ambiguous contract.

   **No auto-mode event emissions** — linear-loom has no `events
   append` verb (§ 8). The ev plugin emits `auto-mode-entered` /
   `-converged` / `-budget-exhausted`; ev-linear drops these
   entirely. The conversation transcript is the audit trail.

   **The human is in the loop** (still, even in the default path)
   — they should see what you agreed to before execution starts.
   Auto-mode is the explicit operator opt-out.

2. **Execute.** Do the work. For creative or exploratory deliverables,
   pair with the user — ask when you hit a fork, report when you hit a
   dead end, don't charge ahead.

3. **Evaluate.** Invoke `/guild-validate` via the `Skill` tool to run
   the antagonist panel against this unit. Compose the panel by
   auto-derivation from the unit's file list (see § Panel
   auto-derivation below) — the result is contextual to the artifact
   rather than a fixed list. `evaluator-contract-fit` is always
   included as the baseline. The spec (file-type → evaluator mapping,
   precedence list, tokens-vs-naming boundary) lives in
   `plugins/ev/docs/PANEL-COMPOSITION.md` (cross-plugin reference —
   not duplicated in ev-linear); the derivation logic is
   `bin/guild derive-panel`.
   - `agents`: comma-separated output of § Derive panel.
   - `packet`: build a **dense packet** (see shape below). The
     substrate default is dense — verbose packets correlate with
     budget-exhaustion failures under `evaluator-*`'s `maxTurns=5`.

   **Dense packet shape** (three sections, in this order):

   ```
   ## How to evaluate efficiently

   You have a tight tool-use budget (maxTurns=5). Pre-computed
   verification below is authoritative — do not re-run lint/build/
   test/grep unless you find specific evidence the artifact summary
   contradicts itself. Spot-check at most ONE or TWO criteria with
   targeted reads, then emit `VERDICT:`. If you cannot reach a verdict
   within budget, emit `VERDICT: flagged` with `parse-failure:
   budget-exhausted` so the loop escalates rather than no-ops.

   ## Contract (paraphrased)

   <Goal in 1-3 sentences. Acceptance criteria as a numbered list,
   condensed (full text in <checkin path>). Disqualifiers as a
   single-line summary. Inputs as a bulleted list of paths.>

   ## Artifact

   **Files** (created/modified/deleted): <bulleted paths>

   **Pre-computed verification (authoritative — do not re-run)**:
   - `npm run lint` → <result>
   - `npm run build` → <result>
   - `npm run test` → <result>
   - <other verification: grep results, smoke test outputs, etc.>

   **Direct mappings to acceptance criteria** (for spot-check
   efficiency): <AC N → file:line ranges or section pointers>

   **Iteration story** (if applicable): <prior panel runs and what
   was addressed; helps the evaluator avoid re-flagging fixed issues>

   ## Original ask

   <verbatim from PLAN.md or the triggering message>

   ## Suggested spot-check (one tool use)

   <the most efficient single read for confirming the most-suspicious
   criterion; optional but reduces investigation thrashing>
   ```

   Pass the contract as a paraphrased summary plus the checkin file
   path link, not verbatim — the checkin file is in the repo and
   renders one click away. The packet's job is orientation; the depth
   is one click away.

   The skill returns a structured verdict (`approved` | `flagged` |
   `flagged-conflict`) with `blocking_findings`, `advisory_findings`,
   `cli_runs`, and `conflicts` lists.

4. **Iterate or commit.**
   - Flagged: address the specific reasons, re-invoke `/guild-validate`.
     Up to 2 retries (3 panel runs total).
   - Approved: continue to step 5 (scope-shift detection), then
     finalize the checkin.

   **No findings-append / recurring-threshold step** (§ 18). The ev
   plugin walks every approved finding through `bin/griot capture`'s
   append + count subverbs to detect recurring patterns and stamp
   correction lines into the checkin's Notes for the PR. ev-linear
   drops the entire mechanism — griot is excised, and there's no
   substrate to write findings into. Recurring patterns surface via
   operator judgment + the conversation transcript instead.

5. **Scope-shift detection (restrictive default).** Runs only on
   approved units (flagged-and-iterating units skip this step). Look
   for signals that PLAN.md is stale; offer a plan revision via the
   inner-RPI sub-sequence ONLY on two-signal concurrence.

   **Signal sources**:
   - **Evaluator finding** mentioning a missing or changed phase,
     deliverable, or load-bearing decision (in either blocking or
     advisory findings).
   - **User comment during the unit** that proposed a change to
     plan structure (not just tactical refinement of this unit's
     contract).
   - **Whiteboard contradiction** (round 2+ whiteboard surfaces a
     disagreement between engineers that current PLAN doesn't
     resolve).
   - **Phase boundary** (this unit is the last in its phase OR
     the next phase is about to start).

   **Two-signal-concurrence rule**: offer the inner-RPI sub-sequence
   only when 2+ signal sources fire for the same shift. Single
   signals get a note (see below); the loop does NOT interrupt.

   **No scope-shift event emission** — linear-loom has no `events
   append` verb. The ev plugin emits `scope-shift-detected` here;
   ev-linear drops it. Detection still happens and the offer flow
   still runs; only the event-log side note is gone.

   **Offer flow**: surface a short paragraph naming the two signals
   and a proposed one-line rationale (the "trigger" for the inner
   RPI). Use `AskUserQuestion` (or natural-language confirm) for
   accept/decline/defer. Default: decline (no interrupt unless the
   user explicitly accepts). In auto-mode, the default flips to
   accept — auto-mode treats two-signal concurrence as enough
   evidence to trigger the sub-sequence without further input.

   **On accept (inner-RPI sub-sequence)**:

   1. Spawn `/linear-loom-research` via the `Agent` tool with
      `subagent_type=linear-loom-research` and a brief carrying the
      trigger as the research topic + `--mode=auto`. The sub-agent
      runs fresh-context. **No `bin/griot use` in the sub-agent's
      startup brief** — linear-loom skills don't compose griot. Wait.
   2. On sub-agent success: a fresh `RESEARCH.md` lands at project
      root (either net-new or appended — same open question as
      `/loom-revise-plan` carries; inherited unresolved). Proceed
      to step 3 below.
   3. Spawn `/linear-loom-revise-plan` via the `Agent` tool with
      `subagent_type=linear-loom-revise-plan` and a brief carrying
      the slug + `--flavor=research` + `--mode=auto`. The skill
      reads the just-committed RESEARCH.md, runs its grill-me on
      the revision, gates through the evaluator pass, and commits
      via `bin/linear-loom revise-plan`. Wait.
   4. Re-read the manifest via `bin/linear-loom project read <slug>
      --pretty`. The revision may have changed the phase structure;
      if the **current phase no longer exists** in the manifest,
      stop and surface the situation to the operator. If the
      **current phase's deliverables changed**, surface a one-line
      note + continue (the unit just completed is still valid;
      subsequent units will pick up the new shape).
   5. Proceed to step 6 (Phase update). Do not re-execute the
      current unit.

   **Sub-agent failure flow**: if either `/linear-loom-research` or
   `/linear-loom-revise-plan` exits non-zero OR writes
   `RECOVERY-STATUS.json`, the inner-RPI sequence:
   - Does NOT write its own RECOVERY-STATUS.json (the sub-agent
     already did, and the loop body's pre-flight at the next
     `/ev-linear:ev-run` invocation will detect it and offer to
     resume).
   - Surfaces the failure to the operator with the sub-agent's
     recovery file path and the failed step.
   - Exits the unit with a clean error rather than partially
     proceeding.

   **On decline**: append the signals to the unit's `notes_for_pr`
   array in the checkin JSON so the substrate captures what was
   detected even when the operator chose not to act on it. Loop
   continues normally.

   **On single signal** (no concurrence): append the signal to the
   unit's `notes_for_pr` array in the checkin JSON:
   ```
   signal: <signal type>: <one-line description> (single signal; no revise offered)
   ```
   Loop continues normally.

   **On zero signals**: no action. Loop continues.

6. **Phase update.** After a checkin lands (per § Checkin write), update
   phase state per § Phase update with `--status=in-progress --phase=N`.
   The `linear-loom phase update` verb (Phase 6 U3) writes to the
   Linear ProjectMilestone state, which is the source-of-truth for
   phase status per DESIGN.md § 11.

7. **Checkpoint.** Free mode: after every deliverable. Sequential mode:
   after every deliverable **or** when the human explicitly asks.
   Refresh the PR per § Compose PR.

### Panel auto-derivation

The `agents` list passed to `/guild-validate` is computed from the
unit's file list at evaluation time, not hardcoded. The composition
rules live in `plugins/ev/docs/PANEL-COMPOSITION.md` (cross-plugin
reference — not duplicated in ev-linear).

1. **Collect file paths.** Take the unit's changed and created files.
   Practical recipe: `git status --short` minus any deletions, plus
   any freshly-authored untracked paths that will land in the artifact
   commit. Substrate-only mutations under `projects/<slug>/` (manifest
   updates from prior `linear-loom` verb runs) generally should be
   excluded — they shipped via the substrate itself, not as the
   unit's artifact.
2. **Derive the panel** per § Derive panel, passing the file paths
   from step 1. Use the verb's stdout as the `agents=` argument
   verbatim.
3. **Pass to `/guild-validate`.** Use the verb's stdout as the
   `agents=` argument verbatim.

Edge cases the verb handles, documented for reviewer awareness:

- **Empty file list** (substrate-only unit, no artifact files yet) →
  `evaluator-contract-fit`. Same single-evaluator behavior as ev.
- **Substrate-only files** (`.claude/agents/*.md`, skill `SKILL.md`,
  checkin `*.json`, `projects/**/{MANIFEST,PLAN}.md`) → contract-fit
  only.
- **Substrate scripts** (`.claude/scripts/**/*.ts`) → contract-fit
  + naming.
- **L-004 session-boundary constraint.** A newly-authored evaluator
  agent that didn't exist at session start is registered as of next
  session start. If the derive-panel output includes such an
  evaluator AND that evaluator was added during this session, drop
  it from the `agents=` list manually and note the manual override
  in the checkin's `Notes for the PR` section.

### Specialist-evaluator gate-then-review

When a unit's panel includes a **specialist evaluator** paired with
a `generator-*` agent (e.g. `evaluator-css-architecture` paired with
`generator-css-codemod`), the specialist runs as part of the
parallel panel with **elevated precedence** per
`plugins/ev/docs/PANEL-COMPOSITION.md`. The loop's
verdict-handling already does the right thing (any blocking finding
→ flagged); this section documents the *why*.

### Step 3. Phase close

- All deliverables accounted for.
- Full verification passes.
- Refresh the PR per § Compose PR so it reflects the final state.
- Update the phase per § Phase update with `--status=completed`.

## Output format

After each checkpoint and at phase close, report:

```
Phase <N> — <title>
Deliverables: <done>/<total>  (list with status)
Last checkin: <path>
PR: <url or "not yet opened">
Next: <deliverable name, or "phase complete">
```

## Message-driven redirects

Trigger: if the caller's message (from `/ev-linear:ev-run`) contains
a pattern like `address feedback on #<pr>` while this loop is active
on that PR's branch, branch into the flow below instead of continuing
the normal unit loop.

For "address feedback on #N":
1. Triage the comments per § Triage PR comments + draft responses.
2. Each `blocker` classification becomes a new unit.
3. Run the unit loop. Refresh the PR per § Compose PR when done.

## PR namespace stub note

linear-loom's `pr` namespace is a Phase 6 stub — `linear-loom pr
open/update/discover` are not implemented (Linear's native GitHub
integration owns the PR ↔ Issue linkage). The § Compose PR recipe
in this loop's substrate-compositions therefore falls back to the
operator running `gh pr create` / `gh pr edit` directly, with the
loop body documenting the gap rather than wrapping it. When a real
linear-loom-side PR-compose verb ships, the recipe upgrades and
this note can be removed.

## Rules

- **The human co-pilots.** Don't write long stretches without pausing.
  If a unit spans more than ~3 files or ~200 lines of new/changed code
  without a natural pause, split it.
- **Contract before execution.** Always. Even if the deliverable feels
  small.
- **Evaluator always runs.** Same as the confidence loop — never
  self-approve. Evaluator budget is 3 runs per unit (initial + 2
  retries); on the third flag escalate to the user.
- **Scope discipline.** One deliverable at a time in a given checkin.
- **Record corrections in the checkin.** If the user redirects a unit
  mid-flight, overrides a decision, or the evaluator flags something
  the generator defaulted to incorrectly, note it verbatim in the
  checkin JSON's `execution.corrections[]` array. ev-linear has no
  § Save session / § Capture finding pathway to promote them; the
  checkin's PR description body and the operator's conversation are
  the trace.
- **No griot.** Never invoke `bin/griot` from this loop's body. If
  the operator wants griot's rollup loaded around an ev-linear
  session, they invoke `/griot-use` manually.
- **No cross-plugin loop dispatch.** This skill is invoked by
  `/ev-linear:ev-run`, never by `/ev-run`. The two loops live in
  different plugins for a reason.
- **No emojis.**

## Failure modes

- User goes quiet mid-deliverable → stop, checkpoint whatever is safe.
  (No § Save session equivalent — linear-loom has no session-write
  surface. The conversation transcript + the partial checkin file
  are the only resume artifacts.)
- Evaluator flags 3× → escalate to user.
- Working tree dirty → stop.
- Inner-RPI sub-agent fails → surface the sub-agent's
  `RECOVERY-STATUS.json` path; exit the unit with a clean error
  rather than partially proceeding.
