# Domain: test-integration

## Scope

Integration-test soundness: whether an integration test is well-formed,
isolated, and durable. Covers fixture leakage, parallel-test isolation,
retry policy, locator brittleness, screenshot/snapshot drift, auth-flow
isolation, and hardcoded waits. Tier-shaped — the concerns apply to any
integration-test runner (Playwright, Cypress, WebdriverIO) — with
Playwright's idioms (`test.extend`, worker-scoped fixtures, `test.use`,
auto-waiting `expect`) anchoring the concrete detection patterns. When a
future runner ships, the tier-shaped entries port directly;
tool-specific entries get a sibling, not a forked domain.

This domain owns the **integration tier** — tests that drive a browser
or network surface, with real fixtures and worker-parallel execution.
Synchronous in-process concerns (mock hoisting, fake timers, spy reset)
live in `test-unit`. The boundary is the tier: `*.spec.ts` /
`tests/integration/` / `e2e/` is this domain; `*.test.ts` outside those
is `test-unit`.

This domain is **blocking by default**: a flaky or leaky integration
test poisons CI signal, so most entries gate. The locator, retry,
auth-duplication, breadth, and snapshot-threshold entries are advisory.

## Concerns

These tier-agnostic principles govern both the unit and integration
tiers; they read identically in `test-unit` and `test-integration`.

- **Test the boundary, not the implementation.** Assertions describe
  what callers can observe (return values, rendered output, side
  effects), not internal state. A refactor that preserves behavior
  should preserve the tests.
- **Choose the cheapest reliable signal.** Unit > integration > e2e in
  cost. Pick the lowest tier that genuinely defends against the risk.
  An e2e test for "this pure function returns the right number" is
  overkill.
- **Mock at the right boundary.** Mock external systems (network, time,
  randomness, third-party APIs) and your own module's collaborators
  that aren't the unit under test. Do not mock the unit under test.
- **Test names describe the risk.** "renders without crashing" is not a
  test; "renders fallback when fetch returns 404" is. The name names
  the failure mode the test would catch.
- **Fixtures must isolate.** No test mutates state another test depends
  on. Parallel-safe by default; opt in to shared state only when
  explicitly serializing.
- **Assertions are specific.** `expect(result).toBe(42)` over
  `expect(result).toBeTruthy()` when the value is known. Specific
  assertions catch regressions; loose assertions hide them.

## Antipattern catalog

1. **Fixture leakage across tests** — a test mutates a fixture (DB row,
   file, auth cookie) without restoring it in `afterEach` or via
   fixture teardown; the next test sees mutated state and failures
   depend on order. Shows up as `beforeEach`/`beforeAll` setup without
   paired `afterEach`/`afterAll` cleanup. Severity: **blocking**. Flag:
   `test-integration-fixture-leak`.

2. **Hardcoded wait** — `page.waitForTimeout(N)` or any explicit sleep
   instead of waiting for the condition the test cares about. Flaky on
   slow CI, slow on fast CI. Flag every occurrence except inside
   `expect.poll` retry blocks. Severity: **blocking**. Flag:
   `test-integration-hardcoded-wait`.

3. **Selector brittleness** — a locator depending on CSS class names,
   deep DOM structure, or `nth-child` indexing instead of accessible
   role + name (`getByRole('button', { name: 'Save' })`), test IDs, or
   visible text. Breaks on every refactor. Shows up as
   `page.locator('.foo')` / `'#bar'` CSS-selector locators. Severity:
   **advisory**. Flag: `test-integration-brittle-locator`.

4. **Element existence used as a visibility check** —
   `expect(locator).toBeAttached()` where `.toBeVisible()` was intended;
   `toBeAttached` finds detached nodes the user can't interact with.
   Severity: **blocking**. Flag: `test-integration-attached-not-visible`.

5. **Parallel-unsafe shared state** — tests write to a shared resource
   (a single DB row by fixed id, a filesystem path, a port, an auth
   user) without per-worker or per-test scoping. Playwright's
   worker-parallel mode then fails non-deterministically. Shows up in
   fixture scope (`test.use`, `test.extend` worker- vs test-scope) and
   hardcoded id/port/path constants. Severity: **blocking**. Flag:
   `test-integration-parallel-unsafe`.

6. **Auth setup duplicated per test instead of stored state** — every
   test logs in through the UI rather than reusing a
   `storageState`-saved session or a per-worker fixture; 30+ seconds
   per test and the login flow re-tested in every unrelated spec.
   Severity: **advisory** for small suites, **blocking** for > 5
   occurrences in one file. Flag: `test-integration-auth-not-stored`.

7. **Retry policy masking a flaky assertion vs flaky setup** — config
   retries the whole test, hiding which part is flaky. Timing-sensitive
   assertions should use `expect.poll` / auto-retrying matchers; flaky
   setup should be fixed; top-level retries should be zero for green CI.
   Severity: **advisory**. Flag: `test-integration-retry-masks-flake`.

8. **`test.only` / `test.skip` committed** — focused (suite runs one
   test) or skipped (silent coverage loss) tests left in the codebase.
   Detectable via Biome's `noFocusedTests` / `noSkippedTests`. Severity:
   **blocking**. Flag: `test-integration-focus-or-skip-committed`.

