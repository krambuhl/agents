import { afterEach, beforeEach, describe, expect, test } from 'vitest';
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  DEFAULT_PROVIDERS,
  EnvironmentError,
  ENV_OPS,
  deepMerge,
  deriveHandle,
  loadEnvironmentConfig,
  loadMergedSettings,
  planCommand,
  renderTemplate,
  resolveProvider,
  shellQuote,
} from './environment.ts';

describe('loadEnvironmentConfig', () => {
  test('extracts the ev.environment block', () => {
    const cfg = loadEnvironmentConfig({
      ev: { environment: { provider: 'fella' } },
    });
    expect(cfg).toEqual({ provider: 'fella' });
  });

  test('returns null when the block is absent at any level', () => {
    expect(loadEnvironmentConfig(null)).toBeNull();
    expect(loadEnvironmentConfig('nope')).toBeNull();
    expect(loadEnvironmentConfig({})).toBeNull();
    expect(loadEnvironmentConfig({ ev: {} })).toBeNull();
    expect(loadEnvironmentConfig({ ev: { environment: 7 } })).toBeNull();
  });
});

describe('resolveProvider', () => {
  test('resolves a shipped provider to its default templates + mode', () => {
    const r = resolveProvider({ provider: 'fella' });
    expect(r.name).toBe('fella');
    expect(r.mode).toBe('exec');
    expect(r.templates.up).toBe(DEFAULT_PROVIDERS.fella.up);
    expect(r.templates.exec).toBe(DEFAULT_PROVIDERS.fella.exec);
  });

  test('coder resolves to dispatch mode with a dispatch template', () => {
    const r = resolveProvider({ provider: 'coder' });
    expect(r.mode).toBe('dispatch');
    expect(typeof r.dispatch).toBe('string');
    expect(r.dispatch).toContain('{handle}');
    expect(r.dispatch).toContain('{run}');
  });

  test('mode defaults to exec when unset', () => {
    const r = resolveProvider({
      provider: 'x',
      providers: {
        x: { up: 'u {project}', exec: 'e {cmd}', status: 's', down: 'd' },
      },
    });
    expect(r.mode).toBe('exec');
  });

  test('env-dispatch-template-missing when mode=dispatch but no dispatch template', () => {
    try {
      resolveProvider({
        provider: 'x',
        providers: {
          x: {
            mode: 'dispatch',
            up: 'u {project}',
            exec: 'e {cmd}',
            status: 's',
            down: 'd',
          },
        },
      });
    } catch (err) {
      expect((err as EnvironmentError).code).toBe(
        'env-dispatch-template-missing',
      );
    }
  });

  test('merges config overrides over defaults field-by-field', () => {
    const r = resolveProvider({
      provider: 'coder',
      providers: { coder: { up: 'coder create --template node {project}' } },
    });
    expect(r.templates.up).toBe('coder create --template node {project}');
    // untouched fields fall through to the shipped default
    expect(r.templates.exec).toBe(DEFAULT_PROVIDERS.coder.exec);
  });

  test('supports a config-only provider with no shipped defaults', () => {
    const r = resolveProvider({
      provider: 'docker',
      providers: {
        docker: {
          up: 'docker compose up -d {project}',
          exec: 'docker compose exec {handle} {cmd}',
          status: 'docker compose ps {handle}',
          down: 'docker compose down {handle}',
        },
      },
    });
    expect(r.name).toBe('docker');
  });

  test('an explicit override provider wins over config.provider', () => {
    const r = resolveProvider({ provider: 'fella' }, 'coder');
    expect(r.name).toBe('coder');
  });

  test('env-config-missing when config is null', () => {
    expect(() => resolveProvider(null)).toThrow(EnvironmentError);
    try {
      resolveProvider(null);
    } catch (err) {
      expect((err as EnvironmentError).code).toBe('env-config-missing');
    }
  });

  test('env-provider-unset when provider is blank', () => {
    try {
      resolveProvider({ provider: '   ' });
    } catch (err) {
      expect((err as EnvironmentError).code).toBe('env-provider-unset');
    }
  });

  test('env-provider-unknown for an unshipped, unconfigured name', () => {
    try {
      resolveProvider({ provider: 'nope' });
    } catch (err) {
      expect((err as EnvironmentError).code).toBe('env-provider-unknown');
    }
  });

  test('env-template-missing when an override blanks a required op', () => {
    try {
      resolveProvider({
        provider: 'docker',
        providers: { docker: { up: 'docker up {project}' } }, // missing exec/status/down
      });
    } catch (err) {
      expect((err as EnvironmentError).code).toBe('env-template-missing');
    }
  });

  test('every shipped provider has all four ops', () => {
    for (const name of Object.keys(DEFAULT_PROVIDERS)) {
      const r = resolveProvider({ provider: name });
      for (const op of ENV_OPS) {
        expect(typeof r.templates[op]).toBe('string');
        expect(r.templates[op].length).toBeGreaterThan(0);
      }
    }
  });
});

