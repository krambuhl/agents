# Absorb draft into loom + add research verb

## Context

The `draft` and `loom` CLIs were originally split: `draft` for planning
(birthing a `PLAN.md`), `loom` for the project lifecycle (manifests,
phases, checkins, retros). In practice the seam is awkward — `draft
revise` exists to handle mid-project revisions, but a revision is
fundamentally *lifecycle work* (a plan changing because the work
changed), not planning work. Carrying a separate `bin/draft` shim and
`/draft-plan` skill family for what is conceptually the same project's
planning surface is friction without payoff.

This project folds `draft`'s verbs into `loom`, adds a pre-planning
`loom research` verb (deep-research, fact-based, grill-me style), and
updates the surrounding skills (`ev-loop-*`, `ev-run`, the plan-revise
recipe) to reference the new home. After this lands, the planning and
execution surfaces live in one CLI, and a project's genesis has a
real research phase ahead of the plan.

## Scope

**In:**
- Move `draft plan` → `loom plan` (verb + tests, behavior unchanged).
- Move `draft revise` → `loom revise-plan` (verb + tests, behavior unchanged).
- Move `draft read` → `loom plan-read` (so `bin/draft` can disappear).
- Add new `loom research` verb that produces `RESEARCH.md` (synthesis)
  + `RESEARCH-NOTES.md` (rolling investigation transcript) at project
  root, alongside `PLAN.md` / `INTERVIEW.md`. Auto-adopts loom substrate
  by default; supports `--no-loom` for symmetry.
- Rename `/draft-plan` skill → `/loom-plan`.
- Add `/loom-research` skill (grill-me style, fact-based interview).
- Add `/loom-revise-plan` skill (lighter interview for mid-project
  revisions).
- Update `/ev-loop-interactive`, `/ev-loop-confidence`, and `/ev-run`
  skill copy and recipe references.
- Update the `§ Revise PLAN.md` recipe in `SUBSTRATE-COMPOSITIONS.md`
  (wherever it lives in the canonical repo).
- Delete `bin/draft` shim, `cli/draft.ts`, `cli/verbs/draft.ts`, and
  the old `/draft-plan` skill file once the moves land.
- Update `install.sh` to stop generating `bin/draft`.

**Out:**
- Reshaping the loom project file layout (`manifest.json`,
  `config.json`, `events.jsonl`, `checkins/`, `sessions/` stay as-is).
- Changing the `PLAN.md` / `INTERVIEW.md` document shape — this
  project is about *where the verbs live*, not *what they produce*.
- Reworking `§ Revise PLAN.md` recipe semantics — only updating the
  CLI path it calls.
- Backwards-compatibility shims (`bin/draft` does not survive as an
  alias; project ethos is no compat layers).

**Deferred:**
- A `loom revise-research` verb (revising `RESEARCH.md` mid-project) —
  wait to see if the need shows up in real use.
- A `--from-research=<path>` flag on `loom plan` to pre-seed the
  interview with `RESEARCH.md` context — nice if cheap, defer if it
  requires schema changes.
