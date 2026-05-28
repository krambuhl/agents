# Interview — substrate-followups

The decision tree walked while birthing this plan. Each section names
a question, the recommendation Claude proposed, the operator's
answer, and the rationale.

## Research path (pre-interview)

**Question**: The `/loom-plan` skill expects to auto-spawn
`/loom-research` as a fresh-context Agent sub-agent, but
`subagent_type=loom-research` isn't registered in this Claude Code
environment AND the `/loom-research` Skill carries
`disable-model-invocation: true` (both auto-paths blocked). How should
the research foundation get in place?

**Recommendation**: Claude authors RESEARCH.md directly from the
parent project's archive retro (the de-facto research foundation),
since the substrate-consolidation retro already documented all 4
follow-ups with current state, the gap, and candidate approaches.

**Answer (after one re-grill)**: The operator first chose "invoke
/loom-research as a Skill" without knowing it was blocked. When the
disable-model-invocation flag was surfaced, the operator's choice
between "Claude authors RESEARCH.md from the retro" and "operator
invokes /loom-research manually as a slash command" was answered by
re-invoking `/loom-plan` directly — implicit "have Claude author
it." Claude proceeded.

**Rationale**: The parent retro IS the research foundation; running
/loom-research would just re-summarize it at additional cost. The
substrate gap (no `loom-research` Agent + Skill-tool blocked) is
recorded in PLAN.md § Out of scope as a candidate for a future
substrate-shape follow-up project.

## Topic + scope

**Question**: Is the scope the 4 unresolved follow-ups from the
parent retro (`3-copy doc redundancy`, `loom doctor exit-code`,
`live-spawn smoke`, `L332 responses path`) — with PR cadence excluded
because it's resolved by in-flight PR #100?

**Recommendation**: Yes, those 4. Each is independently shippable.

**Answer**: Implicit yes (the operator's `/loom-plan` topic was
"lets do all the follow up work" and they re-invoked after seeing
this framing; the scope confirmation was not separately challenged).

**Rationale**: The 4 follow-ups are well-bounded and each is a
small (1–3 PR) tactical fix. The 5th (PR cadence) literally cannot
land here — it's about how this project itself ships, which is
this project's PR cadence decision below.

## PR cadence

**Question**: Should this project use the parent's `.plan`
integration-branch pattern, or ship per-phase direct to main?

**Recommendation**: Direct-to-main per phase. The parent's `.plan`
model made sense at 32 PRs over 7 phases; this project is 4 PRs
over 4 phases — much smaller, no need for an integration branch.

**Answer**: Direct-to-main per phase. (Operator selected the
recommended option via `AskUserQuestion`.)

**Rationale**: Smaller surface; faster downstream propagation;
settles the parent's biggest operational drag upfront. The "squash
per phase to main" alternative was offered but not chosen (preserves
per-PR commit detail in main's `git log`).

## Phase decomposition

**Question**: 4 phases (one per follow-up), or fewer (group by
domain), or 1 phase with 4 units?

**Recommendation**: 4 phases, one per follow-up. The follow-ups are
dependency-independent and shipping them as separate PRs gives clean
revert granularity.

**Answer**: Accepted by default during plan synthesis (not separately
grilled; the operator did not redirect when the strawman frame
named "4 phases" explicitly).

**Rationale**: Each follow-up is its own conceptual change; bundling
violates the "one kind of change per PR" discipline. 4 phases ×
~1 PR/phase = 4 PRs total. Manageable.

## Phase ordering

**Question**: Smallest-first (#2 → #1d → #4 → #3) or
operator-driven?

**Recommendation**: Smallest-first (Phase 1 = `loom doctor` flip is
the smallest; ordering escalates through the doc-hash check, the
responses relocation, and the smoke checklist).

**Answer**: Accepted by default (not separately grilled; the
RESEARCH.md cross-cutting section named smallest-first and the
operator didn't redirect).

**Rationale**: Smallest-first builds confidence in the cadence
(direct-to-main per phase) on a small surface before tackling
larger ones. The operator can re-sequence at `/ev-run` time if a
different phase becomes urgent.

## Per-follow-up option choice

**Question**: For each follow-up where RESEARCH.md named multiple
options, which option does this plan adopt?

**Recommendations (from RESEARCH.md)**:
- #1 → option (d): CI hash check + sync script. (Alternatives: (a)
  build-time copy at install, (b) symlinks, (c) one-plugin-owns +
  cross-plugin refs. All higher cost than (d).)
- #2 → option (a): flip default to exit non-zero on `ok:false`.
  (Alternative: (b) `--fail-on-issues` flag — preserves backward
  compat but the backward-compat concern is theoretical.)
- #3 → option (a): document-only checklist. (Alternative: (b)
  smoke-test script — but live-spawn is an operator action requiring
  a real session.)
- #4 → option (a): relocate to `responses/<branch>/<id>.md`.
  (Alternative: (b) fold into `manifest.toml [[responses]]` —
  markdown-in-inline-table is awkward without a matching benefit.)

**Answer**: All four recommendations accepted at plan synthesis (not
separately grilled; RESEARCH.md's case for each is the strawman, and
the operator's pattern of accepting RESEARCH.md recommendations
without redirect is the signal).

**Rationale**: Each recommendation is the lowest-cost-with-real-value
option. Overrides remain possible at unit contract negotiation
during `/ev-run`.

## Loop strategy

**Question**: `ev-loop-interactive` (each unit gets a paired
checkpoint) or `ev-loop-confidence` (units are mechanical, panel-
gated)?

**Recommendation**: `ev-loop-interactive`. Each phase has at least
one judgment-shaped seam (which file the test lives in, the sync
script's exact shape, the checklist's prose tone).

**Answer**: Accepted by default (consistent with the parent project's
loop choice).

**Rationale**: Matches the parent. The phases are small but not
mechanical; they each have a real "is this the right shape?" moment.

## Open questions deferred to unit contract

These small choices were surfaced in RESEARCH.md and left to the
unit contract negotiation during `/ev-run`:

- **Phase 2 sync script language**: shell vs node. Default
  recommendation: shell (zero deps).
- **Phase 4 sample-diff content**: a real prior project's diff vs a
  synthetic one. Default recommendation: synthetic (small, focused,
  no external dep).

Both are intentionally deferred so the unit contract owns them.

## Slug confirmation

**Question**: Project slug?

**Recommendation**: `substrate-followups` → `2026-05-28-substrate-followups`
(today's date prefix).

**Answer**: Accepted implicitly — the `loom research` invocation used
this slug and the operator did not redirect.

**Rationale**: Short, descriptive, distinguishes from the parent
project's archive while naming the relationship.