describe('the coder default is non-interactive (validation finding #2)', () => {
  test('coder up carries --use-parameter-defaults', () => {
    expect(DEFAULT_PROVIDERS.coder.up).toContain('--use-parameter-defaults');
  });
});

describe('deriveHandle (validation finding #1: coder 32-char names)', () => {
  test('drops the date, keeps the descriptive words within maxLen', () => {
    expect(deriveHandle('2026-06-30-distributed-project-store', 32)).toBe(
      'distributed-project-store',
    );
  });
  test('caps to the first 3 words', () => {
    expect(deriveHandle('2026-06-26-test-ev-run-with-env-coder', 32)).toBe('test-ev-run');
  });
  test('truncates over-long results to maxLen (no trailing dash)', () => {
    const h = deriveHandle('aaaaaaaaaa-bbbbbbbbbb-cccccccccc-dddddddddd', 12);
    expect(h.length).toBeLessThanOrEqual(12);
    expect(h.endsWith('-')).toBe(false);
  });
  test('ensures it starts with a letter', () => {
    expect(deriveHandle('2026-06-30-9lives', 32)).toMatch(/^[a-z]/);
  });
  test('empty projection falls back to "project"', () => {
    expect(deriveHandle('2026-06-30-', 32)).toBe('project');
  });
});

describe('handleMaxLen surfacing + coder up uses {handle}', () => {
  test('coder resolves handleMaxLen=32; fella has none', () => {
    expect(resolveProvider({ provider: 'coder' }).handleMaxLen).toBe(32);
    expect(resolveProvider({ provider: 'fella' }).handleMaxLen).toBeUndefined();
  });
  test('coder up renders against {handle} (the workspace name)', () => {
    expect(DEFAULT_PROVIDERS.coder.up).toContain('{handle}');
    expect(DEFAULT_PROVIDERS.coder.up).not.toContain('{project}');
  });
});

describe('deepMerge', () => {
  test('objects merge key-by-key; over wins; arrays/scalars replaced', () => {
    expect(
      deepMerge(
        { a: 1, nested: { x: 1, y: 2 }, list: [1, 2] },
        { a: 9, nested: { y: 3, z: 4 }, list: [9] },
      ),
    ).toEqual({ a: 9, nested: { x: 1, y: 3, z: 4 }, list: [9] });
  });
});

describe('loadMergedSettings (settings.json + settings.local.json)', () => {
  let dir: string;
  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'ev-settings-'));
    mkdirSync(join(dir, '.claude'), { recursive: true });
  });
  afterEach(() => rmSync(dir, { recursive: true, force: true }));

  const cd = (): string => join(dir, '.claude');

  test('committed settings.json provides shared templates; local overrides + selects', () => {
    // shared (committed): full coder templates that should travel (decision 0009)
    const shared = {
      ev: {
        environment: {
          providers: {
            coder: {
              mode: 'dispatch',
              up: 'coder create --shared {project}',
              exec: 'coder ssh {handle} -- {cmd}',
              status: 'coder show {handle}',
              down: 'coder delete {handle}',
              dispatch: "coder ssh {handle} -- bash -lc '{run}'",
            },
          },
        },
      },
    };
    // local (gitignored): pick the provider + override one field
    const local = {
      ev: {
        environment: {
          provider: 'coder',
          providers: { coder: { up: 'coder create --local-override {project}' } },
        },
      },
    };
    writeFileSync(join(cd(), 'settings.json'), JSON.stringify(shared));
    writeFileSync(join(cd(), 'settings.local.json'), JSON.stringify(local));

    const merged = loadMergedSettings(cd());
    const config = loadEnvironmentConfig(merged);
    const resolved = resolveProvider(config);
    expect(resolved.name).toBe('coder'); // selected by local
    expect(resolved.templates.up).toBe('coder create --local-override {project}'); // local wins
    expect(resolved.templates.status).toBe('coder show {handle}'); // shared survives
    expect(resolved.mode).toBe('dispatch');
  });

  test('settings.json alone is read (the bug: it used to be ignored)', () => {
    writeFileSync(
      join(cd(), 'settings.json'),
      JSON.stringify({ ev: { environment: { provider: 'fella' } } }),
    );
    const config = loadEnvironmentConfig(loadMergedSettings(cd()));
    expect(resolveProvider(config).name).toBe('fella');
  });

  test('neither file present -> null', () => {
    expect(loadMergedSettings(cd())).toBeNull();
  });
});

