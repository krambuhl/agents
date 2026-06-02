---
name: ev-loop-interactive
description: >-
  Execution loop for human-paired work. Runs a phase as a sequence
  of deliverables, each with its own unit contract and evaluator
  checkpoint. Supports sequential (ordered) and free (user picks next)
  deliverable ordering. Dispatches to the bin/loom CLI
  directly; composes /guild-validate; composes no other loop. Use when
  a phase is exploratory, creative, or otherwise not a bulk transform.
argument-hint: "<project-slug-or-path> <phase-number>"
user-invocable: true
allowed-tools: Read, Write, Edit, Bash, Agent, Skill, mcp__github__subscribe_pr_activity, Bash(loom *), Bash(guild *), Bash(griot *)
---

# /ev-loop-interactive

Execute one phase of a project as a human-paired loop: discrete
deliverables, per-deliverable contract and checkpoint. The human drives
order when ordering is free; the loop keeps the substrate honest.

**Composes**: `bin/loom` CLI (via Bash) for substrate
operations; `/guild-validate` (via the Skill tool) for the antagonist
panel.
**Spawns** (Agent tool, fresh-context): `/loom-research` +
`/loom-revise-plan` on the inner-RPI accept path of § Scope-shift
detection (see step 5 of the unit loop).
**Does not compose**: other loops. Substrate plumbing dispatches
directly to the CLIs (see § Substrate compositions).

**Format reference**: `docs/LOOM-CONVENTIONS.md` (plugin-relative
path; present in every install of the `loom` plugin).

Skill invocations like `/guild-validate` below mean
`Skill(skill: <name>, args: "…")`. CLI invocations like
`loom phase update` mean `Bash("loom phase update <args>")`.
Antagonist evaluation runs through `/guild-validate`, which spawns
evaluator agents in parallel via `/guild-spawn`; the loop itself never
calls the `Agent` tool directly.

## Preflight

`/ev-run` owns the substrate preflight (Tier 1 presence, Tier 2
format-skew, Tier 3 freshness) and runs it **once per dispatch** as
the single point where freshness is gated — see `/ev-run` § Preflight
for the canonical probe and its tier interpretation. This loop does
not re-implement that logic.

- **Dispatched by `/ev-run`** (the normal path): the router already
  ran the preflight this dispatch. **Trust its verdict — do not
  re-probe.**
- **Invoked standalone** (not via the router): run the preflight
  yourself, once, before any substrate op. First the presence check:

  ```
  Bash("command -v loom guild griot >/dev/null 2>&1 || { echo 'ev-loop-interactive requires loom + guild + griot plugins on PATH. Enable them with: claude plugin enable loom@krambuhl guild@krambuhl griot@krambuhl' >&2; exit 1; }")
  ```

  If that exits non-zero, stop and surface the message verbatim. Then,
  once the slug is known, run `loom doctor <slug>` and apply
  `/ev-run` § Preflight's Tier 2 (format-skew → fall back to repo-local
  `node` entries) and Tier 3 (freshness → surface `guild-cache-skew` /
  `guild-codegen-drift` advisories) interpretation. Both tiers are
  **advisory, not blocking** — surface and proceed, never stop.

## Substrate compositions

Every substrate operation this loop performs dispatches directly to
`bin/loom`, `bin/griot`, or `bin/guild` — no ambient
skills, no trout scripts. The unit loop steps below cite recipes by
name (e.g. "checkpoint per § Compose PR"). All `§ <Recipe>` references
in this body resolve in `docs/SUBSTRATE-COMPOSITIONS.md`. For loom
verb shapes and event vocabulary, see `docs/LOOM-CONVENTIONS.md`.

## Arguments

- `<project-slug-or-path>` — resolved by loom's standard slug resolution
  (full slug → date-less suffix → relative or absolute path). If missing
  or unresolved, stop and ask the user for the project.
- `<phase-number>` — which phase to run. If missing, default to the
  next non-`completed` phase from the manifest and confirm with the user
  before proceeding. If the named phase is already `completed`, stop
  and ask whether to re-run or pick a different phase.
- `--phases=all` (optional depth knob) — run the **full stack** rather
  than a single phase. With this flag the loop does not stop at phase
  close: it opens a **draft** PR per phase and auto-advances to the next
  phase, building the whole remaining stack in one invocation (see
  Step 3, the full-stack branch). Absent (the default), the loop runs
  exactly the named `<phase-number>` and stops at its PR. A numeric
  variant (`--phases=N`, build N phases) is a natural future extension;
  only `all` is wired today.

## Ordering

PLAN.md does not enumerate a phase's deliverables — it states the
phase's `goal` and `exitCriteria`, which the loop decomposes into
deliverables at runtime (see Step 1). The loop owns ordering:

- **Sequential** — deliverables form a dependency chain (each builds on
  the last). The loop runs them in order. This is the default when the
  phase's exit criteria describe a progression.
- **Free** — deliverables are independent. The loop presents the
  decomposed set and asks the user to pick the next one.

When the decomposition is ambiguous between the two, default to
**free** and ask.

**Under the armed posture** (`docs/AGENT-CONVENTIONS.md`
§ Guild-offload posture, armed by `--mode=auto`): ordering is a
low-risk gate that **auto-picks** rather than asking. The loop runs
deliverables in **sequential order** (the deterministic default) with
no `AskUserQuestion` — free-mode's "ask the user to pick" is replaced
by "take the next un-started deliverable in decomposition order." This
is an autonomous-default resolution, not a panel: ordering does not
route to `guild-plan` (see the routing table in the convention). The
human-paired behavior above is unchanged when the posture is not
armed.

## Phase-level process

