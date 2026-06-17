# Agent conventions

Cross-skill rituals and file shapes that every agent (skills,
plan engineers, evaluators, generators) in the marketplace
substrate honors. These conventions are the contract between
sub-agents and the skills that spawn them; between parent skills
and the recovery flow when sub-agents fail; between auto-mode
skills and the budget shape that limits runaway resolution.

The companion docs are
[`SUBSTRATE-COMPOSITIONS.md`](./SUBSTRATE-COMPOSITIONS.md) (the
named recipes loops call) and
[`LOOM-CONVENTIONS.md`](./LOOM-CONVENTIONS.md) (project artifact
shapes and event vocabulary).

## Reading order

The three docs in this directory are designed to be read in this
order:

1. **`AGENT-CONVENTIONS.md`** (this file) — rituals every agent
   honors.
2. **`LOOM-CONVENTIONS.md`** — project artifact shapes (`PLAN.md`,
   `manifest.toml`, etc).
3. **`SUBSTRATE-COMPOSITIONS.md`** — named recipes the loops call,
   each documenting its CLI wrap + idempotency + failure modes +
   callers.

Loop bodies cite recipes from `SUBSTRATE-COMPOSITIONS.md` by name
(`§ <Recipe>`). Conventions in this doc are referenced by section
heading rather than by recipe name.

### Why the asymmetric name

`AGENT-CONVENTIONS.md` and `LOOM-CONVENTIONS.md` use the
`-CONVENTIONS` suffix; `SUBSTRATE-COMPOSITIONS.md` uses
`-COMPOSITIONS`. The asymmetry is deliberate. The first two docs
describe **conventions** — shared rituals, file shapes, vocabulary
the substrate honors. `SUBSTRATE-COMPOSITIONS.md` describes
**compositions** — small named recipes that compose CLI verbs into
loop-callable orchestrations. The word "compositions" is
load-bearing in the substrate's own vocabulary (skill bodies cite
`§ <Recipe>` references that compose the CLI surface); renaming to
`SUBSTRATE-CONVENTIONS.md` would understate the doc's role and
fight against established usage in skill bodies, retros, and prior
project artifacts. A uniform-suffix family would be cleaner on
the file listing; the calcified vocabulary of the surrounding
system wins. Documented here so the next reader doesn't try to
rename it.

## Citation conventions

### Recipe citations resolve in `SUBSTRATE-COMPOSITIONS.md`

When a skill body writes `§ <Recipe>`, the convention is:

- A bare `§ <Recipe>` resolves in
  `docs/SUBSTRATE-COMPOSITIONS.md`. Skill bodies do not need to
  qualify the path; the reader looks up the recipe in the single
  authoritative file.
- A `§ <Section> below` (or any explicit `below` / `above` /
  same-file qualifier) is **skill-local**: it refers to a section
  in the same skill body. Example: `/ev-loop-interactive` uses
  `§ Panel auto-derivation` for a section defined further down in
  its own SKILL.md, not a centralized recipe.
- A `§ <Section>` followed by an explicit file qualifier (e.g.
  `§ Retro format` in `LOOM-CONVENTIONS.md`) resolves in the named
  file. This pattern is used when a section in one of the
  conventions docs is referenced by another doc or by a skill.

The recipe-citation cross-check (Phase 1.3 of the loom-absorb-draft
project, expected to graduate to a CI-enforced test) walks every
`§ <X>` in skill bodies and resolves it against either
`SUBSTRATE-COMPOSITIONS.md` (for bare recipes) or the skill body
itself (for `below`-qualified citations). Citations that resolve to
nothing are blockers.

### Marketplace-rooted doc paths

Skill bodies cite docs as `docs/<file>.md`. The resolution rule:

- The repo-root `docs/` tree is the authoritative source. Every
  conventions doc lives at `docs/<file>.md` in the marketplace repo.
- Each doc-citing consumer plugin (`ev`, `loom`) receives a byte-equal
  copy at `plugins/<consumer>/docs/<file>.md` via
  `scripts/sync-shared.ts`.
- On a consumer machine with the plugin installed via Claude Code,
  `docs/<file>.md` is the plugin-relative path resolved by Claude
  Code's plugin loader against the consumer plugin's own synced
  copy of the docs/ subtree.

