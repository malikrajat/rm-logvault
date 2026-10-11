# Worker failures and dynamic imports in a Vue app

**Problem it solves:** a `Worker` your component owns produces nothing in the report, because its
`error` and `messageerror` events are dispatched on the `Worker` instance. No Vue hook sees them,
and no global handler `initTelemetry` installs does either. The same page has a second hole: a
lazily loaded route or panel that fails to load is filed under a hashed filename, and is captured
twice — once by your loader, once by the `app.config.errorHandler` the Vue plugin chained.

**What you will learn:**

- Where `attachWorker` belongs: a composable that owns it, torn down in `onScopeDispose`.
- Why `onUnmounted` is the wrong cleanup inside a composable, and what production does instead.
- Why a `shallowRef<Worker | null>` is safe to pass, and which call that safety does **not** cover.
- `withChunkCapture` in `defineAsyncComponent`'s `loader`, and on a `vue-router` route.
- What the chained `errorHandler` does to a `handled: false` chunk record, and what an
  `onErrorCaptured` hook that returns `false` changes.

## A worker is invisible to Vue

`app.config.errorHandler` receives what Vue caught: a lifecycle hook, a render function, an event
handler, a watcher callback. A worker's failure is not one of those. Its two events fire on the
**`Worker` object**, which Vue never sees and the library cannot find — there is no registry of live
workers to scan, and the library will not monkey-patch the `Worker` constructor to build one.

The [vanilla page](../../vanilla/more-advanced/07-workers-and-dynamic-imports.md) carries that
reasoning, the option table and the per-event field lists. This page is about **placement**.

## Where the code goes: a composable that owns the attachment

A worker has a lifecycle (created, messaged, terminated) and the attachment has one too (attached,
detached). In Vue that is a composable — not a `<script setup>` block. The same code then works in a
component, in another composable, and in a plain `effectScope()` in a test.

```ts
// src/composables/useWorker.ts
import { onScopeDispose, shallowRef } from 'vue';
import {
  attachWorker,
  type AttachWorkerOptions,
  type WorkerAttachment,
} from '@codewithrajat/rm-logvault/worker';

/** How to build the worker, plus `attachWorker`'s own options. */
export interface UseWorkerOptions extends AttachWorkerOptions {
  createWorker: () => Worker | null;
}

export function useWorker(options: UseWorkerOptions) {
  const { createWorker, ...attachOptions } = options;
  const worker = shallowRef<Worker | null>(null);
  let attachment: WorkerAttachment | undefined;

  function start(): void {
    if (worker.value !== null) return;
    const created = createWorker();
    worker.value = created;
    // Inert when `created` is `null`: `attachWorker` looks for `addEventListener`
    // on its argument, and a value without one gets no listeners and no throw.
    attachment = attachWorker(created, attachOptions);
  }

  function stop(): void {
    attachment?.(); // removes both listeners, cancels pending response timers
    attachment = undefined;
    worker.value?.terminate();
    worker.value = null;
  }

  /** Watch for the answer to one request. A no-op when nothing is attached. */
  function expectResponse(label: string): () => void {
    return attachment?.expectResponse(label) ?? ((): void => undefined);
  }

  // The scope cleanup owns teardown, for the reason below. `start()` is the caller's:
  // a component calls it in `onMounted`, where a server render has no `Worker`.
  onScopeDispose(stop);

  return { worker, start, stop, expectResponse };
}
```

```vue
<!-- src/components/HealthStatus.vue -->
<script setup lang="ts">
import { onMounted } from 'vue';
import { useWorker } from '../composables/useWorker';

const { worker, start, expectResponse } = useWorker({
  createWorker: () =>
    new Worker(new URL('../workers/health.worker.ts', import.meta.url), { type: 'module' }),
  name: 'healthStatus',
  responseTimeoutMs: 10_000,
  context: { tags: { screen: 'settings' } },
});

onMounted(() => {
  start();

  const target = worker.value;
  if (target === null) return;

  const settle = expectResponse('health-check'); // cancels the timeout on reply
  target.addEventListener('message', () => settle(), { once: true });
  target.postMessage({ type: 'health-check' });
});
</script>
```

Set `name`: it is the `worker` tag on every record, and a report full of `worker: 'worker'` cannot
say which of three workers died. `context` tags every record too, so `screen` belongs there.

### Why `onScopeDispose` and not `onUnmounted`

