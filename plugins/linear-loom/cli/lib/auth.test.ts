import { test, expect } from 'vitest';
import { resolveAuth } from './auth.ts';
import { LinearLoomError } from './errors.ts';

const FAKE_HOME = '/tmp/test-linear-loom-home';
const EXPECTED_CONFIG_PATH = `${FAKE_HOME}/.linear-loom/config.json`;

const fakeHome = () => FAKE_HOME;

function fileReaderForFiles(files: Record<string, string>) {
  return (path: string): string => {
    if (path in files) return files[path]!;
    const err = new Error(`ENOENT: no such file or directory, ${path}`);
    throw err;
  };
}

test('resolveAuth: returns env-sourced key when LINEAR_API_KEY is set', () => {
  const result = resolveAuth({
    env: { LINEAR_API_KEY: 'lin_api_env_key' },
    fileReader: fileReaderForFiles({}),
    homeDirResolver: fakeHome,
  });
  expect(result).toEqual({ apiKey: 'lin_api_env_key', source: 'env' });
});

test('resolveAuth: trims whitespace on env-sourced key', () => {
  const result = resolveAuth({
    env: { LINEAR_API_KEY: '  lin_api_env_key\n' },
    fileReader: fileReaderForFiles({}),
    homeDirResolver: fakeHome,
  });
  expect(result.apiKey).toBe('lin_api_env_key');
});

test('resolveAuth: falls back to ~/.linear-loom/config.json when env empty', () => {
  const result = resolveAuth({
    env: {},
    fileReader: fileReaderForFiles({
      [EXPECTED_CONFIG_PATH]: JSON.stringify({ api_key: 'lin_api_file_key' }),
    }),
    homeDirResolver: fakeHome,
  });
  expect(result).toEqual({ apiKey: 'lin_api_file_key', source: 'config-file' });
});

test('resolveAuth: empty-string LINEAR_API_KEY falls back to config file', () => {
  const result = resolveAuth({
    env: { LINEAR_API_KEY: '' },
    fileReader: fileReaderForFiles({
      [EXPECTED_CONFIG_PATH]: JSON.stringify({ api_key: 'lin_api_file_key' }),
    }),
    homeDirResolver: fakeHome,
  });
  expect(result.source).toBe('config-file');
});

test('resolveAuth: missing-auth error when neither source resolves', () => {
  expect(() =>
    resolveAuth({
      env: {},
      fileReader: fileReaderForFiles({}),
      homeDirResolver: fakeHome,
    }),
  ).toThrow(LinearLoomError);
  try {
    resolveAuth({
      env: {},
      fileReader: fileReaderForFiles({}),
      homeDirResolver: fakeHome,
    });
  } catch (err) {
    expect((err as LinearLoomError).code).toBe('missing-auth');
  }
});

test('resolveAuth: config-unparseable error on bad JSON', () => {
  expect(() =>
    resolveAuth({
      env: {},
      fileReader: fileReaderForFiles({ [EXPECTED_CONFIG_PATH]: 'not json' }),
      homeDirResolver: fakeHome,
    }),
  ).toThrow(/config-unparseable/);
});

test('resolveAuth: config-malformed when api_key field is missing', () => {
  expect(() =>
    resolveAuth({
      env: {},
      fileReader: fileReaderForFiles({
        [EXPECTED_CONFIG_PATH]: JSON.stringify({ other_field: 'value' }),
      }),
      homeDirResolver: fakeHome,
    }),
  ).toThrow(/config-malformed/);
});

test('resolveAuth: config-malformed when api_key is empty', () => {
  expect(() =>
    resolveAuth({
      env: {},
      fileReader: fileReaderForFiles({
        [EXPECTED_CONFIG_PATH]: JSON.stringify({ api_key: '' }),
      }),
      homeDirResolver: fakeHome,
    }),
  ).toThrow(/config-malformed/);
});

test('resolveAuth: config-malformed when api_key is not a string', () => {
  expect(() =>
    resolveAuth({
      env: {},
      fileReader: fileReaderForFiles({
        [EXPECTED_CONFIG_PATH]: JSON.stringify({ api_key: 42 }),
      }),
      homeDirResolver: fakeHome,
    }),
  ).toThrow(/config-malformed/);
});
