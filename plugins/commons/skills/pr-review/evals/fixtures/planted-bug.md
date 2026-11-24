pr #512: add page() helper for the orders list
author: @dana (branch in this repo)

description:
> adds `page(items, n, size)`, which returns the nth page of a list. pages are 1-indexed, so `page(items, 1, 20)` is the first twenty items. the orders list uses it in place of its inline slice.

diff:

```diff
--- /dev/null
+++ b/src/lib/page.ts
@@ -0,0 +1,4 @@
+export function page<T>(items: T[], n: number, size: number): T[] {
+  const start = n * size;
+  return items.slice(start, start + size);
+}
--- a/src/orders/list.ts
+++ b/src/orders/list.ts
@@ -1,9 +1,10 @@
 import { fetchOrders } from './api';
+import { page } from '../lib/page';

 const PAGE_SIZE = 20;

 export async function ordersPage(pageNumber: number) {
   const orders = await fetchOrders();
-  return orders.slice((pageNumber - 1) * PAGE_SIZE, pageNumber * PAGE_SIZE);
+  return page(orders, pageNumber, PAGE_SIZE);
 }
```

surrounding code:

src/orders/routes.ts (unchanged):
```ts
12  router.get('/orders', async (req, res) => {
13    const pageNumber = Number(req.query.page ?? 1);
14    res.json(await ordersPage(pageNumber));
15  });
```

tests: none touch src/lib/page.ts or ordersPage.
