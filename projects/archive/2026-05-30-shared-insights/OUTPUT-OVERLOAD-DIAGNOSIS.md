# Diagnosis — output-token / overload crashes (Phase 7)

**Status:** reasoned inference, not forensic confirmation. Written 2026-05-31 without access to the 11 wiped sessions, the Claude Code harness `max_tokens` config, or the `/insights` analyzer internals. The remediation is gated on this diagnosis (PLAN Phase 7: *confirm the cause before changing habits*); where the cause is unconfirmed, the remedy is deliberately conservative.

## The claim under investigation

INSIGHTS #1 (highest-cost item): *"Roughly a third of the month's sessions (~11) were left unanalyzable because responses exceeded the output maximum during long `ev-run`/`loom` runs — whole transcripts wiped — with API 529 (Overloaded) errors fragmenting iterative loops on top."* A "~500 output-token" figure was attached to the cap.

Boulder's dissent (recorded in the PLAN): the 500 figure is implausibly small; sessions in the same window produced far larger responses without tripping it. More likely a misconfigured `max_tokens`, a specific call path, or an analyzer artifact than a general "responses are too long" problem.

## The finding

**The claim conflates two distinct failure modes that have different causes and different remedies. Separating them is the core of the diagnosis.**

### A. "Responses exceeded the output maximum (~500 tokens)" — NOT a real general cap

The evidence does not support a real ~500-token per-response output cap:

1. **Direct counter-evidence from this project's own execution.** Phases 1–6 of this remediation were driven in a single long agent session that emitted dozens of multi-thousand-token responses — full phase reports, PR bodies of ~1.5–2k tokens, dense evaluator packets, multi-section convention edits — with **zero** output-cap truncations and **zero** 529 errors. A real ~500-token cap would have made that session structurally impossible. Boulder reached the same conclusion in the same window — corroboration, though it is the same *class* of observation (large responses happened, so no cap), not a second independent line of evidence. The grep result below is the genuinely separate leg.
2. **No repo-level `max_tokens` to misconfigure.** A grep of the whole tree finds no output-budget setting (`max_tokens`/`maxTokens` as an output cap) anywhere in `plugins/`, `scripts/`, or `.claude/`. The only hit is an unrelated `maxTokens = 5` kebab-slug length limit in `griot capture`. So "misconfigured budget" cannot be a *repo* bug — any such setting lives in the Claude Code harness, outside this repo's control.
3. **The "500" is most consistent with a measurement/analyzer artifact.** A deterministic 500-token cap would truncate *every* large response identically; what was actually observed was *whole transcripts wiped / unanalyzable* — a capture/transport failure, not clean per-response truncation. The most likely reading: the `/insights` accounting mis-derived "output maximum" from a truncated or lost transcript (e.g. a transport-size limit on transcript capture, or a sub-call's own `max_tokens`), and the "~500" number is an artifact of that mis-measurement rather than a real ceiling agents hit while generating.

**Confidence: high that there is no real ~500-token general cap; moderate on the precise artifact mechanism** (transport-size vs sub-call `max_tokens` vs analyzer arithmetic) — distinguishing those needs the harness config + a wiped session, which this diagnosis did not have.

### B. "API 529 (Overloaded) errors fragmenting iterative loops" — real, transient, separate

529 Overloaded is an Anthropic API capacity signal, not an output-length cap. It is:
- **Stochastic** (load-dependent, time-of-day-dependent), not deterministic — unlike a token cap, the same request can 529 once and succeed on retry.
- **A real failure mode** that genuinely fragments long multi-call loops (`ev-run` dispatching many subagents, `guild-validate` panels) — a single 529 mid-loop can strand a phase.
- **Independently remediable** with retry-with-backoff, which is standard for 529s.

This is the one half of the claim that is both real and actionable from inside the substrate.

### Why "whole transcripts wiped" most likely happens

The most coherent single story: a long session accumulates a large transcript; a 529 (or a transport/size limit) hits mid-stream; the harness or the `/insights` analyzer fails to recover the partial transcript and records the session as "unanalyzable," which the report then summarized as "exceeded the output maximum." The output-token framing is the *symptom description the analyzer reached for*, not the mechanism.

## Remediation decision (gated)

| Candidate remedy | Status | Action |
|---|---|---|
| Overload **retry-with-backoff** in the long loops | **Confirmed** (529 is real + standard-remediable) | **Ship** as a loop convention. |
| Write large deliverables to files incrementally | Cause unconfirmed (no real cap proven) | **Document as defensive hygiene**, explicitly NOT a cap-workaround. It reduces blast radius if a transcript IS lost, regardless of mechanism — good practice on its own merits. |
| Stream progress per phase | Cause unconfirmed | Same — **hygiene**, not a mandated cap fix. (This project already did it: short per-phase reports, deliverables committed incrementally.) |
| Raise an output `max_tokens` budget | No such repo config exists; harness-level + unconfirmed | **Do nothing** — there is nothing in-repo to raise, and the cap is unconfirmed. |

This honors the PLAN's gate: the only behavior shipped as a *requirement* is the one the evidence confirms (529 retry-with-backoff). The cap-specific habits are framed as recommended hygiene, not mandated workarounds, because the cap they would work around is not confirmed.

## What would upgrade this from inference to confirmation

- The Claude Code harness `max_tokens` (output) setting for the relevant call paths — confirms/refutes "misconfigured budget."
- One recoverable wiped-session transcript — shows whether truncation was clean (cap) or lossy (transport/capture failure).
- The `/insights` analyzer's definition of "output maximum" — confirms whether "~500" is a measured ceiling or a derived artifact.

If any of these later contradicts this finding, revise the remediation accordingly — but the 529 retry-with-backoff stands regardless (529 is real under any reading).
