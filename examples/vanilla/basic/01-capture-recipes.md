# Capture recipes — the four ways an error gets recorded

**Problem it solves:** you have copied the integration from [basic](./README.md), and now you want to
*throw something and watch it land*. Which function do you reach for, when, and what differs between
them? These are the four recipes, and every one of them is copy-paste able into a fresh vanilla
TypeScript app.

**What you will learn:**

- The four ways to cause a capture, side by side.
- `captureError()` versus `withErrorCapture()` — the difference is one re-throw.
- Why an error recorded twice is still one record.
- Why your log line may not be stored even though it printed.

## Start with the integration, then add four buttons

Everything below assumes the one-call setup from [basic](./README.md) — `initTelemetry()` as the first
statement of your entry module. Then a page like this is enough to try all four recipes:

```html
<!-- index.html -->
<button type="button" id="recipe-1">1. Just throw</button>
<button type="button" id="recipe-2">2. Throw with tags</button>
<button type="button" id="recipe-3">3. Report explicitly</button>
<button type="button" id="recipe-4">4. A real TypeError</button>
```

```ts
// src/main.ts — the first statement of the entry module
import { initTelemetry } from '@codewithrajat/rm-logvault';

initTelemetry({ appName: 'my-app' });

// …your own code, and only then the rest of the application.
render();
```

The wiring is the plain-DOM half, and it is deliberately boring — there is no root render and no
component lifecycle to hook into:

```ts
import { captureError, logger, withErrorCapture } from '@codewithrajat/rm-logvault';

document.querySelector('#recipe-1')?.addEventListener('click', recipeOne);
document.querySelector('#recipe-2')?.addEventListener('click', recipeTwo);
document.querySelector('#recipe-3')?.addEventListener('click', recipeThree);
document.querySelector('#recipe-4')?.addEventListener('click', recipeFour);
```

## The four recipes, side by side

| Recipe | What you write | Does it throw? | What the record says |
| --- | --- | --- | --- |
| 1. Just throw | `throw new Error('…')` | Yes | `source: 'window'` — the global handler caught it |
| 2. Throw with tags | `withErrorCapture(() => { throw … }, { tags })` | Yes | `source: 'event-handler'`, plus your tags |
| 3. Report explicitly | `captureError(error, ctx)` | **No** | Whatever you passed in `ctx` |
| 4. A real failure | calling code that crashes | Yes | `source: 'window'`, name `TypeError` |

Recipe 1 and recipe 4 are the same mechanism: **you do not have to do anything**. If the failure
reaches the browser, the library already has it — `window.onerror` for the synchronous throw, and
`unhandledrejection` for a rejected promise that nobody caught.

## Recipe 1 — just throw

```ts
const recipeOne = (): void => {
  throw new Error('[checkout] the cart total was missing');
};
```

That is the whole thing. This is the recipe to remember, because it means the common case needs no
integration work at all: a bug in your code is a bug the library sees.

> **Source note.** `initTelemetry` **chains** any `window.onerror` you already installed rather than
> replacing it, so an existing reporter keeps working. If your application already sends failures
> somewhere of its own, both paths run and the library does not silently take the slot.

## Recipe 2 — throw with your own context

Use this when the automatic record would be true but unhelpful. "Something threw in an event handler"
is not an answer; "something threw in the checkout submit for order 8123" is.

```ts
const recipeTwo = (): void => {
  withErrorCapture(
    () => {
      throw new Error('[checkout] order 8123 could not be submitted');
    },
    { tags: { flow: 'checkout', step: 'submit' } },
  );
};
```

`withErrorCapture(handler, context)` runs `handler` immediately, records anything it throws, and then
**re-throws it**. Two consequences worth internalising:

- It is not a wrapper for the function you hand to `addEventListener`.
  `addEventListener('click', withErrorCapture(submit))` would run `submit` while you are *wiring* the
  listener — at module top level, before anyone has clicked — and capture that wiring-time throw
  instead of a click-time one. Put the call *inside* your handler, as above.
- Your application's error handling is unchanged. If you had a `try`/`catch` around it, that `catch`
  still runs, and it catches the same error value.

The default `source` is `'event-handler'`, which is the label you want here. Override it only if you
have a better one.

### The async version

Nothing special is required — a rejected promise is recorded and then rejected with the **same** error
value, not a wrapper:

```ts
const submit = (): void => {
  void withErrorCapture(
    async () => {
      await fetch('/api/order', { method: 'POST' });
    },
    { tags: { flow: 'checkout' } },
  ).catch(() => {
    // The original error arrives here, already recorded.
  });
};
```

## Recipe 3 — report something explicitly

Sometimes nothing was thrown — you caught a failure, or you are reporting a state that is wrong but
not fatal. `captureError` records it and returns; it never throws and it is synchronous.

```ts
const recipeThree = (): void => {
  logger.info('[checkout] running the explicit-report probe');

  captureError(new Error('[checkout] the totals panel and the cart disagree'), {
    tags: { flow: 'checkout', probe: 'explicit' },
    extra: { cartId: 'c_8123', expected: 42, actual: 41 },
    handled: true,
  });
};
```

