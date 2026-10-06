# Capture recipes — the four ways an error gets recorded

**Problem it solves:** you copied the provider from [basic](./README.md), and now you want to *throw
something and watch it land*. In the App Router that means a `'use client'` module, because a click
handler only exists in the browser. Which function do you reach for, when, and what differs between them?
These are the four recipes, and every one of them is copy-pasteable into a fresh Next.js app.

**What you will learn:**

- The four ways to cause a capture, side by side.
- `captureError()` versus `withErrorCapture()` — the difference is one re-throw.
- Why an error recorded twice is still one record.
- Why your log line may not be stored even though it printed.

## Start with the integration, then add a client component

Everything below assumes the provider from [basic](./README.md): `initTelemetry()` inside a `useEffect`
in a `'use client'` module, with `destroyTelemetry` as the cleanup. The recipes need `'use client'` too,
and not by convention — `onClick` only exists in the browser, so the module that owns the four buttons is
a client component by definition:

```tsx
// app/recipes/page.tsx
'use client';

import type { ReactElement } from 'react';
import { captureError, logger, withErrorCapture } from '@codewithrajat/rm-logvault';

export default function RecipesPage(): ReactElement {
  return (
    <div>
      <button type="button" onClick={recipeOne}>1. Just throw</button>
      <button type="button" onClick={recipeTwo}>2. Throw with tags</button>
      <button type="button" onClick={recipeThree}>3. Report explicitly</button>
      <button type="button" onClick={recipeFour}>4. A real TypeError</button>
    </div>
  );
}
```

The four handlers are the four sections below, in file order, so the page is one paste away.

## The four recipes, side by side

| Recipe | What you write | Does it throw? | What the record says |
| --- | --- | --- | --- |
| 1. Just throw | `throw new Error('…')` | Yes | `source: 'window'` — the global handler caught it |
| 2. Throw with tags | `withErrorCapture(() => { throw … }, { tags })` | Yes | `source: 'event-handler'`, plus your tags |
| 3. Report explicitly | `captureError(error, ctx)` | **No** | Whatever you passed in `ctx` |
| 4. A real failure | calling code that crashes | Yes | `source: 'window'`, name `TypeError` |

Recipe 1 and recipe 4 are the same mechanism: **you do not have to do anything**. If the failure reaches
the browser, the library already has it.

## Recipe 1 — just throw

```tsx
const recipeOne = (): void => {
  throw new Error('[checkout] the cart total was missing');
};
```

That is the whole thing. This is the recipe to remember, because it means the common case needs no
integration work at all: a bug in your code is a bug the library sees.

Now the part that surprises people on React 19, and it applies unchanged inside a client component:

> **Source note.** An event handler does **not** escape React untouched. React wraps every listener it
> dispatches and re-reports a failure through the platform's `reportError()`, which is what
> `window.onerror` and an `ErrorEvent` listener observe. So the record is still produced, and it is still
> labelled `source: 'window'` — but React saw it first. The practical advice is unchanged (you need
> nothing extra, and `onUncaughtError` does not fire for it); the *reason* is React re-reporting rather
> than React being bypassed.

One App Router consequence: this works because the handler runs in the browser. The same `throw` during a
**server** render is not recorded at all — there is no browser, no IndexedDB and no client vault in that
process. See [the server boundary](../more-advanced/01-framework-adapter.md).

## Recipe 2 — throw with your own context

Use this when the automatic record would be true but unhelpful. "Something threw in an event handler" is
not an answer; "something threw in the checkout submit for order 8123" is.

```tsx
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

- It is not a wrapper for the function you pass to `onClick`. `onClick={withErrorCapture(submit)}` would
  call `submit` during render and capture a render-time throw instead of a click-time one. Put the call
  *inside* your handler, as above.
- Your application's error handling is unchanged. If you had a `try/catch` around it, that `catch` still
  runs.

The default `source` is `'event-handler'`, which is the label you want here. Override it only if you have
a better one.

### The async version

Nothing special is required — a rejected promise is recorded and then rejected with the **same** error
value, not a wrapper:

```tsx
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