Either way, the unqualified `docs/<file>.md` form in skill bodies
resolves correctly to a file that exists on disk in the plugin's
own tree. No symlink dance required; no cross-plugin path
resolution required.

### `[portable]` marker

Plan engineers and evaluators surface findings that should be
captured to the griot learnings system by suffixing the finding
with `[portable]`:

```
Finding: <description>. [portable]
```

The marker says: this finding generalizes beyond the current
project. When a skill body scans agent output for findings, it
treats `[portable]`-marked entries as triggers to call the
`§ Capture finding` recipe, which writes a session-note under
`learnings/session-notes/`.

The convention name `[portable]` describes *meaning* (this
generalizes), not appearance (no `[GLOBAL]`, no `[!]`, no
`[learning]`). Semantic naming applies even to inline markers.

## Sub-agent startup brief

Every skill that spawns a sub-agent via the `Agent` tool MUST
include the rollup-load step in the sub-agent's startup brief:

> Run `bin/griot use --as=llm` first. This loads the substrate-
> wide learnings rollup into your context. After it succeeds, read
> your task brief below.

This ensures every sub-agent starts with the substrate's
accumulated learnings as context, not just the spawning skill's
brief. The verb is no-op when the rollup is empty or missing, and
logs which case it hit, so the convention is safe to apply
universally.

The startup-brief convention applies to sub-agents invoked via the
`Agent` tool — i.e. fresh-context spawns where the sub-agent does
not inherit the parent's conversation. Sub-skills invoked via the
`Skill` tool (which run in the parent's context) do not need the
rollup-load step because they inherit it from the parent.

## Recovery from sub-agent failures

When a sub-agent invocation fails (timeout, partial commit, hard
error, budget-exhausted), the parent skill writes a
`RECOVERY-STATUS.json` file at the project root capturing what
failed and how to resume.

### File shape

`RECOVERY-STATUS.json` is a single JSON object with the following
fields:

```json
{
  "schema_version": 1,
  "parent_skill": "/loom-research",
  "slug": "<project-slug>",
  "failed_step": "<step name>",
  "resume_from": "<step name>",
  "context": { /* skill-specific blob */ },
  "written_at": "<ISO 8601 timestamp>"
}
```

- **`schema_version`** — `1`. Additive evolution only; new fields
  may appear in later schema versions, but the existing fields'
  shapes are stable.
- **`parent_skill`** — the skill that spawned the sub-agent (and
  that owns recovery). Same skill on re-invocation reads this file
  to know it's the responsible recoverer.
- **`slug`** — the project slug the sub-agent was working on.
  Recovery is per-slug.
- **`failed_step`** — a skill-defined step name that identifies
  where the failure happened.
- **`resume_from`** — a skill-defined step name identifying where
  the resumed work picks up. Often equal to `failed_step` (retry
  from the same point), but may be a step earlier if rollback is
  needed.
- **`context`** — a skill-specific blob. Skills are free to put
  whatever they need here (partial artifacts, last user response,
  remaining work items). The substrate does not interpret
  `context`; only the writing/reading skill does.
- **`written_at`** — ISO 8601 timestamp of the write.

### Path

`RECOVERY-STATUS.json` lives at the project root, alongside
`manifest.toml`:

```
projects/<slug>/RECOVERY-STATUS.json
```

### Lifecycle and concurrency

The file is **single-instance**: there is at most one
`RECOVERY-STATUS.json` per project at a time. A second failure on
the same slug overwrites the first failure's record. This is by
design — only the latest failure context is needed to resume, and
keeping the history would require a partitioning scheme the
substrate does not provide.

The substrate **assumes single-writer-per-slug**: only one
parent-skill session is active against a given slug at a time.
Concurrent sessions against the same slug are undefined; the
recovery file would race. This matches the broader parallel-work
invariant in `projects/CONVENTIONS.md` § Category 3 (single-
writer-serialized).

### Resume semantics

Each parent skill defines its own resume semantics; the substrate
does not. Common patterns:

- **Research** (`/loom-research`): resume from the last completed
  domain shift. The `context` blob carries the shift number and
  partial `RESEARCH.md` content.
- **Plan** (`/loom-plan`): re-read partial `PLAN.md`, continue
  grill-me from the next unresolved question. The `context` blob
  carries the question queue and partial answers.
- **Revise plan** (`/loom-revise-plan`): resume from the
  flavor-routing point. The `context` blob carries the flavor
  decision and any pending revise steps.

A parent skill on re-invocation against a slug that has a
`RECOVERY-STATUS.json` MUST detect the file and offer to resume.
The offer flow is skill-specific (interactive prompt; auto-mode
acceptance; etc).

### Removing the file

After a successful resume (work completes; sub-agent finishes its
mission), the parent skill deletes `RECOVERY-STATUS.json`. The
substrate does not auto-clean stale files; cleanup is each skill's
responsibility.

## Human-paired decisions: structured vs prose

When a skill is human-paired (not `--mode=auto`), some decisions go to
the operator. *How* you ask matters: a consequential fork deserves a
structured `AskUserQuestion`; a clarification with an obvious default
does not.

**Use a structured `AskUserQuestion`** when BOTH hold:

- The answer **changes what you do next** — different options lead to
  materially different work (a different design, scope, or set of
  files), not just a wording tweak.
- The options are **discrete and mutually exclusive** — you can name
  2-4 concrete choices the operator picks between (lead with a
  recommendation; make the trade-offs visible).

This is the same class of decision auto-mode hands to an evaluator or
plan panel (see § Auto-mode below). Human-paired, it goes to the
operator as a structured prompt so the choice is on the record and the
operator isn't reconstructing the options out of a paragraph.

**Use free-form prose** when:

- There's an **obvious default** — pick it, state it in one line, and
  proceed. Don't manufacture a question for a decision you can make.
- The input is **open-ended** — it doesn't fit discrete options (a
  name, a free-text redirect, a "what did you mean by X").

