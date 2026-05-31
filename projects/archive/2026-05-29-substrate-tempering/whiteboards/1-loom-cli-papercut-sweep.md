# Whiteboard: Phase 1 design forks: the loom checkin-write update path, and the plan-* lifecycle event shape.

## Round 1

### From guild:generated:whiteboard-substrate

[Round 1 investigation truncated at tool-budget; recorded before the engineer reached a final recommendation.] Finding: checkin.ts, manifest.ts, and events.ts are the pre-M1 per-file implementations (filesystem-enforced create-once via existsSync, JSONL append), but checkin.ts:194-213 imports appendCheckin / appendEvent / writeManifest from manifest-toml.ts, the live TOML-consolidated path. The legacy .ts files are not the live code path. Open threads it was pursuing: the single-writer-serialized claim in projects/CONVENTIONS.md, and how the existing plan-* events get emitted (to confirm the verbs-stay-emission-free claim).

### From guild:generated:whiteboard-skeptic

[Round 1 investigation truncated at tool-budget.] Finding: 'the contradiction is confirmed and load-bearing.' Identified two ADRs as directly governing these forks: ADR-0002 (loom-checkin-write-requires-full-schema) over Fork 1, and ADR-0003 (distinguish-manifest-write-from-git-commit) over the Fork 2 emission/commit boundary. Was about to read the loom-plan and ev-loop-interactive skill bodies to see how plan-completed is emitted today and how checkins are written.

### From guild:generated:whiteboard-test-unit

[Round 1 investigation truncated at tool-budget; partial findings recorded.] Critical findings: (1) plan-* events ALREADY EXIST in the union (PlanCompletedEvent etc.) — they are not new. The Phase-4 comment block states CLI verbs stay event-emission-free and skills emit plan-*, so Fork 2's premise (emit a plan-* event at loom plan commit time) would REVERSE a documented design decision. (2) appendEvent is already idempotent (no-op on same name + deep-equal detail, ignoring the at timestamp) — a real seam and test consideration. (3) appendCheckin and appendEvent are pure lib functions with their own test files; testing the emission in isolation is possible without a full loom-plan end-to-end test.

