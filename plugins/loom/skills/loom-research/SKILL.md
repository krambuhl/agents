---
name: loom-research
description: >-
  Birth a fact-anchored RESEARCH.md via relentless grill-me interview,
  with domain-shift detection that spawns a plan panel per shift
  and an evaluator-contract-fit fact-check pass before commit. Composes
  /guild-plan for panel rounds and /guild-validate for the
  fact-check gate; dispatches the deterministic file IO through
  `bin/loom research`. Supports human-paired and `--mode=auto` flows
  with the substrate two-budget(3 rounds × 5 shifts). Use when the user
  wants a research dossier whose every claim cites a source or
  observable.
argument-hint: "<topic or short description> [--mode=auto] [--mode=amend]"
user-invocable: true
disable-model-invocation: true
allowed-tools: Read, Write, Bash, Skill, AskUserQuestion
---

# /loom-research

Birth a research dossier by interviewing the user (or the auto-panel)
relentlessly, detecting domain shifts in real time, spawning a
plan per shift, fact-checking the synthesized text against an
evidence-anchored rubric, and committing two artifacts via the loom
CLI: `RESEARCH.md` (synthesized, evidence-anchored) and
`RESEARCH-NOTES.md` (raw interview + per-engineer plan
contributions). The skill is the research half of the RPI loop — the
output is consumed by `/loom-plan` (Phase 4) or by `/ev-loop-interactive`'s
inner-RPI hop (Phase 5).

This skill is the canonical entry point for grounded research. The
grill-me posture is fact-anchored — every claim is asked to name its
source or observable before it lands in `RESEARCH.md`. Opinion-shaped
sentences are flagged at the fact-check gate, not at commit time.

**Format references**:
- `docs/AGENT-CONVENTIONS.md` § Auto-mode and the two-budget shape
  (the convergence rule + the 3 × 5 default for `/loom-research`).
- `docs/AGENT-CONVENTIONS.md` § Recovery from sub-agent failures
  (`RECOVERY-STATUS.json` shape + lifecycle).
- `docs/SUBSTRATE-COMPOSITIONS.md` § Capture finding (the griot
  integration pathway for `[portable]` markers).

## Inputs

- `<topic or short description>` — what the research is about. Often
  ill-defined when the skill starts; the grill-me first half is about
  pressing that into concrete questions.
- `--mode=auto` (optional) — run without human input. Auto-mode uses
  the registered plan roster as the panel and the substrate
  two-budget as the convergence cap. See § Human / auto duality.
- `--mode=amend` (optional) — research INTO an existing dossier rather
  than scaffolding a fresh one. The grill-me + research loop runs as
  normal, but instead of `loom research init` (which refuses on a
  committed RESEARCH.md), each surfaced fact is appended to the existing
  canon via `loom research append` with provenance. See § Amend mode.
  Composable with `--mode=auto` (`--mode=auto,amend`).
- `--from-recovery` (optional) — explicit resume signal. If
  `RECOVERY-STATUS.json` exists at the project root and the
  `parent_skill` matches `/loom-research`, the skill offers to resume
  (interactive) or auto-resumes (auto-mode) regardless of this flag —
  this flag forces the resume path without asking.

## Process

### 1. Pre-flight + recovery check

- Run `Bash("griot use --as=llm")` to load the learnings rollup
  per the substrate startup-brief convention (rollup may be empty;
  status line in stdout reports the load result).
