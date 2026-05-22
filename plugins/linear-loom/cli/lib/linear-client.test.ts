import { test, expect, vi } from 'vitest';
import {
  LinearClient,
  LINEAR_GRAPHQL_ENDPOINT,
  type FetchFn,
} from './linear-client.ts';
import { LinearLoomError } from './errors.ts';

function jsonResponse(body: unknown, init?: { status?: number; ok?: boolean }) {
  const status = init?.status ?? 200;
  const ok = init?.ok ?? (status >= 200 && status < 300);
  const text = JSON.stringify(body);
  return {
    ok,
    status,
    text: () => Promise.resolve(text),
    json: () => Promise.resolve(body),
  };
}

function makeClient(fetchFn: FetchFn, retry = { maxAttempts: 4, baseDelayMs: 1 }) {
  return new LinearClient({
    apiKey: 'lin_api_test',
    fetchFn,
    sleepFn: () => Promise.resolve(),
    retry,
  });
}

test('LinearClient: refuses empty apiKey at construction', () => {
  expect(
    () => new LinearClient({ apiKey: '' as string, fetchFn: vi.fn() }),
  ).toThrow(LinearLoomError);
});

test('LinearClient: POSTs to the GraphQL endpoint with Authorization header', async () => {
  const fetchFn = vi.fn(() =>
    Promise.resolve(jsonResponse({ data: { ok: true } })),
  );
  const client = makeClient(fetchFn);
  await client.query('{ viewer { id } }');
  expect(fetchFn).toHaveBeenCalledTimes(1);
  const [url, init] = fetchFn.mock.calls[0]!;
  expect(url).toBe(LINEAR_GRAPHQL_ENDPOINT);
  expect(init.method).toBe('POST');
  expect(init.headers).toEqual({
    'Content-Type': 'application/json',
    Authorization: 'lin_api_test',
  });
  const parsedBody = JSON.parse(init.body);
  expect(parsedBody.query).toContain('viewer');
  expect(parsedBody.variables).toEqual({});
});

test('LinearClient: returns data field on success', async () => {
  const fetchFn = vi.fn(() =>
    Promise.resolve(jsonResponse({ data: { viewer: { id: 'u1' } } })),
  );
  const client = makeClient(fetchFn);
  const result = await client.query<{ viewer: { id: string } }>(
    '{ viewer { id } }',
  );
  expect(result).toEqual({ viewer: { id: 'u1' } });
});

test('LinearClient: retries on 429 with exponential backoff, then succeeds', async () => {
  const sleeps: number[] = [];
  const fetchFn = vi
    .fn()
    .mockResolvedValueOnce(jsonResponse({}, { status: 429, ok: false }))
    .mockResolvedValueOnce(jsonResponse({}, { status: 429, ok: false }))
    .mockResolvedValueOnce(jsonResponse({ data: { v: 1 } }));
  const client = new LinearClient({
    apiKey: 'k',
    fetchFn,
    sleepFn: (ms) => {
      sleeps.push(ms);
      return Promise.resolve();
    },
    retry: { maxAttempts: 4, baseDelayMs: 500 },
  });
  const result = await client.query<{ v: number }>('{ q }');
  expect(result).toEqual({ v: 1 });
  expect(fetchFn).toHaveBeenCalledTimes(3);
  expect(sleeps).toEqual([500, 1000]);
});

test('LinearClient: retries on 5xx then throws after budget exhausted', async () => {
  const fetchFn = vi
    .fn()
    .mockResolvedValue(jsonResponse({}, { status: 503, ok: false }));
  const client = makeClient(fetchFn, { maxAttempts: 3, baseDelayMs: 1 });
  await expect(client.query('{ q }')).rejects.toMatchObject({
    code: 'server-error',
  });
  expect(fetchFn).toHaveBeenCalledTimes(3);
});

test('LinearClient: 401 surfaces as auth-refused with no retry', async () => {
  const fetchFn = vi
    .fn()
    .mockResolvedValue(jsonResponse('Unauthorized', { status: 401, ok: false }));
  const client = makeClient(fetchFn);
  await expect(client.query('{ q }')).rejects.toMatchObject({
    code: 'auth-refused',
  });
  expect(fetchFn).toHaveBeenCalledTimes(1);
});

test('LinearClient: graphql-error when response has errors[]', async () => {
  const fetchFn = vi.fn(() =>
    Promise.resolve(
      jsonResponse({ errors: [{ message: 'field not found' }] }),
    ),
  );
  const client = makeClient(fetchFn);
  await expect(client.query('{ q }')).rejects.toMatchObject({
    code: 'graphql-error',
  });
});

test('LinearClient: graphql-empty when response has neither data nor errors', async () => {
  const fetchFn = vi.fn(() => Promise.resolve(jsonResponse({})));
  const client = makeClient(fetchFn);
  await expect(client.query('{ q }')).rejects.toMatchObject({
    code: 'graphql-empty',
  });
});

test('LinearClient: network-error retries then surfaces on exhaust', async () => {
  const fetchFn = vi
    .fn()
    .mockRejectedValue(new Error('ECONNREFUSED'));
  const client = makeClient(fetchFn, { maxAttempts: 2, baseDelayMs: 1 });
  await expect(client.query('{ q }')).rejects.toMatchObject({
    code: 'network-error',
  });
  expect(fetchFn).toHaveBeenCalledTimes(2);
});
