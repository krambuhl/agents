# Whiteboard: Plugin marketplace shape for the krambuhl/agents framework — where do CLIs live, where do learnings live, how does install work without enrolling colleagues?

## Round 1

### From whiteboard-a11y

Recusing on this one with one small note.

The brief is install-infrastructure plumbing — plugin manifests, PATH resolution, settings.local.json scope, learnings residency. None of it surfaces UI to end-users in a way that engages the inclusion lens. The "users" here are Evan (one developer, on two machines) and the Claude Code Bash tool consuming command output. No screen-reader-rendered DOM, no focus management, no keyboard parity question, no color semantics. Pure dev-infrastructure shape.

The one adjacent angle worth a sentence, since the brief flagged it: failure-mode messaging from the skills when the plugin isn't enabled. The current `shim-error: entry not found` style from `install.sh:140-143` is good — it fails loud and names the missing thing. If skills wrap CLI calls in an enablement check (per failure-mode recommendation #5), the error string those skills emit should follow the same shape: lead with what failed, name the missing artifact, suggest the fix on the same line. Terminal output is consumed by humans reading top-to-bottom (including screen readers piping through `say` or braille displays), so the same plain-language rule applies — "loom CLI not on PATH; enable the krambuhl/agents plugin with `claude plugin install krambuhl/agents@<marketplace> --scope local`" beats a stack trace or a terse `ENOENT`. That's it from me; the architectural questions belong to whoever owns install-infra and the CLI shape (likely react-architect's CLI-shape cousin, or just Evan).

### From whiteboard-design-systems

**The name collision you're sleepwalking into.** Walk through what a teammate-of-Evan-at-Patreon would actually type, given the decisions taken:

```bash
claude plugin install krambuhl/agents@krambuhl/agents --scope local
```

That is the literal install incantation if both the plugin and the marketplace are named `krambuhl/agents`. The `<plugin>@<marketplace>` syntax is meaningful when the two are different — it lets one marketplace ship many plugins, or one plugin live in several marketplaces — and it degenerates into stutter when they're the same. It reads like a typo. It also makes any future second plugin (say, a slimmer `krambuhl/loom-only` or a Patreon-internal fork) collide awkwardly with the precedent the install docs establish.

The semantic question to ask, in the system's own language: **what IS the marketplace, and what IS the plugin?** They are not the same thing. A marketplace is a catalog — a publishing surface that can hold many things. A plugin is one of the things in the catalog. Naming both `krambuhl/agents` says "this is my one and only catalog of my one and only plugin," which is true *today* and may be false in eighteen months. The literal name leaks today's topology into the API.

**Vocabulary that's already present in the repo, ranked by load-bearing-ness.** I went through the actual frontmatter, READMEs, and conventions docs. The vocabulary in current use:

- **substrate** — appears 25 times across the three conventions docs, present in agent names (`whiteboard-substrate-engineer`), present in skill bodies (`§ Substrate compositions`). This word is genuinely load-bearing: it's the name of the conceptual layer the CLIs implement. Don't touch it.
- **loom / guild / griot** — the three CLIs, also the three top-level skill families (`loom-*`, `guild-*`, `griot-*`). Each name carries semantic weight: loom = projects/plans/phases, guild = parallel-agent panels, griot = learnings/memory. These are the system's nouns.
- **marketplace** — appears in install.sh (variable named `MARKETPLACE`), README header ("Marketplace for the…"), and AGENT-CONVENTIONS.md. Currently used to mean "this clone on disk." Under the plugin migration, that meaning shifts: a marketplace becomes a *manifest file* (.claude-plugin/marketplace.json), not a clone. Worth flagging that "marketplace" gets repurposed.
- **framework** — appears in the README ("guild / griot / loom agent framework") and in install.sh comments ("framework-enabled session"). This is the umbrella word for the whole thing. It's good — abstract enough to span CLIs, skills, agents, learnings. But it doesn't appear in any frontmatter, so it has no API surface.
- **skill / agent / CLI / learning** — the component nouns. Crisp, stable, used consistently. No issue.
- **plugin** — appears zero times anywhere in the repo. New vocabulary the Claude Code API forces in. It's an external constraint, not a chosen name.

**Where the proposed naming fights itself.** Three places:

1. *Install command stutter.* `krambuhl/agents@krambuhl/agents` is the symptom. Two cures: (a) rename one side, or (b) accept the stutter as a load-bearing redundancy (the marketplace happens to publish exactly one plugin whose name matches the marketplace). I prefer (a) — the redundancy isn't load-bearing, it's just laziness, and renaming now is cheap.

2. *"Marketplace" overloaded.* In the repo today, marketplace = the clone. In the plugin world, marketplace = the manifest catalog. After migration, install.sh likely goes away or shrinks dramatically, and the bare word "marketplace" loses its on-disk referent. The conventions docs say things like "marketplace-rooted doc paths" — that phrase still works because manifest-rooted clones still exist for the plugin install, but it's now describing a less concrete thing. Either lean into the shift (rewrite mentions of "marketplace" to mean the plugin's source repo) or pick a different word for the on-disk clone notion ("plugin source," "plugin root").

3. *"Framework" never made it into the API.* It's the umbrella in prose but it never names a thing. That's fine — it can stay prose-only. But it does mean there's no obvious bucket name for "the whole krambuhl/agents thing" when talking to a teammate. "The plugin" works for that going forward.

**Concrete naming proposal.** Three moves, in order of cost:

- **Marketplace name: `krambuhl`** (not `krambuhl/agents`). The marketplace is "Evan's personal marketplace." Plugins inside it can vary. This makes the install read `claude plugin install agents@krambuhl --scope local`, which scans cleanly — `agents` is what you're installing, `krambuhl` is where it comes from. It also leaves room for a second plugin later (`claude plugin install loom-lite@krambuhl`) without a rename. This is the semantic-over-literal move: `krambuhl` describes whose catalog this is; `krambuhl/agents` describes the GitHub coordinate, which is incidental.

- **Plugin name: `agents`** (matches the repo, matches the umbrella concept, matches what's installed in `~/.agents/`). The `agents` name is already calcified at the install path level, so this is the cohesion move — same concept, same name, everywhere.

  *Counter-pressure I want to acknowledge:* `agents` is a pretty generic plugin name. If a teammate has multiple plugins installed and runs `claude plugin list`, an entry named `agents` is less self-explanatory than, say, `loom-guild-griot` or `krambuhl-substrate`. But: (a) the marketplace prefix `@krambuhl` provides disambiguation, and (b) generic-when-namespaced is how npm packages have worked forever (`@evanstuff/agents`). I think `agents` wins on cohesion and you accept the genericness as a tax paid for naming-everywhere-consistency.

- **`extraKnownMarketplaces` entry name: `krambuhl`** (matches the marketplace name). One word, one referent. No `agents-marketplace` or `krambuhl-agents-marketplace` suffix-noise.

  Final install command becomes:

  ```bash
  claude plugin install agents@krambuhl --scope local
  ```

  Reads as a sentence: install the agents plugin from krambuhl's marketplace, only for me. That's the semantic surface I want.

**Skill / agent naming under the plugin shift — what stays, what audits.** Walk through each surface:

- *Skill frontmatter `name:` fields.* All currently bare nouns: `loom-research`, `guild-whiteboard`, `griot-load`, `ev-loop-interactive`, `review-skill`, `a11y-review-file`. These become the slash-commands a teammate types (`/loom-research`). Under the plugin model these names stay; they're scoped per-plugin internally but the user-facing slash command is the bare name. No renames needed. **The only audit item:** `review-skill` and `a11y-review-file` don't carry a family prefix. Today that's harmless (they're standalone), but once the plugin is installed alongside other plugins, an unprefixed `/review-skill` could collide with something else. If a colleague at Patreon ever installs a different plugin that also defines `/review-skill`, you have a conflict. Lower-priority but: consider prefixing the orphans (`/skill-review`, `/a11y-review`) to bring them into a family. Not urgent — flag for the cleanup PR, not the migration PR.

