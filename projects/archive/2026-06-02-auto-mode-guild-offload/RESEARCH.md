# Research dossier: guild-offload posture for the ev execution loops

**Topic.** A `guild-offload` posture for the ev execution loops. While
Claude Code's auto-mode is enabled, the ev loops (`/ev-loop-interactive`
primarily, `/ev-loop-confidence` secondarily) should run a phase
autonomously — offloading the in-loop questions they'd normally ask the
human to guild agent panels — and surface to the human only at the PR
boundary ("only release for PR").

This dossier **de-risks and grounds** an already-resolved design; it does
not redesign. The resolved decisions under test:

1. Execution forks resolve via a per-fork guild-plan panel round.
2. Trigger couples to the HARNESS auto-mode (Claude Code's own
   auto-accept / autonomous state), not a flag.
3. Fallback if no harness signal: ship behind the loom `--mode=auto` flag.
4. Default = phase-at-a-time (open PR, stop, human merges); option =
   full-stack autonomous with draft PRs + auto-advance.
5. Shared convention in `docs/AGENT-CONVENTIONS.md`, both loops wired.
6. Escape hatch = draft PR + `UNRESOLVED.md` + budget-exhausted event,
   stop.

---

## (A) THE CRUX — Does the harness expose its permission/auto-accept mode? — **VERDICT: ABSENT**

**Decision #2 is NOT buildable as written.** Claude Code does **not**
expose the session's active permission mode to a running skill body, a
subagent, or a Bash subprocess. This is the load-bearing finding for the
whole plan: the "couple the trigger to the harness auto-mode state"
decision has no reliable signal to couple to today.

### What I checked

