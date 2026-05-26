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
} from './jelly-run.ts';
import type { CliContext } from './jelly-run.ts';

function makeCtx(): CliContext {
  const projectsRoot = mkdtempSync(join(tmpdir(), 'jelly-run-test-'));
  return { projectsRoot, repoRoot: projectsRoot };
}

const __dirname = dirname(fileURLToPath(import.meta.url));
const ENTRY = join(__dirname, 'jelly-run.ts');
const BIN = join(__dirname, '..', 'bin', 'jelly-run');

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

test('parseInvocation: a registered command routes to a verb', () => {
  expect(parseInvocation(['compose-preamble', '--plan=x'])).toEqual({
    kind: 'verb',
    namespace: 'compose-preamble',
    rest: ['--plan=x'],
  });
});

test('parseInvocation: an unregistered token is unknown', () => {
  expect(parseInvocation(['frobnicate'])).toEqual({ kind: 'unknown', verb: 'frobnicate' });
});

test('NAMESPACES registers exactly the phase-2.1 verb set', () => {
  // Tripwire: U2 wired compose-preamble / preflight / compose-pr-body;
  // U3 adds classify-comments / build-dispatch-tasks (for
  // /jelly-pr-feedback). Update this alongside any new verb so the
  // registry and the test stay in lockstep.
  expect(Object.keys(NAMESPACES).sort()).toEqual([
    'build-dispatch-tasks',
    'classify-comments',
    'compose-pr-body',
    'compose-preamble',
    'preflight',
  ]);
});

test('formatHelp names the CLI and lists every registered verb', () => {
  const help = formatHelp();
  expect(help).toContain('jelly-run');
  expect(help).toContain('Usage:');
  for (const name of Object.keys(NAMESPACES)) {
    expect(help).toContain(name);
  }
});

test('formatUnknownVerbError emits structured JSON with the verbs as candidates', () => {
  const stderr = formatUnknownVerbError('frobnicate');
  const parsed = JSON.parse(stderr);
  expect(parsed.error).toBe('unknown-verb');
  expect(parsed.candidates).toEqual(Object.keys(NAMESPACES));
});

test('dispatch routes a verbless command to its handler (compose-preamble -> missing-args)', () => {
  // Routing tripwire: the command reaches its verb (which returns its own
  // missing-args), NOT the shell's not-implemented placeholder.
  const ctx = makeCtx();
  const result = dispatch({ kind: 'verb', namespace: 'compose-preamble', rest: [] }, ctx);
  expect(result.exitCode).toBe(1);
  const parsed = JSON.parse(result.stderr as string);
  expect(parsed.error).toBe('missing-args');
  rmSync(ctx.projectsRoot, { recursive: true, force: true });
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
  const result = dispatch({ kind: 'unknown', verb: 'compose-preamble' }, ctx);
  expect(result.exitCode).toBe(1);
  expect(result.stderr).toBeDefined();
  expect(result.stdout).toBeUndefined();
  rmSync(ctx.projectsRoot, { recursive: true, force: true });
});

// ---------- Smoke tests via subprocess (entry-point integration) ----------
//
// These run the entry through a REAL `node` (strip-only TS), not vitest's
// full transform. They are the guard against strip-only-only failures
// (parameter properties, JSDoc `*/`) that vitest masks — see the
// node-strip-only finding from jelly-loom's MCP server work.

test('node entry: --help prints help and exits 0', () => {
  const result = spawnSync('node', [ENTRY, '--help'], { encoding: 'utf8' });
  expect(result.status).toBe(0);
  expect(result.stdout).toContain('jelly-run');
});

test('node entry: no args prints help and exits 0', () => {
  const result = spawnSync('node', [ENTRY], { encoding: 'utf8' });
  expect(result.status).toBe(0);
  expect(result.stdout).toContain('Usage:');
});

test('node entry: unknown verb prints structured error and exits 1', () => {
  const result = spawnSync('node', [ENTRY, 'frobnicate'], { encoding: 'utf8' });
  expect(result.status).toBe(1);
  const parsed = JSON.parse(result.stderr.trim());
  expect(parsed.error).toBe('unknown-verb');
});

test('bin/jelly-run shim invokes the entry identically', () => {
  const result = spawnSync(BIN, ['--help'], { encoding: 'utf8' });
  expect(result.status).toBe(0);
  expect(result.stdout).toContain('jelly-run');
});
