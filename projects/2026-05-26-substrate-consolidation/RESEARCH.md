# Research — substrate consolidation

The empirical foundation for consolidating the experimental substrate forks back into `loom` / `guild` / `ev`. Findings were gathered in-session: a teardown of the jelly family's distinctive designs, a comparison against the canonical plugins, and a fan-out inventory of the Linear family. Each section names the finding the corresponding plan decision rests on.

## 1. `/goal` is not model-invocable — jelly-run is structurally dead

`/goal` is a native built-in Claude Code command compiled into the binary; there is no `goal.*` file under `~/.claude`, so it cannot carry a `disable-model-invocation` flag — it is a category boundary, not a setting. The Skill tool's own contract excludes built-in CLI commands ("Do not use this tool for built-in CLI commands like /help, /clear"). The operator can type `/goal`; a skill or agent cannot reach it.

The invocation arrow is one-way: *inside* a `/goal` session the lead agent can call registered skills, but no skill can call `/goal`. jelly-run's premise — a skill that invokes `/goal` and auto-chains a PR step — was built on the inverse, which does not exist. The preflight and preamble-composition CLI verbs work; the orchestration handoff is impossible. This is the single dead design; there is nothing to harvest from jelly-run beyond the negative result.

## 2. The 3-axis agent model beats baked agents — and the costs are asymmetric

`jelly-guild` factors an agent's identity into three orthogonal axes — personality (HOW), domain (WHAT), phase (WHEN) — and composes them at dispatch. `guild` instead ships ~21 baked agent files, each fusing one disposition x one domain x one role. The duplication is visible: `whiteboard-a11y` and `evaluator-a11y` both carry a11y knowledge; `whiteboard-react-architect` and `evaluator-react-api` are the same react domain at different phases; `whiteboard-skeptic` is not a domain at all but the skeptic personality. The collapse is bigger than the 21-file count suggests, because much of the apparent variety is phase and personality wearing a domain costume.

The two costs of collapsing fall **asymmetrically**:
- **Tool scoping**: every `whiteboard-*` agent is read-only (`Read, Glob, Grep`); every `evaluator-*` agent carries narrowed, domain-specific Bash grants (`evaluator-a11y` → `Bash(npm run test:a11y:*)`). The Agent tool fixes tools from frontmatter and cannot narrow them per-dispatch, so a domain-agnostic personality cannot reproduce evaluator least-privilege.
- **Turn budget**: evaluators run at `maxTurns=5` and already bail; two mandatory mode-file reads before the first action is exactly the wrong place to spend turns. Whiteboards have loose budgets.

Both costs land on evaluators, neither on whiteboards. The resolution is build-time composition: generating scoped agent files from the axes gives each combination correct least-privilege frontmatter and inlined content — solving both costs with one mechanism, where jelly-guild's runtime composition needed two mitigations and still carried broad grants.

## 3. Single-file TOML state is viable at loom's scale

`jelly-loom` keeps project state in one declarative `manifest.toml`; `loom` spreads it across `manifest.json` + `config.json` + `events.jsonl` + `checkins/` + `sessions/`. The textbook objection to folding an append-only event log into a rewritten file — append integrity, concurrent-write safety, audit trail — is sound for a high-volume, multi-writer, audit-critical log. loom is none of those: dozens of events, a handful of checkins, one operator at a time, total state in kilobytes. Append-only was always a discipline the CLI enforced (verbs only append), not a property jsonl guaranteed. A rewrite-the-whole-file TOML model with atomic temp+rename writes is fine at this scale, and consolidation directly addresses the operator's lived pain: scattered machine state produced PRs that were *just* machine files.

`jelly-loom` hand-rolled a zero-dependency TOML parser (`manifest-invalid-toml` errors throughout `manifest.ts`) to stay Node strip-only safe — real source material to adapt rather than reinvent.

## 4. Revision recording — co-located vs event-stream

Both substrates record plan revisions, but differently. `loom` emits `plan-revise-*` events into the event stream (queryable, divorced from the artifact). `jelly-loom`'s `revise` verb replaces the file *and* appends to a revision log, co-located with the plan and coupled to the edit so the two cannot drift. A revision decomposes into a machine record (timestamp, target, sequence) and a human rationale (why it changed); the former is state, the latter is documentation — they want different homes.

## 5. linear-loom / ev-linear inventory — mostly Linear-specific

A fan-out inventory found `linear-loom` is real, functional code (~57 TS files, 11 verbs, 17 lib, 28 tests) and `ev-linear` is spec-only (3 skill bodies) that strictly depends on it.

Genuinely harvestable, general-purpose:
- **Recipe composition** (ev-linear `SUBSTRATE-COMPOSITIONS.md`): named recipes that loop bodies reference, instead of ambient skill invocation. Aligns with the operator's "ambient skills are noise" posture.
- **Preflight CLI checks** (ev-linear skill bodies): `command -v` dependency checks that fail fast.
- **Plan-parser as a shared lib** (`linear-loom/cli/lib/plan-parser.ts`): typed markdown parsing extracted from skill prose.

Not harvestable — Linear-context-specific:
- **Composed stable keys** and **marker files** solved Linear's two-source reconciliation (PLAN.md ↔ Linear state). Single-source loom has nothing to reconcile.
- **JSON-schema output contracts** existed so ev-linear could parse linear-loom read-verbs safely; deleting that consumer removes the justification (deferred, not harvested).

## 6. Deletion is mechanically safe

No TypeScript imports cross from `loom`/`guild`/`ev` into any fork. The only reference is an entry in the marketplace-manifest test (`plugins/commons/cli/marketplace-manifest.test.ts`). ev-linear depends on linear-loom (not vice versa); neither the jelly nor Linear families depend on the other, and none depend on the canonical trio. Deleting all six, with the marketplace test entries dropped, leaves no dangling references.
