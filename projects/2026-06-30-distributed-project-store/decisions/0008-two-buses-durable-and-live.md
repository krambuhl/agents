# 0008. Two buses: durable git store + live control-plane

- **Status**: accepted (refines decisions 0006 and 0007)
- **Scope**: escalation + cross-env coordination transport

## Decision

There are **two complementary transports**, not one:

- **Durable bus — the git-synced store** (0006/0007). System of record:
  project state, decisions, learnings-at-rest, and *queued* questions.
  Async, eventual, survives node death. The audit trail and the fallback.
- **Live control-plane bus** (new). A low-latency worker↔host channel for
  **real-time human intervention** — a worker routes an
  `AskUserQuestion`-type prompt to the host so the operator can step in and
  **direct traffic now**, not on the next pull cycle. The same live bus
  carries **cross-env coordination**: broadcasting fresh learnings so peer
  envs pick them up promptly rather than waiting for git.

They **compose**:

- **Live is primary** for interactive moments (best-effort, fast).
- **Durable is the fallback and the record.** If the live bus is down or a
  request times out, the worker parks and the question/answer flows through
  the git store (0006/0007). Every live exchange is *also* committed, so the
  store stays the system of record.

This refines 0006's "git store is the sole transport" and 0007's "the
message bus is the store": the store remains the **durable** bus + system
of record; a **live** bus is added on top for latency-sensitive
interaction and coordination.

## Why

The git store is durable but poll-latency-bound (commit→push→pull). A human
directing traffic needs near-real-time question routing, and cross-env
learning sharing benefits from prompt propagation. A live bus provides
that; the durable store guarantees nothing is lost when the live bus is
absent.

## Mechanism (open — Phase 9 research)

- A **broker interface**: `ask(question) → answer`, `publish(learning)`,
  `subscribe`. Backed by an operator-configured transport.
- Idiomatic candidate: an **MCP broker the host runs**; workers reach it as
  an MCP tool over their outbound connection. Alternative: a lightweight
  HTTP long-poll or pub/sub (Redis/NATS) endpoint.
- Worker integration: a **post-and-wait** call on an ADR moment, with
  **git-store fallback** on timeout/unavailable.
- Host (full-scope, human-attended) surfaces live questions via
  `AskUserQuestion` (or Remote Control if the operator is away) and answers
  over the bus.

## Consequences

- Phase 9 escalation = **live bus primary + durable git fallback**.
- Cross-env learning sharing rides the same live bus (broadcast), with git
  (the griot learnings tree) as the durable record.
- Open: the transport choice, and auth/connectivity from coder workers to
  the host's broker — resolved in Phase 9.