`onUnmounted` is a **component** hook. Inside a composable it is correct only while every caller is
a component's `setup()` — and a composable that also runs inside an `effectScope()`, a router guard
or another composable's factory is not that.

```ts
const scope = effectScope();
let health: ReturnType<typeof useWorker> | undefined;

scope.run(() => {
  health = useWorker({ createWorker: () => new Worker('/health.worker.js'), name: 'health' });
});

scope.stop(); // runs `stop()`: listeners removed, pending response timers cancelled
```

`onScopeDispose` registers on whichever effect scope is active: a component's own scope during
`setup()`, or the one created here. That is what makes the composable testable without mounting it.

> **Source note.** The two hooks fail differently, and only one failure is visible in development.
> `onScopeDispose` outside any scope warns `onScopeDispose() is called when there is no active
> effect scope to be associated with.` `onUnmounted` outside a component instance warns
> `onUnmounted is called when there is no active component instance to be associated with. Lifecycle
> injection APIs can only be used during execution of setup().` A production build compiles both
> warnings out and the `onUnmounted` registration **never happens**: the worker stays attached, its
> `error` listener stays registered, and a pending `expectResponse()` timer still fires. A
> component's scope, by contrast, is stopped during unmount, after the `beforeUnmount` hooks and
> before the queued `unmounted` hooks — slightly earlier than `onUnmounted(stop)` would run, which
> is the order `terminate()` wants.

### `shallowRef<Worker | null>`, and the call that is not guarded

`shallowRef` is the right ref for a `Worker`: the value is an opaque host object, and deep
reactivity would proxy it for nothing. Passing a possibly-`null` worker is safe, because
`attachWorker(worker.value, { name: 'health' })` is inert on a value with no `addEventListener`: no
listeners, no throw. The same holds for `undefined`, a number or a hostile object. Safe is not the
same as useful, though — an attachment built from `null` listens to nothing, forever, which is why
`useWorker` attaches inside `start()`, after `worker.value` has been assigned.

> **Source note.** Inert describes the two listeners, not the timeout. `expectResponse()` checks
> only whether the attachment was detached and whether `responseTimeoutMs` is set, so on an
> attachment whose worker was `null` it still starts the timer and reports a worker that "did not
> respond" — a record about a worker that never existed. Call it after a successful `start()`,
> ideally at the `postMessage` that began the wait, as the component above does.

## Dynamic imports: `withChunkCapture` in the loader

The core already recognises an **uncaught** dynamic-import failure (`errors.captureChunkErrors`
defaults to `true`) and listens for Vite's `vite:preloadError` event. What neither can know is
*which screen* the user was trying to reach, because that fact exists only where you write the
`import()`. A Vue app does that in two places.

```ts
// src/components/async-panels.ts
import { defineAsyncComponent } from 'vue';
import { withChunkCapture } from '@codewithrajat/rm-logvault';
import LoadFailed from './LoadFailed.vue';

export const OrdersPanel = defineAsyncComponent({
  // The screen's name is known here and nowhere else.
  loader: withChunkCapture('OrdersPanel', () => import('./OrdersPanel.vue')),
  errorComponent: LoadFailed,
  delay: 200,
});
```

Vue treats a function argument as `{ loader: source }`, so passing the wrapped loader directly
builds the same component; the object form is for `errorComponent`, `delay` or `timeout` as well.
The same loader on a route:

```ts
// src/router/index.ts
import { createRouter, createWebHistory } from 'vue-router';
import { withChunkCapture } from '@codewithrajat/rm-logvault';

export const router = createRouter({
  history: createWebHistory(),
  routes: [
    {
      path: '/orders/:id',
      component: withChunkCapture('/orders/:id', () => import('../pages/OrderDetail.vue')),
    },
  ],
});
```

Both calls are identical in shape: the helper returns a function with the loader's own signature, so
you replace the `import()` and change nothing else. The third argument chooses the label:

| Situation | Call | Record |
| --- | --- | --- |
| A lazy panel | `withChunkCapture('OrdersPanel', …)` | `source: 'chunk'`, `handled: false` |
| A lazy route | `…, { source: 'router', handled: false })` | `source: 'router'` |
| You never catch it | Nothing | `source: 'chunk'` from the global handler, no `route` tag |

The second row needs its `handled: false`: `'router'` is not an unhandled source, so leaving it out
would flip the verdict to `true`. The helper is deliberately **not** gated on
`errors.captureChunkErrors` either — that option decides what the library's *own* global handlers
do, while calling this function is an explicit request.

