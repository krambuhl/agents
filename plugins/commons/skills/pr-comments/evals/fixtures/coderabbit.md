pr #418: retry transient fetch failures in the net client

review comment from coderabbitai[bot] on src/net/client.ts line 9, unresolved

> **Potential issue:** `fetchWithRetry` retries on every thrown error, including `AbortError` when the caller cancels the request. A cancelled request will be retried up to 3 times against the caller's intent.
>
> Consider rethrowing immediately when `err instanceof DOMException && err.name === 'AbortError'`.

current contents of src/net/client.ts:

```ts
const MAX_ATTEMPTS = 3;

export async function fetchWithRetry(input: RequestInfo, init?: RequestInit): Promise<Response> {
  let lastError: unknown;
  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    try {
      return await fetch(input, init);
    } catch (err) {
      lastError = err;
      await sleep(jitter(attempt));
    }
  }
  throw lastError;
}
```

current contents of src/net/client.test.ts:

```ts
it('retries a failed fetch up to three times', async () => {
  const f = vi.fn().mockRejectedValueOnce(new Error('boom')).mockResolvedValue(new Response('ok'));
  vi.stubGlobal('fetch', f);
  await fetchWithRetry('/x');
  expect(f).toHaveBeenCalledTimes(2);
});
```

state: nothing has been pushed in response to this comment.
