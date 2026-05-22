---
name: linear-loom-research
description: >-
  Birth a Linear-backed research dossier. Interviews the operator for
  research context (with Linear-specific bootstrap questions covering
  Linear Project selection + loom-project naming), produces RESEARCH.md
  + RESEARCH-NOTES.md on disk, and uploads both to Linear as Documents
  via `bin/linear-loom research`. Use when the operator wants a
  research dossier whose results live alongside the team's other Linear
  Project artifacts.
argument-hint: "<topic or short description>"
user-invocable: true
disable-model-invocation: true
allowed-tools: Read, Write, Bash, AskUserQuestion
---

# /linear-loom-research

Birth a research dossier whose every claim cites a source, and land it
both in git (`projects/<slug>/RESEARCH.md` and `RESEARCH-NOTES.md`) and
in Linear (as two Documents under the bound Linear Project). The skill
is the linear-loom-side counterpart to `/loom-research`; it diverges in
two ways per DESIGN.md § 14:

- **Linear-side bootstrap questions** at the start of the interview
  (which Linear Project; existing loom-project or new one; namespace
  prefix when the Linear Project hosts multiple loom-projects).
- **No griot integration** (DESIGN.md § 18). The operator invokes
  `/griot-use` separately if they want rollup context.

This skill is operator-direct (not model-invocable) per DESIGN.md § 1.

## Inputs

- `<topic or short description>` — what the research is about. The
  first half of the interview presses this into concrete questions.
- No `--mode=auto` for v1. The personal-CLI scope per the Round 1
  reduction in PLAN.md treats human-in-the-loop as the default; an
  auto-mode would compose against the same `bin/linear-loom research`
  verb if a future v2 wants it.

## Process

### 1. Pre-flight

- Verify `bin/linear-loom` is on PATH:
  ```
  Bash("command -v linear-loom >/dev/null 2>&1 || { echo 'linear-loom CLI not on PATH. Install the plugin via the marketplace.' >&2; exit 1; }")
  ```
- Resolve a candidate slug from the topic (kebab-case derivation). If
  the user passed an explicit slug-shaped argument, use it verbatim.
- Check whether `projects/<slug>/linear.json` exists:
  - **Exists**: proceed in "append-to-existing-loom-project" mode.
    The Linear Project ID and label are already known from the marker.
  - **Absent**: proceed in "bootstrap-new-loom-project" mode. Step 2
    below asks the Linear-Project-selection questions.

### 2. Linear-side bootstrap (only when marker is absent)

Walk the operator through:

- **Linear Project ID**: ask the operator which Linear Project this
  research should live under. Recommend a specific Project if any
  recent `projects/*/linear.json` in this repo points at one. The
  operator pastes the Linear Project ID; no defaults per DESIGN.md § 4.
- **loom-project slug**: confirm or refine the slug derived from the
  topic. The slug is the per-repo identifier; the Linear-side label
  becomes `loom-project:<slug>` automatically.
- **Existing loom-project under the same Linear Project**: if the
  operator confirms reusing a Linear Project that already hosts other
  loom-projects, surface the existing labels so they pick a non-
  colliding slug. (Operator's responsibility; no automated dedup in
  v1.)

When the operator confirms the answers, shell out to bootstrap the
binding:

```
Bash("linear-loom project create <slug> --linear-project=<id> --pretty")
```

The `project create` verb is idempotent on the Linear-side label
lookup but non-destructive on the marker file — if the marker
already exists, the verb errors with `project-already-exists` and
this skill stops. Surface the error to the operator and ask whether
they meant to append to the existing loom-project (step 1 detection
would have caught it, but the slug they typed may not match what's
on disk).

### 3. Research interview (grill-me posture)

Walk the topic by asking concrete, evidence-seeking questions. For
each question:

- **Recommend an answer** before asking — opinionated, grounded in
  whatever you can cite (repo files, web fetches, the operator's
  prior projects).
- Ask **one** question at a time using `AskUserQuestion`. Wait for
  the answer.
- For every claim, prompt for the source or observable: a file path,
  a URL, a measurable signal, a named person. Opinion without a
  source surfaces as `[unsourced]` in the draft.

Track open threads as you go. When the interview stalls (operator
says "I think we're done" or you run out of meaningful questions),
move to step 4.

### 4. Synthesize RESEARCH.md and RESEARCH-NOTES.md

Write two files to `projects/<slug>/`:

- **RESEARCH.md**: the synthesized output. Cite sources inline using
  a footnote-style or parenthetical-link convention. Sections roughly:
  Context, Findings, Open questions. Each finding paragraph names its
  evidence.
- **RESEARCH-NOTES.md**: the raw interview transcript (questions
  asked, answers given, sources cited per turn). The notes file is
  the receipt for the synthesized RESEARCH.md.

Mark any unsourced claim with `[unsourced]` so the operator can see
which parts of the synthesis are opinion rather than evidence.

### 5. Upload to Linear

Shell to the CLI:

```
Bash("linear-loom research <slug> --research-file=projects/<slug>/RESEARCH.md --notes-file=projects/<slug>/RESEARCH-NOTES.md --pretty")
```

The verb uploads both files as Linear Documents with the standard
3-line provenance header (DESIGN.md § 13). On success, the CLI
returns the two Document URLs.

### 6. Report

Tell the operator:

- The local file paths (`projects/<slug>/RESEARCH.md`,
  `RESEARCH-NOTES.md`).
- The two Linear Document URLs from the CLI's output.
- Any open questions or `[unsourced]` markers that the operator
  should circle back to.

## Rules

- **One question at a time.** The interview's grill-me posture
  depends on the operator answering each prompt before the next
  lands. Don't bundle.
- **Source or `[unsourced]`.** Every claim has a citation or an
  explicit marker. No silent opinion.
- **Linear-side bootstrap is conditional.** Step 2 runs only when
  the marker file doesn't already exist. Re-runs against an existing
  loom-project skip straight to the interview.
- **No griot composition** (DESIGN.md § 18). If the operator wants
  rollup context they invoke `/griot-use` themselves.
- **No emojis** in committed prose.

## Failure modes

- `bin/linear-loom` not on PATH → stop with the actionable shim
  error message.
- Linear API authentication failure → the `project create` or
  `research` verb surfaces a structured `missing-auth` / `auth-refused`
  error; pass it through to the operator with the remediation steps
  documented in `plugins/linear-loom/SETUP.md`.
- Document upload partial-success (research uploaded but notes
  failed) → the CLI's error message names the already-uploaded URL;
  the operator decides whether to delete the orphan and retry.
- Operator cancels mid-interview → no files written; the skill
  exits cleanly. Linear-side bootstrap from step 2 is non-destructive
  (the label exists in Linear, the marker file may exist on disk —
  the next invocation picks up where this one stopped).
