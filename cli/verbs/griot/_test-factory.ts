import { mkdirSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

/**
 * Test-fixture factory for griot verbs that operate on a project
 * root (a directory containing `.gitignore` and `learnings/`).
 *
 * Each invocation creates a fresh tmpdir; the caller is responsible
 * for invoking `cleanup()` in an `afterEach` hook. The factory uses
 * `mkdtempSync` for parallel-safety — multiple tests calling this
 * concurrently get disjoint roots, and no test reads `process.cwd()`
 * directly so vitest's parallel runner can interleave freely.
 *
 * Pass `gitInit: true` to also mkdir an empty `.git/` directory at
 * the root — enough of a marker for `resolveProjectRoot` to detect
 * the project root via walk-up. No real git operations are
 * performed; the empty `.git/` is just the walk-up signal.
 *
 * Returns the absolute path of the new root and a cleanup callback.
 */
export function makeProjectRoot(
  prefixOrOptions: string | { prefix?: string; gitInit?: boolean } = {},
): {
  root: string;
  cleanup: () => void;
} {
  const opts =
    typeof prefixOrOptions === 'string'
      ? { prefix: prefixOrOptions }
      : prefixOrOptions;
  const prefix = opts.prefix ?? 'griot-verb-test-';
  const root = mkdtempSync(join(tmpdir(), prefix));
  if (opts.gitInit) {
    mkdirSync(join(root, '.git'), { recursive: true });
  }
  return {
    root,
    cleanup: () => rmSync(root, { recursive: true, force: true }),
  };
}