- Archive-aware research dossiers ("read `RESEARCH.md` from project X
  to seed project Y") — same reasoning.

## Phases

### Phase 1: Move draft verbs into loom

One PR. Move `plan`, `revise`, and `read` handlers from
`cli/verbs/draft.ts` into a new `cli/verbs/plan.ts` under loom. Wire
them into `cli/loom.ts` as top-level verbs: `loom plan`, `loom
revise-plan`, `loom plan-read`. Move existing tests
(`cli/verbs/draft.test.ts`) alongside the new module.

No behavior changes — pure relocation + rename. `bin/draft` keeps
working in this PR (its entry imports the same handlers from the new
module path) so nothing downstream breaks mid-phase.

**Verifies:** `npm test` green (existing draft tests pass under new
names); `bin/loom plan` and `bin/loom revise-plan` work end-to-end
against a scratch slug.

### Phase 2: Add `loom research` verb + scaffolding

One PR. Add `cli/verbs/research.ts`. Interface mirrors `loom plan`:

```
loom research <slug-or-topic> \
  --research-file=<path> \
  --notes-file=<path>
```

Writes `RESEARCH.md` + `RESEARCH-NOTES.md` into the project root,
auto-adopts loom substrate if not present (reuses the same auto-adopt
path `loom plan` uses today via `cli/lib/adopt.ts`), commits via the
same git seam. Supports `--no-loom` for symmetry.

Add `cli/verbs/research.test.ts` covering the happy path,
collision behavior (existing `RESEARCH.md`), and `--no-loom`.

**Verifies:** `npm test` green; `bin/loom research <slug>` produces
the two files in the expected location and emits a clean JSON
envelope.

### Phase 3: Rebuild planning skills

One PR. Three skill changes that are tightly coupled by the rename:

- **Rename `/draft-plan` → `/loom-plan`.** Update every shell
  invocation from `bin/draft plan` → `bin/loom plan`. Update the
  failure-modes section to suggest `bin/loom revise-plan` instead of
  `bin/draft revise`.
- **Add `/loom-research`.** Grill-me style, fact-based. Walks research
  questions branch-by-branch (sources, constraints, prior art,
  decisions already made, open questions). Synthesizes `RESEARCH.md`
  + `RESEARCH-NOTES.md`, then shells to `bin/loom research`. The
  skill text explicitly documents the contrast vs `/loom-plan`:
  evidence-first, not recommendation-first; citations are first-class;
  no opinionated "I recommend X — confirm?" framing.
- **Add `/loom-revise-plan`.** Lighter interview than `/loom-plan` —
  surface the change, capture rationale, regenerate the diff, shell
  to `bin/loom revise-plan`.

**Verifies:** Invoke each skill against a scratch slug end-to-end,
confirm the right artifacts land and the right CLI verbs run.

### Phase 4: Update loops + recipes + delete `bin/draft`

One PR. Cleanup phase:

- Update the `§ Revise PLAN.md` recipe (in `SUBSTRATE-COMPOSITIONS.md`,
  wherever it lives in the canonical repo) to call `bin/loom
  revise-plan` instead of `bin/draft revise`.
- Update `/ev-loop-interactive` and `/ev-loop-confidence` SKILL.md
  copy where they mention `bin/draft` or `/draft-plan`.
- Update `/ev-run` SKILL.md (line ~204) to suggest `/loom-plan`.
- Update `loom-archive` SKILL.md grill-me reference (line ~64).
- Delete `bin/draft` shim.
- Delete `cli/draft.ts` and `cli/verbs/draft.ts` (now empty after
  Phase 1).
- Delete the original `/draft-plan` skill file.
- Update `install.sh` to stop generating `bin/draft`.
- Update `README.md` if it references draft.

**Verifies:** `npm test` green; `install.sh` produces a clean state
with only `bin/loom`, `bin/guild`, `bin/griot`; repo-wide grep for
`bin/draft`, `cli/draft`, and `/draft-plan` returns nothing (other
than this project's own `PLAN.md` / `INTERVIEW.md`).

## Dependencies

- Phase 1 must merge before Phase 4 (Phase 4 deletes the old draft
  files; Phase 1 has to land the moved versions first).
- Phase 2 is independent of Phase 1 (different verb, different file)
  but easier to review after Phase 1 because it follows the same
  pattern.
- Phase 3 depends on Phase 1 (the new skill text shells to `bin/loom
  plan`, which doesn't exist until Phase 1 lands) and Phase 2
  (`/loom-research` shells to `bin/loom research`).
- Phase 4 depends on all three preceding phases.

Recommended landing order: **1 → 2 → 3 → 4**. Phase 2 could overtake
Phase 1 in development but should land after to keep each PR's diff
small.

## Verification

- `npm test` — full suite green at each phase.
- `npm run lint` (if present) at each phase.
- Per-phase manual smoke: invoke the renamed/added verb against a
  scratch slug in `projects/`, confirm the JSON envelope, confirm the
  files land in the right place, confirm the git commit message reads
  cleanly.
- Phase 4 gate: repo-wide grep for `bin/draft`, `cli/draft`,
  `/draft-plan` returns only this project's own self-references.

## Risks

- **Recipe references in `SUBSTRATE-COMPOSITIONS.md` are easy to
  miss.** *Mitigation:* the Phase 4 grep gate is the safety net;
  treat it as blocking.
- **The `loom research` interview style needs to feel different from
  `loom plan` — facts-first, not recommendations-first — or users
  will conflate them.** *Mitigation:* the `/loom-research` SKILL.md
  explicitly documents the contrast and gives example question
  shapes; the skill doc *is* the rubric.
- **Renaming `/draft-plan` → `/loom-plan` will break muscle memory.**
  *Mitigation:* accept the one-time cost; no alias.
- **`bin/draft` deletion could orphan an in-flight project on the
  user's machine that hasn't yet adopted the new verbs.**
  *Mitigation:* Phase 4 is the cleanup PR; user controls when it
  merges. Land 1–3 first, smoke-test, then merge 4.
- **`loom plan-read` is awkward compared to `draft read`.**
  *Mitigation:* live with it — `plan-` makes the namespace clear,
  and the verb is tooling-consumed not user-typed.

## Open questions

- Does `loom research` need a `--from-archive=<slug>` flag to seed
  itself with a prior project's `RESEARCH.md`? Deferred — build the
  simple shape first.
- Should `loom plan` accept a `--from-research=<path>` flag to
  pre-seed the interview with `RESEARCH.md` content? Deferred —
  revisit after Phase 2 ships.
- Naming: `loom revise-plan` vs `loom plan-revise` vs namespaced
  `loom plan revise`? Going with flat per user's framing; namespacing
  later is a small follow-up if it stops feeling right.

## Decisions

- **Flat top-level verbs** (`loom plan`, `loom research`, `loom
  revise-plan`) instead of namespaced (`loom plan create`, etc.).
  *Why:* these are project-genesis verbs at the same conceptual
  level as `loom project scaffold`, and the user's framing was flat.
  Cheap to namespace later if it stops feeling right.
- **No backwards-compat shim** for `bin/draft`. *Why:* project ethos
  is no compat layers; the user is the only consumer; one rename,
  one cost.
- **Two research artifacts (`RESEARCH.md` + `RESEARCH-NOTES.md`)
  mirroring the `PLAN.md` + `INTERVIEW.md` pattern.** *Why:* the
  separation between polished synthesis and raw transcript has
  worked well for planning; reuse the pattern for research.
- **Move existing draft tests rather than rewriting them.** *Why:*
  verbs are unchanged in behavior — only renamed. Renaming the test
  descriptions is enough; no rewrite churn.
- **Phase 4 deletes `bin/draft` outright.** *Why:* see no-compat-shim
  above. Clean repo over soft landing.
