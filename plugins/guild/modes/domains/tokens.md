# Domain: tokens

## Scope

Design-token discipline: whether an artifact uses the project's
design-token system rather than hand-rolled literals. Covers
`.module.css` rules and JSX `style={}` props where the
`token("namespace.path")` PostCSS function should apply — hex
literals, named CSS colors used as fills, hardcoded `px`/`rem`/`em`
spacing and typography values, hardcoded breakpoint pixel widths,
inline literal styles, and runtime token reads pulled across the
JS/CSS boundary.

This domain owns **literal-vs-token** — whether ANY token is used
where one should be. It does not own which token *name* is the right
semantic choice (that is `naming`), nor the structural shape of the
CSS that uses it (that is `css-architecture`).

This domain is **advisory by default**: findings list for the
reviewer's eye but do not gate a unit on their own. Escalate to
blocking only with explicit, in-diff evidence of regression — a diff
that converts a `token()` call back to a literal, or introduces a
literal in a rule that previously used a token.

The token system has three load-bearing pieces a reader should be
oriented to:

- `tokens/design-tokens.json` is the source of truth (namespaces:
  `space.xN`, `fg.*`, `bg.*`, `fontFamily.*`, `fontWeight.*`,
  `lineHeight.*`, `breakpoint.*`, `size.*`).
- `npm run generate:tokens` regenerates `tokens/tokens.ts`,
  `tokens/breakpoints.ts`, `styles/tokens.css`, and the PostCSS
  function data.
- `token("namespace.path")` is the canonical PostCSS function used in
  `.module.css` rules (resolves to a CSS custom property). The
  `@each $bp, $mq in map-breakpoints() { ... }` pattern is the
  canonical way to generate responsive class variants.

The antipattern catalog references these names directly.

## Concerns

- **A token over a literal.** Visual values (color, spacing,
  typography, breakpoints) come from the token system so a
  token-rename or theme-swap propagates; a literal silently drifts off
  the system.
- **CSS over inline style.** `.module.css` rules using `token()`
  participate in responsive-class generation and CSS-variable
  inheritance for theming; inline `style={}` literals bypass both.
- **Declare design values once, in CSS.** Reading a token across the
  JS/CSS runtime boundary into a `style={}` prop duplicates a value
  the CSS layer should own.

## Antipattern catalog

1. **Hex literal color in a `.module.css` rule** — `color: #ff0000;`
   or `background-color: #abc;` instead of `color: token("fg.*")` /
   `background-color: token("bg.*")`. Drifts visual style off the
   system; a future token-rename or theme-swap doesn't update the
   literal. Shows up as `#[0-9a-fA-F]{3,8}` in a property value (not a
   comment or selector). Severity: **advisory** (escalate on
   regression). Flag: `tokens-hex-literal`.

2. **Named CSS color used as a fill** — `color: red;`,
   `background-color: black;` in a rule where a semantic token would
   apply. Same drift impact as a hex literal. Shows up as the common
   color keywords (`red`, `blue`, `green`, `black`, `white`, `gray`,
   …) in a property value. Severity: **advisory**. Flag:
   `tokens-named-color`.

3. **Hardcoded `px` / `rem` / `em` spacing value** — `padding: 16px;`,
   `margin-top: 1.5rem;`, `gap: 24px;` where a `token("space.xN")`
   value exists for that magnitude. Manual values don't track
   design-token rescaling. Shows up as `\d+(px|rem|em)` on a spacing
   property (`padding`, `margin`, `gap`, `top`, `left`, …) — not a
   typography size, which has its own entry. Severity: **advisory**.
   Flag: `tokens-hardcoded-spacing`.

4. **Hardcoded typography literal** — `font-family: 'Helvetica Neue';`,
   `font-weight: 600;`, `line-height: 1.4;`, `font-size: 14px;` where
   `token("fontFamily.*")` / `token("fontWeight.*")` /
   `token("lineHeight.*")` / a size token exists. Same drift impact as
   spacing. Shows up on the typography properties in a `.module.css`
   rule. Severity: **advisory**. Flag: `tokens-hardcoded-typography`.