**The failure mode this prevents:** asking a consequential fork in
prose ("should I do A, or B, or maybe C?") buries the decision, makes
the options hard to compare, and leaves no clean record of what was
chosen. The inverse — a structured prompt for a decision with an
obvious default — is friction the operator didn't ask for. Match the
form to the stakes.

When genuinely uncertain about approach, scope, or intent — and the
decision tree has more than one live branch — reach for `/grill-me`,
which drives the structured form one branch at a time.

## Auto-mode and the two-budget shape

Many skills support an optional `--mode=auto` flag (or equivalent
caller-supplied signal) that runs the skill without human input.
Auto-mode uses panels (plans for divergent / generative
questions; evaluators for convergent / auditing questions) to
drive resolution instead of asking the operator.

### Convergence rule

Auto-mode runs until one of two stop conditions:

1. **Silent panel** — no engineer / evaluator raised a new
   question this round.
2. **Two-budget exhaustion** — per-decision rounds × per-session
   decisions cap hit.

Silent panel means "consensus, or no further pressure" — the work
is done. Budget exhaustion means "ran too long, partial work
remains" — the skill writes a partial artifact + `UNRESOLVED.md`
sidecar + `RECOVERY-STATUS.json` + exits non-zero.

### Default budget shape

The "two-budget" is **per-decision rounds × per-session
decisions**:

- **Per-decision rounds** — how many panel rounds the skill runs
  for a single decision (e.g. a single domain shift in research;
  a single contract field in unit negotiation). Default: **3**
  everywhere unless explicitly overridden.
- **Per-session decisions** — how many decisions the skill
  processes total in one session. Default varies by skill:

  | Skill | Per-session decisions | Domain |
  |-------|----------------------|--------|
  | `/loom-research` | 5 shifts | research session |
  | `/loom-plan` | 10 questions | plan grill-me |
  | `/loom-revise-plan` | 10 questions | revise grill-me |
  | `/loom-archive` | 8 questions | retro grill-me |
  | `/ev-loop-interactive` unit-contract | 5 ambiguities per unit | contract negotiation |
  | `/ev-run` dispatch | 3 ambiguities | router clarification |

The numbers above are the substrate defaults documented in this
file. Individual skill bodies may override; if a skill does
override, it MUST document the override in its own SKILL.md so the
divergence is visible.

