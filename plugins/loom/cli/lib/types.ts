// sync-shared: plugin-local
// Loom project-substrate types.
// Authored against the design contract in docs/LOOM-CONVENTIONS.md.
// Erasable TypeScript only — no enums, no namespaces, no parameter
// properties, no const enums (substrate convention: scripts run via
// `node` directly, relying on Node 24+ type-stripping).

// ---------- Common ----------

export type SchemaVersion = 1;

// ---------- Manifest ----------

export type ManifestStatus = 'active' | 'archived';

export type PhaseStatus =
  | 'not-started'
  | 'in-progress'
  | 'blocked'
  | 'completed';

// No `pr` field on a phase: PR open/merged state is derived on demand from
// gh via `loom pr discover` (commit-discipline option (d)), never stored in
// the manifest. Storing it would reintroduce the staleness deriving solved.
export type ManifestPhase = {
  number: number;
  name: string;
  status: PhaseStatus;
  branch?: string;
  latest_checkin?: string;
  blocked_reason?: string;
};

export type Manifest = {
  schema_version: SchemaVersion;
  title: string;
  slug: string;
  started: string;
  status: ManifestStatus;
  current_branch: string | null;
  latest_checkin: string | null;
  strategy: string;
  phases: ManifestPhase[];
};

// ---------- Events ----------

type EventBase<TName extends string, TDetail> = {
  at: string;
  event: TName;
  detail: TDetail;
};

export type ProjectInitializedEvent = EventBase<
  'project-initialized',
  Record<string, never>
>;

export type PhaseStartedEvent = EventBase<
  'phase-started',
  { phase: number; name: string }
>;

export type PhaseCompletedEvent = EventBase<
  'phase-completed',
  { phase: number }
>;

export type PhaseBlockedEvent = EventBase<
  'phase-blocked',
  { phase: number; reason: string }
>;

export type PhaseUnblockedEvent = EventBase<
  'phase-unblocked',
  { phase: number }
>;

export type CheckinCreatedEvent = EventBase<
  'checkin-created',
  { number: string; branch: string }
>;

// PR open/merged/updated state is derived on demand via `loom pr discover`
// (gh pr view + the checkin marker), not recorded as events — so there are
// no pr-* event types. Fossil pr-* events already in [[events]] still parse
// (reconstructEvent casts the event-name string to EventName leniently).

export type SessionSavedEvent = EventBase<
  'session-saved',
  { filename: string }
>;

export type RetroWrittenEvent = EventBase<
  'retro-written',
  { type: 'session' | 'project'; phase?: number; tier?: number }
>;

export type ArchivedEvent = EventBase<'archived', { destination: string }>;

export type NoteEvent = EventBase<'note', { text: string }>;

// ---------- Research events (Phase 3) ----------
//
// The `loom research` verb emits ResearchStartedEvent + ResearchCompletedEvent
// directly. The `/loom-research` skill emits the rest (shift / panel-spawned /
// panel-verdict / fact-check-spawned / fact-check-verdict / budget-exhausted)
// at the corresponding decision points in its grill-me loop. Detail shapes
// here are the minimum-viable set; D2 of Phase 3 may extend optional fields
// as the skill emerges.

export type ResearchStartedEvent = EventBase<
  'research-started',
  { slug: string; topic: string | null }
>;

export type ResearchCompletedEvent = EventBase<
  'research-completed',
  { slug: string; research_path: string; notes_path: string }
>;

export type ResearchShiftEvent = EventBase<
  'research-shift',
  { shift_number: number; topic: string }
>;

export type ResearchPanelSpawnedEvent = EventBase<
  'research-panel-spawned',
  { shift_number: number; engineers: string[] }
>;

export type ResearchPanelVerdictEvent = EventBase<
  'research-panel-verdict',
  {
    shift_number: number;
    verdict: 'silent' | 'questions-raised';
    question_count?: number;
  }
>;

export type ResearchFactCheckSpawnedEvent = EventBase<
  'research-fact-check-spawned',
  { research_path: string }
>;

export type ResearchFactCheckVerdictEvent = EventBase<
  'research-fact-check-verdict',
  { verdict: 'approved' | 'flagged'; flag_count?: number }
>;

export type ResearchBudgetExhaustedEvent = EventBase<
  'research-budget-exhausted',
  {
    shifts_completed: number;
    rounds_completed: number;
    reason: 'shift-budget' | 'round-budget';
  }