9. **Hardcoded URLs / ports** — `page.goto('http://localhost:3000/foo')`
   instead of `page.goto('/foo')` with a `baseURL` in config; breaks on
   a port change and can't run against staging. Severity: **blocking**.
   Flag: `test-integration-hardcoded-url`.

10. **Network mock without restore** — `page.route(...)` not paired
    with `page.unroute` / `route.fallback()` in teardown; a route
    registered in test A fires during test B's calls. Severity:
    **blocking**. Flag: `test-integration-mock-not-restored`.

11. **Storage state crossing worker boundaries** —
    `test.use({ storageState: <path> })` with a single shared file
    workers race to read/write; the teardown write-back can corrupt it.
    Shows up in `playwright.config.*` / `globalSetup` / `globalTeardown`.
    Severity: **blocking**. Flag: `test-integration-storage-state-race`.

12. **Test doing too many user flows** — one `test(...)` block
    exercises 4+ distinct flows (login + create + edit + share +
    delete); a failure means one of five things broke and debugging
    drags. Shows up as > 8 distinct `expect(...)` calls spanning > 3
    navigations. Severity: **advisory**. Flag:
    `test-integration-test-too-broad`.

13. **Time-sensitive assertion without auto-wait** — asserting against
    an asynchronously-changing value via raw
    `expect(await locator.textContent()).toBe(...)` instead of
    `expect(locator).toHaveText(...)` (which auto-polls). The raw form
    snapshots one moment. Severity: **blocking**. Flag:
    `test-integration-no-auto-wait`.

14. **Loose snapshot threshold** — a visual snapshot taken with
    `maxDiffPixelRatio` very high (> 0.05) or `threshold` near 1.0; the
    assertion accepts almost any visual state. Severity: **advisory**.
    Flag: `test-integration-snapshot-too-loose`.

15. **Worker-scoped fixture mutating a shared resource** — a
    `{ scope: 'worker' }` fixture that modifies the filesystem,
    database, or an external service in a way that persists across the
    worker's tests; setup/teardown run once but in-between tests see
    each other's mutations. Severity: **blocking**. Flag:
    `test-integration-worker-fixture-mutation`.

## Detection

A static signal plus inspection, with an opt-in runtime signal.
`npm run lint` (Biome's `noFocusedTests` / `noSkippedTests`) covers
entry 8; the rest are grep + read against the in-scope `*.spec.ts` /
`tests/integration/` / `e2e/` files and `playwright.config.*` /
fixture files. `npm run test:e2e` (a storybook build + full Playwright
run) is the runtime signal — heavy, so reserved for when an artifact
actually authored or changed an integration spec. This domain earns the
`Bash(npm run test:e2e:*)` grant. (Files under `tests/e2e/a11y/` are
the `a11y` domain's lane, not this one.)

## Good patterns

- **Fixture teardown pairs every setup** — `afterEach`/`afterAll` or
  fixture-scoped cleanup restores any mutated state.
- **Wait for conditions, not clocks** — auto-retrying matchers
  (`toHaveText`, `expect.poll`), never `waitForTimeout`.
- **Role/text/test-id locators** over CSS-structure selectors.
- **Per-worker isolation** — per-worker `storageState`, unique
  ids/ports/paths; worker-scoped fixtures don't mutate shared
  resources without per-test reset.
- **Stored auth state** reused across tests instead of per-test UI
  login.
- **`baseURL` + relative `goto`** so the suite runs against any
  environment.
- **Focused, single-flow tests** with tight snapshot thresholds.

## Vocabulary

- **fixture** — test setup state (DB row, file, auth session) that must
  be torn down to isolate
- **auto-wait** — Playwright matchers that poll until the assertion
  passes or times out, vs a one-moment snapshot
- **storage state** — a saved auth/session file reused across tests;
  raced if shared across workers
- **worker-scoped fixture** — setup run once per worker; mutations
  persist across that worker's tests unless reset
- **locator** — the selector strategy for an element; brittle when tied
  to CSS structure, durable when tied to role/text/test-id
- **flake** — a test whose result depends on timing, order, or shared
  state

## Cross-domain notes

- Boundary with **test-unit**: the tier. This domain owns the
  browser/network/real-fixture `*.spec.ts` tier; `test-unit` owns the
  synchronous in-process `*.test.ts` tier. "This integration test is
  exercising logic a unit test would defend just as well" flags at the
  file boundary (wrong tier), not per-assertion.
- Phase split within this domain: at the **planner** phase the same
  knowledge advises tier choice and fixture shape before tests exist;
  at the **reviewer** phase it catches what slipped through after. Same
  domain, different lifecycle position.
- Boundary with **a11y**: a11y assertions in an integration test
  (axe-core rule violations, focus order, screen-reader names) are
  `a11y`'s lane — including the `tests/e2e/a11y/` subtree. This domain
  flags the test's shape (fixture leak, hardcoded wait, brittle
  locator), not its a11y assertions or omissions.
- Boundary with **react**: React-API antipatterns in a fixture or
  harness component are `react`'s lane; this domain flags the test's
  shape, not the production/fixture code's.
