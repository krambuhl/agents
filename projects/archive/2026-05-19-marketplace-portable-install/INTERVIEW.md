# INTERVIEW: Plan-session grill for marketplace-portable-install

This file is the walked decision tree from the `/loom-plan`
interview. Each section is one resolved question with the
recommendation, the user's answer, and the rationale.

The plan session ran on 2026-05-19 (slug date per UTC) and consumed
`RESEARCH.md` in this same project directory as its research
foundation. Many decisions reference RESEARCH's PQ1-PQ7 numbering or
its working directions A-H.

## Decision 1 — Migration sequencing (PQ1)

**Question**: How should the migration decompose into PRs?

**Recommendation**: Three-phase per `CLAUDE.md` (setup gate → bulk
migration → cleanup). Reasoning: the migration touches enough
surfaces that one PR is too much to hold in a reviewer's head, and
the work naturally splits.

**User choice**: One bundled migration PR.

**Rationale**: User prefers the bigger atomic PR. The mechanical
nature of most rewrites bounds the cognitive load. Single reviewer
(the user himself) can absorb one larger PR.

## Decision 2 — `bin/griot init` timing (PQ2)

**Question**: Does the new `bin/griot init` verb ship in the
bundled migration PR, or get deferred?

**Recommendation**: Ship in the migration PR.

**User choice**: Ship in the migration PR.

**Rationale**: Verb is small. Without it, every consumer's first
run has a manual gitignore step that's easy to forget — and
forgetting means work-context learnings commit. The invariant
deserves a verb.

## Decision 3 — Orphan skill prefix audit (PQ3, dismissed)

**Question**: Rename `review-skill` / `a11y-review-file` in the
migration PR, or defer?

**Recommendation**: Defer to a cleanup PR.

**User choice**: Dismissed the question. Instead surfaced a deeper
reframe: `a11y-review-file` should be deleted entirely; `review-skill`
is not part of the substrate bundle; `ev-run`/`ev-loop-*` are
implementations of the substrate, not substrate themselves.

**Rationale**: The user's reframe re-opened RESEARCH § A's
mega-plugin direction. See Decision 4.

## Decision 4 — Plugin shape (supersedes RESEARCH § A)

**Question**: How should the marketplace split the framework's
content into plugins?

**Recommendation**: Two plugins + standalones tier — `loom`
(substrate) + `ev` (impls) + standalones via per-skill skills.sh.
Reasoning: matches conceptual layering; allows substrate-only
install.

**User choice**: One plugin per family (granular). griot, guild,
loom, ev each as separate plugins.

**Rationale**: User's instinct went more granular than the
two-tier proposal. Each top-level skill family becomes its own
plugin. Trade-off: more inter-plugin dependencies; consumer
choice; clean conceptual mapping.

## Decision 5 — `review-skill` placement

**Question**: Where does `review-skill` (the meta-skill that
reviews other skills) land in the new plugin structure?

**Recommendation**: Its own tiny plugin `review-skill@krambuhl`.

**User choice**: Its own plugin `review-skill@krambuhl`.

**Rationale**: Family-of-one. Installable without the framework;
doesn't pollute the framework plugins. Lives in the same marketplace.

## Decision 6 — Migration sequencing revisit (after granular split)

**Question**: Now that the marketplace has 5 plugins instead of
one mega-plugin, how do you want to ship the migration?

**Recommendation**: Bottom-up by dependency order (griot + guild
first; then loom; then ev). Three PRs.

**User choice**: Still one bundled PR (all 5 plugins together).

**Rationale**: User stayed consistent with Decision 1's preference
for one bundled PR even after the structural reframe.

## Decision 7 — Shared CLI library code

**Question**: How does the shared CLI library code (`cli/lib/`,
cross-cutting verbs) live in a per-family-plugin world?

**Recommendation**: Each plugin duplicates the shared lib code via
a build/sync script. Simpler than npm-publishing a separate
package; CI catches drift.

**User choice**: Each plugin duplicates shared lib code (sync script).

**Rationale**: Matches the user's "keep it basic" philosophy. The
build step is a small script; the drift risk is mitigated by a
pre-commit hook + CI check.

## Decision 8 — Inter-plugin dependencies

**Question**: How does `ev@krambuhl` handle its dependency on the
other three plugins (loom, guild, griot)?

**Recommendation**: Runtime preflight only. Each ev-* skill body
runs `command -v loom guild griot >/dev/null || fail` at the top.

**User choice**: Manifest declaration + runtime preflight + ship a
meta-plugin `agent-loop-full@krambuhl` that bundles all 5
(combined options 2 and 3 from the multi-choice).

**Rationale**: Most consumer-friendly path. Belt-and-suspenders for
dep enforcement; meta-plugin serves turnkey users. Adds a 6th
plugin entry (`agent-loop-full`) and adds Phase 0 verification
work (V4 + V5).

## Decision 9 — `install.sh` fate (PQ4)

**Question**: What happens to `install.sh` in the migration PR?

**Recommendation**: Keep with deprecation banner; delete in a
future cleanup PR.

**User choice**: Delete in the migration PR.

**Rationale**: User is the sole consumer of `install.sh`. Hand-
cleans his own shimmed projects per the earlier untether-skip
decision. No deprecation period needed.

## Decisions deferred (carried forward as Open Questions in PLAN.md)

- **PQ5** Public-publish gating sequence — folded into V8 in the
  Verification section.
- **PQ6** Skill-helper preflight shape — partially settled by
  Decision 8 (runtime preflight is a bash one-liner in each skill
  body); shape details deferred to implementation.
- **PQ7** `npx skills add` compatibility claim — implicitly resolved
  by the plan dropping the claim from the README (Scope §
  "Out (deferred or never)").

## Course-corrections from the user during the interview

The user surfaced two meta-corrections during the session:

1. **Reframe** (early): grilling on PQ3 surfaced their actual
   structural preference. The dossier's mega-plugin direction was
   superseded.
2. **Feedback** (mid-session, from earlier `/loom-research`):
   continued application of "one question at a time,
   multi-choice via AskUserQuestion." The plan session followed
   this discipline throughout.
