import { describe, test, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync, writeFileSync, readFileSync, existsSync, mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { adrVerb, nextAdrNumber } from './adr.ts';
import type { GitRunner } from '../../lib/git.ts';
import type { CliContext } from './project.ts';

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
  scratch = mkdtempSync(join(tmpdir(), 'loom-adr-'));
  projectsRoot = join(scratch, 'projects');
  adrLogDir = join(projectsRoot, 'adr-log');
  mkdirSync(projectsRoot, { recursive: true });
});

afterEach(() => rmSync(scratch, { recursive: true, force: true }));

function ctx(git: GitRunner): CliContext {
  return { projectsRoot, repoRoot: scratch, today: '2026-05-28', gitRunner: git };
}

describe('adrVerb: numbering + filename', () => {
  test('first ADR is 0001 when the adr-log is absent', () => {
    const git = fakeGit();
    const result = adrVerb(['Use TOML for the manifest'], ctx(git));
    expect(result.exitCode).toBe(0);
    const out = JSON.parse(result.stdout as string);
    expect(out.number).toBe('0001');
    expect(out.slug).toBe('use-toml-for-the-manifest');
    expect(existsSync(join(adrLogDir, '0001-use-toml-for-the-manifest.md'))).toBe(true);
    expect(git.commits[0].message).toBe('[loom] adr 0001: Use TOML for the manifest');
  });

  test('numbers increment sequentially across calls', () => {
    adrVerb(['First decision'], ctx(fakeGit()));
    adrVerb(['Second decision'], ctx(fakeGit()));
    const third = adrVerb(['Third decision'], ctx(fakeGit()));
    expect(JSON.parse(third.stdout as string).number).toBe('0003');
  });

  test('next number is max + 1, not count + 1 (gaps are not reused)', () => {
    mkdirSync(adrLogDir, { recursive: true });
    writeFileSync(join(adrLogDir, '0001-a.md'), '# 0001. a\n');
    writeFileSync(join(adrLogDir, '0003-c.md'), '# 0003. c\n'); // 0002 "deleted"
    const result = adrVerb(['Next one'], ctx(fakeGit()));
    expect(JSON.parse(result.stdout as string).number).toBe('0004');
  });

  test('the title is slugified for the filename', () => {
    const result = adrVerb(['Adopt @-import for CLAUDE.md!!'], ctx(fakeGit()));
    expect(JSON.parse(result.stdout as string).slug).toBe('adopt-import-for-claude-md');
  });
});

describe('adrVerb: content', () => {
  test('composes the ADR header with number, title, date, default status', () => {
    adrVerb(['My decision'], ctx(fakeGit()));
    const content = readFileSync(join(adrLogDir, '0001-my-decision.md'), 'utf8');
    expect(content).toContain('# 0001. My decision');
    expect(content).toContain('**Date**: 2026-05-28');
    expect(content).toContain('**Status**: accepted');
  });

  test('--status overrides the default', () => {
    adrVerb(['My decision', '--status=proposed'], ctx(fakeGit()));
    const content = readFileSync(join(adrLogDir, '0001-my-decision.md'), 'utf8');
    expect(content).toContain('**Status**: proposed');
  });

  test('--body-file content is used as the ADR body', () => {
    const bodyFile = join(scratch, 'body.md');
    writeFileSync(bodyFile, '## Context\n\nthe real context\n');
    adrVerb(['My decision', `--body-file=${bodyFile}`], ctx(fakeGit()));
    const content = readFileSync(join(adrLogDir, '0001-my-decision.md'), 'utf8');
    expect(content).toContain('the real context');
  });

  test('without --body-file, a TODO stub body is written', () => {
    adrVerb(['My decision'], ctx(fakeGit()));
    const content = readFileSync(join(adrLogDir, '0001-my-decision.md'), 'utf8');
    expect(content).toContain('## Context');
    expect(content).toContain('## Decision');
    expect(content).toContain('## Consequences');
    expect(content).toContain('TODO');
  });

  test('--no-commit writes the file but does not commit', () => {
    const git = fakeGit();
    const result = adrVerb(['My decision', '--no-commit'], ctx(git));
    expect(JSON.parse(result.stdout as string).committed).toBe(false);
    expect(git.commits).toHaveLength(0);
    expect(existsSync(join(adrLogDir, '0001-my-decision.md'))).toBe(true);
  });
});

describe('adrVerb: validation', () => {
  test('missing title → missing-args', () => {
    const result = adrVerb([], ctx(fakeGit()));
    expect(JSON.parse(result.stderr as string).error).toBe('missing-args');
  });

  test('whitespace-only title → missing-args', () => {
    const result = adrVerb(['   '], ctx(fakeGit()));
    expect(JSON.parse(result.stderr as string).error).toBe('missing-args');
  });

  test('a title that slugifies to <2 chars → invalid-title', () => {
    const result = adrVerb(['!'], ctx(fakeGit()));
    expect(JSON.parse(result.stderr as string).error).toBe('invalid-title');
  });

  test('--body-file that does not exist → body-file-not-found', () => {
    const result = adrVerb(
      ['My decision', `--body-file=${join(scratch, 'nope.md')}`],
      ctx(fakeGit()),
    );
    expect(JSON.parse(result.stderr as string).error).toBe('body-file-not-found');
  });
});

describe('nextAdrNumber (unit)', () => {
  test('returns 1 for an absent adr-log', () => {
    expect(nextAdrNumber(join(scratch, 'no-such-dir'))).toBe(1);
  });

  test('returns 1 for an empty adr-log', () => {
    mkdirSync(adrLogDir, { recursive: true });
    expect(nextAdrNumber(adrLogDir)).toBe(1);
  });

  test('returns max + 1, ignoring non-ADR files and gaps', () => {
    mkdirSync(adrLogDir, { recursive: true });
    writeFileSync(join(adrLogDir, '0001-a.md'), '');
    writeFileSync(join(adrLogDir, '0005-e.md'), '');
    writeFileSync(join(adrLogDir, 'README.md'), ''); // ignored (no NNNN prefix)
    writeFileSync(join(adrLogDir, 'notes.txt'), ''); // ignored (not .md NNNN)
    expect(nextAdrNumber(adrLogDir)).toBe(6);
  });
});
