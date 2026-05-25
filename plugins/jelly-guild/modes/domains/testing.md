# Domain: testing

## Scope

What to test, what to skip, and at which tier. Covers the
mock-vs-real boundary, test-runner choice (unit / integration /
e2e), assertion shape, fixture isolation, and whether each test
defends against a real risk. Architecture-shaped: applies
regardless of language and test framework.

This is about the tests' SHAPE, not whether they pass. A passing
test that asserts the wrong thing is worse than no test.

## Concerns

- **Test the boundary, not the implementation.** Assertions
  describe what callers can observe (return values, rendered
  output, side effects), not internal state. A refactor that
  preserves behavior should preserve the tests.
- **Choose the cheapest reliable signal.** Unit > integration >
  e2e in cost. Pick the lowest tier that genuinely defends
  against the risk. An e2e test for "this pure function returns
  the right number" is overkill.
- **Mock at the right boundary.** Mock external systems
  (network, time, randomness, third-party APIs) and your own
  module's collaborators that aren't the unit under test. Do
  not mock the unit under test.
- **Test names describe the risk.** "renders without crashing"
  is not a test; "renders fallback when fetch returns 404" is.
  The name names the failure mode the test would catch.
- **Fixtures must isolate.** No test mutates state another test
  depends on. Parallel-safe by default; opt-in to shared state
  only when explicitly serializing.
- **Assertions are specific.** `expect(result).toBe(42)` over
  `expect(result).toBeTruthy()` when the value is known.
  Specific assertions catch regressions; loose assertions hide
  them.

## Antipattern catalog

1. **Testing implementation details.** Assertions on internal
   state, private functions, or implementation-specific
   structures. Symptom: tests need updating after every
   refactor that doesn't change observable behavior. Severity:
   blocking when introduced.

2. **Mocking the unit under test.** A test mocks the function
   or component it's supposed to be testing, often by mocking a
   dependency that's PART of the unit (not a collaborator).
   Symptom: the test passes regardless of whether the real
   logic works. Severity: blocking when introduced.

3. **Brittle snapshot.** A snapshot test captures a large
   serialized output that changes on every minor refactor. The
   snapshot becomes noise; reviewers approve the diff without
   reading it. Symptom: snapshot updates outnumber behavioral
   changes in commit history. Severity: blocking for new
   snapshots ≥10 lines without a clear targeted concern.

4. **Test name doesn't describe the risk.** A test named
   "renders correctly" or "works as expected" or just the
   method name with no context. The reader can't tell what the
   test is defending against. Severity: blocking when
   introduced.

5. **Fixture leakage across tests.** Tests share mutable state
   (globals, files, database rows) without cleanup; test
   order affects results. Symptom: tests pass alone, fail in
   suite (or vice versa). Severity: blocking — flaky tests
   poison the suite's signal.

6. **Hard-coded waits / timeouts.** Tests use `sleep(500)`,
   `setTimeout(check, 1000)`, or similar fixed delays to wait
   for async behavior, instead of the test runner's await /
   waitFor / polling primitives. Symptom: tests pass on fast
   machines, fail on slow ones, or vice versa. Severity:
   blocking when introduced.

7. **Loose assertions.** `expect(x).toBeTruthy()` when the
   exact value is knowable; `expect(arr).toHaveLength(>0)`
   when the exact count matters. Symptom: the test passes for
   many wrong values. Severity: advisory by default; blocking
   when the test name implies a specific check but the
   assertion is loose.

8. **Wrong tier choice.** An integration or e2e test
   exercising logic that a unit test would defend against just
   as well, at much lower cost. Symptom: a five-minute e2e
   suite for what could be 500ms of unit tests. Severity:
   advisory — wrong tier is wasteful but not broken.

9. **Mocking what shouldn't be mocked.** Mocking the database
   when the integration test exists specifically to verify the
   schema or query shape. Mocking time when the test is about
   time-handling. Mocking the framework itself. Severity:
   blocking when the mock defeats the test's purpose.

## Good patterns

- **Test the boundary, not the impl.** Assertions on observable
  outputs (return values, rendered DOM, network calls made).
- **Tier matches risk.** Unit for pure logic, integration for
  cross-module + framework interaction, e2e for full user
  flows.
- **Real over mocked at integration tier.** Real database,
  real HTTP server, real file system in integration tests
  (with proper isolation). Mocks for unit tests only.
- **Specific assertions.** `toBe(42)`, `toEqual(['a', 'b'])`,
  `toMatch(/error: 404/)`. The exact expectation is in the
  test.
- **Test name = the failure case it defends.** "throws
  `InvalidEmail` when email lacks @", "renders empty-state
  when `items` is empty", "retries up to 3 times then surfaces
  the original error."
- **Isolated fixtures.** Each test sets up and tears down its
  own state; parallel-safe; no order dependencies.
- **Test-runner-native waiting.** `await waitFor(...)`,
  `await screen.findByRole(...)`, framework-provided polling —
  not hand-rolled timeouts.

## Vocabulary

Use this vocabulary when describing testing findings:

- **boundary** — the observable interface of the unit being
  tested (return values, rendered output, side effects)
- **implementation detail** — internal state or private
  functions the test should NOT assert against
- **tier** — unit / integration / e2e; choose the lowest tier
  that reliably defends the risk
- **mock boundary** — where to draw the line for mocked vs
  real collaborators
- **flake** — a test whose result depends on timing, order, or
  shared state
- **risk** — the failure mode the test is defending against;
  the test's name should describe this
- **specific assertion** — an assertion with one exact
  expected value
- **loose assertion** — an assertion that passes for many
  values (`toBeTruthy`, `toBeDefined` when the exact value is
  known)

## Cross-domain notes

- Overlaps with **abstraction**: an over-abstracted helper is
  harder to test in isolation (its parameterization explodes
  the test matrix). Testing difficulty signals an abstraction
  problem.
- Overlaps with **naming**: test names should describe the
  risk. Visual-literal test names ("renders correctly") are
  the testing-side of the naming problem.
- Overlaps with **composition**: composable primitives are
  easier to test; monoliths require integration-style tests
  for what should be unit-level concerns.
- Less overlap with **a11y**: a11y has its own testing
  patterns (axe-core, screen-reader probes); the testing
  domain's concerns about tier choice + mock boundary apply
  but the a11y-specific assertions live in the a11y domain.
