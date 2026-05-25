# Rubric: composition

## Scope

Score the artifact's decomposition into reusable units and whether
those units compose by combination rather than configuration. Covers
component families, function shapes, module boundaries, and
rails-vs-knobs. Architecture-shaped; applies regardless of language.

The mode file at `plugins/jelly-guild/modes/domains/composition.md`
is the prose form of this same content. The two are manually synced
in v1; if you find drift, the mode is canonical.

## Criteria

1. **Variants achieved by composition, not configuration.** PASS:
   variants of a primitive are expressed by combining smaller
   primitives. FAIL: a unit has ≥10 boolean / variant / option
   props, OR a new variant landed by adding another switch inside
   an existing monolith rather than introducing or composing a
   sibling primitive.

2. **Single responsibility per unit.** PASS: each component,
   function, or module covers one concern; the name expresses one
   noun-phrase without "and." FAIL: a unit covers multiple distinct
   concerns (layout + data fetch + interaction + theming) such that
   its name would need a conjunction or fall back to a generic
   filler ("Card", "Manager", "Handler").

3. **Internal switches do not stand in for variants.** PASS: the
   unit's body is a linear read; branches model genuinely different
   modes, not different variants. FAIL: composite prop conditions
   (`if (foo && bar) { ... } else if (foo && !bar)`) carry variant
   information that two smaller primitives would express without
   branching.

4. **Primitives in the same family compose with each other.**
   PASS: primitives in a family can nest or sit beside each other
   without one's outer wrapping fighting another's layout. FAIL:
   the artifact forces consumers to "work around" a primitive's
   outer wrapper or layout to combine it with a sibling primitive.

5. **No god object or mega-handler.** PASS: each function or class
   covers a bounded set of operations; multi-action dispatch is
   routed to sub-handlers, not branched inline. FAIL: a single
   function/class/hook handles all operations for a domain via an
   internal switch.

6. **Coupling is explicit.** PASS: units interact via passed values
   or explicit context, with the composition graph visible in the
   call sites. FAIL: two or more units coordinate via shared
   mutable state (globals, context-mutated by both, or hidden side
   effects) such that adding a third coordinator requires reading
   the existing pair to understand.

7. **Rails + escape hatches both available.** PASS: the family has
   a high-abstraction preset for the common path AND a
   low-abstraction primitive available for the uncommon path. FAIL:
   the preset is the only API; consumers needing one knob outside
   the preset must fork the unit or wrap it externally with
   awkward overrides.

## Severity

- **Blocking** (gate the unit): criteria 1, 2, 4, 5 when violated
  by the diff itself; criterion 3 when branch count exceeds prop
  count; criterion 6 when coupling makes a third caller unsafe;
  criterion 7 when consumers must fork.
- **Advisory** (flag but do not gate): criteria 3 when branches
  stay below prop count; criterion 7 when consumers can wrap
  rather than fork; criteria 1 + 2 when the violation already
  exists in the codebase but the diff doesn't worsen it.

Diff-only worsening is the standard for advisory-vs-blocking:
flagging an existing antipattern that the diff merely sits
adjacent to is advisory; flagging an antipattern the diff
introduces or worsens is blocking.

## Evidence shape

For each finding, cite:

- **Path** to the file (and line range if narrower than a single
  component) where the antipattern manifests.
- **Pattern name** from the catalog (e.g. "configuration
  explosion", "internal switches as variant mechanism").
- **Why it fires** in one sentence — the concrete symptom, not the
  general definition.
- **Remedy** in one sentence — typically "decompose into N
  primitives" or "extract the X variant as a sibling primitive."
- For blocking findings: a one-line **diff-trace** that points at
  the specific lines in the artifact that introduce or worsen the
  pattern.

Good evidence is a concrete answer to "where in this artifact is
this pattern, and what would fix it?" — not an essay on composition
principles. Cite once, name the pattern, propose the fix, move on.
