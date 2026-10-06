# Capture recipes — the four ways an error gets recorded

**Problem it solves:** you have copied the integration from [basic](./README.md), and now you want to
*throw something and watch it land*. Which function do you reach for, when, and what differs between
them? These are the four recipes, and every one of them is copy-paste able into a fresh Vue 3 app.

**What you will learn:**

- The four ways to cause a capture, side by side.
- `captureError()` versus `withErrorCapture()` — the difference is one re-throw.
- Why an error recorded twice is still one record.
- Why your log line may not be stored even though it printed.
- Which Vue hook labels a record `source: 'vue'`.

## Start with the integration, then add a component

Everything below assumes the three-line setup from [basic](./README.md) — `initTelemetry()` at module top
level, `createTelemetryVuePlugin()` in `.use()`, then `mount()`. A single-file component like this is
enough to try all four recipes:

```vue
<!-- src/components/Recipes.vue -->
<script setup lang="ts">
// One function per recipe; each body is in its own section below.
function recipeOne(): void { /* 1 */ }
function recipeTwo(): void { /* 2 */ }
function recipeThree(): void { /* 3 */ }
function recipeFour(): void { /* 4 */ }
</script>

<template>
  <div>
    <button type="button" @click="recipeOne">1. Just throw</button>
    <button type="button" @click="recipeTwo">2. Throw with tags</button>
    <button type="button" @click="recipeThree">3. Report explicitly</button>
    <button type="button" @click="recipeFour">4. A real TypeError</button>
  </div>
</template>
```

Each recipe below is the body of one of those four functions, plus the import it needs inside
`<script setup>`.

## The four recipes, side by side

| Recipe | What you write | Does it throw? | What the record says |
| --- | --- | --- | --- |
| 1. Just throw | `throw new Error('…')` inside a `@click` handler | Yes | `source: 'vue'` — Vue's `errorHandler` caught it |
| 2. Throw with tags | `withErrorCapture(() => { throw … }, { tags })` | Yes | `source: 'event-handler'`, plus your tags |
| 3. Report explicitly | `captureError(error, ctx)` | **No** | Whatever you passed in `ctx` |
| 4. A real failure | calling code that crashes | Yes | `source: 'vue'`, name `TypeError` |

Recipe 1 and recipe 4 are the same mechanism: **you do not have to do anything**. A synchronous throw
inside a handler Vue dispatched arrives at `app.config.errorHandler`, and the plugin has already chained
that hook.

## Recipe 1 — just throw

```vue
<script setup lang="ts">
function recipeOne(): void {
  throw new Error('[checkout] the cart total was missing');
}
</script>
```

That is the whole thing. This is the recipe to remember, because it means the common case needs no
integration work at all: a bug in your code is a bug the library sees.

The Vue part worth knowing is *which* hook sees it:

> **Source note.** Vue wraps every handler it dispatches, so an event-handler throw reaches
> `app.config.errorHandler` rather than `window.onerror` first — and that hook is exactly what the plugin
> wrapped. The record is therefore labelled `source: 'vue'`, with Vue's lifecycle hook name in
> `extra.vueInfo` when Vue supplies it. The adapter calls your own handler afterwards, so installing
> telemetry does not take your existing error reporting away.

## Recipe 2 — throw with your own context

Use this when the automatic record would be true but unhelpful. "Something threw in an event handler"
is not an answer; "something threw in the checkout submit for order 8123" is.

```vue
<script setup lang="ts">
import { withErrorCapture } from '@codewithrajat/rm-logvault';

function recipeTwo(): void {
  withErrorCapture(
    () => {
      throw new Error('[checkout] order 8123 could not be submitted');
    },
    { tags: { flow: 'checkout', step: 'submit' } },
  );
}
</script>
```

`withErrorCapture(handler, context)` runs `handler` immediately, records anything it throws, and then
**re-throws it**. Two consequences worth internalising:

- It is not a wrapper for the function you bind to `@click`. Writing it in the template —
  `@click="withErrorCapture(submit)"` — evaluates it during render, so you would capture a render-time
  throw instead of a click-time one. Put the call *inside* your function, as above.
- Your application's error handling is unchanged. If you had a `try/catch` around it, that `catch`
  still runs.

The default `source` is `'event-handler'`, which is the label you want here. Override it only if you
have a better one.

### The async version

```vue
<script setup lang="ts">
import { withErrorCapture } from '@codewithrajat/rm-logvault';

function submit(): void {
  void withErrorCapture(
    async () => {
      await fetch('/api/order', { method: 'POST' });
    },
    { tags: { flow: 'checkout' } },
  ).catch(() => {
    // The original error arrives here, already recorded.
  });
}
</script>
```

Nothing special is required — a rejected promise is recorded and then rejected with the **same** error
value, not a wrapper.

## Recipe 3 — report something explicitly

Sometimes nothing was thrown — you caught a failure, or you are reporting a state that is wrong but not
fatal. `captureError` records it and returns; it never throws, and it is synchronous.

