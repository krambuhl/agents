---
name: grill-me
description: Interview the user relentlessly about a plan or design until reaching shared understanding, resolving each branch of the decision tree. Use when user wants to stress-test a plan, get grilled on their design, or mentions "grill me".
---

Interview me relentlessly about every aspect of this plan until we reach a shared understanding. Walk down each branch of the design tree, resolving dependencies between decisions one-by-one. For each question, provide your recommended answer.

Ask the questions one at a time.

For a consequential fork — a decision that changes what we do next, with 2-4 discrete, mutually-exclusive options — use a structured `AskUserQuestion` (recommendation first), not a prose paragraph; for a clarification with an obvious default, prose is fine. See `docs/AGENT-CONVENTIONS.md` § Human-paired decisions: structured vs prose.

If a question can be answered by exploring the codebase, explore the codebase instead.
