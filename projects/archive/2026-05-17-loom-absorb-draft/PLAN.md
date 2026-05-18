# Absorb draft into loom + add research verb (master plan)

## Context

The `draft` and `loom` CLIs were originally split: `draft` for planning
(birthing a `PLAN.md`), `loom` for the project lifecycle (manifests,
phases, checkins, retros). In practice the seam is awkward — `draft
revise` is lifecycle work (a plan changing because the work changed),
not planning work. Carrying a separate `bin/draft` shim and
`/draft-plan` skill family is friction without payoff.

The architectural goal sitting behind the rename: make **RPI**
(Research → Plan → Implement) a first-class substrate loop, at two
scales:

- **Outer RPI** (project birth): `/loom-plan <topic>` is the single
  entry point. If no `RESEARCH.md` exists for the slug, the skill
  auto-spawns `/loom-research` as a fresh-context sub-agent first,
  reads the resulting `RESEARCH.md` as input, then drafts the PLAN.
- **Inner RPI** (mid-execution learning): `/ev-loop-interactive`'s
  two-signal scope-shift detection, when accepted, kicks off a
  research → revise sub-sequence (instead of today's single revise
  call), then resumes execution.

Composition of the families is the architecture: **research =
grill-me + whiteboard panel** (divergent / contextualizing);
**plan/revise = grill-me + evaluator panel** (convergent / auditing);
revise is polymorphic — it asks "mechanical or research-flavored?"
at start and routes accordingly.

Every grill-me interview has human/auto duality. Default is human;
`--mode=auto` opts into panel-driven autonomous resolution. Auto-mode
runs until the panel is silent (no new questions raised) OR a
two-budget shape is exhausted (per-decision rounds × per-session
decisions, defaults documented in `docs/AGENT-CONVENTIONS.md`).
Budget exhaustion writes a partial artifact + an `UNRESOLVED.md`
sidecar AND a `RECOVERY-STATUS.json` recovery file, then exits
non-zero.

**Sub-agent failures get real recovery**, not "stop and ask user":
when a sub-spawned skill fails (timeout, partial commit, exit
non-zero), the parent skill writes `RECOVERY-STATUS.json` at project
root capturing the failed step + resume instructions. On next
invocation of the same skill for the same slug, the skill detects
the file and offers to resume from where it left off.

**Griot integration**: the substrate's loops produce learnings that
flow back to the global pool. Every skill that surfaces a finding
with substrate-wide relevance writes directly to
`learnings/session-notes/` at the moment of signal — no batched
end-of-session capture. Two trigger types: agent self-tagging (a
whiteboard engineer or evaluator marks a finding `[portable]` in
their own output) and hardcoded rules in skill bodies (high-signal
events like inner-RPI triggers, budget-exhausted, scope-shift
accepts, drift always emit a session-note). Sub-agent invocations
always load the rollup at startup via `bin/griot use --as=llm`.

This project also bootstraps the marketplace repo itself for
self-development (vitest, conventions docs) and lifts the
conventions docs to a marketplace-rooted location.

## Scope

**In:**
- Bootstrap the marketplace repo: install vitest + devDeps so `npm
  test` runs.
- Lift `SUBSTRATE-COMPOSITIONS.md`, `LOOM-CONVENTIONS.md`, and
  author `AGENT-CONVENTIONS.md` at top-level `docs/`. Update
  `install.sh` to symlink `~/.agents/docs` → `<marketplace>/docs`.
  Update every loop / skill body referencing
  `projects/SUBSTRATE-COMPOSITIONS.md` to reference the
  marketplace-rooted path. `§ Capture finding` recipe must be
  present in `docs/SUBSTRATE-COMPOSITIONS.md` (port or author) so
  downstream phases can call it.
- Move `draft plan` → `loom plan` (verb + tests, behavior unchanged
  for the CLI move; skill body changes later).
- Move `draft revise` → `loom revise-plan` (verb + tests, same).
- Drop `draft read` entirely (no consumers).
- Add `loom research` verb (writes `RESEARCH.md` +
  `RESEARCH-NOTES.md`; auto-adopts loom substrate; supports
  `--no-loom`).
- Add `/loom-research` skill: grill-me, fact-based, evidence-first.
  Composes whiteboards **per domain shift** (full roster,
  self-recuse). Concrete domain-shift detection rule
  (no hand-wave): trigger requires (a) content-word vocabulary
  delta ≥ 40% vs the prior 6 messages of interview AND (b)
  LLM-detected stated focus-shift cue (the user or panel surfaces
  "let's talk about X now" / "I want to dig into Y" / similar
  reorientation). Rule documented in skill body with 3+ concrete
  example shifts and 3+ counter-examples. Whiteboard artifacts at
  `whiteboards/research-shift-NN-<topic>.md`. Human/auto duality
  with silent-panel = "no engineer raised a new question this
  round" and two-budget(3 rounds × 5 shifts).
