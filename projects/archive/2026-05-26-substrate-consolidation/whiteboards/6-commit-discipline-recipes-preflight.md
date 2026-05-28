# Whiteboard: Phase 6 — Commit-discipline, recipes, preflight (M3: ev integration)

## Round 1

### From whiteboard-substrate-engineer

Three grounding facts from reading the substrate before forming opinions, because they change the answers:

1. **`loom pr open` already folds `pr-opened` into manifest.toml** via `writeManifest(mp, next, { expect: token })` — the optimistic-concurrency path (`plugins/loom/cli/verbs/loom/pr.ts:166-172`). The "hand-run `node manifest-lib appendEvent` script" in the brief is the *stale-CLI workaround*, not the designed path. The designed verb exists and is correct.
2. **`appendEvent` dedupes on `(event-name, deep-equal detail)`, ignoring `at`** (`manifest-toml.ts:572-578`). `pr-opened {pr:71}` and `pr-opened {pr:72}` are distinct; a re-run of the *same* pr-opened is a no-op. This idempotency-by-construction is the linchpin of the commit-discipline answer.
3. **`doctor`'s entire health check is "can this CLI `readManifestFile` the manifest"** (`doctor.ts:46-57`), and `readManifestFile` throws `manifest-unsupported-version` on any `schema_version != 1`. The format-skew detector the preflight question asks for is *already built* — just not wired into preflight.

### 1. Commit-discipline (lead) — option (c), and the substrate makes it safe

**Recommendation: (c) — defer all pr-event recording to the next unit's code commit, with the explicit phase-tail carve-out.** Only option that hits zero state-only commits without fighting an invariant. By elimination:

- **(a) amend** is a non-starter — amend + force-push rewrites the commit the manifest state was folded into. The manifest is append-only *content*, but git is the *clock* it rides; rewriting the clock to backfill an event is the "rewrite history to coordinate ordering" smell. Reject on shape, not just the CLAUDE.md guideline.
- **(b) current cadence** is the two-state-only-commits papercut we're killing. Out.
- **(d) derive-on-demand** is seductive: `loom pr discover` (`pr.ts:71`) *already* reconstructs PR state from `gh pr view` + the checkin marker. So pr-opened/pr-merged are arguably projections, not facts. But GitHub is a network dependency and a separate retention domain; the event log's job is to be the *offline, replayable* source of truth — a session six months out reading `manifest.toml` shouldn't need a live `gh` call to know unit 3 shipped in PR #70. Keep events as the durable record; keep `pr discover` as the *reconciliation* read that repairs drift. Don't collapse the fact into the projection.

So (c). Shape: **a unit's code commit folds (i) its own checkin + phase-update AND (ii) the *prior* unit's now-known pr-opened + pr-merged.** PR numbers lag exactly one unit, which is fine — by unit N+1, unit N's PR is open (you opened it) and usually merged (merge-as-you-go). Events are *late but never wrong*, and `appendEvent`'s detail-based idempotency makes re-folding a no-op — the safety net.

**The phase-tail problem is real and already has a precedent.** The last unit of a phase has no "next unit" to carry its tail — that's why Phase 4/5 closes used a setup-commit (`cc789f6`). Don't fight it; *name it as the designed shape*: the phase-boundary commit (close + next-phase setup) is the legitimate carrier for the phase's tail events. Not a state-only commit — a real phase-transition commit that also folds the trailing pr-events. One per phase boundary, not one per unit.

