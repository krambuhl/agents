# Domain: test-unit

## Scope

Unit-test soundness: whether a unit test is well-formed, isolated, and
meaningful. Covers the mock-vs-real boundary, assertion shape,
isolation and cleanup, parallel-safety, describe nesting, snapshot
abuse, and test naming. Tier-shaped — the concerns apply to any
unit-test runner (Vitest, Jest, Mocha, `bun:test`, `node:test`) — with
Vitest's idioms (`vi.mock` hoisting, `vi.useFakeTimers`,
`expect.assertions`, the parallel-by-default worker model) anchoring
the concrete detection patterns. When a future runner ships, the
tier-shaped entries port directly; tool-specific entries get a sibling,
not a forked domain.

This domain owns the **unit tier** — synchronous tests running in a
single JS process per worker. Integration-tier concerns (browser,
network, real fixtures, worker isolation at the runner level) live in
`test-integration`. The boundary is the tier: `*.test.ts` outside any
integration directory is this domain; `*.spec.ts` / `tests/integration/`
is `test-integration`.

This domain is **blocking by default**: a malformed unit test is a
liability that masks real failures, so most entries gate. The naming,
nesting, snapshot, and `expect.any` entries are advisory.

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

1. **Mock of the system under test** — `vi.mock('./module-being-tested')`
   or `vi.spyOn(SUT, 'method')` such that the test validates the mock's
   behavior rather than the SUT's. The test passes but verifies nothing
   about real code. Shows up as a `vi.mock(` path matching the non-test
   sibling file (`foo.test.ts` mocking `./foo`). Severity: **blocking**.
   Flag: `test-unit-mock-of-sut`.

2. **Missing `expect.assertions(N)` on async paths with branches** — an
   `async` test with conditional `expect(...)` calls (inside an `if`,
   `try`, `Promise.catch`) and no `expect.assertions(N)` at the top. If
   the assertion path is never reached, the test silently passes.
   Severity: **blocking** when conditional, **advisory** otherwise.
   Flag: `test-unit-no-assertion-count`.

3. **`describe` nesting > 2 levels deep** — `describe > describe >
   describe > it` makes test names hard to read and signals
   over-grouped tests. Severity: **advisory**. Flag:
   `test-unit-describe-too-deep`.

4. **Snapshot testing an implementation detail** — `toMatchSnapshot()`
   / `toMatchInlineSnapshot()` against a value encoding internal
   structure (a rendered HOC tree, an internal state shape) rather than
   user-visible behavior. The snapshot churns on every refactor;
   reviewers approve the diff without reading it. Severity: **advisory**
   (sometimes correct). Flag: `test-unit-snapshot-impl-detail`.

5. **Shared module state leak between tests** — a module-level mutable
   variable (counter, cache, registry) mutated by one test and read by
   another with no `beforeEach` reset; test-order dependency. Shows up
   as suite-only or alone-only failures. Severity: **blocking** when
   mutated, **advisory** when only read. Flag:
   `test-unit-shared-state-leak`.

6. **`vi.mock` hoisting violation** — `vi.mock(...)` placed inside
   `beforeEach`, `it`, `test`, or a conditional block. Vitest hoists
   top-level `vi.mock` above imports, but a programmatic call does not,
   so mocks don't apply to already-evaluated imports — a silently wrong
   test. Severity: **blocking**. Flag: `test-unit-vi-mock-not-hoisted`.

7. **Time-sensitive test without fake timers** — a test asserting
   against a timeout, debounce, throttle, or interval without
   `vi.useFakeTimers()` + `vi.advanceTimersByTime(...)`. Flaky on slow
   CI; slow always. Shows up where `setTimeout`/`setInterval`/
   `debounce`/`throttle` appear with no `vi.useFakeTimers`. Severity:
   **blocking**. Flag: `test-unit-no-fake-timers`.

8. **Loose assertion (`toBeTruthy` / `toBeFalsy`)** — accepts any
   truthy/falsy value including wrong-type values (`"unexpected
   string"`, `[]`, `{}`); almost always the intent is `toBe(true)` or a
   specific value. Severity: **advisory**. Flag: `test-unit-loose-truthy`.

9. **Test name does not describe behavior** — `it('works')`,
   `it('test 1')`, `it('foo')`: a label, not a sentence. Failures read
   as `it works` with no context. Severity: **advisory**. Flag:
   `test-unit-uninformative-name`.

