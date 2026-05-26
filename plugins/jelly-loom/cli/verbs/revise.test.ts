import { describe, test, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync, writeFileSync, readFileSync, mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { reviseVerb, appendRevisionLogEntry } from './revise.ts';
import { resolveProject } from '../lib/project.ts';
import type { GitRunner } from '../lib/git.ts';
import type { CliContext } from '../lib/types.ts';

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
let projectDir: string;
let revisionFile: string;

beforeEach(() => {
  scratch = mkdtempSync(join(tmpdir(), 'jelly-revise-'));
  projectsRoot = join(scratch, 'projects');
  projectDir = join(projectsRoot, '2026-05-25-demo');
  mkdirSync(projectDir, { recursive: true });
  writeFileSync(join(projectDir, 'PLAN.md'), '# Plan v1\n\noriginal plan\n');
  writeFileSync(join(projectDir, 'RESEARCH.md'), '# Research v1\n\noriginal research\n');
  revisionFile = join(scratch, 'revision.md');
  writeFileSync(revisionFile, '# Plan v2\n\nrevised plan body\n');
});

afterEach(() => rmSync(scratch, { recursive: true, force: true }));

function ctx(git: GitRunner): CliContext {
  return { projectsRoot, repoRoot: scratch, today: '2026-05-26', gitRunner: git };
}

function args(slug: string, target: string, extra: string[] = []): string[] {
  return [
    slug,
    `--target=${target}`,
    `--revision-file=${revisionFile}`,
    '--rationale=because reasons',
    ...extra,
  ];
}

describe('reviseVerb: target selection', () => {
  test('--target=plan replaces PLAN.md + appends a revision log', () => {
    const git = fakeGit();
    const result = reviseVerb(args('2026-05-25-demo', 'plan'), ctx(git));
    expect(result.exitCode).toBe(0);
    const out = JSON.parse(result.stdout as string);
    expect(out.target).toBe('plan');
    expect(out.committed).toBe(true);
    const plan = readFileSync(join(projectDir, 'PLAN.md'), 'utf8');
    expect(plan).toContain('revised plan body');
    expect(plan).toContain('## Revision log');
    expect(plan).toContain('2026-05-26 — because reasons');
    expect(git.commits[0].message).toBe('[jelly revise] 2026-05-25-demo (plan): because reasons');
  });

  test('--target=research replaces RESEARCH.md + appends a revision log', () => {
    writeFileSync(revisionFile, '# Research v2\n\nrevised research body\n');
    const result = reviseVerb(args('2026-05-25-demo', 'research'), ctx(fakeGit()));
    expect(result.exitCode).toBe(0);
    expect(JSON.parse(result.stdout as string).target).toBe('research');
    const research = readFileSync(join(projectDir, 'RESEARCH.md'), 'utf8');
    expect(research).toContain('revised research body');
    expect(research).toContain('2026-05-26 — because reasons');
    // PLAN.md untouched.
    expect(readFileSync(join(projectDir, 'PLAN.md'), 'utf8')).toContain('original plan');
  });

  test('--no-commit writes the file but does not commit', () => {
    const git = fakeGit();
    const result = reviseVerb(args('2026-05-25-demo', 'plan', ['--no-commit']), ctx(git));
    expect(JSON.parse(result.stdout as string).committed).toBe(false);
    expect(git.commits).toHaveLength(0);
    expect(readFileSync(join(projectDir, 'PLAN.md'), 'utf8')).toContain('revised plan body');
  });
});

describe('reviseVerb: validation', () => {
  test('missing slug → missing-args', () => {
    const result = reviseVerb(
      [`--target=plan`, `--revision-file=${revisionFile}`, '--rationale=x'],
      ctx(fakeGit()),
    );
    expect(JSON.parse(result.stderr as string).error).toBe('missing-args');
  });

  test('missing --target → missing-args', () => {
    const result = reviseVerb(
      ['2026-05-25-demo', `--revision-file=${revisionFile}`, '--rationale=x'],
      ctx(fakeGit()),
    );
    expect(JSON.parse(result.stderr as string).error).toBe('missing-args');
  });

  test('invalid --target → invalid-target', () => {
    const result = reviseVerb(args('2026-05-25-demo', 'manifest'), ctx(fakeGit()));
    expect(JSON.parse(result.stderr as string).error).toBe('invalid-target');
  });

  test('empty --rationale → missing-args', () => {
    const result = reviseVerb(
      ['2026-05-25-demo', '--target=plan', `--revision-file=${revisionFile}`, '--rationale=  '],
      ctx(fakeGit()),
    );
    expect(JSON.parse(result.stderr as string).error).toBe('missing-args');
  });

  test('target file absent → target-not-found', () => {
    rmSync(join(projectDir, 'RESEARCH.md'));
    const result = reviseVerb(args('2026-05-25-demo', 'research'), ctx(fakeGit()));
    expect(JSON.parse(result.stderr as string).error).toBe('target-not-found');
  });

  test('unknown project → project-not-found', () => {
    const result = reviseVerb(args('2026-05-25-nonexistent', 'plan'), ctx(fakeGit()));
    expect(JSON.parse(result.stderr as string).error).toBe('project-not-found');
  });
});

describe('reviseVerb: slug resolution', () => {
  test('resolves a date-less slug to the project', () => {
    const result = reviseVerb(args('demo', 'plan'), ctx(fakeGit()));
    expect(result.exitCode).toBe(0);
    expect(JSON.parse(result.stdout as string).slug).toBe('2026-05-25-demo');
  });

  test('ambiguous date-less slug → slug-ambiguous with candidates', () => {
    mkdirSync(join(projectsRoot, '2026-06-01-demo'), { recursive: true });
    writeFileSync(join(projectsRoot, '2026-06-01-demo', 'PLAN.md'), '# other\n');
    const result = reviseVerb(args('demo', 'plan'), ctx(fakeGit()));
    expect(result.exitCode).toBe(1);
    const parsed = JSON.parse(result.stderr as string);
    expect(parsed.error).toBe('slug-ambiguous');
    expect(parsed.candidates).toHaveLength(2);
  });
});

describe('appendRevisionLogEntry (unit)', () => {
  test('appends a fresh ## Revision log section when none exists', () => {
    const out = appendRevisionLogEntry('# Doc\n\nbody\n', '2026-05-26', 'why');
    expect(out).toContain('## Revision log');
    expect(out).toContain('- 2026-05-26 — why');
  });

  test('inserts newest-first under an existing ## Revision log heading', () => {
    const input = '# Doc\n\nbody\n\n## Revision log\n\n- 2026-05-01 — older\n';
    const out = appendRevisionLogEntry(input, '2026-05-26', 'newer');
    const newerIdx = out.indexOf('- 2026-05-26 — newer');
    const olderIdx = out.indexOf('- 2026-05-01 — older');
    expect(newerIdx).toBeGreaterThan(-1);
    expect(olderIdx).toBeGreaterThan(-1);
    expect(newerIdx).toBeLessThan(olderIdx); // newest-first
  });
});

describe('resolveProject (unit)', () => {
  test('full slug resolves to the project dir', () => {
    expect(resolveProject('2026-05-25-demo', projectsRoot)).toBe(projectDir);
  });

  test('date-less slug resolves via suffix match', () => {
    expect(resolveProject('demo', projectsRoot)).toBe(projectDir);
  });

  test('unknown full slug throws project-not-found', () => {
    expect(() => resolveProject('2026-05-25-nope', projectsRoot)).toThrow(/project-not-found/);
  });

  test('ambiguous date-less throws slug-ambiguous', () => {
    mkdirSync(join(projectsRoot, '2026-06-01-demo'), { recursive: true });
    expect(() => resolveProject('demo', projectsRoot)).toThrow(/slug-ambiguous/);
  });
});
