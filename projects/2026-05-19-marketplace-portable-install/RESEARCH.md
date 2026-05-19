# RESEARCH: Marketplace portable install — plugin distribution for the `agent-loop` framework

## Topic

How to make the `krambuhl/agents` framework installable on any repo
(personal or work) as a Claude Code plugin — without coupling the
install to a personal-repo clone, without enrolling colleagues, and
with griot learnings living in the consumer project rather than in
the marketplace.

## Triggering context

The user is a staff engineer at Patreon who maintains this framework
as a personal project. He wants to use it on his Patreon work machine
without (a) coupling that machine to a personal-repo clone, (b)
enrolling colleagues who open the same repo, or (c) bleeding
work-context griot learnings into the personal marketplace and
vice versa. The trigger is not an acute incident — it's an
ongoing want.

Observable that pinned the priority: at the moment this research
started, `~/.claude/skills/` on the user's personal machine had
symlinks dated `May 18 01:44` for 14 skills but was missing
`loom-research`, `loom-plan`, and `loom-revise-plan` — meaning the
machine that authored the framework was running a stale install of
its own product. The install pipeline silently lies about what's
installed when `install.sh` hasn't been re-run after a `git pull`.
Reproducible by running `ls ~/.claude/skills/ | sort` against the
list of skills in `skills/`.

## Working directions (tentative — to be ratified in `/loom-plan` grill-me)

These are the directions the research session converged on. Each one
has a recommended answer from the panel and a user-confirmed working
choice. **All remain open for re-pressure in the plan session** — the
plan session can re-grill any of these if new constraints surface
(implementation realities, sequencing concerns, dependency discoveries,
or just different priorities once the work is being scoped). The
verified facts and panel contributions stand; the design calls below
are working assumptions, not finals.

### A. Naming

- **Marketplace name**: `krambuhl` (not `krambuhl/agents`).
- **Plugin name**: `agent-loop` (not `agents` and not `krambuhl/agents`).
- **Install command**: `claude plugin install agent-loop@krambuhl --scope local`.
- The plugin name `agent-loop` was chosen by the user; it names the
  loop pattern visible across `ev-loop-interactive`,
  `ev-loop-confidence`, and the RPI loop inside `loom-research`.
- Repo stays named `agents`. The repo / plugin naming divergence is
  accepted as a minor inconsistency in exchange for a plugin name
  that describes what the plugin *does* rather than what its files
  are *called*.
- The marketplace name `krambuhl` describes whose catalog this is
  and leaves room for a future second plugin
  (e.g. `claude plugin install loom-lite@krambuhl`) without forcing
  a rename. The `<plugin>@<marketplace>` syntax becomes load-bearing
  rather than stuttering.

Source: whiteboard `research-shift-01-cli-residency-and-learnings-location.md`,
`### From whiteboard-design-systems` section, plus user decision via
`AskUserQuestion` on 2026-05-18.

### B. CLI packaging shape

- **Ship source, not build artifacts.** `cli/*.ts` and
  `cli/verbs/**/*.ts` go into the plugin as-is.
- The plugin's `bin/loom`, `bin/guild`, `bin/griot` are bash shims
  that `exec node "$SHIM_DIR/../cli/<name>.ts" "$@"`. Same shape as
  today's `bin/loom` (`install.sh:130-148`), location-independent
  via `BASH_SOURCE`.
