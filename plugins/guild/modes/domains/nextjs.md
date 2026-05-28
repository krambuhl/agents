# Domain: nextjs

## Scope

Next.js App-Router correctness: the `'use client'` directive (both
directions), the Server/Client component boundary, the image and link
primitives, route-data fetching, the metadata API, hydration-mismatch
sources, and framework-config safety flags. Covers `.tsx`/`.jsx` under
`app/` and `components/`, plus `next.config.{js,ts,mjs}`.

This domain owns framework-specific concerns — the patterns that are
wrong *because* it is Next.js App Router. The framework-agnostic React
patterns (hooks rules, state mutation, refs, keys, context identity)
live in the `react` domain.

This domain is **blocking by default**: most entries are correctness
bugs that fail the build or break hydration, and they gate the unit. A
few performance/refactor entries are advisory (noted per entry).

## Detection

A static analyzer covers the most mechanical entries:
`npm run lint:nextjs` runs `scripts/check-nextjs.ts`, a TypeScript-AST
walker over `.tsx`/`.jsx` in `app/`, `components/`, and `sketches/`. It
emits `<file>:<line>: <code>: <message>` and covers catalog entries 1–6
(use-client correctness, the two directives, `<img>`, `<a href>`,
Pages-Router APIs, `<head>` JSX); `--json` emits findings as an array.
This analyzer is why the `nextjs` domain earns the
`Bash(npm run lint:nextjs:*)` grant. Entries 7–15 are detected by
inspection — the hydration, env-var, boundary, config, and DOM-access
patterns the AST walker does not cover.

## Concerns

- **The Server/Client boundary is explicit and minimal.** Files that
  use client features carry `'use client'`; files that don't, don't;
  and the boundary sits as low in the tree as possible.
- **Use the framework primitives.** `<Image>` over `<img>`, `<Link>`
  over raw internal `<a>`, the metadata API over `<head>` JSX — each
  unlocks an optimization or a correctness guarantee the raw element
  loses.
- **App Router, not Pages Router.** Pages-Router data APIs and `<head>`
  patterns don't work under `app/`.
- **Render output is deterministic across server and client.** Clock,
  randomness, and pre-mount DOM access produce hydration mismatches.
- **Config doesn't silently weaken safety.** Build-error and
  lint-bypass escape hatches hide real failures.

## Antipattern catalog

1. **`'use client'` missing on a file using client features** — uses
   hooks (`/^use[A-Z]/`), JSX event handlers (`/^on[A-Z]/`), or browser
   globals (`window`, `document`, `localStorage`, `navigator`) without
   `'use client'`. App Router treats unmarked files as Server
   Components; this throws at build or runtime. Severity: **blocking**.
   Flag: `nextjs-use-client-missing`.

2. **Vacuous `'use client'` directive** — declares `'use client'` but
   uses no client features; wastes a client boundary and ships unused
   runtime code. (p5-sketch components are exempt — their canvas
   rendering needs client execution even without direct browser-API
   references.) Severity: **advisory**. Flag: `nextjs-use-client-vacuous`.

3. **`<img>` instead of `<Image>` from next/image** — raw `<img>` in
   `app/` or `components/` skips image optimization (responsive sizing,
   lazy loading, format conversion). Slower LCP, more bandwidth.
   Severity: **blocking** (sketches exempt by scope). Flag:
   `nextjs-img-not-image`.

4. **Raw `<a href="/...">` for internal navigation** — a plain anchor
   forces a full-document reload instead of client-side routing; lost
   focus, scroll, and state. Severity: **blocking**. Flag:
   `nextjs-anchor-not-link`.

5. **`getServerSideProps` / `getStaticProps` in App-Router files** —
   Pages-Router APIs that don't work under `app/`; silently no-op or
   fail the build by version. Severity: **blocking**. Flag:
   `nextjs-pages-router-api`.

6. **`<head>` JSX in App-Router layouts/pages** — bypasses the metadata
   API; tags may not dedupe, may render twice, don't join Next's
   metadata merge. Severity: **blocking**. Flag:
   `nextjs-head-not-metadata`.

7. **Hydration-mismatch source in the render path** — `Math.random()`,
   `Date.now()`, `new Date()` called during render produces different
   server vs. client output. Visible hydration warnings. Severity:
   **blocking**. Flag: `nextjs-hydration-mismatch`.

