# Research context

**Question.** The repo mixes Markdown, JSON, and TOML for what looks like overlapping purposes. Audit the *actual* state of how the system persists state across these formats, and determine whether there is a coherent design intent or whether formats are used ad hoc.

**Scope.** `agents-nebula` — the `krambuhl` Claude Code plugin marketplace (`commons` / `griot` / `guild` / `loom` / `ev` / `agent-loop-full`). The audit covers both runtime state (`projects/`, `learnings/`, guild codegen artifacts) and source-tree state (plugin identity, settings, fixtures).

**Method.** Direct repository audit, not panel research — the topic was settled by evidence rather than open-ended. Two parallel read-only sweeps mapped the format landscape and the documented intent; their load-bearing claims were then verified against live source with `find`/`grep`/`git` and by reading the `loom research` verb implementation. Counts and file:line citations below are from the working tree as of 2026-06-02. Raw evidence is in `RESEARCH-NOTES.md`.

**Headline.** There is a coherent, documented, format-per-purpose design. The apparent "format soup" is almost entirely *history plus documentation lag*, not architectural fork: the runtime is fully consolidated onto a single TOML manifest per project, and the only live gap is convention docs and skill prose that still name the retired five-file JSON/JSONL model.

---

## Finding 1 — There is a coherent format-per-purpose design

Each format has a defined job. The mapping is documented canonically in `plugins/commons/docs/LOOM-CONVENTIONS.md` and enforced by the `loom` CLI's write surface.

| Format | Role | Representative artifacts |
| --- | --- | --- |
| **TOML** | Live, mutable state-of-record | `projects/<slug>/manifest.toml` (project state); `plugins/guild/modes/axes.toml` + `plugins/guild/agents/.cache.toml` (guild codegen) |
| **JSON** | Identity + create-once / partitioned records | `.claude-plugin/marketplace.json`, `plugins/*/.claude-plugin/plugin.json`, `.claude/settings.json`, `projects/<slug>/retros/*.json`, `RECOVERY-STATUS.json` |
| **JSONL** | Append-only unbounded streams | `projects/<slug>/.guild-findings.jsonl` (evaluator findings) |
| **Markdown** | Human-facing narrative / structured prose | `PLAN.md`, `RESEARCH.md`, `RESEARCH-NOTES.md`, `INTERVIEW.md`, `projects/adr-log/NNNN-*.md`, `learnings/session-notes/**` |

The split is not arbitrary — it tracks a concurrency model documented in `projects/CONVENTIONS.md` (the three write-safety categories: append-only, partitioned, single-writer-serialized). Format follows write-discipline:

- **One mutable shared state-of-record** per project → a single TOML file, rewritten atomically (temp + rename), with `[[...]]` array sections that are append-only by CLI discipline.
- **Independent create-once records** (a retro, a recovery file, plugin identity) → JSON, because partitioned/write-once data has no concurrent-mutation hazard.
- **Unbounded append streams** (evaluator findings) → JSONL, the natural shape for safe concurrent appends (Category 1).
- **Anything a human reads or edits** → Markdown.

A load-bearing corollary: **derived state is never persisted.** PR open/merged status is fetched on demand via `loom pr discover` (→ `gh`), not cached in the manifest (`LOOM-CONVENTIONS.md`).

---

## Finding 2 — The JSON/JSONL → TOML consolidation is complete in the runtime

The manifest was once five files: `manifest.json` + `config.json` + `events.jsonl` + `checkins/<branch>/<NN>.json` + `sessions/<date>-<letter>.json`. The `substrate-consolidation` project (M1) folded all of them into one sectioned `manifest.toml` with `[meta]`, `[config]`, `[[phases]]`, `[[events]]`, `[[checkins]]`, `[[sessions]]`, `[[revisions]]`.

Verified against live source (2026-06-02):

- **19 of 19** real (non-fixture) project manifests are `manifest.toml`. (`find projects -name manifest.toml | grep -v fixtures | wc -l` → `19`.)
- **Zero** live `manifest.json` / `config.json` / `events.jsonl` exist outside test fixtures. (`find projects -name events.jsonl -o -name config.json -o -name manifest.json | grep -v fixtures` → empty.)
- The `loom research init` verb source states it directly: *"All state lives in the single `manifest.toml` now (config.json / events.jsonl folded in), so it is the only state file to commit."* (`plugins/loom/cli/verbs/loom/research.ts`, in the auto-adopt block.)

