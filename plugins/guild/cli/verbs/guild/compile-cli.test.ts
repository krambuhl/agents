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

  it('--prompt-hash flag threads through to the .cache.toml entries', () => {
    const result = compileVerb(
      ['--prompt-hash=0a0a0a0a'],
      makeCtx(sandbox.cwd),
    );
    expect(result.exitCode).toBe(0);
    const generatedDir = join(sandbox.cwd, sandbox.outputDirRel);
    const cache = readFileSync(join(generatedDir, '.cache.toml'), 'utf8');
    expect(cache).toContain('prompt_hash = "0a0a0a0a"');
    expect(cache).not.toContain('prompt_hash = ""');
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
    // U2: top-level prompt_hash is echoed back so the skill knows
    // which cache key the partial run computed against.
    expect(out.prompt_hash).toBe('');
  });

  it('echoes --prompt-hash back as top-level prompt_hash on stdout', () => {
    const result = compileVerb(
      ['--stage=parse,validate,derive,resolve', '--prompt-hash=cafef00d'],
      makeCtx(sandbox.cwd),
    );
    expect(result.exitCode).toBe(0);
    const out = JSON.parse(result.stdout ?? '{}');
    expect(out.prompt_hash).toBe('cafef00d');
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

  it('reads top-level prompt_hash from stdin and writes it into the cache', () => {
    const composedAgent = {
      id: 'evaluator-x',
      phase: 'reviewer',
      personality: 'skeptic',
      domain: 'foo',
      source: 'recipe',
      source_name: 'r',
      phase_fragment: 'p',
      personality_fragment: 'q',
      domain_fragment: 'd',
      tools: ['Read'],
      composed_body: 'body',
      source_hashes: { phase: 'a', personality: 'b', domain: 'c' },
    };
    const stdin = JSON.stringify({
      schema_version: 1,
      prompt_hash: 'feedbabe',
      agents: [composedAgent],
    });
    const result = compileVerb(['--stage=emit'], makeCtx(sandbox.cwd, stdin));
    expect(result.exitCode).toBe(0);
    const generatedDir = join(sandbox.cwd, sandbox.outputDirRel);
    const cache = readFileSync(join(generatedDir, '.cache.toml'), 'utf8');
    expect(cache).toContain('prompt_hash = "feedbabe"');
  });

  it('--prompt-hash flag overrides stdin prompt_hash', () => {
    const composedAgent = {
      id: 'evaluator-y',
      phase: 'reviewer',
      personality: 'skeptic',
      domain: 'foo',
      source: 'recipe',
      source_name: 'r',
      phase_fragment: 'p',
      personality_fragment: 'q',
      domain_fragment: 'd',
      tools: ['Read'],
      composed_body: 'body',
      source_hashes: { phase: 'a', personality: 'b', domain: 'c' },
    };
    const stdin = JSON.stringify({
      schema_version: 1,
      prompt_hash: 'from-stdin',
      agents: [composedAgent],
    });
    const result = compileVerb(
      ['--stage=emit', '--prompt-hash=from-flag'],
      makeCtx(sandbox.cwd, stdin),
    );
    expect(result.exitCode).toBe(0);
    const generatedDir = join(sandbox.cwd, sandbox.outputDirRel);
    const cache = readFileSync(join(generatedDir, '.cache.toml'), 'utf8');
    expect(cache).toContain('prompt_hash = "from-flag"');
    expect(cache).not.toContain('prompt_hash = "from-stdin"');
  });

  it('omitting prompt_hash on both stdin and flag → empty string default', () => {
    const composedAgent = {
      id: 'evaluator-z',
      phase: 'reviewer',
      personality: 'skeptic',
      domain: 'foo',
      source: 'recipe',
      source_name: 'r',
      phase_fragment: 'p',
      personality_fragment: 'q',
      domain_fragment: 'd',
      tools: ['Read'],
      composed_body: 'body',
      source_hashes: { phase: 'a', personality: 'b', domain: 'c' },
    };
    const stdin = JSON.stringify({
      schema_version: 1,
      agents: [composedAgent],
    });
    const result = compileVerb(['--stage=emit'], makeCtx(sandbox.cwd, stdin));
    expect(result.exitCode).toBe(0);
    const generatedDir = join(sandbox.cwd, sandbox.outputDirRel);
    const cache = readFileSync(join(generatedDir, '.cache.toml'), 'utf8');
    expect(cache).toContain('prompt_hash = ""');
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

describe('compile CLI: --check', () => {
  it('a fresh compile followed by --check exits 0 with ok=true', () => {
    // First do a full compile to seed the sandbox.
    const seed = compileVerb([], makeCtx(sandbox.cwd));
    expect(seed.exitCode).toBe(0);
    // Now run --check against the same sandbox.
    const result = compileVerb(['--check'], makeCtx(sandbox.cwd));
    expect(result.exitCode).toBe(0);
    const out = JSON.parse(result.stdout ?? '{}');
    expect(out.ok).toBe(true);
    expect(out.drift.cells_with_source_drift).toEqual([]);
    expect(out.drift.cells_with_output_drift).toEqual([]);
    expect(out.drift.cells_with_prompt_drift).toEqual([]);
    expect(out.drift.cells_missing_cache_entry).toEqual([]);
    expect(out.drift.cells_missing_on_disk).toEqual([]);
    expect(out.drift.stale_cache_entries).toEqual([]);
  });

  it('--check on a tampered agent file exits 1 with output_drift in the report', () => {
    const seed = compileVerb([], makeCtx(sandbox.cwd));
    expect(seed.exitCode).toBe(0);
    const generatedDir = join(sandbox.cwd, sandbox.outputDirRel);
    writeFileSync(join(generatedDir, 'evaluator-a11y.md'), '---\ntampered\n---\n');
    const result = compileVerb(['--check'], makeCtx(sandbox.cwd));
    expect(result.exitCode).toBe(1);
    const out = JSON.parse(result.stdout ?? '{}');
    expect(out.ok).toBe(false);
    expect(out.drift.cells_with_output_drift).toContain('evaluator-a11y');
  });

  it('--check + --stage returns bad-args (mutually exclusive)', () => {
    const result = compileVerb(
      ['--check', '--stage=parse,validate,derive,resolve'],
      makeCtx(sandbox.cwd),
    );
    expect(result.exitCode).toBe(1);
    expect(result.stderr).toContain('bad-args');
    expect(result.stderr).toContain('mutually exclusive');
  });

  it('--check on a sandbox with no .cache.toml reports every cell as missing-cache-entry', () => {
    // No prior compile() call. Just run --check directly.
    const result = compileVerb(['--check'], makeCtx(sandbox.cwd));
    expect(result.exitCode).toBe(1);
    const out = JSON.parse(result.stdout ?? '{}');
    expect(out.ok).toBe(false);
    expect(out.drift.cells_missing_cache_entry.length).toBeGreaterThan(0);
  });

  it('--check honors --prompt-hash: passing a hash different from the cache reports prompt drift', () => {
    const seed = compileVerb(['--prompt-hash=baseline'], makeCtx(sandbox.cwd));
    expect(seed.exitCode).toBe(0);
    const result = compileVerb(
      ['--check', '--prompt-hash=different'],
      makeCtx(sandbox.cwd),
    );
    expect(result.exitCode).toBe(1);
    const out = JSON.parse(result.stdout ?? '{}');
    expect(out.ok).toBe(false);
    expect(out.drift.cells_with_prompt_drift.length).toBeGreaterThan(0);
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
