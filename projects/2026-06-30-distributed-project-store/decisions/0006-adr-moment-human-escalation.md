# 0006. Autonomy keeps the human in ADR moments

- **Status**: accepted
- **Scope**: project scope (autonomy / escalation posture for dispatch)

## Decision

Autonomous dispatch (`--mode=auto`, `--env=*` dispatch) handles **routine**
decisions via the guild evaluator panels, but a decision classified as an
**ADR moment** is **never offloaded to a panel** — it escalates to the
human. Autonomy is the default; the human is not omitted from
ADR-worthy decisions.

**Escalation channel — portable primary: the shared store.** On an
ADR-moment, the dispatched run records an async **question** as a
partitioned record in the shared project repo (e.g.
`questions/<id>.md`, or a pending `decisions/` entry) and **parks** that
phase/site. The operator answers (a commit, or a web UI that writes the
commit); the loop picks the answer up on the next **pull-before-act**
(decision 0002) and resumes. This is ADR-0009's deferred "v2 non-blocking
escalation," realized for free by this project's git-as-awareness layer.

**Remote control is NOT available for this autonomous path** (verified —
see the constraint section); the git-synced channel is the only transport.

## Why

Forcing `--mode=auto` (decision: dispatch implies auto-mode, ADR-0011 §5)
fixed the "inner Claude hangs on a question" failure, but it also routes
*every* decision — including genuinely important ones — to panels. The
operator's principle: do not omit the human from ADR moments. So the
auto-mode panel keeps routine throughput; ADR-classified decisions break
out to the human.

## The remote-control constraint (VERIFIED, load-bearing)

Verified against the Claude Code docs (`remote-control.md`,
`authentication.md`) + GitHub issue #33105. The natural instinct —
"auto-enable `/remote-control` on the coder box" — is **not available** for
this project's headless + subscription-token autonomy. Three independent
blockers:

1. **Scope.** `setup-token` / `CLAUDE_CODE_OAUTH_TOKEN` is **inference-only
   and cannot establish Remote Control sessions** (docs, verbatim: *"These
   tokens are limited to inference-only and cannot establish Remote Control
   sessions. Run `claude auth login` to authenticate with a full-scope
   session token instead."*). Remote Control requires the
   `user:sessions:claude_code` OAuth scope, obtained via interactive
   `/login` — not setup-token (issue #33105).
2. **Process model.** Remote Control needs a **persistent running process**
   (interactive session or `claude remote-control` server mode). Dispatch
   runs `claude -p`, which is non-interactive and **exits immediately** — it
   cannot be remote-controlled.
3. **Interaction model.** Remote Control is "continue/steer a session from
   another device" — a *take-the-wheel* model, not an *agent-parks-and-asks*
   escalation. It does not provide the async-question semantics we want.

No single configuration gives headless + remote-controllable + subscription
+ non-interactive (verified matrix). Achieving remote control would mean
giving up headlessness (persistent server-mode session) AND swapping the
subscription `setup-token` for an interactive full-scope `/login` — a
different deployment, not a layer on the autonomous one.

**Therefore (locked):** the shared-store async question channel is the
escalation transport of record. It needs no special credential and rides
the coherence layer we are already building. Remote control is **out of
scope** for the autonomous-dispatch path; it remains available only to an
operator running a separate, full-scope, persistent interactive session,
which is a different mode this project does not build.

## Open questions (for the phase to resolve)

- **ADR-moment classification.** Reuse the existing `[adr-candidate]`
  marker / ADR-emit hook + a severity threshold so the loop knows when to
  escalate vs. auto-decide.
- **Park granularity.** Does parking block only the affected phase/site
  (others proceed) — true non-blocking — or the whole run? Prefer
  per-phase/site parking, which the partitioned model already supports.
- **Notification.** How the operator is alerted a question is waiting
  (notification system / a `questions/` poll).