- **Fact-check pass before RESEARCH.md commits**: research skill
  runs `evaluator-contract-fit` against the proposed RESEARCH.md
  with rubric "evidence-anchored: every claim cites a source or
  observable; opinion-shaped sentences flagged". Flagged → iterate
  in grill-me or auto-mode loop. Closes the context-pollution
  hole by enforcing fact-only discipline at write time.
- Rename `/draft-plan` skill → `/loom-plan`. Becomes the outer-RPI
  orchestrator: auto-discovers `RESEARCH.md` in the project root;
  if missing, auto-spawns `/loom-research` as a fresh-context
  sub-agent via Agent tool. Composes `evaluator-contract-fit` (via
  `bin/guild derive-panel` against the proposed PLAN.md) before
  commit. Human/auto duality with two-budget(3 × 10 decisions).
- Add `/loom-revise-plan` skill. First grill-me question always:
  "mechanical or research-flavored?" Mechanical → evaluators-only.
  Research-flavored → auto-spawn `/loom-research` sub-agent →
  evaluators on revised PLAN. Caller-supplied flavor flag for
  auto-mode.
- **Recovery flow** for sub-agent failures: any skill that spawns
  a sub-agent (/loom-plan → /loom-research; /loom-revise-plan →
  /loom-research; ev-loop inner-RPI → /loom-research + /loom-revise-plan)
  writes `RECOVERY-STATUS.json` at project root when the sub-agent
  fails or commits partial (UNRESOLVED.md present). On next
  invocation of the same parent skill for the same slug, detect
  the file and offer to resume from the recorded step. File shape
  documented in `docs/SUBSTRATE-COMPOSITIONS.md`. Resume semantics:
  research resumes from last completed shift; plan re-reads
  partial PLAN.md and continues grill-me from the next unresolved
  question.
- Embed grill-me into `/ev-loop-interactive`'s unit-contract
  negotiation step. Default: single approve/redirect for whole
  contract; skill walks ONLY ambiguous fields as separate questions.
- Inner RPI in `/ev-loop-interactive`: two-signal scope-shift accept
  path now spawns `/loom-research` sub-agent → spawns
  `/loom-revise-plan` sub-agent (research-flavored, pre-supplied) →
  re-reads manifest → resumes execution.
- Add auto-mode duality to `/loom-archive`. Existing grill-me retro
  interview gains auto-mode where both panels (whiteboards for
  reflective + evaluators for plan-vs-actual audit) drive question
  resolution. Two-budget(3 × 8).
- Reshape `/ev-run`'s ad-hoc clarifying prompts into grill-me +
  auto-mode pathway. Auto-mode resolves ambiguity via
  `evaluator-contract-fit`. Two-budget(3 × 3).
- New event types (~25) split across phases (research-* Phase 3;
  plan-* Phase 4; rpi-* Phase 5; auto-mode-* Phase 6).
- Griot integration distributed:
  - Phase 1 lands `§ Capture finding` recipe + `[portable]`
    marker convention in `docs/AGENT-CONVENTIONS.md` + sub-agent
    rollup-load convention.
  - Phase 3 (research): whiteboard `[portable]` scan +
    hardcoded `research-budget-exhausted` write.
  - Phase 4 (plan/revise): evaluator `[portable]` scan +
    hardcoded `plan-budget-exhausted`,
    `plan-revise-budget-exhausted`, `plan-research-auto-spawned`
    writes.
  - Phase 7 (cross-cutting griot): hardcoded writes for
    `scope-shift-detected` (even on decline),
    `rpi-inner-triggered`, `auto-mode-budget-exhausted`,
    manifest-vs-git drift in `/ev-run`; `/loom-archive` retro
    `[portable]` scan.
- Update the `§ Revise PLAN.md` recipe in
  `docs/SUBSTRATE-COMPOSITIONS.md` to call `bin/loom revise-plan`.
- Delete `bin/draft` shim, `cli/draft.ts`, `cli/verbs/draft.ts`,
  and the old `/draft-plan` skill file.
- Update `install.sh` to stop generating `bin/draft`.

**Out:**
- Reshaping the loom project file layout (`manifest.json`,
  `config.json`, `events.jsonl`, `checkins/`, `sessions/` stay
  as-is).
- Changing the `PLAN.md` / `INTERVIEW.md` document shape.
- Reworking `§ Revise PLAN.md` recipe semantics — only updating
  the CLI path it calls.
- Backwards-compatibility shims for `bin/draft`.
- Authoring net-new evaluator agents for plan or research shape
  audit. Reuse `evaluator-contract-fit` with rubric tweaks.
- TTY-based auto-mode detection. Explicit `--mode=auto`.
- A separate `/loom-rpi` skill or `bin/loom rpi` verb.
  `/loom-plan` IS the outer-RPI entry point.

