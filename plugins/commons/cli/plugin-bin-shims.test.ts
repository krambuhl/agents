import { spawnSync } from 'node:child_process';
import {
  chmodSync,
  copyFileSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, beforeEach, describe, expect, test } from 'vitest';

/**
 * Integration tests for the per-plugin bin/<name> shims.
 *
 * Each shim is a self-contained bash script that:
 *   1. Resolves its own location (symlink-safe).
 *   2. Verifies node is on PATH and reports a major version >= 24.
 *   3. Execs `cli/<name>.ts` at the resolved-shim-dir's sibling.
 *
 * Tests fake-populate a per-plugin tree in a tmpdir so the shim
 * can be exercised without depending on the W7 sync-shared output.
 */

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..', '..');
const PLUGINS = ['griot', 'guild', 'loom'] as const;

// A minimal PATH for tests that need to RESTRICT node availability.
// Keeps bash builtins + system tools (dirname, readlink) reachable.
const MINIMAL_SYSTEM_PATH = '/usr/bin:/bin';

// Hosts with a system-installed node at /usr/bin/node defeat the
// missing-node test: even with PATH restricted to MINIMAL_SYSTEM_PATH,
// `command -v node` succeeds. Detect at module load and skipIf —
// makes the skip explicit in test output rather than silent.
const HAS_SYSTEM_NODE = existsSync('/usr/bin/node');

interface FakePluginTree {
  root: string;
  shimPath: string;
  cleanup: () => void;
}

function makeFakePluginTree(plugin: (typeof PLUGINS)[number], options: {
  dummyStdout?: string;
  withoutEntry?: boolean;
} = {}): FakePluginTree {
  const root = mkdtempSync(join(tmpdir(), `plugin-bin-${plugin}-`));
  mkdirSync(join(root, 'bin'), { recursive: true });
  const shimPath = join(root, 'bin', plugin);
  copyFileSync(join(REPO_ROOT, 'plugins', plugin, 'bin', plugin), shimPath);
  chmodSync(shimPath, 0o755);

  if (!options.withoutEntry) {
    mkdirSync(join(root, 'cli'), { recursive: true });
    const stdout = options.dummyStdout ?? `dummy-${plugin}-entry-output`;
    writeFileSync(
      join(root, 'cli', `${plugin}.ts`),
      `process.stdout.write(${JSON.stringify(stdout)});\nprocess.exit(0);\n`,
      'utf8',
    );
  }

  return {
    root,
    shimPath,
    cleanup: () => rmSync(root, { recursive: true, force: true }),
  };
}

function makeStubNode(versionString: string): { stubDir: string; cleanup: () => void } {
  const stubDir = mkdtempSync(join(tmpdir(), 'plugin-bin-stub-node-'));
  const stubPath = join(stubDir, 'node');
  writeFileSync(
    stubPath,
    `#!/usr/bin/env bash\nif [[ "$1" == "--version" ]]; then echo "${versionString}"; else echo "stub-node should not have been invoked beyond --version" >&2; exit 99; fi\n`,
    'utf8',
  );
  chmodSync(stubPath, 0o755);
  return {
    stubDir,
    cleanup: () => rmSync(stubDir, { recursive: true, force: true }),
  };
}

for (const plugin of PLUGINS) {
  describe(`plugin shim: ${plugin}`, () => {
    let tree: FakePluginTree;

    beforeEach(() => {
      tree = makeFakePluginTree(plugin);
    });

    afterEach(() => {
      tree.cleanup();
    });

    test('execs the cli/<name>.ts entry with real node (>=24) and returns its output', () => {
      const result = spawnSync(tree.shimPath, [], {
        encoding: 'utf8',
        env: { ...process.env },
      });
      expect(result.status).toBe(0);
      expect(result.stdout).toBe(`dummy-${plugin}-entry-output`);
    });

    test('exits non-zero when stub node reports a too-old major version', () => {
      const stub = makeStubNode('v18.0.0');
      try {
        const result = spawnSync(tree.shimPath, [], {
          encoding: 'utf8',
          env: {
            ...process.env,
            PATH: `${stub.stubDir}:${MINIMAL_SYSTEM_PATH}`,
          },
        });
        expect(result.status).toBe(1);
        expect(result.stderr).toMatch(new RegExp(`${plugin}-shim-error: node 18`));
        expect(result.stderr).toMatch(/too old/i);
        expect(result.stderr).toMatch(/Node >= 24/);
      } finally {
        stub.cleanup();
      }
    });

    test.skipIf(HAS_SYSTEM_NODE)(
      'exits non-zero with actionable message when node is not on PATH',
      () => {
        const result = spawnSync(tree.shimPath, [], {
          encoding: 'utf8',
          env: {
            ...process.env,
            PATH: MINIMAL_SYSTEM_PATH,
          },
        });
        expect(result.status).toBe(1);
        expect(result.stderr).toMatch(new RegExp(`${plugin}-shim-error: node is not on PATH`));
      },
    );

    test('symlink-safe: spawning the shim via a symlink resolves to the same entry', () => {
      const symlinkDir = mkdtempSync(join(tmpdir(), `plugin-bin-symlink-${plugin}-`));
      const symlinkPath = join(symlinkDir, plugin);
      try {
        symlinkSync(tree.shimPath, symlinkPath);
        const result = spawnSync(symlinkPath, [], {
          encoding: 'utf8',
          env: { ...process.env },
        });
        expect(result.status).toBe(0);
        expect(result.stdout).toBe(`dummy-${plugin}-entry-output`);
      } finally {
        rmSync(symlinkDir, { recursive: true, force: true });
      }
    });

    test('exits with code 2 when entry is missing (post-version-check fallthrough)', () => {
      // Tear down the dummy entry and re-spawn. Node version-check
      // passes (real node >=24), then ENTRY-not-found fires.
      const treeWithoutEntry = makeFakePluginTree(plugin, { withoutEntry: true });
      try {
        const result = spawnSync(treeWithoutEntry.shimPath, [], {
          encoding: 'utf8',
          env: { ...process.env },
        });
        expect(result.status).toBe(2);
        expect(result.stderr).toMatch(new RegExp(`${plugin}-shim-error: entry not found`));
      } finally {
        treeWithoutEntry.cleanup();
      }
    });
  });
}