### Budget-exhausted recovery

A budget-exhausted auto-mode run produces three artifacts at the
project root:

1. The partial primary artifact (`PLAN.md`, `RESEARCH.md`, etc.) —
   whatever the skill had constructed up to the exhaustion point.
2. `UNRESOLVED.md` — a markdown sidecar listing the questions /
   decisions that did not converge. Human-readable, intended for
   a follow-up session.
3. `RECOVERY-STATUS.json` — the machine-readable resume file (see
   § Recovery from sub-agent failures above).

The skill then exits non-zero. The substrate treats this as a
documented failure mode, not a crash: the operator (or a parent
skill) can re-invoke with a fresh session, the skill detects
`RECOVERY-STATUS.json`, and resumes.

## Guild-offload posture

The **guild-offload posture** is a session-level stance an ev
execution loop can run under while `--mode=auto` is armed: the
loop runs a phase's units autonomously, routing every in-loop
question it would normally ask the human to a guild panel (or
resolving it from a documented default), and surfaces to the
human at exactly one place — the PR. "Only release for a PR"
becomes the loop's invariant.

This **extends** § Auto-mode and the two-budget shape; it does
not restate the budget numbers. The two-budget convergence
(per-decision rounds × per-session decisions) and the
budget-exhausted recovery defined above are the machinery the
posture leans on. The posture adds *which* in-loop touchpoints
route where, and *where* the single human release point sits.

Nothing in this section wires a loop to the posture. It defines
the shared convention; the loop bodies adopt it in their own
SKILL.md.

### Armed-trigger seam

The posture is armed by the loop's **`--mode=auto` flag** (or an
upstream caller-supplied auto-mode signal). That flag is the
primary — and today the only — trigger.

Coupling the posture to the *harness's* own auto-accept /
permission mode is **deferred, not wired**. The harness does not
expose its permission mode to a running skill (confirmed absent),
so a loop cannot read it. An inert probe seam (`probeHarnessMode`,
returning `unknown`) once shipped as the documented wire-in point
but was removed as dead code; a future harness signal would
reintroduce it.
Until such a signal exists nothing gates on harness mode: an `unknown`
return never arms, disarms, or alters the posture. Do not branch
behavior on it.

### Gate-to-resolver routing table

Under the armed posture, each in-loop touchpoint that would
otherwise ask the human routes to a resolver. The resolver class
follows the two-budget split: **divergent / generative** questions
go to a `guild-plan` panel; **convergent / auditing** questions go
to an evaluator (`evaluator-contract-fit` is the baseline); a few
resolve from a documented **autonomous default**.

| In-loop touchpoint | Resolver | Class | Status |
|---|---|---|---|
| Unit-contract negotiation | `evaluator-contract-fit` audits the draft contract | convergent | covered |
| ADR-emit accept / decline | `evaluator-contract-fit` reads the marked entry against ADR-0001 | convergent | covered |
| Deliverable decomposition confirm | auto-confirm in the loop (no panel) | autonomous | new |
| Free-mode ordering pick | auto-pick, sequential default (no panel) | autonomous | new |
| Mid-unit execution fork | `guild-plan` round on the fork (see § Fork-to-panel convergence) | divergent | new |
| ADR title quality | synthesized from the marked entry, no panel | autonomous | partial |
| Scope-shift offer | default flips decline → accept on two-signal concurrence | autonomous | covered |
| Implementer / fixer delegation | keep the loop's default (OFF interactive, ON confidence) | autonomous | unchanged |
| Release / PR boundary | the release-boundary semantics below | autonomous | new |

"Covered" rows are the auto-mode branches the loops implement
today; "new" rows are the gap this posture closes. Auto-mode
changes *who decides* (a panel vs the human), never *who writes* —
the delegation defaults are untouched.

Note the split between the two divergent-looking decomposition /
ordering gates and a genuine execution fork: decomposition and
ordering resolve **autonomously in the loop** (auto-confirm /
auto-pick), NOT via a `guild-plan` panel. They are low-risk,
reversible framing decisions, and routing them to a panel would make
an armed run unstartable whenever the `plan-*` roster is empty (the
fork-to-panel rule below escape-hatches a panel that can't be
raised — correct for a real fork, fatal for a first-gate
formality). A genuine mid-unit execution fork — where the loop hits
a substantive decision it cannot resolve from the contract — is the
only touchpoint that routes to a panel.

