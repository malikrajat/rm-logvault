# The recipes, the adapter, and choosing between them

**Problem it solves:** you now have four ways to get an error recorded and one adapter with two entry
points, and picking the wrong one produces either a hole in your coverage or a duplicate you did not
expect. This page is the decision, written out once, with the four recipes from
[basic](../basic/01-capture-recipes.md) finally placed in their real home — plus how to assert any of it
in a test instead of clicking buttons and squinting at a report.

**What you will learn:**

- The complete `src/main.ts` that makes every recipe work, in one block.
- A decision table: which Vue error path reaches which hook, and which one needs you to write nothing.
- The chaining guarantee, and why Vue's single-slot `errorHandler` makes it load-bearing.
- The one place an adapter option **overwrites** a field the adapter derived itself.
- How to assert a capture with a memory repository, without over-claiming what a test exercised.

## The complete setup, once

Every recipe on this page works with exactly this, and nothing else:

```ts
// src/main.ts
import { createApp } from 'vue';
import { initTelemetry } from '@codewithrajat/rm-logvault';
import { createTelemetryVuePlugin } from '@codewithrajat/rm-logvault/vue';
import App from './App.vue';

initTelemetry({ appName: 'my-app' }); // first

createApp(App)
  .use(createTelemetryVuePlugin({ context: { tags: { shell: 'checkout' } } }))
  .mount('#app'); // last
```

The order is not cosmetic. A component that throws during the initial mount should already be inside the
reporting pipeline, and the plugin needs a live pipeline to report into.

If the app instance is created somewhere you do not control, the same adapter is available as
`attachVueTelemetry(app, options)` — the plugin delegates straight to it, so the two are exactly
equivalent.

## Which one do I use?

| Situation | Use | Why not the others |
| --- | --- | --- |
| A throw in a Vue event handler, lifecycle hook or render function | **Nothing** | Vue dispatches it into `app.config.errorHandler`, which the plugin already chained; the record gets `source: 'vue'`. |
| A rejected promise with no `.catch` | **Nothing**, but expect less context | It is a browser `unhandledrejection` event, not a Vue hook, so no component context is attached — the global handler still captures it. |
| A throw inside a `setTimeout` or a raw `addEventListener` callback | **Nothing** | No Vue frame is involved, so it is captured by the global handler rather than the adapter. |
| Something threw and the automatic record lacks context | `withErrorCapture` (keep the throw) | The automatic record cannot know your order id. |
| You caught a failure and the user is fine | `captureError(error, ctx)` | It reports and returns instead of re-throwing. |
| You want to report a wrong-but-not-fatal state | `captureError(error, ctx)` | Nothing was thrown to capture. |
| You want Vue's own warnings in the store | The plugin's default `captureWarnings: true` | Nothing else sees a Vue warning. |
| You want Vue's console output left completely alone | `captureWarnings: false` | That leaves `warnHandler` untouched, so errors are still recorded. |
| You want records held on the device | The default `mode: 'local'` | No URL, no upload, no network egress at all. |

The first three rows are the point of the adapter: you write nothing and still get a record. The rows
that need a call are the ones where the library cannot know something only you know.

## The two "capture and throw" options

These both look like the same idea, and the difference is one re-throw:

| | `withErrorCapture(handler, ctx)` | `captureError(error, ctx)` |
| --- | --- | --- |
| Re-throws? | **Yes** — the same value, so your `catch` still runs | **No** — it returns |
| Default `source` | `'event-handler'` | Whatever you pass in `ctx` |
| Shape | A function you call with a callback, which runs immediately | A function you call with an error you already have |
| Best for | Preserving existing error behaviour while adding context | A handler where a re-throw would only add noise |

If you are unsure, prefer `captureError`: a re-thrown handler error surfaces as a DevTools console error
on every click, and the failure is recorded either way. Keeping the capture in an exported function
rather than inline in the template is also what makes it testable, as the last section shows:

```ts
// src/checkout/submitOrder.ts
import { captureError } from '@codewithrajat/rm-logvault';

export function submitOrder(orderId: string): void {
  try {
    // …the real work: validation, a request, a state update…
    throw new Error(`[checkout] payment failed for order ${orderId}`);
  } catch (error) {
    captureError(error, { tags: { flow: 'checkout' }, handled: true }); // recorded, click ends quietly
  }
}
```

```vue
<!-- src/components/PayButton.vue -->
<script setup lang="ts">
import { submitOrder } from '../checkout/submitOrder';

function submit(): void {
  submitOrder('8123');
}
</script>

<template>
  <button type="button" @click="submit">Pay</button>
</template>
```

> **The one template mistake to avoid.** `withErrorCapture` is not a method reference you can bind.
> Writing `@click="withErrorCapture(submit)"` evaluates it during render, so you would capture a
> render-time throw instead of a click-time one. Always call it *inside* the function bound to `@click`.

## The chaining guarantee, spelled out

Vue permits exactly **one** `app.config.errorHandler`, and installing a second one silently discards the
first. That is why the adapter never replaces yours — it captures it and calls it **after** reporting:

```ts
const previous = app.config.errorHandler;

app.config.errorHandler = (error, instance, info) => {
  try {
    // report first, with Vue's lifecycle hook name when it supplies one
  } catch {
    // reporting must never break the application
  }

  if (typeof previous === 'function') {
    try {
      previous(error, instance, info); // your handler still runs, exactly once
    } catch {
      // a throwing app handler is not our problem
    }
  }
};
```

