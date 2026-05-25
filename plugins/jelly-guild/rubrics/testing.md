# Rubric: testing

## Scope

Score the artifact's test SHAPE: what's tested, what's mocked,
at what tier, with what assertions. Architecture-shaped; applies
regardless of language and test framework.

The mode file at `plugins/jelly-guild/modes/domains/testing.md`
is the prose form of this same content. The two are manually
synced in v1; if you find drift, the mode is canonical.

A passing test that asserts the wrong thing is worse than no
test. Pass-rate is not the signal; test-shape is.

## Criteria

1. **Tests assert on the boundary, not implementation.** PASS:
   assertions check observable outputs (return values, rendered
   DOM, network calls, side effects). FAIL: assertions check
   internal state, private functions, or implementation-specific
   structures such that a behavior-preserving refactor would
   require updating the tests.

2. **The unit under test is not itself mocked.** PASS: the
   subject of the test runs its real logic; mocks are limited to
   collaborators and external systems. FAIL: a test mocks the
   function/component it's purportedly testing, or mocks a
   dependency that's PART of the unit such that the real logic
   doesn't execute.

3. **No brittle snapshots.** PASS: snapshot assertions target
   small, intentional structures (e.g. one component's rendered
   accessible name); large serialized snapshots are absent or
   gated behind a focused-snapshot helper. FAIL: a snapshot ≥10
   lines is introduced as the only assertion in a test,
   capturing implementation detail likely to change on minor
   refactor.

4. **Test names describe the risk being defended.** PASS: each
   test's name expresses the failure mode it would catch
   ("throws X when Y", "renders fallback when fetch returns
   404"). FAIL: a test is named generically ("renders correctly",
   "works", method-name-only) such that a reader cannot tell
   what's being verified.

5. **Fixtures isolate; tests are parallel-safe.** PASS: each
   test sets up and tears down its own state; tests do not
   share mutable resources; run-in-parallel and
   run-in-different-order produce the same results. FAIL: tests
   share mutable globals, files, database rows, or temp paths
   without proper isolation, such that order or parallelism
   affects pass/fail.

6. **Async waiting uses test-runner primitives.** PASS: tests
   use `waitFor`, `findByX`, polling helpers, or framework-
   native synchronization for async behavior. FAIL: tests use
   hard-coded `sleep(N)`, fixed `setTimeout` delays, or
   similar to "wait long enough" for async work.

7. **Assertions are specific to the known value.** PASS:
   assertions check the exact expected value when it's
   determinable (`toBe(42)`, `toEqual([...])`, `toMatch(/.../)`)
   . FAIL: assertions are loose (`toBeTruthy`, `toBeDefined`,
   `toHaveLength(>0)`) when the exact value is knowable AND
   the test name implies a specific check.

8. **Tier matches the risk.** PASS: pure-logic risks defended
   by unit tests; cross-module + framework risks defended by
   integration tests; full user-flow risks defended by e2e.
   FAIL: an e2e or integration test exercises logic that a
   unit test would defend equally well at much lower cost,
   without justification.

9. **Mock boundaries respect the test's purpose.** PASS:
   external systems (network, time, randomness, third-party
   APIs) are mocked at unit tier; integration tests use real
   collaborators where the test's purpose is to verify
   integration behavior. FAIL: the test mocks the very thing
   it's supposed to verify (e.g., mocks the database in an
   integration test about schema or query behavior).

## Severity

- **Blocking** (gate the unit): criteria 1, 2, 3, 4, 5, 6, 9
  when the diff itself introduces the antipattern. Criterion 5
  always blocking — flaky tests poison signal across the suite.
- **Advisory** (flag but do not gate): criterion 7 by default
  (escalate to blocking when the test name implies a specific
  check but the assertion is loose); criterion 8 (wrong tier
  is wasteful but not broken); any criterion where the
  antipattern is inherited and the diff doesn't worsen it.

The "diff-introduces-it" standard applies — flag the lines the
diff changes, not the surrounding code.

## Evidence shape

For each finding, cite:

- **Path** to the test file (and line number for specific
  tests).
- **Pattern name** from the catalog (e.g. "testing
  implementation details", "mocking the unit under test",
  "brittle snapshot", "test name does not describe risk",
  "hard-coded wait").
- **Why it fires** in one sentence — the concrete symptom
  (e.g. "this assertion checks `component.state.internalFlag`
  which is private and changes with any refactor").
- **Remedy** in one sentence — typically "assert on rendered
  output instead", "let the real logic run", "narrow the
  snapshot", "rename the test to describe the failure mode",
  "use `waitFor`", or "split into one specific assertion per
  expected value."
- For criterion 5 (flakiness): cite the shared-state vector
  (the file, global, database, or fixture being shared) and
  the test order or parallelism dependency.

Good evidence is a one-line claim about what the test should
defend against, vs what it actually defends against. Cite the
gap, propose the alignment.