The remaining `.json`/`.jsonl` files in `plugins/loom/cli/fixtures/` (`manifest-basic.json`, `config-basic.json`, `events-all-types.jsonl`, `checkin-*.json`, `session-*.json`) are **round-trip / regression test fixtures**, not live state. Their presence is the main source of the "still using JSON" impression; they are test scaffolding for the consolidated model, not a parallel live model.

The consolidation is also governed by a two-boundary commit model (ADR-0003, "Distinguish manifest-write from git-commit"): a `loom` state verb mutates `manifest.toml` in the working tree, and a separate git-commit later wraps the manifest update + code + artifacts into one revertable bundle.

---

## Finding 3 — Guild codegen TOML is a separate lineage, not loom project state

Two of the live TOML files are unrelated to the loom project manifest and should not be conflated with it:

- `plugins/guild/modes/axes.toml` — the declarative cross-product source for the guild antagonist panel (domains × phases × personalities). It replaced the legacy `panel.manifest.toml` + `tools-map.toml` (`axes.toml` header comment).
- `plugins/guild/agents/.cache.toml` — per-cell fusion cache (hashes of the three fragments + fusion prompt) used by `guild compile` to detect drift without re-running the LLM.

These are build/codegen inputs for agent generation, a different concern from per-project lifecycle state. Both legitimately use TOML for the same reason the manifest does: human-editable, diff-stable, sectioned config.

---

## Finding 4 — The one real gap: documentation and skill prose lag the code

The architecture is consolidated; the *prose describing it* is not fully updated. These are live references to the retired model (not historical "it used to be" mentions):

- `plugins/commons/docs/AGENT-CONVENTIONS.md:24` — describes `LOOM-CONVENTIONS.md` as covering project shapes "(`manifest.json`, `events.jsonl`, etc)".
- `plugins/commons/docs/AGENT-CONVENTIONS.md:195` — "`RECOVERY-STATUS.json` lives at the project root, alongside `manifest.json`" (should be `manifest.toml`).
- `projects/CONVENTIONS.md:70,71,73,91` — names `manifest.json` as the live single-writer exception file and the target of `loom phase update`.
- Five skills still name the dead `events.jsonl` / `config.json` / `manifest.json` trio in their prose: `plugins/ev/skills/ev-loop-interactive`, `ev-loop-confidence`, `ev-run`, `plugins/loom/skills/loom-plan`, `plugins/loom/skills/loom-research`. Notably, the `loom-research` skill's own step-7 report template instructs the agent to report `manifest.json, config.json, events.jsonl` — files the live `loom research init` no longer produces.

Correctly-historical references that should **not** be "fixed": `plugins/commons/docs/LOOM-CONVENTIONS.md:43` and `:127` mention `manifest.json` only to describe the pre-consolidation state ("project state lived in five separate files", "folded `manifest.json` + `config.json` + ... in"). Those are accurate history.

Two scoping notes for any cleanup that follows:

- `plugins/commons/docs/AGENT-CONVENTIONS.md` is commons-canonical (synced into consumers by `scripts/sync-shared.ts`); editing it requires a follow-up sync run, and the drift check (ADR-0007: pre-commit hook + `sync-check` CI) will enforce it.
- `projects/CONVENTIONS.md` is a runtime doc at the `projects/` root, not commons-synced — edit in place.
- `ADR-0004` (split `sync-shared` into per-tier verbs) is marked accepted but superseded in practice by flag-based scoping (`--only` / `--exclude-lib`); a formal superseding ADR is an open thread, not part of this format audit.

---

## Conclusion

The system has an intentional, documented design for state persistence: **TOML for the single mutable project state-of-record (plus guild codegen inputs), JSON for identity and create-once/partitioned records, JSONL for append-only streams, Markdown for human-facing prose — and no persistence of derived state.** The runtime fully reflects this design; the consolidation from the old five-file JSON/JSONL manifest is complete. The only outstanding work is documentation hygiene: a handful of convention docs and skill bodies still reference the retired `manifest.json` / `config.json` / `events.jsonl` names. That is a low-risk, well-scoped cleanup — drift in the prose, not in the architecture.

**Next.** Run `/loom-plan 2026-06-02-state-file-format-audit` to compose a cleanup PLAN grounded in Finding 4 (a docs/skills de-drift pass), or cite this dossier directly from an `/ev-loop-interactive` inner-RPI hop.
