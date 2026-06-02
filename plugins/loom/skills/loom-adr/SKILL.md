---
name: loom-adr
description: >-
  Record an Architectural Decision Record (ADR) to the workspace-level
  adr-log. Use when an architectural decision worth being durable —
  visible to other engineers and to future agents — surfaces in
  conversation: a chosen tradeoff, a deliberate constraint, a deferred
  alternative, a load-bearing invariant. Composes `loom adr` (the CLI
  verb) which writes `projects/adr-log/NNNN-<title-slug>.md` with
  permanent sequential numbering. ADRs are append-only; revise by
  writing a NEW ADR with `--status=superseded` body-linking to the
  prior number, never edit the old file.
argument-hint: "<title> [--body-file=<path>] [--status=<status>]"
user-invocable: true
disable-model-invocation: false
allowed-tools: Read, Bash, Write, AskUserQuestion, Bash(loom *)
---

# /loom-adr

Record an architectural decision as a durable, numbered ADR. The
verb is the deterministic seam (`loom adr "<title>"` writes the file
and commits it); this skill is the orienting layer that decides
whether the decision in front of you is worth an ADR, composes a
body file from the conversation context, and invokes the verb.

## When to use this skill

Trigger on language like:

- "Let's record this as an ADR"
- "We should document this decision"
- "Capture this tradeoff for future readers"
- "Make this architectural choice visible"
- "Why did we pick X over Y?" — when the user is realizing the
  rationale should be recorded, not asked-and-forgotten

The decision should be **architectural** — visible to other engineers
or agents, not local-to-a-PR. A naming choice that affects one
function isn't an ADR; a naming convention that constrains how
future siblings get named is. A `useState` vs `useReducer` choice
inside one component isn't an ADR; the team's stance on state
management across the design system is.

Signals an ADR fits:

- The decision will be **referenced later** ("we decided X because Y"
  in a PR comment, in another ADR, in onboarding docs).
- The decision **closes off alternatives** — there were two reasonable
  paths, and the choice has cost-of-reversal beyond a single PR.
- The decision is **load-bearing** — other decisions depend on this
  one being settled.
- A future agent or engineer **reading the code alone wouldn't
  reconstruct the rationale** — the why isn't in the diff.

Signals an ADR does NOT fit:

- The decision is captured by the diff itself (rename, refactor,
  one-line behavior change).
- The decision is project-local and the project's `PLAN.md` /
  `INTERVIEW.md` already records it.
- The "decision" is a question still being debated — write the ADR
  with `--status=proposed` if you want to log the debate, but most
  in-flight discussions belong in the project's research artifacts
  or a PR thread until they crystallize.

## When invoked from within `ev-loop-interactive`

The `ev-loop-interactive` skill's unit loop includes an ADR-emit
hook (step 5.5, between scope-shift detection and phase update)
that fires once per unit close. The hook scans the just-written
checkin's `notes_for_pr` array for entries containing the literal
`[adr-candidate]` marker (case-sensitive, bracketed-literal) and,
per match, offers the operator the chance to lift the entry into a
real ADR via this verb. The marker convention is the operator's
intent; the hook is the offer.

When invoked from that path, the calling pattern is fixed:

```bash
node plugins/loom/cli/loom.ts adr "<title>" \
  --body-file=<tmp-path> \
  --no-commit
```

Three things matter about that invocation, and downstream agents
following this skill from within the loop should preserve all
three:

- **`--body-file`** carries a body composed by the loop (Context =
  paraphrase of the marked entry + the unit's contract goal,
  Decision = the decision the operator named, Consequences = a
  literal `TODO: operator to fill before commit` line). The body
  is intentionally incomplete so the operator hand-edits before
  the checkin's git commit step runs.
- **`--no-commit`** is mandatory. The verb's default auto-commit
  would race the checkin commit; the hook stages the returned ADR
  path for the unit's git-add list so the ADR rides the same git
  commit as the manifest update — one revertable bundle if the
  ADR turns out wrong.