```vue
<script setup lang="ts">
import { captureError, logger } from '@codewithrajat/rm-logvault';

function recipeThree(): void {
  logger.info('[checkout] running the explicit-report probe');

  captureError(new Error('[checkout] the totals panel and the cart disagree'), {
    tags: { flow: 'checkout', probe: 'explicit' },
    extra: { cartId: 'c_8123', expected: 42, actual: 41 },
    handled: true,
  });
}
</script>
```

| Field | Use it for | Watch out for |
| --- | --- | --- |
| `tags` | Low-cardinality grouping — a flow, a step, a release. | Values are strings. Putting an order id here makes one group per order. |
| `extra` | Values you want beside the stack. | Sanitized, not magic — never put a token in it. |
| `handled: true` | You caught it and the user is fine. | Omit it when the app actually broke; the default is `false`. |
| `severity` | `'fatal' \| 'error' \| 'warning' \| 'info'`. | The automatic value is usually right; the default is `'error'`. |

## Recipe 4 — a real TypeError

The most realistic recipe is the one with no library call in it at all: something in your code is
`undefined` and the browser is the one that notices.

```vue
<script setup lang="ts">
function recipeFour(): void {
  const totals: { readonly length: number } | undefined = undefined;

  // A genuine `TypeError: Cannot read properties of undefined (reading 'length')`.
  // `source: 'vue'`, `name: 'TypeError'` — nothing here mentions the library.
  console.log(totals.length);
}
</script>
```

Two things to know about this shape of failure:

- **Reading a property off `undefined` throws; optional chaining does not.** `totals?.length` above is
  safe. Use `totals.length` to reproduce the crash, and notice how small the difference is — this is
  why the automatic path matters more than any explicit call.
- **`window.URL` is not undefined in a browser.** If your probe reads a property off `window.URL`, you
  get `undefined` rather than a `TypeError`, and there is nothing to capture. Probe a name that is
  genuinely absent when you want to prove the crash path works.

## Why two captures are one record

Recipe 2 throws *after* recording, and Vue's `errorHandler` then reports the same failure — so it
reaches the pipeline twice: once from `withErrorCapture` with your tags, and once from
`app.config.errorHandler`. That is expected, and it is why `withErrorCapture` is about **attaching
context**, not about capturing something that would otherwise be missed.

The library fingerprints and deduplicates these on identity, so you get one row rather than two:

```text
withErrorCapture records it  ─┐
                              ├─▶  one record, occurrenceCount: 1
Vue's errorHandler sees it  ──┘
```

> **Source note.** Aggregation is *counting*, not merging. A second record with the same fingerprint
> increments `occurrenceCount` and widens `[firstSeen, lastSeen]`, and **every other field comes from the
> row that was stored first**. In this recipe `withErrorCapture` runs before the re-throw reaches
> `app.config.errorHandler`, so it is its context that sticks — but do not rely on winning that race. If
> the same failure is already sitting in the store as a `pending` row with different context, the arrival
> you care about contributes only a count. When context has to be on the record, pass it to `captureError`
> at the point where the record is created, or put it in the plugin's `context` so every Vue-routed record
> gets it.

If you would rather record and **not** re-throw — because a re-thrown handler error produces a DevTools
console error on every click — catch it yourself and call recipe 3 instead. The adapter's chaining
behaviour and what it cannot see are in
[the Vue adapter](../more-advanced/01-framework-adapter.md).

## Feeling the difference between stored and printed

The most common "it is not working" report at this tier is a log line that printed and never appeared in
a report. The two are separate decisions, and the default split is:

| Call | Printed to DevTools | Stored in the vault |
| --- | --- | --- |
| `logger.debug(…)` / `logger.info(…)` | **No** at the default console level | **No** below the default persist level |
| `logger.warn(…)` / `logger.error(…)` | Yes | Yes |
| `captureError(…)` | No | Yes |

So at this tier `logger.info(…)` is close to a no-op — it is not a probe that proves anything. Use
`logger.warn(…)` to prove the log path end to end, or raise both levels, which is the whole subject of
[the levels page](../config/03-levels-and-thresholds.md).

## Try it yourself

1. Put `initTelemetry({ appName: 'recipes' })` at the top of `src/main.ts`, before `createApp`.
2. Install the plugin with `.use(createTelemetryVuePlugin())` and then `mount('#app')`.
3. Click each of the four buttons.
4. Press <kbd>Ctrl</kbd>+<kbd>Shift</kbd>+<kbd>Alt</kbd>+<kbd>D</kbd> to download the report, and open
   the recipes you just triggered.

Recipe 3 should be in the report and recipe 2 should carry your tags. If recipe 1 is missing, the
`initTelemetry` call is not running before the click — check that it is at module top level and not
inside a component.

## Related

- [basic](./README.md) — the integration this page adds buttons to.
- [the levels page](../config/03-levels-and-thresholds.md) — why `logger.info` did not appear.
- [the Vue adapter](../more-advanced/01-framework-adapter.md) — chaining, `captureWarnings`, and what
  the adapter cannot see.
