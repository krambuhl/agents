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

  test('does NOT create or touch .gitignore', () => {
    // The substrate works because learnings are committed; init must not
    // gitignore the tree it just scaffolded.
    initVerb([], { cwd: root });

    expect(existsSync(join(root, '.gitignore'))).toBe(false);
  });

  test('stdout summarizes the tree creation', () => {
    const result = initVerb([], { cwd: root });

    expect(result.stdout).toMatch(/learnings\/ created/);
    expect(result.stdout).toMatch(/subdirs created/);
    expect(result.stdout).not.toMatch(/gitignore/);
  });
});

describe('griot init: idempotency', () => {
  test('second run is a no-op (does not disturb the tree)', () => {
    initVerb([], { cwd: root });
    const second = initVerb([], { cwd: root });

    expect(second.exitCode).toBe(0);
    expect(existsSync(learnings('session-notes'))).toBe(true);
    expect(existsSync(learnings('nightly'))).toBe(true);
  });

  test('second run reports no changes when state already matches', () => {
    initVerb([], { cwd: root });
    const second = initVerb([], { cwd: root });

    // No "learnings/ created" or "subdirs created" because both already exist.
    expect(second.stdout).not.toMatch(/learnings\/ created/);
    expect(second.stdout).not.toMatch(/subdirs created/);
    expect(second.stdout).toMatch(/no changes \(learnings tree already present\)/);
  });
});

describe('griot init: pre-existing .gitignore is left alone', () => {
  test('does not append to an existing .gitignore', () => {
    const original = 'node_modules/\ndist/\n';
    writeFileSync(join(root, '.gitignore'), original, 'utf8');

    initVerb([], { cwd: root });

    expect(readFileSync(join(root, '.gitignore'), 'utf8')).toBe(original);
  });
});

describe('griot init: nested-cwd project-root resolution', () => {
  let gitRoot: string;
  let gitCleanup: () => void;

  beforeEach(() => {
    ({ root: gitRoot, cleanup: gitCleanup } = makeProjectRoot({
      prefix: 'init-verb-nested-test-',
      gitInit: true,
    }));
  });

  afterEach(() => {
    gitCleanup();
  });

  test('operates on the .git/-rooted project root, not the nested cwd', () => {
    const nested = join(gitRoot, 'sketches', 'one');
    mkdirSync(nested, { recursive: true });

    const result = initVerb([], { cwd: nested });

    expect(result.exitCode).toBe(0);
    // learnings/ lands at the project root, NOT under the nested cwd
    expect(existsSync(join(gitRoot, 'learnings', 'session-notes'))).toBe(true);
    expect(existsSync(join(nested, 'learnings'))).toBe(false);
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
