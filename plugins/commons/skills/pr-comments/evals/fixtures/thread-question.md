pr #418: retry transient fetch failures in the net client

review thread on src/net/client.ts line 10, unresolved

@priya (reviewer):
> what's the actual wait between attempts here? i see `jitter(attempt)` but not what it does. is this going to hammer a struggling upstream or back off?

current contents of src/net/backoff.ts:

```ts
// base delay doubles per attempt, plus up to 100ms of random jitter,
// capped at 2s so three attempts finish inside a typical request budget.
export function jitter(attempt: number): number {
  const base = Math.min(2000, 200 * 2 ** (attempt - 1));
  return base + Math.floor(Math.random() * 100);
}
```

state: nothing has been posted in reply.
