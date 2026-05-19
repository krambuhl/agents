import { existsSync } from 'node:fs';
import { resolve } from 'node:path';

/**
 * Walk up from `startingPath` looking for a `.git/` marker (a `.git`
 * directory OR a `.git` file — git's worktree shape uses a file).
 * Returns the absolute path of the directory containing `.git/`, or
 * the absolute `startingPath` itself if the walk reaches the
 * filesystem root without finding one.
 *
 * Never reads `process.cwd()`; the caller passes the starting hint
 * explicitly so tests can run in parallel against per-test tmpdirs
 * without `process.chdir`.
 */
export function resolveProjectRoot(startingPath: string): string {
  let current = resolve(startingPath);
  while (true) {
    if (existsSync(resolve(current, '.git'))) {
      return current;
    }
    const parent = resolve(current, '..');
    if (parent === current) {
      // Reached the filesystem root without finding `.git/`. Fall
      // back to the original starting hint — preserves the W2/W1
      // behavior for tmpdir-based tests that don't bother with
      // `git init`.
      return resolve(startingPath);
    }
    current = parent;
  }
}
