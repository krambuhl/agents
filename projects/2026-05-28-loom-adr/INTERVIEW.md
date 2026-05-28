# Interview — loom-adr

Walked decision tree from the `/loom-plan` interview. The user supplied
a detailed design document at invocation time, which pre-resolved many
of the substrate-decision categories. The interview here is short
because the strawman was thorough; questions remaining are about
project shape (slug, phases, cadence) rather than the verb's behavior.

## Q1 — Research foundation: spawn `/loom-research` or treat the design doc as research?

**Recommendation**: skip `/loom-research`; treat the supplied design
doc + the `d10133c` jelly commit as the research foundation.

**Answer**: skip. The design doc is comprehensive, locked, and
references existing research (the linear-loom `RESEARCH.md` finding
about agent-readable in-repo ADRs). The provenance commit `d10133c`
ships a working implementation. Auto-spawning `/loom-research` for
"loom adr" would produce a thinner dossier than the input we already
have. Matches the substrate-followups precedent where the
`/loom-research` auto-path was unreachable and the dossier was
hand-authored.

**Rationale**: the value-add of an intermediate `RESEARCH.md` is
approximately zero when (a) the implementation source-of-truth is
already in git history at a named SHA, and (b) the design doc carries
explicit decisions with their rationale. Citing `d10133c` + the design
conversation in `PLAN.md`'s `## Context` is sufficient provenance.

## Q2 — Slug

**Recommendation**: `2026-05-28-loom-adr` (today's date, kebab-cased
topic).

**Answer**: `2026-05-28-loom-adr`. Matches `SLUG_RE` and the
established date-prefix convention.

## Q3 — Phase count: single PR or multi-phase?

**Recommendation**: two phases (Phase 1 verb + tests, Phase 2 skill +
conventions + dogfood). Not one PR: bundling the verb implementation
with the skill SKILL.md + the CONVENTIONS.md prose mixes
heavy-review (verb correctness, the max-not-count invariant, the
`kebabCase` factor) with light-review (prose triggering language,
dogfood content). Conceptual unity says split.

**Answer**: two phases. The split respects the user's CLAUDE.md rule:
"Each PR should do one thing. Not one file, not one feature — one unit
of conceptual change... If a reviewer has to mentally untangle two
different intentions in the same diff, the PR should be split."

**Rationale**:
- Phase 1's review focus: the load-bearing `nextAdrNumber` max-not-
  count invariant; the `kebabCase` factor's purity; the verb
  composing the file template correctly; the 15-test suite's
  coverage.
- Phase 2's review focus: the skill's trigger language is
  appropriately tight (architectural decisions, not any decision);
  the CONVENTIONS.md prose places the verb correctly in the
  workspace's own conventions; the dogfood ADR reads cleanly to a
  fresh reader.

Different mental models. Split.

## Q4 — Loop strategy: `ev-loop-interactive` vs `ev-loop-confidence`?

**Recommendation**: `ev-loop-interactive`.

**Answer**: `ev-loop-interactive`. Both phases have judgment seams.

**Rationale**: `ev-loop-confidence` is for bulk-transform / find-
replace style work. Both phases here have at least one decision the
loop should pause for: Phase 1's `kebabCase` factor (is it really pure
or are there subtle whitespace-trimming differences?), Phase 1's
slug-too-short title-guard keep-or-drop, Phase 2's skill triggering
language tightness, Phase 2's CONVENTIONS.md heading wording.
Operator-paired loop is the right shape.

## Q5 — PR cadence: direct-to-main per phase vs `.plan` integration branch?

**Recommendation**: direct-to-main per phase.

**Answer**: direct-to-main per phase. Project is small (2 PRs); a
`.plan` integration branch would add overhead without value. Matches
the substrate-followups precedent.

**Rationale**: the parent substrate-consolidation project's biggest
operational drag was the unresolved ".plan periodic vs one
integration PR" question carried for 7 phases. Substrate-followups
resolved it upfront (direct-to-main). This project follows that
resolution. Two PRs, each independently shippable + revertable, no
integration step.

## Q6 — Phase ordering: verb-first or skill-first?