**Deferred:**
- A `loom revise-research` verb.
- A `--from-research=<path>` flag on `loom plan` for cross-project
  research seeding.
- Archive-aware research dossiers.
- A first-class "auto-mode decision log" artifact.
- Auto-mode diminishing-returns budget extension.
- TTY-based auto-mode detection.
- A dedicated `evaluator-plan-shape` or `evaluator-research-shape`
  agent.

## Phases

### Phase 1: Bootstrap marketplace for self-development

One PR. Three deliverables (unified concept: make this repo
runnable for its own development AND framework-internally
referenceable):

**1.1 — Test harness:**
- Add `vitest` (+ minimal devDeps) to root `package.json`.
- Add `"test": "vitest run"` and `"test:watch": "vitest"` scripts.
- Add `node_modules/` to `.gitignore` if absent.
- Confirm existing `cli/**/*.test.ts` passes (regression baseline).

**1.2 — Conventions docs at marketplace root (bodies, not just
directory):**
- Create top-level `docs/` directory.
- **Port or author the BODY of**
  `docs/SUBSTRATE-COMPOSITIONS.md` including (at minimum) the
  recipes loops actually call: `§ State refresh`, `§ Phase update`,
  `§ Checkin write`, `§ Compose PR`, `§ Revise PLAN.md`,
  `§ Capture finding` (the griot-write recipe), `§ Triage PR
  comments`, `§ Derive panel`, `§ Append finding`, `§ Save
  session`. Each recipe documents the CLI call shape it wraps and
  its idempotency story.
- **Port or author the BODY of** `docs/LOOM-CONVENTIONS.md`
  documenting the loom artifact shapes (PLAN.md, INTERVIEW.md,
  manifest.json, config.json, events.jsonl, checkins/, sessions/,
  retros/, archive/), event vocabulary, and slug-resolution
  semantics.
- **Author `docs/AGENT-CONVENTIONS.md`** documenting: the
  `[portable]` marker convention for whiteboard engineers and
  evaluators; the sub-agent startup-brief convention (always
  `bin/griot use --as=llm` first); the `RECOVERY-STATUS.json`
  file shape and resume semantics; the two-budget shape default
  for auto-mode skills.
- Update `install.sh` to symlink `~/.agents/docs` →
  `<marketplace>/docs` (whole-dir pattern mirroring `cli` /
  `learnings`).
- Update every loop / skill body referencing
  `projects/SUBSTRATE-COMPOSITIONS.md` (cwd-relative) to reference
  the marketplace-rooted path.

**1.3 — Sanity check the doc lift didn't strand anything:**
- Repo-wide grep for `§ <Recipe>` patterns in loop bodies;
  cross-check every cited recipe has a body in
  `docs/SUBSTRATE-COMPOSITIONS.md`. Any miss is a blocker — author
  the body before merging.

**Verifies:** `npm test` green; `ls ~/.agents/docs/` shows all
three doc files; `grep -E "§ [A-Z]" .claude/skills/**/SKILL.md`
cross-checked against `docs/SUBSTRATE-COMPOSITIONS.md` shows no
dangling recipes; loop dry-run succeeds without "recipe not
found" warnings.

### Phase 2: Move draft plan + revise verbs into loom

One PR. Move `plan` and `revise` handlers from `cli/verbs/draft.ts`
into a new `cli/verbs/plan.ts` under loom. Wire into `cli/loom.ts`
as top-level `loom plan` and `loom revise-plan`. Move existing
tests alongside. Drop `draft read` (delete handler + tests).

No behavior changes — pure relocation. `bin/draft` keeps working
in this PR (entry imports the same handlers from the new module
path).

**Verifies:** `npm test` green; `bin/loom plan` and `bin/loom
revise-plan` work end-to-end against a scratch slug; existing
`bin/draft plan` and `bin/draft revise` still work (compat
preserved until Phase 8 deletes them).

### Phase 3: Add loom research (verb + whiteboard-composed skill + recovery)

One PR. Single conceptual change: introduce the research half of
the RPI loop.

**3.1 — CLI:** add `cli/verbs/research.ts`. Interface:

```
loom research <slug-or-topic> \
  --research-file=<path> \
  --notes-file=<path> \
  [--no-loom]
```

Writes `RESEARCH.md` + `RESEARCH-NOTES.md` at project root,
auto-adopts loom substrate by default, commits via existing git
seam. Add `cli/verbs/research.test.ts`.

**3.2 — Skill:** add `/loom-research`. Grill-me, fact-based,
citations first-class.

- **Domain-shift detection rule (concrete, not hand-wave)**: a
  shift fires only when (a) content-word vocabulary delta ≥ 40%
  vs prior 6 messages AND (b) LLM-detected explicit focus-shift
  cue. Skill body documents the rule with 3+ shift examples and
  3+ non-shift counter-examples.
- **Whiteboard composition per shift**: full registered roster
  via `/guild-whiteboard`. Engineers self-recuse off-topic.
