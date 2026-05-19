import { mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, test } from 'vitest';
import { doctorVerb } from './doctor.ts';
import { makeProjectRoot } from './_test-factory.ts';

let root: string;
let cleanup: () => void;

afterEach(() => {
  cleanup();
});

describe('griot doctor: divergence detection', () => {
  beforeEach(() => {
    ({ root, cleanup } = makeProjectRoot({
      prefix: 'doctor-verb-test-',
      gitInit: true,
    }));
  });

  test('warns when nested-cwd learnings/ coexists with project-root learnings/', () => {
    mkdirSync(join(root, 'learnings'), { recursive: true });
    const nested = join(root, 'nested', 'inner');
    mkdirSync(join(nested, 'learnings'), { recursive: true });

    const result = doctorVerb([], { cwd: nested });

    expect(result.exitCode).toBe(0);
    expect(result.stdout).toMatch(/divergence detected/);
    expect(result.stdout).toContain(join(nested, 'learnings'));
    expect(result.stdout).toContain(join(root, 'learnings'));
  });

  test('reports ok when only project-root has learnings/', () => {
    mkdirSync(join(root, 'learnings'), { recursive: true });
    const nested = join(root, 'nested');
    mkdirSync(nested, { recursive: true });

    const result = doctorVerb([], { cwd: nested });

    expect(result.exitCode).toBe(0);
    expect(result.stdout).toBe('griot doctor: ok');
  });

  test('reports ok when cwd is already the project root', () => {
    mkdirSync(join(root, 'learnings'), { recursive: true });

    const result = doctorVerb([], { cwd: root });

    expect(result.exitCode).toBe(0);
    expect(result.stdout).toBe('griot doctor: ok');
  });

  test('reports ok when neither has learnings/', () => {
    const nested = join(root, 'nested');
    mkdirSync(nested, { recursive: true });

    const result = doctorVerb([], { cwd: nested });

    expect(result.exitCode).toBe(0);
    expect(result.stdout).toBe('griot doctor: ok');
  });
});

describe('griot doctor: no-git fallback', () => {
  beforeEach(() => {
    ({ root, cleanup } = makeProjectRoot({ prefix: 'doctor-verb-test-' }));
  });

  test('reports ok when no .git/ marker exists (cwd is project-root by fallback)', () => {
    mkdirSync(join(root, 'learnings'), { recursive: true });
    const nested = join(root, 'nested');
    mkdirSync(join(nested, 'learnings'), { recursive: true });

    // resolveProjectRoot falls back to the nested cwd when no .git/
    // is found walking up. cwd === projectRoot, so the divergence
    // branch can't fire — output is ok.
    const result = doctorVerb([], { cwd: nested });

    expect(result.exitCode).toBe(0);
    expect(result.stdout).toBe('griot doctor: ok');
  });
});
