# guild

The guild plugin ships the antagonist-panel substrate: parallel
evaluator agents, parallel plan engineers, and the
`guild-spawn` / `guild-validate` / `guild-plan` skill family
that composes them. Loops use it for review; designers use it for
multi-perspective planning.

Every agent in `agents/` pins `model: sonnet`. The session that runs a
guild skill keeps its own model for orchestration; the fan-out runs one
tier below it to keep panels cheap and fast. The value is set in
`cli/verbs/guild/compile/compose.ts` and mirrored in the fusion prompt;
`guild-spawn` takes a `model` input for the rare caller that needs to
lift a panel back up. Each agent's `maxTurns` comes from its phase's
`max_turns` in `modes/axes.toml`: write phases get more room than
read-only ones. Raise a phase's budget there and recompile rather than
editing an agent file.

The agents in `agents/` are codegen output assembled from fragments
under `modes/` per the recipe in `docs/AGENT-CODEGEN.md`. After
re-installing or running codegen, validate via the **Live-spawn
smoke** checklist:

- See `docs/AGENT-CODEGEN.md` § Live-spawn smoke (post-install verification).
- Record results at `learnings/session-notes/<YYYY-MM-DD>-guild-smoke-postcutover.md`.