Sometimes nothing was thrown — you caught a failure, or you are reporting a state that is wrong but not
fatal. `captureError` records it and returns; it never throws.

```tsx
const recipeThree = (): void => {
  // At the default levels this line is neither printed nor stored — see the table further down.
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

`captureError` is safe to call from anywhere, but its record only exists where the store does. On the
server there is no vault to write to, so a server-side `captureError` is never stored — the recipe
belongs in a client component.

## Recipe 4 — a real TypeError

The most realistic recipe is the one with no library call in it at all: something in your code is
`undefined` and the browser is the one that notices.

```tsx
const recipeFour = (): void => {
  const totals: { readonly length: number } | undefined = undefined;

  // A genuine `TypeError: Cannot read properties of undefined (reading 'length')`.
  // `source: 'window'`, `name: 'TypeError'` — nothing here mentions the library.
  console.log(totals.length);
};
```

Two things to know about this shape of failure:

- **Optional chaining does not throw, so it captures nothing.** `totals?.length` above would print
  `undefined` and produce no record at all; `totals.length` is what produces the `TypeError`. The
  difference is one character, which is why the automatic path matters more than any explicit call.
- **This has to happen in a client component to be recorded.** The identical code in a server component
  throws on the server, where there is no browser, no IndexedDB and no client vault — Next's own error
  overlay in development and your server logs in production are the right tools there.

## Why two captures are one record

Recipe 2 throws *after* recording, and the throw is then re-reported by React's dispatch — so the same
failure reaches the pipeline twice: once from `withErrorCapture` with your tags, and once from the global
error event. That is expected, and it is why `withErrorCapture` is about **attaching context**, not about
capturing something that would otherwise be missed.

Repeated occurrences of the same failure do not append rows. The library fingerprints them, so the second
arrival increments `occurrenceCount` and widens the `[firstSeen, lastSeen]` window instead of adding a
row:

```text
withErrorCapture records it  ─┐
                              ├─▶  one row, with occurrenceCount reflecting both arrivals
the global handler sees it  ──┘
```

Aggregation only touches `pending` rows, so a record that is mid-upload is never rewritten underneath the
outbox.

If you would rather record and **not** re-throw — a re-thrown handler error produces a DevTools console
error on every click — use `useErrorCapture()` from `@codewithrajat/rm-logvault/react`. It is part of the
React adapter, so the client-only rule applies to it exactly as it does to `initTelemetry`.

## Feeling the difference between stored and printed

The most common "it is not working" report at this tier is a log line that printed and never appeared in
a report. The two are separate decisions, and the defaults split them:

| Call | Printed to DevTools | Stored in the vault |
| --- | --- | --- |
| `logger.debug(…)` / `logger.info(…)` | **No** at the default console level | **No** below the default persist level |
| `logger.warn(…)` / `logger.error(…)` | Yes | Yes |
| `captureError(…)` | No | Yes |

So at this tier `logger.info(…)` is close to a no-op — it is not a probe that proves anything. Use
`logger.warn(…)` to prove the log path end to end, or raise both levels, which is the whole subject of
[the levels page](../config/03-levels-and-thresholds.md).

## Try it yourself

1. Mount the provider from [basic](./README.md) in `app/layout.tsx`, then open `/recipes`.
2. Click each of the four buttons in turn.
3. Press <kbd>Ctrl</kbd>+<kbd>Shift</kbd>+<kbd>Alt</kbd>+<kbd>D</kbd> to download the report, and open
   the recipes you just triggered.

Recipe 3 should be in the report, and recipe 2 should be **one** record rather than two. If recipe 1 is
missing, the provider's effect has not run yet — check that `initTelemetry` is inside the `useEffect` and
not at module top level, where it would run during server rendering instead.

## Related

- [basic](./README.md) — the provider this page adds buttons to.
- [the levels page](../config/03-levels-and-thresholds.md) — why `logger.info` did not appear.
- [the server boundary](../more-advanced/01-framework-adapter.md) — what a server-side call really does,
  and why nothing crosses into the browser's vault.
- [the recipes and deciding](../more-advanced/03-recipes-and-deciding.md) — the same four recipes placed
  in a decision table.