- **`node plugins/loom/cli/loom.ts`** (not bare `loom`) is the
  encoded invocation. The cached-PATH-binary lag pattern documented
  in `2026-05-28-loom-adr`'s P2D2 `notes_for_pr` means the bare
  `loom adr` invocation can still fail with `unknown-verb` in fresh
  sessions even after the marketplace dependency has shipped. The
  `node …/loom.ts` form is the substrate's working path until the
  cache-lifecycle issue is resolved.

See `plugins/ev/skills/ev-loop-interactive/SKILL.md` § Step 2 unit
loop, sub-step 5.5 for the full hook semantics (scan, per-match
flow, event vocabulary, idempotency posture, auto-mode behavior).

## Process

### 1. Confirm the decision is worth an ADR

Look at what's in conversation. If the user explicitly asked, skip
to step 2. Otherwise reflect back the candidate decision in one
sentence and confirm — auto-firing on every "decision-flavored"
sentence creates noise. The skill body's job here is to be a
careful filter.

### 2. Compose the body

Prefer `--body-file=<path>` over the verb's default TODO stub when
the decision context is already in conversation. The default stub is
a TODO scaffold for the operator to fill in later; if you have the
context now, write it now.

Body structure (the conventional shape, matching the TODO stub the
verb writes):

```markdown
## Context

<What forces the decision? What constraints, prior choices, or
domain facts make this a real decision and not a trivial choice?>

## Decision

<What was decided. Stated plainly. The decision sentence is the
TL;DR — readers should be able to skim just this section and know
what we did.>

## Consequences

<What follows from the decision. What is now easy that wasn't
before. What is now harder. What alternatives were closed off.
What this commits us to. What we'll watch for if the decision
turns out to be wrong.>
```

Write the body to a temp file (`/tmp/loom-adr-<slug>.md` is the
substrate convention used by loom's other body-file paths).

### 3. Invoke the verb

```
loom adr "<title>" --body-file=/tmp/loom-adr-<slug>.md
```

Optional flags:
- `--status=<status>` — defaults to `accepted`. Convention:
  `proposed | accepted | deprecated | superseded`. Freeform in v1;
  no enum enforcement.
- `--no-commit` — write the file but skip the git commit. Use when
  the ADR will commit alongside other work in the same PR (e.g. a
  unit's checkin commits an ADR-candidate alongside the
  implementation diff).

The verb writes `projects/adr-log/NNNN-<title-slug>.md` with
sequential numbering (next number = max existing + 1, NOT
count + 1 — see `projects/CONVENTIONS.md § Architectural
Decisions`) and (unless `--no-commit`) commits with the message
`[loom] adr NNNN: <title>`. The verb emits JSON
`{number, slug, path, status, committed}` on stdout.

### 4. Report

Surface the path + number to the user so the ADR is locatable.

## Revising an ADR (append-only)

ADRs are append-only. The numbering invariant exists for one
reason: cross-references to "ADR-0007" in commit messages, PRs, and
other ADRs must never silently re-point to a different decision.

To revise a decision:

1. Write a NEW ADR with `--status=superseded`.
2. In the body's `## Context` section, name the prior ADR number
   you're superseding and why.
3. Do NOT edit the old file. Its `## Status` line stays whatever it
   was; the new ADR's existence is the supersession record.

There is no `loom adr supersede` sub-verb in v1. The convention is
the contract. If you find yourself wanting to edit an old ADR,
stop and write a new one instead.

## Rules

- **Architectural scope only.** If the decision doesn't affect
  others' work, it's not an ADR.
- **Body file over TODO stub when context exists.** Don't leave a
  stub if you have the substance.
- **Never edit a committed ADR.** Always write a new one with
  `--status=superseded`.
- **Numbers are permanent.** A deleted ADR leaves a permanent gap.
  Cross-references depend on this.
- **No emojis.**

## Failure modes

- Title slugifies to fewer than 2 characters → `invalid-title` from
  the verb. Pick a longer, more descriptive title.
- `--body-file` path doesn't exist → `body-file-not-found`. Check the
  path or fall back to the TODO stub by omitting `--body-file`.
- Decision is too narrow / not architectural → don't invoke the
  skill. The right surface is a PR description or a code comment.
- Decision is still being debated → either write with
  `--status=proposed` (logs the debate) or wait until it
  crystallizes. Most debates belong in PR threads or research
  artifacts until they're settled.
