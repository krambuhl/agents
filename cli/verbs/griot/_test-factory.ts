import { mkdtempSync, rmSync } from 'node:fs';
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
 * Returns the absolute path of the new root and a cleanup callback.
 */
export function makeProjectRoot(prefix = 'griot-verb-test-'): {
  root: string;
  cleanup: () => void;
} {
  const root = mkdtempSync(join(tmpdir(), prefix));
  return {
    root,
    cleanup: () => rmSync(root, { recursive: true, force: true }),
  };
}
