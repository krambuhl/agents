pr #418: retry transient fetch failures in the net client

review thread on src/net/client.ts line 6, unresolved

@marco (reviewer):
> this loops forever if fetch keeps throwing. there's no upper bound on attempts, the loop condition is just `attempt <= MAX_ATTEMPTS` but MAX_ATTEMPTS is never defined in this file as far as i can see. blocking until that's fixed.

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
it('gives up after three attempts and rethrows the last error', async () => {
  const f = vi.fn().mockRejectedValue(new Error('boom'));
  vi.stubGlobal('fetch', f);
  await expect(fetchWithRetry('/x')).rejects.toThrow('boom');
  expect(f).toHaveBeenCalledTimes(3);
});
```

state: the test above passes on the pr head. nothing has been posted in reply.
