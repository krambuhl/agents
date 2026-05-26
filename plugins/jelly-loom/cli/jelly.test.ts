import { test, expect } from 'vitest';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import {
  NAMESPACES,
  parseInvocation,
  formatHelp,
  formatUnknownVerbError,
  dispatch,
} from './jelly.ts';
import type { CliContext } from './jelly.ts';

function makeCtx(): CliContext {
  return { projectsRoot: mkdtempSync(join(tmpdir(), 'jelly-test-')) };
}

const __dirname = dirname(fileURLToPath(import.meta.url));
const JELLY_ENTRY = join(__dirname, 'jelly.ts');
const BIN_JELLY = join(__dirname, '..', 'bin', 'jelly');

// ---------- Pure helper tests ----------

test('parseInvocation: no args → help', () => {
  expect(parseInvocation([])).toEqual({ kind: 'help' });
});

test('parseInvocation: --help → help', () => {
  expect(parseInvocation(['--help'])).toEqual({ kind: 'help' });
});

test('parseInvocation: -h → help', () => {
  expect(parseInvocation(['-h'])).toEqual({ kind: 'help' });
});

test('parseInvocation: known namespace → verb', () => {
  expect(parseInvocation(['plan', 'my-topic'])).toEqual({
    kind: 'verb',
    namespace: 'plan',
    rest: ['my-topic'],
  });
});

test('parseInvocation: unknown namespace → unknown', () => {
  expect(parseInvocation(['xyzzy'])).toEqual({ kind: 'unknown', verb: 'xyzzy' });
});

test('parseInvocation: --help after namespace still routes to help', () => {
  expect(parseInvocation(['plan', '--help'])).toEqual({ kind: 'help' });
});

test('formatHelp lists every jelly namespace', () => {
  const help = formatHelp();
  for (const name of Object.keys(NAMESPACES)) {
    expect(help).toContain(name);
  }
  expect(help).toContain('jelly');
});

test('formatHelp names the four jelly verbs exactly', () => {
  // The shell ships with research / plan / revise / adr and no others.
  // If a future unit adds a namespace, this asserts the help reflects it.
  expect(Object.keys(NAMESPACES).sort()).toEqual(['adr', 'plan', 'research', 'revise']);
});

test('formatUnknownVerbError emits structured JSON with candidates', () => {
  const stderr = formatUnknownVerbError('xyzzy');
  const parsed = JSON.parse(stderr);
  expect(parsed.error).toBe('unknown-verb');
  expect(parsed.candidates).toEqual(Object.keys(NAMESPACES));
});

test('dispatch: help → stdout + exit 0', () => {
  const ctx = makeCtx();
  const result = dispatch({ kind: 'help' }, ctx);
  expect(result.exitCode).toBe(0);
  expect(result.stdout).toBeDefined();
  expect(result.stderr).toBeUndefined();
  rmSync(ctx.projectsRoot, { recursive: true, force: true });
});

test('dispatch: unknown → stderr + exit 1', () => {
  const ctx = makeCtx();
  const result = dispatch({ kind: 'unknown', verb: 'xyzzy' }, ctx);
  expect(result.exitCode).toBe(1);
  expect(result.stderr).toBeDefined();
  expect(result.stdout).toBeUndefined();
  rmSync(ctx.projectsRoot, { recursive: true, force: true });
});

// Every recognized namespace is unwired in the U1 shell — each returns
// the `not-implemented` placeholder until its verb lands (U3 research,
// U3/U4 plan, U5 revise, U6 adr). When a verb is wired, its namespace's
// not-implemented test here flips to a missing-args/missing-verb test.
test.each(Object.keys(NAMESPACES))(
  'dispatch: namespace %s is recognized but not-implemented in the shell',
  (namespace) => {
    const ctx = makeCtx();
    const result = dispatch({ kind: 'verb', namespace, rest: [] }, ctx);
    expect(result.exitCode).toBe(1);
    const parsed = JSON.parse(result.stderr as string);
    expect(parsed.error).toBe('not-implemented');
    expect(parsed.namespace).toBe(namespace);
    rmSync(ctx.projectsRoot, { recursive: true, force: true });
  },
);

// ---------- Smoke tests via subprocess (entry-point integration) ----------

test('node entry: --help prints help and exits 0', () => {
  const result = spawnSync('node', [JELLY_ENTRY, '--help'], { encoding: 'utf8' });
  expect(result.status).toBe(0);
  expect(result.stdout).toContain('jelly');
  for (const name of Object.keys(NAMESPACES)) {
    expect(result.stdout).toContain(name);
  }
});

test('node entry: no args prints help and exits 0', () => {
  const result = spawnSync('node', [JELLY_ENTRY], { encoding: 'utf8' });
  expect(result.status).toBe(0);
  expect(result.stdout).toContain('Usage:');
});

test('node entry: unknown verb prints structured error and exits 1', () => {
  const result = spawnSync('node', [JELLY_ENTRY, 'xyzzy'], { encoding: 'utf8' });
  expect(result.status).toBe(1);
  const parsed = JSON.parse(result.stderr.trim());
  expect(parsed.error).toBe('unknown-verb');
});

test('node entry: recognized namespace surfaces not-implemented and exits 1', () => {
  const result = spawnSync('node', [JELLY_ENTRY, 'plan', 'some-topic'], {
    encoding: 'utf8',
  });
  expect(result.status).toBe(1);
  const parsed = JSON.parse(result.stderr.trim());
  expect(parsed.error).toBe('not-implemented');
  expect(parsed.namespace).toBe('plan');
});

test('bin/jelly shim invokes the entry identically', () => {
  const result = spawnSync(BIN_JELLY, ['--help'], { encoding: 'utf8' });
  expect(result.status).toBe(0);
  expect(result.stdout).toContain('jelly');
  for (const name of Object.keys(NAMESPACES)) {
    expect(result.stdout).toContain(name);
  }
});
