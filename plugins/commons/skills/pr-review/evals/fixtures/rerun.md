pr #570: cache feature flags in memory
author: @dana (branch in this repo)

this is a second /pr-review run. the author pushed 4c1d9e2 since your first review.

your open review threads from the first run (unresolved, first comment by you):

thread a, on src/flags/cache.ts line 9:
> **advisory** · correctness
> `ttl` is in seconds but it is compared against `Date.now()`, which is milliseconds, so every entry expires after a thousandth of its ttl.

thread b, on src/flags/cache.ts line 14:
> **advisory** · tests
> nothing tests expiry. a test that advances the clock past the ttl would pin it.

the pr at its new head, 4c1d9e2:

src/flags/cache.ts:
```ts
1   const entries = new Map<string, { value: boolean; at: number }>();
2
3   export function getFlag(name: string, ttl: number, load: () => boolean): boolean {
4     const hit = entries.get(name);
5     const now = Date.now();
6     if (!hit) return store(name, load(), now);
7     const age = now - hit.at;
8     const fresh = hit.value !== undefined;
9     if (fresh && age < ttl * 1000) return hit.value;
10    return store(name, load(), now);
11  }
12
13  function store(name: string, value: boolean, at: number): boolean {
14    entries.set(name, { value, at });
15    return value;
16  }
```

src/flags/cache.test.ts (unchanged since the first review):
```ts
1  test('returns the loaded value', () => {
2    expect(getFlag('a', 60, () => true)).toBe(true);
3  });
4  test('serves a hit from the cache', () => {
5    let calls = 0;
6    getFlag('b', 60, () => (calls++, true));
7    getFlag('b', 60, () => (calls++, true));
8    expect(calls).toBe(1);
9  });
```

the diff since the first review changes only line 9 (it was `fresh && age < ttl`).
