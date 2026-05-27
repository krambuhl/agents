# Whiteboard: Design loom single-file manifest.toml state model (Phase 2)

## Round 1

### From guild:whiteboard-substrate-engineer

I read the jelly-loom parser (481 lines, manifest-coupled), loom's current state libs (manifest/config/events/checkin), the live Checkin type, and a real checkin from this very project (`parser-lib/01.json`). That last read changed my answer to the load-bearing question, so I'll lead there.

## The decision that reframes everything: checkins do NOT belong in the manifest

Question 2 is framed as "fold checkins into `[[checkins]]`." After reading a real checkin, I think that fold is the wrong shape and it quietly poisons three other exit criteria. A single checkin is deeply nested prose: `contract.acceptance_criteria` (8 entries of 200-400 char prose with embedded quotes/arrows/commas/parens), `execution.actions` (multi-sentence prose), `notes_for_pr` (paragraphs with embedded quotes, colons, commas). To put that in TOML arrays-of-tables you need multi-line basic strings or heavily-escaped single-line strings. The jelly parser **explicitly rejects** multi-line strings (line 206-211) and anything beyond `\n \t \r \\ \"`. So a checkin's `notes_for_pr` paragraph becomes a 600-char hand-escaped single-line TOML value inside `[[checkins]]` inside a file that also holds `[meta]` and `[[events]]`. Worst shape on offer: human-hostile, escape-fragile, and it drags the parser's required feature set from "jelly's scalar subset" to "near-complete TOML string handling."

**The shape that fits:** TOML is a config format — great for `[meta]`, `[config]`, `[[phases]]`, `[[events]]` (flat-ish, scalar). Bad for documents. Checkins are documents — the richest record loom owns. Don't force one container to hold two shapes. I'd press the panel hard on a **split**: `manifest.toml` holds `[meta]`, `[config]`, `[[phases]]`, `[[events]]`, `[[sessions]]`; **checkins stay file-per-record** (`checkins/<branch>/NN.toml`, or frankly keep them JSON). File-per-record is already append-only by construction (new checkin = new file; `writeCheckin` refuses overwrite, line 114-119), already parallel-safe (two branches write two paths), already immutable by filesystem fact. Folding them into `[[checkins]]` takes loom's safest sub-shape and makes it the least safe (a re-serialized slice of a whole-file rewrite). Sessions are the same argument at lower stakes — keep them with checkins by family symmetry.

## Q1 — parser shape: generic value-tree, not manifest-coupled

The jelly parser hardcodes its three sections into the accumulator (`ParseAccumulator { top, config, phases }`) — that coupling is *why* it's 481 lines for 3 sections. Loom has more sections and a ~40-arm `Event.detail` union. I lean **generic value-tree parser** (`parseToml(raw): TomlTable` / `stringifyToml(table): string`) + a thin loom-manifest typing layer. Cost lives at the right layer (write once, never changes when loom adds event variant #41); the event `detail` discriminated union is narrowed by the loom layer, not the parser. Keep jelly's *explicit-rejection safety posture* (reject the unsupported subset loudly, name the line), drop its coupling. NOT full TOML — generic-over-loom's-sections: scalars, string arrays, `[table]`, `[[array-of-table]]`, everything else rejected.

## Q3 — append-only integrity is the real invariant loss