## What the chained `errorHandler` does to a chunk record

This is the genuinely Vue-specific part. A failed `defineAsyncComponent` load is reported by two
paths that agree about nothing except the error object:

1. `withChunkCapture` catches the rejection first: `source: 'chunk'`,
   `tags.route: 'OrdersPanel'`, `severity: 'fatal'`, `handled: false`.
2. It re-throws the rejection unchanged. Vue's async-component wrapper catches it and routes it
   into `handleError`, which calls the `app.config.errorHandler` the plugin chained.
3. The adapter calls `captureError(sameError, { source: 'vue', extra: { vueInfo } })`. Deduplication
   is by object identity, so this is **not** a second row — it enriches the first call's record.

| Field | After both captures | Why |
| --- | --- | --- |
| `occurrenceCount` | `1` | A repeat contributes context, not an occurrence. |
| `source` | `'chunk'` | The first call stated a source, so `'vue'` does not replace it. |
| `tags.route` | `'OrdersPanel'` | Nothing in the adapter writes `route`. |
| `extra.vueInfo` | `'async component loader'` | Merged in beside your own `extra`. |
| `handled` | `false` | Not a patchable field: the first verdict stands. |

That last row is the point: the chunk failure stays in the unhandled set your triage filters on,
whatever Vue's handler captures afterwards. The full rule is in
[duplicates and floods](../../vanilla/more-advanced/08-dedupe-throttling-and-testing.md), and its
Vue half is [the next page](./08-dedupe-throttling-and-testing.md).

> **Source note.** `extra.vueInfo` reads `'async component loader'`, `'mounted hook'`,
> `'render function'` and so on **in development only**. Vue builds that string behind
> `process.env.NODE_ENV !== 'production'`; a production build passes
> `https://vuejs.org/error-reference/#runtime-13` instead, so a production record's `vueInfo` is
> a reference link rather than a hook name.

### An `onErrorCaptured` hook that stops the chain

`onErrorCaptured` runs **before** `app.config.errorHandler`, and returning `false` stops Vue's
propagation there:

```ts
// In a parent component's <script setup>. `captureError` is your telemetry facade.
import { onErrorCaptured } from 'vue';

onErrorCaptured((error) => {
  // `handled: false` is explicit: `'vue'` is not an unhandled source.
  captureError(error, { source: 'vue', tags: { boundary: 'OrderDetail' }, handled: false });
  return false; // Vue stops here: the chained errorHandler never runs
});
```

The record is still written, by your hook — but the adapter never sees the error, so there is no
`extra.vueInfo` on it and no enrichment from it. This is the one Vue path where `handled` is your
call rather than a derived one.

### Vue's own `timeout` is not a chunk failure

`defineAsyncComponent({ loader, timeout: 15_000 })` produces a different record again. Vue generates
`Async component timed out after 15000ms.` itself and routes it through the same handler with
`source: 'vue'`, the default `severity: 'error'` and `handled: true`. `withChunkCapture` never saw
it: the loader did not reject, it simply never settled. If a slow screen matters as much as a
broken one, that is the record to alert on, and its message carries the number you configured.

## Framework notes for Vue

- **Declare the async component at module scope.** `defineAsyncComponent` returns a component
  definition, so calling it inside `setup()` creates one per instance, each with its own loading
  state. The module cache makes the repeat `import()` cheap, which is why this is easy to miss.
- **One attachment per worker.** Each call adds two listeners, and `name` is the only thing that
  tells two workers apart in a report.
- **Everything a composable starts is cleaned up in `onScopeDispose`** — the worker attachment here,
  and the polling interval on the [next page](./08-dedupe-throttling-and-testing.md).

## See also

- [worker and dynamic-import failures](../../vanilla/more-advanced/07-workers-and-dynamic-imports.md)
  — the option tables, the three `op` values, the silence timeout, and what is never read.
- [duplicates, polling failures and non-`Error` throws](./08-dedupe-throttling-and-testing.md)
  — the enrichment rule from this page in full, plus `warnHandler` and a Vitest suite.
- [what arrives at your collector](../advanced/02-what-arrives-at-the-collector.md)
- [docs/API.md](../../../docs/API.md#codewithrajatrm-logvaultworker) — every option, tag and derived
  field for `attachWorker`.
