# Capture recipes — the four ways an error gets recorded (Angular)

**Problem it solves:** you have copied the integration from [basic](./README.md), and now you want to
*throw something and watch it land*. Which function do you reach for, when, and what differs between
them? These are the four recipes, and every one of them is copy-pasteable into a fresh standalone
Angular app.

**What you will learn:**

- The four ways to cause a capture, side by side.
- `captureError()` versus `withErrorCapture()` — the difference is one re-throw.
- Why an error recorded twice is still one record.
- Why your log line may not be stored even though it printed.

## Start with the integration, then add a component

Everything below assumes the two-call setup from [basic](./README.md): `initTelemetry()` at the top of
`src/main.ts` — **before** `bootstrapApplication` — and `provideTelemetryErrorHandler()` in the
`providers` array. Then one component is enough to try all four recipes:

```ts
// src/app/recipes.component.ts
import { Component } from '@angular/core';
import { captureError, logger, withErrorCapture } from '@codewithrajat/rm-logvault';

@Component({
  selector: 'app-recipes',
  template: `
    <button type="button" (click)="recipeOne()">1. Just throw</button>
    <button type="button" (click)="recipeTwo()">2. Throw with tags</button>
    <button type="button" (click)="recipeThree()">3. Report explicitly</button>
    <button type="button" (click)="recipeFour()">4. A real TypeError</button>
  `,
})
export class RecipesComponent {
  public recipeOne(): void {
    throw new Error('[checkout] the cart total was missing');
  }
  // …the other three methods are below.
}
```

Standalone is the default in Angular 19+, so the component does not declare `standalone: true`, and
the class needs no `imports` array because plain `(click)` bindings are enough.

## The four recipes, side by side

| Recipe | What you write | Does it throw? | What the record says |
| --- | --- | --- | --- |
| 1. Just throw | `throw new Error('…')` in a `(click)` method | Yes | `source: 'angular'` — Angular's `ErrorHandler` caught it |
| 2. Throw with tags | `withErrorCapture(() => { throw … }, { tags })` | Yes | `source: 'event-handler'`, plus your tags |
| 3. Report explicitly | `captureError(error, ctx)` | **No** | Whatever you passed in `ctx` |
| 4. A real failure | calling code that crashes | Yes | `source: 'angular'` inside Angular, `name: 'TypeError'` |

Recipe 1 and recipe 4 are the same mechanism: **you do not have to do anything**. If the failure
reaches Angular — or the browser — the library already has it.

## Recipe 1 — just throw

```ts
public recipeOne(): void {
  throw new Error('[checkout] the cart total was missing');
}
```

That is the whole thing. This is the recipe to remember, because it means the common case needs no
integration work at all: a bug in your code is a bug the library sees.

Now the part that is specific to Angular:

> **Source note.** Angular routes a throw from a template event handler, a lifecycle hook or a
> subscription to its own `ErrorHandler`, and the adapter has replaced that handler — so the record is
> labelled `source: 'angular'` and folded together with the provider's `context`. A throw **outside**
> Angular, in a raw `addEventListener` callback or a `setTimeout`, never reaches the handler; it lands
> on the library's chained `window.onerror` and is labelled `source: 'window'`. Same crash, two labels,
> and the label is what tells you which path saw it.

## Recipe 2 — throw with your own context

Use this when the automatic record would be true but unhelpful. "Something threw in an Angular event
handler" is not an answer; "something threw in the checkout submit for order 8123" is.

```ts
public recipeTwo(): void {
  withErrorCapture(
    () => {
      throw new Error('[checkout] order 8123 could not be submitted');
    },
    { tags: { flow: 'checkout', step: 'submit' } },
  );
}
```

`withErrorCapture(handler, context)` runs `handler` **immediately**, records anything it throws, and
then **re-throws it**. Three consequences worth internalising:

- It is not a decorator, and it is not a wrapper for a method reference. The call goes inside the
  component method, exactly as above. A template expression is evaluated by change detection, so a
  capture call placed there would run at the wrong time.
- Your application's error handling is unchanged. If you had a `try/catch` around it, that `catch`
  still runs — and Angular's `ErrorHandler` still receives the re-thrown error afterwards.
- Your existing catch **swallowing** the error does not prevent the record: the capture happened
  before the re-throw.

The default `source` is `'event-handler'`, which is the label you want here. Override it only if you
have a better one.

### The async version

Nothing special is required — a rejected promise is recorded and then rejected with the **same** error
value, not a wrapper:

```ts
public submit(): void {
  void withErrorCapture(
    async () => {
      await fetch('/api/order', { method: 'POST' });
    },
    { tags: { flow: 'checkout' } },
  ).catch(() => {
    // The original error arrives here, already recorded.
  });
}
```

## Recipe 3 — report something explicitly

Sometimes nothing was thrown — you caught a failure, or you are reporting a state that is wrong but
not fatal. `captureError` records it and returns; it never throws.

```ts
public recipeThree(): void {
  logger.info('[checkout] running the explicit-report probe');

  captureError(new Error('[checkout] the totals panel and the cart disagree'), {
    tags: { flow: 'checkout', probe: 'explicit' },
    extra: { cartId: 'c_8123', expected: 42, actual: 41 },
    handled: true,
  });
}
```