- **Whiteboard artifacts**:
  `whiteboards/research-shift-NN-<topic>.md`. Raw per-engineer
  contributions inline in `RESEARCH-NOTES.md` under `## Shift N
  — <topic>` headings. Synthesized signal in `RESEARCH.md` under
  `## Whiteboard contributions`.
- **Fact-check pass before commit**: run
  `evaluator-contract-fit` against the proposed RESEARCH.md with
  rubric "evidence-anchored: every claim cites a source or
  observable; opinion-shaped sentences flagged". Flagged →
  iterate (grill-me prompts user; auto-mode iterates strawman).
  Closes the context-pollution risk by enforcing fact-only at
  write time rather than promising future-skill discipline.
- **Human/auto duality**: silent = no engineer raised a new
  question this round. Two-budget(3 rounds × 5 shifts).
  Budget-exhausted → partial `RESEARCH.md` + `UNRESOLVED.md`
  sidecar + `RECOVERY-STATUS.json` + exit non-zero.

**3.3 — Events:** emit `research-started`, `research-shift`,
`research-panel-spawned`, `research-panel-verdict`,
`research-fact-check-spawned`, `research-fact-check-verdict`,
`research-completed`, `research-budget-exhausted`.

**3.4 — Griot integration:** at each shift's whiteboard close,
scan engineer output for `[portable]` markers and write matching
findings to `learnings/session-notes/<date>-<slug>-research-shift-NN.md`
via `§ Capture finding`. Hardcoded write on
`research-budget-exhausted`. Sub-agent invocations of
`/loom-research` (from Phase 4's `/loom-plan` and Phase 5's
ev-loop inner-RPI) include `bin/griot use --as=llm` in startup
brief.

**Verifies:** `npm test` green; `bin/loom research <slug>`
produces both files; manual smoke of `/loom-research` shows a
real domain shift triggering the whiteboard panel; fact-check
pass catches an opinion-shaped sentence; `--mode=auto` runs to
convergence without prompts; `events.jsonl` shows expected new
types; `[portable]` finding in whiteboard output produces a
session-note file; sub-agent failure produces a
`RECOVERY-STATUS.json` that the next invocation detects.

### Phase 4: Rebuild plan + revise skills + outer RPI orchestration

One PR. Single conceptual change: introduce the plan/revise half
of the RPI loop and the orchestration that ties research to plan.

- **Rename `/draft-plan` → `/loom-plan`.** Update every shell
  invocation from `bin/draft plan` → `bin/loom plan`. Update
  failure-modes to suggest `bin/loom revise-plan`.
- **Outer-RPI orchestrator behavior in `/loom-plan`**: at session
  start, check for `RESEARCH.md` in the project root. Present →
  emit `plan-research-attached` event; proceed with research as
  input to strawman draft. Missing → emit
  `plan-research-auto-spawned` event; invoke `/loom-research` via
  Agent tool (fresh-context sub-agent) in auto-mode; wait;
  read the committed `RESEARCH.md`; proceed. Sub-agent
  failure → write `RECOVERY-STATUS.json` capturing the failed
  step and resume instructions; on next `/loom-plan` invoke for
  same slug, detect the file and offer to resume.
- **Evaluator composition for `/loom-plan`**: before shelling
  `bin/loom plan`, run `bin/guild derive-panel` against the
  proposed PLAN.md, pass returned evaluator list to
  `/guild-validate`. Findings surface to user or feed back into
  interview in auto-mode.
- **Human/auto duality for `/loom-plan`**: silent-OR-budget(3
  rounds × 10 decisions). Budget-exhausted → partial PLAN.md +
  `UNRESOLVED.md` + `RECOVERY-STATUS.json` + non-zero exit.
- **`/loom-revise-plan`**: first grill-me question always
  "mechanical or research-flavored?" Mechanical →
  evaluators-only, synthesize → shell `bin/loom revise-plan`.
  Research-flavored → auto-spawn `/loom-research` sub-agent
  (focused on the revision question) → use resulting research →
  evaluators on revised PLAN → commit. Auto-mode callers supply
  flavor as flag. Same recovery flow as `/loom-plan`.
- **Events (Phase 4 set)**: `plan-started`,
  `plan-research-attached`, `plan-research-auto-spawned`,
  `plan-panel-spawned`, `plan-panel-verdict`, `plan-completed`,
  `plan-budget-exhausted`, `plan-revise-started`,
  `plan-revise-flavor-{mechanical,research}`,
  `plan-revise-research-spawned`, `plan-revise-panel-spawned`,
  `plan-revise-panel-verdict`, `plan-revised`,
  `plan-revise-budget-exhausted`.
- **Griot integration**: evaluator output scan for `[portable]`
  at panel close; hardcoded writes on `plan-budget-exhausted`,
  `plan-revise-budget-exhausted`, `plan-research-auto-spawned`
  (the fact that a plan needed research is itself substrate
  signal); sub-agent startup brief includes
  `bin/griot use --as=llm`.

