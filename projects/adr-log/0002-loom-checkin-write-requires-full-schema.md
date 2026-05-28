# 0002. Loom checkin write requires full schema

- **Date**: 2026-05-28
- **Status**: accepted

## Context

During Phase 3 P3D1 of the `2026-05-28-loom-adr` project (introducing the `loom adr` verb and wiring it into `ev-loop-interactive`), `loom checkin write` rejected a contract-only intermediate checkin with `manifest-schema-invalid: [[checkins]] #N is missing required table [execution]`. The substrate enforces a full-schema shape on checkin writes — the file must carry contract + execution + verdict + notes_for_pr at write time.

The `ev-loop-interactive` skill body's step 2.1 (Negotiate) tells the loop to "Draft the unit contract for this deliverable and write it into a new numbered checkin (Contract section only)." The skill body's intent — that the contract is persisted at negotiation time and the execution + verdict get appended later at unit close — is not the shape the substrate verb supports today.

Unit goal that surfaced this: Insert a new step 5.5 (ADR-emit) into ev-loop-interactive's unit loop, between scope-shift detection and phase update.

## Decision

The skill body's language is wrong; the substrate verb's enforcement is right. The decision is to **tighten the skill body to acknowledge full-schema-at-close as the convention** rather than loosen the substrate to accept partial checkins.

The two options the friction surfaced were:
- (a) loosen `loom checkin write` to accept partial checkins (contract-only initial write + execution/verdict append at close), or
- (b) tighten the skill body to acknowledge full-schema-at-close as the convention and rephrase the negotiate step.

Option (b) is load-bearing because conversation already provides the intermediate-persistence benefit option (a) would add. The contract lives in the operator-agent conversation throughout the unit; the checkin is a closing artifact that captures the whole unit (contract + execution + verdict + notes_for_pr) atomically. Adding substrate complexity for a redundant persistence layer would invert the contract: every loop now has to track which fields are committed and which are pending, instead of treating the checkin as a single point-in-time snapshot.

## Consequences

TODO: operator to fill before commit