>;

// ---------- Plan + revise events (Phase 4) ----------
//
// The `/loom-plan` skill emits the `plan-*` family; the
// `/loom-revise-plan` skill emits the `plan-revise-*` family. The
// `bin/loom plan` and `bin/loom revise-plan` CLI verbs themselves
// stay event-emission-free (no CLI-side started/completed pair like
// research has) — the orchestration lives in the skills, not in the
// verbs. Detail shapes here are the minimum-viable set; D2/D3 of
// Phase 4 may extend optional fields as the skill bodies emerge.

export type PlanStartedEvent = EventBase<
  'plan-started',
  { slug: string; topic: string | null }
>;

export type PlanResearchAttachedEvent = EventBase<
  'plan-research-attached',
  { slug: string; research_path: string }
>;

export type PlanResearchAutoSpawnedEvent = EventBase<
  'plan-research-auto-spawned',
  { slug: string }
>;

export type PlanPanelSpawnedEvent = EventBase<
  'plan-panel-spawned',
  { evaluators: string[] }
>;

export type PlanPanelVerdictEvent = EventBase<
  'plan-panel-verdict',
  {
    verdict: 'approved' | 'flagged' | 'flagged-conflict';
    blocking_count?: number;
    advisory_count?: number;
  }
>;

export type PlanCompletedEvent = EventBase<
  'plan-completed',
  { slug: string; plan_path: string; interview_path: string }
>;

export type PlanBudgetExhaustedEvent = EventBase<
  'plan-budget-exhausted',
  {
    decisions_completed: number;
    rounds_completed: number;
    reason: 'decision-budget' | 'round-budget';
  }
>;

export type PlanReviseStartedEvent = EventBase<
  'plan-revise-started',
  { slug: string }
>;

// PLAN.md's `plan-revise-flavor-{mechanical,research}` brace-expansion
// shorthand could read as either two events or one event with a
// discriminator. We pick the discriminator pattern (one event,
// `flavor` field) to match the family's existing precedent —
// PlanPanelVerdictEvent / ResearchPanelVerdictEvent / etc. all carry
// the variant in `detail` rather than splitting into per-variant
// events. Grep-on-events.jsonl is still cheap: `grep
// '"event":"plan-revise-flavor-selected"' + jq on .detail.flavor`.
export type PlanReviseFlavorSelectedEvent = EventBase<
  'plan-revise-flavor-selected',
  { slug: string; flavor: 'mechanical' | 'research' }
>;

export type PlanReviseResearchSpawnedEvent = EventBase<
  'plan-revise-research-spawned',
  { slug: string; revision_question: string }
>;

export type PlanRevisePanelSpawnedEvent = EventBase<
  'plan-revise-panel-spawned',
  { evaluators: string[] }
>;

export type PlanRevisePanelVerdictEvent = EventBase<
  'plan-revise-panel-verdict',
  {
    verdict: 'approved' | 'flagged' | 'flagged-conflict';
    blocking_count?: number;
    advisory_count?: number;
  }
>;

export type PlanRevisedEvent = EventBase<
  'plan-revised',
  { slug: string; plan_path: string; rationale: string }
>;

export type PlanReviseBudgetExhaustedEvent = EventBase<
  'plan-revise-budget-exhausted',
  {
    decisions_completed: number;
    rounds_completed: number;
    reason: 'decision-budget' | 'round-budget';
  }
>;

// ---------- Inner-RPI events (Phase 5) ----------
//
// RPI = Research → Plan → Implement. The "inner" qualifier
// distinguishes the sub-sequence triggered mid-execution (here)
// from the "outer" RPI orchestrated by `/loom-plan` at project
// birth. See `projects/2026-05-17-loom-absorb-draft/PLAN.md` for
// the full RPI rationale and the loop's scope-shift detection
// rule.
//
// `/ev-loop-interactive`'s scope-shift detection step emits these
// events when the two-signal-concurrence rule fires. The
// scope-shift-detected event fires on EVERY detected shift
// regardless of accept/decline (substrate signal worth capturing
// either way); the rpi-inner-* family records the accept/decline
// branch and the inner-RPI sub-sequence's lifecycle.

export type ScopeShiftDetectedEvent = EventBase<
  'scope-shift-detected',
  {
    slug: string;
    phase: number;
    unit: string;
    signal_count: number;
    signals: string[];
  }
>;