5. **Hardcoded breakpoint pixel width in a literal `@media`** —
   `@media (min-width: 588px) { ... }` instead of the
   `@each $bp, $mq in map-breakpoints()` generator that resolves from
   `token("breakpoint.*")`. Diverges from the breakpoint set in
   `design-tokens.json`; future adjustments don't propagate. Shows up
   as `@media (min-width: \d+px` / `(max-width: \d+px`. Severity:
   **advisory**. Flag: `tokens-hardcoded-breakpoint`.

6. **Inline literal `style={{ ... }}` in JSX** —
   `style={{ color: '#abc', padding: 16 }}` on a JSX element where a
   CSS Module rule using `token()` would apply. Inline styles bypass
   the design system and responsive-class generation, and defeat CSS
   variable inheritance for theming. Shows up as `style={{` in
   `.tsx` / `.jsx` carrying literal visual values. Severity:
   **advisory**. Flag: `tokens-inline-literal-style`.

7. **Runtime token read via `tokens/tokens.ts` import for a JSX
   `style={}`** — `import { tokens } from '@/tokens'` followed by
   `style={{ color: tokens.fg.muted }}`. Pulls a static design value
   across the runtime boundary instead of declaring it once in CSS;
   the CSS Module + `token()` path is the design-system-aware
   equivalent. (Legitimate runtime reads exist — e.g. passing a token
   color into a p5 sketch as a string — so this targets the JSX-style
   case specifically.) Severity: **advisory**. Flag:
   `tokens-runtime-style-import`.

## Carve-outs

These contextually-legitimate literals are **not** findings — they are
first-class exclusions, not edge cases:

- **`sketches/` files.** p5.js sketches are artistic statements;
  hardcoded colors, sizes, and literal numerics are routinely
  intentional (the literal IS the work). Exclude files matching
  `^sketches/` or importing `@p5-wrapper/react`.
- **CSS keywords and viewport units.** `100%`, `100dvh`, `100vh`,
  `100vw`, `auto`, `min-content`, `max-content`, `fit-content`, `0`,
  `inherit`, `unset`, `initial`, `revert`, `1em` for relative scaling
  — CSS keywords or relative units with no token equivalent.
- **`globals.css`, `styles/tokens.css`.** The source-of-truth files
  for global resets and generated token definitions. Literal values
  there are expected — that is where they live.
- **Component-scoped CSS custom properties for runtime tweakability.**
  A rule like `aspect-ratio: var(--sketch-aspect-ratio, 1);` is a
  declaration site for a component-local knob, not a design-token
  bypass. The `token()` function is for design-token namespace reads;
  ad-hoc component custom properties for runtime configuration are a
  different concern, outside this domain.

## Good patterns

- **`token()` for every design value** in `.module.css` —
  `color: token("fg.muted");`, `padding: token("space.x4");`.
- **The breakpoint generator** (`@each $bp, $mq in map-breakpoints()`)
  for responsive variants, never a literal `@media` width.
- **CSS Modules over inline styles** for anything the design system
  owns; reserve `style={}` for genuinely dynamic, non-design values.
- **Declare once in CSS, not across the runtime boundary** — let the
  CSS layer own design values rather than importing token objects into
  JSX `style={}`.

## Vocabulary

- **literal** — a hardcoded visual value (hex, named color, raw
  `px`/`rem`, raw breakpoint width) where a token should apply
- **token** — a `token("namespace.path")` read resolving to a
  design-system custom property
- **design drift** — visual style diverging from the token system
  because a literal does not track token changes
- **responsive-class generator** — the `map-breakpoints()` `@each`
  pattern that resolves breakpoints from tokens
- **runtime token read** — importing the token object into JS to feed
  a `style={}` prop instead of declaring the value in CSS

## Cross-domain notes

- Boundary with **naming**: `naming` owns the token *name* choice —
  when two valid tokens exist (`color.background.surface` vs
  `color.gray.200`), which is semantically correct. This domain owns
  whether ANY token is used; `naming` owns whether the RIGHT token
  name is used.
- Boundary with **css-architecture**: `css-architecture` owns the
  structural shape (specificity, cascade, composition) of the CSS;
  this domain owns whether its values are tokens or literals. The
  structural concern is downstream of the literal-vs-token concern.
- Boundary with **a11y**: a color that bypasses the token system but
  passes WCAG contrast is a tokens finding, not an a11y one. A color
  whose contrast fails is an a11y finding regardless of whether it
  came from a token or a literal.
- Boundary with **nextjs**: hydration mismatches from token-derived
  runtime values stay in the `nextjs` lane.