- Resolve the slug from the topic (kebab-case derivation, same as
  `/loom-plan`'s slug-proposal step). If the user passed a full
  `<YYYY-MM-DD>-<slug>` form, use it verbatim.
- Check for `projects/<slug>/RECOVERY-STATUS.json`:
  - If present AND `parent_skill === '/loom-research'`, surface the
    failure context (`failed_step`, `context.shift_number`, partial
    `RESEARCH.md` snippet if applicable) and offer to resume. In
    auto-mode, auto-accept resume. The resumed run picks up at
    `context.resume_from` (typically the next un-completed shift).
  - If present AND `parent_skill !== '/loom-research'`, stop with
    an error pointing the user at the named parent skill. Two skills
    don't share a single recovery file by design.
  - If absent, proceed to step 2.

### 2. Frame the topic

Treat `$ARGUMENTS` as the topic. If empty or thin, ask the user what
they're researching. Otherwise summarize back what you heard in one
sentence and ask the user to confirm or refine before pressing into
the interview.

In auto-mode, frame the topic by spawning the registered plan
roster against the topic-as-given (using `/guild-plan`) and
treating the first round of engineer questions as the frame.

### 3. Grill-me interview with shift detection

Walk the topic by asking concrete, evidence-seeking questions. For
each question:

- **Recommend an answer** before asking — opinionated, grounded in
  whatever sources you can cite (project files, repo state, web
  fetch results if the topic warrants).
- Ask **one** question at a time. Wait for the answer.
- For every claim the user (or you) makes, prompt for the **source
  or observable**: a file path, a URL, a measurable signal, a named
  document, a person responsible. Mark claims without a source as
  candidates for the fact-check pass.

In auto-mode, the "user" is the plan panel spawned at frame
time. Each round, the panel raises 0-N new questions; the skill
resolves them one at a time against the panel itself. A round with
zero new questions is the **silent-panel** signal — convergence.

#### Domain-shift detection rule

A domain shift fires when **both** of the following are true:

1. **Vocabulary delta ≥ 40%** — the content-word vocabulary of the
   user's last message (or the panel's last round) overlaps the
   prior 6 messages of interview by less than 60%. Content words =
   nouns, verbs, adjectives, proper nouns; stopwords excluded.
   Mechanically: tokenize, lowercase, strip stopwords, compare set
   intersection / set union of the last message vs the union of the
   prior 6 messages' content-word sets. < 0.6 → ≥ 40% delta.
2. **Stated focus-shift cue** — the user or panel says (or paraphrases)
   something explicitly reorienting: "let's talk about X now", "I
   want to dig into Y", "the more interesting question is Z", "shifting
   gears to W", "actually the real question is V", "now consider Q".
   The skill detects this in the message text; it's a soft pattern,
   not a regex match.

**Both** must fire for the same message. Single signals don't trigger
a shift — vocabulary drift happens naturally as a domain widens, and
"let's talk about X" can be a refinement of the same domain.

**Example shifts** (both signals fire):

- After 6 messages about React's `useEffect` cleanup semantics, the
  user says: "OK let's switch to talking about CSS Modules and the
  token pipeline." (cue + ≥ 40% vocab delta — `useEffect`, `cleanup`,
  `subscription` → `tokens`, `pipeline`, `Figma`.)
- After 6 messages about CI cost optimization, the panel raises: "We
  should dig into the on-call rotation impact — those are the people
  who'll see this fail at 2am." (cue + delta — `runner-minutes`,
  `parallelization`, `cache` → `on-call`, `incident`, `paging`.)
- After 6 messages about Postgres index choice for a write-heavy
  table, the user says: "Actually the more interesting question is
  what we do when this table eventually outgrows a single node."
  (cue + delta — `BRIN`, `pg_stat_statements`, `vacuum` → `sharding`,
  `Citus`, `partitioning`.)

**Counter-examples** (one signal at most — no shift):

- After 6 messages about `useEffect`, the user says: "Let's also
  press on whether the `useLayoutEffect` variant has the same
  cleanup behavior." (Cue-shaped phrasing but vocab overlap is high
  — same domain, refinement not shift.)
- After 6 messages about token pipeline, the user says: "What about
  the Figma → CSS variable export step?" (Vocab delta is high
  because the next layer of pipeline introduces new words, but
  there's no explicit focus-shift cue — it's a follow-up question,
  not a reorientation.)