export type RpiInnerTriggeredEvent = EventBase<
  'rpi-inner-triggered',
  { slug: string; phase: number; trigger: string }
>;

export type RpiInnerCompletedEvent = EventBase<
  'rpi-inner-completed',
  { slug: string; phase: number }
>;

export type RpiInnerDeclinedEvent = EventBase<
  'rpi-inner-declined',
  { slug: string; phase: number; signal_count: number }
>;

// ---------- Auto-mode events (Phase 6) ----------
//
// Auto-mode is the substrate-wide pattern where a skill runs without
// human input by delegating decisions to panels (evaluators for
// convergent / auditing questions; plans for divergent /
// generative questions). The events here mark the auto-mode session
// boundary: entered when a skill begins an auto-mode run; converged
// when the silent-panel condition fires; budget-exhausted when the
// two-budget cap hits. Per-skill `*-budget-exhausted` events
// (research-budget-exhausted, plan-budget-exhausted, etc.) remain
// the canonical record of *which* skill exhausted; auto-mode-
// budget-exhausted is the substrate-wide counterpart, useful for
// griot ingestion of cross-skill auto-mode patterns.
//
// `surface` names which skill's auto-mode is running:
// `ev-loop-interactive` | `loom-archive` | `ev-run` | `loom-plan`
// | `loom-revise-plan` | `loom-research`. The substrate doesn't
// enforce the enumeration; new auto-mode-capable skills extend
// the set without re-extending the type.

export type AutoModeEnteredEvent = EventBase<
  'auto-mode-entered',
  { surface: string; slug: string | null; decision_budget: number; round_budget: number }
>;

export type AutoModeConvergedEvent = EventBase<
  'auto-mode-converged',
  {
    surface: string;
    slug: string | null;
    decisions_completed: number;
    rounds_completed: number;
  }
>;

export type AutoModeBudgetExhaustedEvent = EventBase<
  'auto-mode-budget-exhausted',
  {
    surface: string;
    slug: string | null;
    decisions_completed: number;
    rounds_completed: number;
    reason: 'decision-budget' | 'round-budget';
  }
>;

// ---------- Goal-loop events (ev-goal driver) ----------
//
// ev-goal is the autonomous "human-on-call" driver (ADR-0009): it
// reuses the ev-loop-* bodies but, instead of dispatching one phase and
// parking like ev-run, it drives phase after phase toward a goal
// predicate (default: all phases merged), re-entering on the PR-activity
// wake. These events wrap the auto-mode-* events the bodies/panels still
// emit underneath; they record the *driver* run, mirroring the auto-mode
// vocabulary's surface/boundary shape. As with auto-mode, the substrate
// does not enforce the `outcome`/`resolution` enumerations at the type
// level — the strings are descriptive, kept open for new cases.

export type GoalLoopEnteredEvent = EventBase<
  'goal-loop-entered',
  { slug: string; until: string; decision_budget: number; round_budget: number }
>;

export type GoalLoopIterationEvent = EventBase<
  'goal-loop-iteration',
  { slug: string; phase: number; outcome: string }
>;

export type GoalLoopConvergedEvent = EventBase<
  'goal-loop-converged',
  { slug: string; phases_completed: number; iterations: number }
>;

export type GoalLoopEscalatedEvent = EventBase<
  'goal-loop-escalated',
  { slug: string; phase: number; decision: string; resolution: string }
>;

export type Event =
  | ProjectInitializedEvent
  | PhaseStartedEvent
  | PhaseCompletedEvent
  | PhaseBlockedEvent
  | PhaseUnblockedEvent
  | CheckinCreatedEvent
  | SessionSavedEvent
  | RetroWrittenEvent
  | ArchivedEvent
  | NoteEvent
  | ResearchStartedEvent
  | ResearchCompletedEvent
  | ResearchShiftEvent
  | ResearchPanelSpawnedEvent
  | ResearchPanelVerdictEvent
  | ResearchFactCheckSpawnedEvent
  | ResearchFactCheckVerdictEvent
  | ResearchBudgetExhaustedEvent
  | PlanStartedEvent
  | PlanResearchAttachedEvent
  | PlanResearchAutoSpawnedEvent
  | PlanPanelSpawnedEvent
  | PlanPanelVerdictEvent
  | PlanCompletedEvent
  | PlanBudgetExhaustedEvent
  | PlanReviseStartedEvent
  | PlanReviseFlavorSelectedEvent
  | PlanReviseResearchSpawnedEvent
  | PlanRevisePanelSpawnedEvent
  | PlanRevisePanelVerdictEvent
  | PlanRevisedEvent
  | PlanReviseBudgetExhaustedEvent
  | ScopeShiftDetectedEvent
  | RpiInnerTriggeredEvent
  | RpiInnerCompletedEvent
  | RpiInnerDeclinedEvent
  | AutoModeEnteredEvent
  | AutoModeConvergedEvent
  | AutoModeBudgetExhaustedEvent
  | GoalLoopEnteredEvent
  | GoalLoopIterationEvent
  | GoalLoopConvergedEvent
  | GoalLoopEscalatedEvent;

