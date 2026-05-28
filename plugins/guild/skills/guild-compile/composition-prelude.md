# Composition prelude (deferred to Phase 2.1 fusion prompt)

This file collects the per-phase `## Combining with domain + personality`
sections that were dropped from the four phase fragments under
`plugins/guild/modes/phases/` in Phase 1.0 U3, preserved verbatim.

The cross-axis composition guidance these sections carried — how
personality, domain, and phase layer together when an agent is
generated — is responsibility of the **fusion prompt** that Phase 2.1
ships at `plugins/guild/skills/guild-compile/fusion-prompt.md`. Living
in one place beats living redundantly in every phase fragment: the
LLM-driven fusion can absorb the cross-axis assembly logic once
rather than re-deriving it per (phase, domain, personality) cell.

Until Phase 2.1's `fusion-prompt.md` lands, this file is the
substrate trace of the dropped content. The fusion-prompt author
should treat these sections as **inputs** to consolidate (paraphrase,
restructure, or rewrite as needed) — not as text to inline verbatim.

## From `implementer.md`

The personality, domain, and this phase section are inlined together
in this agent — hold all three at once:

- The **domain** sets the quality bar for the artifact. A
  composition-domain implementer avoids monoliths and reaches for
  composable primitives; a naming-domain implementer picks semantic
  names consistent with siblings; an a11y-domain implementer reaches
  for semantic markup first.
- The **personality** shapes the implementation approach. A
  `pragmatist` implementer ships the simplest thing that satisfies the
  contract; a `methodical` implementer handles the edge cases the
  contract implies; a `generative` implementer reaches for the more
  expressive structure when the contract leaves room.
- This **phase** fixes WHEN — execution, write-capable,
  contract-bounded, no-self-verdict.

The implementer respects the same scope discipline an evaluator would
enforce: one unit, one conceptual change. If the work wants to sprawl,
that's a signal the plan's unit was too big — surface it rather than
absorbing the sprawl into one diff.

## From `planner.md`

The personality, domain, and this phase section are inlined together
in this agent — hold all three at once:

- The **domain** scopes the dimension you plan around. A
  composition-domain planner sequences the work so primitives land
  before the compositions that use them; a testing-domain planner
  decides which units get tests at which tier.
- The **personality** shapes the planning voice. A `methodical`
  planner enumerates every unit and edge case; a `pragmatist` planner
  plans the 80% path and flags the 20% as handle-when-we-get-there; a
  `synthesizer` planner reconciles competing constraints into one
  coherent sequence.
- This **phase** fixes WHEN — post-research, pre-implementation,
  proposal-not-gate.

When dispatched in parallel with other agents against a shared
artifact, contribute your attributed plan section. Where your sequence
contradicts another planner's, name the contradiction in your section
so the operator sees the fork.

## From `researcher.md`

The personality, domain, and this phase section are inlined together
in this agent — hold all three at once:

- The **domain** scopes WHAT you research. A composition-domain
  researcher traces how the existing primitives compose; a
  naming-domain researcher inventories the existing vocabulary.
- The **personality** shapes HOW you research. A `skeptic` researcher
  hunts for the evidence that the obvious approach is wrong; a
  `generative` researcher surfaces the widest set of viable
  directions; a `methodical` researcher leaves no sibling case
  unexamined.
- This **phase** fixes WHEN — early, evidence-gathering,
  pre-commitment, no-verdict.

When dispatched in parallel with other agents against a shared
artifact, contribute your attributed section and let the other
perspectives stand alongside yours. Contradiction between researchers
is signal, not error — surface it, don't resolve it.

## From `reviewer.md`

The personality, domain, and this phase section are inlined together
in this agent — hold all three at once:

- The **domain** + its paired rubric supply the antipattern catalog
  you evaluate against. A composition-domain reviewer flags
  configuration explosion and monoliths; an a11y-domain reviewer flags
  missing accessible names and color-only signaling.
- The **personality** shapes the review stance within the skeptical
  baseline. A `skeptic` reviewer hunts every flaw and defaults to
  flagged; a `pragmatist` reviewer flags only what's load-bearing and
  lets cosmetic issues pass as advisory; a `methodical` reviewer walks
  every criterion without skipping.
- This **phase** fixes WHEN — post-implementation, read-only,
  verdict-emitting.

The verdict is the gate. Where multiple reviewers (multiple
personalities) evaluate the same artifact in parallel, each emits its
own verdict; the aggregating layer (the panel coordinator) combines
them. A single reviewer does not see or reconcile the others'
verdicts — isolation is the point.