| Field | Use it for | Watch out for |
| --- | --- | --- |
| `tags` | Low-cardinality grouping — a flow, a step, a release. | Values are strings. Putting an order id here makes one group per order. |
| `extra` | Values you want beside the stack. | Sanitized, not magic — never put a token in it. |
| `handled: true` | You caught it and the user is fine. | Omit it when the app actually broke; the default is `false`. |
| `severity` | `'fatal' \| 'error' \| 'warning' \| 'info'`. | The automatic value is usually right. |

## Recipe 4 — a real TypeError

The most realistic recipe is the one with no library call in it at all: something in your code is
`undefined` and the browser is the one that notices.

```ts
const recipeFour = (): void => {
  const totals: { readonly length: number } | undefined = undefined;

  // A genuine `TypeError: Cannot read properties of undefined (reading 'length')`.
  // The read throws before the call happens: `source: 'window'`, `name: 'TypeError'`,
  // and nothing in the record mentions the library.
  console.log(totals.length);
};
```

Two things to know about this shape of failure:

- **Reading a property off `undefined` throws; optional chaining does not.** `totals?.length` is safe
  and produces an ordinary line of output, so it will never appear in a report. Write `totals.length`
  when you want to reproduce the crash, and notice how small the difference is — this is why the
  automatic path matters more than any explicit call.
- **The throw has to be synchronous and uncaught.** A `try`/`catch` around the read, or a `.catch()` on
  the promise that contains it, means there is nothing for the global handler to see.

## Why two captures are one record

Recipe 2 throws *after* recording, and that re-thrown error then escapes the listener — so the same
failure reaches the pipeline twice: once from `withErrorCapture` with your tags, and once from
`window.onerror`. That is expected, and it is why `withErrorCapture` is about **attaching context**,
not about capturing something that would otherwise be missed.

The library fingerprints and deduplicates on identity, so you get one row rather than two:

```text
withErrorCapture records it  ─┐
                              ├─▶  one record, occurrenceCount: 1
window.onerror sees it      ──┘
```

> **Source note.** Aggregation is *counting*, not merging. A second record with the same fingerprint
> increments `occurrenceCount` and widens `[firstSeen, lastSeen]`, and **every other field comes from the
> row that was stored first**. In this recipe `withErrorCapture` runs before the re-throw reaches
> `window.onerror`, so it is its context that sticks — but do not rely on winning that race. If an
> identical failure is already in the store as a `pending` row with different context, the arrival you
> care about contributes only a count.

Repeated occurrences do not append rows: `occurrenceCount` increments and `[firstSeen, lastSeen]`
widens, so a bug that fired a thousand times is one row with a thousand in it.

If you would rather record and **not** re-throw — because a re-thrown listener error produces a
DevTools console error on every click — that is a plain `try`/`catch` around a manual `captureError`.
It is the plain-DOM equivalent of the React adapter's hook, and there is nothing to import:

```ts
document.querySelector('#pay')?.addEventListener('click', () => {
  try {
    pay();
  } catch (error) {
    captureError(error, { tags: { flow: 'checkout' } }); // recorded, and the click ends quietly
  }
});
```

## Feeling the difference between stored and printed

The most common "it is not working" report at this tier is a log line that printed and never appeared
in a report. The two are separate decisions, and the default split is:

| Call | Printed to DevTools | Stored in the vault |
| --- | --- | --- |
| `logger.debug(…)` / `logger.info(…)` | **No** at the default console level | **No** below the default persist level |
| `logger.warn(…)` / `logger.error(…)` | Yes | Yes |
| `captureError(…)` | No | Yes |

So at this tier `logger.info(…)` is close to a no-op — it is not a probe that proves anything. Use
`logger.warn(…)` to prove the log path end to end, or raise both levels, which is the whole subject of
[the levels page](../config/03-levels-and-thresholds.md).

## Try it yourself

1. Put `initTelemetry({ appName: 'recipes' })` as the first statement of your entry module, before
   anything else runs.
2. Click each of the four buttons.
3. Press <kbd>Ctrl</kbd>+<kbd>Shift</kbd>+<kbd>Alt</kbd>+<kbd>D</kbd> to download the report, and open
   the recipes you just triggered.

Recipe 3 should be in the report and recipe 2 should carry your tags. If recipe 1 is missing, the
`initTelemetry` call is not running before the click — check that it is the first statement of the
entry module and not inside a `DOMContentLoaded` listener or an `async` IIFE.

The same four recipes are written for React in
[the React capture recipes](../../react/basic/01-capture-recipes.md), where recipe 1 has an extra
wrinkle: React re-reports a listener failure through the platform before the global handler sees it.

## Related

- [basic](./README.md) — the integration this page adds buttons to.
- [the levels page](../config/03-levels-and-thresholds.md) — why `logger.info` did not appear.
- [recipes and deciding](../more-advanced/03-recipes-and-deciding.md) — the browser's error paths, and
  how to assert any of this in a test instead of clicking buttons and squinting at a report.
