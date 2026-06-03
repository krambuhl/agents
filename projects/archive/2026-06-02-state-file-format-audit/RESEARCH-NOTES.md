# Research notes — state file format audit

Raw evidence and provenance behind `RESEARCH.md`. No panel was spawned (the
topic was settled by direct evidence); these notes capture the commands run,
their output, and the two read-only sweeps' findings.

## Verification commands (2026-06-02)

Live legacy-state check — are any pre-consolidation files still live?

```
$ find projects -name 'events.jsonl' -o -name 'config.json' -o -name 'manifest.json' | grep -v fixtures
(empty)

$ find projects -name 'manifest.toml' | grep -v fixtures | wc -l
19
```

Real project directories (confirming TOML manifest, no legacy trio):

```
$ ls -1 projects/2026-06-01-future-workflow-adoption/
manifest.toml
reference
RESEARCH-NOTES.md
RESEARCH.md
ROADMAP-SCAN.md

$ ls -1 projects/archive/2026-06-01-guild-hirefest/
INTERVIEW.md
manifest.toml
PLAN.md
retros
reviewer-gap-inventory.md
```

Documentation references to `manifest.json` in commons docs:

```
$ grep -rn 'manifest\.json' plugins/commons/docs/
LOOM-CONVENTIONS.md:43:project state lived in five separate files (`manifest.json`,   # HISTORICAL — ok
LOOM-CONVENTIONS.md:127:substrate-consolidation folded `manifest.json` + `config.json` +  # HISTORICAL — ok
AGENT-CONVENTIONS.md:24:   `manifest.json`, `events.jsonl`, etc).                    # STALE
AGENT-CONVENTIONS.md:195:`manifest.json`:                                            # STALE (RECOVERY path)
```

Runtime conventions doc still naming `manifest.json` as the live exception:

```
$ grep -n 'manifest\.\(json\|toml\)' projects/CONVENTIONS.md
70:- `loom phase update` (target: `projects/<slug>/manifest.json`,
71:  exception: `manifest.json`)
73:  `projects/<slug>/manifest.json`, exception: `manifest.json`)
91:- **`manifest.json`** — the project manifest. Mutated by
```

Skills still referencing the dead trio:

```
$ grep -rln 'events\.jsonl\|config\.json\|manifest\.json' plugins/*/skills/
plugins/ev/skills/ev-loop-interactive/SKILL.md
plugins/ev/skills/ev-loop-confidence/SKILL.md
plugins/ev/skills/ev-run/SKILL.md
plugins/loom/skills/loom-plan/SKILL.md
plugins/loom/skills/loom-research/SKILL.md
```

Verb-source confirmation of consolidation (`plugins/loom/cli/verbs/loom/research.ts`,
auto-adopt block):

> "All state lives in the single manifest.toml now (config.json /
> events.jsonl folded in), so it is the only state file to commit."

The `loom research init` verb (read for this audit): copies the two prepared
MD files into `projects/<slug>/`, auto-adopts loom substrate by writing
`manifest.toml` (via `writeLoomSubstrate` / `synthesizeManifestInit`), emits
`research-started` + `research-completed` into `[[events]]`, and git-commits
the bundle by default (`--no-commit` skips the commit; `--no-loom` skips
adoption). Slug derives via `createSlug(topic, today)` unless a full
`YYYY-MM-DD-slug` is passed.

## Sweep 1 — format landscape inventory (read-only agent)

TOML:
- `plugins/guild/modes/axes.toml` — guild codegen cross-product source (schema v1; domains/phases/personalities; replaced `panel.manifest.toml` + `tools-map.toml`).
- `plugins/guild/agents/.cache.toml` — per-cell fusion cache (`output_hash`, `prompt_hash`, `source_hash_*`).
- `projects/<slug>/manifest.toml` — consolidated per-project state: `[meta]`, `[config]`, `[[phases]]`, `[[events]]`, `[[checkins]]`, `[[sessions]]`, `[[revisions]]`. Real examples range from 823 bytes (fresh: `2026-06-01-future-workflow-adoption`) to ~69KB (mature: archived `2026-05-30-shared-insights`).
- Fixtures: `plugins/loom/cli/fixtures/manifest-*.toml`; guild compile validation fixtures under `plugins/guild/cli/verbs/guild/compile/fixtures/validate/*.toml`; `project-local-sketch/panel.manifest.toml` (Phase-5 local-domain escape hatch).

