import { describe, expect, test } from 'vitest';
import {
  DEFAULT_PROVIDERS,
  EnvironmentError,
  ENV_OPS,
  loadEnvironmentConfig,
  planCommand,
  renderTemplate,
  resolveProvider,
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
  test('resolves a shipped provider to its default templates', () => {
    const r = resolveProvider({ provider: 'fella' });
    expect(r.name).toBe('fella');
    expect(r.templates).toEqual(DEFAULT_PROVIDERS.fella);
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

describe('renderTemplate', () => {
  test('substitutes provided vars', () => {
    expect(renderTemplate('fella up {project}', { project: 'my-proj' })).toBe(
      'fella up my-proj',
    );
    expect(
      renderTemplate('fella exec {handle} -- {cmd}', {
        handle: 'h1',
        cmd: 'npm test',
      }),
    ).toBe('fella exec h1 -- npm test');
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

  test('renders exec with handle + cmd', () => {
    expect(
      planCommand('exec', fella, { handle: '2026-06-25-thing', cmd: 'npm test' }),
    ).toBe('fella exec 2026-06-25-thing -- npm test');
  });
});