### Plan

Every phase runs a multi-engineer design pass **once before Step 1**
(deliverable enumeration). The plan output becomes shared
reference material for every unit in the phase (cited in each unit's
contract `Inputs:` line). This step is **always-on**: the loop
invokes `/guild-plan` at phase start regardless of explicit
configuration; an optional `**Plan**:` override from the parsed
plan overrides defaults.

**Default behavior** (no `**Plan**:` override in the parsed plan):
- `engineers` = all currently registered `plan-*` agents,
  resolved via glob of `.claude/agents/plan-*.md`.
- `topic` = the phase name (e.g. "Plan mechanism + engineers"
  for Phase 3).
- `rounds` = 1.

**Override** — read the phase's `plan` field from
`loom parse-plan <slug>` (a phase-level `**Plan**:` block wins
over the plan-level one). `loom parse-plan` hands off the raw block
string as the single source; do not re-grep PLAN.md. This loop parses
the semicolon-delimited DSL:

```
engineers=<comma-separated names>; recipe=<name>; topic=<one-line topic>; rounds=<N>
```

Any field in the block overrides the corresponding default. Partial
blocks are allowed (e.g. only `topic=` overrides the topic; engineers
and rounds keep their defaults).

**Recipe citation** — `recipe=<name>` names a panel recipe instead of
inlining its members: the loop resolves it via `guild recipe <name>`
(which emits `{name, members}`) and uses `members` as the engineer
list. Prefer this for a known multi-domain panel —
`recipe=design-systems` rather than spelling out
`engineers=plan-composition,plan-abstraction,...`.
`recipe=` and `engineers=` are mutually exclusive; if both appear, stop
and surface a contract error. `guild recipe` fails loud on an unknown
name (`recipe-not-found`, non-zero exit) — surface it and stop, never
fall back to the glob or an empty panel (a mis-cited recipe must not
silently degrade to a thin plan).

**Plan artifact path**:
`projects/<slug>/plans/<phase-number>-<topic-slug>.md`. Create
the parent directory if it doesn't exist.

**Per-round invocation**: for each round 1..N, invoke
`/guild-plan` via the `Skill` tool with `engineers=<list>`,
`brief=<topic + any phase context>`, `plan=<path>`. The skill
auto-detects round number from existing file state, so re-running is
idempotent (a re-invocation with the same plan file detects
existing rounds and appends a NEW round). For round 2+, the skill
constructs `per_agent_context` from prior round state so engineers
can address contradictions.

**Bootstrapping case (no engineers registered)**: if the
`.claude/agents/plan-*.md` glob returns zero matches AND no
explicit `engineers=` override is given, log a one-line note ("no
plan engineers registered — skipping plan step") and
proceed directly to Step 0. This is the case for any phase running
before the engineer roster ships.

**L-004 session-boundary**: if any of the resolved `plan-*`
engineers were authored in the current session, drop them from the
effective list manually and surface the override in the next unit's
checkin Notes for the PR. The runtime registry is loaded once per
Claude Code process start; `/clear` is NOT a session boundary.

### Step 0. Pre-flight

- Refresh state per § State refresh.
- Working tree clean, verification baseline.
- **Branch state**. If the manifest's phase has no `branch` yet (first
  unit in this phase), cut a fresh branch from updated `main` —
  `git checkout main && git pull --ff-only origin main && git checkout
  -b <branch-name>` — using the naming convention from
  `docs/LOOM-CONVENTIONS.md` § Branch naming:
  `<project-name>.<phase-lazy-name>` (e.g.
  `marketplace-portable-install.migration`). Otherwise confirm the
  current branch matches the manifest's recorded phase branch; if not,
  stop and ask whether to switch. **Branch hygiene**: every checkin /
  phase / event write below commits to whatever branch is checked out,
  so re-confirm `git branch --show-current` is the phase branch before
  the first write — a write on the wrong branch strands the work (see
  `docs/AGENT-CONVENTIONS.md` § Branch hygiene before substrate writes).

### Step 1. Enumerate deliverables

