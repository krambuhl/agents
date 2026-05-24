import { LinearLoomError } from './errors.ts';

// Local Checkin TS type — matches the loom-side shape at
// plugins/loom/cli/lib/types.ts:446-459.
//
// Declared locally rather than imported across plugins so linear-loom
// stays standalone (DESIGN.md § 1: parallel plugin, not a fork).
// Future Phase 7+ work can publish a shared JSON-Schema-derived
// types package; v1 keeps both plugins independent and relies on
// the operator + tests to catch drift if either schema changes.

export type CheckinSchemaVersion = 1;

export type CheckinVerdictResult = 'approved' | 'flagged';

export interface CheckinPhaseRef {
  number: number;
  name: string;
}

export interface CheckinContract {
  goal: string;
  acceptance_criteria: string[];
  rules_applied: string[];
  disqualifiers: string[];
  inputs: string[];
}

export interface CheckinExecution {
  actions: string[];
  files_touched: string[];
  corrections: string[];
}

export interface CheckinVerdict {
  result: CheckinVerdictResult;
  reasons: string[];
}

export interface Checkin {
  schema_version: CheckinSchemaVersion;
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
}

// Required-keys list for the schema-shape check. We don't validate
// types of every nested field (the renderer treats arrays as arrays
// and strings as strings); we just ensure the top-level + the
// nested-block top-level keys are present, since that's the load-
// bearing surface for rendering.
const REQUIRED_TOP_LEVEL: Array<keyof Checkin> = [
  'schema_version',
  'number',
  'created',
  'phase',
  'branch',
  'unit',
  'contract',
  'execution',
  'scope',
  'changes_since_previous',
  'verdict',
  'notes_for_pr',
];

const REQUIRED_PHASE: Array<keyof CheckinPhaseRef> = ['number', 'name'];
const REQUIRED_CONTRACT: Array<keyof CheckinContract> = [
  'goal',
  'acceptance_criteria',
  'rules_applied',
  'disqualifiers',
  'inputs',
];
const REQUIRED_EXECUTION: Array<keyof CheckinExecution> = [
  'actions',
  'files_touched',
  'corrections',
];
const REQUIRED_VERDICT: Array<keyof CheckinVerdict> = ['result', 'reasons'];

export function parseCheckinFile(raw: string): Checkin {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch (err) {
    throw new LinearLoomError(
      'checkin-invalid-json',
      `checkin file is not valid JSON: ${(err as Error).message}`,
    );
  }
  if (parsed === null || typeof parsed !== 'object') {
    throw new LinearLoomError(
      'checkin-schema-invalid',
      'checkin file must be a JSON object.',
    );
  }
  const obj = parsed as Record<string, unknown>;
  for (const key of REQUIRED_TOP_LEVEL) {
    if (!(key in obj)) {
      throw new LinearLoomError(
        'checkin-schema-invalid',
        `checkin file is missing required field "${String(key)}".`,
      );
    }
  }
  if (obj.schema_version !== 1) {
    throw new LinearLoomError(
      'checkin-schema-invalid',
      `checkin schema_version=${String(obj.schema_version)} is not supported (linear-loom expects schema_version: 1).`,
    );
  }
  const phase = obj.phase as Record<string, unknown>;
  for (const key of REQUIRED_PHASE) {
    if (!(key in phase)) {
      throw new LinearLoomError(
        'checkin-schema-invalid',
        `checkin file is missing required field "phase.${String(key)}".`,
      );
    }
  }
  const contract = obj.contract as Record<string, unknown>;
  for (const key of REQUIRED_CONTRACT) {
    if (!(key in contract)) {
      throw new LinearLoomError(
        'checkin-schema-invalid',
        `checkin file is missing required field "contract.${String(key)}".`,
      );
    }
  }
  const execution = obj.execution as Record<string, unknown>;
  for (const key of REQUIRED_EXECUTION) {
    if (!(key in execution)) {
      throw new LinearLoomError(
        'checkin-schema-invalid',
        `checkin file is missing required field "execution.${String(key)}".`,
      );
    }
  }
  const verdict = obj.verdict as Record<string, unknown>;
  for (const key of REQUIRED_VERDICT) {
    if (!(key in verdict)) {
      throw new LinearLoomError(
        'checkin-schema-invalid',
        `checkin file is missing required field "verdict.${String(key)}".`,
      );
    }
  }
  return parsed as Checkin;
}

export function renderCheckinToMarkdown(checkin: Checkin): string {
  const sections: string[] = [];

  // Header + metadata block.
  sections.push(`# ${checkin.unit}`);
  sections.push(
    [
      `**Phase**: ${checkin.phase.number} — ${checkin.phase.name}`,
      `**Branch**: \`${checkin.branch}\``,
      `**Checkin number**: ${checkin.number}`,
      `**Created**: ${checkin.created}`,
      `**Verdict**: ${checkin.verdict.result}`,
    ].join('\n'),
  );

  // Contract sections.
  sections.push(`## Goal\n\n${checkin.contract.goal}`);

  if (checkin.contract.acceptance_criteria.length > 0) {
    sections.push(
      `## Acceptance criteria\n\n${numbered(checkin.contract.acceptance_criteria)}`,
    );
  }
  if (checkin.contract.rules_applied.length > 0) {
    sections.push(
      `## Rules applied\n\n${bulleted(checkin.contract.rules_applied)}`,
    );
  }
  if (checkin.contract.disqualifiers.length > 0) {
    sections.push(
      `## Disqualifiers\n\n${bulleted(checkin.contract.disqualifiers)}`,
    );
  }
  if (checkin.contract.inputs.length > 0) {
    sections.push(`## Inputs\n\n${bulleted(checkin.contract.inputs)}`);
  }

  // Execution.
  if (checkin.execution.actions.length > 0) {
    sections.push(`## Actions\n\n${bulleted(checkin.execution.actions)}`);
  }
  if (checkin.execution.files_touched.length > 0) {
    sections.push(
      `## Files touched\n\n${bulleted(checkin.execution.files_touched)}`,
    );
  }
  if (checkin.execution.corrections.length > 0) {
    sections.push(
      `## Corrections\n\n${bulleted(checkin.execution.corrections)}`,
    );
  }

  // Scope (only if non-empty).
  if (checkin.scope.length > 0) {
    sections.push(`## Scope\n\n${bulleted(checkin.scope)}`);
  }

  // Changes since previous.
  if (checkin.changes_since_previous.trim() !== '') {
    sections.push(
      `## Changes since previous\n\n${checkin.changes_since_previous}`,
    );
  }

  // Notes for the PR.
  if (checkin.notes_for_pr.length > 0) {
    sections.push(
      `## Notes for the PR\n\n${bulleted(checkin.notes_for_pr)}`,
    );
  }

  // Flagged-verdict reasons land below the rest so a reviewer reading
  // top-to-bottom sees the unit's intent first and the unresolved
  // friction last.
  if (
    checkin.verdict.result === 'flagged' &&
    checkin.verdict.reasons.length > 0
  ) {
    sections.push(
      `## Verdict reasons\n\n${bulleted(checkin.verdict.reasons)}`,
    );
  }

  return sections.join('\n\n');
}

function bulleted(items: string[]): string {
  return items.map((s) => `- ${s}`).join('\n');
}

function numbered(items: string[]): string {
  return items.map((s, i) => `${i + 1}. ${s}`).join('\n');
}