### Fork-to-panel convergence rule

A **mid-unit execution fork** — the loop hitting a decision it
would normally pause and ask the human about — routes to a
`guild-plan` round with the fork as the brief. Turning the
panel's output into a decision is the **caller's** job:

- `guild-plan` *collects* attributed engineer sections; it does
  **not** iterate and does **not** synthesize a decision (its
  `contradictions` field is empty by design). The loop reads back
  the sections and each engineer's `agent_signals` (confidence,
  outcome).
- Apply the convergence rule: a **silent panel** (no new question /
  consensus) → take the converged answer. Otherwise run another
  round (per-decision budget = 3), feeding round N the prior
  round's sections so engineers can resolve their own
  contradictions. On budget exhaust → the escape hatch.
- An `operator-judgment-required` outcome in any engineer's signal
  is the panel's own "this needs the human." It **breaks the
  offload** and surfaces at the PR boundary rather than
  force-resolving.
- **No panel raiseable → escape hatch, never self-decide.** If the
  `plan-*` engineer glob is empty (registry-mirror lag) and no
  explicit engineer list is supplied, a fork must fall to the
  escape hatch (stop + `UNRESOLVED.md`), not to "decide it myself."
  A posture that silently charges ahead on an un-panelled fork is
  the failure mode this rule exists to forbid.

### Release-boundary semantics

The posture surfaces to the human at the PR. Two release shapes:

- **Default — phase-at-a-time.** At phase close the loop opens a
  **normal** (ready) PR, subscribes to its activity, and stops; the
  router parks the run and a review / CI result / merge re-wakes
  it. One phase, one PR, one human gate.
- **Full-stack — `--phases=all`** (or equivalent depth knob). The
  loop opens a **draft** PR per phase (via `loom pr open --draft`),
  auto-advances to the next phase without stopping, and at stack
  completion marks the drafts ready (`gh pr ready <n>`). The human
  reviews the whole stack at once.

PR draft / ready state is **derived from `gh`** on demand (via
`loom pr discover`), never cached in the manifest — the same
derive-don't-store rule the rest of the PR surface follows. The
full-stack path must `git push` each phase branch before its draft
open (`pr open` fails loud on an unpushed branch).

### Escape hatch

The escape hatch is where an armed run **stops and hands back to
the human** without finishing the phase. It reuses the
budget-exhausted recovery above unchanged — `UNRESOLVED.md` +
`RECOVERY-STATUS.json` + the `auto-mode-budget-exhausted` event —
adding a single step: open a **draft** PR carrying the
work-so-far, so the partial state is reviewable on GitHub rather
than stranded on a branch. The no-panel-available fallback from
§ Fork-to-panel convergence routes here too.

A human re-enters by reviewing (or merging, or closing) that PR,
or by re-invoking the loop without `--mode=auto` to drop back to
paired mode.

### Both loops

The convention is shared; `/ev-loop-interactive` and
`/ev-loop-confidence` both cite it. Where the confidence loop
diverges:

- **Units are tiers, not deliverables.** Confidence runs a phase
  as ordered tiers (mechanical → bespoke) under a **tier
  contract**; a fork there is more often a tier-assignment /
  batch-sizing judgment than a mid-deliverable design fork.
- **Gate-and-ratchet is a natural autonomous stop.** Confidence
  closes the gate to tier N+1 if any tier-N unit is still flagged
  or verification is red. Under the full-stack posture that ratchet
  gate is a stop-and-surface point even mid-stack — the autonomous
  run respects it the way the default posture respects a phase
  boundary.
- **Delegation defaults invert.** Implementer / fixer delegation
  defaults **ON** in confidence (bulk transform → delegate the
  write) and **OFF** in interactive (keystroke pairing). The
  posture preserves each loop's default.

## Engineer / evaluator self-recusal

Plan engineers and evaluators are expected to **self-recuse
cleanly** when their lens does not apply to the current
artifact / question.

A clean recusal:

