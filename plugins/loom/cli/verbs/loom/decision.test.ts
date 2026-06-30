import { describe, expect, test, beforeEach, afterEach } from 'vitest';
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { decisionVerb, nextDecisionNumber } from './decision.ts';
import type { CliContext } from './project.ts';

const SLUG = '2026-06-30-demo';
let projectsRoot: string;
let ctx: CliContext;

beforeEach(() => {
  projectsRoot = mkdtempSync(join(tmpdir(), 'decision-verb-'));
  // resolveProject recognises a dir by the manifest.toml marker (existence).
  mkdirSync(join(projectsRoot, SLUG), { recursive: true });
  writeFileSync(join(projectsRoot, SLUG, 'manifest.toml'), '', 'utf8');
  ctx = { projectsRoot, today: '2026-06-30' } as CliContext;
});

afterEach(() => {
  rmSync(projectsRoot, { recursive: true, force: true });
});

function parse(out: { stdout?: string }): Record<string, unknown> {
  return JSON.parse(out.stdout ?? '{}');
}

describe('loom decision', () => {
  test('writes a numbered, project-scoped decision', () => {
    const r = decisionVerb([SLUG, 'My First Decision', '--no-commit'], ctx);
    expect(r.exitCode).toBe(0);
    const j = parse(r);
    expect(j.number).toBe('0001');
    expect(j.committed).toBe(false);
    const p = join(projectsRoot, SLUG, 'decisions', '0001-my-first-decision.md');
    expect(existsSync(p)).toBe(true);
    const body = readFileSync(p, 'utf8');
    expect(body).toContain('# 0001. My First Decision');
    expect(body).toContain('**Status**: accepted');
    expect(body).toContain('**Scope**: project scope');
  });

  test('numbers increment (max + 1, never reused)', () => {
    decisionVerb([SLUG, 'First', '--no-commit'], ctx);
    const r2 = decisionVerb([SLUG, 'Second', '--no-commit'], ctx);
    expect(parse(r2).number).toBe('0002');
    // gaps are not reused
    rmSync(join(projectsRoot, SLUG, 'decisions', '0001-first.md'));
    const r3 = decisionVerb([SLUG, 'Third', '--no-commit'], ctx);
    expect(parse(r3).number).toBe('0003');
  });

  test('--body-file supplies the body; --status/--scope override', () => {
    const bf = join(projectsRoot, 'body.md');
    writeFileSync(bf, '## Decision\n\nUse the split format.', 'utf8');
    const r = decisionVerb(
      [SLUG, 'Adopt Split', '--no-commit', `--body-file=${bf}`, '--status=proposed', '--scope=storage'],
      ctx,
    );
    const body = readFileSync(String(parse(r).path), 'utf8');
    expect(body).toContain('Use the split format.');
    expect(body).toContain('**Status**: proposed');
    expect(body).toContain('**Scope**: storage');
  });

  test('list returns the decisions in order', () => {
    decisionVerb([SLUG, 'Alpha', '--no-commit'], ctx);
    decisionVerb([SLUG, 'Beta', '--no-commit'], ctx);
    const r = decisionVerb(['list', SLUG], ctx);
    const j = parse(r) as { decisions: { number: string }[] };
    expect(j.decisions.map((d) => d.number)).toEqual(['0001', '0002']);
  });

  test('missing slug or title errors', () => {
    expect(decisionVerb(['--no-commit'], ctx).exitCode).toBe(1);
    expect(decisionVerb([SLUG, '', '--no-commit'], ctx).exitCode).toBe(1);
  });

  test('unknown slug surfaces the loom error', () => {
    expect(decisionVerb(['no-such-project', 'Title', '--no-commit'], ctx).exitCode).toBe(1);
  });

  test('nextDecisionNumber is 1 for an absent dir', () => {
    expect(nextDecisionNumber(join(projectsRoot, 'nope', 'decisions'))).toBe(1);
  });
});
