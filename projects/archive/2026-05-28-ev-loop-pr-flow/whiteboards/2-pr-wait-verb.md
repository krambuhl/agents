# Whiteboard: loom pr wait verb + § Wait for merge recipe + /ev-run integration

## Round 1

### From whiteboard-substrate-engineer

**Lead finding**: `pr wait` is shape-honest as a CRUD-flavored primitive if its loop stays hermetic (one gh call, repeated, no other reads or writes). The PLAN holds that line. The thing to nail down before contract is whether the JSON shape it returns is the same as `pr discover`'s or a deliberate sibling — right now the design has them diverging in small ways that will compound.

**CRUD-vs-orchestration boundary**: passes narrowly. The orchestration smell is 'verb knows about workflow context'; `pr wait` only knows one branch + one gh call repeated until terminal condition. Orchestration of 'what to do on MERGED vs OPEN+timedOut' lives at /ev-run step 3 / recipe layer, exactly where it should.

**State at contract**: `pr wait` reads nothing from manifest, writes nothing, emits no events, depends on no project state beyond slug existence check. State this in the recipe's Idempotency or Failure-modes field explicitly: 'emits no events; no manifest writes; the polling loop is observation-only.' Forecloses 'should we emit pr-wait-merged' for every future reader. The 'no pr-* event' decision (LOOM-CONVENTIONS.md:255-263 from Phase-6 U1) stays load-bearing — no `pr-wait-started` / `pr-wait-merged` events.

**Family cohesion** with `pr open` / `update` / `discover` / `respond` — clean. `wait` factors as the fifth intent: poll-derived-state-until-condition. Shape-consistent with `discover` (both read-only against gh, both take --branch). Flag conventions: --branch mirrors siblings; --interval and --timeout are new (no priors) but well-named, and they're internal-loop-tuning flags (different class). Errors must live in the family vocabulary: `gh-failed` / `gh-invalid-output` / `missing-args` / `missing-slug`. Timeout MUST NOT be an error — `{state: OPEN, timedOut: true}` returned cleanly, exit code 0.

**JSON shape — the substrate-shape concern most worth pressing**: `pr discover` returns `{checkins, marker_state, pr: {number, url, state}}`. `pr wait` per PLAN returns `{number, url, state, mergedAt?, timedOut?}`. Different shapes. The /ev-run step-3 flow goes: `pr wait` returns MERGED → router calls `pr discover` to re-fetch state. That re-fetch ritual exists *because* shapes diverge. Pick one explicitly at contract:
- **Option A** — keep them separate, embrace the re-fetch. `pr wait` narrowly 'gh state reached terminal value'; `pr discover` the full derived view. Cost: one extra `gh pr view` per successful wait.
- **Option B** — `pr wait` returns discover-shape augmented with `wait: {timedOut}` envelope. Router doesn't re-fetch. Cost: `pr wait` now reaches into manifest (checkins side of discover), not purely gh-observational.

Lean **A** — preserves 'pr wait does one thing: poll gh until condition' cleanliness. Re-fetch cost is small.

**Adjacent: `mergedAt` field**. `gh pr view --json mergedAt` exists; `pr discover` doesn't return it today. If `pr wait` returns `mergedAt`, `pr discover` looks shape-incomplete. Substrate-shape principle: a field load-bearing for one PR-state-observing verb belongs on all, or on none. Add to both (consistent, low cost) or skip (not load-bearing for router).

**Pre-existing-PR edge case** at contract: if `gh pr view <branch>` returns no PR on first poll, fail loud (`pr-not-found`) and exit. The wait verb assumes the PR already exists; opening is `pr open`'s job. Keeps single-intent shape clean.

**Idempotency**: safe. Called twice against already-merged PR → both return MERGED immediately. Called concurrently → both observe gh, identical results, no shared state.

**Cost-of-substrate**: earns its weight via factoring-out — before `pr wait`, polling-until-merge would be inline shell in /ev-run; after, it's a CLI verb with stable contract that any loop (future /ev-loop-coordinated, CI integration, `loom doctor`) can call.

