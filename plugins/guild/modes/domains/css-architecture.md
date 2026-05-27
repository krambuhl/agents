# Domain: css-architecture

## Scope

Structural CSS: selector specificity, cascade behavior, composition
vs. duplication of rule blocks, when `:global` is warranted,
`!important` discipline, and whether layout reinvents the project's
shared primitives. The lens assumes vocabulary is already correct —
that values are tokens and token names are right — and grades the
*shape* of the CSS that uses them.

This domain owns **structural shape**. It does not own
literal-vs-token (that is `tokens`) or token-name choice (that is
`naming`); it sits downstream of both. The clear test: "this line
should use a token instead of a literal" is `tokens`' call; "this
token is the wrong name for the role" is `naming`'s call; "this
selector's specificity will fight cascade rules elsewhere in the file"
is this domain's call.

This domain is **blocking by default** for the structural-soundness
entries: specificity wars, cascade-fragile rules, `:global` leaks,
`!important` overuse, and silent resolved-value changes break the
artifact or the cascade and gate the unit. Composition-duplication and
shared-primitive-bypass are advisory.

## Concerns

- **Specificity stays flat and predictable.** Selectors don't escalate
  into specificity wars that force the next author to escalate further.
- **The cascade is not load-bearing by accident.** A rule that only
  works because of its source-order position relative to another is
  fragile; the relationship should be explicit, not incidental.
- **Compose rule blocks, don't duplicate them.** A rule block repeated
  across selectors is a single composable class waiting to happen.
- **`:global` and `!important` are exceptions, not tools.** Each use is
  a local escape from module scoping or the cascade and needs a reason.
- **Reach for the shared layout primitives.** Ad-hoc flex/grid where
  `Stack` / `Grid` / `Area` exist fragments the layout system.
- **Visual-property changes surface their resolved-value delta.** Any
  change touching a rendered visual property should make the
  before/after resolved value visible, so a silent visual regression
  can't hide inside a refactor.

## Antipattern catalog

1. **Specificity war** — a selector like `.foo .bar.baz` battling
   `.bar` elsewhere, each escalation forcing the next. Makes the file
   unmaintainable; the next override has to out-specify the last.
   Severity: **blocking**. Flag: `css-arch-specificity-fight`.

2. **Cascade-fragile rule** — a rule that works only because of its
   source-order position relative to another, with no explicit
   relationship. Reorder the file and it breaks. Severity:
   **blocking**. Flag: `css-arch-cascade-fragile`.

3. **Duplicate rule blocks** — the same block of declarations repeated
   across selectors where a single composed class would express it
   once. Severity: **advisory**. Flag: `css-arch-duplicate-rules`.

4. **`:global` leak** — `:global` used outside an explicit, documented
   substrate exception, punching a hole in CSS-Module scoping that
   other modules can collide with. Severity: **blocking**. Flag:
   `css-arch-global-leak`.

5. **Shared-primitive bypass** — ad-hoc flex/grid layout reinventing a
   shared primitive (`Stack`, `Grid`, `Area`) that already exists.
   Fragments the layout system and misses its conventions. Severity:
   **advisory**. Flag: `css-arch-shared-primitive-bypass`.

6. **`!important` overuse** — `!important` in the general case, where
   it papers over a specificity or cascade problem rather than solving
   it. (See the carve-out below for the load-bearing exception.)
   Severity: **blocking**. Flag: `css-arch-important-overuse`.

7. **Visual change without a resolved-value diff** — a change touching
   a rendered visual property (color, background, border, font-size,
   line-height, focus styles, outline, box-shadow) that does not
   surface the before/after resolved value. A reviewer can't tell a
   safe refactor from a silent visual regression. Severity:
   **blocking**. Flag: `css-arch-missing-resolved-diff`.

8. **Silent resolved-value change** — a change that altered a rule's
   resolved visual value while presenting itself as a non-visual
   refactor (rename, reorganize, tokenize). The value moved and nobody
   said so. Severity: **blocking**. Flag: `css-arch-silent-value-change`.

## Carve-outs

- **`!important` on library-owned intrinsic dimensions.** When a rule
  must override styling on DOM a third-party library owns — e.g.
  forcing a `<canvas>` element's width/height — `!important` is
  load-bearing, not overuse. Don't flag the override that exists
  because the library's inline styles can't otherwise be beaten.
- **Descendant selectors into library-owned DOM.** A selector like
  `& canvas` reaching into DOM a library renders is the legitimate
  seam for styling it; it isn't a specificity smell.

## Good patterns

- **Flat, single-class selectors** that don't depend on descendant
  context to win the cascade.
- **Composition over duplication** — shared declarations live in one
  class that others compose, not copied across selectors.
- **`:global` and `!important` reserved for documented exceptions**
  (library-owned DOM, intentional global resets), each with a reason.
- **Shared layout primitives** (`Stack`, `Grid`, `Area`) over ad-hoc
  flex/grid for layout that the system already expresses.
- **Resolved-value diffs accompany visual-property changes**, so a
  refactor that changes how something renders is visible as such.

## Vocabulary

- **specificity war** — escalating selector specificity to win the
  cascade, forcing the next author to escalate again
- **cascade-fragile** — a rule that works only by incidental
  source-order position
- **`:global` leak** — module-scope escape that lets rules collide
  across modules
- **shared primitive** — an existing layout component (`Stack`,
  `Grid`, `Area`) that ad-hoc layout should defer to
- **resolved-value diff** — a before/after of a rule's rendered visual
  value, surfaced so silent regressions are caught

## Cross-domain notes

- Boundary with **tokens**: `tokens` owns literal-vs-token (is a value
  hardcoded where a token should apply?). This domain assumes values
  are tokens and grades the structural shape around them. When both
  see the same line, the vocabulary concern (tokens) is upstream of
  the structural concern (this domain).
- Boundary with **naming**: `naming` owns whether `token("...")` is
  the semantically right name for the role. This domain doesn't flag
  token-name choices.
- Overlaps with **composition**: duplicate rule blocks and
  shared-primitive bypass are the CSS expression of the
  composition-over-configuration concern; composition reasons about
  component units, this domain about rule blocks and selectors.
