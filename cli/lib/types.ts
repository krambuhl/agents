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

export type PhasePRState = 'open' | 'merged' | 'closed';

export type PhasePR = {
  number: number;
  url: string;
  state: PhasePRState;
};

export type ManifestPhase = {
  number: number;
  name: string;
  status: PhaseStatus;
  branch?: string;
  latest_checkin?: string;
  blocked_reason?: string;
  pr?: PhasePR;
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

export type PrOpenedEvent = EventBase<
  'pr-opened',
  { pr: number; url: string }
>;

export type PrUpdatedEvent = EventBase<'pr-updated', { pr: number }>;

export type PrMergedEvent = EventBase<'pr-merged', { pr: number }>;

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

export type Event =
  | ProjectInitializedEvent
  | PhaseStartedEvent
  | PhaseCompletedEvent
  | PhaseBlockedEvent
  | PhaseUnblockedEvent
  | CheckinCreatedEvent
  | PrOpenedEvent
  | PrUpdatedEvent
  | PrMergedEvent
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
  | PlanReviseBudgetExhaustedEvent;

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
