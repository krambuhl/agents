import { test, expect, vi } from 'vitest';
import { configure } from './configure.ts';
import { LinearClient } from '../lib/linear-client.ts';
import { LinearLoomError } from '../lib/errors.ts';

function stubAuthResolver() {
  return () => ({ apiKey: 'lin_api_test', source: 'env' as const });
}

function clientReturning(projectData: { id: string; name: string } | null) {
  return new LinearClient({
    apiKey: 'lin_api_test',
    fetchFn: vi.fn(() =>
      Promise.resolve({
        ok: true,
        status: 200,
        text: () => Promise.resolve(''),
        json: () => Promise.resolve({ data: { project: projectData } }),
      }),
    ),
    sleepFn: () => Promise.resolve(),
  });
}

test('configure: missing --linear-project flag emits structured error', async () => {
  const result = await configure([], {
    client: clientReturning({ id: 'p1', name: 'Sandbox' }),
    resolveAuthFn: stubAuthResolver(),
  });
  expect(result.exitCode).toBe(1);
  expect(result.stderr).toMatch(/missing-linear-project/);
  const parsed = JSON.parse(result.stderr ?? '');
  expect(parsed.error).toBe('missing-linear-project');
  expect(parsed.namespace).toBe('configure');
});

test('configure: empty --linear-project value emits structured error', async () => {
  const result = await configure(['--linear-project='], {
    client: clientReturning({ id: 'p1', name: 'Sandbox' }),
    resolveAuthFn: stubAuthResolver(),
  });
  expect(result.exitCode).toBe(1);
  const parsed = JSON.parse(result.stderr ?? '');
  expect(parsed.error).toBe('missing-linear-project');
});

test('configure: returns success summary when Linear Project exists', async () => {
  const result = await configure(['--linear-project=proj-id-xyz'], {
    client: clientReturning({ id: 'proj-id-xyz', name: 'My Sandbox' }),
    resolveAuthFn: stubAuthResolver(),
  });
  expect(result.exitCode).toBe(0);
  const parsed = JSON.parse(result.stdout ?? '');
  expect(parsed.linear_project).toEqual({
    id: 'proj-id-xyz',
    name: 'My Sandbox',
  });
  expect(parsed.auth_source).toBe('env');
  expect(parsed.schema_version).toBe(1);
  expect(parsed.bootstrapped.labels).toMatch(/deferred/);
  expect(parsed.bootstrapped.custom_fields).toBe('none-in-v1');
  expect(parsed.bootstrapped.document_templates).toMatch(/deferred/);
});

test('configure: emits linear-project-not-found when Linear returns null', async () => {
  const result = await configure(['--linear-project=ghost-id'], {
    client: clientReturning(null),
    resolveAuthFn: stubAuthResolver(),
  });
  expect(result.exitCode).toBe(1);
  const parsed = JSON.parse(result.stderr ?? '');
  expect(parsed.error).toBe('linear-project-not-found');
  expect(parsed.namespace).toBe('configure');
});

test('configure: surfaces resolveAuth errors as structured stderr', async () => {
  const result = await configure(['--linear-project=proj-id'], {
    client: clientReturning({ id: 'proj-id', name: 'Anything' }),
    resolveAuthFn: () => {
      throw new LinearLoomError('missing-auth', 'env unset');
    },
  });
  expect(result.exitCode).toBe(1);
  expect(result.stderr).toContain('missing-auth');
  const parsed = JSON.parse(result.stderr ?? '');
  expect(parsed.error).toBe('missing-auth');
});

test('configure: --pretty pretty-prints the success JSON', async () => {
  const result = await configure(
    ['--linear-project=proj-id-xyz', '--pretty'],
    {
      client: clientReturning({ id: 'proj-id-xyz', name: 'Sandbox' }),
      resolveAuthFn: stubAuthResolver(),
    },
  );
  expect(result.exitCode).toBe(0);
  expect(result.stdout).toContain('\n  ');
});