- *Agent file names.* `whiteboard-*`, `evaluator-*`, `griot-*`, `generator-*`. Already prefix-grouped — these read as families, which is the right shape. No changes.

- *CLI verb names.* `bin/loom research`, `bin/guild derive-panel`, `bin/griot use`. Under the bin-on-PATH plan they become `loom research`, `guild derive-panel`, `griot use`. The bare verbs are short and pleasant. **One semantic worry**: `loom`, `guild`, `griot` as bare commands are very claim-y of the global PATH namespace inside a Patreon shell session. If Patreon's monorepo ever ships its own tool called `loom` (unlikely but not impossible — looms come up a lot in scheduling / weaving / orchestration metaphors), the plugin shadows it silently while enabled. The mitigation isn't to rename — the names are too load-bearing in skill bodies — but to *document the namespace claim* in the install docs ("enabling this plugin adds `loom`, `guild`, `griot` to your PATH inside Claude Code Bash calls"). Loud-fail-on-collision behavior is already pretty good via the bare-command resolution; just don't let the namespace claim be invisible.

- *Skill body references to file paths.* Many skill bodies cite `docs/AGENT-CONVENTIONS.md` and `~/.agents/docs/` (see `/ev-loop-interactive` line 31). Under the plugin install, the `~/.agents/` symlink farm may or may not exist — the plugin install puts files under `~/.claude/plugins/` (or wherever Claude Code's plugin install root is), not `~/.agents/`. **This is a semantic-stability problem** that crosses my lane into substrate-engineer territory, but flagging: any skill body that hardcodes `~/.agents/docs/` will break unless the plugin install also creates that symlink, or the skill bodies get rewritten to resolve docs another way (e.g., a `bin/loom docs` verb that prints the doc path). This is design-systems-shaped because it's a *naming-as-architecture* problem: the path `~/.agents/docs/` is currently an API surface that skill bodies treat as stable, and the plugin migration changes the meaning of that path.

**The "framework" word — keep or retire?** Lean keep, prose-only. It's the only umbrella word that spans CLIs+skills+agents+learnings without being technical. README can keep saying "the krambuhl/agents framework" or "the agents framework" without anyone confusing it with an API term. Don't promote it into frontmatter or CLI verbs.

**Summary of the proposed renames.** Net delta from the spec-as-given:

- Marketplace name `krambuhl/agents` → `krambuhl`
- Plugin name stays `agents`
- Install command becomes `claude plugin install agents@krambuhl --scope local`
- `extraKnownMarketplaces` entry: `krambuhl`
- Skill names: no changes (audit orphans `review-skill` + `a11y-review-file` for prefix family in a later cleanup)
- Agent names: no changes
- CLI verbs: no changes; add a one-liner to install docs disclosing the PATH claim
- "Marketplace" the word: shifts meaning post-migration; either embrace the shift in conventions docs or pick a new word for the on-disk clone notion
- "Framework": keep, prose-only

**One unit of work this implies that's separate from the migration itself.** A pre-flight skill-body audit for hardcoded `~/.agents/...` paths. These are the design-systems debt the migration will surface — semantic paths the skills assumed were stable that the plugin install will invalidate. Catch them before the migration PR, not after.

### From whiteboard-performance

The `tsx` reference in package-lock is buried inside a transitive vitest dep tree, not a direct dependency of the framework. Confirmed: the framework runs zero-runtime-deps on Node 22.6+.

Here's the performance picture, from the measured-cost lens.

## The bottom line up front

This plugin is going to be **shockingly cheap to ship and shockingly cheap to invoke**. The two scariest numbers in your brief — "node_modules" and "cold start tsx/node" — turn out to be non-issues once you look at what's actually on disk and what the runtime model already is.

## Wire/disk cost: the plugin payload

Counting characters across the three component categories that ship in the plugin:

| Category | Files | Characters | Approx KB (UTF-8 ASCII) |
|---|---|---|---|
| `cli/**/*.ts` (all, incl. tests + fixtures) | 70 | 12,375 lines of code matched | ~340 KB source |
| `agents/*.md` | 28 | 4,232 lines | ~120 KB |
| `skills/**/SKILL.md` | 14 | 3,792 lines | ~140 KB |
| `learnings/*.md` (vestigial) | 4 | small | ~10 KB |
| `install.sh`, `package.json`, root metadata | a handful | small | ~10 KB |

Eyeballing: **~600 KB uncompressed source**, of which roughly half is CLI TypeScript (and a big chunk of *that* is `.test.ts` files — the cli/ tree is roughly half tests by file count). On the wire, git's pack compression on prose-heavy markdown and TypeScript typically hits ~25-35% ratios, so **the marketplace tarball/clone is probably 150-250 KB compressed**.

That's well below the noise floor for "install cost." Slack's emoji picker JSON is bigger. You will never have a Patreon onboarding conversation about disk pressure from this plugin.

### Should the tests ship?

The one place to save real bytes if you wanted to: strip the `.test.ts` files from the published plugin. Of the 70 `cli/**/*.ts` files, roughly half are tests; they exist for development of the framework, not for consumers. A `.claude-plugin/marketplace.json` plugin source spec could point at a subdirectory (or you could use a `files` allowlist convention if Claude Code honors one). But honestly — at ~600 KB total, **don't bother optimizing this yet**. Measure first. The cost of the optimization (extra build step, divergence between dev and ship layouts) is likely more expensive than the bytes it saves.

## node_modules — the dog that didn't bark

`package.json` declares exactly one dependency, and it's a `devDependency`: `vitest`. **There are zero runtime dependencies.** No `node_modules` directory exists in the checked-in tree. The CLIs import from `node:util`, `node:fs`, `node:path`, `node:url` — Node built-ins, every one of them.

This means:

- **No `npm install` hook is needed at plugin install time.** The plugin payload is the plugin. `claude plugin install krambuhl/agents@<marketplace>` does a git clone (or downloads a tarball), the bin/ shims are now on PATH, and that's it. No post-install script, no compilation, no native module rebuilds, no version-pinning headaches with the consumer's Node version (beyond the >=22.6 floor).
- **No `node_modules` ships in the plugin payload either.** Nothing to ship. The vitest tree is a developer-only concern for the marketplace repo itself; consumers never touch it.
- **No tsx, no esbuild, no ts-node.** The shim `exec node "$ENTRY"` where `$ENTRY` is a `.ts` file works because Node 22.6+ ships native type-stripping (`--experimental-strip-types`, on by default in 22.6, fully default by 23.6). The `engines.node >=22.6` declaration is the contract enforcing this. The CLIs are TypeScript on disk, but at runtime they're just Node executing TypeScript-with-types-erased.

This is unusually clean. Most plugin frameworks have a node_modules story; you don't.

## Cold start: the real question

A `node my-script.ts` cold start with native type-stripping on Node 22.6+ is roughly:
- Node boot itself: **40-70 ms** on modern macOS (Apple silicon), 80-150 ms on a typical Linux CI box.
- Type-stripping pass on the entry file + transitive `.ts` imports: scales with bytes of source loaded. For a CLI like `loom.ts` (185 lines) plus its imported verbs (each 100-400 lines), you're stripping maybe 30-80 KB of source total — **single-digit milliseconds, maybe 10-15 ms in the worst case**.
- Actual command execution: usually a file read, a small JSON parse/format, a writeFileSync. **Sub-millisecond unless it's hitting the network**.

So a typical `loom checkin write ...` from a Bash tool call is **~60-150 ms wall-clock**, almost all of which is Node booting and the type-strip pass.

**Is this a problem?** Two ways to look at it:

**No, in absolute terms.** A skill that invokes the CLI a handful of times per run (say, `griot capture` + `loom session write` + `loom checkin write`) eats ~300-500 ms total in cold starts across the whole skill run. That's well inside the noise of any LLM round-trip. The user will never feel it.

**Potentially yes, if skills go loop-happy.** If a skill design ever invokes the CLI inside a tight loop (e.g., "for each of 50 files, call `guild derive-panel` once"), you're now eating 50 × 100 ms = 5 seconds in pure Node boot. **That would be the design smell to flag.** The CLIs already partly defend against this — `guild derive-panel` takes `--files=<csv>` and batches in one call, which is exactly the right shape. Keep that convention. Whenever a new verb gets designed, the question to press on is: "can this take a batched input, or are we forcing the caller into a per-item loop?"

## What I'd actually recommend doing

1. **Ship as-is, instrumented.** The current shape (Node 22.6 native TS, zero runtime deps, ~600 KB source payload) is essentially optimal for an MVP plugin. Don't pre-optimize.
2. **Add a `loom doctor`-style timing harness later** if you ever suspect cold start is biting. Something like `time loom --version` in a script that runs it 20 times and reports min/median/p99. You can run this on the work laptop and the personal laptop, sanity-check that the variance isn't weird (e.g., Spotlight indexing the plugin dir on first run).
3. **Don't ship tests in the plugin payload yet, but don't strip them either.** If you ever look at the marketplace tarball and it's >5 MB, then revisit. Until then, it's noise.
4. **The Node version floor is a real constraint** — Patreon's eng env might be on an older Node by default. The bin/ shim's `#!/usr/bin/env node` will pick up whatever `node` is on PATH for the Bash tool. **Worth verifying explicitly**: what `node --version` does Claude Code's Bash tool see on your work machine? If it's <22.6, the shim runs but `import './verbs/foo.ts'` throws `ERR_UNKNOWN_FILE_EXTENSION`. The failure mode is loud (good — fails on first call, not silently), but it's a Day-One papercut worth pre-empting with a `loom doctor`-style check in install instructions or in the skill prologue.
5. **The marketplace's `.git` directory** is the one place a sloppy plugin install could blow up disk cost. A full clone of this repo with history might be 5-20 MB depending on git history size. If `claude plugin install` does a shallow clone (`--depth=1`), you're back to ~600 KB; if it does a full clone, the cost is dominated by history. **Worth verifying** the install mode — but again, even 20 MB is nothing in absolute terms.

## What this means for the marketplace shape decisions

- **The "mega-plugin via `claude plugin install`" path doesn't need to worry about install cost.** Ship the whole thing. No need to split into smaller plugins for size reasons.
- **The "granular per-skill via `npx skills add`" path has a subtle gotcha**: a per-skill install gets the SKILL.md but doesn't get the bin/ CLIs. Skills that call `loom`/`griot`/`guild` will fail with `command not found` unless the user has also installed the mega-plugin (which puts the CLIs on PATH). This is a discoverability issue more than a perf issue, but worth a note in the per-skill install instructions: *"this skill depends on the krambuhl/agents plugin being enabled for CLI access."*
- **Cold start argues for keeping CLI surface area additive, not multiplicative.** New verbs should usually be flags on existing verbs or new namespaces on existing CLIs, not new top-level executables. Each new top-level CLI is another Node-boot tax point. The current shape (3 CLIs, each with namespaces and verbs underneath) is the right granularity.

### From whiteboard-react-architect

Good — I have what I need. The CLIs are pure-Node-stdlib TypeScript (no third-party runtime deps, only `node:*` imports plus `vitest` as a devDependency), and they rely on Node 22.6+ which means `node --experimental-strip-types` is in play today for the bare `node cli/loom.ts` invocation.

## React-architect / boundary lens on the CLI packaging question

I want to think out loud here because there's a meatier question hiding inside the literal "compile or shebang?" one.

### What the CLIs actually are, from a boundary perspective

When I read `cli/loom.ts`, `cli/guild.ts`, and `cli/griot.ts` side-by-side, the shape is striking and worth naming:

- Each entry file is ~150 lines of *dispatcher*: a `VERBS` registry, a `parseInvocation` pure function, a `formatHelp`, a `dispatch`, and a `main` that wires `process.stdin/stdout/exit` to the dispatcher.
- Every interesting computation is exported and unit-tested directly (the `parseInvocation`/`dispatch`/`formatHelp` exports next to `cli/loom.test.ts`, `cli/guild.test.ts`, `cli/griot.test.ts`).
- The `isEntryPoint()` guard at the bottom of each file is the load-bearing line — it means each of these *.ts files is simultaneously a library (imported by tests, importable by anything else that wants to dispatch verbs in-process) and a binary (when invoked via `node cli/loom.ts`).

That's the existing public/private boundary, and it's already cleanly cut. The "binary" surface is just `main()` + the shebang. Everything else is library shape. The bin/ shim is doing nothing but `exec node <entry>` — it has no logic of its own.

So the real question isn't "compile or shebang?" — it's **"where should the line live between the plugin's exported binary surface and the library that backs it?"** I'd argue it's already drawn correctly in source; the packaging work is just deciding how to project that boundary onto the plugin's `bin/` directory without smearing the line.

### The three packaging shapes, with their tradeoffs

**Shape A — ship source, plugin's `bin/loom` execs `node --experimental-strip-types ../cli/loom.ts`.**

Pros: Zero build step. Source is source. The plugin update flow is literally `git pull` semantics — no "did I forget to rebuild?" failure mode. The published artifact IS the repo. Tests, types, and prod entry all share the exact same files.

Cons: Cold-start cost (~200-400ms type-strip pass). Node version coupling (>=22.6 floor leaks to every consumer). "Experimental" flag in the literal name (stable in practice, mildly off-putting).

**Shape B — build to JS, plugin's `bin/loom` execs `node dist/loom.js`.**

Pros: Fastest cold start. No type stripping at runtime. Works on older node.

Cons: Two source-of-truth problem (have to remember to `npm run build`, or ship stale `dist/`). `dist/` in the repo is noisy. Forces a `tsconfig.json` + `tsc` + maybe `tsup`/`esbuild` choice — each is a "thing to know" that the project doesn't have today.

**Shape C — shebang the .ts files directly, no wrapper shim at all.**

Move `cli/loom.ts` to `bin/loom` (no extension), keep the `#!/usr/bin/env -S node --experimental-strip-types` shebang, mark it executable, done.

Pros: Most direct possible mapping from "plugin's `bin/` surface" to "code that runs." No indirection.

Cons: Loses the `cli/` library separation. Right now `cli/loom.ts` is importable by tests as a module *because it lives at a stable importable path*. Same problem as a React component that exports a hook AND renders UI from the same default export.

### My recommendation, with the boundary argument

**Shape A wins, and the reason is composition.**

`cli/loom.ts` is a library that happens to have a `main()` at the bottom guarded by `isEntryPoint()`. Tests already import it as a library. Future agents that want to dispatch loom verbs *in-process* (skipping the fork-exec cost) can import the same module. That's a real future option you preserve by not compiling.

If you compile to `dist/`, you create a question every consumer has to answer: "import from cli/ or dist/?" That's the prop-API equivalent of shipping both `<VStack>` and `<Stack direction="vertical">` — pick one shape, make it the source of truth, let the binary be a thin wrapper.

The cold-start cost is real but bounded. The mitigation, if/when it bites, is *not* to compile — it's to **eliminate the fork-exec for hot paths**. If `griot capture` is being called ten times by a single skill turn, the right fix is to expose `griot capture` as an in-process call from the skill's orchestrator, not to shave 300ms off each fork. That's a future move, not a today move, but Shape A leaves the door open and Shape B starts to close it.

### What the plugin's `bin/loom` shim should look like

The current shim is 90% correct already. Two adjustments:

1. Drop the dependency on bash's `realpath` dance via `${BASH_SOURCE[0]}` — that part is actually fine, keep it. The "find my own directory" pattern is exactly what survives the move from `$MARKETPLACE/bin/` to `~/.claude/plugins/cache/krambuhl-agents/bin/`. The shim is location-independent already; that's its whole virtue.
2. Add the `--experimental-strip-types` flag (or, in Node 23+, this is just default behavior — worth a comment noting the flag becomes a no-op on newer nodes).

Concrete shape:

```bash
#!/usr/bin/env bash
# loom — entry shim. Lives in the plugin's bin/, auto-added to PATH by
# Claude Code while this plugin is enabled. Resolves cli/loom.ts as a
# sibling of bin/ within the plugin root — works identically whether
# the plugin is in ~/.claude/plugins/cache/... or a dev clone.
set -euo pipefail
SHIM_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ENTRY="$SHIM_DIR/../cli/loom.ts"
if [[ ! -f "$ENTRY" ]]; then
  echo "loom: plugin install appears broken — entry not found at $ENTRY" >&2
  echo "loom: try 'claude plugin update krambuhl-agents@<marketplace>'" >&2
  exit 2
fi
exec node --experimental-strip-types "$ENTRY" "$@"
```

The error message is the load-bearing change. Today's "shim-error: entry not found" assumes a developer reader; the plugin-cache version should give the consumer an actionable recovery hint, because the human reading that error will be the user himself a year from now wondering why his work machine broke after a plugin update.

### The subtler boundary question: should `cli/` be inside the plugin or beside it?

Worth surfacing even though you didn't ask directly. There's a Shape D lurking: publish `@krambuhl/agents-cli` to npm as a real package, have the plugin's `bin/loom` just `exec npx -y @krambuhl/agents-cli loom "$@"`. That decouples the CLI from the plugin entirely — same CLI usable from non-Claude contexts, plugin becomes pure "skills + agents + thin bin shims that delegate to npm."

I'd argue against it for this codebase, because:
- It adds a npm publish step to the release flow. The user's stated philosophy is "keep it basic."
- It splits the repo's coherence — right now the CLIs, skills, and agents co-evolve in one place, and a skill update that needs a new verb is one PR. With a separate npm package, it's a coordinated two-repo dance.
- The "CLI is reusable outside Claude" use case is theoretical; the actual consumer set is Claude skills.

But it's worth naming because it's the *cleanest* boundary if the framework ever grows non-Claude consumers. Not now. Maybe later.

### Summary of the actual recommendation

- **Ship source, not build artifacts.** `cli/*.ts` and `cli/verbs/**/*.ts` go into the plugin as-is.
- **The plugin's `bin/loom`, `bin/guild`, `bin/griot` are bash shims** of essentially the same shape as today, exec'ing `node --experimental-strip-types $SHIM_DIR/../cli/<name>.ts "$@"`.
- **The plugin layout is** `.claude-plugin/marketplace.json` + `bin/` + `cli/` + `skills/` + `agents/` — all siblings under the plugin root. The shim's `$SHIM_DIR/../cli/` resolution is invariant under wherever Claude unpacks the plugin.
- **`install.sh` becomes legacy** for plugin-installed users. Keep it for the power-user escape hatch, but the plugin-install path doesn't need it.
- **The "binary surface" of the plugin is exactly three commands** (`loom`, `guild`, `griot`). The "library surface" — `parseInvocation`, `dispatch`, individual verb handlers — stays internal but importable, available to tests today and to in-process dispatchers tomorrow.

The boundary I keep coming back to: the plugin's `bin/` is the *public API*; the `cli/` directory is the *implementation*. The shim is the seam. Keep that seam thin (it's bash, it's six lines) and the public/internal line stays crisp.

### From whiteboard-skeptic

The synthesis is mostly sound and the bin/-on-PATH win is real. But the brief asked for worst-case edges, and there are six I'd put on the whiteboard before this contract gets written.

## Finding 1 (high impact): PATH ordering between legacy `install.sh` and the plugin is undefined — and worse, *probably wins for the legacy path on macOS*

The legacy `install.sh` does not currently put anything on the user's shell `$PATH`. So at first glance there's no collision: bin-on-PATH from the plugin is the only thing exposing bare `loom`. Good.

But: the brief says "existing adopted projects with committed `bin/<cli>` shims pointing at `~/.agents/cli/` continue to work." Those committed per-project shims live at `<project>/bin/loom` — and many tools (yarn scripts, `direnv`, the user's own shell rc) add `./bin` or `./node_modules/.bin` to `$PATH` for the cwd. When a skill runs `Bash("loom project read foo")` inside an adopted project, *which* `loom` resolves first?

The per-project committed shim points to `~/.agents/cli/loom.ts`. The plugin's bin/ points at `~/.claude/plugins/cache/krambuhl/agents@<rev>/cli/loom.ts`. **These are two different filesystems with potentially two different versions of the CLI.** If the work machine has both installed, every `Bash("loom ...")` call is roulette over which version runs, and the failure mode is invariants drifting between the two — e.g. a JSON schema change in `manifest.ts` that one side has and the other doesn't.

**Remedy** (concrete):
1. `install.sh` should grow an opt-in stanza that prints "the plugin distribution is now preferred; run `claude plugin install krambuhl/agents@<marketplace>` and then `./install.sh --uninstall` to retire the symlink farm." Don't auto-uninstall, but make the deprecation path visible.
2. Add a `bin/loom doctor` check that resolves `which -a loom` and warns if multiple `loom` binaries are on PATH. `realpath` them and warn loudly if they point to different filesystem roots.
3. The deprecation note in `bin/loom adopt` (the proposed `unadopt` verb) should run that same `which -a` check and refuse to declare itself "the install" if a plugin-shipped `loom` is also present.

## Finding 2 (high impact): Node version drift is *the* silent breakage vector for the TypeScript-shebang shims

The CLIs are `#!/usr/bin/env node` files pointing at `.ts` source, and run via `exec node "$ENTRY"`. That relies on Node 22.6+ type-stripping — root `package.json` pins `engines.node >=22.6`.

The risk vectors:
- **Patreon's work machine likely runs whatever Node is in `.nvmrc` for the active repo.** If the user `cd`s into a Patreon repo with `.nvmrc` pinning Node 20 (very common — Next.js LTS), nvm/asdf/volta switch the active node to 20, and *every* `loom` invocation from inside that cwd dies with a cryptic syntax error on the first `import type` it sees. Not "command not found" — it's worse: `SyntaxError: Unexpected token 'type'` from a node that thought it was being handed JavaScript.
- **Plugin install does not pin a Node toolchain.** `claude plugin install` puts the bin on PATH but doesn't bring its own Node. There's no `engines` enforcement at invocation time — only at npm install time, and the plugin doesn't go through `npm install` in the consumer.
- **`#!/usr/bin/env node` resolves against the *shell* PATH at exec time**, which is the version-manager-modified PATH, not whatever Node was active when the plugin was installed.

**Remedy** (concrete, in priority order):
1. The bin shims should `node --version` check at the top and emit a structured error: `loom: requires node >=22.6 (current: $(node --version)); install via 'volta install node@22' or run from a directory without an .nvmrc pinning older'`. ~4 lines of bash, fail-loud, points the user at the fix.
2. Better: the shim should detect when it's running under nvm/volta/asdf and offer to `volta run --node 22 node "$ENTRY" "$@"` as a fallback. (Volta in particular handles this gracefully via per-project pins.)
3. Best: compile the CLIs to a single-file JS bundle at plugin publish time (esbuild, ~1 line in package.json scripts) so the runtime requirement is just "any node ≥18". The shim runs `node cli/loom.js`, no type-stripping needed, no Node 22.6 floor. The dev-time experience stays `.ts`-source; the published-plugin artifact is `.js`. This is the "fix it once" remedy and I'd lobby for it.

Without one of these, the user's first `cd ~/work/big-patreon-repo && claude` session is going to look like the framework is broken, and the error will *not* point at the actual cause.

## Finding 3 (medium): Same project slug across two unrelated repos → griot learning cross-talk through cwd-resolution ambiguity

The brief settled (#2) that learnings live at `./learnings/` resolved cwd-relative — which is right. But `cli/verbs/griot/capture.ts:446` uses `resolve(ctx.cwd, 'learnings/session-notes')` and `ctx.cwd = process.cwd()`.

The edge case: the user runs Claude Code from a *parent* directory containing multiple Patreon projects (very common — `~/work/patreon` as a workspace root with subdirs `studio/`, `marketing/`, `creator-go/`). A skill that issues `Bash("griot capture --from-checkin=studio/projects/foo/checkins/...")` runs in cwd `~/work/patreon`, and the capture lands in `~/work/patreon/learnings/session-notes/...` — *not* `~/work/patreon/studio/learnings/...`.

Now the personal-vs-work bleed the user wanted to prevent reappears at a *different boundary*: instead of `~/.agents/learnings` mixing the two, it's `~/work/patreon/learnings/` collecting context from whichever subproject the skill happened to be invoked against.

**Remedy**:
1. `griot capture` and `griot use` should resolve the learnings root via the same project-root discovery that `loom` already does (walk up looking for a `manifest.json` or a `.griot-root` marker). Use cwd as a fallback only.
2. Document the convention: "learnings live at the project root, not the cwd." Add a `griot doctor` check that warns when `cwd != detected-project-root`.
3. Or simpler: add `--learnings-root=<path>` as a required-or-env-var argument and let the skill be explicit. Removes the ambiguity entirely at the cost of skill verbosity.

## Finding 4 (medium): `.claude/settings.local.json` colleague-commit risk is real and the failure mode is *silent enrollment*

The brief asserts `--scope local` writes to `.claude/settings.local.json` "gitignored by convention." "By convention" is doing a lot of work here.

The realistic failure: the colleague's repo doesn't have `.claude/settings.local.json` in its `.gitignore` (lots of repos don't have any `.claude/` rules yet, since the tooling is new). The user opens a PR that *also* needs to add something to `.claude/settings.json` (the shared one) — maybe a hook or an allowlist for a repo-specific MCP. In the same `git add .`, they grab `.claude/settings.local.json` by accident. PR merges. Now the colleague pulls main, opens the repo in Claude Code, and `enabledPlugins['krambuhl/agents@<marketplace>'] = true` is in their project-scope local file, which on their machine tries to resolve a plugin they don't have installed — at best a loud error on every session start, at worst a silent fetch from a marketplace they didn't choose to trust.

**Remedy**:
1. The framework's install instructions should include a one-liner: "Add `.claude/settings.local.json` to your repo's `.gitignore` before installing." Even better, ship a `claude-code` first-run check that warns when this file is tracked.
2. The user should add this rule to his *global* git config: `git config --global core.excludesFile ~/.gitignore_global` with `.claude/settings.local.json` in it. Defense in depth.
3. Pre-commit hook in the plugin itself: a `monitors/` entry that warns when `.claude/settings.local.json` shows up in `git diff --cached`. Low-cost, fires once before a bad commit.

This is the constraint the brief most directly cares about ("must not enroll colleagues"). It deserves a hard guarantee, not "by convention."

## Finding 5 (medium-low): Plugin-disabled mid-execution — the bin disappears from PATH between Bash calls

The brief asks what happens to in-flight Bash calls when the plugin is disabled. The answer is more interesting than expected:

- A *single* `Bash("loom project read foo && loom phase update")` is one shell invocation — the PATH is resolved once, both commands run with the original PATH. Safe.
- Two *separate* Bash tool calls bracketing a `/plugin disable` action — the second one will fail with `loom: command not found`. The skill needs to handle that.
- *Worse*: a long-running `Bash("loom doctor --watch")` (hypothetical) that spawns subprocesses — if the user disables the plugin while it's running, the parent stays alive but any `exec`'d child re-resolution fails.

**Remedy**:
1. The "is-the-plugin-enabled" preflight check the brief proposes is right, but it should run *per skill invocation*, not per Bash call.
2. Skills should *not* try to recover from `command not found` for `loom`/`griot`/`guild` — they should fail fast with a structured message: `plugin krambuhl/agents may be disabled; run /plugin enable krambuhl/agents`. Don't try to fallback to `bin/loom` or `~/.agents/cli/...` — that re-introduces the silent-broken-install class.

## Finding 6 (low, but worth naming): Plugin cache cleanup is a thing the user doesn't think about until it breaks

`~/.claude/plugins/cache/` — the brief asks about cleanup. I'd guess `claude plugin update` doesn't garbage-collect old versions and `claude plugin uninstall` may not either. Over time:
- Each `plugin update` may leave the prior version's `node_modules/` (if the plugin has any).
- If the plugin moves from npm-style deps to bundled, old caches with broken `node_modules` may still be picked up by some path-resolution edge case.
- Disk pressure on a work laptop is real.

**Remedy**:
1. `bin/loom doctor` should report the size of `~/.claude/plugins/cache/krambuhl/agents*` and warn over some threshold (250MB?). Trivial check, valuable signal.
2. README should document `claude plugin uninstall` + `rm -rf ~/.claude/plugins/cache/krambuhl/agents*` as the "nuclear reset" recipe.
3. If the framework ever adopts a per-marketplace autoUpdate, *do not enable it by default*. Auto-update of a CLI the skills depend on is a recipe for silent breakage on a Monday morning.

## Round-2 prompt for the panel

If I were going to push a sibling engineer in round 2, it'd be at react-architect and design-systems together on this question: **does the plugin's bin/ exposure of bare `loom`/`griot`/`guild` lock in those names forever?**

Once published and consumed, those three names are part of the marketplace's contract with every skill. Renaming them later (say, `loom` collides with another popular tool — there's already a Slack-alternative called Loom, and a "loom" GitHub Actions framework) requires every skill to be updated in lockstep. Worth deciding *now* whether to namespace the bins (`krambuhl-loom`, ugly but safe) or accept the lock-in (clean, but the names are forever).

### From whiteboard-sketch-ideation

Out of scope. This is install/distribution infrastructure for the agents substrate — plugin marketplaces, CLI shipping, settings.local.json scoping. None of it touches sketches/, the `<Sketch>` wrapper, the sketch registry, or the gallery's portfolio framing. The aart.camp lens has nothing useful to add to a packaging-and-distribution question; deferring to the substrate-shaped voices (react-architect on the install surface, skeptic on the coupling story, design-systems on any shared-shape concerns).

### From whiteboard-substrate-engineer

The verified plugin facts unlock a much cleaner shape than the pre-plugin world, and the existing substrate is already mostly in position to slide into it. But there are four invariant questions worth pressing on — three are clean wins, one is a real schema-evolution decision the brief hasn't named yet.

### 1. CONVENTIONS.md parallel-work invariants — preserved, with one slightly tighter reading needed

Both Category-1 and Category-2 writers in the griot family already resolve against `ctx.cwd`, not against `$HOME/.agents/`. Concrete evidence:

- `cli/verbs/griot/capture.ts:446` — `const sessionNotesRoot = resolve(ctx.cwd, 'learnings/session-notes');`
- `cli/verbs/griot/capture.ts:419, 514` — stdout strings are already worded `learnings/session-notes/<folder>/`
- `cli/verbs/griot/use.ts:11` — `const ROLLUP_PATH = 'learnings/rollup.json';` (cwd-relative literal, passed through `resolve(ctx.cwd, ROLLUP_PATH)` at line 129)
- `cli/verbs/griot/index.ts:11-13` — the docstring on `GriotCliContext.cwd` already names this contract explicitly: *"The repo cwd where `learnings/` and other griot-relevant directories are resolved."*

In other words: **the CLI is already cwd-rooted everywhere it touches learnings**, and the move from "learnings live in `~/.agents/learnings`" to "learnings live in the consumer project" is not a code change to the verbs. It is purely a change to *what `process.cwd()` happens to be at invocation time*. The old install.sh symlink `~/.agents/learnings → marketplace/learnings` was load-bearing only when someone happened to `cd ~/.agents && griot capture …` — which nothing actually did. So no mutating verb's contract changes when learnings move; the verbs were never coupled to `~/.agents/` in the first place. That's a clean preservation.

What this means for CONVENTIONS.md alignment:

- **`griot capture` (Category 2, partitioned by `{folder}`)**: partition key is `${timestamp}-${slug}` (`capture.ts:388-390`). Two concurrent captures at the same UTC second with the same slug collide on the same folder — and the `existsSync(folderPath)` check at line 391 makes that collision *loud* (Category-2 contract honored). Moving the parent from `~/.agents/learnings/session-notes/` to `./learnings/session-notes/` doesn't change the partition shape; same collision domain, same loudness.
- **`griot operator-checks log-intervention` (Category 1, append-only)**: target is `<operator-log-path>` from stdin, entirely caller-supplied. Append-only by `appendFileSync`. Moving learnings doesn't even touch this verb's contract — it's already path-polymorphic.
- **`griot use` (read-only, not in the registry)**: just reads `learnings/rollup.json` cwd-relative. Same story.

**Verdict on (1)**: the parallel-work invariant is preserved by construction, because the substrate was already cwd-rooted. The registry rows don't need to change. CONVENTIONS.md doesn't need to change. Worth a one-line note in the registry comment that the `learnings/` prefix in the Category-2 row for `griot capture` is cwd-relative (it currently reads ambiguously).

### 2. New invariant that emerges: per-project learnings residency

Here's the one that does need to be added to CONVENTIONS.md. With learnings now living *inside the consumer project's git tree* instead of in `~/.agents/learnings`, three new invariant questions show up that didn't exist before:

- **Gitignore default at adopt time.** Day-job learnings must not get accidentally committed to Patreon's monorepo. The marketplace's own `learnings/` was never in a place where this question existed — it was a symlink target outside any consumer's `.git`. Now it's a real directory inside the consumer's working tree. *This is a new invariant: the adopt-equivalent step (whether plugin postinstall, a `griot init` verb, or first-run of `griot capture`) must idempotently ensure `learnings/` is in the consumer's `.gitignore`.* The substrate currently has nothing that does this. The brief flags this as "gitignored by default" but doesn't name where the enforcement lives. My lean: it lives in a new `griot init` verb (Category 3, fixed-path single-writer, exception: a new `gitignore-amendment`) that's idempotent.

- **Tier-separation invariant under shared visibility.** The existing tier-separation rule (`cli/verbs/griot/use.ts:42-44`) says: only `learnings/rollup.json` is loaded at session time; `learnings/session-notes/` and `learnings/nightly/` are inputs to `/griot-compact` only. This was an LLM-behavior contract before, enforced by the citation contract prose. *It's now also a privacy contract* — at Patreon, `learnings/session-notes/` may contain redacted-but-still-internal context that shouldn't leak into a non-Patreon session. The substrate's tier-separation invariant got more load-bearing by virtue of where it now lives.

- **Concurrency under multiple IDE windows on the same project.** The brief calls this out and concludes "same append-only behavior." That's correct for `griot capture` and `griot operator-checks log-intervention`. The one I'd flag: `learnings/rollup.json` is written by `/griot-compact`, which is a Category-3-shaped operation (fixed path, no partitioning) — but it isn't in the registry today because `/griot-compact` is a *skill body*, not a CLI verb. Worth pressing on whether two concurrent `/griot-compact` runs against the same consumer project would race on `learnings/rollup.json`. Lean: add the registry row and the declared exception — it codifies a real invariant the substrate already depends on.

### 3. Family-shape: `adopt` + `unadopt` + plugin-install — coexistence read

Three install paths after the change:
1. **`claude plugin install krambuhl/agents@<marketplace> --scope local`** — the new happy path. Per-user, invisible to colleagues, CLIs auto-on-PATH.
2. **`bin/loom project adopt`** — pre-existing verb. Reading `cli/verbs/project.ts:241-326`, this verb writes *loom substrate into a project* (manifest.json, config.json, events.jsonl, checkins/, sessions/). It does **not** install CLIs, does **not** symlink into `~/.agents/`, does **not** touch `.claude/settings.local.json`. It's a per-project-substrate-bootstrap verb, not an install verb.
3. **`bin/loom project unadopt`** (proposed) — would remove the committed `bin/<cli>` shims from a project tree.

**The naming collision the brief is at risk of creating**: there are two distinct things in the framework currently called "adopt":

- **Loom-substrate adoption** (`bin/loom project adopt`, the CLI verb in `project.ts`): "scaffold loom's state files into an existing project that already has a PLAN.md." This is a Category-3 mutating verb on the loom substrate.
- **Framework adoption** (the `bin/loom adopt` referenced in the brief and in `install.sh:154`): "create per-project `bin/<cli>` shims that point into `~/.agents/cli/`." I can't find a verb called `loom adopt` (without `project`) in `cli/loom.ts:22-35` — the NAMESPACES list has `project`, `phase`, `events`, `checkin`, `session`, `pr`, `retro`, `doctor`, `plan`, `revise-plan`, `research`. So the "`bin/loom adopt`" in the brief is either (a) shorthand for `bin/loom project adopt`, which would be a category error since that verb writes loom substrate, not bin/ shims; or (b) a separate adopt-script that I'm not finding in cli/. `install.sh:154` says `bin/loom adopt` but no such verb exists.

This is a **substrate-shape smell worth surfacing**: the brief proposes adding `bin/loom unadopt` as a sibling to `bin/loom adopt`, but `bin/loom adopt` (the framework-install one) doesn't appear to be a wired verb. If it's the legacy name for `bin/loom project adopt`, then `unadopt` should be `bin/loom project unadopt` for family cohesion — and *its scope is wrong*. Project-adopt writes loom substrate; the inverse would be "tear down loom substrate," which is `bin/loom project archive` (already exists, `project.ts:332-388`), not "remove framework CLI shims."

What I think the brief actually wants is a verb whose contract is **"this project no longer needs its committed `bin/<cli>` shims; please remove them and tell the user to install the plugin instead."** That is its own concern, separate from both project-adopt (substrate) and project-archive (lifecycle). Two clean shapes for it:

- **Option A — under the `project` namespace**: `bin/loom project untether` or `bin/loom project unshim`. Reads as "remove the committed shims so this project is no longer tethered to the marketplace clone." Sibling to `scaffold | adopt | archive` in the namespace. Cleanly Category 2 (`bin/<cli>` files, partitioned by `<cli>` name).
- **Option B — a new `migrate` namespace**: `bin/loom migrate to-plugin`. Reads as "one-time migration from the symlink-shim install to the plugin install."

Lean: **Option A, named `project untether`**. Reasons:
- "Untether" semantically tracks what the verb does (cuts the symlink-back-into-marketplace-clone tether), without colliding with `adopt` (which is loom-substrate, not framework-install).
- Naming it after the inverse of an *install-script* concept (rather than a CLI-verb concept) sidesteps the family confusion entirely.
- Cohesion compounds: the substrate's other namespace verbs already follow `<noun> <verb>` shape.

### 4. CLIs-on-PATH and the loom-does-CRUD principle

Worth pressing on briefly: with `loom`, `griot`, `guild` on `$PATH` while the plugin is enabled, every skill body now rewrites `bin/loom …` calls to bare `loom …`. The CRUD-vs-orchestration boundary is unaffected by this. But there is a subtle new failure-mode dimension: **the skill body now cannot tell, from a parse-error or a non-zero exit, whether the CLI is missing or the CLI failed**. With plugin disabled, bare `loom` returns `command not found` from bash. The skill body's error handling needs to distinguish these — recommend the skills wrap CLI calls in a `command -v loom >/dev/null || { echo "loom plugin not enabled"; exit 1; }` preflight. From the substrate-shape angle, that preflight belongs in a **shared skill-helper convention** (similar to today's bin/<cli> shim pattern). One place to encode the preflight, every skill calls it. Otherwise the family fragments into "skills that check" and "skills that don't" and that asymmetry costs forever.

### 5. Schema evolution: soft-extension or hard cutover?

The brief says "marketplace's vestigial `learnings/` directory either gets removed or repurposed as starter exemplars that a `griot init` verb copies (not symlinks) into the consumer."

- **Soft-extension shape**: the marketplace's `learnings/rollup.json` continues to exist as "the marketplace project's own learnings" (because the marketplace *is* a consumer of itself), and `griot init --seed-from-marketplace` is an opt-in copy.
- **Hard cutover shape**: delete the marketplace's `learnings/` entirely; ship starter exemplars under `templates/learnings/` or similar.

Lean: **soft-extension**. The marketplace is its own consumer — that's the whole bootstrap-marketplace-for-self-development invariant. Deleting the marketplace's `learnings/` would break self-development. Keeping it makes the marketplace's `learnings/rollup.json` *one example of* a consumer-rooted learnings tree, not a special case. The `griot init` verb's `--seed-from-marketplace` becomes an explicit opt-in pull, never an automatic merge — which preserves the "work-context learnings must not bleed into personal marketplace and vice versa" constraint by *making the only cross-pollination path a deliberate user action*.

### Summary of recommended substrate moves

1. **CONVENTIONS.md / registry**: no row changes needed for the move itself (verbs were always cwd-rooted). Add one new registry row for the `/griot-compact` → `learnings/rollup.json` write, plus a new declared exception `rollup.json`. Tighten the comment on the `griot capture` row to say the `learnings/` prefix is cwd-relative.
2. **New invariant in CONVENTIONS.md**: per-project learnings residency requires `.gitignore` enrollment. Name the verb that owns the enforcement.
3. **New CRUD verb**: `bin/loom project untether` (or your preferred name) — removes the committed `bin/<cli>` shims from a consumer project.
4. **New CRUD verb**: `bin/griot init` — idempotently scaffolds `learnings/` in the consumer project and amends `.gitignore`. Category 3, new declared exception `gitignore-amendment`.
5. **Avoid renaming or repurposing `bin/loom project adopt`** — that verb already has a load-bearing meaning in the loom-substrate sense and the framework-install "adopt" should not collide with it. The brief's "`bin/loom unadopt`" is a smell of that name-collision.
6. **Shared skill-helper for CLI preflight** — one place encodes "is the plugin enabled?", every skill calls it. Prevents family-fragmentation across skills.
7. **Soft-extension on marketplace `learnings/`** — keep it (the marketplace is a consumer of itself), make `griot init --seed-from-marketplace` the explicit opt-in pollination path.

### From whiteboard-testing-strategy

The test surface is already substantial — vitest with a deep unit + lib + verb layer, plus what looks like an invariant test sitting at the top of cli/. That's the floor I'm building on. Let me sketch what *new* test surface the plugin-install pivot actually demands, because much of the existing suite stays unchanged (the CLI verbs still do what they do; what changes is how they get on PATH).

## The risk landscape, named first

Before naming tests, let me name the bugs I'm afraid of:

1. **The "fresh-machine install silently produces a non-working framework" bug.** User runs `claude plugin install krambuhl/agents@<marketplace>`, plugin appears enabled, but the first skill that tries to call `loom research ...` either (a) can't find `loom` on PATH, (b) finds it but the Node entry resolution breaks, or (c) finds it but the CLI itself errors because some assumption from the old `~/.agents/cli/` symlink world leaked in.
2. **The "marketplace manifest is malformed" bug.** `.claude-plugin/marketplace.json` ships with a typo, missing field, or wrong plugin name and the install fails — or worse, half-succeeds.
3. **The "skill rewrite drifted" bug.** Some skills still reference `bin/loom` or `~/.agents/cli/loom.ts` or otherwise assume the symlink-farm world.
4. **The "learnings residency confusion" bug.** A consumer's `bin/griot capture` writes to the wrong path.
5. **The "two installs both think they own the same skill" bug.** User has the marketplace clone *and* the plugin installed (transition state).
6. **The "Windows / WSL path-separator" bug.** `bin/loom` is a bash shim that calls `node`; on bare Windows it doesn't run at all.
7. **The "plugin update broke the contract" bug.** A future PR to this repo changes a verb's flag shape or output, and consumers whose plugins auto-updated find their checked-in skills broken silently.
8. **The "adopted projects with committed `bin/<cli>` shims" bug.** Existing users who ran `bin/loom adopt` have shims that point at `~/.agents/cli/loom.ts`. If they uninstall the clone and install the plugin instead, those shims fail.

## The tier shape, cheapest signal first

### Unit tier — what stays, what's new

Most of what's in `cli/lib/*.test.ts` and `cli/verbs/**/*.test.ts` keeps doing exactly what it does. The verb logic doesn't care whether it was invoked via `bin/loom`, `~/.agents/cli/loom.ts`, or a plugin-PATH'd `loom`. **Defending against**: regression in verb behavior under any install mode.

**One new unit-level addition I'd push for**: a `marketplace-manifest.test.ts` that imports `.claude-plugin/marketplace.json`, type-checks it against a hand-written schema (just `{name: string, owner: string, plugins: Array<{name, source, description}>}`), and asserts the plugin entries reference real bin/, skills/, and agents/ directories that exist in the repo. **Defending against**: risk #2 (malformed manifest) and risk #3 partially.

**One more unit-level addition**: a `skills-call-bare-commands.test.ts` that grep-walks every `skills/**/SKILL.md` and asserts no skill body contains `bin/loom`, `bin/guild`, `bin/griot`, `~/.agents/cli/`, or `node cli/`. Just a string-presence check. **Defending against**: risk #3 (skill rewrite drifted).

I want to flag something the substrate-engineer should weigh in on: there's already a `cli/parallel-work-invariant.test.ts` at the top level. If learnings move to consumer cwd, the parallel-safety invariant being defended changes shape — multiple sessions writing to `./learnings/` in the same project. That test (or a sibling) needs to be reviewed against the new residency model.

### Integration tier — the boundary that actually changed

The boundary is: **skill markdown → bash invocation → CLI verb → output**. Previously that whole chain ran through the symlink farm; now it runs through plugin-PATH'd executables.

**New integration test I'd push for**: `plugin-bin-invocation.test.ts`. Set up: a temp directory, copy the `bin/loom` shim into it, prepend it to `PATH` for the test, run `loom --help` via `child_process.execSync`. Assert: exit code 0, stdout contains the help text. **Defending against**: risk #1 sub-case (b) — the shim's Node entry resolution works when invoked as a bare command from PATH.

**Another integration test**: `learnings-cwd-resolution.test.ts`. Set up: temp dir as cwd, run `griot capture` with the plugin's `bin/griot` invoked via absolute path. Assert: `./learnings/<expected-shape>` exists *in the temp dir*, not in `~/.agents/learnings/`, not in the plugin install dir. **Defending against**: risk #4.

### E2E tier — the install pipeline itself

**E2E test 1: `install-smoke.yml`.** A GitHub Actions job that:
1. Spins up `ubuntu-latest` (clean, no marketplace clone present).
2. Installs Claude Code via whatever the official install path is.
3. Runs `claude plugin install krambuhl/agents@<marketplace> --scope local` against the just-pushed commit.
4. Runs a single bash command that depends on the plugin being enabled — the cheapest possible signal. My pick: `loom --version`. Exit 0 = pass.

**Defending against**: risk #1. This is the only test that proves the *whole pipeline* — manifest → install → enable → PATH → shim → node → CLI — actually works end-to-end.

**E2E test 2: `skill-smoke.yml`**. Same setup, but the final step invokes a *skill*, not a bare CLI command. Pick the smallest skill that exercises the skill → bash → CLI chain. **Defending against**: risk #1 sub-cases (a) and (c), and risk #3.

**I'd push back on a full e2e for every skill.** With ~14 skills, running each through the install pipeline on every CI run is wildly expensive for the marginal signal. One representative skill per skill *category* (research vs plan vs whiteboard vs ev-loop) is plenty.

### Cross-platform — the matrix question

- **Linux**: the install-smoke job runs here by default. Baseline.
- **Mac**: add `macos-latest` to the matrix for install-smoke. Cheap to add to the matrix; defends against the Mac-specific bash regression that Linux CI wouldn't catch. **Defending against**: risk #6 partial — your day-job Patreon machine is probably a Mac.
- **Windows**: skip native Windows entirely. The bash shim won't run there.
- **WSL**: add a matrix entry but only if you anticipate colleagues or future-you actually using it. If WSL isn't on the radar, the test isn't earning its keep.

My honest recommendation: Mac + Linux for install-smoke, skip WSL until someone files a bug.

### What I'd explicitly NOT test

- **Don't write tests that prove the `~/.agents/` symlink farm still works alongside the plugin install.** That's the transition state, and the test would be defending against a configuration the user is actively trying to move *away* from.
- **Don't write tests that snapshot full skill output.** Skills produce conversational markdown; snapshotting it is a recipe for noisy diffs.
- **Don't write a test for every plugin component category** (skills/, agents/, hooks/, etc.). The manifest test catches "is this declared correctly"; the e2e test catches "does it actually load."
- **Don't test that `claude plugin update` works.** That's Claude Code's responsibility, not yours.

## The migration-path test that I almost missed

Risk #8 — existing users with committed `bin/<cli>` shims who switch to plugin install — deserves a named test:

**`unadopt-migration.test.ts`**: set up a fake "adopted" project with `bin/loom`, `bin/guild`, `bin/griot` shims pointing at a fake `~/.agents/cli/` location. Run `bin/loom unadopt` (the proposed new verb). Assert: shims are removed, no other project files touched, exit message mentions the plugin install path. **Defending against**: risk #8 specifically.

## Summary in the "name the test, name the risk" shape

| Test | Tier | Risk defended |
|---|---|---|
| `marketplace-manifest.test.ts` | unit | #2 malformed manifest, #3 partial |
| `skills-call-bare-commands.test.ts` | unit | #3 skill rewrite drift |
| `plugin-bin-invocation.test.ts` | integration | #1(b) shim resolution under PATH |
| `learnings-cwd-resolution.test.ts` | integration | #4 learnings residency confusion |
| `unadopt-migration.test.ts` | integration | #8 adopted-project migration |
| install-smoke CI job (Linux+Mac) | e2e | #1 fresh-machine install broken |
| skill-smoke CI job (one per category) | e2e | #1 sub-cases, #3 in production |

Existing `cli/**/*.test.ts` suite stays unchanged — it defends verb-logic regression, which is orthogonal to install model.
