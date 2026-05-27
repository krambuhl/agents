# Domain: react

## Scope

Framework-agnostic React correctness: whether an artifact is sound
under React's rendering model, hooks contract, and referential-identity
expectations. Covers the Hooks rules, state mutation, `useEffect`
misuse, refs touched in render, list keys, context value identity, and
memo-defeating prop shapes — the patterns that would be just as wrong
in a Vite or CRA app as under Next.js.

React-flavored (the concrete patterns target React + JSX), but the
underlying concerns — pure render, stable identity, effects for side
effects not derivation — are the rendering-model invariants any
React-like runtime shares. Framework-specific concerns (Server/Client
boundary, `<Image>`, routing) live in the `nextjs` domain.

This domain is **advisory by default**: its findings list for the
reviewer's eye but do not gate a unit on their own. Escalate to
blocking only with explicit, in-diff evidence of real runtime breakage
— a crash, a hooks-order break across renders, state mutation leaking
across instances.

## Concerns

- **The hooks-order contract.** Hooks run in the same order on every
  render. Anything that makes the order conditional (a hook under an
  `if`, in a loop, after an early return) corrupts the hooks list on
  the next divergent render.
- **Render is pure.** The function body computes UI from props and
  state without side effects. Touching refs, mutating state, or
  reading the clock during render breaks purity and misbehaves under
  concurrent / Strict-Mode double-render.
- **Referential identity drives re-renders.** React compares by
  reference. New object/array/function identities each render defeat
  memoization and re-render context consumers needlessly.
- **State is immutable.** Updates produce new references; in-place
  mutation triggers no re-render and corrupts shared references.
- **Effects are for side effects, not derived values.** A value
  computable from props/state should be computed inline (or memoized),
  not synced through an extra render via `useEffect` + `setState`.

## Antipattern catalog

1. **Hooks called conditionally, in loops, or after early returns** —
   a `use*` hook nested under an `if`, inside `.map(`, or after a
   `return` early-exit in the component body. Breaks the hooks-order
   contract; a later render that takes a different branch desyncs the
   hooks list and corrupts state. Shows up as
   `^\s*(if|for|while|switch).*\{[^}]*use[A-Z]`, or a `return` before a
   `use*` call in the same function. Severity: **advisory** (escalate
   to blocking if hooks demonstrably reorder across paths). Flag:
   `react-hooks-conditional-call`.

2. **`useEffect` with missing or stale dependency array** — the effect
   references a prop, state, or computed value absent from its deps, or
   uses `[]` while closing over a changing value. Stale-closure bug:
   the effect runs against an out-of-date snapshot. Shows up at each
   `useEffect(` whose closure diverges from its deps array. Severity:
   **advisory**. Flag: `react-effect-stale-deps`.

3. **Direct state mutation** — `state.push(...)`, `state.x = value`,
   `state.items.sort()` applied to a `useState` value or a prop. React
   compares by reference, so a mutated-in-place value triggers no
   re-render and corrupts shared references across consumers. Shows up
   as `\.(push|pop|shift|unshift|splice|sort|reverse)\(` or
   `state\.\w+\s*=` inside component files. Severity: **advisory**
   (escalate to blocking on demonstrated cross-instance corruption).
   Flag: `react-state-mutation`.

4. **Missing `key`, or a non-stable key, on rendered list items** —
   `arr.map(item => <Foo />)` with no `key`, or `key={i}` when `arr`
   can reorder, insert at the head, or remove. React falls back to
   index reconciliation, which corrupts component state on reorder
   (form values bleed across rows). Shows up as `.map(` returning JSX
   without a stable `key=`. Severity: **advisory**. Flag:
   `react-list-key-missing-or-unstable`.

