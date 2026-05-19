import { existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, test } from 'vitest';
import { initVerb } from './init.ts';
import { makeProjectRoot } from './_test-factory.ts';

let root: string;
let cleanup: () => void;

beforeEach(() => {
  ({ root, cleanup } = makeProjectRoot('init-verb-test-'));
});

afterEach(() => {
  cleanup();
});

function gitignorePath(): string {
  return join(root, '.gitignore');
}

function learnings(...parts: string[]): string {
  return join(root, 'learnings', ...parts);
}

describe('griot init: fresh project root', () => {
  test('creates learnings/ + session-notes/ + nightly/ subdirs', () => {
    const result = initVerb([], { cwd: root });

    expect(result.exitCode).toBe(0);
    expect(existsSync(learnings())).toBe(true);
    expect(existsSync(learnings('session-notes'))).toBe(true);
    expect(existsSync(learnings('nightly'))).toBe(true);
    expect(statSync(learnings('session-notes')).isDirectory()).toBe(true);
    expect(statSync(learnings('nightly')).isDirectory()).toBe(true);
  });

  test('creates .gitignore containing learnings/', () => {
    initVerb([], { cwd: root });

    expect(existsSync(gitignorePath())).toBe(true);
    expect(readFileSync(gitignorePath(), 'utf8')).toBe('learnings/\n');
  });

  test('stdout summarizes both actions', () => {
    const result = initVerb([], { cwd: root });

    expect(result.stdout).toMatch(/learnings\/ created/);
    expect(result.stdout).toMatch(/subdirs created/);
    expect(result.stdout).toMatch(/\.gitignore created/);
  });
});

describe('griot init: idempotency', () => {
  test('second run is a no-op (file contents unchanged)', () => {
    initVerb([], { cwd: root });
    const firstContent = readFileSync(gitignorePath(), 'utf8');

    const second = initVerb([], { cwd: root });

    expect(second.exitCode).toBe(0);
    expect(readFileSync(gitignorePath(), 'utf8')).toBe(firstContent);
  });

  test('second run reports no changes when state already matches', () => {
    initVerb([], { cwd: root });
    const second = initVerb([], { cwd: root });

    // No "learnings/ created" or "subdirs created" because both already exist.
    expect(second.stdout).not.toMatch(/learnings\/ created/);
    expect(second.stdout).not.toMatch(/subdirs created/);
    expect(second.stdout).toMatch(/no changes \(unchanged\)/);
  });
});

describe('griot init: existing .gitignore', () => {
  test('appends learnings/ when file exists without the line', () => {
    writeFileSync(gitignorePath(), 'node_modules/\ndist/\n', 'utf8');

    initVerb([], { cwd: root });

    const content = readFileSync(gitignorePath(), 'utf8');
    expect(content).toBe('node_modules/\ndist/\nlearnings/\n');
  });

  test('inserts a separator newline when file does not end with one', () => {
    writeFileSync(gitignorePath(), 'node_modules/', 'utf8');

    initVerb([], { cwd: root });

    const content = readFileSync(gitignorePath(), 'utf8');
    expect(content).toBe('node_modules/\nlearnings/\n');
  });

  test('leaves file unchanged when learnings/ is already present', () => {
    const original = 'node_modules/\nlearnings/\ndist/\n';
    writeFileSync(gitignorePath(), original, 'utf8');

    const result = initVerb([], { cwd: root });

    expect(readFileSync(gitignorePath(), 'utf8')).toBe(original);
    expect(result.stdout).toMatch(/\.gitignore unchanged/);
  });

  test('ignores deeper paths like learnings/foo as not-present', () => {
    // `learnings/foo` matches `learnings/foo` as a path, not the
    // directory-level ignore the verb is responsible for. The verb
    // should still append the directory-level line.
    writeFileSync(gitignorePath(), 'learnings/foo\n', 'utf8');

    initVerb([], { cwd: root });

    expect(readFileSync(gitignorePath(), 'utf8')).toBe('learnings/foo\nlearnings/\n');
  });

  test('tolerates trailing whitespace on the matching line', () => {
    writeFileSync(gitignorePath(), 'learnings/   \n', 'utf8');

    initVerb([], { cwd: root });

    // Trimmed match treats `learnings/   ` as present; no append.
    expect(readFileSync(gitignorePath(), 'utf8')).toBe('learnings/   \n');
  });
});

describe('griot init: pre-existing learnings tree', () => {
  test('preserves existing learnings/session-notes/<folder>/ content', () => {
    const captureFolder = learnings('session-notes', '2026-05-19-T00-00-00-existing');
    mkdirSync(captureFolder, { recursive: true });
    writeFileSync(join(captureFolder, 'state.json'), '{"keep":true}\n', 'utf8');

    initVerb([], { cwd: root });

    expect(existsSync(join(captureFolder, 'state.json'))).toBe(true);
    expect(readFileSync(join(captureFolder, 'state.json'), 'utf8')).toBe('{"keep":true}\n');
  });

  test('does not recreate already-present subdirs', () => {
    mkdirSync(learnings('nightly'), { recursive: true });

    const result = initVerb([], { cwd: root });

    // Only session-notes shows up in subdirs_created (nightly already existed).
    expect(result.stdout).toMatch(/subdirs created: session-notes/);
    expect(result.stdout).not.toMatch(/nightly/);
  });

  test('reports the subset that was created', () => {
    mkdirSync(learnings('session-notes'), { recursive: true });

    const result = initVerb([], { cwd: root });

    expect(result.stdout).toMatch(/subdirs created: nightly/);
    expect(result.stdout).not.toMatch(/session-notes/);
  });
});