Today `appendEvent` is `appendFileSync` — append-only *by the OS syscall*, not by discipline. Moving `[[events]]` into a whole-file-rewrite manifest.toml trades an OS-enforced invariant for a convention-enforced one. Crash mid-write: solved by atomic temp+rename (make it a hard exit-criterion). **Concurrent writers: NOT solved** — two sessions doing read-modify-rewrite is a lost-update race (A reads, B reads, A writes, B writes over A — A's event gone). jsonl avoided this via OS-serialized appends. Honest options: (a) document single-writer-per-project explicitly as a deliberate regression; (b) lock-file discipline (fail loud if held). At minimum add an mtime/byte-length re-check before rename to convert silent-loss into loud-abort. This is the strongest argument for keeping checkins file-per-record (highest write-contention artifact keeps its OS-enforced create-once invariant).

## Q4 — bootstrapping: dogfood-migrate this project, as its own (last) unit

This project is the snake eating its tail — in-flight AND building the new format. Installed-vs-source gap: the *running* loom in Phase 2 sessions is the stale installed copy (JSON); the *source* loom moves to TOML. Leaving this project on JSON means you can't dogfood the new loom on the very project meant to prove it. I lean **(a) migrate this project's state as an explicit, LAST Phase 2 unit** — a `scripts/` one-shot (throwaway, not a shipped verb): read the existing files, emit `manifest.toml` (+ checkins if they change format), `git rm` the originals in the same commit. The migrated manifest.toml becomes the real-artifact regression fixture. Run it via `node plugins/loom/cli/loom.ts` (source), not the installed `loom`.

## Q5 — unit breakdown (sequenced to never leave a half-migrated broken state)

1. **U1 — Generic TOML parser + serializer + round-trip tests.** Pure lib, zero consumers. Get escaping + `[[array-of-table]]` right here. Carefully-reviewed setup unit.
2. **U2 — Loom-manifest typing layer + read path.** `readManifest` on `parseToml`, narrowing event detail. Real-artifact regression here against a hand-authored genuine manifest.toml fixture.
3. **U3 — Atomic write path + writer verbs (working-tree writers).** temp+rename + the single-writer tradeoff written into the contract. **Riskiest seam.** Idempotency guard (re-running `pr merged 71` must not append a 2nd event).
4. **U4 — Checkin/session storage decision, implemented** (file-per-record confirm, or NN.toml convert). Isolated from manifest append-only mechanics.
5. **U5 — Dogfood migration + old-format removal.** Scripted one-time convert + delete old files + remove dead read-JSON paths. MUST be last; the marker flip + file removal + converted state atomic in one commit. Audit every `readConfig` call site here (config.json folds into `[config]`).

Ordering rationale: reader before writer (verify round-trip on real data before writing), writer before format-flip (prove writer on fixtures), migration dead-last (old format survives until the new path is green).

**Family note:** harvest the parser *mechanism* from jelly, NOT the `JellyManifest` *schema* — loom's mutable per-phase state is a different family member with its own typing layer.

Files grounding this: jelly-loom/cli/lib/manifest.ts (rejects multi-line strings 206-211, non-scalar arrays); loom/cli/lib/types.ts (Checkin nesting 446-459, ~40-arm Event union 361-403); loom/cli/lib/events.ts (appendEvent OS-enforced append-only — the invariant Phase 2 trades away); loom/cli/lib/checkin.ts (file-per-record create-once guard 114-119); the real checkin parser-lib/01.json (the prose-nesting proving `[[checkins]]`-in-manifest is wrong).

### From guild:whiteboard-testing-strategy

The harvest framing matters more than it looks: jelly-loom's TOML parser is a clean source for the *parser skeleton and rejection posture*, but a dangerous template for the *test corpus*, because loom's data is a different animal. Jelly's manifest is write-once and shallow. Loom's manifest.toml must round-trip `Checkin` (nested `contract`/`execution`/`verdict` + string-arrays), `Event` (polymorphic `detail` per event name), and `ManifestPhase.pr` (nested object). The round-trip risk surface is an order of magnitude larger; the tier plan must be sized to *that* shape.

**1. Round-trip tier — fixture-pinned assertions + factory inputs.** Core risk `parse(stringify(x)) !== x` is pure-function: unit tier, cheapest signal. Mirror jelly's `sampleX()` factory-with-overrides. Add ONE property test for the escaping sub-problem (random strings, assert `parse(stringify(s)) === s`) — that's where hand-rolled escaping rots. But hand-pinned fixtures for the structural cases, each named after the bug it defends:
- `#` inside a PR title / commit message stored in event detail (jelly tests this at :160) — loom events carry exactly the free-text fields (PR titles, `note` text, `blocked_reason`, retro descriptions) where a stray `#` or `"` silently truncates. Highest-value fixture: the data is agent-authored and unconstrained.
- empty arrays (`acceptance_criteria = []`, `depends_on = []`).
- the deepest nesting loom actually produces — a full Checkin with populated contract+execution+verdict. A shallow factory default masks this.
- a `detail` that's empty (`project-initialized` = `Record<string,never>`) and one deeply populated (`scope-shift-detected` with `signals: string[]`). The polymorphic detail is what jelly never solved.
One concept per test: `it('round-trips a checkin whose verdict has multiple reasons')`, not `it('round-trips everything')`.

**2. Node strip-only smoke — copy the plan.smoke.ts + spawnSync('node', [SMOKE]) idiom verbatim** (proven at plan.real.test.ts:80-86). The hand-rolled TOML lib is THE canonical ERR_UNSUPPORTED_TYPESCRIPT_SYNTAX risk (pure parsing code — where someone reaches for `constructor(public x)` or a JSDoc that closes early on `*/`). vitest's transform masks both; only real node catches them. Minimal `manifest.smoke.ts`: import the parser directly, build one maximally-nested manifest, `parse(stringify(m))`, assert deep-equal with a hand-rolled check (no vitest in the smoke), print marker + exit 0. Keep the smoke's assertion minimal — it defends *loader-compatibility*, not value-correctness (that's the unit tier). Don't conflate.

**3. Real-artifact regression — the chicken-and-egg dissolves once you name what "real" defends.** During Phase 2 there's NO real manifest.toml corpus yet, so a glob-the-repo floor test would be a floor against zero (worse than not existing). Bootstrap: the migration that *creates* manifest.toml is the corpus generator. The Phase 2 real-artifact test is an INTEGRATION test, not a glob: take this project's real manifest.json + events.jsonl + a real checkin (they exist today, with real PR titles, multi-line notes, real event history), run them through the new writer, parse back, assert data survived. That's "real artifact" in the sense that matters — real messy input through the real writer+reader. The glob-floor test (`toBeGreaterThan(N)` like plan.real.test.ts) comes LATER once manifest.toml files land — a Phase 2-cleanup/Phase 3 artifact, NOT Phase 2-setup. Name this in the contracts so nobody writes a `.skip`'d floor test that rots.

**4. Append-only + atomic-write — integration tier, real boundary.** Can't unit-test atomicity against a pure function — atomicity IS the filesystem boundary. Use a real temp dir (the loom.test.ts `makeCtx()` + `rmSync` pattern).
- *Append-only:* write event A, write event B, read back, assert `toEqual([A, B])` (order) AND A's bytes byte-identical. Risk defended: a whole-manifest re-serialize reordering/normalizing prior events. `toEqual([A,B])`, not `toContain(B)`.
- *Atomicity:* only *partially* testable. Assert the *mechanism* (writer uses a `.tmp` path then renames; no `.tmp` survives a success) at integration tier. Do NOT write the SIGKILL crash-safety test — flaky, parallel-hostile, trains retry-until-green. Treat true crash-safety as a design-review property the substrate-engineer signs off on.

**5. Migration-correctness — ONE shared verb-level harness, not per-verb bespoke.** Every migrated verb now read-modify-writes the *same* manifest.toml. Shared substrate → shared harness: a `makeProject()` that mints a UNIQUE temp dir per test (extend loom.test.ts's `makeCtx()`, don't reinvent), seeds a manifest.toml, tears down. **Parallel-safety is the risk I'd press hardest** — vitest runs files in parallel; two files writing a shared/hardcoded fixture path race into the flaky-test death spiral. Per-verb assertion shape: seed → run verb → re-read → assert (a) the verb's own section mutated correctly AND (b) every *other* section is byte-untouched. That second half is the migration-specific risk (verb A trampling verb B's section when both live in one file) — the cheapest defense against the scariest consolidation bug, the thing separate-files got for free.

Resolve before contracts: (a) whether the parser handles nested-table syntax vs flattening — sizes the entire round-trip fixture set, an architecture call that must land first; (b) whether `detail` is a sub-table per event or a JSON-string-in-a-field — if the latter, round-trip splits into TOML-level AND JSON-in-string tiers and the escaping fixture becomes load-bearing for both.

Relevant: jelly-loom/cli/lib/manifest.ts + manifest.test.ts (skeleton + round-trip/rejection test shape); loom/cli/lib/plan.real.test.ts + plan.smoke.ts (real-artifact glob-floor + node smoke idioms); loom/cli/loom.test.ts ~181-212 (spawnSync('node') + makeCtx() temp-dir); loom/cli/lib/types.ts 39-473 (Manifest/Event/Checkin/Session round-trip surface — nested Checkin + polymorphic Event.detail jelly never solved).

### From guild:whiteboard-skeptic

## Skeptic — Phase 2 (manifest.toml consolidation)

I read the harvest source (`jelly-loom/cli/lib/manifest.ts`), loom's `Checkin`/`Event`/`Session` types, the verb modules, and counted the blast radius. The premise — kill the multi-file sprawl — is sound and worth doing. But two of the candidate angles are not "risks to mitigate," they're **load-bearing flaws in the plan as written**, and one can brick the very project doing the work.

### Finding 1 — BLOCKING-grade: the build host IS an in-flight project. Phase 2 bricks it mid-build.

The PLAN.md constraint "no in-flight projects need migrating" is **false on this repo right now**:
- `projects/2026-05-26-substrate-consolidation/` (this project) has a live `manifest.json`, `events.jsonl` (20 lines), 4 checkins. Phase 1 shipped across #68–71. Maximally in-flight.
- `project.ts:15` hardcodes `LOOM_MARKER = 'manifest.json'`. The moment Phase 2 removes `manifest.json` and re-installs the new loom, `listProjects()` (line 164) stops seeing this project AND every sibling (`linear-loom`, `jelly`, 3 archived) — they all carry `manifest.json`, none carry `manifest.toml`.
- Worse: the SESSION running Phase 3+ uses the new loom against a json-shaped project — every verb ENOENTs on `manifest.toml` or strands the history.

"No backwards compat" doesn't save you: that forbids *runtime* migration code in the shipped loom; it does NOT forbid a *one-time in-repo conversion of live projects* as Phase 2 work. The plan conflated the two.

**Remedy:** a throwaway `scripts/convert-loom-state-to-toml.ts` (repo root, deleted in Phase 7) as the LAST Phase 2 unit: read each `projects/**/manifest.json` + `events.jsonl` + `checkins/**` + `sessions/**`, call the new serializer, write `manifest.toml`, `git rm` the originals in the SAME commit. The marker flip (`project.ts:15`), file removal, and converted on-disk state must be atomic in one commit so the repo is never half-migrated. The conversion of this repo's own 6 live + 3 archived projects is a REQUIRED unit, not an afterthought.

### Finding 2 — the harvest source is a toy that cannot hold loom's Checkin. The format is the wrong call.

Does the data fit the format? **No.**
- jelly's TOML subset (manifest.ts:11-24, parser 195-282): top-level scalars, one flat `[config]`, `[[phases]]` array-of-tables holding ONLY scalars + flat string-arrays. Lines 21-24 *explicitly reject* nested/inline tables, multiline strings, non-string arrays.
- loom's `Checkin` (types.ts:446-459): `phase` object, `contract` object with FIVE string-arrays, `execution` with THREE, `verdict` object, two top-level arrays. `Event` (361-403) is ~40 variants each with a heterogeneous `detail` object.

To put `[[checkins]]` in TOML you need nested standard tables (fiddly to hand-roll, jelly doesn't implement) or inline tables with multi-hundred-char single lines (defeats TOML's readability argument). `detail` is a different object shape per event variant — exactly the case TOML arrays-of-tables are bad at. So the plan is "port a parser that explicitly rejects nested objects, then feed it nothing but nested objects." That's not a port — it's a near-total rewrite into the hardest corner of TOML grammar, zero-dep, strip-only-safe, round-trip-faithful. A multi-week parser project masquerading as a harvest.

**Remedy — change the format, keep the goal.** The goal is "one file, kill the sprawl." TOML is one option, not the goal.
- **One JSON file, same sections:** `{ meta, config, phases, events, checkins, sessions }`. `JSON.parse`/`stringify` is zero-dep, strip-only-safe (not even TS), round-trips losslessly *by definition*, handles arbitrary nesting + every escape/Unicode edge for free. Kills the same five files. You lose comments + a marginally prettier diff — neither matters for machine-state no human hand-edits. **The cheapest design meeting the stated goal; I'd push hard on it as default.**
- **Hybrid:** TOML for the flat stuff (`[meta]`, `[config]`, `[[phases]]` — which fit jelly's subset nearly as-is), keep `events`/`checkins`/`sessions` as NDJSON/sub-files. But then it's not one file, so just use JSON.

The sprawl is real debt, but TOML is the expensive way to pay it and the harvest source misleads on reuse (the writer emits only flat scalars + one flat array per table — none of loom's nesting). Recommend JSON-one-file unless someone names a concrete reason loom's machine-state must be hand-edited.

### Finding 3 — whole-file-rewrite trades a robust property (append-only) for a fragile one.

- `events.ts:54` is a literal `appendFileSync` — one syscall, O(1), crash loses at most the one line; 19 prior events physically untouched.
- Under one manifest.toml, every `appendEvent` must read the whole file, deserialize all events+checkins+sessions, push one, re-serialize everything, rewrite. A serializer bug (Finding 2 says the serializer IS the hard part) corrupts/truncates the ENTIRE history, not one line.

"Atomic temp+rename" protects the *crash* case (atomic rename, never a half-written file). It does NOTHING against the *bug* case: a serializer that drops a field, mis-escapes a backtick, or mishandles the `*/` sequence sitting inside checkin 01's `disqualifiers` ("parameter properties or */-in-JSDoc" — your own MEMORY.md `*/` footgun) atomically renames a faithfully-corrupted file into place. Atomicity guarantees you cleanly overwrite good history with bad — worse than a torn append (no surviving prior line to recover). And jelly's `unescapeString` (168-193) THROWS on any escape it doesn't recognize (`\u`, `\f`, `\b`) — paste a smart-quote or unicode arrow and the parser rejects the whole project's state. Single point of failure for everything.

**Remedy:**
1. Finding 2's JSON choice mostly dissolves this (JSON.stringify can't mis-escape — removes the serializer-bug class). Strongest argument against the hand-rolled parser.
2. If whole-file-rewrite stays (any single-file design): make the round-trip test a REAL-ARTIFACT regression over every checkin + events.jsonl in `projects/**`; and have the writer assert `parse(serialized) deep-equals the in-memory object` BEFORE temp+rename, throwing rather than renaming if not — converts "silently corrupt history" into "loud refusal to write."
3. Cheapest honest middle ground: keep `events.jsonl` as-is (already perfect — append-only, robust, greppable), fold only the small scalars (`manifest.json` + `config.json`, maybe sessions). Kills 2-3 of 5 files without surrendering the one safety property carrying weight.

### Blast radius (real but secondary)

~39 files reference these paths; load-bearing surface ~7 lib+verb modules (`manifest`, `checkin`, `events`, `session`, `project`, `adopt`, `doctor`). The three-phase decomposition handles it IF respected: the danger isn't file count, it's any unit doing "remove old format" + "switch reader" in the same breath as "on-disk data is still old." The general rule: the marker flip, file removal, and converted on-disk state must be atomic in one commit.

### Bottom line for the contracts

- Consolidation goal sound. The TOML *format* and "port jelly's parser" *framing* are not — RE-DECIDE format before any unit is contracted (JSON-one-file = cheap honest default; hybrid-keep-events.jsonl = conservative), because every unit inherits the choice and it's expensive to unwind once verbs are written.
- Whichever format wins, **converting this repo's own live projects is a required Phase 2 unit** — the build host is in-flight, `LOOM_MARKER` hardcoded to `manifest.json`.
- Round-trip fidelity tested against REAL checkins on disk, not synthetic (your MEMORY.md "fixtures mask real-artifact breaks" — this is that pattern exactly).

Files: jelly-loom/cli/lib/manifest.ts (11-24 reject-subset, 109-135 flat-only writer); loom/cli/lib/types.ts 446-459 + 361-403 (Checkin nesting, Event union); loom/cli/lib/events.ts:54 (the append-only syscall at stake); loom/cli/lib/project.ts:15,164 (LOOM_MARKER footgun); this project's live json+jsonl + checkin 01.json (real round-trip torture test).

