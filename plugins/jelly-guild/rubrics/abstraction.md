# Rubric: abstraction

## Scope

Score the artifact's choices about WHEN to introduce an
abstraction versus when to inline. Covers helpers, generic
signatures, layer boundaries, and whether a proposed seam pays
for its existence. Architecture-shaped; applies regardless of
language.

The mode file at `plugins/jelly-guild/modes/domains/abstraction.md`
is the prose form of this same content. The two are manually
synced in v1; if you find drift, the mode is canonical.

Abstractions are contracts the codebase carries forever. The bar
to introduce one is real-callers-today, not might-need-later.

## Criteria

1. **No single-use abstraction introduced.** PASS: every helper,
   hook, component, or module the diff introduces has ≥3 real
   callers OR is a known-future-shared primitive at a planned
   layer boundary. FAIL: the diff adds a function/hook/component
   with exactly one caller and no documented intent for
   additional callers.

2. **No speculative parameter introduced.** PASS: every parameter
   has at least one caller passing a non-default value. FAIL: the
   diff adds a parameter that all current callers leave at
   default ("future-proofing").

3. **No over-DRY abstraction.** PASS: an abstraction's body
   describes one cohesive thing; mode-parameters select rare
   variants, not significant behavioral branches. FAIL: an
   abstraction's body is dominated by `if mode === A / else if
   mode === B` such that two concrete duplicates would read
   better.

4. **No wrapper without value.** PASS: every wrapping layer
   transforms arguments, applies defaults, renames, or composes
   behavior. FAIL: a wrapper passes arguments straight through to
   another function with no transformation or rename.

5. **No half-finished abstraction.** PASS: an abstraction's
   intended callers all use it; inline copies of the same
   pattern do not coexist with the abstraction. FAIL: the diff
   adds an abstraction that some call sites adopt while other
   call sites with the same pattern stay inline (or vice
   versa).

6. **No layered indirection without transformation.** PASS: the
   call stack for a given operation has the minimum depth needed
   to express the data-shape changes and behavioral seams. FAIL:
   the artifact introduces ≥3 layers of pass-through wrappers
   with no transformation at any layer.

7. **Generics and polymorphism justified by usage.** PASS:
   generic type parameters and polymorphic signatures have ≥2
   concrete instantiations in the codebase. FAIL: a generic
   parameter exists with one concrete instantiation (premature
   generic).

8. **Abstraction names fit all callers.** PASS: each new
   abstraction has a concrete noun-or-verb-phrase name that
   describes what it IS or DOES across all callers. FAIL: the
   abstraction's name is generic filler ("Helper", "Manager",
   "Utility", "Wrapper") because no narrower term fits its
   callers.

## Severity

- **Blocking** (gate the unit): criteria 1, 2, 3, 4, 5, 6, 8
  when the diff itself introduces the antipattern. Criterion 1
  blocks when the abstraction is new in this diff and has one
  caller; advisory when the abstraction predates the diff.
  Criterion 4 blocks when the wrapper adds no behavior; advisory
  when the wrapper has a clear rename purpose.
- **Advisory** (flag but do not gate): criterion 7 (premature
  generic — noise but rarely harmful); any criterion where the
  antipattern existed before the diff and the diff merely sits
  adjacent. The "diff-introduces-it" test is the standard.

Premature abstraction is harder to refactor than duplication.
When in doubt, block.

## Evidence shape

For each finding, cite:

- **Path** to the abstraction (file + line range) AND the path
  to its caller(s). Caller count is load-bearing for criterion
  1 and 7.
- **Pattern name** from the catalog (e.g. "single-use
  abstraction", "speculative parameter", "wrapper without
  value", "over-DRY").
- **Caller count** as evidence (e.g. "1 caller", "3 callers
  using mode='A', 2 callers using mode='B' — concerns diverge").
- **Why it fires** in one sentence — the concrete symptom.
- **Remedy** in one sentence — typically "inline back to the
  caller", "remove the parameter", "split into two
  abstractions", "remove the wrapper layer", or "wait for the
  third caller before extracting."

Good evidence is a caller-count claim plus a one-sentence
recommendation. Not "abstractions are expensive." Cite the
caller graph, name the antipattern, propose the inline-or-split.