5. **`useEffect` for derived state** — an effect whose only job is
   `setX(computeFromProps(props.y))`. The value can be computed inline
   or via `useMemo` without an extra render cycle; the effect wastes a
   render, adds a one-frame visual lag, and obscures that the value is
   purely derived. Shows up as a `useEffect` body whose sole side
   effect is a `setState` with a synchronous argument computed from
   props/state. Severity: **advisory**. Flag:
   `react-effect-derived-state`.

6. **Ref accessed or written during render** — `ref.current` read or
   assigned at the top level of the function body (outside an event
   handler, effect, callback, or `useImperativeHandle`). Render is
   meant to be pure; touching refs there causes layout thrash in
   concurrent mode and inconsistent behavior under Strict-Mode
   double-render. Shows up as `.current` references not inside a
   callback. Severity: **advisory**. Flag: `react-ref-in-render`.

7. **Context `value=` passed an inline object or array literal** —
   `<MyContext.Provider value={{ foo, bar }}>` or `value={[a, b]}`. A
   new reference every render; every consumer re-renders
   unconditionally even when no observable value changed. Shows up as
   `.Provider` with an inline `{{` object or `{[` array value.
   Severity: **advisory** (escalate to blocking if it demonstrably
   re-renders an expensive subtree every parent render). Flag:
   `react-context-unstable-value`.

8. **Anonymous function or inline object as a prop to a
   `React.memo`-wrapped child** — `<MemoChild onClick={() => ...} />`
   or `<MemoChild config={{ ... }} />`. Defeats `memo`'s
   referential-equality check; the child re-renders every time
   regardless of the wrapper. Shows up where a `memo(`-wrapped
   component is passed an inline function/object prop. Severity:
   **advisory** (performance smell — never block on this alone). Flag:
   `react-memo-unstable-prop`.

## Good patterns

- **Hooks at the top level, unconditionally.** Every `use*` call runs
  on every render in the same order; branch *inside* the hook, not
  around it.
- **Complete dependency arrays.** Every value the effect closes over
  appears in its deps; an empty array means the effect genuinely
  depends on nothing that changes.
- **Immutable state updates.** Produce a new object/array
  (`setItems([...items, next])`), never mutate in place.
- **Stable keys from stable identity.** Key list items by a stable id,
  not the array index, whenever the list can reorder or change length.
- **Derive, don't sync.** Compute derived values inline or with
  `useMemo`; reserve `useEffect` for real side effects (subscriptions,
  imperative DOM, network).
- **Refs only in handlers and effects.** Read/write `ref.current` from
  event handlers, effects, and callbacks — never the render body.
- **Stable context values.** Memoize the provider's `value` so
  consumers re-render only on real change.
- **Stable props to memoized children.** Hoist or `useCallback` /
  `useMemo` the functions and objects passed to `memo`-wrapped
  components.

## Vocabulary

- **hooks-order contract** — hooks must run in the same order every
  render
- **stale closure** — an effect/callback capturing an out-of-date
  value because it is missing from the deps
- **referential identity** — React's reference comparison that drives
  re-render and memoization decisions
- **reconciliation key** — the `key` React uses to match list items
  across renders
- **derived state** — a value computable from existing props/state,
  which should not be stored or synced
- **render purity** — the rule that a component's render body is free
  of side effects

## Cross-domain notes

- Boundary with **nextjs**: both may inspect a React/JSX artifact.
  `nextjs` owns `'use client'` correctness, the Server/Client boundary,
  `<Image>` / `<Link>` / metadata, Pages-Router APIs in App-Router
  files, and hydration-mismatch sources. `react` owns the
  framework-agnostic patterns above — the ones equally wrong in a
  non-Next React project. When both see the same line, they are
  looking at different concerns.
- Overlaps with **composition**: a monolithic component (composition)
  often also carries hook and state-mutation smells (react). The
  composition lens asks "should this be smaller units?"; react asks
  "is the rendering model used correctly within the unit?"
- Less overlap with **a11y**: a11y is markup + behavior; react is the
  rendering model. They co-occur on interactive components but flag
  different things.