JSON:
- Identity: `.claude-plugin/marketplace.json` (5 plugins + deps); `plugins/*/.claude-plugin/plugin.json` (minimal identity).
- Harness: `.claude/settings.json` (allowed Bash/skill permissions).
- Create-once records (real, in `projects/`): `retros/project.json`, `retros/phase-<N>-tier-<N>.json` (e.g. archived `shared-insights/retros/project.json` 4125B; `guild-hirefest/retros/project.json` 5280B).
- `RECOVERY-STATUS.json` — single-instance-per-slug sub-agent failure resume file (none live at audit time).
- Fixtures (schema, not live): `config-basic.json`, `manifest-basic.json`, `checkin-*.json`, `session-basic.json`, `retro-*.json`.

JSONL:
- `projects/<slug>/.guild-findings.jsonl` — append-only evaluator findings (e.g. archived `guild-hirefest/.guild-findings.jsonl` 1708B; record: `{ts, slug, branch, unit, evaluator, code, signature, evidence, severity}`).
- `plugins/loom/cli/fixtures/events-all-types.jsonl` — fixture only; the live `events.jsonl` is retired (folded into manifest `[[events]]`).

Markdown-as-structured-prose:
- `projects/<slug>/PLAN.md`, `RESEARCH.md`, `RESEARCH-NOTES.md`, `INTERVIEW.md`, `INSIGHTS.md`, project-specific scans.
- `projects/adr-log/NNNN-<slug>.md` — workspace ADRs (`- Date:` / `- Status:` pseudo-frontmatter).
- `learnings/session-notes/<date>-<topic>.md` — `**Date**:` / `**Source**:` / `**Status**:` bold-key frontmatter.
- Frontmatter across these is loose (bold-key or pseudo-YAML), not machine-parsed.

## Sweep 2 — documented intent (read-only agent)

Primary intent sources:
- `plugins/commons/docs/LOOM-CONVENTIONS.md` — canonical artifact shapes; single-file TOML manifest with sectioned `[[...]]` append-only sections; atomic temp+rename writes; schema_version additive evolution; PR state derived not stored.
- `projects/archive/2026-05-26-substrate-consolidation/PLAN.md` (M1) — the intentional migration decision: consolidate `manifest.json` + `config.json` + `events.jsonl` + `checkins/` + `sessions/` into one `manifest.toml`; hand-rolled zero-dep TOML parser ported from `jelly-loom`; CLI state verbs are working-tree writers (mutate, never commit).
- `projects/CONVENTIONS.md` — three write-safety categories: Category 1 append-only (`.jsonl` findings), Category 2 partitioned (branch/NN/date keys), Category 3 single-writer-serialized (PLAN.md, manifest, plans/). (Doc still names `manifest.json` — see drift.)
- `plugins/commons/docs/SUBSTRATE-COMPOSITIONS.md` — recipes (State refresh, Phase update, Checkin write, Session save, Retro write) wrapping the manifest TOML sections; retros write JSON to a `retros/` partition.

Relevant ADRs:
- ADR-0003 — distinguish manifest-write (substrate state, uncommitted) from git-commit (feature bundle). Two-boundary commit model.
- ADR-0006 — cached plugin binaries non-authoritative in dev; prefer `node plugins/loom/cli/loom.ts`.
- ADR-0007 — commons-sync invariant enforced via CI (`sync-check.yml`) + pre-commit hook + `npm run check`.
- ADR-0008 — loom is a partial lib-consumer (`LIB_MIRROR_ALLOWLIST`, 5 stable utils) because its `cli/lib` diverged ahead of commons during consolidation.
- ADR-0004 — split `sync-shared` per-tier; superseded in practice by flag-based scoping; formal supersession still open.

Consistency verdict from the sweep: the contradictions found are documentation drift, not design drift — the code implements the intended single-TOML design correctly. `projects/CONVENTIONS.md` (manifest.json), `AGENT-CONVENTIONS.md` (manifest.json in two spots), and five skill bodies are the stale surfaces.
