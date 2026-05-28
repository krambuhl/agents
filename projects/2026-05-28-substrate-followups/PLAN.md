# Substrate-followups

Ship the unresolved tactical follow-ups carried over from the
just-archived substrate-consolidation project, plus papercuts
surfaced during this project's own execution. Originally 4 follow-ups
(then 5 with the mid-session `loom phase add` addition); expanded to
8 phases after phase-1 close revealed three new substrate gaps: `loom
phase update` silently dropping `--pr/--url/--pr-state`, `griot
capture` lacking a pathway for out-of-band findings, and
`plan.real.test.ts` breaking when a referenced project gets archived.
Each phase is independently shippable; the project ships one PR at a
time directly to `main` (see § Decisions § PR cadence).

See [RESEARCH.md](./RESEARCH.md) for the per-follow-up dossier
covering current state, the gap, candidate approaches, and the
recommendation each of phases 1-5 below adopts. Phases 6-8 were added
post-research; their grounding is the memory-file write-ups cited in
each phase.

## Context

The parent project (substrate-consolidation, PRs #68–#99) collapsed 6
fork plugin families into the canonical loom/guild/ev plugins via a
harvest-first / delete-last sequence across 7 phases. The parent's
retro recorded 5 follow-ups; this project executes 4 of them. The
5th (PR cadence) is resolved by in-flight PR #100 landing the parent
project's `.plan → main`.

Phases 6-8 are not parent-project carry-overs — they're substrate
gaps surfaced during this project's own first-phase close, when out-
of-band PR #103 reconciliation exposed three latent CLI papercuts
(see § Revision log). Folding them in here rather than spawning a new
project is the cheaper move: the gaps are small, fix-shaped, and
already sibling to the existing follow-ups in surface area.

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
- **Follow-up #6 — `loom phase update` PR-fields persistence** (added
  post-phase-1 by `/loom-revise-plan`; see § Revision log). Make
  `loom phase update --pr=N --url=U --pr-state=S` actually persist
  the PR subfield on the phase entry AND emit the matching
  `pr-opened`/`pr-merged`/`pr-closed` events. Closes the gap
  documented in [[feedback_loom_phase_update_drops_pr_fields]],
  surfaced during this project's phase-1 close when an out-of-band
  PR merge had to be reconciled by hand.
- **Follow-up #7 — `griot capture` out-of-band pathway** (added
  post-phase-1 by `/loom-revise-plan`). Extend `griot capture` so
  substrate-gap observations that surface outside an active
  checkin's `corrections[]` array have a home — neither the
  `--from-checkin` pathway nor the `--evaluator-finding` pathway
  accepts them today. Closes the gap documented in
  [[feedback_griot_capture_no_pathway_for_one_off]].
- **Follow-up #8 — `plan.real.test.ts` archived-project resilience**
  (added post-phase-1 by `/loom-revise-plan`). Stop hardcoding a
  live-project path in `plugins/loom/cli/lib/plan.real.test.ts` so
  the test stops breaking when a referenced project gets archived.
  `npm run test` is currently red on `origin/main` for exactly this
  reason — PR #101's archive of `2026-05-26-substrate-consolidation`
  invalidated the hardcoded path; see
  [[feedback_plan_real_test_breaks_on_project_archive]].

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
projects (checkin records live in `manifest.toml`'s `[[checkins]]`
section under the folded schema).

**Exit**:
- `plugins/loom/cli/verbs/loom/pr.ts`'s `respond` handler writes to
  `responses/<branch>/<id>.md` (new path), not
  `checkins/<branch>/responses/<id>.md` (legacy path).
- `LOOM-CONVENTIONS.md` § Project layout updated to drop the
  `checkins/` directory reference; the `responses/` layout is
  documented at the same place.
- `pr.test.ts` adds an assertion that `respond` creates the new path
  on a fresh project (no `checkins/` directory side-effect).
- A real-CLI smoke against a fixture project confirms the new path.
- Full repo suite green.

**Depends on**: nothing.

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

### Phase 6 — `loom phase update` PR-fields persistence

