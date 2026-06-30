---
name: loom-migrate
description: >-
  Execute a runbook migration — pluck a bounded batch of annotated work
  sites, apply each site's runbook (migration dictionary) transform, verify,
  and open one PR for the batch. The execution half of the decentralized
  work-distribution axis (project 2026-06-30-distributed-project-store,
  Phases 6-8): /loom-runbook authors the inventory in the code, this skill
  works it off a batch at a time, and /ev-goal repeats until the dict-id
  scans clean. Use to run a migration authored by /loom-runbook.
argument-hint: "<runbook-path> [--dict-id=<id>] [--batch=<N>] [--root=<path>] [--mode=auto]"
user-invocable: true
disable-model-invocation: true
allowed-tools: Read, Write, Edit, Bash, Skill, AskUserQuestion, Bash(loom *), Bash(guild *), Bash(git *)
---

# /loom-migrate

Work off a runbook migration **one bounded batch at a time**. The inventory
lives in the code as `MIGRATE:<dict-id>` annotations referencing a runbook
(authored by `/loom-runbook`); this skill plucks a batch, transforms it, and
opens a PR. `/ev-goal` repeats it until no sites remain. The **partition is
the batch/branch**, so many runs make progress without a central queue.

## Arguments

- `<runbook-path>` — the migration dictionary TOML (`runbooks/<name>.toml`).
- `--dict-id=<id>` — work only this migration's sites (default: all ids in
  the runbook).
- `--batch=<N>` — max sites per PR (default 10). Bounded so each PR stays
  reviewable and conflicts stay small.
- `--root=<path>` — scan root (default repo root).
- `--mode=auto` — substrate auto-mode posture (per `docs/AGENT-CONVENTIONS.md`).

## Process

### 1. Scan the inventory

```
loom runbook scan <root> --dict=<runbook-path>
```

Filter the returned sites to `--dict-id` if given. **`unknown` must be 0** —
a non-zero count means a marker references a dict-id the runbook doesn't
define; stop and surface it (the inventory is inconsistent). If zero sites
remain, the migration is **complete** for this id — exit clean (this is the
terminal state `/ev-goal` watches for).

### 2. Select a bounded batch

Take the first `--batch` sites (deterministic order: by `file`, then
`line`). Keeping batches small bounds PR size and the blast radius of a bad
transform.

### 3. Branch

Cut a migration branch off a freshly-pulled base, e.g.
`migrate/<dict-id>-<n>`. One branch = one batch = one PR.

### 4. Transform each site

For each site in the batch, read its runbook entry (`description` + the
`runbook` transform spec) and apply that spec to the site, using the site's
`params`. The runbook entry is **self-contained** — a worker transforms a
site from the marker + the entry alone. After transforming, **remove or
update the `MIGRATE:<dict-id>` marker** so the site no longer scans — the
marker's absence in the diff is the done-signal.

Keep strictly to the runbook spec. If a site doesn't match the spec's
assumptions (the recognizer over-matched), **skip it, leave its marker**, and
note it — do not force a transform the runbook didn't describe.

### 5. Verify

Run the repo's gate (tests / lint / build) over the change. A red gate means
**do not open the PR** — fix or reduce the batch. In `--mode=auto`, compose
`/guild-validate` over the changed files as the evaluator gate.

### 6. Open one PR for the batch

Push the branch and open a PR titled for the migration + batch (e.g.
`[migrate] <dict-id> batch <n> (<k> sites)`). The PR body lists the
transformed sites. Merging it removes those sites from the inventory; the
next `/loom-migrate` run scans fewer.

## Running under /ev-goal

`/ev-goal` dispatches `/loom-migrate` per batch: each run opens a PR, the PR
merges (or its activity wakes the driver), and the driver re-runs until
`loom runbook scan --dict=<runbook> --dict-id=<id>` returns zero sites — the
migration's goal predicate. This is the runbook execution mode (Phase 7).
**Decentralized claim/lease so concurrent runs don't grab the same sites is
Phase 8** — until it lands, run one `/loom-migrate` at a time per dict-id.

## Rules

- **Bounded batches.** Never transform the whole inventory in one PR; respect
  `--batch`.
- **Self-contained transforms.** Apply only what the runbook entry describes;
  skip-and-flag sites that don't fit rather than improvising.
- **Marker removal is the done-signal.** A transformed site must no longer
  scan; an untransformed one keeps its marker.
- **Red gate, no PR.** Verify before opening.
- **No emojis.**

## Failure modes

- Non-zero `unknown` from the scan → inconsistent inventory; stop and fix the
  marker or runbook (do not transform).
- Over-matched recognizer (sites that don't fit the spec) → skip-and-flag;
  tighten the predicate in `/loom-runbook` and re-seed.
- Gate fails on the batch → shrink the batch or fix the transform; never open
  a red PR.
- Two concurrent runs collide on the same sites → expected until Phase 8;
  serialize per dict-id for now.