export type EventName = Event['event'];

// ---------- Config ----------

export type Config = {
  schema_version: SchemaVersion;
  base_branch: string;
  reviewers: string[];
  labels: string[];
  verification: string[];
  worker_bindings: Record<string, string>;
};

// ---------- Checkin ----------

export type CheckinVerdictResult = 'approved' | 'flagged';

export type CheckinContract = {
  goal: string;
  acceptance_criteria: string[];
  rules_applied: string[];
  disqualifiers: string[];
  inputs: string[];
};

export type CheckinExecution = {
  actions: string[];
  files_touched: string[];
  corrections: string[];
};

export type CheckinVerdict = {
  result: CheckinVerdictResult;
  reasons: string[];
};

export type CheckinPhaseRef = {
  number: number;
  name: string;
};

export type Checkin = {
  schema_version: SchemaVersion;
  number: string;
  created: string;
  phase: CheckinPhaseRef;
  branch: string;
  unit: string;
  contract: CheckinContract;
  execution: CheckinExecution;
  scope: string[];
  changes_since_previous: string;
  verdict: CheckinVerdict;
  notes_for_pr: string[];
};

// ---------- Session ----------

export type Session = {
  schema_version: SchemaVersion;
  date: string;
  letter: string;
  phases_touched: number[];
  checkins_written: string[];
  pr_activity: string[];
  what_happened: string[];
  open_threads: string[];
  notes: string[];
};

// ---------- Consolidated manifest.toml (Phase 2) ----------
//
// Phase 2 collapses manifest.json + config.json + events.jsonl +
// checkins/ + sessions/ into one sectioned manifest.toml. ManifestToml is
// the typed view of that file: a [meta] table of scalars, the [config]
// table, and the [[phases]] / [[events]] / [[checkins]] / [[sessions]]
// array-of-table sections. It COMPOSES the existing per-record types
// rather than redefining them — the records did not change shape, only
// their storage location. The legacy single-file Manifest/Config types
// above stay in place until the U5 dogfood migration removes the old read
// paths; this is purely additive.

// The scalar identity + mutable-status fields that live in [meta] —
// exactly today's Manifest fields minus `phases` (which becomes the
// [[phases]] section). schema_version lives here once for the whole file;
// [config] does not repeat it (readManifest synthesizes
// Config.schema_version from meta).
export type ManifestMeta = {
  schema_version: SchemaVersion;
  title: string;
  slug: string;
  started: string;
  status: ManifestStatus;
  current_branch: string | null;
  latest_checkin: string | null;
  strategy: string;
};

// A plan revision's machine record (Phase 3). The human rationale lives in
// PLAN.md's `## Revision log`; this is its manifest-side counterpart, written
// in the same revise-plan operation so the two never drift. `seq` is the
// 1-based revision number; `target` is the revised artifact (currently always
// "PLAN.md", kept as a field so future revisions can target other artifacts).
export type Revision = {
  timestamp: string;
  target: string;
  seq: number;
};

export type ManifestToml = {
  meta: ManifestMeta;
  config: Config;
  phases: ManifestPhase[];
  events: Event[];
  checkins: Checkin[];
  sessions: Session[];
  revisions: Revision[];
  retros: Retro[];
  replies: ReviewReply[];
  findings: GuildFinding[];
};

// ---------- Retro ----------

export type RetroFindingCategory =
  | 'kept-well'
  | 'improvement'
  | 'process-change'
  | 'follow-up';

export type RetroFinding = {
  category: RetroFindingCategory;
  description: string;
  evidence?: string;
};

export type SessionRetro = {
  schema_version: SchemaVersion;
  type: 'session';
  created: string;
  phase: number;
  tier: number;
  findings: RetroFinding[];
};