8. **Hardcoded `process.env` access without `NEXT_PUBLIC_` in client
   code** — `process.env.MY_SECRET` in a `'use client'` file; env vars
   without the prefix are server-only and resolve to `undefined` in
   client code. Severity: **blocking**. Flag: `nextjs-env-not-public`.

9. **Server-only API without `'use server'` in a Server Action
   handler** — `cookies()`, `headers()`, or `redirect()` from
   `next/headers` / `next/navigation` in a form-action handler missing
   the directive. Severity: **blocking**. Flag:
   `nextjs-server-action-missing-directive`.

10. **`dynamic({ ssr: false })` in a Server Component** —
    `next/dynamic` with `ssr: false` is client-only and requires the
    calling file to be `'use client'`. Severity: **blocking**. Flag:
    `nextjs-dynamic-ssr-false-server`.

11. **Client boundary placed too high in the tree** — `'use client'`
    on a top-level `layout`/`page` when only a leaf needs it; pushes
    the whole subtree to the client, defeating the Server Component
    model. Severity: **advisory** (sometimes necessary). Flag:
    `nextjs-client-boundary-too-high`.

12. **`next.config` unsafe escape-hatch flag** — `reactStrictMode:
    false`, `eslint.ignoreDuringBuilds: true`,
    `typescript.ignoreBuildErrors: true` and kin silently weaken
    safety. Severity: **blocking** for the build-error / lint-bypass
    flags (they hide real failures); **advisory** for strict-mode.
    Flag: `nextjs-config-unsafe-flag`.

13. **Server Component `fetch()` without explicit cache control** — a
    `fetch()` in a non-`'use client'` file with no `cache` or
    `next.revalidate`; default cache behavior shifts across major
    versions, so explicit annotation makes intent durable. Severity:
    **advisory**. Flag: `nextjs-fetch-no-cache-policy`.

14. **`<Image>` missing a `priority`/`loading` hint above the fold** —
    correct `<Image>` use but no `priority` on the LCP element; hurts
    Core Web Vitals. Severity: **advisory**. Flag:
    `nextjs-image-no-priority`.

15. **Direct DOM mutation in a Server-Component-reachable render path**
    — `document.createElement`, `window.scrollTo`, etc. at the top of a
    function body (before mount) rather than inside `useEffect`, in a
    path that may execute server-side or pre-hydration. Runtime crash
    on first render. Severity: **blocking**. Flag: `nextjs-dom-in-render`.

## Good patterns

- **`'use client'` exactly where client features are used**, as low in
  the tree as possible; server components by default everywhere else.
- **Framework primitives**: `<Image>`, `<Link>`, the metadata API.
- **App-Router data patterns** (Server Component `fetch` with explicit
  cache/revalidate; route handlers) over Pages-Router APIs.
- **Deterministic render**: defer clock/randomness/DOM access to
  effects, so server and client output match.
- **Honest config**: leave strict mode on and build/lint gates intact.

## Vocabulary

- **Server/Client boundary** — the `'use client'`-marked edge between
  server-rendered and client-hydrated component trees
- **hydration mismatch** — server and client producing different
  render output, warned and patched at runtime
- **client boundary too high** — a `'use client'` directive that
  pushes more of the tree to the client than necessary
- **metadata API** — Next's `metadata` export, the supported
  replacement for `<head>` JSX
- **Pages-Router API** — `getServerSideProps`/`getStaticProps`/`<head>`
  patterns that don't work under `app/`

## Cross-domain notes

- Boundary with **react**: `react` owns the framework-agnostic
  rendering-model patterns (hooks, state, refs, keys, context, memo);
  this domain owns the Next-specific ones (use-client, the
  Server/Client boundary, `<Image>`/`<Link>`/metadata, Pages-Router
  APIs, hydration). The same `.tsx` file is often in both lanes for
  different reasons.
- Boundary with **tokens**: hydration mismatches from token-derived
  runtime values are a `nextjs` concern; whether a value is a literal
  vs. a token is a `tokens` concern.
- Less overlap with **a11y**: `<Image>`/`<Link>` carry a11y
  implications, but the accessible-name / focus / semantics concerns
  stay in the `a11y` lane.
