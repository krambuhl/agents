import { spawn, spawnSync } from 'node:child_process';
import {
  chmodSync,
  copyFileSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
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

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
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
  entryBody?: string;
} = {}): FakePluginTree {
  const root = mkdtempSync(join(tmpdir(), `plugin-bin-${plugin}-`));
  mkdirSync(join(root, 'bin'), { recursive: true });
  const shimPath = join(root, 'bin', plugin);
  copyFileSync(join(REPO_ROOT, 'plugins', plugin, 'bin', plugin), shimPath);
  chmodSync(shimPath, 0o755);

  if (!options.withoutEntry) {
    mkdirSync(join(root, 'cli'), { recursive: true });
    const stdout = options.dummyStdout ?? `dummy-${plugin}-entry-output`;
    const entry =
      options.entryBody ??
      `process.stdout.write(${JSON.stringify(stdout)});\nprocess.exit(0);\n`;
    writeFileSync(join(root, 'cli', `${plugin}.ts`), entry, 'utf8');
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

// The per-plugin block above exercises shim MECHANICS against a dummy
// entry. This block closes the remaining gap: the REAL cli/<name>.ts
// entry (and its eagerly-imported graph) must load under node's
// strip-only TypeScript loader — the class that vitest's own transform
// masks (parameter properties, JSDoc-close sequences, enums). A footgun
// in a real entrypoint is a total outage, so it gets its own gate.
describe('real-entry strip-only loader smoke', () => {
  for (const plugin of PLUGINS) {
    test(`${plugin}: the real bin shim loads its real cli/${plugin}.ts under the strip-only loader`, () => {
      const realShim = join(REPO_ROOT, 'plugins', plugin, 'bin', plugin);
      const result = spawnSync(realShim, [], {
        encoding: 'utf8',
        env: { ...process.env },
      });
      // A strip-only footgun anywhere in the entry's import graph aborts
      // the load with a non-zero exit + ERR_UNSUPPORTED_TYPESCRIPT_SYNTAX;
      // exit 0 means the graph parsed and the no-arg usage path ran.
      expect(result.stderr).not.toMatch(
        /ERR_UNSUPPORTED_TYPESCRIPT_SYNTAX|SyntaxError/,
      );
      expect(result.status).toBe(0);
    });
  }

  test('a strip-only footgun in an entry is caught by the shim + node, not shipped', () => {
    // Proves the gate BITES. A parameter property is the representative
    // footgun (node: "TypeScript parameter property is not supported in
    // strip-only mode"). If a real entry ever grows one, the exec fails
    // loudly rather than passing a dummy-entry test.
    const footgun = makeFakePluginTree('loom', {
      entryBody:
        'class Probe {\n  constructor(public x: number) {}\n}\nprocess.stdout.write(String(new Probe(1).x));\n',
    });
    try {
      const result = spawnSync(footgun.shimPath, [], {
        encoding: 'utf8',
        env: { ...process.env },
      });
      expect(result.status).not.toBe(0);
      expect(result.stderr).toMatch(/ERR_UNSUPPORTED_TYPESCRIPT_SYNTAX/);
    } finally {
      footgun.cleanup();
    }
  });
});

// Collect every .ts file (excluding *.test.ts) under `dir`, recursively.
// Returns absolute paths; an absent dir yields []. Tests are excluded
// deliberately: they run under vitest's full transform, never under node's
// strip-only loader, so strip-only compatibility is not a constraint on them.
function collectRuntimeTsFiles(dir: string): string[] {
  if (!existsSync(dir)) return [];
  const out: string[] = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) {
      out.push(...collectRuntimeTsFiles(full));
    } else if (entry.name.endsWith('.ts') && !entry.name.endsWith('.test.ts')) {
      out.push(full);
    }
  }
  return out;
}

// `node --check <file.ts>` strips types (Node >= 24 default) and parses the
// file WITHOUT executing it, resolving imports, or running side effects. A
// strip-only-unsupported construct (parameter property, certain enum /
// namespace forms, a JSDoc `*/` that closes a block comment early) fails the
// parse with a non-zero exit. Async so the inventory can be checked with
// bounded concurrency instead of N serial spawns.
function nodeCheck(file: string): Promise<{ status: number | null; stderr: string }> {
  return new Promise((resolveCheck) => {
    const child = spawn('node', ['--check', file]);
    let stderr = '';
    child.stderr.on('data', (chunk) => {
      stderr += chunk.toString();
    });
    child.on('error', (err) => resolveCheck({ status: 1, stderr: String(err) }));
    child.on('close', (status) => resolveCheck({ status, stderr }));
  });
}

// The exec smoke above loads each entry's STATIC import graph, so a footgun
// in a statically-imported module is already caught there. This block closes
// the remaining gaps exhaustively and by construction: standalone scripts the
// bin shims never exec (scripts/*.ts, run via npm), any future dynamically-
// imported module, and the general "an entrypoint the smoke forgot" coverage
// lottery the skeptic flagged. Every .ts node runs at runtime must survive
// type-stripping — proven file-by-file, not via remembered entrypoints.
describe('exhaustive strip-only static gate (every runtime .ts)', () => {
  const runtimeTsFiles = [
    ...PLUGINS.flatMap((p) =>
      collectRuntimeTsFiles(join(REPO_ROOT, 'plugins', p, 'cli')),
    ),
    ...collectRuntimeTsFiles(join(REPO_ROOT, 'scripts')),
  ];

  test('the inventory is non-empty (a broken glob must fail loudly, not pass vacuously)', () => {
    // If the collection returns nothing, the exhaustive test below passes
    // vacuously — the exact fixture-mask this gate exists to prevent. Pin a
    // floor (current count is ~99) so a path change that empties the list
    // fails here rather than silently covering nothing.
    expect(runtimeTsFiles.length).toBeGreaterThan(50);
  });

  test('every runtime .ts survives node --check under the strip-only loader', async () => {
    const CONCURRENCY = 8;
    const failures: string[] = [];
    let cursor = 0;
    const worker = async (): Promise<void> => {
      while (cursor < runtimeTsFiles.length) {
        const file = runtimeTsFiles[cursor++];
        const { status, stderr } = await nodeCheck(file);
        if (
          status !== 0 ||
          /SyntaxError|ERR_UNSUPPORTED_TYPESCRIPT_SYNTAX/.test(stderr)
        ) {
          const firstLines = stderr.trim().split('\n').slice(0, 2).join(' ');
          failures.push(`${file.replace(`${REPO_ROOT}/`, '')}: ${firstLines}`);
        }
      }
    };
    await Promise.all(Array.from({ length: CONCURRENCY }, () => worker()));
    expect(
      failures,
      `strip-only failures (these ship broken under node even though vitest's transform passes):\n${failures.join('\n')}`,
    ).toEqual([]);
  }, 30_000);

  test('the gate BITES: a parameter-property footgun fails node --check', () => {
    // Independent proof the gate detects the class — mirrors the exec-path
    // bite test above, at the --check layer.
    const dir = mkdtempSync(join(tmpdir(), 'strip-only-bite-'));
    try {
      const footgun = join(dir, 'footgun.ts');
      writeFileSync(footgun, 'class P {\n  constructor(public x: number) {}\n}\n');
      const result = spawnSync('node', ['--check', footgun], { encoding: 'utf8' });
      expect(result.status).not.toBe(0);
      expect(result.stderr).toMatch(/SyntaxError|ERR_UNSUPPORTED_TYPESCRIPT_SYNTAX/);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
