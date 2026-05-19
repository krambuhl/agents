import { mkdirSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { afterEach, beforeEach, describe, expect, test } from 'vitest';
import { resolveProjectRoot } from './_project-root.ts';
import { makeProjectRoot } from './_test-factory.ts';

let root: string;
let cleanup: () => void;

afterEach(() => {
  cleanup();
});

describe('resolveProjectRoot: .git directory marker', () => {
  beforeEach(() => {
    ({ root, cleanup } = makeProjectRoot({
      prefix: 'resolve-root-test-',
      gitInit: true,
    }));
  });

  test('returns the .git/-rooted directory when called from project root', () => {
    expect(resolveProjectRoot(root)).toBe(resolve(root));
  });

  test('returns the project root when called from a nested subdir', () => {
    const nested = join(root, 'a', 'b', 'c');
    mkdirSync(nested, { recursive: true });

    expect(resolveProjectRoot(nested)).toBe(resolve(root));
  });

  test('returns the project root when called from an immediate child', () => {
    const child = join(root, 'a');
    mkdirSync(child, { recursive: true });

    expect(resolveProjectRoot(child)).toBe(resolve(root));
  });
});

describe('resolveProjectRoot: .git file marker (worktree shape)', () => {
  beforeEach(() => {
    ({ root, cleanup } = makeProjectRoot({ prefix: 'resolve-root-test-' }));
    // Worktrees use a `.git` file containing `gitdir: <path>` rather
    // than a directory. The resolver only checks existence, so a
    // file works as the marker too.
    writeFileSync(join(root, '.git'), 'gitdir: /elsewhere\n', 'utf8');
  });

  test('treats a .git file as a valid project-root marker', () => {
    const nested = join(root, 'sub');
    mkdirSync(nested, { recursive: true });

    expect(resolveProjectRoot(nested)).toBe(resolve(root));
  });
});

describe('resolveProjectRoot: no .git/ fallback', () => {
  beforeEach(() => {
    ({ root, cleanup } = makeProjectRoot({ prefix: 'resolve-root-test-' }));
  });

  test('falls back to startingPath when no .git/ is reached', () => {
    const nested = join(root, 'a', 'b');
    mkdirSync(nested, { recursive: true });

    // No .git/ anywhere in the walk-up; the resolver returns the
    // resolved starting hint unchanged.
    expect(resolveProjectRoot(nested)).toBe(resolve(nested));
  });

  test('terminates at the filesystem root without infinite-looping', () => {
    // Any path whose walk-up reaches `/` without finding `.git/` is
    // a smoke test for the termination guard. Use the OS root
    // directly — there's no `.git/` at `/` (we hope), and the
    // fallback should return it unchanged.
    const result = resolveProjectRoot('/');
    expect(result).toBe('/');
  });
});

describe('resolveProjectRoot: disjoint roots', () => {
  test('resolutions on two disjoint roots return disjoint results', () => {
    // Resolver is synchronous; the parallel-test-safety guarantee
    // comes from `mkdtempSync` giving each factory call a unique
    // tmpdir, not from any async coordination. This test asserts the
    // disjoint-roots half of that guarantee — two roots, two results,
    // no cross-contamination.
    const a = makeProjectRoot({ prefix: 'resolve-root-test-a-', gitInit: true });
    const b = makeProjectRoot({ prefix: 'resolve-root-test-b-', gitInit: true });
    try {
      const nestedA = join(a.root, 'sub');
      const nestedB = join(b.root, 'sub');
      mkdirSync(nestedA, { recursive: true });
      mkdirSync(nestedB, { recursive: true });

      const resA = resolveProjectRoot(nestedA);
      const resB = resolveProjectRoot(nestedB);

      expect(resA).toBe(resolve(a.root));
      expect(resB).toBe(resolve(b.root));
      expect(resA).not.toBe(resB);
    } finally {
      a.cleanup();
      b.cleanup();
    }
  });
});
