// Smoke test for the ADR-emit hook (step 5.5 in this skill's SKILL.md).
// The hook itself is prose, not importable code — this test exercises
// the spec mechanically: scan a synthetic notes_for_pr for the
// [adr-candidate] marker, compose a body in the shape the hook
// specifies, invoke the real adrVerb with --no-commit, and assert the
// resulting ADR file matches the verb's standard shape.

import { describe, test, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync, readFileSync, existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { adrVerb } from '../../../loom/cli/verbs/loom/adr.ts';
import type { GitRunner } from '../../../loom/cli/lib/git.ts';
import type { CliContext } from '../../../loom/cli/verbs/loom/project.ts';

const ADR_CANDIDATE_MARKER = '[adr-candidate]';

function fakeGit(): GitRunner & { commits: { paths: string[]; message: string }[] } {
  const commits: { paths: string[]; message: string }[] = [];
  return {
    commits,
    isCommitted: () => false,
    addAndCommit: (_r, paths, message) => commits.push({ paths, message }),
  };
}

let scratch: string;
let projectsRoot: string;
let adrLogDir: string;

beforeEach(() => {
  scratch = mkdtempSync(join(tmpdir(), 'ev-loop-adr-emit-'));
  projectsRoot = join(scratch, 'projects');
  adrLogDir = join(projectsRoot, 'adr-log');
  mkdirSync(projectsRoot, { recursive: true });
});

afterEach(() => rmSync(scratch, { recursive: true, force: true }));

function ctx(git: GitRunner): CliContext {
  return { projectsRoot, repoRoot: scratch, today: '2026-05-28', gitRunner: git };
}

// The hook's scan is a pure literal-substring check on each
// notes_for_pr entry. Encoded here so the test asserts what the spec
// specifies (case-sensitive, bracketed-literal, no regex).
function scanForMarkers(notesForPr: string[]): { index: number; entry: string }[] {
  return notesForPr
    .map((entry, index) => ({ entry, index }))
    .filter(({ entry }) => entry.includes(ADR_CANDIDATE_MARKER));
}

// The hook's body composition shape: Context = paraphrase of the marked
// entry + one-line goal; Decision = the operator's named decision
// (the marked entry's substantive text minus the marker); Consequences
// = a literal TODO line for the operator to fill before commit.
function composeAdrBody(args: { markerEntry: string; unitGoal: string }): string {
  const { markerEntry, unitGoal } = args;
  const decisionText = markerEntry.replace(ADR_CANDIDATE_MARKER, '').trim();
  return [
    '## Context',
    '',
    `${decisionText} (surfaced during the unit; the operator tagged it as an ADR candidate.)`,
    '',
    `Unit goal: ${unitGoal}`,
    '',
    '## Decision',
    '',
    decisionText,
    '',
    '## Consequences',
    '',
    'TODO: operator to fill before commit',
    '',
  ].join('\n');
}

describe('ADR-emit hook: marker scan (slice 1)', () => {
  test('identifies entries containing the bracketed literal and skips others', () => {
    const notesForPr = [
      'Antagonist panel approved on first run with zero findings.',
      '[adr-candidate] Substrate friction — loom checkin write rejects partial checkins; the skill body should describe full-schema-at-close as the convention.',
      'Pre-existing test failure carried forward from prior checkins.',
    ];

    const matches = scanForMarkers(notesForPr);

    expect(matches).toHaveLength(1);
    expect(matches[0]?.index).toBe(1);
    expect(matches[0]?.entry).toContain(ADR_CANDIDATE_MARKER);
    expect(matches[0]?.entry).toContain('full-schema-at-close');
  });
});

describe('ADR-emit hook: body composition (slice 2)', () => {
  test('composes Context + Decision + Consequences-TODO from a marker entry', () => {
    const markerEntry =
      '[adr-candidate] Encode `node plugins/loom/cli/loom.ts` invocation pattern in new ev-loop surfaces rather than bare `loom` until the cached-plugin-lifecycle issue is resolved.';
    const unitGoal =
      'Insert step 5.5 (ADR-emit) into ev-loop-interactive between scope-shift and phase update.';

    const body = composeAdrBody({ markerEntry, unitGoal });

    expect(body).toContain('## Context');
    expect(body).toContain('## Decision');
    expect(body).toContain('## Consequences');
    expect(body).toContain('TODO: operator to fill before commit');
    expect(body).toContain('Unit goal: Insert step 5.5');
    expect(body).toContain('Encode `node plugins/loom/cli/loom.ts`');
    expect(body).not.toContain(ADR_CANDIDATE_MARKER);
  });
});

describe('ADR-emit hook: end-to-end (slice 3)', () => {
  test('composed body → adrVerb --no-commit → ADR file exists, zero git commits', () => {
    const markerEntry =
      '[adr-candidate] Use decimal step numbering (5.5) to preserve existing § step N references in the skill body.';
    const unitGoal =
      'Insert step 5.5 (ADR-emit) into ev-loop-interactive between scope-shift and phase update.';

    const body = composeAdrBody({ markerEntry, unitGoal });
    const bodyFile = join(scratch, 'adr-body.md');
    writeFileSync(bodyFile, body);

    const git = fakeGit();
    const title = 'Use decimal step numbering for ADR-emit insertion';
    const result = adrVerb([title, `--body-file=${bodyFile}`, '--no-commit'], ctx(git));

    expect(result.exitCode).toBe(0);
    const out = JSON.parse(result.stdout as string);
    expect(out.number).toBe('0001');
    expect(out.path).toBe(join(adrLogDir, '0001-use-decimal-step-numbering-for-adr-emit-insertion.md'));
    expect(out.committed).toBe(false);
    expect(existsSync(out.path)).toBe(true);
    expect(git.commits).toHaveLength(0);

    const content = readFileSync(out.path, 'utf8');
    expect(content).toContain('# 0001. Use decimal step numbering for ADR-emit insertion');
    expect(content).toContain('**Date**: 2026-05-28');
    expect(content).toContain('**Status**: accepted');
    expect(content).toContain('## Context');
    expect(content).toContain('## Decision');
    expect(content).toContain('## Consequences');
    expect(content).toContain('TODO: operator to fill before commit');
  });
});
