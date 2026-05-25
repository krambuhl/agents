# Domain: composition

## Scope

How code is decomposed into reusable units, and whether those units
compose by combination or by configuration. Covers component
families, function shapes, module boundaries, and the rails-vs-knobs
question. Architecture-shaped: applies regardless of language.

This is about WHETHER abstractions compose, not WHEN to introduce
them. The "when" question lives in the `abstraction` domain.

## Concerns

- **Composition over configuration.** Variants achieved by composing
  smaller primitives, not by adding switches inside a monolith.
- **Single responsibility per unit.** Each component, function, or
  module does ONE thing well; layering happens by combining
  single-purpose units, not by stuffing one unit with branches.
- **Rails plus escape hatches.** High-abstraction presets for the
  common path, low-abstraction primitives available for the edge
  cases. The two layers exist together, intentionally.
- **Coupling.** A unit knows as little about its callers as
  possible. Shared state, implicit context dependencies, or
  position-coupled props that "only matter together" are smells.
- **Reusability without contortion.** A primitive useful in only one
  caller's exact shape isn't a primitive — it's an inlined helper
  wearing a primitive's hat.

## Antipattern catalog

1. **Configuration explosion.** A component or function with 10+
   boolean / variant / option props. Each new variant adds another
   switch instead of another primitive. Symptom: prop signatures
   grow, internal branches multiply, the unit gets harder to read
   linearly. Severity: blocking when the explosion already happened;
   advisory when one new prop is being added that fits the pattern.

2. **Monolithic primitive.** One unit swallows multiple distinct
   concerns (layout + data fetch + interactive state + theming + ...)
   instead of three or four focused units that compose. Symptom: the
   unit name has to use "and" or be generic ("Card" doing layout +
   image + actions + footer). Severity: blocking when refactor cost
   is locally containable.

3. **Internal switches as variant mechanism.** Variants live as
   `if (foo && bar) { ... } else if (foo && !bar) { ... }` branches
   inside the unit, often via composite prop combinations. Composing
   two smaller primitives would express the same variants without
   branches. Severity: blocking when the branch count exceeds the
   prop count; advisory below.

4. **Primitives that don't compose with each other.** Two primitives
   in the same family each impose their own outer wrapping or layout
   constraints, so combining them requires hacking around one or the
   other. Symptom: "you can't put X inside Y because Y wraps in a
   `<div>` with conflicting styles." Severity: blocking.

5. **God object / mega-handler.** A single function or class
   receives all the operations for a domain and dispatches
   internally. Symptom: a 300-line `useFoo` hook that handles read,
   write, validate, and undo; a `dispatch(action)` that branches on
   `action.type` for dozens of types without sub-routing. Severity:
   blocking.

6. **Tight coupling via shared mutable state.** Multiple units
   reach into the same global or context-mutable state to coordinate.
   The composition graph is implicit. Symptom: adding a third caller
   requires understanding the existing two's interaction. Severity:
   blocking.

7. **Layered abstractions without escape hatches.** High-level
   preset is the only API; consumers needing one knob outside the
   preset have to fork or wrap the whole unit. Symptom: "we needed
   to copy-paste this and modify two lines." Severity: blocking when
   it forces forks; advisory when it forces wrapper components.

## Good patterns

- **Functional, s-expression-shaped composition.** Units combine by
  nesting or by passing other units as children/arguments, not by
  configuration. `<Stack><Card /><Card /></Stack>` over `<Stack
  cards=[card1, card2] />`.
- **Single-purpose primitives.** Each unit's name is a noun or
  noun-phrase that describes one concrete thing. No "and."
- **Paired high/low abstractions.** A `<Table>` preset that covers
  90% of the cases + an `<TableColumn>` / `<TableRow>` lower tier for
  the 10%. Both ship together.
- **Children as the composition seam.** When a primitive needs to
  let callers customize a region, `children` (or a render-prop) is
  the canonical seam — not 15 nullable config props.
- **Predictable prop shape.** Props are either data (what to show)
  or behavior callbacks (what happens on interaction). Variant
  switches stay rare and orthogonal.

## Vocabulary

Use this vocabulary when describing composition findings:

- **primitive** — a single-purpose unit at the bottom of the
  composition graph
- **family** — a set of primitives that combine for a domain (e.g.
  the `Table` family)
- **rails** — the on-rails preset for the common path
- **escape hatch** — the off-rails primitive for the uncommon path
- **composition seam** — the API surface where callers plug in
  customization (typically `children` or render props)
- **knob** — a configuration prop (use sparingly; prefer composition)
- **monolith** — a unit that swallows multiple concerns
- **God object** — a unit that owns too many operations for a
  domain

## Cross-domain notes

- Overlaps with **abstraction**: a composition seam is an
  abstraction boundary. Composition asks "do the units compose?";
  abstraction asks "should this seam exist at all?"
- Overlaps with **naming**: composable primitives need clear
  individual names. A "FormField" that's actually doing
  layout + validation + autosave is a naming problem AND a
  composition problem.
- Less overlap with **testing**: composition concerns are usually
  visible in the source itself, not in test shapes. (Exception:
  composition that's hard to test in isolation is a composition
  smell.)
- Less overlap with **a11y**: a11y is a domain that COMPOSES with
  composition rather than overlapping; a composable `<Button>`
  primitive can be either accessible or not, independent of how
  composable it is.
