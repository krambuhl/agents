pr #555: retry rate-limited and unavailable responses in the billing client
author: @lee (branch in this repo)

description:
> the billing api sheds load with 429 and 503. this retries both, up to three times with exponential backoff, and honors retry-after when it is present.

diff:

```diff
--- a/src/billing/client.ts
+++ b/src/billing/client.ts
@@ -10,8 +10,18 @@ export async function call(path: string, init: RequestInit) {
-  const res = await fetch(BASE + path, init);
-  return res;
+  for (let attempt = 0; attempt < 3; attempt++) {
+    const res = await fetch(BASE + path, init);
+    if (res.status !== 503) return res;
+    await sleep(2 ** attempt * 200);
+  }
+  return fetch(BASE + path, init);
 }
--- a/src/billing/client.test.ts
+++ b/src/billing/client.test.ts
@@ -20,0 +21,8 @@
+test('retries a 503 then succeeds', async () => {
+  mockFetch([503, 200]);
+  expect((await call('/invoices', {})).status).toBe(200);
+});
```

surrounding code: nothing else in src/billing/ reads the retry-after header.
