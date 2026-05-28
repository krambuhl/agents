# loom-adr

Ship `loom adr` — a workspace-level Architectural Decision Records verb,
its surfacing skill, plus a first downstream consumer hook in
`ev-loop-interactive` — as a faithful port of the jelly-loom artifacts
at commit `d10133c` (PR #64, "[jelly loom] Phase 1.3 U6: jelly adr verb +
workspace adr-log") that were deleted in the substrate-consolidation
salt-earth phase (PR #98) without being harvested into canonical loom.
The provenance commit ships a working verb + 15-test suite; this project
ports it into loom's verb conventions, adds the surfacing skill, notes
the placement in `CONVENTIONS.md`, and wires `[adr-candidate]`-marked
checkin entries into the ev-loop-interactive close path so the loop can
offer to lift an architectural decision into an ADR at the moment it
surfaces. Three phases, direct-to-main per phase, matching the
substrate-followups cadence.

The provenance commit `d10133c` and its parent design conversation (the
strawman supplied at /loom-plan invocation) function as the research
foundation; no separate `RESEARCH.md` is authored. This matches the
substrate-followups precedent where the `/loom-research` auto-path was
unreachable and the dossier was hand-authored — here the research is
already locked in code (jelly's working implementation at d10133c) plus a
detailed design doc with decisions baked in, so the value-add of an
intermediate RESEARCH.md is approximately zero.

## Context

The linear-loom `RESEARCH.md` finding stands: in-repo ADRs are the only
ADRs an agent actually reads. The canonical loom substrate needs a
first-class verb for recording architectural decisions so agentic loops
can index them at planning time. Jelly built one (PR #64, `d10133c`); the
substrate-consolidation effort (PRs #68–#100) collapsed jelly into
canonical loom but the salt-earth phase (PR #98) deleted the adr verb
without harvesting it. This project closes that gap.

The verb's load-bearing invariant — `nextAdrNumber = max + 1`, NOT
`count + 1` — is the reason a careful port matters: cross-references
to "ADR-0007" in commit messages, PRs, and other ADRs must never
silently re-point to a different decision if one is deleted. The jelly
implementation pinned this with a gap test; the port keeps it.

The adr-log is the one bit of cross-project shared state in the
substrate (`projects/adr-log/`, workspace-level, NOT per-project) —
matching the jelly INTERVIEW Q8 resolution that survived dogfooding.

The Phase 3 ev-loop hook is the first real downstream consumer of the
verb: today, ev-loop-interactive captures load-bearing decisions in
the unit's `notes_for_pr` array (cf. `plugins/ev/skills/ev-loop-
interactive/SKILL.md` § Scope-shift detection + § Checkin close path),
but those notes only ever surface in the PR description. Lifting an
explicitly-marked decision into a durable, numbered ADR closes the
"decisions disappear into PR bodies and become unsearchable" loop —
the exact gap that motivated jelly's adr verb in the first place.

## Scope

### In

- **Phase 1 — `loom adr` verb + tests + `kebabCase` factor.** Port
  `plugins/jelly-loom/cli/verbs/adr.ts` (at `d10133c`) to
  `plugins/loom/cli/verbs/loom/adr.ts`, adapt the `JellyError → LoomError`
  + `CliContext` shapes, wire into the loom CLI's namespace registry +
  the verbless-namespaces set (since `loom adr` takes a positional title,
  not a sub-verb), factor `kebabCase` out of `createSlug` in
  `plugins/loom/cli/lib/project.ts` (rule of three: `createSlug` + the
  new verb share the slugification), port the 15-test suite to
  `plugins/loom/cli/verbs/loom/adr.test.ts`.

- **Phase 2 — `loom-adr` skill + CONVENTIONS.md note.** Add
  `plugins/loom/skills/loom-adr/SKILL.md` (triggering language: "record
  a decision", "add an ADR", "document this architectural choice"; tells
  the agent to call `loom adr "<title>" --body-file=...` when the
  decision context is already in conversation, and to write a new ADR
  with `--status=superseded` rather than editing an old one). Add a
  one-paragraph note in workspace-root `CONVENTIONS.md`: "ADRs live in
  `projects/adr-log/`; create via `loom adr`; numbers are permanent."
  Dogfood by writing `projects/adr-log/0001-introduce-loom-adr.md` as
  the verification artifact.

- **Phase 3 — `ev-loop-interactive` ADR-emit hook.** Wire the
  loom-adr verb into ev-loop-interactive's checkin close path so the
  loop offers to lift `[adr-candidate]`-marked `notes_for_pr` entries
  into a real ADR. Operator-marked, opt-in (no auto-detection in v1):
  the operator tags a `notes_for_pr` entry with the literal
  `[adr-candidate]` marker when writing the checkin; at unit close,
  the loop scans for the marker, surfaces the entry, and offers a
  single AskUserQuestion to write it as an ADR draft via
  `loom adr "<title>" --body-file=<tmp> --no-commit`. The resulting
  ADR file is added to the unit's git commit alongside the checkin;
  the operator can hand-edit the body before commit if needed. The
  hook is ev-loop-interactive only; ev-loop-confidence is out of
  scope (confidence loops are bulk-transform shaped and the
  "I'm making an architectural decision" surface rarely fits).

### Out / deferred

- **Per-project ADR scoping** (`--project=<slug>` writing to
  `projects/<slug>/adrs/NNNN-*.md`). v2 escape hatch if it comes up.
  Workspace log stays the default in v1.
- **Status enum enforcement.** Freeform in v1 (matches jelly); tighten
  later if drift bites.
- **Structured supersession metadata.** No machine-readable
  "supersedes ADR-0007" frontmatter in v1; convention is to write it in
  the body. Add only if a downstream consumer needs it.
- **Generated `projects/adr-log/README.md` index.** Jelly didn't ship
  one; `ls projects/adr-log/` is fine, and a generated index is more
  state-to-keep-in-sync. Revisit if the log exceeds ~30 entries.
- **MCP wrapper (`mcp__loom__adr`).** Loom doesn't currently wrap
  verbs as MCP tools; skip until/unless an MCP server lands as its own
  project. (Jelly had `mcp__jelly__adr` because jelly shipped an MCP
  server; loom hasn't.)
- **`griot init` (or `loom init`) `.gitkeep` for `projects/adr-log/`.**
  Optional per the design doc — `loom adr` already `mkdir -p`s. Defer
  unless a fresh-consumer-repo onboarding scenario surfaces the gap.
- **Concurrency lock on `nextAdrNumber`.** Two parallel `loom adr`
  invocations can race to claim the same number; acknowledged in
  jelly's PR and re-acknowledged here. Acceptable for operator-paired
  v1; `wx`-flag open or post-write `git status` check is a v2 add.
- **`loom adr supersede` sub-verb.** Status field exists, the
  convention is "new ADR with `--status=superseded` body-linking back."
  No machine-mediated supersession in v1.
- **Auto-detected ADR candidates in Phase 3.** v1 is operator-marked
  (`[adr-candidate]`) only. A future v2 could scan
  `notes_for_pr` entries for shape signals ("decision:", "we picked",
  "the tradeoff was"), but that's high-risk false-positive territory.
  Operator marks the intent; the loop doesn't guess.
- **`ev-loop-confidence` ADR hook.** Out of scope — confidence
  loops are bulk-transform shaped; architectural decisions surface
  rarely there. Revisit if a real use case lands.

## Phases

### Phase 1 — `loom adr` verb + tests + `kebabCase` factor

**Goal**: A working `loom adr "<title>" [--body-file=<path>]
[--status=<status>] [--no-commit]` at the loom CLI surface, with the
ported 15-test suite green and the `nextAdrNumber` max-not-count gap
invariant pinned. The verb shares its slugification with `createSlug`
via a factored `kebabCase` helper.

**Exit**:
- `plugins/loom/cli/verbs/loom/adr.ts` exports `adrVerb` +
  `nextAdrNumber` + `ADR_VERBS` (matching the jelly d10133c shape with
  loom-error / loom-CliContext adaptations). The verb composes
  `# NNNN. <title>` + `Date` + `Status` (default `accepted`) + body
  (`--body-file` substitution, else the Context/Decision/Consequences
  TODO stub). Output JSON: `{ path, number, slug }`.
- `plugins/loom/cli/lib/project.ts` exports `kebabCase(input: string):
  string` factored out of `createSlug`; `createSlug` calls it. Pure
  refactor — no behavior change to `createSlug` callers.
- `plugins/loom/cli/loom.ts` registers `adr` in `NAMESPACES`, wires
  `ADR_VERBS` into `VERBS_BY_NAMESPACE`, and adds `adr` to
  `VERBLESS_NAMESPACES` (since `loom adr "<title>"` has no sub-verb).
  Help text reflects the new namespace.
- `plugins/loom/cli/verbs/loom/adr.test.ts` ports jelly's 15-test suite
  retitled for loom: `nextAdrNumber` empty / populated / gap-test /
  non-matching-filenames-ignored; verb composes correct
  filename/heading/date/status/template; `--body-file` substitution;
  `--status` override; `--no-commit` skips git; default path commits
  with `[loom] adr NNNN: <title>` message; JSON contract; sequential
  calls produce `0001` then `0002`; missing-title error;
  unreadable-`--body-file` error; slug-too-short title rejected
  (matches `createSlug`'s 2-char floor — kept, not dropped).
- `plugins/loom/cli/loom.test.ts` wired-namespace tripwire updated to
  include `adr` (so the no-gaps guard covers it).
- `npm test` green across the full suite, expecting +15 tests.
- A real-CLI smoke: two sequential `node plugins/loom/cli/loom.ts adr
  "first" --no-commit` / `... adr "second" --no-commit` against a temp
  fixture produce `0001-first.md` + `0002-second.md` with correct
  numbering, heading, date, and default-accepted status. Run with
  `--no-commit` so the smoke doesn't litter the repo's actual
  `projects/adr-log/` with stub ADRs.

**Depends on**: nothing.

### Phase 2 — `loom-adr` skill + CONVENTIONS.md note + dogfood ADR

**Goal**: Make the verb discoverable to agentic flows. Ship the
`loom-adr` skill that triggers on decision-recording language, ship a
one-paragraph placement note in workspace-root `CONVENTIONS.md`, and
dogfood by writing the first real ADR (`0001-introduce-loom-adr.md`)
for this design itself.

**Exit**:
- `plugins/loom/skills/loom-adr/SKILL.md` created with frontmatter +
  body matching the loom-skill conventions (cf.
  `plugins/loom/skills/loom-plan/SKILL.md` as the shape reference).
  Triggering language: "record a decision", "add an ADR", "document
  this architectural choice", "capture a tradeoff decision". Body tells
  the agent: prefer `--body-file=<path>` over the TODO stub when the
  decision context is already in conversation; ADRs are append-only —
  to revise, write a new ADR with `--status=superseded` body-linking
  to the prior number, do not edit the old file.
- Workspace-root `CONVENTIONS.md` gains a brief "Architectural
  Decisions" section: one paragraph naming `projects/adr-log/` as the
  location, `loom adr` as the verb, and "numbers are permanent —
  deleted ADRs leave gaps, the next number always climbs" as the
  load-bearing invariant. The section lives near the existing
  project/loom-placement guidance.
- `projects/adr-log/0001-introduce-loom-adr.md` written via the new
  verb (real-CLI invocation against this repo, committing for real),
  body adapted from the design doc's `## Goal` + key decisions
  (workspace-level placement, freeform status, max-not-count
  numbering, defer-supersession-workflow). This is the dogfood: the
  verb's first user is its own design.
- `npm test` still green (no new tests in this phase; the SKILL.md +
  CONVENTIONS.md changes are prose; the dogfood ADR is content).
- Manual: spawn a fresh Claude Code session, ask it to "record a
  decision about X"; confirm the skill fires and the agent calls
  `loom adr`. (Operator-paired check at unit close.)

**Depends on**: Phase 1 landed and merged to main (the skill points at
behavior; the CONVENTIONS.md note names a verb; the dogfood ADR uses
the verb to write itself).

### Phase 3 — `ev-loop-interactive` ADR-emit hook

**Goal**: Lift `[adr-candidate]`-marked `notes_for_pr` entries into
real ADRs at unit close. Operator marks the intent in a checkin note;
the loop offers to lift it via `loom adr`. Closes the "decisions
disappear into PR bodies and become unsearchable" gap — the loop is
the first downstream consumer of the verb.

**Exit**:
- `plugins/ev/skills/ev-loop-interactive/SKILL.md` § Checkin close
  path gains an ADR-emit step (numbered to fit the existing sequence;
  likely between scope-shift detection and phase update). Behavior:
  scan the just-written checkin's `notes_for_pr` array for entries
  containing the literal `[adr-candidate]` marker (case-sensitive,
  bracketed-literal — picked for unambiguity against natural prose).
  For each match: surface the entry to the operator via a single
  AskUserQuestion offering (a) write ADR now, (b) skip this one. On
  accept: compose a candidate ADR body (Context: a paraphrase of the
  marked entry + the unit's contract one-liner; Decision: the
  decision the operator named in the entry; Consequences: TODO for
  the operator to fill before the loop commits), write to
  `/tmp/loom-adr-<slug>-<n>.md`, invoke `node plugins/loom/cli/loom.ts
  adr "<title>" --body-file=<tmp> --no-commit`, capture the returned
  ADR path, and add it to the unit's pending git-add list so the
  ADR commits with the checkin. The operator can hand-edit the body
  before the checkin's git commit step runs.
- New event in the ev-loop event vocabulary:
  `adr-emitted` with detail `{slug, phase, unit, adr_number,
  adr_path}` — fires after the `loom adr --no-commit` returns and
  the ADR is queued for commit. (Or `adr-emit-declined` if the
  operator picks (b); this captures the substrate signal that an
  ADR-candidate was surfaced but declined, useful for forensics on
  marker-usage patterns.)
- One real fixture-driven test for the hook in
  `plugins/ev/skills/ev-loop-interactive/` (or wherever the SKILL.md's
  behavioral tests live — verify at unit contract negotiation; if no
  test surface exists for SKILL.md prose, the test lives as a smoke
  script that exercises a synthetic checkin with an `[adr-candidate]`
  entry and asserts the loop's emitted offer + the resulting ADR
  file).
- `plugins/loom/skills/loom-adr/SKILL.md` (from Phase 2) gains a
  short "When this skill is invoked from within ev-loop-interactive"
  section pointing the agent at the `--body-file` + `--no-commit`
  pattern the loop uses, so the skill's behavior matches the loop's
  expectation.
- `plugins/ev/docs/SUBSTRATE-COMPOSITIONS.md` (if it exists in the
  ev plugin; otherwise the canonical loom copy) gains a one-paragraph
  description of the ADR-emit composition, naming the marker
  convention, the operator-opt-in posture, and the `--no-commit`
  rationale.
- `npm test` green across the full suite. No regression in existing
  ev-loop-interactive tests.
- Manual: run `/ev-loop-interactive 2026-05-28-loom-adr 3` against
  this very project's Phase 3, with a synthetic `[adr-candidate]`
  marker added to the unit's `notes_for_pr` mid-execution; confirm
  the hook fires at unit close, the ADR is written, and the
  committed checkin includes both the checkin JSON and the ADR file.
  (Meta-dogfood: Phase 3 uses Phase 3's own hook to emit an ADR
  about Phase 3.)

**Depends on**: Phase 1 landed (the verb must exist for the hook to
call it). Phase 2 strongly recommended but not strictly required:
the hook calls the CLI directly, not via the `loom-adr` skill — but
the skill's body should reference the loop's calling pattern for
consistency, so Phase 3 reads more cleanly after Phase 2 ships.

## Dependencies

Phase 2 depends on Phase 1 (the skill + the convention note both
reference the verb's existence, and the dogfood ADR is written by the
verb). Phase 3 depends on Phase 1 (the hook calls the verb's CLI
directly); Phase 3 is strongly-but-not-strictly ordered after Phase 2
(Phase 2's SKILL.md will be updated by Phase 3 to mention the loop's
calling pattern, so shipping Phase 2 first means one fewer
back-edit). Phase 1 has no external dependencies — the jelly source
at `d10133c` is in this repo's git history, accessible via
`git show`.

## Verification

- **Per-phase**: full repo `npx vitest run` green; per-phase antagonist
  panel approved (contract-fit baseline + whatever specialists `guild
  derive-panel` derives for the touched files — almost certainly
  test-unit + naming for Phase 1, contract-fit alone for Phase 2's
  prose, contract-fit + test-unit for Phase 3's hook).
- **Phase 1-specific**: the 15-test ported suite passes (+15 vs the
  current count); the gap test specifically asserts `nextAdrNumber`
  against a directory with `0001` + `0003` present returns `4`; the
  real-CLI smoke (`--no-commit`) produces correctly-numbered files
  with correct headings.
- **Phase 2-specific**: the dogfood ADR (`0001-introduce-loom-adr.md`)
  written by the new verb against the real workspace `projects/adr-log/`
  is present, correctly numbered, correctly committed (`[loom] adr 0001:
  introduce loom adr` message), and reads cleanly to a fresh reader. A
  spawned-session sanity check confirms the skill triggers on
  decision-recording language.
- **Phase 3-specific**: the meta-dogfood (Phase 3 emits an ADR about
  Phase 3's own marker convention during its own execution); the
  `adr-emitted` event appears in the project's `events.jsonl`; the
  resulting ADR file appears in `projects/adr-log/` with the next
  available number and is committed in the same git commit as the
  Phase 3 unit's checkin.

## Risks

- **Salt-earth recurrence**: a future substrate consolidation could
  again delete this verb without harvesting. Mitigation: the dogfood
  ADR-0001 + the CONVENTIONS.md note + the ev-loop hook (Phase 3) all
  make the verb's existence load-bearing in the workspace's own
  conventions and the substrate's primary execution loop; deleting
  the verb would break the loop. Strong insurance.
- **`kebabCase` factor changes `createSlug` semantics by accident**:
  the factor is mechanical (extract the three `.replace`/`.toLowerCase`
  calls into a named helper) but a subtle behavior change would ripple
  to `loom plan` / `loom research` topic slugification. Mitigation:
  the existing `createSlug` tests stay green; if any change, the
  factor isn't pure and needs to be undone. Add a test asserting
  `kebabCase` behavior matches the `createSlug` inline pattern
  byte-for-byte.
- **Concurrency on `nextAdrNumber` under operator-paired use**: two
  parallel invocations could collide. Mitigation: documented as a
  known v1 limitation (per design doc § Concurrency caveat); v2
  follow-up can add a `wx`-flag open. Operator-paired v1 use makes
  the race rare in practice. Phase 3's hook calls the verb with
  `--no-commit`, so a race on the file write would be detected at
  the operator's subsequent git-add (the file already exists).
- **Skill triggering false positives**: "record a decision" is broad
  language; the skill might fire on unrelated decisions (e.g. naming
  a variable). Mitigation: the SKILL.md body frames the trigger as
  *architectural* decisions specifically — visible to other engineers
  / agents, not local-to-a-PR. The trigger language is tightened in
  the SKILL.md body.
- **`[adr-candidate]` marker false positives** (Phase 3): an
  operator might write the marker in a checkin note casually
  ("considered this an [adr-candidate] but decided no") and trigger
  the hook unintentionally. Mitigation: the marker is bracketed,
  case-sensitive, and on its own — the operator can decline at the
  AskUserQuestion offer. The marker convention is documented in both
  ev-loop-interactive's SKILL.md and the loom-adr SKILL.md so it's
  discoverable. Accept the false-positive risk in exchange for
  operator-driven simplicity (vs an auto-detector).
- **ev-loop / loom plugin coupling** (Phase 3): the ev-loop hook
  shells to `node plugins/loom/cli/loom.ts adr ...` directly, which
  is a real cross-plugin dependency at runtime. Mitigation: the
  shell-out pattern matches the existing ev-loop calls to other loom
  verbs (`loom checkin write`, etc.); the hook fails gracefully if
  the verb isn't installed (try/catch with a one-line "loom adr not
  available, skipping" log). The two plugins are already coupled
  via the wider substrate; this hook doesn't add a new coupling
  shape, just a new call.

## Open questions

- **Slug-too-short title guard**: jelly's `adr.ts` has a 2-char
  minimum (mirroring `createSlug`'s floor). Keep or drop?
  Recommendation: **keep** — matches `createSlug`'s invariant via the
  shared `kebabCase` helper, and a 1-char ADR slug is almost
  certainly a typo. Decided at unit contract.
- **Real-CLI smoke commit policy**: Phase 1's smoke runs against a
  temp fixture. Should the unit contract also run the smoke against
  the real workspace `projects/adr-log/`, or only the temp fixture?
  Recommendation: **temp fixture only for Phase 1's smoke** (no real
  ADRs land yet); the real-workspace use happens in Phase 2's dogfood
  step where `0001-introduce-loom-adr.md` is the intentional first
  artifact. Decided at unit contract.
- **CONVENTIONS.md section heading wording**: "Architectural
  Decisions" vs "ADRs" vs "Decision records". Recommendation:
  **"Architectural Decisions"** (full term in the heading, "ADR" as
  the abbreviated form in the body and verb help text). Decided at
  unit contract.
- **Phase 3 marker exact form**: `[adr-candidate]` vs `[adr]` vs a
  YAML-frontmatter-style key in the notes_for_pr entry.
  Recommendation: **`[adr-candidate]`** as a literal substring of
  the note text — visually distinctive, no parsing required, low
  collision risk with natural prose. Decided at unit contract.
- **Phase 3 ADR title source**: derive from the first sentence of the
  marked entry, or prompt the operator at the offer?
  Recommendation: **prompt the operator** at the AskUserQuestion
  offer (one extra field on the form); auto-derivation produces ugly
  titles. Decided at unit contract.
- **Phase 3 `adr-emit-declined` event**: ship the
  declined-but-detected event, or only emit on accept?
  Recommendation: **ship both** — the declined event is substrate
  signal worth capturing (marker-usage patterns, false-positive
  rate). Decided at unit contract.

## Decisions

- **Loop strategy**: `ev-loop-interactive`. All three phases have
  judgment-shaped seams (the `kebabCase` factor's purity check; the
  skill's triggering language; the dogfood ADR's body composition;
  the Phase 3 hook's marker form + offer shape). Matches the
  substrate-followups loop choice.
- **PR cadence**: direct-to-main per phase. Each phase = one PR
  `--base=main`, merged, then next phase branches off updated main.
  No `.plan` integration branch. Matches the substrate-followups
  cadence and the parent project's resolved drag.
- **Phase ordering**: Phase 1 (verb) → Phase 2 (skill + conventions +
  dogfood) → Phase 3 (ev-loop hook). Phase 2 and Phase 3 both
  reference Phase 1's behavior; Phase 3 references Phase 2's SKILL.md.
  Reversing the order would create documentation-pointing-at-vapor
  moments. The operator may not re-sequence — the dependencies are
  real, not preferences.
- **Research foundation**: the supplied design doc + the jelly
  `d10133c` commit body together act as the research input. No
  separate `RESEARCH.md` is authored. The `## Context` section above
  cites `d10133c` as the implementation source-of-truth; deviations
  from jelly's shape are called out in Phase 1's exit criteria
  (the `JellyError → LoomError` swap, the `CliContext` adaptation,
  the verbless-namespace wiring).
- **Per-follow-up option for each design-doc open question**: each
  Phase 1 / 2 exit criterion adopts the design doc's recommendation
  for that question (workspace-level placement, freeform status,
  no machine-readable supersession, no generated README index, skip
  MCP wrapper, skip `griot init` `.gitkeep`). Overrides possible at
  unit contract negotiation but the design doc's case for each is the
  strawman.
- **Phase 3 marker posture: operator-marked, opt-in**: v1 does NOT
  auto-detect ADR candidates from notes_for_pr text shape signals
  ("decision:", "we picked", "the tradeoff"). The operator owns
  architectural-decision intent by adding `[adr-candidate]` to a
  note. Auto-detection is high-risk false-positive territory and
  belongs in a future v2 if a real signal-quality story emerges.
- **Phase 3 scope: ev-loop-interactive only**: ev-loop-confidence
  is out of scope. Confidence loops are bulk-transform shaped;
  architectural decisions surface rarely there. Revisit if a real
  use case lands.
- **Provenance attribution in Phase 1 commit body**: the Phase 1
  commit message names `d10133c` as the source SHA and the
  `JellyError → LoomError` + `CliContext` shape adjustments as the
  only deltas from a verbatim port. This keeps the harvest trail
  searchable (`git log --grep=d10133c`) and answers "what changed
  from jelly's working implementation" in one line.

## Revision log

- 2026-05-28 — Add Phase 3 — ev-loop-interactive ADR-emit hook lifting [adr-candidate]-marked notes_for_pr entries into real ADRs at unit close, with operator-marked opt-in posture (no auto-detection) and ev-loop-confidence explicitly out of scope