**Verifies:** Invoke each skill against a scratch slug
end-to-end. Outer-RPI smoke: `/loom-plan` against a project
lacking `RESEARCH.md` → research sub-agent fires, commits, plan
proceeds. Auto-mode smoke for each skill. `[portable]` evaluator
finding produces session-note. Sub-agent failure produces
`RECOVERY-STATUS.json` that next invocation detects and resumes.
Events emitted match the Phase 4 set.

### Phase 5: Inner RPI in /ev-loop-interactive

One PR. Single conceptual change: when scope-shift fires
mid-execution, kick off the inner R→P sub-sequence instead of
today's single revise call.

- Existing two-signal scope-shift concurrence rule is unchanged
  (signal sources: evaluator findings, user comments, whiteboard
  contradictions, phase boundaries).
- On accept (default in auto-mode):
  1. Emit `scope-shift-detected` event (every detected shift,
     regardless of accept/decline).
  2. Emit `rpi-inner-triggered` event.
  3. Spawn `/loom-research` via Agent tool (fresh-context
     sub-agent), focused brief = the new learning that triggered
     the shift.
  4. Spawn `/loom-revise-plan` via Agent tool, flavor pre-supplied
     as `research-flavored`, with the fresh `RESEARCH.md` as
     input.
  5. Re-read manifest (revision may have changed phase structure;
     if current phase is deleted, stop and surface).
  6. Emit `rpi-inner-completed`. Resume execution.
- Sub-agent failure flow: any sub-agent in steps 3-4 writes
  `RECOVERY-STATUS.json` with the failed-step context. Inner-RPI
  reports the failure, exits the unit with a clear error, allows
  next `/ev-run` to detect recovery state and continue.
- Decline path emits `rpi-inner-declined` (no research+revise
  fires).
- New events introduced in this phase: `scope-shift-detected`,
  `rpi-inner-triggered`, `rpi-inner-completed`,
  `rpi-inner-declined`.

**Verifies:** `npm test` green; synthetic two-signal scope-shift
in a scratch unit fires the inner-RPI sequence end-to-end;
research and revise sub-agents commit; manifest re-read picks up
revision; execution resumes on the right phase. Sub-agent
failure produces `RECOVERY-STATUS.json` and surfaces cleanly.
`events.jsonl` shows the expected new types.

### Phase 6: Grill-me + auto-mode embeddings across ev-loop / archive / ev-run

One PR. Single conceptual change: apply the same grill-me +
auto-mode duality pattern (already shipped in /loom-research,
/loom-plan, /loom-revise-plan) to three more surfaces, with one
consistent embedding shape.

- **`/ev-loop-interactive` unit-contract negotiation** (Step
  2.1): default single approve/redirect for whole contract;
  skill walks ONLY ambiguous fields (empty inputs, hedge-worded
  acceptance criteria, undefined disqualifiers) as separate
  grill-me questions. Auto-mode: `evaluator-contract-fit` audits
  contract against unit inputs; silent-OR-budget(3 rounds × 5
  ambiguities per unit).
