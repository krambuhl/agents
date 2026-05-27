# Domain: performance

## Scope

The cost lens on a design: bundle size, the client/server boundary,
hydration cost, render cost, data-flow round trips, and asset weight.
The questions are about what a design will *cost* to render and ship,
asked before the code exists — server-vs-client placement, how much
hydrates, where the render hot paths are, whether the data flow
implies a waterfall.

This is a **design-phase domain** — it operates at the researcher and
planner phases, upstream of any unit contract. It has **no reviewer
cell**: framework-correctness on shipped code (a `'use client'` that
isn't needed, a raw `<img>`) is the `nextjs` domain's reviewer lane.
This domain shapes the contract before code is written; the `nextjs`
reviewer catches afterward what the recommendation didn't prevent.

## Concerns

- **Bundle size.** Does the design add a dependency, pull in a large
  library, or bring code into the client bundle that could live on the
  server? Quantify when possible — a 50KB dep matters; a 2KB one
  usually doesn't.
- **Client boundary placement.** Where does the client/server line
  live? Push it as deep as possible. The cheapest client component is
  the one that doesn't exist; the next cheapest is the one at the leaf
  of the tree, not the root. If a page's only interactive bit is one
  button, that button is the client component — not the page.
- **Hydration cost.** Client components hydrate; more client components
  mean more hydration. How many does the design introduce, and how
  heavy are they?
- **Render cost.** Does the design produce a render hot path — a list
  of thousands of items, a sketch loop at 60fps, a derived calculation
  re-running on every keystroke? Each calls for different mitigation
  (virtualization, `useMemo`, `requestIdleCallback`, off-thread work).
- **Data flow.** Round trips matter. A design requiring three
  sequential fetches to render is slower than one batched fetch. Note
  when a design implies a waterfall.
- **Asset weight.** Images, fonts, custom CSS. A 4MB hero image needs a
  different conversation than a 40KB one.

## Good patterns

- **Server-component first.** Pure-render UI with no interactivity
  stays on the server. The default is "server unless I can prove I need
  client features," not the reverse.
- **Push the client boundary deep.** Mark the smallest possible unit;
  a page-level `'use client'` forces the whole tree into the client
  bundle.
- **Measure over guess.** Flag what to measure after the unit ships
  (the bundle delta, the hydration timing) rather than optimizing on a
  hunch at design time.
- **Reach for the simpler tool first.** `useMemo`/`useCallback` add
  memoization machinery and aren't free; use them on evidence of a
  problem, not as defensive defaults.
- **Async work off-thread when it can be.** Respect existing
  off-main-thread patterns (e.g. p5.js sketches rendering off the React
  tree); don't introduce work that fights them.

## Vocabulary

- **client boundary** — the `'use client'`-marked edge that pulls a
  subtree into the client bundle and hydration
- **hydration cost** — the runtime price of making server-rendered
  markup interactive on the client
- **render hot path** — code that re-runs often enough (large list,
  animation loop, per-keystroke derive) to need mitigation
- **waterfall** — sequential dependent fetches that could be batched or
  parallelized
- **server-component-first** — defaulting UI to the server and opting
  into the client only for genuine interactivity
- **bundle delta** — the change in shipped client-bundle bytes a design
  introduces

## Cross-domain notes

- Phase scoping: this domain is **planner/researcher-only**. Its
  findings shape the contract; there is no performance reviewer (the
  `nextjs` reviewer covers framework-cost correctness on shipped code).
- Boundary with **react**: `react` owns the API shape (composition,
  prop API, state location); this domain owns the cost of that shape
  (bundle bytes, hydration timing). They overlap on a too-high client
  boundary — `react` leads on the architectural why,
  `performance` on the cost receipt.
- Boundary with **nextjs**: `nextjs` owns framework correctness on
  shipped code (`nextjs-use-client-vacuous`, `nextjs-img-not-image`).
  This domain operates upstream — "the design will end up with
  `'use client'` at this boundary; is that the right place given the
  cost?" — and leaves the after-the-fact catch to the `nextjs`
  reviewer.
- Boundary with **substrate**: overlaps on the per-session cost of
  substrate decisions (registry load, hot-path verbs, schema-change
  blast radius); defer to `substrate` on whether the cost lives in the
  right place by design, lead on measurement.
- Boundary with **a11y** / the **design-systems** recipe: rarely
  overlapping unless an a11y library or a token-resolution strategy
  carries real cost; add the cost note and defer the rest.
