# Domain: abstraction

## Scope

When to introduce an abstraction and when to inline. Covers
helper extraction, generic-vs-specific signatures, layer
boundaries, and the question of whether a proposed seam pays for
its existence. Architecture-shaped: applies regardless of
language.

This is the WHEN-to-abstract question. The DOES-it-compose
question lives in the `composition` domain; the naming of the
resulting abstraction lives in `naming`.

Abstractions are not free. Each one is a contract the codebase
will carry forever. The bar to introduce one is "we have ≥3
real uses today" — not "we might want to in the future."

## Concerns

- **Three similar lines is fine.** Repetition is not a bug.
  Three near-duplicate blocks that diverge in the fourth are
  better than a parameterized abstraction that has to handle the
  divergence.
- **Premature abstraction is worse than duplication.** A wrong
  abstraction is harder to refactor than three concrete
  duplicates. Concrete code is cheap to delete; abstractions
  accumulate.
- **Speculative generality is a tax.** Parameters added "in case
  we need them" without a real caller are dead code that
  obscures the live caller's path.
- **Abstraction earns its keep with ≥3 real callers.** Two
  callers is a coincidence; three is a pattern. Wait for the
  third before extracting.
- **Layered abstractions need a reason.** Each layer between the
  caller and the work adds reading cost. If a wrapper passes
  arguments straight through without transformation, it's
  probably a layer that shouldn't exist.
- **The abstraction's name predicts its callers.** If naming the
  abstraction is hard, the abstraction may be premature OR the
  callers don't share a real pattern.

## Antipattern catalog

1. **Single-use abstraction.** A helper, hook, component, or
   module exists with exactly one caller. Symptom: a function
   defined adjacent to its sole caller, with no apparent reason
   for the indirection. Severity: blocking when introduced;
   advisory when the diff merely lives in code that already has
   one.

2. **Speculative parameter.** A function parameter exists for a
   future caller that does not yet exist; all current callers
   pass the default. Symptom: `function foo(x, y = 'default') {
   ... }` where every caller passes only `x`. Severity:
   blocking when the parameter is introduced without a caller;
   advisory when removing the parameter would be local cleanup.

3. **Over-DRY.** Two or three blocks that look similar but model
   different concerns get forced into one abstraction with a
   `mode: 'A' | 'B'` parameter that gates significant behavioral
   divergence. Symptom: an abstraction's body is mostly `if mode
   === A` / `else if mode === B`. Severity: blocking — better to
   keep the duplicates than carry a misaligned abstraction.

4. **Wrapper without value.** A function or component wraps
   another and forwards arguments without transformation. Adds a
   layer of indirection without changing behavior. Symptom: `const
   X = (props) => <Y {...props} />`. Severity: blocking when the
   wrapper has no rename + no behavior + no scope effect;
   advisory when the wrapper exists to rename for clarity or
   compose with default props.

5. **Half-finished abstraction.** An abstraction handles some of
   its callers but the rest still inline the original pattern.
   Symptom: three call sites use `helper(...)`, four other call
   sites inline the same logic. Severity: blocking when the
   half-finishedness is the diff's contribution; advisory when
   inherited.

6. **Layered indirection without transformation.** Three layers
   pass the same value with no transformation. Symptom: the call
   stack reads `caller → wrapperA → wrapperB → realWork`,
   wrapperA and wrapperB just forwarding. Severity: blocking
   when introduced; advisory when inherited.

7. **Premature generic.** A function takes a generic type
   parameter or a polymorphic argument that has exactly one
   concrete instantiation in the codebase. Symptom: `<T>` in
   signatures with one call site that only ever passes
   `string`. Severity: advisory — premature generics are noise
   but rarely actively harmful.

## Good patterns

- **Three-similar-lines rule.** Repetition until ≥3 real
  patterns emerge. The fourth occurrence is the trigger to
  abstract, not the second.
- **Inline > extract for single use.** A 12-line block used
  once stays inline. A 12-line block used four times can
  become `extractedBlock()` with a named purpose.
- **Concrete first, parameterize later.** Write the specific
  version. When the second caller arrives, decide whether to
  duplicate or parameterize. Parameterize only when the second
  caller is genuinely the SAME thing with one variation.
- **Abstractions justify themselves with names.** A good
  abstraction has a one-noun-phrase name that fits all its
  callers. If the name is hedged ("Handler", "Manager",
  "Utility"), the abstraction is probably premature.
- **Boundaries match data flow.** Abstractions sit at points
  where data shape changes; they don't sit at arbitrary call
  depth.

## Vocabulary

Use this vocabulary when describing abstraction findings:

- **single-use abstraction** — a helper with exactly one caller
- **speculative parameter** — a parameter introduced for a
  hypothetical future caller
- **rule of three** — abstract on the third real occurrence,
  not earlier
- **inline > extract** — for single-use code, the inlined form
  is preferred
- **wrapper without value** — a layer that forwards arguments
  without transformation
- **half-finished abstraction** — abstraction adopted by some
  callers but not all
- **premature generic** — generic type or polymorphism with one
  concrete use

## Cross-domain notes

- Overlaps with **composition**: composition is about HOW units
  combine; abstraction is about WHETHER the unit should exist.
  A composable primitive that fails the rule-of-three test is
  still a premature abstraction.
- Overlaps with **naming**: a difficult name signals premature
  abstraction. If the name has to be generic ("Helper",
  "Util") to fit all callers, the callers don't share enough
  to justify the seam.
- Less overlap with **testing**: an over-abstracted helper is
  harder to test in isolation (because mocking its
  parameterization explodes), but the testing concern is
  downstream of the abstraction concern.
- Less overlap with **a11y**: a11y patterns are concrete; they
  rarely interact with abstraction-vs-inline choices.