**To lock at contract**:
1. `pr wait` is read-only against gh; writes nothing to manifest/events. State in recipe Idempotency field.
2. JSON shape: pick A (own narrow shape) or B (matches discover). Don't invent a third.
3. `mergedAt`: on both or neither.
4. `pr-not-found` on first poll is failure (`pr-not-found`), not 'keep waiting'.
5. Timeout: exit code 0 + `timedOut: true`, not a non-zero error code.
6. Slug-existence check follows family pattern.

**Carving out**: skeptic has sharper teeth on session-death, real-world failure modes, default tuning; design-systems has sharper teeth on field-naming (`timedOut` vs alternatives), flag-unit semantics, verb name semantics.

### From whiteboard-skeptic

**Leading concern**: the verb's success-shape is too narrow — hides three distinct 'PR is done-ish' terminal states behind one branch.

`gh pr view --json state` returns `OPEN | MERGED | CLOSED`. Verb specced to exit when `state != OPEN`. Router contract (PLAN line 79) describes two branches: `MERGED → dispatch` and `OPEN + timedOut → run later`. `CLOSED` (operator manually closed, force-push-and-recreate, branch deletion) is the third terminal state, currently falling through whichever branch the router checks first. If router checks `state === 'MERGED'`, CLOSED PR exits the wait but dispatches nothing and surfaces timeout copy — wrong. If router checks `state !== 'OPEN'`, CLOSED PR dispatches qualifying phase as if it merged — much worse (next phase runs against parent never merged).

**Remedy**: return shape needs to distinguish three exit reasons explicitly. `{state, timedOut: boolean, exitReason: 'merged' | 'closed-unmerged' | 'timeout'}` — keep state for raw gh data, make the discriminant load-bearing. Router gets three cases: `merged` → re-fetch + dispatch; `closed-unmerged` → surface 'PR #X closed without merging — investigate and re-run'; `timeout` → existing copy. Cheap to bake in now, expensive to retrofit once verb has consumers.

**Second concern**: auto-mode 'silent' under-specified — will bite when gh auth expires mid-wait. PLAN line 121 says 'single entry-line + single exit-line.' What happens when `gh pr view` fails mid-poll?
1. **Transient network failure** (one poll fails, next succeeds) — silent retry correct. Swallow N consecutive failures up to threshold.
2. **gh auth expired mid-session** — every poll from now on fails with auth error. Silent retry burns full 30 minutes, exits `timedOut: true` with state... `null`? Operator sees timeout copy, re-runs /ev-run, also fails. Failure mode invisible until manual `gh auth status`.
3. **Rate limit** — 60-poll/30min is ~60 API calls (well under 5000/hr), but a long parallel-fanout session sharing auth could push it. Same shape as auth.

**Remedy**: define `gh-failed` exit distinct from timeout. After K consecutive gh failures (K=3, ~90s), exit with `{exitReason: 'gh-failed', lastError, pollsCompleted}` regardless of --mode=auto. Silencing applies to *routine* polls; should NOT silence terminal failures. Principle: silent during routine, informative during trouble. Router surfaces 'wait failed: gh CLI not responding — check `gh auth status` and re-run /ev-run.'

**Third concern**: session-death 'graceful degradation' has a quiet race window. PLAN § Risks: 'next /ev-run sees state: MERGED and dispatches normally' — true in steady state. The window: session dies AFTER wait verb returned MERGED but BEFORE router finished re-fetching and dispatching. Operator re-runs /ev-run. Step 3 sees no qualifying phase, would surface blocker, but `pr discover` will correctly see MERGED and dispatch. Failure mode benign — only because step 3 is idempotent.

**Compounding question**: is router actually idempotent? If manifest-adjacent cache is written before dispatch but session dies between cache-write and loop-invocation, next /ev-run reads cache, sees merged status recorded, dispatches. Fine — but if cache write is paired with anything else (event emit, checkin marker update), partial writes leave cache and marker disagreeing. **Remedy**: spec the order of operations in router explicitly. Confirm `pr discover` doesn't write manifest as side effect (quick read of pr.ts:74-116 suggests it doesn't). Add a test: invoke `pr discover` twice, assert manifest mtime doesn't change.