`app.config.warnHandler` is chained the same way. Four consequences:

1. **Your handler runs second**, so it sees the original error untouched.
2. **A throw from your handler is swallowed.** It cannot take down the reporting path.
3. **A throw from the adapter's own work is swallowed too**, so a hostile error object cannot break boot.
4. **`captureWarnings: false` leaves `warnHandler` entirely alone** — not wrapped, not chained, not
   recorded. Errors are still reported.

## Correction — your `context` replaces the adapter's own fields

The adapter page says your `context` is "merged into every record". The source builds it as a shallow
spread with your context **last**:

```ts
const recordContext = {
  source: 'vue',
  ...(vueInfo ? { extra: { vueInfo } } : {}),
  ...(context ?? {}), // last, so a consumer option wins by replacing
};
```

So a key you pass wins by **replacing the whole value**, not by combining with it:

```ts
createTelemetryVuePlugin({ context: { extra: { release: '2.4.1' } } });
// recorded `extra` is { release: '2.4.1' } — `extra.vueInfo` is gone
```

| You pass in `context` | What happens to the adapter-derived field |
| --- | --- |
| `extra` | Replaces `extra.vueInfo` entirely, because `extra` is one key in a shallow spread. |
| `source` | Replaces `'vue'`, so the record stops looking like a Vue capture. |
| `severity` | Replaces `'warning'` on the `warnHandler` path. |
| `tags` | Replaces the whole tag set — including `{ framework: 'vue', kind: 'warning' }` on a warning. |

This is not a bug in the merge — it is a shallow spread doing exactly what a shallow spread does — but it
is the difference between the context you think you have and the context you actually have. Pass the
whole value you want, or leave the key out and let the adapter supply it.

The plugin itself installs hooks only; it does not create the store or the transport. Applying new
`initTelemetry` options therefore means `destroyTelemetry()` and then init again, and the plugin can stay
installed throughout, because it reports into whatever pipeline is current.

## Testing it without a browser database

`createMemoryRepository()` from `@codewithrajat/rm-logvault/testing` is the documented path, and it is
what makes all of the above assertable. `submitOrder()` above is already an exported function, so a test
can call it directly — no rendering, no clicking:

```ts
// src/checkout/submitOrder.test.ts
import { afterEach, expect, it } from 'vitest';
import { destroyTelemetry, flushTelemetry, initTelemetry } from '@codewithrajat/rm-logvault';
import { createMemoryRepository } from '@codewithrajat/rm-logvault/testing';
import { submitOrder } from './submitOrder';

afterEach(() => {
  destroyTelemetry();
});

it('records a captured failure with its tags', async () => {
  const repository = createMemoryRepository();

  // `shortcut: false` stops the test installing a keydown listener on `document`.
  initTelemetry({ appName: 'test-app', repository, shortcut: false });

  submitOrder('8123');

  await flushTelemetry(); // writes are batched; without this the assertion races

  const [record] = repository.errors.all();
  expect(record?.message).toBe('[checkout] payment failed for order 8123');
  expect(record?.tags).toEqual({ flow: 'checkout' });
  expect(record?.handled).toBe(true);
});
```

Why each line is there:

| Line | Reason |
| --- | --- |
| `createMemoryRepository()` | No IndexedDB, no `fake-indexeddb` dependency, no partial browser implementation. |
| `shortcut: false` | Otherwise every test installs a `keydown` listener on `document`. |
| `destroyTelemetry()` in `afterEach` | Initialisation is idempotent, so a second test would otherwise reuse the first one's setup and fail confusingly. |
| `await flushTelemetry()` | Writes are batched; the flush is what makes the assertion deterministic. `flushTelemetry()` returns a promise and touches no network. |

> **Vue testing note.** `@vue/test-utils`' `mount()` is the usual harness, but methods declared in
> `<script setup>` are **not** exposed on the component instance by default — `wrapper.vm.submit(…)` does
> not exist unless you add `defineExpose`. That is why the test above calls an exported function rather
> than simulating a click: it exercises the same capture path without claiming a rendered interaction
> was exercised. If you want to test the adapter's chaining itself, install the plugin on the test app
> (`mount(App, { global: { plugins: [createTelemetryVuePlugin()] } })`) and let a component that throws
> during render produce the record — that path is Vue calling the hook, not you calling a function.

## A checklist for a new capture site

1. Would the automatic path already catch it? If yes, write nothing — and tag it via the plugin's
   `context` if it needs identifying.
2. Is it a promise rejection or a callback outside Vue's dispatch? Nothing to write, but expect no
   component context on the record.
3. Do you need context the library cannot discover? Add it at the capture site, with `tags` for grouping
   and `extra` for values.
4. Does the error need to keep propagating? `withErrorCapture` re-throws; `captureError` does not.
5. Are you overriding a field the adapter derived? Remember the shallow spread and pass the whole value.
6. Can you assert it? A memory repository turns "I clicked the button and it looked right" into a test
   that fails when the integration regresses.

## Related

- [the Vue adapter](./01-framework-adapter.md) — the chaining guarantee and the option table in full.
- [more-advanced](./README.md) — the power surface this page sits on top of.
- [the capture recipes](../basic/01-capture-recipes.md) — the four recipes these decisions are about.
- [docs/API.md](../../../docs/API.md) — every option and every exported signature.