- After 6 messages about CI, the user pastes a stack trace. (Vocab
  delta is high but no cue and no signal of intentional reorientation
  — it's evidence for the current topic, not a shift.)

When a shift fires, increment the shift counter, capture the new
topic in a one-sentence summary, append an entry to
`RESEARCH-NOTES.md` under `## Shift N — <topic>`, and emit a
`research-shift` event. Proceed to step 4 for the panel composition.

### 4. Plan composition per shift

For each detected shift:

- Resolve the **full registered plan roster** via
  `Glob(".claude/agents/plan-*.md")`. Engineers self-recuse
  off-topic — there's no domain-shape filtering at this layer; the
  skill spawns the whole roster and trusts each engineer to declare
  inapplicability when it doesn't apply (consistent with the
  evaluator non-applicability pattern documented in
  `agents/evaluator-base.md`).
- Compose a plan artifact path:
  `projects/<slug>/plans/research-shift-NN-<topic-slug>.md`
  where `NN` is the zero-padded shift number and `<topic-slug>` is
  a kebab-case derivation of the shift's one-sentence topic.
- Invoke `/guild-plan` via the `Skill` tool with
  `engineers=<resolved roster>`, `brief=<shift topic + relevant
  context from the interview so far>`, `plan=<path>`. Emit a
  `research-panel-spawned` event with the engineer list.
- Wait for the panel's response. Aggregate the round's contributions.

Append raw per-engineer contributions to `RESEARCH-NOTES.md` under
the `## Shift N — <topic>` heading (verbatim, attributed). Synthesize
the load-bearing signal into `RESEARCH.md` under a `## Plan
contributions` section — one synthesized paragraph per shift, each
citing the plan artifact path.

Emit a `research-panel-verdict` event with:
- `verdict: 'silent'` if no engineer raised a new question this round
  (convergence on this shift; move to next shift or to fact-check).