**Recommendation**: verb-first (Phase 1 verb, Phase 2 skill +
conventions + dogfood).

**Answer**: verb-first. The skill SKILL.md tells agents to call
`loom adr`; the CONVENTIONS.md note names the verb as the way to
record ADRs; the dogfood ADR is written by the verb. Reversing the
order would create a documentation-pointing-at-vapor moment.

**Rationale**: this is a real dependency, not a preference. The
operator does NOT have re-sequencing latitude.

## Q7 — Port scope: verbatim port or selective harvest?

**Recommendation**: verbatim port with named deltas.

**Answer**: verbatim port. The named deltas are:
- `JellyError → LoomError` (loom uses a different error class).
- `CliContext` shape adaptation (loom's plan/research/retro verbs use
  a `PlanCliContext` subset; the adr verb uses a similar pattern
  inferred from the existing loom verb shapes).
- Verbless-namespace wiring (loom's CLI dispatcher distinguishes
  namespaces-with-sub-verbs from verbless-namespaces; `loom adr` is
  verbless, so it goes in `VERBLESS_NAMESPACES`).
- `kebabCase` factor (jelly's `d10133c` did the same factor; loom's
  `createSlug` currently has the slugification inlined, so the factor
  is a real refactor here, not just a re-import).

**Rationale**: jelly's `d10133c` shipped a working verb with 15 tests
passing. Re-deriving the design from scratch would be expensive
without an obvious payoff. The port is mechanical; the deltas above
are the substrate's required adaptations, not opinion-driven
rewrites.

## Q8 — Slug-too-short title guard: keep or drop?

**Recommendation**: keep.

**Answer**: keep, decided at unit contract negotiation but
recorded here as the strawman.

**Rationale**: `createSlug` already has a 2-char floor; the shared
`kebabCase` helper inherits it. A 1-char ADR title is almost
certainly a typo. Consistency across the two callers of `kebabCase`
matters more than the marginal flexibility of allowing 1-char titles.

## Q9 — MCP wrapper, `griot init` `.gitkeep`, generated README index: ship or defer?

**Recommendation**: defer all three.

**Answer**: defer.
- **MCP wrapper**: loom doesn't currently wrap verbs as MCP tools.
  Adding `mcp__loom__adr` without an MCP server context is dead code.
  Defer until an MCP server lands as its own project.
- **`griot init` `.gitkeep`**: optional per the design doc — `loom
  adr` already `mkdir -p`s `projects/adr-log/` on first use. The
  `.gitkeep` is only useful for a fresh-consumer-repo onboarding
  scenario that hasn't surfaced as a real friction point. Defer.
- **Generated README index**: more state to keep in sync;
  `ls projects/adr-log/` is fine until the log exceeds ~30 entries.
  Revisit then.

**Rationale**: each of these is a v2-shape question that doesn't gate
the v1 utility of the verb. Shipping them now would expand the diff
without addressing a concrete user need.

## Q10 — Concurrency on `nextAdrNumber`: address now or defer?

**Recommendation**: defer; document as a known v1 limitation.

**Answer**: defer. The race is acceptable for operator-paired v1
usage. A `wx`-flag open or post-write `git status` check is a v2 add.

**Rationale**: jelly accepted the race for the same reason and
shipped without incident. This project's adoption pattern matches:
operator invokes `loom adr` from a session; parallel invocations are
rare enough that the race rarely fires. The mitigation is cheap to
add later if it becomes a real problem.

## Q11 — Dogfood ADR content: which decisions land in `0001-introduce-loom-adr.md`?

**Recommendation**: the load-bearing decisions from the design doc.

**Answer**: workspace-level placement, freeform status field,
max-not-count numbering invariant, deferred supersession workflow,
deferred MCP wrapper, deferred per-project scoping. Each with a
one-paragraph rationale matching the design doc + this interview.

**Rationale**: an ADR records *architectural* decisions — the choices
that future readers will need to understand the shape of the system.
The four "Open questions" + "Decisions" sections of the design doc
are exactly that surface. Lifting them into an ADR makes the
substrate's own conventions self-documenting via its own verb.