- Names the recusal explicitly (e.g. "**Recusing.**" as the first
  line, or `VERDICT: approved` with a non-applicability note for
  evaluators).
- Explains in one paragraph why the lens does not bite.
- Optionally suggests which other panel members are the right ones
  to lead.

A clean recusal is **not a failure** — the orchestrator expects
some engineers / evaluators to recuse on any given panel. A panel
of 8 engineers where 4 recuse and 4 contribute is healthy, not
broken.

The opposite anti-pattern is **stretched contribution**: an
engineer / evaluator inventing relevance to stay at the table
when their lens doesn't actually apply. This produces noise and
should be avoided. If you can't find a load-bearing observation
in your lens, recuse.

## Self-reference shape

When a finding inside a panel response references another agent's
contribution (e.g. design-systems engineer noting "defer to
substrate-engineer on this point"), the convention is to name the
other agent explicitly. This makes cross-perspective hand-offs
legible to both human readers and orchestrating skills.

Bad: "Someone else can speak to this better."

Good: "Deferring to `plan-substrate-engineer` on the schema
shape — that's their lens."

## Branch hygiene before substrate writes

The loom authoring skills (`loom plan` / `revise-plan` / `archive`,
and the ev-loop checkin / phase / event writes) commit to **whatever
branch is currently checked out** — they have no branch-awareness of
their own. Invoke one on the wrong branch and the work strands there:
a checkin meant for a phase branch lands on `main`, or a phase update
lands on a sibling branch and the manifest reads stale everywhere else.

**Before invoking any branch-committing substrate skill, confirm the
branch** — `git branch --show-current` — and that it matches the
phase/work you intend. This is cheap; the recovery (cherry-picking a
stranded commit onto the right branch, reconciling a split manifest)
is not. Loop bodies carry this as a preflight line; outside a loop,
make it a habit before the first `loom`/`ev` write of a session.

## Demonstrate before declaring done

Do not report a task complete on the strength of reasoning alone —
**demonstrate it**. Run the command and show the output; execute the
probe and paste what it returned; open the artifact and confirm the
change is there. "It should now work" / "the check fired with nothing
to do" is a claim, not evidence, and the gap between the two is where
false-green hides (a `Stop` hook catching a "done" that wasn't is the
expensive version of learning this).

The bar scales with reversibility and audience: a throwaway scratch
note needs no ceremony, but anything another engineer (or a gate, or
future-you) will trust as done gets a demonstration in the same breath
as the claim. When you can't demonstrate — the run is external, the
result is pending — say *that* plainly ("opened, awaiting CI") rather
than rounding up to done.

## Long-loop resilience

Long multi-call runs (`/ev-run` dispatching subagents, `/guild-validate`
panels, repeated CLI writes) accumulate two failure risks. The diagnosis
behind this section — which is a real, transient API error vs an unconfirmed
output cap — lives in
`projects/2026-05-30-shared-insights/OUTPUT-OVERLOAD-DIAGNOSIS.md`; the two
items below are scoped deliberately to match what that diagnosis confirmed.

**Overload retry-with-backoff (a confirmed remedy — do this).** An API
`529 Overloaded` is a transient capacity signal, not a length cap or a
content error: the same request often succeeds on retry. When a subagent
spawn, a panel, or a CLI call fails with `529` (or a comparable transient
overload), **retry with exponential backoff** — a few attempts (e.g. ~1s,
2s, 4s) before surfacing it as a failure — rather than treating the first
529 as fatal and stranding the loop. A 529 that survives a few backed-off
retries is a real outage; surface it then.

**Large-deliverable hygiene (defensive, NOT a cap-workaround).** Writing a
large deliverable (a PLAN, a long PR body, a diagnosis, a research dossier)
to a file incrementally — and streaming short progress per phase rather than
emitting one giant terminal response — bounds the blast radius if a long
session's transcript is lost or truncated for *any* reason. Treat this as
good loop hygiene, **not** as a workaround for a confirmed output cap: per
the diagnosis above, no real ~500-token general cap is established, so this
is recommended practice on its own merits (smaller diffs, resumable work,
legible progress), not a mandated mitigation for a ceiling that may not
exist.
