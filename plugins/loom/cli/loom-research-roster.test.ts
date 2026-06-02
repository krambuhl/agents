import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, test } from 'vitest';

// loom-research is the RESEARCH RPI phase, so its panels must spawn the
// research roster — not the plan roster. Phase 2 of
// orchestrator-guild-rpi-alignment wired `derive-panel --phase=research`
// (shipped in Phase 1) into the shift-panel seam and reserved `plan-*`
// for the plan phase. These assertions lock that wiring against the
// SKILL.md body.

const SKILL = readFileSync(
  join(
    dirname(fileURLToPath(import.meta.url)),
    '..',
    'skills',
    'loom-research',
    'SKILL.md',
  ),
  'utf8',
);

describe('loom-research composes the research roster (Phase 2 seam)', () => {
  test('the shift panel resolves via derive-panel --phase=research', () => {
    expect(SKILL).toMatch(/guild derive-panel --phase=research/);
  });

  test('research-* is the documented bootstrapping glob fallback', () => {
    expect(SKILL).toContain('.claude/agents/research-*.md');
  });

  test('the shift-panel roster no longer globs the plan roster', () => {
    expect(SKILL).not.toContain('Glob(".claude/agents/plan-*.md")');
  });

  test('the empty-research-roster bootstrapping skip is documented', () => {
    expect(SKILL).toMatch(/no research engineers registered/i);
    expect(SKILL).toMatch(/skip this shift.s panel/i);
  });

  test('/guild-plan remains the panel-runner (only the roster changed)', () => {
    expect(SKILL).toContain('/guild-plan');
  });
});