- Plugins can ship `bin/` executables that Claude Code automatically
  adds to the Bash tool's `$PATH` while the plugin is enabled
  (verified at https://code.claude.com/docs/en/plugins-reference.md#plugin-components-reference).
- Therefore skills get rewritten to invoke CLIs as bare commands
  (`loom research ...`) instead of `bin/loom research ...`.
- The "binary surface" of the plugin is exactly three commands.
  The "library surface" (`parseInvocation`, `dispatch`, individual
  verb handlers) stays internal but importable, available to tests
  today and to in-process dispatchers tomorrow.

Source: whiteboard `### From whiteboard-react-architect` section.
Verified Claude Code API at
https://code.claude.com/docs/en/plugins-reference.md.

### C. Node version requirement

- **Plugin requires Node >= 24** (Patreon work machines are on Node 24
  per user statement, and Node 23.6+ makes TypeScript type-stripping
  default behavior — no `--experimental-strip-types` flag needed in
  the shim).
- The plugin's bin shims include a Node version check at the top
  that emits a structured error if `node --version` is too old:
  `loom: requires node >=24 (current: $(node --version))`.
- Compile-to-JS is **not** chosen. Source-shipping preserves the
  library-shape boundary that lets tests and in-process dispatchers
  import the same CLI modules.

Source: whiteboard `### From whiteboard-skeptic` Finding 2,
whiteboard `### From whiteboard-performance` section. Patreon Node 24
fact from user statement on 2026-05-18.

### D. CLI command names (lock-in accepted)

- **Bare commands**: `loom`, `guild`, `griot`. Not prefixed
  (no `krambuhl-loom`).
- This stakes a global `$PATH` namespace claim inside any Bash tool
  call where the plugin is enabled. The trade-off: clean skill bodies
  forever, at the cost of a forever-lock-in on those three names.
- Documented in install docs: "enabling this plugin adds `loom`,
  `guild`, `griot` to your PATH inside Claude Code Bash calls."

Source: whiteboard `### From whiteboard-design-systems` PATH-claim
note + `### From whiteboard-skeptic` round-2-prompt section,
acknowledged by user.

### E. Learnings residency

- **Learnings live at the consumer project root**, never in the
  marketplace.
- **Project root is resolved by walking up to find a `.git/`
  directory.** Falls back to cwd if no `.git/` is found.
  Universal across language stacks; works for every git repo.
- The CLI's existing `ctx.cwd`-based resolution
  (`cli/verbs/griot/capture.ts:446`,
  `cli/verbs/griot/use.ts:11+129`,
  `cli/verbs/griot/index.ts:11-13`) needs to be replaced with a
  project-root walk-up. This is the only substantive code change
  to the griot CLI verbs for the plugin migration.
- Marketplace's own `learnings/` directory is kept (soft-extension):
  the marketplace is its own consumer of `/griot-compact` during
  framework development, and deleting `learnings/` would break
  self-development. A new `bin/griot init --seed-from-marketplace`
  verb is the explicit opt-in path for consumers who want starter
  exemplars copied (not symlinked) into their project.

Source: whiteboard `### From whiteboard-substrate-engineer`
sections 1, 2, 5. CLI verb references verified by reading
`cli/verbs/griot/*.ts`.

### F. Per-user install via `--scope local`

- Install command uses `--scope local`, which writes to
  `.claude/settings.local.json` in the consumer repo.
- `enabledPlugins['agent-loop@krambuhl'] = true` lands in that file.
- This file is git-ignored by convention, but "by convention" is
  not a guarantee. **Verification required (Phase 0)** — see § Open
  verification tasks.
- The framework's install instructions must include a one-liner:
  "Add `.claude/settings.local.json` to your repo's `.gitignore`
  before installing."

Source: verified Claude Code API at
https://code.claude.com/docs/en/plugins-reference.md#plugin-installation-scopes
and https://code.claude.com/docs/en/settings#configuration-scopes.
Skeptic Finding 4 in the whiteboard.

### G. New invariant: per-project learnings residency requires gitignore enrollment

- Adding to `projects/CONVENTIONS.md`: the adopt-equivalent step
  (whether plugin postinstall, a `griot init` verb, or first-run of
  `griot capture`) must idempotently ensure `learnings/` is in the
  consumer's `.gitignore`.
- Day-job learnings must not get accidentally committed to Patreon's
  monorepo.
- A new `bin/griot init` verb (Category 3 in CONVENTIONS.md, new
  declared exception `gitignore-amendment`) idempotently scaffolds
  `learnings/` and amends `.gitignore`.

Source: whiteboard `### From whiteboard-substrate-engineer` section 2.

### H. Skill-helper for CLI preflight

- A shared convention (skill body snippet, or a documented
  one-liner) for every skill that invokes a CLI:
  `command -v loom >/dev/null || { echo "loom plugin not enabled"; exit 1; }`.
- Lives in the skill body, not in the CLI shim. One canonical
  shape, every skill uses it. Prevents family fragmentation between
  "skills that check" and "skills that don't."

Source: whiteboard `### From whiteboard-substrate-engineer` section 4
+ `### From whiteboard-skeptic` Finding 5.

## Verified Claude Code plugin API facts

The following facts about Claude Code's plugin/marketplace API were
verified via the `claude-code-guide` agent against official documentation
at https://code.claude.com/docs/ before any architectural decision
was taken. They are not inferred.

- **Marketplace manifest file**: `.claude-plugin/marketplace.json` at
  the marketplace repository root. Required fields: `name` (string,
  kebab-case), `owner` (object with required `name`, optional `email`),
  `plugins` (array of plugin entries each with `name` and `source`
  required). Doc:
  https://code.claude.com/docs/en/plugin-marketplaces.md.

- **Settings key for marketplace discovery**: `extraKnownMarketplaces`
  (in user/project/local scope settings.json). Doc:
  https://code.claude.com/docs/en/settings#plugin-settings.

- **Install command syntax**:
  `claude plugin install <plugin-name>@<marketplace-name> [--scope user|project|local|managed]`.
  Command is singular `claude plugin` (not `plugins`). Doc:
  https://code.claude.com/docs/en/plugins-reference.md.

- **Per-user install scope**: `--scope local` writes to
  `.claude/settings.local.json` (gitignored by convention; not
  enforced by the tool). Other scopes: `user`
  (`~/.claude/settings.json`), `project` (`.claude/settings.json`,
  team-shared), `managed` (admin-set, read-only). Doc:
  https://code.claude.com/docs/en/plugins-reference.md#plugin-installation-scopes.

- **Enabled-plugins settings key**: `enabledPlugins`, a map of
  `'plugin-name@marketplace-name': true`.

- **Plugin components a plugin can ship**: skills (`skills/<name>/SKILL.md`),
  agents (`agents/*.md`), hooks (`hooks/hooks.json`),
  MCP servers (`.mcp.json`), LSP servers (`.lsp.json`), monitors
  (`monitors/monitors.json`), and `bin/` executables. Executables in
  `bin/` are AUTOMATICALLY added to the Bash tool's `PATH` while
  the plugin is enabled. They are invokable as bare commands in any
  Bash tool call. Doc:
  https://code.claude.com/docs/en/plugins-reference.md#plugin-components-reference.

- **Plugin updates**: `claude plugin update <name>@<marketplace>` or
  `/plugin update` in the UI. Per-marketplace `autoUpdate` toggle
  in `extraKnownMarketplaces`. Doc:
  https://code.claude.com/docs/en/plugin-marketplaces.md#version-resolution-and-release-channels.

- **`skills.sh` / `npx skills add` compatibility**: undocumented in
  official Claude Code docs. The marketplace's README claims
  compatibility with `npx skills add krambuhl/agents@<skill-name>`,
  but this is a community tool and is not Anthropic-supported. The
  granular per-skill install path remains an option but the
  mega-plugin via `claude plugin install` is the primary
  distribution channel.

## Open questions for `/loom-plan` grill-me

The plan session should press on these. They are deliberately left
unresolved by the research session — either because the answer needs
implementation experience to call, or because the user signaled the
research session shouldn't artificially close them.

### PQ1: Migration sequencing — one PR or three phases?

The framework lives by the three-phase pattern (setup gate → bulk
migration → cleanup) per `CLAUDE.md` § "How I decompose work." The
plugin migration touches: marketplace manifest creation, plugin's bin
shim shape, skill-body rewrites (every `bin/loom ...` → `loom ...`),
the `bin/griot init` new verb, the griot project-root resolution
change, install docs rewrite, README rewrite, settings-helper
documentation, and possibly retirement of `install.sh`. That's a lot
for one PR.

Plan-session grill: is this one bundled migration PR or a three-phase
decomposition? If three-phase: what's the gate PR's minimal content?
What waves go in bulk? What's the cleanup PR?

### PQ2: When does `bin/griot init` ship?

The new verb that owns gitignore-amendment is named in this research
but its delivery timing is open. Options:
- In the migration PR itself (because gitignore-enrollment is a
  pre-condition for any consumer's first `griot capture`).
- In a follow-up cleanup PR (with a documented manual gitignore step
  in the meantime).
- Never ship the verb; just document the manual gitignore step.

### PQ3: Orphan skill prefix audit

`review-skill` and `a11y-review-file` don't carry a family prefix.
Once the plugin is installed alongside other plugins, an unprefixed
`/review-skill` could collide with something else. Design-systems
flagged this as "future cleanup PR, not migration PR" — but the
plan session might disagree.

Plan-session grill: rename these in the migration PR (lock-in safer
for public publish) or defer (less churn)?

### PQ4: Compatibility with the legacy install.sh path

`install.sh` continues to exist after migration. Options:
- Retire it entirely; README documents only the plugin install path.
- Keep it as a power-user escape hatch with a deprecation banner.
- Keep it AND ensure it errors out cleanly if the plugin is also
  installed (skeptic Finding 1 — PATH ordering).

### PQ5: Public-publish gating

The research assumes the repo becomes public, but doesn't name the
specific gating step. Plan-session grill: what's the exact sequence —
make repo public → publish marketplace manifest → user-tests install
on a personal machine → user-tests install on Patreon machine →
publish announcement?

### PQ6: Skill-helper shape for CLI preflight

Decision H named the convention but didn't pick a shape. Options:
- A canonical Bash one-liner that every skill body copies.
- A `bin/loom doctor --preflight` verb that skills call.
- A documented convention with no enforcement.

The plan session decides shape + where it's documented.

### PQ7: What happens to `npx skills add` compatibility?

The README currently claims compatibility. The research found this
path is community-supported (skills.sh) and not Anthropic-documented.
Plan-session grill: keep claiming compatibility (and test it before
publish), drop the claim, or ship only the plugin path?

## Phase 0 verification tasks (must complete before publish)

These are factual unknowns that the plan session cannot decide
without empirical data. They produce observables that update this
research dossier.

### V1: Smoke-test the `settings.local.json` enrollment safety

**Risk it defends**: silent colleague enrollment. The brief asserts
`.claude/settings.local.json` is gitignored by convention. "By
convention" is doing too much work. If a colleague accidentally
pulls a repo where the file was committed, what does Claude Code
actually do?

**Test**: create a sandbox repo. Commit `.claude/settings.local.json`
containing `{"enabledPlugins": {"agent-loop@krambuhl": true}}`. On
a different user account (or fresh machine), clone the repo and
open it in Claude Code. Observe the behavior.

**Outcomes to record**:
- Best case: Claude Code ignores the unrecognized plugin entry,
  surfaces no UI, no fetch.
- Acceptable case: Claude Code surfaces a one-time warning that
  the plugin isn't installed locally and offers to install it
  (with explicit confirmation). The colleague says no, nothing else
  happens.
- Worst case: Claude Code silently fetches the marketplace from
  `extraKnownMarketplaces` and auto-installs the plugin without
  confirmation. (If this is the behavior, the dossier's
  "invisible to colleagues" goal is unenforceable and we need a
  different scope.)

**Status**: must complete before any public publish of the
marketplace. The dossier's claim that `--scope local` is safe for
the work environment depends on this empirical result.

### V2: Verify Node version on the Patreon Bash tool environment

**Risk it defends**: cryptic syntax errors on `import type` if the
Bash tool resolves a Node older than 24.

**Test**: in the Patreon work environment, run a no-op
`Bash("node --version")` from inside Claude Code while sitting in
the consumer repo. Confirm output reports Node >= 24.

**Status**: user stated Patreon is on Node 24, but this verifies
that Claude Code's Bash tool actually sees that node (vs. e.g. an
`.nvmrc`-overridden older version in a specific repo).

### V3: Audit skill bodies for hardcoded `~/.agents/...` paths

**Risk it defends**: skills that hardcode marketplace-symlink paths
breaking after plugin install. Design-systems flagged this
explicitly: `skills/ev-loop-interactive/SKILL.md` line 31 cites
`~/.agents/docs/AGENT-CONVENTIONS.md`.

**Test**: `grep -rn '~/.agents/' skills/` and triage each hit.
Either rewrite the skill body to resolve docs via a `bin/loom docs`
verb, or accept that the plugin install will also need to create
a `~/.agents/` symlink (defeating part of the cleanup goal).

**Status**: must complete before the migration PR. Owned by a
pre-flight cleanup PR.

## Out-of-scope (deferred to follow-up work, not part of this dossier)

- **`bin/loom project untether` verb**: skipped. The user will
  hand-`rm` committed `bin/<cli>` shims from his handful of
  personal projects during migration. No new verb needed.
- **Orphan skill prefix audit** (`review-skill`, `a11y-review-file`
  without family prefix): flagged for a future cleanup PR per
  design-systems, not part of the migration PR.
- **Migration sequencing into discrete phases** (setup gate → bulk
  → cleanup per CLAUDE.md): out of scope for this *research*
  dossier. Belongs in a `/loom-plan` invocation that consumes this
  dossier and produces a PLAN.md.
- **The `install.sh:154` typo** (says `bin/loom adopt`, should say
  `bin/loom project adopt`): noted as a one-line docs cleanup,
  separate from the migration.
- **`@krambuhl/agent-loop-cli` as a standalone npm package**:
  react-architect's Shape D. Not pursued — the framework's
  consumer set is Claude skills today and the user's stated
  philosophy is "keep it basic."

## Whiteboard contributions

Full attributed sections live at
`projects/2026-05-18-marketplace-portable-install/whiteboards/research-shift-01-cli-residency-and-learnings-location.md`,
round 1. One synthesized paragraph per substantive engineer:

- **`whiteboard-design-systems`** found the literal install-command
  stutter (`krambuhl/agents@krambuhl/agents`) and proposed the
  `agent-loop@krambuhl` shape that the user adopted. Also raised
  the "marketplace" vocabulary overload (the word means
  "on-disk clone" today and shifts to "manifest catalog" post-
  migration) and the orphan-skill audit (deferred).

- **`whiteboard-performance`** measured the plugin's wire/disk
  cost (~600 KB uncompressed, ~150-250 KB compressed) and cold-
  start cost (60-150 ms per CLI call) — both below noise floor.
  Confirmed zero runtime dependencies and that the bin/shim's
  `exec node` shape works with Node 22.6+ native type-stripping.
  Recommended ship-as-is without pre-optimization.

- **`whiteboard-react-architect`** argued the CLI packaging
  question is really a boundary question: the plugin's `bin/` is
  the public API, `cli/` is the implementation, the shim is the
  seam. Shape A (ship source) preserves the library-shape that
  tests and future in-process dispatchers depend on. Compiling to
  JS (Shape B) would close that door for unclear runtime benefit.

- **`whiteboard-skeptic`** raised six edge-case findings, two of
  which are load-bearing: PATH ordering between legacy install
  and plugin (Finding 1) and Node version drift via `.nvmrc`
  (Finding 2). Resolved by Decision C (Node 24 requirement +
  shim version check) and by the user's commitment to hand-clean
  legacy shims rather than maintain coexistence. Findings 4 and
  6 (settings.local.json commit safety; plugin cache cleanup)
  fold into Phase-0 verification tasks.

- **`whiteboard-substrate-engineer`** confirmed that
  `projects/CONVENTIONS.md` invariants are preserved by construction
  (the CLI verbs were already `ctx.cwd`-rooted, never coupled to
  `~/.agents/`). Surfaced the `bin/loom adopt` naming smell
  (`install.sh:154` references a verb that doesn't exist as
  written; the real verb is `bin/loom project adopt`, which is the
  PLAN.md → loom-substrate bridge). Proposed `bin/griot init` as
  the new CRUD verb that owns the gitignore-amendment invariant
  for per-project learnings.

- **`whiteboard-testing-strategy`** specified a tiered test plan:
  unit (`marketplace-manifest.test.ts`, `skills-call-bare-commands.test.ts`),
  integration (`plugin-bin-invocation.test.ts`,
  `learnings-cwd-resolution.test.ts`), and e2e (install-smoke CI
  on Linux + Mac). Each test names the risk it defends against.
  WSL deferred until someone files a bug.

- **`whiteboard-a11y`** recused (install infrastructure, not
  user-facing UI) with a one-line note that the shim error messages
  should follow the same plain-language shape regardless of
  the human's input modality.

- **`whiteboard-sketch-ideation`** recused (not sketch territory).

## Sources

1. `install.sh` (lines 56-79: per-item symlink farm; 130-148: chicken-
   and-egg bin shim generation; 154: outdated reference to
   `bin/loom adopt`).
2. `README.md` (marketplace overview, install instructions,
   `npx skills add` compatibility claim).
3. `cli/loom.ts:22-35` (NAMESPACES registry — confirms no top-level
   `adopt` verb; the real verb is `project adopt`).
4. `cli/lib/adopt.ts` (`writeLoomSubstrate`, `synthesizeManifestInit`,
   `synthesizeConfig` — the substrate-bootstrap helpers called by
   `bin/loom project adopt`).
5. `cli/verbs/griot/capture.ts:446` (cwd-relative learnings path).
6. `cli/verbs/griot/use.ts:11,129` (cwd-relative rollup path).
7. `cli/verbs/griot/index.ts:11-13` (`GriotCliContext.cwd` docstring).
8. `cli/verbs/project.ts:241-326` (`adopt` verb implementation),
   `:332-388` (`archive` verb).
9. `projects/CONVENTIONS.md` (parallel-work invariants registry).
10. `cli/parallel-work-invariant.test.ts` (the registry test).
11. `package.json` (engines.node, zero runtime deps, vitest as only
    devDep).
12. `~/.claude/skills/` symlink listing (observable on the user's
    machine; reveals missing `loom-research`, `loom-plan`,
    `loom-revise-plan` despite the skills existing in the
    marketplace's `skills/` directory).
13. https://code.claude.com/docs/en/plugin-marketplaces.md
    (marketplace manifest shape).
14. https://code.claude.com/docs/en/plugins-reference.md
    (install syntax, plugin components including `bin/`,
    installation scopes).
15. https://code.claude.com/docs/en/settings (plugin settings keys).
16. https://code.claude.com/docs/en/discover-plugins.md (interactive
    install via `/plugin`).
17. Whiteboard
    `projects/2026-05-18-marketplace-portable-install/whiteboards/research-shift-01-cli-residency-and-learnings-location.md`,
    round 1, eight attributed engineer sections.
18. User decisions captured via `AskUserQuestion` on 2026-05-18:
    project-root marker (.git/ walk-up), untether verb (skip), no
    further press points before composing.