`captureError` is synchronous and never throws, so it is safe inside a `catch` block. On a real
bootstrap failure the call is the same, with `source: 'manual'` — see [basic](./README.md).

| Field | Use it for | Watch out for |
| --- | --- | --- |
| `tags` | Low-cardinality grouping — a flow, a step, a release. | Values are strings. Putting an order id here makes one group per order. |
| `extra` | Values you want beside the stack. | Sanitized, not magic — never put a token in it. |
| `handled: true` | You caught it and the user is fine. | Omit it when the app actually broke; the default is `false`. |
| `severity` | `'fatal' \| 'error' \| 'warning' \| 'info'`. | The default `'error'` is usually right. |
| `source` | The label that says which path saw the failure. | Use `'manual'` when you report by hand — `'angular'` would misreport the origin. |

## Recipe 4 — a real TypeError

The most realistic recipe is the one with no library call in it at all: something in your code is
`undefined` and the browser is the one that notices.

```ts
public recipeFour(): void {
  const totals: { readonly length: number } | undefined = undefined;

  // A genuine `TypeError: Cannot read properties of undefined (reading 'length')`.
  // Clicked from the template, this reaches Angular's ErrorHandler: `source: 'angular'`,
  // `name: 'TypeError'` — nothing here mentions the library.
  console.log(totals.length);
}
```

Two things to know about this shape of failure:

- **Reading a property off `undefined` throws; optional chaining does not.** `totals?.length` is safe
  and captures nothing. Use `totals.length` to reproduce the crash, and notice how small the difference
  is — this is why the automatic path matters more than any explicit call.
- **`window.URL` is not undefined in a browser.** If your probe reads a property off `window.URL`, you
  get `undefined` rather than a `TypeError`, and there is nothing to capture. Probe a name that is
  genuinely absent when you want to prove the crash path works.

A `strict` Angular build flags `totals.length` in the class body as well, which is
[the type note from basic](./README.md#an-angular-specific-type-note) in miniature: `tsc` catches the
shapes it can see, and the runtime path exists for the ones it cannot.

## Why two captures are one record

Recipe 2 throws *after* recording, and Angular's `ErrorHandler` then receives the same re-thrown value
— so the same failure reaches the pipeline twice: once from `withErrorCapture` with your tags, and once
from the adapter with `source: 'angular'`. That is expected, and it is why `withErrorCapture` is about
**attaching context**, not about capturing something that would otherwise be missed.

The library fingerprints and deduplicates these, collapsing the same `Error` object arriving through
two handlers into one record rather than two rows and a puzzle:

```text
withErrorCapture records it     ─┐
                                 ├─▶  one record, occurrenceCount: 1
Angular's ErrorHandler sees it  ─┘
```

> **Source note.** Aggregation is *counting*, not merging. A second record with the same fingerprint
> increments `occurrenceCount` and widens `[firstSeen, lastSeen]`, and **every other field comes from the
> row that was stored first**. In this recipe `withErrorCapture` runs before the re-throw reaches
> `ErrorHandler`, so it is its context that sticks — but do not rely on winning that race. If an
> identical failure is already in the store as a `pending` row with different context, the arrival you
> care about contributes only a count. When context has to be on the record, pass it to `captureError` at
> the point where the record is created, or put it in the provider's `context` so every record Angular
> routes gets it.

## Feeling the difference between stored and printed

The most common "it is not working" report at this tier is a log line that printed and never appeared
in a report. The two are separate decisions, and the default split is:

| Call | Printed to DevTools | Stored in the vault |
| --- | --- | --- |
| `logger.debug(…)` / `logger.info(…)` | **No** at the effective default console level | **No** below the default persist level |
| `logger.warn(…)` / `logger.error(…)` | Yes | Yes |
| `captureError(…)` | No | Yes |

So at this tier `logger.info(…)` is close to a no-op — it is not a probe that proves anything. Use
`logger.warn(…)` to prove the log path end to end, or raise both levels, which is the whole subject of
[the levels page](../config/03-levels-and-thresholds.md).

## Try it yourself

1. Put `initTelemetry({ appName: 'recipes' })` at the top of `src/main.ts`, **before**
   `bootstrapApplication`, and add `provideTelemetryErrorHandler()` to its `providers`.
2. Render `<app-recipes />` and click each of the four buttons.
3. Press <kbd>Ctrl</kbd>+<kbd>Shift</kbd>+<kbd>Alt</kbd>+<kbd>D</kbd> to download the report, and open
   the recipes you just triggered.

Recipe 3 should be in the report, recipe 2 should carry your tags, and recipe 1 should say
`source: 'angular'`. If recipe 1 is missing, the `initTelemetry` call is not running before the click —
check that it is at the top of `src/main.ts` and not inside a component or an `APP_INITIALIZER`.

## Related

- [basic](./README.md) — the integration this page adds buttons to.
- [the levels page](../config/03-levels-and-thresholds.md) — why `logger.info` did not appear.
- [what arrives at your collector](../advanced/02-what-arrives-at-the-collector.md) — the record these
  four recipes produce, once it is uploaded.
- [the Angular adapter](../more-advanced/01-framework-adapter.md) — the factory provider,
  `getPreviousErrorHandler`, and writing your own `ErrorHandler`.