describe('shellQuote', () => {
  test('leaves safe tokens bare', () => {
    expect(shellQuote('2026-06-25-thing')).toBe('2026-06-25-thing');
    expect(shellQuote('npm')).toBe('npm');
  });

  test('single-quotes values with spaces or shell metacharacters', () => {
    expect(shellQuote('npm test')).toBe("'npm test'");
    expect(shellQuote('a && b')).toBe("'a && b'");
  });

  test('escapes embedded single quotes (the hang-bug case)', () => {
    expect(shellQuote("node -e 'console.log(2+2)'")).toBe(
      "'node -e '\\''console.log(2+2)'\\'''",
    );
  });

  test('empty string quotes to a pair of single quotes', () => {
    expect(shellQuote('')).toBe("''");
  });
});

describe('renderTemplate', () => {
  test('substitutes safe vars bare', () => {
    expect(renderTemplate('fella up {project}', { project: 'my-proj' })).toBe(
      'fella up my-proj',
    );
  });

  test('shell-quotes a multi-word command', () => {
    expect(
      renderTemplate('fella exec {handle} -- {cmd}', {
        handle: 'h1',
        cmd: 'npm test',
      }),
    ).toBe("fella exec h1 -- 'npm test'");
  });

  test('a command with embedded quotes renders safely (no mis-split)', () => {
    expect(
      renderTemplate('coder ssh {handle} -- {cmd}', {
        handle: 'ws',
        cmd: "node -e 'console.log(1)'",
      }),
    ).toBe("coder ssh ws -- 'node -e '\\''console.log(1)'\\'''");
  });

  test('throws env-template-unrendered on a missing var', () => {
    try {
      renderTemplate('fella exec {handle} -- {cmd}', { handle: 'h1' });
    } catch (err) {
      expect((err as EnvironmentError).code).toBe('env-template-unrendered');
    }
  });
});

describe('planCommand', () => {
  const fella = resolveProvider({ provider: 'fella' });

  test('renders up with the project slug', () => {
    expect(planCommand('up', fella, { project: '2026-06-25-thing' })).toBe(
      'fella up 2026-06-25-thing',
    );
  });

  test('renders exec with handle + cmd (cmd shell-quoted)', () => {
    expect(
      planCommand('exec', fella, { handle: '2026-06-25-thing', cmd: 'npm test' }),
    ).toBe("fella exec 2026-06-25-thing -- 'npm test'");
  });

  test('renders dispatch with {run} inserted raw (inside the template quotes)', () => {
    const coder = resolveProvider({ provider: 'coder' });
    const cmd = planCommand('dispatch', coder, {
      handle: 'short-name',
      slug: '2026-06-25-thing',
      phase: '2',
      run: '/ev-run 2026-06-25-thing 2 --mode=auto',
    });
    expect(cmd).toContain('coder ssh short-name');
    // {run} lands raw inside the operator's single quotes — not re-quoted.
    expect(cmd).toContain("claude -p '/ev-run 2026-06-25-thing 2 --mode=auto'");
  });

  test('{run} is not shell-quoted even though it contains spaces', () => {
    expect(
      renderTemplate("claude -p '{run}'", {
        run: '/ev-run my-slug 3 --mode=auto',
      }),
    ).toBe("claude -p '/ev-run my-slug 3 --mode=auto'");
  });

  test('env-dispatch-unsupported when dispatching an exec-mode provider', () => {
    try {
      planCommand('dispatch', fella, { handle: 'h', phase: '1' });
    } catch (err) {
      expect((err as EnvironmentError).code).toBe('env-dispatch-unsupported');
    }
  });
});