- **`/loom-archive` auto-mode**: existing grill-me retro
  interview gains `--mode=auto` pathway. Both panels participate:
  whiteboards drive reflective retro questions ("what did we
  learn"); evaluators drive plan-vs-actual audit ("what shipped
  vs what was planned"). Silent-OR-budget(3 × 8).
- **`/ev-run` grill-me + auto-mode**: reshape ad-hoc clarifying
  prompts (ambiguous redirect, drift detection, ambiguous
  next-phase) into grill-me walks. Auto-mode resolves via
  `evaluator-contract-fit` (reads redirect against open PRs;
  drift against expected manifest; candidate phases against
  PLAN.md descriptions). Silent-OR-budget(3 × 3).
- New events introduced in this phase: `auto-mode-entered`,
  `auto-mode-budget-exhausted`, `auto-mode-converged`.

**Verifies:** `npm test` green; manual smoke of
`/ev-loop-interactive` shows reworked contract step (ambiguous
field walks; clean approve when contract is unambiguous); manual
smoke of `/loom-archive --mode=auto` runs both panels to
convergence on a scratch project; manual smoke of `/ev-run` with
an ambiguous redirect runs grill-me; `--mode=auto` runs
`evaluator-contract-fit` resolution; `events.jsonl` shows the new
auto-mode types.

### Phase 7: Cross-cutting griot writes for new events

One PR. Single conceptual change: wire the griot-write triggers
introduced by Phases 5 and 6 into `§ Capture finding` calls so
they actually emit session-notes.

- **Hardcoded writes for cross-cutting events** (introduced in
  Phases 5–6):
  - `scope-shift-detected` writes a session-note even on decline
    (the noticing IS signal worth keeping: "we saw this kind of
    drift pattern").
  - `rpi-inner-triggered` writes trigger context + revision
    rationale (high-signal: "what kind of learning forces
    revisions").
  - `auto-mode-budget-exhausted` writes the exhaustion context
    + skill name (substrate-wide: "which auto-mode situations
    fail to converge").
  - `/ev-run` writes a session-note on manifest-vs-git drift
    detection (substrate-wide: "what kinds of drift happen in
    practice").
- **`/loom-archive` retro `[portable]` scan**: at retro close,
  scan both whiteboard and evaluator panel outputs for
  `[portable]` markers; write matching findings to
  `learnings/session-notes/<date>-<slug>-archive-retro.md`.
- **Sub-agent startup brief includes `bin/griot use --as=llm`**
  in every cross-skill Agent tool invocation (inner-RPI's
  research + revise sub-spawns; any other cross-skill spawns
  introduced in Phases 5–6).

**Verifies:** `npm test` green; trigger each new event in a
scratch project; confirm session-note file appears in
`learnings/session-notes/` after each trigger. Specifically:
synthetic scope-shift produces session-note; synthetic
inner-RPI trigger produces session-note with revision rationale;
forced auto-mode budget exhaustion produces session-note;
synthetic manifest-vs-git drift produces session-note;
`[portable]` marker in a retro panel output produces
session-note. Sub-agent invocations include the rollup-load in
their startup transcript.

### Phase 8: Cleanup + delete bin/draft

One PR. The satisfying close-the-loop change. Single conceptual
change: retire the deprecated `bin/draft` surface and the
`/draft-plan` skill now that the new home is fully wired.

- Update the `§ Revise PLAN.md` recipe in
  `docs/SUBSTRATE-COMPOSITIONS.md` to call `bin/loom revise-plan`.
- Update `/ev-loop-interactive`, `/ev-loop-confidence`, `/ev-run`,
  `/loom-archive` SKILL.md copy where `bin/draft` or
  `/draft-plan` still appear.
- Delete `bin/draft` shim, `cli/draft.ts`, `cli/verbs/draft.ts`.
- Delete the original `/draft-plan` skill file.
- Update `install.sh` to stop generating `bin/draft`.
- Update `README.md` if it references draft.

**Verifies:** `npm test` green; `install.sh` produces a clean
state with only `bin/loom`, `bin/guild`, `bin/griot`; repo-wide
grep for `bin/draft`, `cli/draft`, `/draft-plan` returns nothing
(other than this project's own self-references in PLAN.md /
INTERVIEW.md / archived checkins).

## Dependencies

- **Phase 1 must merge first** — no `npm test`, no recipe docs
  (including `§ Capture finding` needed by Phases 3, 4, 7).
- Phase 2 depends on Phase 1.
- Phase 3 depends on Phase 1 (test harness + `§ Capture finding`
  recipe).
- Phase 4 depends on Phase 1, Phase 2 (skill shells `bin/loom
  plan`), and Phase 3 (`/loom-research` exists for auto-spawn).
- Phase 5 depends on Phase 3 + Phase 4 (inner-RPI sub-agents
  invoke both).
- Phase 6 depends on Phase 1 (auto-mode shape documented in
  `docs/AGENT-CONVENTIONS.md`) + the relevant skills targeted
  (no hard code dependency on 5).
- Phase 7 depends on Phase 5 + Phase 6 (the events to write
  exist only after these land).
- Phase 8 depends on all preceding phases.

Recommended landing order: **1 → 2 → 3 → 4 → 5 → 6 → 7 → 8**.
Phases 5 and 6 are independent in code; 6 can land before 5 if
review bandwidth shapes it that way (matches the "ev-run /
ev-loop changes ship before final cleanup" implicit user ask).

## Verification

- `npm test` — full suite green at each phase (Phase 1 onward).
- Per-phase manual smoke against scratch slug; per-phase
  verification list above defines the specific checks.
- Auto-mode smoke (Phase 3 onward): `--mode=auto` invocation,
  panel drives to convergence without user prompts;
  budget-exhausted produces partial + `UNRESOLVED.md` +
  `RECOVERY-STATUS.json`.
- Sub-agent recovery smoke (Phase 3 onward): force a sub-agent
  failure; confirm `RECOVERY-STATUS.json` lands; re-invoke parent
  skill; confirm resume offer fires.
- Phase 7 gate: every new event type from Phases 3–6 produces a
  session-note when triggered by hardcoded rules or `[portable]`
  marker.
- Phase 8 gate: repo-wide grep returns only self-references.

## Risks

- **Whiteboard composition cost stacking**: per-shift × full-
  roster × per-decision budget × per-session budget. Worst case
  ~120 agent calls per research session. *Mitigation*: the
  two-budget(3 × 5) hard cap; spawn counts surface in
  `RESEARCH-NOTES.md`; budget exhaustion writes recovery file
  with partial artifact. Real teeth: the cap fires, not "we'll
  monitor".
- **Sub-agent invocation failures**: timeout, partial commit,
  hard error. *Mitigation* (real recovery, not just "stop"):
  parent skill writes `RECOVERY-STATUS.json` with failed-step
  context + resume instructions; next invocation of the same
  parent skill for the same slug detects the file and offers to
  resume from the recorded step. Resume semantics documented in
  `docs/AGENT-CONVENTIONS.md` per skill (research: from last
  completed shift; plan: from next unresolved question; revise:
  from the flavor-routing point).
- **Context pollution risk re-enters when /loom-plan reads
  RESEARCH.md into its main context**. *Mitigation* (enforced,
  not promised): Phase 3 introduces a fact-check pass —
  `evaluator-contract-fit` against the proposed RESEARCH.md
  before commit, rubric "evidence-anchored: every claim cites a
  source; opinion-shaped sentences flagged". Pollution risk is
  bounded by the write-time gate, not future-skill discipline.
- **Domain-shift detection misfires**. *Mitigation* (concrete
  rule, not hand-wave): shift requires (a) content-word
  vocabulary delta ≥ 40% AND (b) LLM-detected stated focus
  cue. Skill body documents the rule with 3+ shift examples and
  3+ counter-examples. False positives still possible; rule
  iteration tracked via `research-shift` event analysis after
  real use.
- **Inner-RPI churn during execution**: scope-shift fires
  repeatedly, execution stops/starts. *Mitigation*: two-signal
  concurrence rule already prevents trigger-happy shifts;
  decline path is the default ("note only, continue"); accept
  is always explicit.
- **Event-type explosion (~25 new types)**: real schema growth
  downstream consumers must handle. *Mitigation*: types cluster
  by skill (research-*, plan-*, rpi-*, auto-mode-*); event
  schema remains additive (no version bump); existing
  consumers (manifest, retro, archive) read by name not by
  enumeration.
- **Recipe references in conventions docs missed in Phase 1
  port**. *Mitigation*: Phase 1.3 grep cross-check is blocking
  for Phase 1 merge; Phase 8 grep gate catches any stragglers.
- **`/loom-research` interview style feels too similar to
  `/loom-plan`**, users conflate them. *Mitigation*: skill
  bodies contrast explicitly with example questions; fact-check
  pass in Phase 3 enforces the difference materially.
- **Lifting docs to marketplace-root breaks external consumers
  that referenced the old path**. *Mitigation*: none needed —
  user is sole consumer.
- **Renaming `/draft-plan` → `/loom-plan` breaks muscle memory**.
  *Mitigation*: one-time cost; no alias.
- **`bin/draft` deletion orphans in-flight projects** that
  haven't adopted the new verbs. *Mitigation*: Phase 8 is
  cleanup; land 1–7 first; user controls when 8 merges.
- **Known dependency on griot pipeline**: session-notes/ noise
  from over-liberal `[portable]` tagging AND sub-agent rollup-
  load token cost both rely on `/griot-compact`'s existing
  downstream filter and on rollup-density discipline. We are
  *adding writers*, not changing filters. Accept as a documented
  dependency, not a risk we can locally mitigate: if signal-to-
  noise drops or rollup grows uncomfortably, it's a
  `/griot-compact`-side fix, not a problem to address in this
  project.

## Open questions

- Where in the marketplace do the docs land — `docs/`,
  `conventions/`, `substrate-docs/`? Going with flat `docs/`.
- Should `loom plan` accept a `--from-research=<path>` flag for
  cross-project research seeding? Deferred — auto-discovery
  covers the default case.
- How should auto-mode "decision logs" be persisted for human
  audit? For now: panel verdicts thread through `events.jsonl`;
  decisions visible in synthesized artifact bodies. First-class
  log deferred.
- Auto-mode diminishing-returns budget extension — worth it for
  long research sessions; first cut goes with simple
  silent-OR-budget rule.
- TTY-based auto-mode detection — explicit flag for first cut.
- Domain-shift threshold (40% vocab delta) — tuned by iteration
  after real use; initial value is a first-cut guess to be
  refined.

## Decisions

- **RPI is the outer loop of every project, at two scales**.
  Outer: project birth via `/loom-plan` auto-orchestrating
  research. Inner: mid-execution scope-shifts trigger
  research → revise → resume. Closes off the alternative of
  treating planning, research, and execution as fully separate
  user-managed phases.
- **Research = grill-me + whiteboard panel.
  Plan/Revise = grill-me + evaluator panel**. Closes off the
  alternative of one composition for all skills.
- **Whiteboards spawn per domain shift in `/loom-research`,
  full registered roster, engineers self-recuse**. Closes off
  topic-detection subsetting and explicit user-picked rosters.
- **`/loom-plan` is the single outer-RPI entry point**.
  Closes off a separate `/loom-rpi` skill or `bin/loom rpi`
  verb.
- **Sub-agent (Agent tool, fresh context) is the pattern for
  one skill invoking another for context/audit purposes**.
  Closes off same-context Skill-tool invocation for these
  cases. Trade-off accepted: sub-agents run in auto-mode (no
  human in their context).
- **`/loom-revise-plan` routes via first-question: mechanical
  vs research-flavored**. Closes off heuristic detection from
  the diff.
- **Inner RPI triggered by existing two-signal scope-shift
  concurrence rule, accept path spawns research+revise**.
  Closes off (a) more-aggressive single-signal trigger and
  (b) always-revise-without-research path.
- **Grill-me embedded in five surfaces** (three planning
  skills + ev-loop unit-contract + loom-archive + ev-run),
  with **one consistent two-budget shape**: per-decision
  rounds (default 3 everywhere) + per-session decisions
  (skill-specific defaults documented in
  `docs/AGENT-CONVENTIONS.md` — 5 shifts research, 10
  questions plan, 8 questions archive, 5 ambiguities
  ev-loop unit, 3 ambiguities ev-run dispatch). Closes off
  per-skill bespoke budget shapes.
- **Auto-mode triggered by explicit `--mode=auto` flag, never
  inferred**. Closes off TTY/env-based auto-detection.
- **Auto-mode locus = skills only**. Closes off CLI-side
  panel-driven authoring.
- **Auto-mode initial draft = skill strawman from one-line
  topic**. Closes off caller-supplied seed file and
  panel-authored-from-scratch alternatives.
- **Auto-mode stop = silent panel OR two-budget exhaustion**;
  budget-exhausted writes partial + `UNRESOLVED.md` +
  `RECOVERY-STATUS.json` + non-zero exit. Closes off
  silent-only (runaway risk) and budget-only (never converges)
  alternatives.
- **Silent whiteboard panel = no engineer raised a new
  question this round**. Closes off stricter (all-recuse) and
  looser (no contradictions) alternatives.
- **Whiteboard artifacts at
  `whiteboards/research-shift-NN-<topic>.md`**, monotonic
  numbering, reuses existing dir.
- **`/loom-plan` auto-discovers RESEARCH.md**; no flag
  required.
- **Conventions docs at marketplace `docs/`, symlinked via
  `~/.agents/docs`**. Adopted projects need no per-project
  setup.
- **`/loom-archive` auto-mode uses both panels** —
  whiteboards for reflective + evaluators for plan-vs-actual.
- **Event-type granularity is full** — distinct names per
  conceptually-distinct event. Closes off generic
  `panel-spawned` / `rpi-event` with detail-field
  discrimination.
- **Flat top-level verbs** (`loom plan`, `loom research`,
  `loom revise-plan`). Closes off namespaced
  `loom plan create/revise`.
- **`draft read` dropped entirely** rather than ported.
  Closes off `loom plan-read`.
- **No backwards-compat shim** for `bin/draft`. Closes off
  alias-during-transition.
- **Two research artifacts (`RESEARCH.md` + `RESEARCH-NOTES.md`)
  mirroring `PLAN.md` + `INTERVIEW.md`**.
- **Move existing draft tests rather than rewriting them**.
- **Griot integration is write-immediate, not session-close
  batched**. Closes off the alternative of batched end-of-
  session capture.
- **Two-trigger model for griot writes**: agent self-tagging
  via `[portable]` marker + hardcoded rules for
  intrinsically-portable events. Closes off "only hardcoded"
  and "only self-tagging" alternatives.
- **Sub-agent invocations always load the rollup at startup**.
  Closes off context-inheritance and skip-on-spawn
  alternatives.
- **`/griot-compact` and the rest of the griot pipeline are
  unchanged**. We're adding writers, not filters. Closes off
  griot-pipeline-revision scope creep.
- **Fact-check pass at RESEARCH.md write time enforces
  research's evidence-only discipline**. Closes off the
  alternative of trusting skill-prompt discipline alone.
- **Sub-agent failure recovery is real, via
  `RECOVERY-STATUS.json`**. Closes off "stop and ask user to
  re-invoke" non-recovery.
- **Domain-shift detection is concrete (40% vocab delta AND
  stated focus cue)**, with documented iteration over time.
  Closes off purely-LLM-judged or purely-vocab-only
  alternatives.
- **Phase 8 deletes `bin/draft` outright**, after Phases 1–7
  have fully wired the new home.

## Revision log


- 2026-05-18 — Evaluator-driven master plan: split Phase 5 into 5a-d (now 8 phases); real teeth on 3 risk mitigations (RECOVERY-STATUS.json for sub-agent failures, fact-check pass for RESEARCH.md, concrete domain-shift criteria); Phase 1 doc bodies explicit with grep cross-check; decisions tightened to close off alternatives; griot integration distributed across phases

