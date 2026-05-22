import { LinearLoomError } from './errors.ts';

// PLAN.md parser for linear-loom (DESIGN.md § 12.1).
//
// Parses the `## Phases` block out of a PLAN.md and produces a tree
// of phases → batches → tasks. Composed stable keys (§ 12.2) anchor
// every node. Supports `was=<old-id>` rename annotations (§ 12.6).
//
// The parser is the lookup-end of the Phase 5 generate flow: the tree
// it produces gets diffed against Linear's current state by the U2/U3
// generate verb. This module owns nothing Linear-side — pure
// markdown-to-tree transformation, fully testable without any API
// mocking.

export interface ParsedTask {
  kind: 'task';
  id: string;
  was: string | undefined;
  composed_key: string;
  prose: string;
}

export interface ParsedBatch {
  kind: 'batch';
  number: number;
  id: string;
  was: string | undefined;
  composed_key: string;
  prose: string;
  body: string;
  tasks: ParsedTask[];
}

export interface ParsedPhase {
  kind: 'phase';
  number: number;
  id: string;
  was: string | undefined;
  composed_key: string;
  prose: string;
  body: string;
  batches: ParsedBatch[];
}

export interface ParsedPlan {
  phases: ParsedPhase[];
}

// `[<id>]` or `[<id> was=<old>]`. ID + `was=` must be the only
// content between the brackets; trailing whitespace tolerated.
const ID_BRACKET = /\[([a-z0-9](?:[a-z0-9-]*[a-z0-9])?)(?:\s+was=([a-z0-9](?:[a-z0-9-]*[a-z0-9])?))?\s*\]/;

// Phase heading: `### Phase <N> [<id>(...)] — <prose>` or `- <prose>`
// (em-dash) or hyphen
const PHASE_HEADING = /^###\s+Phase\s+(\d+)\s+\[([^\]]+)\]\s*[—-]\s*(.+)$/;
const BATCH_HEADING = /^####\s+Batch\s+(\d+)\s+\[([^\]]+)\]\s*[—-]\s*(.+)$/;
// Task bullet: `- [<id>] <prose>` (one or more spaces after the
// bracket; prose required to disambiguate from a bare bracket).
const TASK_BULLET = /^-\s+\[([^\]]+)\]\s+(.+)$/;

interface IdAnnotation {
  id: string;
  was: string | undefined;
}

function parseIdAnnotation(raw: string, lineNo: number, kind: string): IdAnnotation {
  const match = ID_BRACKET.exec(`[${raw}]`);
  if (match === null || match[1] === undefined) {
    throw new LinearLoomError(
      'plan-parse-failed',
      `Line ${lineNo}: ${kind} ID "${raw}" is not a valid kebab-case identifier (expected [<a-z0-9-with-no-leading-or-trailing-dash> (was=<old-id>)?]).`,
    );
  }
  return { id: match[1], was: match[2] };
}

