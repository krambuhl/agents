# loom-adr

Ship `loom adr` — a workspace-level Architectural Decision Records verb,
plus its surfacing skill — as a faithful port of the jelly-loom artifacts
at commit `d10133c` (PR #64, "[jelly loom] Phase 1.3 U6: jelly adr verb +
workspace adr-log") that were deleted in the substrate-consolidation
salt-earth phase (PR #98) without being harvested into canonical loom.
The provenance commit ships a working verb + 15-test suite; this project
ports it into loom's verb conventions, adds the surfacing skill, and
notes the placement in `CONVENTIONS.md`. Two phases, direct-to-main per
phase, matching the substrate-followups cadence.

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

## Dependencies

Phase 2 depends on Phase 1 (the skill + the convention note both
reference the verb's existence, and the dogfood ADR is written by the
verb). Phase 1 has no external dependencies — the jelly source at
`d10133c` is in this repo's git history, accessible via `git show`.

## Verification

- **Per-phase**: full repo `npx vitest run` green; per-phase antagonist
  panel approved (contract-fit baseline + whatever specialists `guild
  derive-panel` derives for the touched files — almost certainly
  test-unit + naming for Phase 1, contract-fit alone for Phase 2's
  prose).
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

## Risks

- **Salt-earth recurrence**: a future substrate consolidation could
  again delete this verb without harvesting. Mitigation: the dogfood
  ADR-0001 + the CONVENTIONS.md note make the verb's existence
  load-bearing in the workspace's own conventions; deleting it would
  trip both the workspace-conventions consistency check and the
  doc-copies hash check (if that lands from substrate-followups Phase
  2). Cheap insurance.
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
  the race rare in practice.
- **Skill triggering false positives**: "record a decision" is broad
  language; the skill might fire on unrelated decisions (e.g. naming
  a variable). Mitigation: the SKILL.md body frames the trigger as
  *architectural* decisions specifically — visible to other engineers
  / agents, not local-to-a-PR. The trigger language is tightened in
  the SKILL.md body.

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

## Decisions

- **Loop strategy**: `ev-loop-interactive`. Both phases have
  judgment-shaped seams (the `kebabCase` factor's purity check; the
  skill's triggering language; the dogfood ADR's body composition).
  Matches the substrate-followups loop choice.
- **PR cadence**: direct-to-main per phase. Each phase = one PR
  `--base=main`, merged, then next phase branches off updated main.
  No `.plan` integration branch. Matches the substrate-followups
  cadence and the parent project's resolved drag.
- **Phase ordering**: Phase 1 (verb) → Phase 2 (skill + conventions +
  dogfood). Phase 2 references Phase 1's behavior; reversing the
  order would create a documentation-pointing-at-vapor moment. The
  operator may not re-sequence — the dependency is real, not
  preference.
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
- **Provenance attribution in Phase 1 commit body**: the Phase 1
  commit message names `d10133c` as the source SHA and the
  `JellyError → LoomError` + `CliContext` shape adjustments as the
  only deltas from a verbatim port. This keeps the harvest trail
  searchable (`git log --grep=d10133c`) and answers "what changed
  from jelly's working implementation" in one line.
