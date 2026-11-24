pr #541: add a refunds webhook handler
author: @sam (branch in this repo)

description:
> handles stripe's `charge.refunded` webhook and marks the order refunded.

diff:

```diff
--- /dev/null
+++ b/src/webhooks/refunds.ts
@@ -0,0 +1,14 @@
+import { markRefunded } from '../orders/store';
+
+export async function handleRefund(event: StripeEvent) {
+  const orderId = event.data.object.metadata?.orderId;
+  if (!orderId) {
+    console.error('refund webhook without an order id', event.id);
+    return { status: 200 };
+  }
+  await markRefunded(orderId);
+  return { status: 200 };
+}
--- /dev/null
+++ b/src/webhooks/refunds.test.ts
@@ -0,0 +1,12 @@
+import { handleRefund } from './refunds';
+test('marks the order refunded', async () => { /* asserts markRefunded called with o1 */ });
+test('ignores events with no order id', async () => { /* asserts status 200, markRefunded not called */ });
```

surrounding code (unchanged):

src/lib/log.ts:
```ts
1  export const log = createLogger({ service: 'api' });
```

src/webhooks/charges.ts:
```ts
8   if (!orderId) {
9     log.warn('charge webhook without an order id', { eventId: event.id });
10    return { status: 200 };
11  }
```

src/webhooks/disputes.ts:
```ts
11  if (!orderId) {
12    log.warn('dispute webhook without an order id', { eventId: event.id });
13    return { status: 200 };
14  }
```

a search of src/ finds `console.error` nowhere else; `log.warn` and `log.error` from src/lib/log.ts appear in all six other webhook handlers.
