# Domain: sketch-ideation

## Scope

Generative-art and sketch-creative work, specific to aart.camp.
Covers p5.js idiom, aesthetic direction, and sketch infrastructure
(the `<Sketch>` wrapper, `registry.ts`, the sketch-page shell at
`app/sketch/[slug]/`), and the gallery's framing of sketches as a
collection. This is a project-local domain — it lives in the
project's own source, not in core guild, and is folded in through the
`guild generate` project-local escape hatch.

This domain is the right lens ONLY when the work touches sketches or
sketch infrastructure. For substrate work, shared infrastructure
components, site-wide design tokens, or non-sketch routes, it defers
(see Cross-domain notes). An empty "not my lane" contribution is
cheaper than a noise contribution.

## Concerns

- **One idea per sketch.** The strongest sketches explore a single
  visual or generative concept. A brief that bundles three ideas
  into one sketch usually weakens all three — ask whether it is one
  sketch or three.
- **Generative, not just illustrative.** Sketches are
  generative-art-first: parameters, randomness, time-evolution. A
  proposal for a static rendered image is usually better served by a
  different medium (or a still export of an underlying generative
  sketch).
- **p5.js idioms over framework habits.** p5.js has its own shape —
  `setup`/`draw`, single-letter math vars, immediate-mode rendering,
  intentional global state in the sketch scope. Treating a sketch
  like a React component (deeply typed, many modules, elaborate state
  management) is friction. The wrapper handles the React/Next side;
  the sketch body should feel like p5.
- **Aesthetic intentionality.** Generative work earns trust by making
  decisions visible. "Exploring weighted line density across a
  recursive subdivision" reads as authored; "17 effects layered
  together" reads as noise. Intentionality over maximalism, by
  default.
- **The numbered-sketch convention.** Each sketch is `NN-name.tsx`
  (per the project's CLAUDE.md). The number is chronological and
  carries the site's history; the name names the idea. Renaming an
  existing numbered sketch breaks the URL contract for old links.
- **The site is a portfolio, not a product.** Each sketch is a
  finished thing. "Draft" or "in-progress" states inside the gallery
  should justify changing the portfolio framing rather than just
  adding the feature.

## Good patterns

- **Constraint over feature creep.** Pick one mechanic, push it to
  interesting territory, ship. A new sketch is a finished thought,
  not a starting point for elaboration.
- **Time-evolution over static composition.** Generative art's unique
  affordance is unfolding-over-time. A design that uses no time (no
  animation, no progressive reveal, no randomness-per-frame) might be
  better as a still image.
- **Math you can read off the screen.** Recursive subdivision, noise
  fields, Lissajous curves, harmonic motion — when the underlying
  math is visible in the result, the sketch earns "you can see what
  it's doing." Math buried under effects layers loses that.
- **Color as a deliberate choice.** A small, intentional palette per
  sketch. Reaching for "all the colors" or rainbow gradients without
  a reason usually shouldn't happen.

## Vocabulary

Use this vocabulary when describing sketch-ideation findings:

- **one idea per sketch** — a sketch explores a single visual or
  generative concept
- **generative-first** — built from parameters, randomness, and
  time-evolution rather than a static composition
- **immediate-mode** — the p5 `setup`/`draw` rendering model, distinct
  from React's retained component model
- **numbered-sketch convention** — `NN-name.tsx`, chronological number
  plus an idea name; the URL contract
- **aesthetic intentionality** — making the generative decisions
  visible and authored rather than maximalist
- **portfolio framing** — each sketch is a finished thing in a
  collection, not a product feature

## Cross-domain notes

- Overlaps with **composition** / design-systems on the gallery
  chrome: how sketches are presented is partly shared-infrastructure
  design, partly an aesthetic call. Defer on the chrome, lead on the
  sketch-as-portfolio framing.
- Overlaps with **react** on the wrapper pattern (already stable);
  lead on the p5-specific idioms inside the sketch body.
- Overlaps with **a11y**: the canvas inside a sketch is intentionally
  exempt from semantic announcement (per the project's `test:a11y`
  config). Defer on canvas content; collaborate on the framing UI.
- Overlaps with **performance**: sketches have their own performance
  idioms (the p5 draw loop, canvas rendering, no React re-render).
  Mostly defer; collaborate when a design proposes shared-canvas
  patterns that could degrade the gallery.
- Defers entirely on **substrate** work (the guild-/griot- families,
  ev-loop skills, the loom CLI, scripts) — out of scope; pass.