export type ProjectRetro = {
  schema_version: SchemaVersion;
  type: 'project';
  created: string;
  findings: RetroFinding[];
};

export type Retro = SessionRetro | ProjectRetro;

export type RetroType = Retro['type'];

// ---------- PR review replies ----------
//
// A reply the loop posted to a PR review comment, recorded as machine state in
// the manifest's [[replies]] section. Pre-consolidation these lived in
// responses/<branch>/response-NN.json; the `branch` field carries the former
// partition key. `comment_id` is the gh review-comment id (a number) this reply
// answers. Named ReviewReply rather than Response to avoid colliding with the
// DOM/fetch/Express `Response` global at the module surface.
export type ReviewReply = {
  comment_id: number;
  body: string;
  branch: string;
  created: string;
};

// ---------- Harvested guild findings ----------
//
// A guild evaluator finding folded into the manifest's [[findings]] section at
// unit/phase close. Pre-consolidation these streamed concurrently to a
// .guild-findings.jsonl; the harvest step (Phase 2) reads that buffer and
// appends each row here. `signature` is guild's content hash
// (evaluator + code + normalized-evidence), reused as the harvest dedupe key;
// `harvested_at` is the fold-in timestamp (distinct from the row's original
// guild-side `ts`). `branch`/`unit` are optional — guild records them when the
// finding is attributable to a specific unit, absent otherwise.
export type FindingSeverity = 'blocking' | 'advisory';

export type GuildFinding = {
  evaluator: string;
  code: string;
  evidence: string;
  severity: FindingSeverity;
  branch?: string;
  unit?: string;
  signature: string;
  harvested_at: string;
};

// ---------- Plan parsing (Phase 1: shared plan-parser lib) ----------
//
// parsePlan() reads PLAN.md text and returns this typed tree plus a
// list of diagnostics. The tree is a flat, level-tolerant view of the
// plan's phases; milestones are an optional grouping annotation over
// those phases, never a mandatory nesting layer (a plan with no
// milestone headers still returns a full phase list). PLAN.md is the
// human-authored source; this parser is tolerant-read-only and is NOT
// the authority on phase existence once manifest.toml ships (Phase 2).

export type DiagnosticSeverity = 'structural' | 'cosmetic';

// A diagnostic the parser surfaces instead of throwing. `structural`
// diagnostics mean the tree is missing something a consumer relies on
// (no phases, a dependency pointing at a nonexistent phase); `cosmetic`
// diagnostics mean an optional section was absent. Callers decide
// whether to treat a given code as fatal. `code` reuses the LoomError
// kebab-case vocabulary so verbs classify diagnostics the same way they
// classify thrown errors. `line` is 1-based (0 when not line-anchored).
export type Diagnostic = {
  code: string;
  line: number;
  severity: DiagnosticSeverity;
  message: string;
};

export type PlanMilestoneRef = {
  id: string;
  name: string;
};

// A phase as parsed from PLAN.md. `id` is the literal heading id kept
// as a string ("1", "1.1") — never coerced to a number, because dotted
// ids ("1.1"/"1.2") would collide under integer coercion.
// `exitCriteria` are the raw `**Exit**:`/`**Output**:` bullet strings,
// opaque and not sub-parsed (consumers decompose units from them at
// runtime). `dependsOn` is resolved to phase-id strings with ranges
// expanded. `plan` carries the raw `**Plan**:` override
// string when present at this phase (overrides the plan-level default).
export type ParsedPhase = {
  id: string;
  name: string;
  milestone?: PlanMilestoneRef;
  goal?: string;
  exitCriteria: string[];
  dependsOn: string[];
  plan?: string;
};

export type Milestone = {
  id: string;
  name: string;
  phases: ParsedPhase[];
};

// `phases` is the canonical flat list in document order; `phasesById`
// indexes it for the dependency resolver and for ev-run's actionability
// math (lookup by id, not by walking the milestone nesting). `milestones`
// is present only when the plan has milestone headers. `loopStrategy`
// and `plan` are plan-level raw strings, captured but not
// sub-parsed.
export type ParsedPlan = {
  phases: ParsedPhase[];
  phasesById: Record<string, ParsedPhase>;
  milestones?: Milestone[];
  loopStrategy?: string;
  plan?: string;
};

export type ParsePlanResult = {
  plan: ParsedPlan;
  diagnostics: Diagnostic[];
};