10. **Repo-inconsistent test-name convention** — a file uses
    `it('should do X')` where sibling files use `it('does X')` (or vice
    versa). Either is fine; mixed within a project erodes pattern
    recognition. Severity: **advisory**. Flag:
    `test-unit-name-inconsistent-with-repo`.

11. **Parallel-unsafe access to a shared resource** — a hardcoded file
    path, port, or process name raced by two `*.test.ts` files. Vitest
    runs tests parallel-by-file, so a shared `tmp/foo.txt` corrupts.
    Severity: **blocking**. Flag: `test-unit-parallel-unsafe`.

12. **`expect.any(...)` overused** — `toEqual({ id: expect.any(String),
    name: expect.any(String) })` accepts any string, letting bugs
    through (an empty name passes). Fine for genuinely
    non-deterministic fields (a UUID); wrong for everything else.
    Severity: **advisory**. Flag: `test-unit-expect-any-overused`.

13. **`it.only` / `test.only` committed** — a focused test left in the
    codebase; the suite runs only one test. Detectable via Biome's
    `noFocusedTests`. Severity: **blocking**. Flag:
    `test-unit-focus-committed`.

14. **`it.skip` / `test.skip` committed without justification** — a
    skipped test with no comment explaining why and when it re-enables;
    silent coverage loss. Detectable via Biome's `noSkippedTests`.
    Severity: **blocking** without justification, **advisory** with.
    Flag: `test-unit-skip-committed`.

15. **Spy / mock without reset between tests** — `vi.spyOn(...)` or
    `vi.fn()` at module-or-`describe` scope, called by multiple tests,
    with no `mockClear` / `mockReset` / `mockRestore` in `beforeEach`.
    Call counts accumulate; later tests see earlier invocations.
    Severity: **blocking** when the assertion uses
    `toHaveBeenCalledTimes`. Flag: `test-unit-spy-not-reset`.

## Detection

Two signals plus inspection. `npm test` (Vitest, single non-watch
pass) is the runtime signal — a green run is necessary but not
sufficient, since most entries above produce green runs and require
inspection. `npm run lint` (Biome's `noFocusedTests` / `noSkippedTests`)
covers entries 13–14. The remaining entries are grep + read against the
in-scope `*.test.ts` files. This domain earns the `Bash(npm test:*)`
grant.

## Good patterns

- **Mock collaborators, never the SUT** — the unit under test runs for
  real; only its external dependencies are doubled.
- **`expect.assertions(N)` on branchy async tests** so an unreached
  assertion path fails loud instead of passing silently.
- **Shallow `describe` nesting** (≤ 2) and informative `it(...)`
  sentences that name the risk.
- **`vi.useFakeTimers()` for time-dependent logic**, never real delays.
- **Per-test isolation**: reset spies in `beforeEach`; no module-scope
  mutable state shared across tests; unique paths/ports per file.
- **Specific assertions** (`toBe`, `toEqual`, `toMatch`) over loose
  truthiness; `expect.any` reserved for genuinely non-deterministic
  fields.

## Vocabulary

- **system under test (SUT)** — the unit a test exists to verify; never
  mocked
- **hoisting** — Vitest lifting top-level `vi.mock` above imports; a
  programmatic call does not hoist
- **fake timers** — `vi.useFakeTimers()` + `advanceTimersByTime` for
  deterministic time-dependent tests
- **parallel-by-file** — Vitest's default: tests within a file run
  serially, files run in parallel
- **spy reset** — clearing accumulated mock call state between tests
- **loose assertion** — one that passes for many values (`toBeTruthy`)
  when the exact value is known

## Cross-domain notes

- Boundary with **test-integration**: the tier. This domain owns
  synchronous in-process `*.test.ts`; `test-integration` owns the
  browser/network/real-fixture `*.spec.ts` tier. "This unit test is
  actually exercising integration behavior" flags at the file boundary
  (wrong tier), not per-assertion.
- Phase split within this domain: at the **plan** phase the same
  knowledge advises which tier to choose and what to mock before tests
  exist; at the **reviewer** phase it catches what slipped through
  after. Same domain, different lifecycle position.
- Boundary with **naming**: this domain owns `it(...)` / `describe(...)`
  name shapes (entries 9–10); file-and-directory naming is `naming`'s.
- Boundary with **react**: React-API antipatterns in the code under
  test (or in a fixture component) are `react`'s lane; this domain
  flags the test's shape, not the production code's.