Run `Bash("loom parse-plan <slug>")` and read this phase from the parsed
plan (`plan.phasesById[<phase-number>]`). PLAN.md does NOT enumerate a
phase's deliverables — it gives the phase's `goal` and `exitCriteria`.
The loop decomposes those into deliverables at runtime: each deliverable
is one conceptual change that moves the phase toward its exit criteria
(the count is the loop's judgment, not a number read from PLAN.md). Do
not parse PLAN.md prose for a deliverable list — `loom parse-plan` is
the single source for the phase's structure.

Show the decomposed list to the user with status markers (done,
in-progress, not started) pulled from existing checkins on this branch,
and confirm the decomposition before Step 2.

**Under the armed posture** (`docs/AGENT-CONVENTIONS.md`
§ Guild-offload posture, armed by `--mode=auto`): decomposition is a
low-risk gate that **auto-confirms**. The loop decomposes as above and
proceeds directly to Step 2 with **no `AskUserQuestion`** — it still
records the decomposed list (in the dispatch report and the first
unit's checkin `changes_since_previous`) so the decomposition is
auditable, but it does not pause for human confirmation. This is an
autonomous-default resolution, not a `guild-plan` panel (see the
routing table in the convention): a low-risk gate must not escape-hatch
on an empty `plan-*` roster the way a genuine execution fork does
(Step 2.2). The human-paired confirmation above is unchanged when the
posture is not armed.

### Step 2. Unit loop

For each deliverable (picked per the ordering rule):

1. **Negotiate.** Draft the unit contract for this deliverable and
   write it into a new numbered checkin. A contract-stage checkin
   still carries the **full envelope the schema defines** —
   `schema_version`, `number`, `created`, `branch` — with `contract`
   populated and the `execution` / `verdict` / `notes_for_pr` fields
   left empty; "Contract section only" describes which substructure
   you've *filled*, not a licence to omit the envelope (`loom checkin
   write` hard-rejects a file missing `schema_version` / `number` /
   `branch`, and the schema expects `created` too). Loom checkins are
   **create-once** (immutable; a duplicate `(branch, number)` is
   rejected), so "fill execution in later" means *write a new numbered
   checkin*, never edit this one. For a unit that resolves in a single
   pass, writing ONE complete checkin after the panel approves
   (contract + execution + verdict together) is simpler and equally
   valid — the create-once store doesn't care whether the unit's story
   is told in one checkin or two.
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
     at a time. After each answer, update the candidate contract.
     When the ambiguity queue empties, show the full contract for
     final approve/redirect — same shape as the default path. A
     field whose resolution is a consequential fork (discrete,
     mutually-exclusive options that change the unit's work) takes
     the structured `AskUserQuestion`; a field with an obvious
     default takes prose — see `docs/AGENT-CONVENTIONS.md`
     § Human-paired decisions: structured vs prose.

   **Auto-mode** (the loop's `--mode=auto` flag, or upstream
   caller-supplied auto-mode signal): the user is replaced by
   `evaluator-contract-fit` auditing the contract against the
   unit's inputs. The evaluator returns `approved` (treated as
   the user's "approve"), `flagged` (treated as a redirect — each
   flagged finding becomes one round of ambiguity-walk addressing
   the underlying field). Convergence rule: silent panel
   (`approved` with zero findings) OR two-budget exhaust. Per
   `docs/AGENT-CONVENTIONS.md`, defaults are **per-decision rounds
   = 3** and **per-session ambiguities = 5** for this surface. On
   budget exhaust, the unit fails to negotiate cleanly — the loop
   surfaces the unresolved ambiguities to the operator with a
   structured error and stops. Auto-mode does NOT auto-commit a
   half-ambiguous contract.

   **Event emissions** (auto-mode only):
   - On auto-mode entry: emit `auto-mode-entered` with detail
     `{surface: 'ev-loop-interactive', slug, decision_budget: 5,
     round_budget: 3}`.
   - On silent-panel convergence: emit `auto-mode-converged` with
     `{surface, slug, decisions_completed, rounds_completed}`.
   - On budget exhaust: emit `auto-mode-budget-exhausted` with
     `{surface, slug, decisions_completed, rounds_completed,
     reason: 'decision-budget' | 'round-budget'}`. Alongside the
     emission, write a session-note via § Capture finding with the
     exhaustion context (which contract fields didn't converge,
     how many rounds spent on each). Substrate-wide question this
     answers: "which auto-mode situations fail to converge."
     Same classification-gap as the other Phase-7-wired captures.

   Human-paired mode emits no auto-mode events — the conversation
   itself is the audit trail.

   **The human is in the loop** (still, even in the default path)
   — they should see what you agreed to before execution starts.
   Auto-mode is the explicit operator opt-out.
2. **Execute.** Do the work. For creative or exploratory deliverables,
   pair with the user — ask when you hit a fork, report when you hit a
   dead end, don't charge ahead.

   **Execution forks under the armed posture** (`--mode=auto` —
   `docs/AGENT-CONVENTIONS.md` § Guild-offload posture). A **genuine
   execution fork** is a substantive mid-unit decision the loop cannot
   resolve from the contract — a real design choice, not a low-risk
   framing gate (decomposition / ordering auto-confirm, Step 1 /
   Ordering). When armed, the loop does **not** ask the human; it
   resolves the fork through a panel:

   - **Raise the panel.** Invoke `/guild-plan` (via the `Skill` tool —
     it composes `/guild-spawn`; never a direct `Agent` call) with the
     fork as the `brief` and the current `plan-*` roster as
     `engineers`. This is the same call the phase-start Plan step
     makes, raised mid-unit per fork.
   - **Apply the convergence rule.** Follow
     `docs/AGENT-CONVENTIONS.md` § Fork-to-panel convergence rule (the
     single source — do not restate it here): `guild-plan` collects
     attributed sections and `agent_signals` but does **not**
     synthesize; the loop converges (silent panel / consensus → take
     the converged answer; else another round at per-decision budget 3;
     an `operator-judgment-required` signal breaks the offload to the
     escape hatch). Record the fork, the panel round(s), and the
     resolved decision in the checkin (`execution.corrections[]` or
     `notes_for_pr`) so the autonomous decision is auditable.
   - **Empty-roster safety.** If the `plan-*` glob returns zero and no
     explicit `engineers` list is supplied, the fork **goes to the
     escape hatch — it MUST NOT self-decide.** A panel that cannot be
     raised is not licence to charge ahead; an un-panelled fork that
     proceeds anyway is the exact failure mode the convergence rule
     forbids. (Durable: spawn from the live roster, never from memory.)
   - **Per-phase fork-panel cap = 5.** A single phase raises at most 5
     fork-panels (this extends the two-budget convention — § Auto-mode
     and the two-budget shape — with a per-phase fork dimension);
     the 6th fork routes to the escape hatch rather than another panel.
     A phase that forks more than 5 times is too ambiguous for
     autonomy and wants a human — surfacing at the escape hatch is the
     correct outcome, not a failure.

   Release-boundary behavior (what the escape hatch / phase close
   actually *does* — open a draft PR, write `UNRESOLVED.md`, etc.) is
   **not** defined here; that is Phase 3. This branch only routes a
   fork to a panel or to the hatch.

   **Implementer delegation (per-unit switch, default OFF).** This loop
   defaults to inline drive — you write the unit yourself so the
   keystroke-level pairing stays intact. Delegation is an *option*, not
   a forced path: during § Negotiate the operator can opt a unit **in**.
   When on for a unit, compose the implementer candidate set via
   `Bash("guild derive-panel --phase=implementer")`, select the
   `implementer-<domain>` matching the unit's primary domain, and
   delegate the write through `/guild-spawn` with the unit contract as
   the brief. Route through `/guild-spawn`, **not** a direct `Agent`
   call — `Agent` is in `allowed-tools`, but loom/ev loops compose guild
   coordination skills by design; the seam is deliberate. Record the
   switch state (and which `implementer-<domain>` ran) in the checkin's
   `notes_for_pr`. Delegation changes *who* writes, never *whether* the
   unit is gated — step 3 (Evaluate) fires regardless of switch state.
   While no `implementer-*` agents are registered (the registry-mirror
   lag), opting in falls back to inline drive with a one-line note; the
   live-spawn proof is the Phase 6 runtime gate.
3. **Evaluate.** Invoke `/guild-validate` via the `Skill` tool to run
   the antagonist panel against this unit. Compose the panel by
   auto-derivation from the unit's file list (see § Panel
   auto-derivation below) — the result is contextual to the artifact
   rather than a fixed list. `evaluator-contract-fit` is always
   included as the baseline. If a panel spawn fails with a transient
   `529 Overloaded`, retry with backoff before treating it as a real
   failure (see `docs/AGENT-CONVENTIONS.md` § Long-loop resilience) —
   a single 529 mid-panel is capacity noise, not a verdict. The spec (file-type → evaluator mapping,
   precedence list, tokens-vs-naming boundary) lives in
   `docs/PANEL-COMPOSITION.md`; the derivation logic is
   `bin/guild derive-panel`.
   - `agents`: comma-separated output of § Derive panel (paths
     composed per § Panel auto-derivation below).
   - `packet`: build a **dense packet** (see shape below). The substrate
     default is dense — verbose packets correlate with budget-exhaustion
     failures under `evaluator-*`'s `maxTurns=5`. Live examples in
     PR #13's checkins 02-06.
   - `slug`, `phase`, `unit`: thread the project slug, the phase number,
     and this unit's id (checkin number) so `/guild-validate` emits the
     panel's `evaluator-spawned` / `evaluator-finding-emitted` /
     `evaluator-recused` events to the project log (its § Emit panel
     events step). The loop holds all three; passing them is what turns
     panel activity into substrate observability that Phase 4's
     `loom events aggregate` folds. Omit only when running a panel
     outside a project context.

   **Dense packet shape** (three sections, in this order):

   ```
   ## How to evaluate efficiently

   You have a tight tool-use budget (maxTurns=5). Pre-computed
   verification below is authoritative — do not re-run lint/build/
   test/grep unless you find specific evidence the artifact summary
   contradicts itself. Spot-check at most ONE or TWO criteria with
   targeted reads, then emit `VERDICT:`. If you cannot reach a verdict
   within budget, emit `VERDICT: flagged` with `parse-failure:
   budget-exhausted` so the loop escalates rather than no-ops. If your
   evaluator domain does not apply to this artifact at all (e.g. a
   React evaluator on a pure-CLI unit), emit `VERDICT: recused` with a
   one-line `Reason:` rather than a hollow `approved` — recusal is
   non-gating and feeds the panel's non-applicability signal.

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
   `cli_runs`, and `conflicts` lists. See
   `.claude/agents/evaluator-base.md` for the per-evaluator verdict
   shape that `/guild-validate` parses and aggregates.
4. **Iterate or commit.**
   - Flagged: address the specific reasons, re-invoke `/guild-validate`.
     Up to 2 retries (3 panel runs total).

     **Fixer delegation (per-unit switch, default OFF).** This loop
     defaults to fixing flagged findings inline — you address the
     reasons yourself, keeping the pairing intact. Delegation is an
     *option*: the operator can opt a unit **in**, at which point you
     compose `fixer-<domain>` via
     `Bash("guild derive-panel --phase=fixer")`, hand the flagged-finding
     packet (the panel's `blocking_findings` + remedies) to it through
     `/guild-spawn` for the **minimal** remedy (`fixer`'s
     `default_personality` is `pragmatist` — load-bearing fix, not a
     rewrite), then re-invoke `/guild-validate`. Route through
     `/guild-spawn`, **not** a direct `Agent` call. The re-evaluation
     gates regardless of switch state — delegation changes *who* fixes,
     never *whether* the fix is re-gated. Record the switch state in the
     checkin's `notes_for_pr`. While no `fixer-*` agents are registered
     (the registry-mirror lag), opting in falls back to inline fix with a
     one-line note; the live-spawn proof is the Phase 6 runtime gate.
   - Approved: continue to step 4.5 (findings append + threshold)
     and step 5 (scope-shift detection), then finalize the checkin.
4.5. **Append findings + detect recurring threshold.** On approved
     verdict (and ONLY on approved — flagged findings that get
     addressed in iterations do NOT count toward the recurring counter;
     we count what landed in the substrate, not what was caught and
     fixed):

     For each entry in the verdict's `blocking_findings` AND
     `advisory_findings` lists:

     a. Append the finding per § Append finding with severity from
        the finding's list (`blocking` | `advisory`). Pass
        `--branch=<branch>` and `--unit=<NN>` so the entry is
        attributable; the recipe documents the quote-safety caveat.

     b. Query the recurring threshold for this finding's signature
        via § Append finding (the `count` subverb). The verb writes a
        single integer to stdout.

     c. **If the count is ≥ 3** (the recurring threshold for this
        SKILL — hardcoded; configurability is post-Phase-5), append
        a `correction:` line to this checkin's `## Notes for the PR`
        section in the shape:

        ```
        - correction: recurring evaluator finding — `<evaluator>` flagged `<code>` on <count> occurrences. Evidence: <evidence>. Avoid this pattern.
        ```

        Threshold-triggered corrections feed into session close
        (§ Save session) → § Capture finding (recurring pathway) at
        session boundary, no manual intervention. The loop does not
        invoke the verb directly here; capture happens at session
        close.

     d. Generator-antipattern detection is NOT done here. That
        classification requires human judgment about whether the
        generator output represents a recurring shape, not just
        whether an evaluator flagged it. A specialist evaluator's
        `Notes for the PR` may explicitly call out a generator
        antipattern; that's the channel for D2 to wire through.

     Skip step 4.5 entirely for substrate-only units whose panel had
     no domain findings (every finding was a `parse-failure` from
     `evaluator-contract-fit` against the contract itself, not against
     an artifact). The frequency counter is for evaluator findings
     about real artifacts, not contract-shape issues.
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
   - **Plan contradiction** (round 2+ plan surfaces a
     disagreement between engineers that current PLAN doesn't
     resolve).
   - **Phase boundary** (this unit is the last in its phase OR
     the next phase is about to start).

   **Two-signal-concurrence rule**: offer the inner-RPI sub-sequence
   only when 2+ signal sources fire for the same shift. Single
   signals get a note (see below); the loop does NOT interrupt.

   **Emit `scope-shift-detected` on every detected shift** (every
   time 2+ signals concur), regardless of whether the user
   subsequently accepts or declines. The event records the
   detection itself as substrate signal — useful for forensics on
   which signal combinations recur. Detail: `{slug, phase, unit,
   signal_count, signals: ['evaluator-finding' | 'user-comment' |
   'plan-contradiction' | 'phase-boundary', ...]}`.

   **Griot write**: alongside the event emission, write a
   session-note via § Capture finding (the
   `bin/griot capture --evaluator-finding=<classification> ...`
   pathway). The noticing itself is high-signal substrate data:
   "we saw this kind of drift pattern in this kind of unit at
   this kind of phase boundary." Classification gap: today
   `bin/griot capture` doesn't have a precise classification for
   "scope-shift detection in a unit context"; the closest match
   once the verb supports it is `catalog-gap` (the plan didn't
   anticipate the shift). Until the verb extension lands, this
   capture intent is recorded here; the actual write falls back
   to the event itself as the only substrate trace. Phase 7
   follow-up.

   **Offer flow**: surface a short paragraph naming the two signals
   and a proposed one-line rationale (the "trigger" for the inner
   RPI). Use `AskUserQuestion` (or natural-language confirm) for
   accept/decline/defer. Default: decline (no interrupt unless the
   user explicitly accepts). In auto-mode, the default flips to
   accept — auto-mode treats two-signal concurrence as enough
   evidence to trigger the sub-sequence without further input.

   **On accept (inner-RPI sub-sequence)**:

   1. Emit `rpi-inner-triggered` with detail `{slug, phase,
      trigger: <the one-line rationale>}`. Alongside the emission,
      write a session-note via § Capture finding with the trigger
      rationale as the evidence — this is the highest-signal
      substrate trace the loop emits ("what kind of learning
      forced revisions"). Same classification-gap caveat as the
      scope-shift-detected write above: Phase 7 follow-up wires the
      capture once the verb supports a `revision-trigger` (or
      similar) classification.
   2. Spawn `/loom-research` via the `Agent` tool with
      `subagent_type=loom-research` and a brief carrying the
      trigger as the research topic + `--mode=auto`. The sub-agent
      runs fresh-context; its startup brief includes
      `bin/griot use --as=llm` per the substrate convention. Wait.
   3. On sub-agent success: a fresh `RESEARCH.md` lands at project
      root (either net-new or appended — see the open question
      flagged in `/loom-revise-plan` § Open questions about the
      research-on-already-researched-project ambiguity). Proceed
      to step 4 below.
   4. Spawn `/loom-revise-plan` via the `Agent` tool with
      `subagent_type=loom-revise-plan` and a brief carrying the
      slug + `--flavor=research` + `--mode=auto`. The sub-agent's
      startup brief includes `bin/griot use --as=llm` per the
      substrate convention (the `/loom-revise-plan` skill body
      handles this in its own step 1; no additional caller-side
      instruction needed — matches the /loom-research spawn at
      sub-step 2). The skill reads the just-committed RESEARCH.md,
      runs its grill-me on the revision, gates through the
      evaluator pass, and commits via `bin/loom revise-plan`.
      Wait.
   5. Re-read the manifest via `bin/loom project read <slug>
      --pretty`. The revision may have changed the phase structure;
      if the **current phase no longer exists** in the manifest,
      stop and surface the situation to the operator (the loop
      cannot continue a deleted phase). If the **current phase's
      deliverables changed**, surface a one-line note to the
      operator + continue (the unit just completed is still valid;
      subsequent units will pick up the new shape).
   6. Emit `rpi-inner-completed` with detail `{slug, phase}`.
      Proceed to step 5.5 (ADR-emit), then step 6 (Phase update).
      Do not re-execute the current unit.

   **Sub-agent failure flow**: if either `/loom-research` or
   `/loom-revise-plan` exits non-zero OR writes
   `RECOVERY-STATUS.json`, the inner-RPI sequence:
   - Does NOT write its own RECOVERY-STATUS.json (the sub-agent
     already did, and the loop body's pre-flight at the next
     `/ev-run` invocation will detect it and offer to resume).
   - Surfaces the failure to the operator with the sub-agent's
     recovery file path and the failed step.
   - Exits the unit with a clean error rather than partially
     proceeding. The operator (or next `/ev-run`) decides whether
     to retry the sub-agent or skip the revision.
   - Does NOT emit `rpi-inner-completed`. The trail in
     `events.jsonl` will show `rpi-inner-triggered` without a
     matching completion — the correct partial-failure signal,
     same shape as the research verb's started-without-completed
     pattern.

   **On decline**: emit `rpi-inner-declined` with detail `{slug,
   phase, signal_count}`. Append the signals to the unit's
   `notes_for_pr` array in the checkin JSON so the substrate
   captures what was detected even when the operator chose not to
   act on it. Loop continues normally.

   **On single signal** (no concurrence): append the signal to the
   unit's `notes_for_pr` array in the checkin JSON:
   ```
   signal: <signal type>: <one-line description> (single signal; no revise offered)
   ```
   Loop continues normally. The `scope-shift-detected` event does
   NOT fire — the two-signal-concurrence rule gates the event
   alongside the offer.

   **On zero signals**: no action. Loop continues.

5.5. **ADR-emit (operator-opt-in).** Runs on every approved unit
     after step 5 (scope-shift detection) completes — including
     the inner-RPI accept path. The hook is **operator-opt-in**: it
     never auto-emits — every candidate surfaces an
     `AskUserQuestion` before any ADR file is written. The scan
     runs on the **just-committed** checkin, so the marker only
     counts once the operator has approved the unit (no draft
     scanning, no pre-commit speculation).

     **Scan**: read the just-committed checkin's `notes_for_pr`
     array (the same array step 4.5 appended threshold-triggered
     corrections into) and find each entry containing the literal
     substring `[adr-candidate]` (case-sensitive,
     bracketed-literal — picked for unambiguity against natural
     prose). Skip entries lacking the marker.

     **Per match**:

     a. Surface a single `AskUserQuestion` with two options
        — "write ADR now" / "skip this marker" — and the matching
        entry text as context for the operator. Pass the entry
        verbatim (with the `[adr-candidate]` marker left in for
        unambiguous identification) so the operator can re-read
        the decision they tagged.

     b. **On decline**: emit `adr-emit-declined` with detail
        `{slug, phase, unit, marker_excerpt}` and move to the
        next match. No file write, no further prompts.

     c. **On accept**: prompt the operator for an ADR title via
        a second `AskUserQuestion` (single short question; seed
        suggestions from the first ~7-10 words of the marked
        entry). The operator can also type a custom title via
        the "Other" affordance.

     d. Compose a candidate ADR body in this shape:
        - **Context**: a paraphrase of the marked entry (1-3
          sentences) + the unit's contract `goal` (one line),
          establishing why the decision came up in this unit.
        - **Decision**: the decision the operator named in the
          entry, lifted as a structured statement.
        - **Consequences**: a single literal `TODO: operator to
          fill before commit` line — the body is intentionally
          incomplete so the operator hand-edits before the
          checkin's git commit step runs.

     e. Write the composed body to
        `/tmp/loom-adr-<slug>-<n>.md` (where `<n>` is the
        match index within this unit, 1-based).

     f. Invoke
        `Bash("node plugins/loom/cli/loom.ts adr \"<title>\" --body-file=<tmp> --no-commit --pretty")`
        and capture the returned ADR path from the JSON output.
        Use `node plugins/loom/cli/loom.ts` rather than bare
        `loom` — the cached-PATH-binary lag (documented in
        2026-05-28-loom-adr's P2D2 checkin under
        `notes_for_pr`) means the bare invocation can fail with
        `unknown-verb` even after the marketplace dependency
        has shipped.

     g. Stage the returned ADR path for the unit's git-add list
        so the ADR commits in the same commit as the checkin
        write. The `--no-commit` flag suppresses the verb's
        auto-commit specifically so the ADR can ride the
        checkin commit — bundling the two avoids a race between
        sibling commits and gives the operator one revertable
        unit if the ADR turns out wrong.

     h. Emit `adr-emitted` with detail `{slug, phase, unit,
        adr_number, adr_path, marker_excerpt}` (the marker
        excerpt enables forensic cross-reference between the
        ADR and the originating `notes_for_pr` entry).

     **Idempotency posture**: step 5.5 runs once per unit close,
     as part of the unit's close path. Re-running the loop on
     the same already-committed unit does NOT re-surface markers
     (the close path only fires once per unit). The hook does
     NOT re-scan prior units' checkins — a missed candidate is
     captured manually via the `/loom-adr` skill rather than
     swept up by a future unit's hook.

     **Auto-mode** (the armed posture — `docs/AGENT-CONVENTIONS.md`
     § Guild-offload posture): in `--mode=auto`, the per-match
     `AskUserQuestion` is replaced by `evaluator-contract-fit`
     reading the marked entry against ADR-0001's conventions —
     `approved` is treated as accept, `flagged` as decline. The
     title prompt has no auto-mode equivalent — under the armed
     posture the title is **generated**, not prompted: auto-mode
     synthesizes it from the first ~7 words of the marked entry and
     proceeds. No `AskUserQuestion` fires on either the accept/decline
     or the title. Events fire identically.

6. **Phase update.** After a checkin lands, the checkin-created event
   auto-fires from § Checkin write. Then update phase state per
   § Phase update with `--status=in-progress --branch=<branch>` (the
   PR reference is set later when § Compose PR runs).
7. **Checkpoint.** Free mode: after every deliverable. Sequential mode:
   after every deliverable **or** when the human explicitly asks.
   Refresh the PR per § Compose PR.

### Panel auto-derivation

The `agents` list passed to `/guild-validate` is computed from the
unit's file list at evaluation time, not hardcoded. The composition
rules (file-type → evaluator mapping, precedence ordering, conflict
policy) live in `docs/PANEL-COMPOSITION.md` and are the
source of truth.

1. **Collect file paths.** Take the unit's changed and created files.
   Practical recipe: `git status --short` minus any deletions, plus
   any freshly-authored untracked paths that will land in the artifact
   commit. Substrate-only mutations (`projects/<slug>/manifest.json`
   or `events.jsonl` updates auto-written by `bin/loom` verbs)
   generally should be excluded — they shipped via the substrate
   itself, not as the unit's artifact.
2. **Derive the panel** per § Derive panel, passing the file paths
   from step 1. Use the verb's stdout as the `agents=` argument
   verbatim.
3. **Pass to `/guild-validate`.** Use the verb's stdout as the
   `agents=` argument verbatim. The skill body composes the dense
   packet as before; only the `agents` list changes.

Edge cases the verb handles, documented for reviewer awareness:

- **Empty file list** (substrate-only unit, no artifact files yet) →
  `evaluator-contract-fit`. Same single-evaluator behavior as before
  D7's auto-derivation landed.
- **Substrate-only files** (`.claude/agents/*.md`, skill `SKILL.md`,
  checkin `*.md`, `projects/**/{MANIFEST,PLAN}.md`) → contract-fit
  only. Domain evaluators don't apply to agent definitions, skill
  bodies, or project artifacts.
- **Substrate scripts** (`.claude/scripts/**/*.ts`) → contract-fit
  + naming. Script identifiers are public-API surface for substrate
  consumers.
- **L-004 session-boundary constraint.** A newly-authored evaluator
  agent that didn't exist at session start is registered as of next
  session start. If the derive-panel output includes such an
  evaluator AND that evaluator was added during this session, drop
  it from the `agents=` list manually and note the manual override
  in the checkin's `Notes for the PR` section. The script does NOT
  know which evaluators are session-cached vs newly-authored; that
  metadata is the caller's responsibility.

### Step 3. Phase close

At phase close the loop's job is to **open the PR and stop** — the
release boundary. This is the **default posture**: one phase per
invocation, the human reviews and merges on GitHub.

- All deliverables accounted for.
- Full verification passes.
- Open / refresh the PR per § Compose PR so it reflects the final
  state of the phase.
- **Stop.** Leave the phase `--status=in-progress` — do **not** mark
  it `completed` here. Per `docs/AGENT-CONVENTIONS.md` § Guild-offload
  posture (release-boundary semantics — the single source), the default
  is phase-at-a-time: open a ready PR, subscribe, and park; the human
  reviews and merges.

**Completion is merge-gated, not phase-close-gated.** A phase becomes
`completed` only when its PR has **merged**, and the *router* makes
that transition, not this loop: the next `/ev-run` derives live PR
state via `loom pr discover`, sees `MERGED`, advances the phase to
`completed`, and dispatches the next phase off a freshly-pulled base
(`/ev-run` § 3). Marking `completed` here — before the merge — would
tell the router the dependency is satisfied and dispatch the next phase
against an **unmerged parent**, cutting its branch off a base that
lacks this phase's commits. Leaving the phase `in-progress` with an
open PR is exactly the state the router's park-on-open-PR logic (§ 3.3)
waits on.

**Full-stack option (`--phases=all`).** When this flag is set, phase
close does **not** stop. Instead of a ready PR, the loop opens a
**draft** PR for the phase and auto-advances to the next phase in
dependency order, building the whole stack in one invocation:

- **Open the draft.** Compose the phase PR per § Compose PR but open it
  with `loom pr open --draft` (Phase 1's flag). The draft signals
  work-in-progress, not ready to merge — the whole stack is reviewed at
  once at the end.
- **Cut the next branch STACKED on this one.** The next phase's branch
  is cut off the *current phase branch* (via `gt create`), NOT off
  `main`. This is the crux: the current phase's commits are in the next
  branch's base even though the current phase's draft PR has not merged,
  so the dependency is satisfied by the stack rather than by a merge.
  Cutting off `main` instead would strand the next phase on a base
  missing this phase's work — the exact failure the merge-gated rule
  guards against; the stack is how full-stack mode satisfies the
  dependency without merging.
- **Advance statuses + continue.** Leave the current phase
  `in-progress` (its draft PR is open, not merged — completion stays
  merge-gated per the rule above), set the next phase `in-progress` on
  its new branch, and continue the unit loop (Step 1 onward) for the
  next phase. Repeat until every phase has a draft PR.
- **Emit `auto-mode-converged`** at each clean phase close (all of the
  phase's units landed and its draft PR opened) with detail `{surface:
  'ev-loop-interactive', slug, phase}`.
- **At stack end, stop — leave the drafts.** When the last phase's
  draft PR is open, the loop stops. It does **not** auto-`ready` or
  auto-merge any draft: marking the stack ready (`gh pr ready <n>`) and
  merging it is the human's (or a follow-up's) job. The human reviews
  the whole stack at once.

If a phase mid-stack hits the **escape hatch** (a stall or budget
exhaust), the auto-advance **halts** at that phase's draft PR rather
than continuing — the stack is left partial for the human. The escape
hatch's own behavior (the draft PR it opens, `UNRESOLVED.md`, the
budget-exhausted event) is defined in its own section below.

### Escape hatch

The escape hatch is how an **armed** run (`--mode=auto`) stops cleanly
when it cannot finish a phase — turning a stall into a *reviewable*
state instead of either hanging or charging ahead. It is an
armed-posture concept: under the human-paired default the human is the
escape valve (they answer, redirect, or stop), so there is nothing to
escape to. See `docs/AGENT-CONVENTIONS.md` § Guild-offload posture
(escape hatch) — the single source for the semantics; this section is
the loop's procedure for it.

**Triggers** (any one fires the hatch; consistent with Step 2.2 and the
convention):

- A genuine execution fork with **no panel raiseable** — the `plan-*`
  roster is empty and no explicit engineers were supplied (Step 2.2,
  empty-roster safety). The loop must not self-decide, so it escapes.
- The **per-phase fork-panel cap** (5) is exceeded — the 6th fork in a
  phase (Step 2.2).
- **Two-budget exhaustion** — per-decision rounds × per-session
  decisions hit without convergence (§ Auto-mode and the two-budget
  shape).

**On trigger, the loop:**

1. **Opens a draft PR with the work-so-far** — `loom pr open --draft`
   (Phase 1's flag). Whatever units completed before the stall are
   committed and pushed; the draft makes the partial work reviewable on
   GitHub rather than stranded on a branch.
2. **Writes the recovery triad** per § Budget-exhausted recovery (the
   single source — do not restate the shapes): `UNRESOLVED.md` (the
   human-readable sidecar listing the undecided forks / questions) and
   `RECOVERY-STATUS.json` (the machine-readable resume file a later
   `/ev-run` detects and resumes from). The only addition over the
   convention's existing recovery is the draft-PR step above.
3. **Writes the undecided forks into the PR body** — so a reviewer sees
   what stalled the run without opening `UNRESOLVED.md`, and can
   resolve it inline (review comment, or merge-and-redirect).
4. **Emits `auto-mode-budget-exhausted`** with the detail documented in
   § Auto-mode and the two-budget shape (`{surface:
   'ev-loop-interactive', slug, ...}`). The exhaust path reuses this
   existing event — it is not a new vocabulary.
5. **Stops.** The loop does not continue, does not self-decide the
   unresolved fork, and does not mark the phase `completed`. Under
   `--phases=all` the stop **halts the auto-advance** at this phase's
   draft PR (the stack is left partial); otherwise it is an ordinary
   single-phase stop on a draft instead of a ready PR.

A human re-enters by reviewing the draft PR (resolving the forks in the
body), or by re-running `/ev-run` — which detects `RECOVERY-STATUS.json`
and resumes — or by dropping `--mode=auto` to finish the phase paired.

## Output format

After each checkpoint and at phase close, report:

```
Phase <N> — <title>
Deliverables: <done>/<total>  (list with status)
Last checkin: <path>
PR: <url or "not yet opened">
PR subscription: <active | unavailable | n.a.>
Next: <deliverable name, or "phase complete">
```

`PR subscription` mirrors § Compose PR's "After open": `active` once
the PR is subscribed at open, `unavailable` in a local `gh`-only
session (the router then falls back to § Wait for merge), `n.a.` when
no PR was opened this run.

## Message-driven redirects

Trigger: if the caller's message (from the router) contains a pattern
like `address feedback on #<pr>` while this loop is active on that PR's
branch, branch into the flow below instead of continuing the normal
unit loop.

For "address feedback on #N":
1. Triage the comments per § Triage PR comments + draft responses.
2. Each `blocker` classification becomes a new unit.
3. Run the unit loop. Refresh the PR per § Compose PR when done.

## Rules

- **The human co-pilots.** Don't write long stretches without pausing.
  If a unit spans more than ~3 files or ~200 lines of new/changed code
  without a natural pause, split it.
- **Contract before execution.** Always. Even if the deliverable feels
  small.
- **Evaluator always runs.** Same as the confidence loop — never
  self-approve. Evaluator budget is 3 runs per unit (initial + 2
  retries); on the third flag escalate to the user.
- **No `AskUserQuestion` under the armed posture.** When the
  guild-offload posture is armed (`--mode=auto` — see
  `docs/AGENT-CONVENTIONS.md` § Guild-offload posture), the loop makes
  **no `AskUserQuestion` calls** mid-phase. Every touchpoint that would
  ask the human is either resolved autonomously (decomposition
  auto-confirms, ordering auto-picks sequential, ADR title is
  generated, contract negotiation and ADR accept/decline go to
  `evaluator-contract-fit`) or routed to a `guild-plan` panel (a
  genuine execution fork — Step 2.2) or escaped to the hatch (no panel
  raiseable, or a budget/cap exceeded). This is an invariant, not a
  preference: the harness would not silence an `AskUserQuestion` even
  in its own auto mode (RESEARCH § A), so a stray call would hang an
  unattended run. The human-paired (non-armed) default keeps every
  touchpoint above.
- **Scope discipline.** One deliverable at a time in a given checkin.
- **Record corrections in the checkin.** If the user redirects a unit
  mid-flight, overrides a decision, or the evaluator flags something
  the generator defaulted to incorrectly, note it verbatim in the
  checkin JSON's `execution.corrections[]` array. The session handoff
  (§ Save session) surfaces unresolved corrections into `open_threads`;
  § Capture finding (from-checkin pathway) promotes notable ones into
  `learnings/session-notes/` at session close, and `/griot-compact`
  decides which get promoted further. The loop itself never writes
  to `learnings/`.
- **No emojis.**

## Failure modes

- User goes quiet mid-deliverable → stop, checkpoint whatever is safe,
  save a session handoff.
- Evaluator flags 3× → escalate to user.
- Working tree dirty → stop.