function extractPhasesSection(markdown: string): { startLine: number; lines: string[] } {
  const allLines = markdown.split('\n');
  let inPhases = false;
  let startLine = -1;
  const out: string[] = [];
  for (let i = 0; i < allLines.length; i++) {
    const line = allLines[i] ?? '';
    if (/^##\s+Phases\s*$/.test(line)) {
      if (inPhases) {
        throw new LinearLoomError(
          'plan-parse-failed',
          `Line ${i + 1}: multiple "## Phases" sections found; exactly one is required.`,
        );
      }
      inPhases = true;
      startLine = i + 1;
      continue;
    }
    if (inPhases) {
      // Any other `##` heading ends the Phases block (per § 12.1:
      // only `## Phases` contributes Linear writes).
      if (/^##\s+[^#]/.test(line)) break;
      out.push(line);
    }
  }
  if (startLine === -1) {
    throw new LinearLoomError(
      'plan-parse-failed',
      'No "## Phases" section found in PLAN.md.',
    );
  }
  return { startLine, lines: out };
}

function checkNoDuplicateIds(parent: string, ids: string[]): void {
  const seen = new Set<string>();
  for (const id of ids) {
    if (seen.has(id)) {
      throw new LinearLoomError(
        'plan-parse-failed',
        `Duplicate ID "${id}" under "${parent}". Each child of a parent must have a unique kebab-case ID (§ 12.2).`,
      );
    }
    seen.add(id);
  }
}

export function parsePlan(markdown: string): ParsedPlan {
  const { startLine, lines } = extractPhasesSection(markdown);

  const phases: ParsedPhase[] = [];
  let currentPhase: ParsedPhase | null = null;
  let currentBatch: ParsedBatch | null = null;
  let proseBuffer: string[] = [];

  function flushProse(target: ParsedPhase | ParsedBatch | null): void {
    if (target !== null) {
      target.body = proseBuffer.join('\n').trim();
    }
    proseBuffer = [];
  }

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i] ?? '';
    const absLine = startLine + i;
    const phaseMatch = PHASE_HEADING.exec(line);
    const batchMatch = BATCH_HEADING.exec(line);
    const taskMatch = TASK_BULLET.exec(line);

    if (phaseMatch !== null) {
      flushProse(currentBatch ?? currentPhase);
      currentBatch = null;
      const numberStr = phaseMatch[1];
      const idRaw = phaseMatch[2];
      const prose = phaseMatch[3];
      if (numberStr === undefined || idRaw === undefined || prose === undefined) continue;
      const { id, was } = parseIdAnnotation(idRaw, absLine, 'Phase');
      const phase: ParsedPhase = {
        kind: 'phase',
        number: Number.parseInt(numberStr, 10),
        id,
        was,
        composed_key: id,
        prose: prose.trim(),
        body: '',
        batches: [],
      };
      phases.push(phase);
      currentPhase = phase;
      continue;
    }

    if (batchMatch !== null) {
      if (currentPhase === null) {
        throw new LinearLoomError(
          'plan-parse-failed',
          `Line ${absLine}: Batch heading found before any Phase heading.`,
        );
      }
      flushProse(currentBatch ?? currentPhase);
      const numberStr = batchMatch[1];
      const idRaw = batchMatch[2];
      const prose = batchMatch[3];
      if (numberStr === undefined || idRaw === undefined || prose === undefined) continue;
      const { id, was } = parseIdAnnotation(idRaw, absLine, 'Batch');
      const batch: ParsedBatch = {
        kind: 'batch',
        number: Number.parseInt(numberStr, 10),
        id,
        was,
        composed_key: `${currentPhase.id}.${id}`,
        prose: prose.trim(),
        body: '',
        tasks: [],
      };
      currentPhase.batches.push(batch);
      currentBatch = batch;
      continue;
    }

    if (taskMatch !== null) {
      if (currentBatch === null) {
        throw new LinearLoomError(
          'plan-parse-failed',
          `Line ${absLine}: Task bullet found outside any Batch. Tasks must hang under a Batch (§ 12.1).`,
        );
      }
      const idRaw = taskMatch[1];
      const prose = taskMatch[2];
      if (idRaw === undefined || prose === undefined) continue;
      const { id, was } = parseIdAnnotation(idRaw, absLine, 'Task');
      const task: ParsedTask = {
        kind: 'task',
        id,
        was,
        composed_key: `${currentBatch.composed_key}.${id}`,
        prose: prose.trim(),
      };
      currentBatch.tasks.push(task);
      continue;
    }

    // Non-heading, non-bullet line → prose for the most recent
    // open container (batch if open, else phase).
    proseBuffer.push(line);
  }

  flushProse(currentBatch ?? currentPhase);

  // Duplicate-ID checks per § 12.2 (parent-scoped).
  checkNoDuplicateIds(
    'top-level Phases',
    phases.map((p) => p.id),
  );
  for (const phase of phases) {
    checkNoDuplicateIds(
      `Phase [${phase.id}]`,
      phase.batches.map((b) => b.id),
    );
    for (const batch of phase.batches) {
      checkNoDuplicateIds(
        `Batch [${batch.composed_key}]`,
        batch.tasks.map((t) => t.id),
      );
    }
  }

  return { phases };
}

// Flat-walk helpers — useful for the U2 diff step (every node by
// composed key) without forcing callers to do their own tree walk.

export interface FlatNode {
  composed_key: string;
  kind: 'phase' | 'batch' | 'task';
  id: string;
  was: string | undefined;
  prose: string;
  body?: string;
  number?: number;
}

export function flattenPlan(plan: ParsedPlan): FlatNode[] {
  const out: FlatNode[] = [];
  for (const phase of plan.phases) {
    out.push({
      composed_key: phase.composed_key,
      kind: 'phase',
      id: phase.id,
      was: phase.was,
      prose: phase.prose,
      body: phase.body,
      number: phase.number,
    });
    for (const batch of phase.batches) {
      out.push({
        composed_key: batch.composed_key,
        kind: 'batch',
        id: batch.id,
        was: batch.was,
        prose: batch.prose,
        body: batch.body,
        number: batch.number,
      });
      for (const task of batch.tasks) {
        out.push({
          composed_key: task.composed_key,
          kind: 'task',
          id: task.id,
          was: task.was,
          prose: task.prose,
        });
      }
    }
  }
  return out;
}
