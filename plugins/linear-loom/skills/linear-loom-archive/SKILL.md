---
name: linear-loom-archive
description: >-
  Close out a Linear-backed loom-project. Interviews the operator for
  retrospective content, writes a RETRO markdown file, uploads it to
  Linear as a Document via `bin/linear-loom retro`, and (optionally)
  marks the loom-project archived in Linear. Use when a project is
  done and the operator wants the closing notes captured alongside
  the other artifacts.
argument-hint: "<slug>"
user-invocable: true
disable-model-invocation: true
allowed-tools: Read, Write, Bash, AskUserQuestion
---

# /linear-loom-archive

Close out a loom-project: interview the operator for a retrospective,
upload the retro as a Linear Document, and (optionally) flip the
Linear-side status to archived. This is the linear-loom-side
counterpart to `/loom-archive` per DESIGN.md § 1.

Per DESIGN.md § 14, the archive interview is re-designed for the
linear-loom personal-CLI scope: shorter than loom's archive flow,
focused on the retrospective + the close-out decision. No git
commits — the retro file is operator-curated (they may commit it
to the project's `projects/<slug>/` directory, or leave it
Linear-only).

Operator-direct, not model-invocable (DESIGN.md § 1).

## Inputs

- `<slug>` — the loom-project to close out. Required; no defaults.
  The skill stops if `projects/<slug>/linear.json` doesn't exist.

## Process

### 1. Pre-flight

- Confirm `bin/linear-loom` is on PATH.
- Verify `projects/<slug>/linear.json` exists. If it doesn't, stop
  with an error pointing at `/linear-loom-research` or
  `/linear-loom-plan` as the bootstrap path.

### 2. Snapshot project state

Run `linear-loom project status <slug> --pretty` and surface the
result to the operator as orientation:

- Current phase (or "no active phase" if everything's completed).
- Active task count (Linear Sub-Issues with state != completed/
  canceled).
- Linear Project URL.

Use this to ground the retro questions in the actual project shape.

### 3. Decide the retro type

Ask the operator which kind of retro they're closing out:

- **`project`** — full project-level retrospective (the typical
  archive case).
- **`phase-N`** — retro on a specific completed phase, when the
  operator wants to capture phase-level lessons before the rest of
  the project ships.
- **`followup`** or other operator-chosen kebab-case identifier —
  open-ended.

The `--type` value must match `^[a-z0-9]+(-[a-z0-9]+)*$` or the CLI
will reject it. Recommend a value, confirm with the operator.

### 4. Retro interview (grill-me posture)

Walk the operator through:

- **What went well?** Concrete examples.
- **What was painful?** Concrete examples.
- **What would you do differently?** Specific, actionable.
- **What surprised you?** Non-obvious lessons worth capturing.
- **What's the follow-up?** Tasks that the retro identifies (not
  necessarily resolved now; just named).

Ask one question at a time. Recommend an opinionated take based on
the project's evidence (phase checkin notes, recent commits, the
PLAN.md decisions log) before asking.

### 5. Synthesize RETRO file

Write the synthesized retro to a temp path
(e.g. `/tmp/<slug>-RETRO-<type>.md`). Markdown structure:

- One-paragraph context.
- Sections for each interview question's findings.
- A `## Follow-ups` section listing the action items the retro
  surfaces.

### 6. Upload to Linear

Shell to:

```
Bash("linear-loom retro <slug> --type=<type> --retro-file=/tmp/<slug>-RETRO-<type>.md --pretty")
```

The verb uploads as a Linear Document titled `<slug> · RETRO-<type>`
with the standard provenance header.

### 7. Ask about close-out

Once the retro is uploaded, ask the operator:

- Do they want to commit the RETRO file to git at
  `projects/<slug>/RETRO-<type>.md`? (Default: no — retros are
  often Linear-side only. If yes, the skill writes the file and
  shells to `git add` + `git commit -m "[linear-loom archive] <slug>:
  RETRO-<type>"`.)
- Do they want to flip the Linear Project / loom-project status
  to archived? (Status authority lives on Linear-side per DESIGN.md
  § 11. The operator does this manually in Linear's UI for v1; a
  future `linear-loom project archive` verb could automate it.)

### 8. Report

Tell the operator:

- The Linear Document URL for the retro.
- The committed RETRO file path (if they chose to commit).
- Any follow-up items the retro surfaced.

## Rules

- **Marker presence is required.** This skill closes out an existing
  loom-project; it doesn't bootstrap one.
- **`--type` is operator-supplied** and must be kebab-case. Recommend
  but never silently slugify.
- **Git commits are opt-in.** Step 7 asks; default is Linear-only.
- **No emojis** in committed prose.

## Failure modes

- Missing marker → stop with the bootstrap-path error message.
- Linear API auth / upload failure → the CLI's structured error
  envelope passes through. The temp retro file is preserved so the
  operator can re-run the CLI directly after fixing.
- Operator cancels mid-interview → no upload, no commit. Temp file
  may persist.

## Future extension

A `linear-loom project archive` CLI verb would let this skill flip
Linear-side status atomically with the retro upload. v1 keeps the
status-flip operator-manual to respect DESIGN.md § 11's "Linear
state is the source of truth" — the operator decides when to
archive in Linear's own UI. If automation becomes a papercut, the
verb is a natural follow-on.
