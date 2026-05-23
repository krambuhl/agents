import { test, expect, vi } from 'vitest';
import { createComment } from './comments.ts';
import { LinearClient } from './linear-client.ts';
import { LinearLoomError } from './errors.ts';

function clientReturning(response: unknown) {
  return new LinearClient({
    apiKey: 'lin_api_test',
    fetchFn: vi.fn(() =>
      Promise.resolve({
        ok: true,
        status: 200,
        text: () => Promise.resolve(''),
        json: () => Promise.resolve(response),
      }),
    ),
    sleepFn: () => Promise.resolve(),
  });
}

test('createComment: returns id + url on success', async () => {
  const client = clientReturning({
    data: {
      commentCreate: {
        success: true,
        comment: {
          id: 'comment-1',
          url: 'https://linear.app/team/L/issue/X-1#comment-1',
        },
      },
    },
  });
  const result = await createComment({
    client,
    issueId: 'issue-1',
    body: 'A comment.',
  });
  expect(result).toEqual({
    id: 'comment-1',
    url: 'https://linear.app/team/L/issue/X-1#comment-1',
  });
});

test('createComment: throws comment-create-failed when success=false', async () => {
  const client = clientReturning({
    data: {
      commentCreate: {
        success: false,
        comment: null,
      },
    },
  });
  expect.assertions(2);
  try {
    await createComment({ client, issueId: 'issue-1', body: 'body' });
  } catch (err) {
    expect(err).toBeInstanceOf(LinearLoomError);
    expect((err as LinearLoomError).code).toBe('comment-create-failed');
  }
});

test('createComment: throws comment-create-failed when comment node is null even if success=true', async () => {
  const client = clientReturning({
    data: {
      commentCreate: {
        success: true,
        comment: null,
      },
    },
  });
  expect.assertions(2);
  try {
    await createComment({ client, issueId: 'issue-1', body: 'body' });
  } catch (err) {
    expect(err).toBeInstanceOf(LinearLoomError);
    expect((err as LinearLoomError).code).toBe('comment-create-failed');
  }
});

test('createComment: forwards issueId + body to the mutation input', async () => {
  const fetchFn = vi.fn(() =>
    Promise.resolve({
      ok: true,
      status: 200,
      text: () => Promise.resolve(''),
      json: () =>
        Promise.resolve({
          data: {
            commentCreate: {
              success: true,
              comment: { id: 'c-1', url: 'u' },
            },
          },
        }),
    }),
  );
  const client = new LinearClient({
    apiKey: 'lin_api_test',
    fetchFn,
    sleepFn: () => Promise.resolve(),
  });
  await createComment({
    client,
    issueId: 'issue-7',
    body: 'Hello from linear-loom.',
  });
  const callBodies = fetchFn.mock.calls.map(
    (c) =>
      JSON.parse(c[1].body) as {
        variables: { input: { issueId: string; body: string } };
      },
  );
  expect(callBodies[0]!.variables.input).toEqual({
    issueId: 'issue-7',
    body: 'Hello from linear-loom.',
  });
});
