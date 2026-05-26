import { describe, test, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync, writeFileSync, readFileSync, existsSync, mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { researchVerb } from './research.ts';
import type { GitRunner } from '../lib/git.ts';
import type { CliContext } from '../lib/types.ts';

// A recording fake GitRunner: `committed` controls isCommitted's
// answer; `commits` records each addAndCommit call so tests can assert
// what was staged + the message.
function fakeGit(committed = false): GitRunner & {
  commits: { paths: string[]; message: string }[];
} {
  const commits: { paths: string[]; message: string }[] = [];
  return {
    commits,
    isCommitted: () => committed,
    addAndCommit: (_repoRoot, paths, message) => {
      commits.push({ paths, message });
    },
  };
}

let scratch: string;
let projectsRoot: string;
let srcResearch: string;
let srcNotes: string;

beforeEach(() => {
  scratch = mkdtempSync(join(tmpdir(), 'jelly-research-'));
  projectsRoot = join(scratch, 'projects');
  mkdirSync(projectsRoot, { recursive: true });
  srcResearch = join(scratch, 'src-research.md');
  srcNotes = join(scratch, 'src-notes.md');
  writeFileSync(srcResearch, '# Research\n\nfindings here\n');
  writeFileSync(srcNotes, '# Notes\n\nraw notes here\n');
});

afterEach(() => {
  rmSync(scratch, { recursive: true, force: true });
});

function ctxWith(git: GitRunner): CliContext {
  return { projectsRoot, repoRoot: scratch, today: '2026-05-25', gitRunner: git };
}

describe('researchVerb: happy path', () => {
  test('topic → slug, files copied into projects/<slug>/, committed', () => {
    const git = fakeGit();
    const result = researchVerb(
      ['Some Topic', `--research-file=${srcResearch}`, `--notes-file=${srcNotes}`],
      ctxWith(git),
    );
    expect(result.exitCode).toBe(0);
    const out = JSON.parse(result.stdout as string);
    expect(out.slug).toBe('2026-05-25-some-topic');
    const dir = join(projectsRoot, '2026-05-25-some-topic');
    expect(readFileSync(join(dir, 'RESEARCH.md'), 'utf8')).toContain('findings here');
    expect(readFileSync(join(dir, 'RESEARCH-NOTES.md'), 'utf8')).toContain('raw notes here');
    expect(out.committed).toBe(true);
    expect(git.commits).toHaveLength(1);
    expect(git.commits[0].message).toBe('[jelly research] 2026-05-25-some-topic');
  });

  test('an already-formed slug is used verbatim (not re-slugified)', () => {
    const git = fakeGit();
    const result = researchVerb(
      ['2026-01-02-existing-slug', `--research-file=${srcResearch}`, `--notes-file=${srcNotes}`],
      ctxWith(git),
    );
    expect(result.exitCode).toBe(0);
    expect(JSON.parse(result.stdout as string).slug).toBe('2026-01-02-existing-slug');
  });

  test('writes NO manifest, config, or events file (jelly discipline)', () => {
    const git = fakeGit();
    researchVerb(
      ['t-opic', `--research-file=${srcResearch}`, `--notes-file=${srcNotes}`],
      ctxWith(git),
    );
    const dir = join(projectsRoot, '2026-05-25-t-opic');
    expect(existsSync(join(dir, 'manifest.toml'))).toBe(false);
    expect(existsSync(join(dir, 'manifest.json'))).toBe(false);
    expect(existsSync(join(dir, 'config.json'))).toBe(false);
    expect(existsSync(join(dir, 'events.jsonl'))).toBe(false);
    // Only the two dossier files were staged.
    expect(git.commits[0].paths).toHaveLength(2);
  });

  test('--no-commit copies files but does not commit', () => {
    const git = fakeGit();
    const result = researchVerb(
      ['t-opic', `--research-file=${srcResearch}`, `--notes-file=${srcNotes}`, '--no-commit'],
      ctxWith(git),
    );
    expect(result.exitCode).toBe(0);
    expect(JSON.parse(result.stdout as string).committed).toBe(false);
    expect(git.commits).toHaveLength(0);
    expect(existsSync(join(projectsRoot, '2026-05-25-t-opic', 'RESEARCH.md'))).toBe(true);
  });
});

describe('researchVerb: argument + source validation', () => {
  test('missing topic → missing-args', () => {
    const result = researchVerb([`--research-file=${srcResearch}`, `--notes-file=${srcNotes}`], ctxWith(fakeGit()));
    expect(result.exitCode).toBe(1);
    expect(JSON.parse(result.stderr as string).error).toBe('missing-args');
  });

  test('missing --research-file → missing-args', () => {
    const result = researchVerb(['topic', `--notes-file=${srcNotes}`], ctxWith(fakeGit()));
    expect(JSON.parse(result.stderr as string).error).toBe('missing-args');
  });

  test('missing --notes-file → missing-args', () => {
    const result = researchVerb(['topic', `--research-file=${srcResearch}`], ctxWith(fakeGit()));
    expect(JSON.parse(result.stderr as string).error).toBe('missing-args');
  });

  test('--research-file not found → research-file-not-found', () => {
    const result = researchVerb(
      ['topic', `--research-file=${join(scratch, 'nope.md')}`, `--notes-file=${srcNotes}`],
      ctxWith(fakeGit()),
    );
    expect(JSON.parse(result.stderr as string).error).toBe('research-file-not-found');
  });

  test('--notes-file not found → notes-file-not-found', () => {
    const result = researchVerb(
      ['topic', `--research-file=${srcResearch}`, `--notes-file=${join(scratch, 'nope.md')}`],
      ctxWith(fakeGit()),
    );
    expect(JSON.parse(result.stderr as string).error).toBe('notes-file-not-found');
  });
});

describe('researchVerb: collision handling', () => {
  test('committed RESEARCH.md → research-exists-committed (refuse)', () => {
    // First run lands an (uncommitted) RESEARCH.md.
    researchVerb(
      ['2026-05-25-dup', `--research-file=${srcResearch}`, `--notes-file=${srcNotes}`, '--no-commit'],
      ctxWith(fakeGit()),
    );
    // Second run with a git runner that reports the file as committed.
    const result = researchVerb(
      ['2026-05-25-dup', `--research-file=${srcResearch}`, `--notes-file=${srcNotes}`],
      ctxWith(fakeGit(true)),
    );
    expect(result.exitCode).toBe(1);
    expect(JSON.parse(result.stderr as string).error).toBe('research-exists-committed');
  });

  test('uncommitted RESEARCH.md → overwrite allowed (recovery path)', () => {
    researchVerb(
      ['2026-05-25-dup', `--research-file=${srcResearch}`, `--notes-file=${srcNotes}`, '--no-commit'],
      ctxWith(fakeGit()),
    );
    // Overwrite the source so we can confirm the second run replaced it.
    writeFileSync(srcResearch, '# Research v2\n\nrevised findings\n');
    const result = researchVerb(
      ['2026-05-25-dup', `--research-file=${srcResearch}`, `--notes-file=${srcNotes}`],
      ctxWith(fakeGit(false)),
    );
    expect(result.exitCode).toBe(0);
    expect(
      readFileSync(join(projectsRoot, '2026-05-25-dup', 'RESEARCH.md'), 'utf8'),
    ).toContain('revised findings');
  });
});
