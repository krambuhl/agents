import { mkdtempSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { compileVerb } from './compile-cli.ts';
import type { GuildCliContext } from './index.ts';

// CLI-level smoke for the new `guild compile` verb. Sets up a tmpdir
// mirroring the plugins/guild/ subtree the verb expects (axes.toml,
// modes/, agents/personalities/) and points the verb at it via --axes-toml.
// Tests cover full-pipeline default + stage filter + emit-only stdin
// + error cases.

const REPO_PLUGIN_ROOT = dirname(
  dirname(dirname(dirname(fileURLToPath(import.meta.url)))),
);

interface Sandbox {
  cwd: string;
  axesTomlRel: string;
  outputDirRel: string;
}

function makeSandbox(): Sandbox {
  const cwd = mkdtempSync(join(tmpdir(), 'guild-compile-cli-'));
  // Build a plugins/guild/-shaped subtree inside cwd that the verb
  // can read from. axes.toml, agents/personalities/, modes/phases/,
  // modes/domains/ are all copied from the real repo so the test
  // exercises the real verb against real source material.
  const pluginRoot = join(cwd, 'plugins', 'guild');
  mkdirSync(pluginRoot, { recursive: true });
  mkdirSync(join(pluginRoot, 'modes', 'phases'), { recursive: true });
  mkdirSync(join(pluginRoot, 'modes', 'domains'), { recursive: true });
  mkdirSync(join(pluginRoot, 'agents', 'personalities'), { recursive: true });

  writeFileSync(
    join(pluginRoot, 'axes.toml'),
    readFileSync(join(REPO_PLUGIN_ROOT, 'axes.toml'), 'utf8'),
  );
  for (const dir of ['modes/phases', 'modes/domains', 'agents/personalities']) {
    const real = join(REPO_PLUGIN_ROOT, dir);
    const fake = join(pluginRoot, dir);
    for (const filename of readFileSyncDir(real)) {
      writeFileSync(
        join(fake, filename),
        readFileSync(join(real, filename), 'utf8'),
      );
    }
  }
  return {
    cwd,
    axesTomlRel: 'plugins/guild/axes.toml',
    outputDirRel: 'plugins/guild/agents/generated',
  };
}

function readFileSyncDir(dir: string): string[] {
  return readdirSync(dir).filter((f: string) => f.endsWith('.md'));
}

function makeCtx(cwd: string, stdin = ''): GuildCliContext {
  return { cwd, stdin };
}

let sandbox: Sandbox;

beforeEach(() => {
  sandbox = makeSandbox();
});

afterEach(() => {
  rmSync(sandbox.cwd, { recursive: true, force: true });
});

describe('compile CLI: full pipeline default', () => {
  it('runs end-to-end and writes per-cell agents + .cache.toml', () => {
    const result = compileVerb([], makeCtx(sandbox.cwd));
    expect(result.exitCode).toBe(0);
    const out = JSON.parse(result.stdout ?? '{}');
    expect(out.cells_total).toBeGreaterThan(0);

    const generatedDir = join(sandbox.cwd, sandbox.outputDirRel);
    const evaluatorA11y = join(generatedDir, 'evaluator-a11y.md');
    expect(readFileSync(evaluatorA11y, 'utf8')).toContain('name: evaluator-a11y');
    expect(readFileSync(join(generatedDir, '.cache.toml'), 'utf8')).toContain(
      'schema_version = 1',
    );
  });
});

describe('compile CLI: --stage=parse,validate,derive,resolve', () => {
  it('emits ResolvedCell[] bundle as JSON on stdout', () => {
    const result = compileVerb(
      ['--stage=parse,validate,derive,resolve'],
      makeCtx(sandbox.cwd),
    );
    expect(result.exitCode).toBe(0);
    const out = JSON.parse(result.stdout ?? '{}');
    expect(out.schema_version).toBe(1);
    expect(Array.isArray(out.cells)).toBe(true);
    expect(out.cells.length).toBeGreaterThan(0);
    const a11y = out.cells.find((c: { id: string }) => c.id === 'evaluator-a11y');
    expect(a11y).toBeDefined();
    expect(a11y.phase).toBe('reviewer');
    expect(a11y.phase_fragment.length).toBeGreaterThan(0);
    expect(a11y.personality_fragment.length).toBeGreaterThan(0);
    expect(a11y.domain_fragment.length).toBeGreaterThan(0);
    expect(Array.isArray(a11y.tools)).toBe(true);
    expect(Array.isArray(out.cache_hits)).toBe(true);
    expect(Array.isArray(out.cache_misses)).toBe(true);
  });
});

describe('compile CLI: --stage=emit', () => {
  it('consumes ComposedAgent[] JSON from stdin and writes files', () => {
    const composedAgent = {
      id: 'evaluator-test',
      phase: 'reviewer',
      personality: 'skeptic',
      domain: 'foo',
      source: 'recipe',
      source_name: 'r',
      phase_fragment: 'p',
      personality_fragment: 'q',
      domain_fragment: 'd',
      tools: ['Read'],
      composed_body: '---\nname: evaluator-test\n---\n\nhello',
      source_hashes: { phase: 'a', personality: 'b', domain: 'c' },
    };
    const stdin = JSON.stringify({
      schema_version: 1,
      agents: [composedAgent],
    });
    const result = compileVerb(['--stage=emit'], makeCtx(sandbox.cwd, stdin));
    expect(result.exitCode).toBe(0);
    const out = JSON.parse(result.stdout ?? '{}');
    expect(out.written_files.length).toBeGreaterThan(0);

    const generatedDir = join(sandbox.cwd, sandbox.outputDirRel);
    const written = readFileSync(join(generatedDir, 'evaluator-test.md'), 'utf8');
    expect(written).toContain('name: evaluator-test');
  });

  it('errors loud on malformed JSON stdin', () => {
    const result = compileVerb(
      ['--stage=emit'],
      makeCtx(sandbox.cwd, 'not json {{{'),
    );
    expect(result.exitCode).toBe(1);
    expect(result.stderr).toContain('malformed JSON');
  });

  it('errors loud on missing stdin', () => {
    const result = compileVerb(['--stage=emit'], makeCtx(sandbox.cwd, ''));
    expect(result.exitCode).toBe(1);
    expect(result.stderr).toContain('missing-stdin');
  });

  it('errors loud on wrong schema_version', () => {
    const stdin = JSON.stringify({ schema_version: 2, agents: [] });
    const result = compileVerb(
      ['--stage=emit'],
      makeCtx(sandbox.cwd, stdin),
    );
    expect(result.exitCode).toBe(1);
    expect(result.stderr).toContain('schema_version');
  });
});

describe('compile CLI: error cases', () => {
  it('errors loud on unknown --stage', () => {
    const result = compileVerb(['--stage=mystery'], makeCtx(sandbox.cwd));
    expect(result.exitCode).toBe(1);
    expect(result.stderr).toContain('unknown-stage');
  });

  it('errors loud on missing axes.toml', () => {
    const result = compileVerb(
      ['--axes-toml=nope/nowhere.toml'],
      makeCtx(sandbox.cwd),
    );
    expect(result.exitCode).toBe(1);
    expect(result.stderr).toContain('ENOENT');
  });
});