**Goal**: Make `loom phase update --pr=N --url=U --pr-state=S`
actually persist the PR subfield on the phase entry AND emit the
matching `pr-opened`/`pr-merged`/`pr-closed` events. Closes the gap
that surfaced during this project's phase-1 close: `loom phase
update 2026-05-28-substrate-followups 1 --status=completed --pr=103
--url=... --pr-state=merged` returned success and updated phase
status, but the manifest's phase entry persisted only
`number/name/status/branch` (no `pr` subfield landed, no
`pr-opened` or `pr-merged` events were emitted on `events.jsonl`).
Sibling of [[feedback_loom_pr_opened_orphan_and_guild_spec_path]].

**Exit**:
- `plugins/loom/cli/verbs/loom/phase.ts` `phaseUpdate` extends the
  phase entry shape with a `pr = { number, url, state }` subfield
  when `--pr` is supplied alongside `--url` + `--pr-state`. Missing
  any of the three with the others present is `missing-args`.
- When `--pr-state` is supplied and the phase's recorded
  `pr.state` value differs (or no `pr` subfield exists yet), the
  verb emits the matching event: `pr-opened` for `state=open`,
  `pr-merged` for `state=merged`, `pr-closed` for `state=closed`.
  The event detail carries `{phase, number, url}`.
- Idempotency: re-running with the same `--pr-state` as the
  recorded state is a no-op (no duplicate event, no manifest
  mutation).
- `phase.test.ts` adds at least three assertions: (1) first call
  with `--pr=N --url=U --pr-state=open` writes the phase's `pr`
  subfield AND emits a `pr-opened` event with matching detail;
  (2) re-running with identical args produces no new event;
  (3) transitioning open → merged emits exactly one `pr-merged`
  event and updates the subfield to `state=merged`.
- Real-CLI smoke against a temp-fixture project: open → merged →
  closed transitions, confirm the manifest's `pr` subfield matches
  the final state and `events.jsonl` carries one event per
  transition.
- Full repo suite green.

**Depends on**: nothing.

### Phase 7 — `griot capture` out-of-band pathway

**Goal**: Extend `griot capture` so substrate-gap observations
surfaced outside an active checkin's `corrections[]` array have a
home. Today both supported pathways refuse such captures:
`--from-checkin=<path>` requires existing `correction:` lines in
the checkin (the `--correction-text` flag is additive only, not
seed-capable), and `--evaluator-finding=<classification>` only
fully supports `recurring` (which needs `--frequency-count`); the
classifications that would fit (`catalog-gap`,
`generator-antipattern`, `evaluator-conflict`,
`sanctioned-exception`) all return `not-yet-supported`. Closes
[[feedback_griot_capture_no_pathway_for_one_off]].

**Exit** (option-shaped, decision deferred to unit contract):
- **Option 7a (recommended)**: implement the `catalog-gap`
  classification in `--evaluator-finding=catalog-gap`. Requires
  `--evidence` + `--evaluator-name`; does NOT require
  `--frequency-count` (catalog-gap is one-off by definition).
- **Option 7b (alternative)**: extend `--from-checkin` so
  `--correction-text=<text>` seeds a capture even when the
  checkin's `corrections[]` array is empty (treat the flag as
  primary input, not additive). Lower scope; preserves the
  evaluator-finding pathway's `not-yet-supported` shape unchanged.
- Either way: the capture writes to
  `learnings/session-notes/<folder>/` per the existing partition.
- `capture.test.ts` adds at least two assertions: clean capture
  via the new pathway lands a session-note at the expected partition;
  capture with missing required fields fails loud.
- Real-CLI smoke: capture this project's three outstanding
  papercut memories (Phase 6 / Phase 7 / Phase 8 source memories)
  through the new pathway and confirm the session-notes land.
- Full repo suite green.

**Depends on**: nothing.

### Phase 8 — `plan.real.test.ts` archived-project resilience

**Goal**: Stop hardcoding a live-project path in
`plugins/loom/cli/lib/plan.real.test.ts` so the test stops breaking
when a referenced project gets archived. Today the test references
`projects/2026-05-26-substrate-consolidation/PLAN.md`; PR #101 moved
that project to `archive/`, and the test has been red on
`origin/main` ever since. Closes
[[feedback_plan_real_test_breaks_on_project_archive]].

**Exit** (option-shaped, decision deferred to unit contract):
- **Option 8a (recommended)**: rewrite `plan.real.test.ts` to
  fixture a project under a temp dir rather than reading a live
  project's PLAN.md. Cuts the archive-time coupling entirely;
  matches the pattern other real-FS tests in this repo use.
- **Option 8b (alternative)**: retain the live-project read but
  have `loom project archive` grep for the archived slug across
  `**/*.test.ts` and refuse (or warn loudly) when matches exist.
  Higher blast radius (archive verb gains responsibility) but
  preserves the test's "real artifact" semantics.
- Full repo `npx vitest run` green AGAINST `origin/main` after this
  phase lands (this test currently fails on main; the phase fixes
  the failure as a side effect of either option).
- The fix is verifiable via clean-stash reproduction: stash all
  local changes, run the test on `origin/main` HEAD, see green.

**Depends on**: nothing — but candidate for pull-forward in the
ordering since this is the only phase that unblocks a green-suite
gate on `origin/main`.

## Dependencies

None of the 8 phases depend on each other. They share no code seams
that conflict; they touch different files or different sections of
the same files (Phase 1 + Phase 3 + Phase 5 + Phase 6 all touch
`plugins/loom/cli/verbs/loom/` files but different ones; Phase 2 +
Phase 3 both touch `LOOM-CONVENTIONS.md` but different sections;
Phase 7 + Phase 8 are isolated to their respective subsystems).

Sequencing considerations:
- If Phase 2 (sync script) ships before Phase 3 (LOOM-CONVENTIONS.md
  updates), Phase 3 can use the sync script to apply its prose
  changes across the 3 copies in one shot. If Phase 3 ships first,
  the prose changes are hand-applied across the 3 copies (a small
  triplicated edit, manageable).
- Phase 8 is the only phase that fixes a currently-red suite on
  `origin/main`; until it lands, every other phase's "full repo suite
  green" exit criterion has to be read as "green-modulo-this-known-
  failure." Pulling Phase 8 forward avoids the cognitive overhead in
  later phases' verification.
- Phases 6 and 7 are loose siblings: both surfaced from phase-1
  close, both extend a verb's accepted-input contract. They don't
  depend on each other, but landing them in nearby PRs reads more
  coherently than splitting them across the original-4 phases.

## Verification

- **Per-phase**: full repo `npx vitest run` green; per-phase
  antagonist panel approved (contract-fit baseline + whatever
  specialists `guild derive-panel` derives for the touched files).
  Note: until Phase 8 lands, "full repo green" reads as
  "green-modulo-the-known plan.real.test.ts failure on origin/main."
- **Phase 1-specific**: a smoke test verifying `loom doctor` against
  a deliberately-broken project (e.g. delete manifest.toml then run
  doctor) returns exit 1. (Landed; verified in PR #103.)
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
- **Phase 6-specific**: a real-CLI smoke against a temp-fixture
  project — open → merged → closed transitions, confirm the
  manifest's `pr` subfield matches the final state and
  `events.jsonl` carries one event per transition (and no duplicate
  events on idempotent re-invocation).
- **Phase 7-specific**: a real-CLI smoke capturing this project's
  outstanding papercut memories via the new pathway, confirming the
  session-notes land under `learnings/session-notes/<folder>/` with
  the expected partition shape.
- **Phase 8-specific**: confirm `npm run test` exits green on
  `origin/main` (currently red) after this phase merges. Verifiable
  via clean-stash reproduction.

## Risks

- **Downstream consumer impact from Phase 1**: a consumer somewhere
  may rely on `loom doctor` always exiting 0. Mitigation: name the
  behavior change explicitly in the PR body; the only known consumer
  (the ev preflight) is updated in the same PR. (Landed in PR #103
  without observed regression.)
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
- **Phase 6's manifest-schema extension**: adding a `pr` subfield to
  phase entries is a TOML shape change. Mitigation: TOML readers
  tolerate unknown fields by default; the substrate's own
  `readManifest` validates only the fields it knows about, so older
  manifests without the subfield round-trip cleanly. The new field
  is optional on read, required only when the verb is asked to
  write it.
- **Phase 7's option-shaped exit**: choosing 7a (catalog-gap
  classification) vs 7b (--correction-text seed) changes the
  substrate's capture surface in materially different ways.
  Mitigation: decision happens at unit contract, recorded in the
  checkin; either is reversible (the unchosen option stays
  available as a future addition).
- **Phase 8 option 8b's false-positive risk**: a `grep` for the
  archived slug across `**/*.test.ts` could match slug-coincidence
  strings (e.g. dates that happen to match). Mitigation: pick
  option 8a (temp-dir fixture); 8b is documented as a fallback only.

## Open questions

- **Phase 2 sync script language**: shell vs node? Recommendation:
  shell (zero dependencies, minimal surface). Decided at unit
  contract negotiation.
- **Phase 4 sample-diff content**: a real prior project's diff vs a
  synthetic one. Recommendation: synthetic (small, focused, no
  external dependency). Decided at unit contract.
- **Phase 7 option choice (7a catalog-gap vs 7b text-seed)**:
  recommendation 7a — `catalog-gap` is the most useful semantic
  classification for substrate-gap observations, and the
  classification is already named as `not-yet-supported` in the
  verb's help (lowest-friction implementation path). Decided at
  unit contract negotiation.
- **Phase 8 option choice (8a temp-dir vs 8b archive-verb-grep)**:
  recommendation 8a — smaller blast radius, no archive-time
  coupling, matches the pattern other real-FS tests use. Decided at
  unit contract negotiation.

## Decisions

- **Loop strategy**: `ev-loop-interactive`. Each phase has at least
  one judgment-shaped seam (per-follow-up option choice, decided
  during the parent project's archive grill); matches the parent
  project's loop.
- **PR cadence**: direct-to-main per phase. Each phase = one PR
  --base=main, merged, then next phase branches off updated main. No
  `.plan` integration branch; the project is small enough (8 PRs)
  that the integration step would add overhead without value. Settles
  the parent project's biggest operational drag upfront.
- **Phase ordering**: smallest-first to build confidence: Phase 1
  (`loom doctor` flip) → Phase 2 (doc hash check) → Phase 3
  (responses relocation) → Phase 4 (smoke checklist) → Phase 5
  (`loom phase add` verb, added mid-session) → Phase 6 (`loom phase
  update` PR-fields persistence) → Phase 7 (`griot capture` out-of-
  band pathway) → Phase 8 (`plan.real.test.ts` resilience). Phases
  6-8 are appended in observation order (the order they were
  surfaced during phase-1 close). The operator may re-sequence at
  `/ev-run` time; in particular, Phase 8 is a strong candidate for
  pull-forward since it unblocks the green-suite gate on
  `origin/main`.
- **Per-follow-up option (phases 1-4)**: each phase adopts the
  RESEARCH.md recommendation (1d / 2a / 3a / 4a). Overrides
  possible at unit contract negotiation but the research's case for
  each is the strawman.
- **Per-follow-up option (phases 7-8)**: option-shaped exit
  criteria documented in each phase. Recommendations (7a, 8a) are
  the strawman; decision deferred to unit contract.

## Revision log


- 2026-05-28 — Append phases 6-8 for three substrate papercuts surfaced during phase-1 close: loom phase update silently dropping --pr/--url/--pr-state, griot capture lacking an out-of-band-finding pathway, and plan.real.test.ts breaking when a referenced project gets archived.

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
- 2026-05-28 — Phases 6-8 appended via `/loom-revise-plan` after
  phase 1's close (PR #103) surfaced three new substrate papercuts
  mid-session: (a) `loom phase update` silently dropped
  `--pr/--url/--pr-state` when reconciling the out-of-band PR
  merge, leaving the manifest's phase entry without a `pr` subfield
  and no `pr-*` events on the trail
  ([[feedback_loom_phase_update_drops_pr_fields]]); (b) `griot
  capture` refused both observations because neither pathway
  accepts out-of-band findings (from-checkin requires existing
  correction lines; evaluator-finding only fully supports recurring
  with frequency-count)
  ([[feedback_griot_capture_no_pathway_for_one_off]]); (c)
  `plan.real.test.ts` was discovered red on `origin/main` because
  PR #101 archived `2026-05-26-substrate-consolidation` without
  updating the test's hardcoded path
  ([[feedback_plan_real_test_breaks_on_project_archive]]). All
  three are fix-shaped, share no dependencies, ordered after the
  existing phases per the smallest-first § Decisions principle.
  Phase 8 is flagged as a pull-forward candidate.