- `verdict: 'questions-raised'` with `question_count` if engineers
  raised follow-up questions (resolve them via the interview loop
  before moving on; engineers' questions feed back into step 3).

#### Griot `[portable]` scan

At each plan close, scan each engineer's contribution for
`[portable]` markers (the convention is documented in
`docs/AGENT-CONVENTIONS.md`). For each marker found, write a
session-note via `§ Capture finding` (the
`bin/griot capture --evaluator-finding=...` pathway — the verb's
classification names need extension in a future workstream to cover
plan-portable markers; for now, document the capture intent
here and accept the verb-shape gap as a Phase 7 follow-up).

### 5. Fact-check pass

After the interview converges (silent panel or interview-exhausted
shifts), but **before** the commit:

- Compose the candidate `RESEARCH.md` (synthesized from interview
  answers + plan contributions).
- Write it to a temp file `/tmp/loom-research-<slug>.md`.
- Invoke `/guild-validate` via the `Skill` tool with
  `agents=evaluator-contract-fit` and a packet whose Contract section
  carries an **evidence-anchored rubric**: "Every factual claim
  cites a source or observable. Opinion-shaped sentences are flagged.
  Speculative claims are flagged unless explicitly marked as
  hypotheses." Emit a `research-fact-check-spawned` event.
- The evaluator returns a verdict. Emit a `research-fact-check-verdict`
  event with the verdict shape:
  - `verdict: 'approved'` — proceed to step 6.
  - `verdict: 'flagged'` with `flag_count` — iterate. In the
    interactive flow, grill the user on each flagged claim ("Where
    does this come from?"). In auto-mode, the skill iterates by
    pressing the panel against each flagged claim's sentence and
    rewriting until approved or the round budget exhausts on that
    claim.

A claim that fails fact-check after the per-decision round budget
(3 rounds) is treated as **unresolved** — the skill appends it to
`UNRESOLVED.md` and removes it from the candidate `RESEARCH.md`.
This is the rare case where the fact-check pass is unable to either
ground the claim or remove it; the skill preserves the per-session
work and surfaces the unresolved item for follow-up.

### 6. Write temp files + commit via the CLI

Write the two candidate files to temp paths:

```
/tmp/loom-research-<slug>.md           ← synthesized RESEARCH.md
/tmp/loom-research-notes-<slug>.md     ← raw interview + plans
```

Invoke:

```
Bash("loom research init <slug-or-topic> \
  --research-file=/tmp/loom-research-<slug>.md \
  --notes-file=/tmp/loom-research-notes-<slug>.md")
```

`loom research` is a subverb family (`init`, plus `append`/`show`); the
scaffold-from-prepared-files behavior is `init`. The bare `loom research
<slug>` form is no longer valid.

The CLI auto-adopts loom substrate by default and emits
`research-started` + `research-completed` events itself (see Phase
3.1). The skill does NOT emit these — they're CLI-owned.

If the CLI errors (`research-exists-committed` is the common one when
re-running on a committed project), surface the error verbatim and
stop — unless the intent is to ADD to the existing canon, which is
what `--mode=amend` is for (see § Amend mode). The user resolves and
re-invokes (often with `--mode=amend`).

### 6a. Amend mode (`--mode=amend`)

When the dossier already exists and the goal is to grow it — not
replace it — run the normal grill-me + research loop to surface new
facts, then commit each as a provenance-stamped block instead of
calling `init`. For each surfaced fact (or coherent group of facts
under one heading), write the prose to a temp file and append:

```
Bash("loom research append <slug> \
  --section='<heading>' \
  --fact-file=/tmp/loom-research-fact-<slug>-<n>.md \
  --citing='<where this fact came from>'")
```

`append` is append-only and stamps each block with provenance
(`slug`, the in-progress `phase`, the latest session id, a timestamp,
and `--citing`) derived from the substrate — the skill passes only
the section, the prose, and the citation. It never edits prior blocks.
Read back with `loom research show <slug> [--section=<heading>]`.
Amend mode does NOT call `init`, so the `research-exists-committed`
guard never trips. The CLI owns the commit per appended block.

### 7. Report

One short paragraph in this shape:

```
Created research dossier: <topic>
Location: projects/<slug>/
Files: RESEARCH.md, RESEARCH-NOTES.md, manifest.json, config.json, events.jsonl, plans/research-shift-*.md
Shifts completed: <N>
Fact-check: <approved | N flagged claims resolved>
Next: run /loom-plan <slug> to compose a PLAN.md grounded in this research, OR cite the dossier from an /ev-loop-interactive inner-RPI hop.
```

## Human / auto duality

Per `docs/AGENT-CONVENTIONS.md` § Auto-mode and the two-budget shape,
this skill runs in two modes:

- **Human-paired** (default): the user is in the loop for every
  question and every shift. The interview pace is conversational.
  The skill surfaces flagged claims at the fact-check gate one at a
  time and waits for grounding before re-running the check.
- **Auto** (`--mode=auto`): the registered plan roster
  substitutes for the user. Convergence is reached when a round
  produces no new questions (**silent panel**) OR when the
  two-budget caps out.

The substrate default for this skill (from `AGENT-CONVENTIONS.md`):
- **Per-decision rounds**: 3 (rounds of panel pressure per shift /
  per fact-check flag).
- **Per-session shifts**: 5 (total shifts processed before
  budget-exhaust).

If the per-session shift budget caps out before the topic converges,
the skill writes three artifacts at the project root and exits
non-zero per the budget-exhausted recovery flow:

1. Partial `RESEARCH.md` (whatever was synthesized through the last
   converged shift).
2. `UNRESOLVED.md` — the shifts that did not complete + any
   fact-check flags that didn't ground.
3. `RECOVERY-STATUS.json` — the resume file (see § Recovery flow).

The skill also emits a `research-budget-exhausted` event with
`shifts_completed`, `rounds_completed`, and `reason: 'shift-budget' |
'round-budget'`.

## Recovery flow

The `RECOVERY-STATUS.json` file shape, path, single-instance
lifecycle, concurrency assumption, and resume-semantics contract are
documented in `docs/AGENT-CONVENTIONS.md` § Recovery from sub-agent
failures. This skill follows that shape verbatim; no extension or
override. Skill-specific use of the existing fields:

- `parent_skill`: `/loom-research`.
- `failed_step` and `resume_from`: one of `shift-N` (per shift
  number), `fact-check` (per fact-check round), or
  `sub-agent-spawn` (per `/guild-plan` or `/guild-validate`
  invocation).
- `context`: carries the current shift number, the last shift's
  one-sentence topic, the path to the partial `RESEARCH.md` temp
  file, and any unresolved fact-check claims that haven't yet
  grounded or been moved to `UNRESOLVED.md`.

On re-invocation against a slug with an existing
`RECOVERY-STATUS.json` whose `parent_skill` is `/loom-research`, the
skill reads the file, surfaces the context to the user (or
auto-accepts in auto-mode), and resumes from `resume_from`. After a
successful resume that produces a committed `RESEARCH.md`, the skill
deletes `RECOVERY-STATUS.json` per the convention's removal rule.

The hardcoded `research-budget-exhausted` write also captures the
failure pattern into the griot learnings system via § Capture finding
(the `bin/griot capture --evaluator-finding=<classification> ...`
pathway). The current classification surface (`recurring` plus
`generator-antipattern` / `catalog-gap` / `evaluator-conflict` /
`sanctioned-exception` as reserved-but-not-yet-implemented) does not
include a precise match for "budget-exhausted research session"; the
skill uses the closest match (`catalog-gap` once the verb supports it;
falls back to skipping the capture today and emits a one-line
`research-budget-exhausted` event with the exhaustion detail as the
only record). PLAN.md Phase 3.4 calls this hardcoded write out; the
classification gap is a Phase 7 follow-up.

## Rules

- **Every claim cites a source or observable.** The fact-check pass
  enforces this at the gate; the grill-me posture trains the user
  (and the panel) to anticipate it during the interview.
- **One question at a time during the interview.** Resolve before
  moving on (same shape as `/loom-plan`).
- **Plan composition is per-shift, full-roster.** Engineers
  self-recuse off-topic; the skill does NOT filter by domain at the
  spawn layer.
- **Event emission is the skill's responsibility for shift / panel /
  fact-check / budget-exhausted.** The CLI verb emits
  `research-started` and `research-completed`; the skill emits the
  other six. Use `bin/loom` verbs where possible; for the skill-side
  events, append to `events.jsonl` via the existing events helper
  (call `bin/loom events append <slug> --event=<name> --detail=<json>`
  if/when such a verb exists; until then, the skill's emission paths
  are documented here for future hardening and the writes are made
  via direct file append using the appendEvent shape).
- **Do not write directly into `projects/<slug>/RESEARCH.md`.** All
  RESEARCH.md / RESEARCH-NOTES.md writes go through `bin/loom
  research`. Bypassing the CLI defeats the collision check, the
  auto-adopt step, and the CLI-side event emissions.
- **RECOVERY-STATUS.json is single-instance per slug.** A second
  failure on the same slug overwrites the first — by design.
  Concurrent sessions against the same slug are undefined.
- **No emojis.**

## Failure modes

- Topic too thin for research (one question, no source-seeking
  needed): suggest the user just answer the question directly. Stop
  without composing files.
- `RECOVERY-STATUS.json` exists with a different `parent_skill`: stop
  with an error pointing the user at the named skill. Do not try to
  resume someone else's recovery.
- Fact-check pass flags every claim ≥ 3 rounds running: the topic
  may be too speculative for an evidence-anchored RESEARCH.md.
  Suggest the user reframe the research goal (e.g. "exploratory
  hypothesis catalog" rather than "grounded dossier") and re-run.
- Plan panel returns zero engineers (registry empty): stop
  with the bootstrap-skip note from
  `/ev-loop-interactive`'s convention — the skill cannot fulfill its
  shift-panel obligation without a registered roster.
- Two-budget exhaust mid-session: write the three artifacts +
  emit `research-budget-exhausted`, then exit non-zero. The next
  invocation resumes from `RECOVERY-STATUS.json`.
- `bin/loom research` returns `research-exists-committed`: surface
  verbatim, stop. The Deferred `loom revise-research` verb is the
  future path for revising a committed dossier.