**Fourth concern (smaller)**: 30s/30min defaults tuned for substrate's own PRs (small, fast CI, merge within ~5 min). Too short for projects with 20+ minute CI + human review latency — operator hits timeout, runs again, hits another 30min, etc. Clean handoff per PLAN line 120, but operator experience is 'came back 90 min later, loop's been sleeping in 30-min chunks the whole time, not actually waiting.' **Remedy**: don't change defaults (reasonable starters), name in recipe Failure-modes that they're tunable, document two override cases: `--timeout=3600` for slow CI, `--interval=10` for active merge-queue waits.

**Fifth concern (naming-shaped, smaller)**: `mergeable: MERGEABLE | CONFLICTING | UNKNOWN` and `mergeStateStatus` are axes the verb is silent on. PR at `state: OPEN, mergeable: CONFLICTING` polls full 30 min — operator has to merge main into branch, or the PR is structurally un-mergeable. **Remedy**: defer to Phase 3 follow-up. Right next thing to add, not load-bearing for Phase 2.

**Predicted 'verb is wrong about X' moment, Phase 2 + 1 week**: first time operator force-pushes a branch (closes old PR, opens new PR with different number), verb polls *old* PR number that `pr discover` returned at wait start. New PR has operator's actual change; wait polls a CLOSED PR not coming back. **Mitigation**: verb should re-resolve PR-from-branch on each poll (cheap — same `gh pr view <branch>` call), NOT cache PR number from first poll. Current verb shape `--branch=<branch>` supports this if impl does it; contract should name it explicitly.

**Net read**: verb's contract mostly right but has (a) too-narrow success shape (one exit reason where 3-4 needed), (b) silent-during-trouble auto-mode failure mode, (c) force-push edge case as predicted first papercut. None blockers. Remedy in every case is a richer return-shape discriminant rather than more router code paths — keep orchestration thin, push distinctions down into verb.

### From whiteboard-design-systems

Substituting for whiteboard-naming — bringing naming + semantic-structure + composition lens.

**Lead**: `pr wait` reads as semantic if you let it lean on namespace gravity. The verb name worried me until I lined up with siblings. `pr discover` doesn't say WHAT it discovers either — namespace carries 'this is the thing.' `pr open` doesn't say 'open PR on GitHub via gh'; namespace says it. `pr wait` inherits same gravity: namespace = 'the PR for this branch,' verb = 'wait on it.' Implicit object is PR's terminal state transition (substrate's `state != OPEN` model).

Vs alternatives:
- **`pr wait-merge`** — semantic on surface, but lies. Returns on MERGED *or* CLOSED. `wait-merge` commits API to a sub-case; day a closed-without-merge fires, name becomes bug-attractor.
- **`pr poll`** — leaks mechanism. Whole point of encapsulating polling behind verb (Decisions line 119: 'implementation can be swapped without changing skill bodies') is callers shouldn't know it polls. `poll` is literal-name failure mode (same shape as BlueButton vs PrimaryButton). If swap to ScheduleWakeup (Risks line 100), `pr poll` becomes name of non-polling thing.
- **`pr discover --wait`** — conflates intents. `discover` is current state, safe-idempotent; `wait` blocks until transition, not-idempotent in time. Flag mode-switch makes call site hard to read.

**`pr wait` is the right name** — semantic via namespace, honest, future-proof against mechanism swap.

**Flag units — ambiguity is real**. Sibling convention uses bare `--limit=20` (unit = whatever flag name implies). For `--limit` that works. For `--interval`/`--timeout` it does NOT — both could be seconds, milliseconds, or minutes; defaults (30/1800) only make sense if you've decided seconds.

Three options:
1. `--interval=30 --timeout=1800` documented in --help + recipe. Lowest-cost; matches sibling. But verb-tests and recipe text repeat 'seconds' — drift attractor.
2. `--interval-seconds=30 --timeout-seconds=1800`. Explicit. Cost: new flag-pattern (`<name>-<unit>`) no sibling uses. Defer unless second time-based flag shows up.
3. `--interval=30s --timeout=30m` with tiny duration parser. Most readable at call site. Cost: parser, validation, error path. Worth it if duration flags multiply.

**My call**: (1) for now, with inline comment in verb naming 'values are seconds' and recipe text spelling it out, but flag (3) as upgrade path in source comment. Don't introduce duration-parsing primitive for single caller. Day a second duration flag lands anywhere, promote to (3) as shared lib and migrate both.

