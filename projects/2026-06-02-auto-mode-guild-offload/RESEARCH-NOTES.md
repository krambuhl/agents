# Research notes & citations — guild-offload posture

## Primary-source probes (this repo / live harness)

- **Live env probe (crux, § A)** — ran `env | grep -iE "CLAUDE|PERMISSION|..."`
  inside a loop-equivalent Bash subprocess on 2026-06-02, harness v2.1.160.
  Result: CLAUDE-family vars present are `CLAUDECODE=1`,
  `CLAUDE_CODE_ENTRYPOINT`, `CLAUDE_CODE_EXECPATH`, `CLAUDE_CODE_SESSION_ID`,
  `CLAUDE_CODE_TMPDIR`, `CLAUDE_EFFORT`, `AI_AGENT`. **No permission-mode
  variable.** This is the decisive ABSENT evidence.
- `.claude/settings.json` — `permissions.allow` only (loom/guild/griot CLIs
  + `git fetch`). No `defaultMode` key.
- `.claude/settings.local.json` — has a `permissions` block; grep for
  `defaultMode|permissionMode|acceptEdits|bypassPermissions` → NONE.
- `plugins/ev/skills/ev-loop-interactive/SKILL.md` — auto-mode contract
  (step 2.1 contract negotiation, step 5 scope-shift accept-flip, step 5.5
  ADR-emit auto branch); event emissions (auto-mode-entered/converged/
  budget-exhausted); the uncovered touchpoints (decomposition confirm
  step 1, ordering picks, execution forks step 2.2, checkpoint/PR step 7).
- `plugins/ev/skills/ev-loop-confidence/SKILL.md` — tiers/tier-contract,
  gate-and-ratchet, tactical retros, delegation defaults ON, tier-4+
  routing to interactive; NO spelled-out auto-mode negotiation branch, NO
  scope-shift accept-flip.
- `plugins/ev/docs/AGENT-CONVENTIONS.md` § Auto-mode and the two-budget
  shape — convergence rule (silent panel | two-budget exhaust); default
  budgets (3 rounds; 5 ambiguities/unit interactive); budget-exhausted
  recovery = partial artifact + UNRESOLVED.md + RECOVERY-STATUS.json +
  exit non-zero. (Note: AGENT-CONVENTIONS.md lives at
  `plugins/<plugin>/docs/`, not repo root — it is a commons-synced doc.)
- `plugins/guild/skills/guild-plan/SKILL.md` — invocation
  (engineers/brief/plan), locked output JSON, composes /guild-spawn,
  contradictions=[] in v1 (future-work), agent_signals (confidence +
  gated/recused/operator-judgment), multi-round prior-state mechanism,
  engineers read-only.
- `plugins/loom/cli/verbs/loom/pr.ts` (`prOpen`, lines 140-199) —
  OPEN_OPTIONS = {title, body-file, branch, base}; composes
  `gh pr create --title --body-file [--head] [--base]`. **No --draft.**
  Repo grep for `draft` in `plugins/loom/cli/` → only draft-project /
  draft-plan, nothing PR-draft.
- `plugins/ev/docs/SUBSTRATE-COMPOSITIONS.md` § Compose PR (pr discover /
  open / update; subscribe-at-open; PR state derived not cached) and
  § Derive panel (file-list → evaluator panel).

## External / web sources

- [anthropics/claude-code#6227 — Feature Request: Expose Active Permission
  Mode to Hooks and Statusline](https://github.com/anthropics/claude-code/issues/6227)
  — **closed as not-planned/duplicate.** Confirms the active permission
  mode is NOT exposed today; proposes an `activePermissionMode` payload
  field; names the settings-parse workaround as unreliable (misses
  `--permission-mode` session overrides). DECISIVE for crux ABSENT verdict.
- [Choose a permission mode — Claude Code Docs](https://code.claude.com/docs/en/permission-modes)
  — modes (default/acceptEdits/plan/auto/dontAsk/bypassPermissions); set
  via `--permission-mode` flag, Shift+Tab, `permissions.defaultMode`;
  `defaultMode: "auto"` ignored from project/local settings (only
  `~/.claude/settings.json`); **auto mode "still asks when your prompt or
  a skill explicitly relies on it"**; in auto mode **subagent frontmatter
  `permissionMode` is ignored** and broad `Bash(*)`/`Agent` allow-rules
  are dropped; classifier checks subagent spawn/actions/return.
- [Customize your status line — Claude Code Docs](https://code.claude.com/docs/en/statusline)
  — statusline stdin JSON schema: model, workspace, output_style, cost,
  context, session_id, transcript_path, cwd, version. **No permission-mode
  field.**
- [anthropics/claude-code#49525 — PermissionRequest setMode bypassPermissions
  silently dropped 2.1.110+](https://github.com/anthropics/claude-code/issues/49525)
  — tangential: a hook *setting* the mode (setMode:bypassPermissions) is
  silently dropped since 2.1.110; reinforces that programmatic mode
  control/observation is fragile. Not load-bearing for the verdict but
  corroborates the fragility.

## Cross-references to MEMORY (durable substrate facts applied)

- guild agent registry names are VOLATILE across recompiles; spawn from
  the live available-agents list, never memory/derive-panel output.
  Whiteboard glob returns zero. → § C registry-mirror-lag fallback rule.
- loom skills commit to whatever branch is checked out (no branch
  awareness). → relevant to autonomous multi-phase branch hygiene.
- cached binaries lag source (ADR-0006) → used `node plugins/loom/cli/loom.ts`
  for all loom probes here.
- L-004 session boundary: runtime registry loaded once per process start;
  /clear is not a boundary. → § C session-boundary constraint.
