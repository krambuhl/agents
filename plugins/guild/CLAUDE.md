# guild

The guild plugin ships the antagonist-panel substrate: parallel
evaluator agents, parallel whiteboard engineers, and the
`guild-spawn` / `guild-validate` / `guild-whiteboard` skill family
that composes them. Loops use it for review; designers use it for
multi-perspective whiteboarding.

The agents in `agents/` are codegen output assembled from fragments
under `modes/` per the recipe in `docs/AGENT-CODEGEN.md`. After
re-installing or running codegen, validate via the **Live-spawn
smoke** checklist:

- See `docs/AGENT-CODEGEN.md` § Live-spawn smoke (post-install verification).
- Record results at `learnings/session-notes/<YYYY-MM-DD>-guild-smoke-postcutover.md`.