**On `loom events append`: no.** (1) pr-opened is owned by `loom pr open`; pr-merged wants its own typed verb (`loom pr merged <n>` — the comment at `manifest-toml.ts:568` literally references `pr merged 71` as the idempotency example, so it's anticipated). (2) A bare `events append` lets any caller write any event shape directly into the source of truth, bypassing per-event-type invariants — the append-only log stays trustworthy precisely because every writer goes through a typed verb. (3) It tempts skill bodies to hand-assemble event JSON (two write paths for one state). So: add `loom pr merged <pr-number> [<slug>]` (sibling to `pr open`, same `readManifestFile → appendEvent → writeManifest(expect)` cycle, idempotent). **loom does the typed CRUD append; ev-loop does the temporal composition** (when to call it — at the start of the next unit, before the code commit).

### 2. Recipes by name — one read-only guild verb, right consumer

`panel.manifest.toml` already declares `[[recipes]]` and `guild generate` already *reads* them at codegen (`generate.ts:317`). What's missing is *runtime* resolution. **Shape: a read-only `guild recipe <name>` verb** that reads the manifest, finds the `[[recipes]]` entry, emits member agent names (`whiteboard-composition`, ...) as JSON — same family as `events read` / `pr discover`. Two constraints:

- **Reuse `generate`'s recipe-reader, don't parse the manifest twice.** Extract `resolveRecipe(manifest, name): string[]` that both codegen (build-time) and `recipe` (invocation-time) call. If they diverge, the generated files and the runtime roster drift silently — the worst substrate bug.
- **Consumer is the ev-loop whiteboard step, NOT `guild whiteboard`.** `guild whiteboard` is a *file* manager (init/append/read-state) — roster resolution would be orchestration leaking into a CRUD verb. The ev-loop dispatch step calls `guild recipe design-systems` to learn *who* to spawn, spawns them, then calls `guild whiteboard append` to record *what* they said. Resolution (who) and file-write (what) stay separate. This also sidesteps the project-local whiteboard-glob gap (a `guild recipe` verb reads the plugin's own manifest).

### 3. Preflight — detect format-skew, cheapest signal already ships

`command -v` answering yes while the CLI can't read the manifest is the false-green this project lived inside. The detector is already built: **`loom doctor` (`doctor.ts:46-57`) is "can I `readManifestFile` this manifest", and `readManifest` throws `manifest-unsupported-version` on a bad schema** (`manifest-toml.ts:226-230`). A stale pre-cutover CLI fails it by construction. So preflight becomes two-tier:

1. `command -v loom guild griot` — on PATH at all (catches "not installed").
2. `loom doctor` against the project manifest — can *read this project's state* (catches format/version skew, the failure that actually bit).

Tier 2 exits non-zero with `manifest-unsupported-version`, which preflight translates into the actionable message the whole project needed: *"installed loom can't read this manifest (schema skew) — fall back to `node plugins/loom/cli/loom.ts`."*

Caveat for the skeptic's lane: tier-2 runs `doctor` at every preflight (one manifest parse — cheap, but a cost-placement call: always-on vs only when tier-1 finds an installed-not-shimmed binary).

**Schema-evolution note:** `readManifest` hard-gates `schema_version === 1`, so the *next* schema bump turns every stale-CLI session into a hard failure — loud, which we want, but no soft-extension runway. Any future additive-and-tolerated field needs loader tolerance designed in *before* the bump. Belongs in the substrate-gaps record.

Relevant files: `pr.ts` (`prOpen` folds pr-opened; add sibling `prMerged`), `manifest-toml.ts:572-578` (`appendEvent` idempotency), `doctor.ts` (the format-skew detector for preflight tier 2), `panel.manifest.toml:85-89` (`[[recipes]]`), `generate.ts:317` (recipe-reader to extract into `resolveRecipe`), `guild/cli/verbs/guild/index.ts` (where `recipe` registers).

### From whiteboard-testing-strategy

All three have a clean deterministic seam already cut into the codebase, and the cheapest reliable signal for each is a unit test against a pure function — no full ev-loop run required. The trap to avoid is reaching for an integration test (spin up a loop, inspect real git history) when the risk lives in a function you can call directly.

**1. Commit-discipline — "no state-only commits" (the one PLAN names).** The tempting test is "run an ev-loop, then `git log` the range and assert every commit touching `manifest.toml` also touches a non-state file." Resist it — slow, side-effecting, parallel-hostile, and defends the wrong thing. The bug isn't "a state-only commit appeared"; it's that `prOpen` writes the manifest in its own step, decoupled from the code commit (`pr.ts:166-172` — `appendEvent` + `writeManifest` fire after `gh pr create`, nothing staging them alongside code). Split the risk:

- *The git-history invariant is a lint, not a test.* A pure `findStateOnlyCommits(commits: {sha, files[]}[]): string[]` that flags any commit whose changed-files are all under the state set and returns the offenders. Feed it a hand-built array — a **factory** `makeCommit({ files })`, not a fixture; the test only cares "all-state vs mixed." Unit-test: `flags a commit that touches only manifest.toml`, `passes a commit that folds state into a code change`. Then wire the real `git log --name-only` parse over a commit range as a thin CI lint calling the same pure function — a real-artifact smoke (`*.real.test.ts`, the pattern in `plan.real.test.ts`) against a tiny seeded 2-commit repo covers the parse without a full loop.
- *The "did the loop avoid producing one" property is structurally designed away, not tested.* If Phase 6 reshapes `prOpen` so the manifest mutation is staged and the *caller* commits code+state together, the right unit test is on the reshaped verb: assert `prOpen` returns the event-to-stage and does *not* itself commit. Mock the external collaborator (`ctx.ghRunner` — already injectable, the seam's right there), use the real `appendEvent`/`writeManifest` against a temp-dir manifest (the doctor test's `mkdtempSync` pattern). One concept per test.

**2. Recipe resolution.** Settled by precedent — `derive-panel` already models the shape: parse a real artifact, fall back loudly, never a parallel TS const. Two tiers: a pure `resolveRecipe(manifest, name): string[]` unit-tested against a built manifest (factory), with the two sharp assertions — `resolves design-systems to exactly [composition, abstraction, tokens, naming]` with `toEqual` (not `toContain` — exactness is the contract), and `throws loud on an unknown recipe name`. **Plus** a real-artifact test against the actual `panel.manifest.toml` — this repo's hardest lesson is fixtures mask real breaks, and a recipe-name referenced by a skill body is precisely an author→consumer artifact pair. The real-artifact test asserts `design-systems` resolves to 4 members *against the shipped file*, so a manifest edit that drops a domain fails the suite, not production. The one test I'd insist on.

**3. Preflight + stale-CLI format-skew.** The preflight prose (`command -v`) isn't testable and shouldn't be — skill-body text, a shell concern. But the sharp risk — CLI on PATH yet can't parse the new manifest — is already half-built: `loom doctor`'s `checkProject` (`doctor.ts:32-65`) does exactly the format-skew check by attempting a real parse and emitting a structured `manifest-unreadable` issue, `manifest-unsupported-version` for schema skew. That's the seam. Test it where `doctor.test.ts` already does: unit, temp-dir manifests, asserting the issue *code* (`toContain('manifest-unreadable')` — not `toBeTruthy`). The gap to fill: the current check certifies *the project manifest is readable by this CLI* but doesn't invert to *this CLI is too old for this manifest's features*. If skew detection grows past schema-version (e.g. a recipe section the installed CLI doesn't understand), add `reports skew when manifest declares a section this CLI cannot read` — same tier, same harness. Don't promote to integration; the parse-attempt is the entire signal and it's pure.

For the next round, deferring to siblings: substrate-engineer should confirm the *state set* definition for the commit-discipline lint (which paths count as "state-only" — `manifest.toml` alone, or also response files?) — an append-only-invariant call. And whether the fix is "reshape `prOpen` to defer the commit" vs "post-hoc squash" is a substrate decision; my testing take only changes *which* function becomes the deterministic seam, not the tier.

Relevant files: `pr.ts:166-172,222-228` (state-only-commit origin; `ctx.ghRunner` mock seam), `doctor.ts:32-65` + `doctor.test.ts` (format-skew seam + harness to extend), `derive-panel.ts` (parse-real-artifact-with-loud-fallback precedent) + `panel.manifest.toml` (the real artifact the recipe test runs against), `plan.real.test.ts` (the `*.real.test.ts` pattern to mirror).

### From whiteboard-skeptic

Pressure-testing Phase 6. I read the real artifacts (the manifest event log, `ev-loop-interactive/SKILL.md`, `pr.ts`, `panel.manifest.toml`, `generate.ts`, the recipe doc). Four risks, sharpest first.

**1. Commit-discipline — I'm most worried about (a), and (c)'s tail problem is a permanent wart, not a papercut.** Look at the evidence the brief rests on: in `manifest.toml`, every `pr-opened`/`pr-merged` pair lands one second apart (PR 72: opened `03:43:07`, merged `03:43:08`; PR 73: `04:17:36`/`04:17:37`). That is not live PR tracking — it's batch reconciliation written after the merge. So the lived workflow already doesn't observe PR state in real time, which quietly defangs the case for recording it eagerly at all.

That points hard at **(d) derive-on-demand**, and the kicker is *the infrastructure already exists*: `loom pr discover` (pr.ts:71) reads `gh pr view --head <branch>` + the checkin marker and computes state with zero manifest writes. (d) isn't a build, it's a deletion — stop appending `pr-opened`/`pr-merged` and call `pr discover` at orientation. The brief worries (d) "couples ev to gh/git," but the loop *already* hard-requires both (`§ State refresh` does a mandatory `git fetch`; `§ Compose PR` shells `gh`). The coupling is pre-existing. The one real cost: you lose the historical `pr-merged` timeline — but given those timestamps are fabricated-on-reconcile, that history is already fiction. Losing fiction is not a loss.

Avoid (a) outright. History-rewrite + force-push on a shared `.plan` integration branch (the per-unit-PR cadence) means a force-push can land *under* a parallel agent's in-flight rebase. The one option that can corrupt others' work, for a cosmetic win.

On (c): the "last unit needs a setup-commit to carry its tail" isn't a one-off — Phase 4 *and* Phase 5 both needed it (`cc789f6`, `77acd6a`). A pattern that recurs every phase boundary and needs manual intervention is a structural wart, and it interacts badly with event LAG: a session that ends on the last unit never records its tail, so `/ev-run` orientation next session reads a phase that looks one-event-behind-done. (d) dissolves both — derive-on-demand has no tail to carry because it stores no tail.

**Remedy:** go (d). Delete `pr-opened`/`pr-merged` from the event vocabulary; route orientation through `loom pr discover`. Keep `pr-updated` as a body-refresh breadcrumb if wanted, but the open/merged *facts* live in git+gh, their actual source of truth.

**2. Recipes by name — this fails silent, today, and I can show the seam.** `panel.manifest.toml` declares `[[recipes]] name = "design-systems"`, but `generate.ts:251` is explicit: the recipe name is *"consumed at dispatch time, not at codegen"*. Grepping `plugins/guild/cli`, `recipe` appears **only** in `generate.ts`. There is no runtime resolver. So an ev skill body citing a recipe by name has nothing to resolve against — and the failure mode is an *empty or wrong panel*, silently, because `derive-panel` already degrades quietly (falls back to `FALLBACK_RULES`, only a stderr warning). A recipe miss riding the same quiet-fallback path means a unit gets a thinner panel than intended and nobody notices.

**Remedy:** the resolver must `fail-loud` on an unknown name (named code, e.g. `recipe-not-found`), never empty-panel. Add the cheap consistency test the codebase has a slot for: extend `panel-manifest-consistency.test.ts` to assert every recipe name cited in an ev skill body resolves to a recipe in `panel.manifest.toml`, and every recipe's `domains` map to real generated agents. Kills "recipe drifts from its members" at CI, not at dispatch.

**3. The preflight is treating the symptom; the disease is the doc.** The ev loops resolve every `§ Recipe` against `docs/SUBSTRATE-COMPOSITIONS.md` as the "authoritative resolution target." That doc still describes the *pre-M1* state model: it names `manifest.json`, `events.jsonl`, `checkins/<branch>/<NN>.json`, `sessions/` in 8 places (`§ Phase update` even says "target: `projects/<slug>/manifest.json`"). M1 consolidated all of that into `manifest.toml`. So the doc the loop trusts is already skewed from the code that ships — and that skew is invisible to `command -v` *and* to any format-skew preflight, because the doc isn't a CLI. A version-stamp detector on the binary passes green while the loop reads prose pointing at files that no longer exist.

On detector-failure modes: a false-positive (blocks a working setup) trains operators to bypass preflight (`|| true`), which is worse than no preflight — the gate goes decorative. A false-negative is the status quo. A *value*-level detector (does the CLI actually parse this manifest.toml?) beats a version-stamp, but still guards the wrong artifact.

**Remedy:** two moves. (1) Update `SUBSTRATE-COMPOSITIONS.md` and `LOOM-CONVENTIONS.md` to the TOML model as part of Phase 6 — the actual blast radius of M1 that didn't get swept, load-bearing for every recipe citation. (2) For the stale-CLI class, prefer a *capability probe* over a version compare: `loom project read <slug>` against the real manifest; if it can't parse `schema_version`, fail with a remediation string. Probes behavior, not a version integer that can lie. The installed-vs-source split is inherent to self-hosting substrate dev; Phase 6 can't *fix* it, only fail louder when it bites.

**4. One thing I'm *not* worried about, to calibrate.** Folding state into the feature commit (the (b)→(d) shift) is reversible and low-stakes — commit hygiene, not data integrity, and the single-operator/kilobyte scale means no concurrent-writer hazard. Don't over-engineer a distributed-consensus story for a one-person `.plan` branch.

For the next round: the doc-drift in #3 is the finding I'd most want a sibling to confirm scope on — if `SUBSTRATE-COMPOSITIONS.md` is rewritten in Phase 6 anyway, several of these collapse into "update the doc and go (d)."

Files leaned on: `manifest.toml` (the 1-second-apart pr-opened/pr-merged evidence), `pr.ts:71` (`prDiscover` — the (d) infrastructure already exists), `ev/skills/ev-loop-interactive/SKILL.md` (preflight 41-54; `§ Compose PR` timing), `panel.manifest.toml` + `generate.ts:251` (recipe name consumed at dispatch, no runtime resolver), `ev/docs/SUBSTRATE-COMPOSITIONS.md` (8 stale references to the pre-M1 JSON state model).