**JSON return shape — load-bearing**: `timedOut: true` is the wrong shape. Boolean for one of several exit-reason values forces every future case to bolt on another boolean (`closedWithoutMerge: true`, `checksFailed: true`) or retrofit an enum later — both break callers.

Cleaner:
```
{
  number: number,
  url: string,
  state: 'OPEN' | 'MERGED' | 'CLOSED',
  exitReason: 'merged' | 'closed' | 'timeout',
  mergedAt?: string,
}
```
`exitReason` is the semantic handle the router actually wants. `state` mirrors gh authoritative field (sibling consistency with `pr discover`). The two fields aren't redundant — `state` answers 'what is the PR right now' (could go stale); `exitReason` answers 'why did this verb stop running' (property of the call).

Also surfaces Phase 2 spec gap: **what does router do on `state: CLOSED` (not merged)?** PLAN treats as synonym for MERGED ('re-evaluate'); closed-without-merge means operator abandoned PR — phase NOT unblocked. `timedOut` boolean hides this gap; `exitReason` enum makes it impossible to miss.

If you don't want full enum: at minimum rename `timedOut` to be parallel with merge case, e.g. include `mergedAt` on merge and `timedOutAt` on timeout, both as ISO-string timestamps. Same `*At` suffix shape, no boolean-as-flag pattern.

**Composition vs configuration**: verb is fine; recipe is right place for extensibility. Today: `pr discover` = primitive that fetches state; `pr wait` = loop calling `pr discover` until condition holds. Future caller wanting 'wait until checks pass AND merged' should NOT get a `--condition=` flag — should get either (a) new sibling verb (`pr wait-checks`, scoped semantics) or (b) recipe layer (`§ Wait for green` composing `pr wait` and hypothetical `pr checks`). Either keeps `pr wait` semantically narrow.

**Risk to flag at contract**: do NOT name a flag `--condition=` or `--until=` on this verb. Either is configuration-creep beachhead. If future caller needs different waited-on thing, ship new verb.

**High-low pairing**: recipe earns its keep but barely. `§ Wait for merge` wrapping `bin/loom pr wait` looks like ceremony for a one-line composition. Case for it:
- Named composition handle in /ev-run step 3 (same vocabulary as `§ State refresh`, `§ Phase update`) — coherence-with-vocabulary not ceremony-for-its-own-sake.
- Localizes failure-modes table and idempotency story for the wait operation.
- Buys swap-implementation-without-changing-skill-bodies property (Risks line 100). Without recipe, swap to ScheduleWakeup is multi-skill edit.

Keep the recipe.

**Recipe naming**: `§ Wait for merge` fits vocabulary (action-shaped like `§ Compose PR`). Caveat tied to exitReason: if verb returns on CLOSED too (not just MERGED), `§ Wait for merge` technically wrong — waits for *lifecycle resolution*. Strict-mode rename: `§ Wait for PR resolution` or `§ Wait for PR close`. Both uglier and bury common case. Keep `§ Wait for merge` and let recipe Purpose text spell out CLOSED-case behavior — same pattern `§ Compose PR` uses (named for dominant case, body covers edge).

**Mode propagation**: PLAN line 132 ('no --quiet flag; auto-mode behavior implicit from caller context') right for configuration-thrift but mode-propagation-through-recipes is currently invisible. If `--mode=auto` is read from env or recipe-caller via implicit channel, that's hidden state. **Worth flagging**: either make explicit at verb interface (`--quiet`/`--silent`) for testability, OR document propagation rule once in the recipe. If no existing sibling pattern, this is 'small now, debt later.'

**Asks for unit contract**:
1. **Replace `timedOut: true` with `exitReason: 'merged' | 'closed' | 'timeout'`** in return JSON. Load-bearing rename.
2. **Decide CLOSED case explicitly** in router-integration spec — closed-without-merge ≠ merged for dispatch.
3. **Keep `pr wait`** as verb name.
4. **Document `--interval`/`--timeout` units as seconds** in verb source + recipe text; add source-comment noting `30s`/`30m` parsing as upgrade path if second duration flag ever lands.
5. **Do NOT introduce `--condition=`/`--until=` flags** — if future caller needs different waited-on thing, ship new sibling verb.
6. **Surface verb-mode propagation channel explicitly** at unit negotiation.

