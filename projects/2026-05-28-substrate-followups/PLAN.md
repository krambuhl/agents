# Substrate-followups

Ship the 4 unresolved tactical follow-ups carried over from the
just-archived substrate-consolidation project: one substrate-shape
question (the 3-copy doc redundancy), two loom CLI tweaks (`loom
doctor` exit-code + `pr respond` responses path), and one
post-install verification (the live-spawn smoke for renamed guild
agents). Each is independently shippable; the project is small (4
PRs total) and exists to close the substrate-consolidation loop
cleanly rather than leave the carry-overs as floating substrate
debt.

See [RESEARCH.md](./RESEARCH.md) for the per-follow-up dossier
covering current state, the gap, candidate approaches, and the
recommendation each phase below adopts.

## Context

The parent project (substrate-consolidation, PRs #68–#99) collapsed 6
fork plugin families into the canonical loom/guild/ev plugins via a
harvest-first / delete-last sequence across 7 phases. The parent's
retro recorded 5 follow-ups; this project executes 4 of them. The
5th (PR cadence) is resolved by in-flight PR #100 landing the parent
project's `.plan → main`.

This project is a deliberate counterweight to the parent's biggest
operational drag: the parent's PR cadence question (".plan periodic vs
one integration PR") was carried unresolved for 7 phases and surfaced
in every Phase 6/7 checkin's `notes_for_pr`. Substrate-followups
settles its cadence upfront (see § Decisions) so the same drag
doesn't recur.

## Scope

### In

- **Follow-up #1 — 3-copy doc redundancy**: a CI hash check + sync
  script for the per-plugin `docs/{SUBSTRATE-COMPOSITIONS,LOOM-CONVENTIONS}.md`
  copies (option (d) from RESEARCH.md § Follow-up #1).
- **Follow-up #2 — `loom doctor` exit-code**: flip
  `plugins/loom/cli/verbs/loom/doctor.ts:105-106` to exit non-zero
  when `ok:false` (option (a) from RESEARCH.md § Follow-up #2),
  update tests, simplify the ev preflight tier-2 workaround.
- **Follow-up #3 — Live-spawn smoke**: document-only checklist under
  `plugins/guild/docs/AGENT-CODEGEN.md` § Live-spawn smoke, with a
  named log location for the smoke result (option (a) from RESEARCH.md
  § Follow-up #3).
- **Follow-up #4 — L332 responses path**: relocate `pr respond`'s
  output from `checkins/<branch>/responses/<id>.md` to
  `responses/<branch>/<id>.md` (option (a) from RESEARCH.md § Follow-up
  #4); update `LOOM-CONVENTIONS.md` § Project layout to drop the
  legacy `checkins/` directory note.
- **Follow-up #5 — `loom phase add` verb** (added mid-session by
  amendment; see § Revision log). Add a `loom phase add <slug>
  --number=<N> --name="<name>"` verb so projects can populate
  manifest phases via the CLI rather than hand-editing
  `manifest.toml`. Closes the long-standing gap documented in
  [[feedback_loom_phase_and_checkin_gaps]]: `loom plan`'s auto-adopt
  seeds a single placeholder phase, and without a `phase add` verb
  the operator hand-edits the manifest to declare real phases — the
  exact friction this project surfaced at its own `/ev-run`
  orientation.

### Out / deferred

- **Substrate install-time tooling** that would enable doc-dedup
  options (a) and (b) from RESEARCH.md § Follow-up #1 — bigger
  substrate-shape question outside this project's scope. The CI hash
  check is the lower-cost first step; deeper tooling can revisit
  later.
- **Generator class re-introduction**: Phase 7 U1 of the parent
  project dropped `generator-base` + `generator-css-codemod` entirely.
  Re-introducing the class is a future question.
- **`/loom-research` Agent registration**: the parent /loom-plan
  skill body's auto-spawn expects a `loom-research` Agent
  subagent_type that isn't registered, and the `/loom-research` Skill
  is `disable-model-invocation: true`. Both auto-paths are broken.
  Real substrate gap, but a substrate-shape question worth its own
  project — not bundled here. (This very project's RESEARCH.md was
  authored manually as a workaround.)
- **PR cadence question** for this project: resolved in § Decisions.

## Phases

### Phase 1 — `loom doctor` exit-code flip

**Goal**: Make `loom doctor` exit non-zero when `report.ok` is false,
so shell consumers can use `loom doctor <slug> || <fallback>` instead
of the current `grep -q '"ok":true'` workaround.

**Exit**:
- `plugins/loom/cli/verbs/loom/doctor.ts:105-106` returns
  `exitCode: report.ok ? 0 : 1`.
- `doctor.test.ts` adds at least two assertions: (1) healthy project
  → `exitCode === 0`; (2) `manifest-missing` or `manifest-unreadable`
  → `exitCode === 1`.
- The ev preflight tier-2 in all three ev SKILL.md files
  (`ev-run`, `ev-loop-interactive`, `ev-loop-confidence`) simplifies
  from `loom doctor <slug> 2>/dev/null | grep -q '"ok":true' || ...`
  to `loom doctor <slug> 2>/dev/null || ...`, with the explanatory
  paragraph about doctor's exit-0/ok:false quirk removed (it no
  longer applies).
- Full repo suite green.

**Depends on**: nothing.

### Phase 2 — CI hash check for the 3-copy docs

**Goal**: Turn the silent drift between
`plugins/{ev,guild,loom}/docs/SUBSTRATE-COMPOSITIONS.md` and
`LOOM-CONVENTIONS.md` into a loud test failure, with a sync script
the CI failure points to.

**Exit**:
- A new test file (`plugins/commons/cli/doc-copies-byte-identity.test.ts`
  or similar) hashes the 3 copies of each shared doc and fails if any
  diverge. On failure, the test message names the divergent files and
  prints the run-this-to-fix command pointing at the sync script.
- A sync script (`scripts/sync-shared-docs.sh` or similar) that
  copies the canonical version (loom's copy, by convention) to ev and
  guild. Idempotent.
- A one-line note in the loom plugin's CLAUDE.md (or
  `LOOM-CONVENTIONS.md` companion-docs intro) naming loom as the
  canonical-version source.
- Test passes against the current byte-identical state.
- A toy verification: temporarily diverge one copy, see the test
  fail with the expected message; restore. Recorded in the checkin
  notes_for_pr but not committed.

**Depends on**: nothing.

### Phase 3 — L332 responses path relocation

**Goal**: Remove the last pre-M1 vestige (`checkins/<branch>/responses/<id>.md`)
by relocating PR-comment responses to `responses/<branch>/<id>.md`.
The `checkins/` directory disappears entirely from active loom
projects.

**Exit**:
- `plugins/loom/cli/verbs/loom/pr.ts:364` updated:
  `responsesDir = join(projectPath, 'responses', parsed.branch)`.
- `pr.test.ts` (or a sibling test if `pr respond` doesn't yet have
  test coverage on the path) asserts the responses-dir is created at
  the new location.
- `plugins/loom/docs/LOOM-CONVENTIONS.md` § Project layout updated to
  drop the legacy `checkins/<branch>/responses/` entry from the file
  tree + remove the Pre-M1 footnote's mention of the residual. Apply
  the same change to ev's + guild's copies (or the Phase 2 sync
  script does this automatically — sequence-dependent).
- Full repo suite green.

**Depends on**: nothing (independent of Phase 2's sync mechanism; the
LOOM-CONVENTIONS.md updates can be hand-applied across the 3 copies
if Phase 2 ships after).

### Phase 4 — Live-spawn smoke checklist

**Goal**: Document the post-install verification protocol for the
renamed/generated guild agents in a form an operator can run once
after the guild plugin re-installs downstream.

**Exit**:
- `plugins/guild/docs/AGENT-CODEGEN.md` § Live-spawn smoke completed
  into a step-by-step checklist with concrete sample inputs (the
  "known-bad sample diff" gets a concrete content; the expected
  `VERDICT:` shape gets a concrete example).
- A named log location for the smoke result (e.g.
  `learnings/session-notes/<date>-guild-smoke-postcutover.md` as a
  one-time note) so the verification trail survives the session.
- One line in `plugins/guild/CLAUDE.md` (or guild's README) pointing
  operators at the smoke checklist after install.
- No code change. Prose-only.

**Depends on**: nothing.

### Phase 5 — `loom phase add` verb

**Goal**: Add a `loom phase add <slug> --number=<N> --name="<name>"`
verb so a project can populate manifest phases via the CLI rather
than hand-editing `manifest.toml`. Closes the substrate gap that
surfaced at this project's `/ev-run` orientation: `loom plan`'s
auto-adopt seeds a single placeholder phase, and without `phase
add` the operator has to manually add `[[phases]]` entries.

**Exit**:
- `plugins/loom/cli/verbs/loom/phase.ts` (or sibling) exports a new
  `phaseAdd(rest, ctx)` handler accepting positional `<slug>` plus
  `--number=<N>` + `--name=<name>` + optional `--status=<status>`
  (default `not-started`).
- The verb appends a `[[phases]]` entry to `manifest.toml` (atomic
  temp + rename); fails loud on duplicate `number` collision
  (`phase-already-exists`); fails loud on missing required args.
- `phase.test.ts` adds at least three assertions: (1) clean add of a
  new phase increments the phases array length and the entry round-
  trips through `readManifestFile`; (2) duplicate-number add fails
  with `phase-already-exists` (no manifest mutation); (3) missing
  args fail with `missing-args`.
- The verb is registered in the loom CLI's verb dispatcher
  (`phase.ts`'s `PHASE_VERBS` map) so `loom phase add ...` reaches
  it.
- A real-CLI smoke: `node plugins/loom/cli/loom.ts phase add
  <real-slug> --number=99 --name="smoke"` against a temp-fixture
  project succeeds and shows up in `loom project read`.
- Full repo suite green.

**Depends on**: nothing.

## Dependencies

None of the 5 phases depend on each other. They share no code seams
that conflict; they touch different files or different sections of
the same files (Phase 1 + Phase 3 both touch `plugins/loom/cli/verbs/loom/`
files but different ones; Phase 2 + Phase 3 both touch
`LOOM-CONVENTIONS.md` but different sections).

The only sequencing consideration: if Phase 2 (sync script) ships
before Phase 3 (LOOM-CONVENTIONS.md updates), Phase 3 can use the
sync script to apply its prose changes across the 3 copies in one
shot. If Phase 3 ships first, the prose changes are hand-applied
across the 3 copies (a small triplicated edit, manageable).

## Verification

- **Per-phase**: full repo `npx vitest run` green; per-phase
  antagonist panel approved (contract-fit baseline + whatever
  specialists `guild derive-panel` derives for the touched files).
- **Phase 1-specific**: a smoke test verifying `loom doctor` against
  a deliberately-broken project (e.g. delete manifest.toml then run
  doctor) returns exit 1.
- **Phase 2-specific**: the toy verification (temporarily diverge a
  doc, run the test, see it fail with the expected message, restore).
- **Phase 3-specific**: a smoke test verifying `loom pr respond`
  creates the responses dir at the new path (no `checkins/`
  directory created).
- **Phase 4-specific**: no code change; verification is the prose
  itself reading correctly to an operator who doesn't have parent-
  project context.
- **Phase 5-specific**: a real-CLI smoke (`node plugins/loom/cli/loom.ts
  phase add <fixture-slug> --number=99 --name="smoke"`) against a
  throwaway fixture project succeeds and the new phase appears in
  `loom project read`. Also: rerun this project's own `/ev-run` after
  Phase 5 lands and confirm a future amendment could use `loom phase
  add` instead of the manifest-edit workaround used here.

## Risks

- **Downstream consumer impact from Phase 1**: a consumer somewhere
  may rely on `loom doctor` always exiting 0. Mitigation: name the
  behavior change explicitly in the PR body; the only known consumer
  (the ev preflight) is updated in the same PR.
- **Phase 2's sync script triggering chain edits**: if a contributor
  edits a non-canonical copy and runs the script, their edit gets
  overwritten. Mitigation: the test failure message is clear about
  WHICH copy is canonical; the sync script is documented as
  "canonical → others, not bidirectional."
- **Phase 3's downstream consumer migration**: if a downstream
  project has on-disk responses at the legacy path, they won't
  auto-migrate. Mitigation: the parent project's Phase 7 U2 verified
  zero on-disk responses in this repo; if downstream projects have
  any, the PR body names the migration explicitly.
- **Phase 4 cleanly passes but misses a subtler dispatch failure**:
  the smoke is a proof-of-life, not a proof-of-correctness. Recorded
  in the checklist itself.

## Open questions

- **Phase 2 sync script language**: shell vs node? Recommendation:
  shell (zero dependencies, minimal surface). Decided at unit
  contract negotiation.
- **Phase 4 sample-diff content**: a real prior project's diff vs a
  synthetic one. Recommendation: synthetic (small, focused, no
  external dependency). Decided at unit contract.

## Decisions

- **Loop strategy**: `ev-loop-interactive`. Each phase has at least
  one judgment-shaped seam (per-follow-up option choice, decided
  during the parent project's archive grill); matches the parent
  project's loop.
- **PR cadence**: direct-to-main per phase. Each phase = one PR
  --base=main, merged, then next phase branches off updated main. No
  `.plan` integration branch; the project is small enough (4 PRs)
  that the integration step would add overhead without value. Settles
  the parent project's biggest operational drag upfront.
- **Phase ordering**: smallest-first to build confidence: Phase 1
  (`loom doctor` flip) → Phase 2 (doc hash check) → Phase 3
  (responses relocation) → Phase 4 (smoke checklist) → Phase 5
  (`loom phase add` verb, added mid-session). The operator may
  re-sequence at `/ev-run` time if a different phase becomes urgent.
- **Per-follow-up option**: each phase adopts the RESEARCH.md
  recommendation (1d / 2a / 3a / 4a). Overrides possible at unit
  contract negotiation but the research's case for each is the
  strawman.

## Revision log

- 2026-05-28 — Initial plan committed via `/loom-plan` after the
  substrate-followups research foundation was authored manually
  (the `/loom-research` auto-path was unreachable; logged as an
  out-of-scope substrate gap).
- 2026-05-28 — Phase 5 added mid-session by hand-amendment (NOT via
  `/loom-revise-plan`). Trigger: during this project's first
  `/ev-run` orientation, the missing `loom phase add` verb forced a
  hand-edit of `manifest.toml` to declare the 4 phases PLAN.md
  named. The friction surfaced the gap as worth fixing inside this
  project rather than deferred. Phase 5 = ship the verb. Amendment
  is informal (hand-edit + this revision-log entry) because the plan
  was minutes old; future amendments after real execution should go
  through `/loom-revise-plan`.
