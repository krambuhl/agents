import { execSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, test } from 'vitest';

/**
 * W9 tripwire (marketplace-portable-install plan): asserts that no
 * tracked file outside the project-substrate records references
 * `install.sh`. The file was deleted in W9 once the migration moved
 * to plugin-install; any remaining reference is stale code or
 * dead documentation.
 *
 * Substrate carve-out: `projects/` records (checkins, sessions,
 * PLAN.md, RESEARCH.md, archived retros) are intentionally
 * immutable historical records and may name install.sh as part of
 * the migration's narrative. They're excluded from the sweep.
 *
 * Self-carve-out: this test file is also excluded — it names the
 * forbidden string by definition.
 */

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const SELF_RELATIVE_PATH = 'cli/no-install-sh-refs.test.ts';

function listTrackedFiles(): ReadonlyArray<string> {
  // git ls-files prints repo-relative paths, one per line.
  const stdout = execSync('git ls-files', { cwd: REPO_ROOT, encoding: 'utf8' });
  return stdout.split('\n').filter((p) => p.length > 0);
}

function isExcluded(relativePath: string): boolean {
  // Self-exclude.
  if (relativePath === SELF_RELATIVE_PATH) return true;
  // Project-substrate records: the migration's own checkins +
  // sessions + PLAN/RESEARCH name install.sh as historical context.
  if (relativePath.startsWith('projects/')) return true;
  // Treat node_modules / build outputs defensively (git ls-files
  // shouldn't return them, but the carve-out is documented).
  if (relativePath.startsWith('node_modules/')) return true;
  return false;
}

const FORBIDDEN = 'install.sh';

describe('W9: install.sh has no remaining references outside the project substrate', () => {
  const tracked = listTrackedFiles();

  test('install.sh is not a tracked file', () => {
    expect(tracked).not.toContain('install.sh');
  });

  test('no tracked file outside projects/ references install.sh', () => {
    const offending: Array<{ file: string; line: number; context: string }> = [];
    for (const relativePath of tracked) {
      if (isExcluded(relativePath)) continue;
      const fullPath = resolve(REPO_ROOT, relativePath);
      let body: string;
      try {
        body = readFileSync(fullPath, 'utf8');
      } catch {
        // Binary file or read error — skip.
        continue;
      }
      const lines = body.split('\n');
      lines.forEach((line, idx) => {
        if (line.includes(FORBIDDEN)) {
          offending.push({
            file: relativePath,
            line: idx + 1,
            context: line.trim(),
          });
        }
      });
    }
    expect(
      offending,
      `install.sh references found outside the project substrate. Either remove or move to projects/:\n${offending
        .map((o) => `  ${o.file}:${o.line}: ${o.context}`)
        .join('\n')}`,
    ).toEqual([]);
  });
});