**Live process environment** (probed `env` inside this very Bash
subprocess, which is exactly the surface a loop's `Bash(...)` call sees):

The harness sets these CLAUDE-family variables, and *only* these:

- `CLAUDECODE=1`
- `CLAUDE_CODE_ENTRYPOINT=cli`
- `CLAUDE_CODE_EXECPATH=/Users/.../versions/2.1.160`
- `CLAUDE_CODE_SESSION_ID=<uuid>`
- `CLAUDE_CODE_TMPDIR=/tmp/claude-501`
- `CLAUDE_EFFORT=high`
- `AI_AGENT=claude-code_2-1-160_agent`

There is **no** `CLAUDE_PERMISSION_MODE`, no `acceptEdits` /
`bypassPermissions` / `auto` flag, no autonomous-state variable. A Bash
command launched by the loop can detect *that it is inside Claude Code*
(`CLAUDECODE=1`) and the *version* (`2.1.160`), but **not** the current
permission mode. (Probe run 2026-06-02 against harness v2.1.160.)

**Settings files** (`.claude/settings.json`, `.claude/settings.local.json`):
neither file in this repo carries a `permissions.defaultMode` key, and
even if one did, reading it is **unreliable** for this purpose — see the
"settings-parse is unreliable" note below.

**Hook payloads.** The `PreToolUse` / `PermissionRequest` / statusline
JSON payloads do **not** carry the active permission mode. This is the
subject of an explicit, **closed-as-not-planned** feature request:
[anthropics/claude-code#6227 — "Feature Request: Expose Active Permission
Mode to Hooks and Statusline"](https://github.com/anthropics/claude-code/issues/6227).
The request proposes adding an `activePermissionMode` field to the hook /
statusline stdin payload precisely because it is absent today; it was
closed (duplicate / not-planned). The statusline payload schema
([docs](https://code.claude.com/docs/en/statusline)) carries `model`,
`workspace`, `output_style`, cost/context fields, `session_id`,
`transcript_path`, `cwd`, `version` — but **no permission-mode field**.

**The `--permission-mode` CLI flag** ([permission-modes
docs](https://code.claude.com/docs/en/permission-modes)) sets the mode at
launch (`claude --permission-mode plan|acceptEdits|auto|dontAsk|bypassPermissions`),
and `Shift+Tab` cycles it mid-session, and `permissions.defaultMode` in
`~/.claude/settings.json` sets a default — but **none of these are
reflected in any runtime-queryable surface** a skill or subprocess can
read. The flag's value is not echoed to env, not written to a state file,
not exposed via any probe.

**Why settings-parse is unreliable** (the one "workaround" and why it
fails): even reading `permissions.defaultMode` out of `settings.json`
does not tell you the *active* mode, because (a) the mode can be set per
session via `--permission-mode` (overrides the file, leaves no file
trace), (b) cycled mid-session via `Shift+Tab` (no file trace), and (c)
`defaultMode: "auto"` is **deliberately ignored** from project/local
settings — only `~/.claude/settings.json` is honored for `auto`, so a
repo cannot read its own auto state from its own `.claude/`. Issue #6227
names this exact failure: settings-parse "fails to detect session-specific
overrides like `claude --permission-mode plan`."

### The decisive complication for THIS design — auto-mode strips subagent autonomy controls and *re-introduces clarifying questions*

Two facts from the [permission-modes
docs](https://code.claude.com/docs/en/permission-modes) cut directly
against the design's mechanism:

1. **Auto mode nudges Claude to keep working "though Claude still asks
   when your prompt or a skill explicitly relies on it."** So even in
   harness `auto` mode, a skill that *explicitly* asks the human
   (`AskUserQuestion`, "stop and ask the user") is still expected to ask.
   Auto-mode does not silence a skill's deliberate human touchpoints — it
   only discourages *gratuitous* ones. This means the loops' existing
   `AskUserQuestion` calls would still fire under harness auto-mode unless
   the loop *itself* re-routes them to panels. The harness won't do the
   offload for you.

2. **In auto mode, "any `permissionMode` in the subagent's frontmatter is
   ignored,"** and broad `Bash(*)` / `Agent` allow-rules are *dropped* on
   entering auto mode (narrow rules like `Bash(npm test)` survive). The
   guild panels the design wants to spawn mid-loop go through the `Agent`
   tool / `/guild-spawn`; `Agent` allow-rules are explicitly among the
   dropped-in-auto-mode rules. The classifier checks each subagent spawn,
   each subagent action, and the subagent's return. This doesn't *block*
   the offload, but it means panel spawns in harness-auto-mode route
   through the classifier and may add latency / occasional blocks — worth
   a smoke test, not a blocker.

### Recommendation for the plan

- **Treat decision #2 as currently unbuildable** and **promote the
  fallback (decision #3) to the primary, shipping mechanism.** The loom
  `--mode=auto` flag is the only reliable trigger today. The loops already
  support it (see § B). Build the whole posture on the flag.
- Keep decision #2 as a **documented future hook**: when (if) #6227 or an
  equivalent lands an `activePermissionMode` payload field or a
  `CLAUDE_PERMISSION_MODE` env var, the loop can opportunistically read it
  and auto-enable the posture. Write the coupling as a thin, optional
  probe with a graceful "signal absent → fall back to the flag" path —
  exactly the shape decision #3 already anticipates. Do not gate any phase
  on the signal existing.
- A *partial* signal is available and may be worth surfacing: a Bash probe
  can confirm `CLAUDECODE=1` + version. That tells you "we're in a managed
  harness" (vs a raw `gh`-only run) but **not** the permission mode. It is
  the same class of signal the PR-subscription path already uses
  (`mcp__github__subscribe_pr_activity` "unavailable" → fall back). Reuse
  that "managed vs local" framing; don't overload it into a mode detector.

**Bottom line: EXISTS? No. RELIABLE? No. ABSENT — confirmed by live env
probe + closed feature request #6227 + the statusline/hook payload
schema.** Ship on the flag (decision #3); wire decision #2 as an optional,
absent-by-default probe.

---

## (B) The existing `--mode=auto` surface this project extends

Both loops already implement a real auto-mode contract grounded in the
shared two-budget convention. The plan extends an existing surface, not a
greenfield one.

### The two-budget convention (`docs/AGENT-CONVENTIONS.md` § Auto-mode and the two-budget shape)

- **Mechanism**: auto-mode replaces the human with *panels* — **plans for
  divergent/generative questions, evaluators for convergent/auditing
  questions**. (This is exactly the lever the new posture needs: the
  convention already says generative forks go to plan panels.)
- **Convergence rule** — runs until one of two stop conditions:
  1. **Silent panel** — no engineer/evaluator raised a new question this
     round.
  2. **Two-budget exhaustion** — *per-decision rounds × per-session
     decisions* cap hit.
- **Default budget shape**: per-decision rounds = **3** everywhere;
  per-session decisions varies by skill. For `/ev-loop-interactive`
  unit-contract negotiation: **5 ambiguities per unit**.
- **Budget-exhausted recovery** produces three artifacts at project root —
  the **partial primary artifact**, **`UNRESOLVED.md`** (human-readable
  list of non-converged decisions), and **`RECOVERY-STATUS.json`**
  (machine-readable resume file) — then **exits non-zero**. *This is
  already the design's escape hatch (decision #6), minus the draft-PR
  step.* The convention's recovery shape and decision #6 are the same
  pattern; the plan should reuse the existing `UNRESOLVED.md` +
  budget-exhausted machinery rather than invent a parallel one.

### Auto-mode events already emitted (`/ev-loop-interactive` step 2)

- `auto-mode-entered` — detail `{surface: 'ev-loop-interactive', slug,
  decision_budget: 5, round_budget: 3}`.
- `auto-mode-converged` — `{surface, slug, decisions_completed,
  rounds_completed}`.
- `auto-mode-budget-exhausted` — `{surface, slug, decisions_completed,
  rounds_completed, reason: 'decision-budget' | 'round-budget'}`, plus a
  griot session-note capture.

These three events are the existing observability spine. The new posture
should extend this vocabulary (e.g. a `guild-offload-entered` /
per-fork-panel event), not replace it.

### What auto-mode currently covers vs the GAP INVENTORY

`/ev-loop-interactive` auto-mode today covers **only two** human
touchpoints, both via `evaluator-contract-fit` (an evaluator panel, the
convergent lens), NOT a plan panel:

- **Unit-contract negotiation** (step 2.1): the human approve/redirect is
  replaced by `evaluator-contract-fit` auditing the contract; `approved` =
  approve, `flagged` = redirect (one round per flagged field). Budget 3×5.
- **ADR-emit accept/decline** (step 5.5): the per-marker `AskUserQuestion`
  is replaced by `evaluator-contract-fit` reading the marked entry against
  ADR-0001; `approved` = accept, `flagged` = decline. Title is synthesized
  from the first ~7 words (no human-equivalent).
- **Scope-shift offer** (step 5): auto-mode flips the *default* from
  decline to **accept** on two-signal concurrence — it does not run a
  panel, it just changes the default branch and proceeds into the
  inner-RPI sub-sequence (which spawns `/loom-research` + `/loom-revise-plan`
  with `--mode=auto`).

**Human touchpoints in `/ev-loop-interactive` NOT yet covered by
auto-mode** — the gap inventory the plan's phases must close:

1. **Decomposition confirm** (step 1): "Show the decomposed list to the
   user … and confirm the decomposition before Step 2." No auto-mode
   branch exists. *Generative → plan panel candidate.*
2. **Ordering picks** (Ordering / step 1, "free" mode): "presents the
   decomposed set and asks the user to pick the next one." No auto-mode
   branch. *Generative → plan panel candidate.*
3. **Execution forks mid-unit** (step 2.2 Execute, Rules "The human
   co-pilots"): "ask when you hit a fork, report when you hit a dead end,
   don't charge ahead." This is the **central target of decision #1** and
   is **wholly uncovered** by auto-mode today. *Generative → per-fork
   plan-panel round (decision #1).*
4. **Implementer/fixer delegation opt-in** (steps 2.2, 4): per-unit switch
   the operator sets during negotiation; no auto-mode default is
   specified. (Minor — defaults OFF; auto-mode could keep OFF or wire a
   default.)
5. **ADR title** (step 5.5c): auto-mode synthesizes from first ~7 words —
   *partially* covered, but title quality is unaudited.
6. **Checkpoint / PR boundary** (step 7, step 3 Phase close): § Compose PR
   runs but there is **no auto-mode "stop at PR vs auto-advance"
   decision** — this is exactly what decision #4 (phase-at-a-time default
   vs full-stack autonomous) must add.
7. **Scope-shift sub-agent failure escalation** (step 5 failure flow):
   surfaces to operator. Auto-mode has no panel fallback; it inherits the
   sub-agent's `RECOVERY-STATUS.json`.

`/ev-loop-confidence` auto-mode coverage is **thinner**: it has the same
two-budget machinery available but its SKILL.md does **not** spell out an
auto-mode branch for unit negotiation, and its scope-shift step (step 5)
has **no auto-mode default-flip** (unlike interactive's accept-flip).
Implementer/fixer delegation defaults **ON** here (vs OFF in interactive).
See § E.

---

## (C) The fork → panel path (decision #1)

**The plumbing already exists and is exercised.** The loops invoke
`/guild-plan` at **phase start** today (the always-on "Plan" step). The
new mechanism is the same skill invoked **mid-unit, per fork** instead of
once per phase.

### Invocation shape (`plugins/guild/skills/guild-plan/SKILL.md`)

`/guild-plan` is invoked via the `Skill` tool with three args:

- `engineers=<comma-separated plan-* subagent_types>` (order preserved)
- `brief=<the design question>` (passed verbatim to every engineer)
- `plan=<repo-relative path>` (attributed artifact; auto-creates,
  auto-detects round number, appends `## Round N`)

It **composes `/guild-spawn`** (never calls `Agent` directly — "the
layering is the point") and returns locked JSON:

```json
{ "plan_path", "round", "sections": [{engineer, section}],
  "contradictions": [], "agent_signals": [{agent, confidence, outcome, reason}] }
```

### Synthesis into a single decision — caller's job, and a real gap

Critically, **`/guild-plan` does NOT iterate and does NOT auto-resolve
contradictions** (`contradictions` is `[]` in v1 — documented future-work,
"Phase 4+ concern"). The skill *collects* attributed sections; it does not
*decide*. So the per-fork offload must do its own synthesis:

- Spawn the panel with the fork as the `brief`.
- Read back the attributed sections + `agent_signals` (each engineer's
  `confidence` high/medium/low and `outcome` gated/recused/operator-judgment).
- **Apply the convention's convergence rule** (§ B): silent panel
  (no new question / consensus) → take the converged answer; else run
  another round (per-decision budget = 3); on budget exhaust → escape
  hatch.
- For multi-engineer disagreement, use the **multi-round prior-state
  mechanism**: round 2+ feeds each engineer the prior round's sections so
  they can call out and resolve conflicts. This is the documented path
  for contradiction handling until v1's `contradictions` detection lands.
- Watch for `operator-judgment` outcomes in `agent_signals`: an engineer
  escalating ("`VERDICT: operator-judgment-required`") is the panel's own
  "this needs the human" signal — the natural trigger to **break the
  offload and surface at the PR boundary** rather than force-resolve.

### Two substrate constraints that bite the per-fork path

- **L-004 session-boundary** (both loop bodies, the Plan step): the
  `plan-*` registry is loaded **once per Claude Code process start**;
  `/clear` is NOT a boundary. Any `plan-*` engineer *authored in the
  current session* must be dropped from the effective list manually. For a
  long autonomous run this is mostly benign (the roster is stable across
  the run) but matters if the same session that authors a new engineer
  then tries to spawn it.
- **plan-* registry-mirror lag** (MEMORY: guild agent registry names are
  volatile across recompiles; the whiteboard glob returns zero). The
  loops resolve engineers via `glob .claude/agents/plan-*.md`. If the
  glob returns zero AND no explicit `engineers=` override, both loops
  **skip the plan step with a one-line note**. For the per-fork offload
  this is a real risk: a fork that can't raise a panel must **not**
  silently charge ahead — it should fall back to the escape hatch (stop +
  `UNRESOLVED.md`), not to "decide it myself." The plan should specify
  this fallback explicitly. Durable rule from MEMORY: spawn from the live
  available-agents list, never from memory or derive-panel output.

---

## (D) Compose-PR / draft-PR (decisions #4 and #6) — **GAP: draft PRs are NOT supported today**

**`loom pr open` does not support `--draft`.** Both the escape-hatch
(decision #6) and the full-stack-autonomous option (decision #4) depend on
draft PRs, and the mechanism does not exist yet. This is a concrete setup
task for the plan's first phase.

### Evidence

`docs/SUBSTRATE-COMPOSITIONS.md` § Compose PR documents the wrapped verbs:

```bash
bin/loom pr discover <slug> --branch=<branch>
bin/loom pr open <slug> --branch=<branch> --title=<title> --body-file=<path> [--base=<parent-branch>]
bin/loom pr update <slug> --pr=<number> --body-file=<path>
```

The verb source (`plugins/loom/cli/verbs/loom/pr.ts`, `prOpen`) confirms
the gap: `OPEN_OPTIONS` is `{title, body-file, branch, base}` — **no
`draft` option**. The composed `gh` command is:

```
gh pr create --title <title> --body-file <path> [--head <branch>] [--base <base>]
```

There is **no `--draft` flag** passed to `gh pr create`, and a repo-wide
grep for `draft` in `plugins/loom/cli/` finds only unrelated
"draft-project" / "draft-plan" references — nothing PR-draft-related.

### What the plan needs (setup phase, decision #4/#6 enabler)

- Add a `--draft` boolean to `loom pr open`'s `OPEN_OPTIONS`, forwarding
  `--draft` to `gh pr create` when set. (`gh pr create --draft` is the
  standard, supported gh mechanism — the gap is purely in the loom wrapper,
  not in `gh`.) This is a small, well-isolated **setup/gate PR** in the
  three-phase sense: backward-compatible (default off = today's behavior),
  carefully reviewed, unblocks the rest.
- Mark draft → ready transition: the full-stack-autonomous option (#4)
  opens **draft** PRs per phase and auto-advances; at stack completion (or
  on human review) the drafts go ready via `gh pr ready <n>`. Consider a
  `loom pr ready` verb or document the bare `gh pr ready` call in
  § Compose PR.

### Other Compose-PR facts relevant to the posture

- **PR-activity subscription** (`mcp__github__subscribe_pr_activity`, fired
  once at fresh `pr open`) is what lets the router *park and exit* and be
  re-woken by review/CI/merge. The phase-at-a-time default (#4) maps
  cleanly onto this: open PR (non-draft) → subscribe → stop → human merge
  wakes the run. **Subscription "unavailable" (local `gh`-only session) is
  the existing precedent for "managed-harness vs local" branching** — the
  same fork the absent permission-mode signal (§ A) should reuse.
- PR state is **never cached** in the manifest; it's derived on demand via
  `loom pr discover` / `gh pr view`. The full-stack option must not try to
  stash draft-vs-ready state in the manifest — derive it from `gh`.
- `pr open` fails-loud with `pr-already-exists` (discover-first prevents
  double-open); `branch-not-pushed` requires `git push -u` first. The
  autonomous full-stack path must push each phase branch before its draft
  open.

---

## (E) Confidence-loop divergence (decision #5 — shared convention, both loops)

The shared `docs/AGENT-CONVENTIONS.md` convention must account for both
loops; here is where `/ev-loop-confidence` diverges from
`/ev-loop-interactive` so the convention covers both:

- **Unit shape: tiers vs deliverables.** Confidence runs a phase as
  ordered **tiers** (mechanical → bespoke, risk-ratcheting), each tier a
  batch of files under a **tier contract** (a specialization of the unit
  contract; subsequent units reference it for deltas only). Interactive
  runs **discrete deliverables**, each with its own full unit contract.
  The offload's "fork" granularity differs: in confidence a fork is more
  likely a *tier-assignment / batch-sizing* judgment; in interactive it's
  a *mid-deliverable design* fork.
- **Gate shape: gate-and-ratchet vs per-unit checkpoint.** Confidence has
  an explicit **gate-and-ratchet** between tiers — the gate to tier N+1
  closes if any tier-N unit is still flagged, verification is red, or the
  tier retro flagged a blocker. Interactive has no inter-tier gate; it
  checkpoints per deliverable. A full-stack autonomous posture (#4) in
  confidence must respect the ratchet gate as a natural **stop-and-surface
  point**, even mid-stack.
- **Tactical retros between tiers.** Confidence writes a tactical retro
  (`§ Retro write --type=session --phase=N --tier=M`) after each tier;
  interactive has no equivalent. An autonomous confidence run produces a
  retro trail the autonomous interactive run does not.
- **Auto-mode coverage is thinner in confidence** (see § B): its SKILL.md
  has **no spelled-out auto-mode branch for unit negotiation** and **no
  scope-shift accept-flip**. The shared convention must therefore *add*
  the offload to confidence more than it *extends* it — confidence is
  closer to greenfield for the auto-mode contract.
- **Delegation defaults invert.** Implementer/fixer delegation defaults
  **ON** in confidence (bulk transform → delegate the write) and **OFF**
  in interactive (keystroke pairing). The offload posture should preserve
  these defaults; auto-mode does not change *who writes*, only *who
  decides* (panels vs human).
- **Tier-4+ routing.** Confidence already routes tier-4+ (bespoke,
  high-risk) items to `/ev-loop-interactive` rather than handling them.
  Under full autonomy this hand-off is itself a fork that wants a panel
  decision or an escape-hatch stop — a high-judgment item in an
  autonomous bulk run is a strong candidate to surface to the human.
- **Empty file list / substrate-only** units derive to `contract-fit`
  only in both loops — the panel auto-derivation edge cases are shared, so
  the convention's offload rules can be written once and cited by both.

---

## Synthesis — what's grounded, what's at risk

**Grounded (build with confidence):**
- The panel-offload *mechanism* (decision #1): `/guild-plan` mid-loop is
  the same call the loops already make at phase start; the two-budget
  convergence rule already exists for it.
- The escape hatch (decision #6): the convention's budget-exhausted
  recovery already produces `UNRESOLVED.md` + `RECOVERY-STATUS.json` +
  `auto-mode-budget-exhausted`; the only addition is the draft-PR step.
- The flag fallback (decision #3): both loops already honor `--mode=auto`;
  this is the proven trigger surface.

**At risk (must be addressed in the plan):**
- **Decision #2 (harness-auto-mode coupling) is not buildable today** —
  ABSENT signal (§ A). Promote #3 to primary; wire #2 as an optional,
  absent-by-default probe behind a graceful fallback. Do NOT gate any
  phase on it.
- **Draft PRs don't exist** (§ D) — a `loom pr open --draft` setup task
  gates both #4 and #6.
- **Per-fork panel can silently no-op** if the `plan-*` glob is empty
  (registry-mirror lag, § C) — specify "no panel → escape hatch, never
  self-decide."
- **Harness auto-mode still lets skills ask** and **routes panel spawns
  through the classifier** (§ A) — the offload must actively re-route the
  loops' own `AskUserQuestion` calls; the harness won't do it, and panel
  spawns may see classifier latency/blocks worth smoke-testing.
- **Confidence-loop auto-mode is thinner than interactive's** (§ B, § E) —
  the shared convention adds more than it extends on the confidence side.
