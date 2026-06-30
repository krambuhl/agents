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

**Remote control is an optional richer UI, not the load-bearing path.**

## Why

Forcing `--mode=auto` (decision: dispatch implies auto-mode, ADR-0011 §5)
fixed the "inner Claude hangs on a question" failure, but it also routes
*every* decision — including genuinely important ones — to panels. The
operator's principle: do not omit the human from ADR moments. So the
auto-mode panel keeps routine throughput; ADR-classified decisions break
out to the human.

## The remote-control constraint (load-bearing)

The natural instinct — "auto-enable `/remote-control` on the coder box" —
collides with this project's autonomy auth:

- A `setup-token` credential (subscription billing, used for headless
  autonomy) is **inference-only and cannot establish Remote Control
  sessions** (Claude Code docs, fetched this session — verify before
  relying on it).
- Dispatch runs headless `claude -p`, which is non-interactive; remote
  control targets interactive sessions.

So remote control is **not** the portable escalation mechanism for a
subscription-token headless box. The shared-store async question channel
is — it needs no special credential and rides the coherence layer we are
already building. Remote control may be layered on *where a full
interactive, remote-control-capable session exists*, as a nicer answering
UI, but the transport of record is the git-synced question/answer.

## Open questions (for the phase to resolve)

- **ADR-moment classification.** Reuse the existing `[adr-candidate]`
  marker / ADR-emit hook + a severity threshold so the loop knows when to
  escalate vs. auto-decide.
- **Park granularity.** Does parking block only the affected phase/site
  (others proceed) — true non-blocking — or the whole run? Prefer
  per-phase/site parking, which the partitioned model already supports.
- **Notification.** How the operator is alerted a question is waiting
  (notification system / a `questions/` poll).
