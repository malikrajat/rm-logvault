# Duplicates, throttling and testing in a React app

**Problem it solves:** React gives you more than one place to notice the same failure, and the library
treats the second place as *added knowledge* rather than a second occurrence.

A `catch` that calls `logger.error(...)` writes nothing to the errors store, so a feature can be broken
with a clean-looking report. A record captured twice — by `reactRootErrorHandlers()` and by your own
`catch` — keeps the first capture's verdict even when the second one knew more. And a poll that fails
spends the whole error budget on a failure that is already in the report, so the new failures are the
ones that go missing.

**What you will learn:**

- Why `logger.error(...)` never creates an error record, and what a boundary or a `catch` must call.
- What a second capture of the same `Error` can change, and which fields it cannot.
- How `reactRootErrorHandlers()` behaves when your own `catch` already captured the error.
- `toError` at a rejection site, and when a React hook needs it.
- `errors.maxRepeatsPerMinute` in a polling `useQuery`, and the two counters that tell a throttle from
  a gap.
- Testing all of it with the three doubles the `/testing` subpath ships.

## `logger.error(...)` never captures

The log store and the error store are separate, and only one function writes error records:

```ts
try {
  await submitOrder(cart);
} catch (error) {
  // A log record in the other store. No error record is created, so triage, the
  // error report and the errors endpoint never see this line.
  logger.error('[Checkout] submit failed', error);

  // The errors store needs an explicit call. `captureError` accepts `unknown` and
  // cannot throw, so no guard is needed even inside a `catch`.
  captureError(error, { source: 'manual', tags: { flow: 'checkout' } });
}
```

The same applies to a boundary's `onError`, which is **additive**: the boundary has already recorded
the error with `source: 'react'` and the component stack, so a `logger.error` there is an
operator-facing line, not a record.

```tsx
<TelemetryErrorBoundary
  fallback={(error, reset) => <CheckoutFailed error={error} onRetry={reset} />}
  onError={(error) => {
    logger.error('[Shell] render failed', error); // a log line, not a second record
  }}
>
  <Checkout />
</TelemetryErrorBoundary>
```

Nothing is lost by this — `logger.error` does reach the logs store, because `logs.level` defaults to
`'warn'` and `error` is above it. It is filed where an operator looks, not where triage looks. A caught
failure that is only logged leaves exactly the kind of hole in the errors store that makes a broken
feature look like an unused one.

## Two capture points, one `Error`

Deduplication is by **object identity**: the same `Error` reaching the library twice is one occurrence.
A repeat call is not discarded, though — it **enriches** the record the first call produced:

| Field | A second capture of the same `Error` |
| --- | --- |
| `tags` | merged; the second call wins on a shared key |
| `extra` | merged, shallowly |
| `severity` | replaced |
| `source` | replaced **only if the first capture passed no explicit source** |
| `message`, `stack`, `componentStack`, `category`, `handled`, `occurrenceCount` | unchanged — the first capture fixed them |

That last row is the one that bites in React, because the React paths add exactly what it holds:
component stacks. If your `catch` captures first, the boundary's `componentStack` has nowhere to go.
The chain that hits the rule most often is a `catch` that re-throws:

```ts
// Your call runs first and names no source, so the record is created with the default
// `'manual'` — and it is therefore correctable.
captureError(error, { tags: { flow: 'checkout' } });
throw error; // React 19 re-reports it; `window.onerror` captures the same object
```

The second capture passes `source: 'window'` explicitly, so it replaces `'manual'`, which was only a
default. The tag survives, because tags merge — and had the first call passed `{ source: 'manual' }`
deliberately, nothing would have replaced it.

> **Source note.** The patch changes `source` and recomputes the fingerprint, but `handled` was decided
> by the first capture and is never revisited — it is not one of the fields a patch carries. A record
> corrected from `'manual'` to `'window'` keeps `handled: true`, while every record that arrived through
> `window.onerror` in the first place is `handled: false`. Decide `handled` at the first capture, and
> read `severity` alongside it when you triage.

## What `reactRootErrorHandlers()` decides for you

Two details are worth knowing before you write a filter against these records — that is, before you
spread `reactRootErrorHandlers({ tags: { shell: 'app' } })` into `createRoot`'s options:

- **`onUncaughtError` reports a fatal error as `handled: true`.** It passes `severity: 'fatal'` and
  leaves `handled` to the source default, which is derived as `!UNHANDLED_SOURCES.has(source)` — and
  `'react'` is not in that set. A render error that escaped every boundary therefore does **not** appear
  under `handled: false`. Filter on `severity: 'fatal'` or `source: 'react'` as well.
- **The `context` argument is spread after the handlers' own fields**, so a key in it replaces a whole
  value. `reactRootErrorHandlers({ tags: { shell: 'app' } })` removes `tags.recoverable: 'true'` from
  every recoverable error, because `tags` is one value, not a merge of keys. Pass the tags you want on
  the handlers you write yourself, or pass none here.

> **Source note.** The reference table in `docs/API.md` gives `onUncaughtError`'s `handled` as
> "default (`false`)". The implementation derives it from the source, and the source it passes is
> `'react'`, which `UNHANDLED_SOURCES` does not contain — so the stored record is `handled: true`. That
> is what the built package does today; the table describes the generic default, not this path.

## `toError` at a rejection site

A hook that holds an `Error` in state, or a promise you hand to something that will re-throw it, needs a
real `Error` from a value of unknown shape:

```ts
const [error, setError] = useState<Error | null>(null);

loadOrders().catch((reason: unknown) => {
  // `reason` is whatever rejected. `toError` is the only conversion that cannot itself
  // throw, and it never stringifies a value it did not create.
  setError(toError(reason));
});
```

- **`captureError` does not need it.** The parameter is `unknown` and the normaliser runs internally, so
  `String(error)` and `JSON.stringify(error)` are never needed at a capture site.
- **It preserves identity for a real `Error`**, returning the same object — so a re-thrown or rejected
  `toError(x)` still deduplicates against every other capture of `x`.
- **A non-`Error` throw becomes a new object each time.** Two conversions of the same primitive are two
  records that storage aggregates onto one row by fingerprint, exactly as two `captureError('boom')`
  calls are. `cause` holds the original value, so nothing is lost.

## A polling component and `errors.maxRepeatsPerMinute`

TanStack Query is the common case, and it has a cache-level hook that costs one call per client:

```ts
// src/query/client.ts
import { QueryClient } from '@tanstack/react-query';
import { attachQueryClient } from '@codewithrajat/rm-logvault/react-query';

export const queryClient = new QueryClient();

// One hook per cache rather than one per observer, and TanStack calls it only after the
// retry budget is exhausted — so a retried failure is one capture, not three.
attachQueryClient(queryClient);
```

```ts
useQuery({ queryKey: ['health'], queryFn: fetchHealth, refetchInterval: 5000 });
```

| | |
| --- | --- |
| Refetches per minute at `refetchInterval: 5000` | 12 |
| Default `errors.maxRepeatsPerMinute` | 12 records per fingerprint per 60 s window |
| The thirteenth repeat in a window | refused, and it costs the global budget nothing |
| What the report shows | one row, with `occurrenceCount` counting the admitted repeats |

That is the whole design: a refused repeat never reaches the global limiter, so the token it would have
spent stays available for a *new* failure. The two counters keep the two meanings apart:

```ts
const { droppedByRepeat, droppedByRateLimit } = getTelemetryStatus();

// droppedByRepeat   — already in the report; the budget went to new failures instead.
// droppedByRateLimit — genuinely missing records: this page produced too much, errors and
//                      logs together, because that counter sums both trackers.
```

`errors.maxRepeatsPerMinute: 0` disables the throttle entirely, restoring the previous behaviour, and
`ERROR_TRACKING_MAX_REPEATS_PER_MINUTE` is the environment equivalent — read only when the environment
layer is on (`env: true`, or a prefix). The real fix is upstream, though: cache the failure, back off,
or gate the refetch. The throttle is a backstop for a failure you have not fixed yet.

> **Source note.** The throttle key is `source + name + message + top stack frame`, not the record
> fingerprint and not the tags. Two different query keys that fail with the same message out of the same
> `fetch` helper therefore share one budget, and `tags.queryKey` will not separate them. The key is
> deliberately coarser than the fingerprint: it must be consulted *before* a record is built.

The real fix is upstream — cache the failure, back off, or gate the refetch on connectivity. The
throttle is a backstop for a failure you have not fixed yet, not a substitute for fixing it.

## Testing it

Three doubles cover three different questions: *did my component capture?*, *did it log only?*, and *did
a record reach storage?*. Only the last one needs a repository, and none of them needs a browser.

```ts
// test/telemetry-double.ts
import { vi } from 'vitest';
import { createCaptureErrorMock, createLoggerMock } from '@codewithrajat/rm-logvault/testing';

export const telemetry = createCaptureErrorMock();
export const logging = createLoggerMock();

// The module YOUR components import, replaced once.
vi.mock('shared/telemetry', () => ({
  captureError: telemetry.captureError,
  logger: logging.logger,
}));
```

```tsx
// src/features/checkout/Checkout.test.tsx
import { afterEach, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { logging, telemetry } from '../../../test/telemetry-double';

afterEach(() => {
  telemetry.reset(); // module-scoped doubles would otherwise leak between files
  logging.reset();
});

it('reports the failure once, and does not turn its log line into a record', async () => {
  render(<Checkout />);
  await userEvent.click(screen.getByRole('button', { name: 'Pay' }));

  // The mocks record synchronously, so there is nothing to flush here.
  expect(telemetry.messages()).toEqual(['payment declined']);
  expect(telemetry.last()?.ctx?.tags).toEqual({ flow: 'checkout' });
  expect(logging.messages()).toEqual(['[Checkout] payment declined']);
  expect(telemetry.count()).toBe(1); // the log line is in the other store, not a second record
});
```

When the question is what the library **stored**, use the real pipeline with a memory repository. The
component below captures an error in a click handler and then throws the same object from render, which
is the two-capture case from the section above:

```tsx
// src/features/orders/Panel.test.tsx
import { afterEach, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { captureError, destroyTelemetry, flushTelemetry, initTelemetry } from '@codewithrajat/rm-logvault';
import { TelemetryErrorBoundary } from '@codewithrajat/rm-logvault/react';
import { createMemoryRepository } from '@codewithrajat/rm-logvault/testing';
import { OrdersPanel } from './OrdersPanel';

const shared = new Error('orders 42 not found');

afterEach(() => {
  destroyTelemetry(); // initialisation is idempotent: tests would share one install
});

it('enriches the first record instead of writing a second one', async () => {
  const repository = createMemoryRepository();
  initTelemetry({ appName: 'test-app', repository, shortcut: false });

  render(
    <TelemetryErrorBoundary fallback={<p>broken</p>}>
      <OrdersPanel error={shared} />
    </TelemetryErrorBoundary>,
  );
  await userEvent.click(screen.getByRole('button', { name: 'Load orders' }));

  await flushTelemetry(); // error writes are queued; without this the assertion races

  const records = repository.errors.all();
  expect(records).toHaveLength(1);
  expect(records[0]?.occurrenceCount).toBe(1);
  expect(records[0]?.tags).toEqual({ route: '/orders' });
  expect(records[0]?.source).toBe('react'); // the implicit 'manual' was replaceable
});
```

`OrdersPanel` is the piece not shown: its click handler calls
`captureError(error, { tags: { route: '/orders' } })` and then sets state, and the next render throws
`error`, so the boundary receives the same object. Three details keep this stable rather than flaky:

- **`shortcut: false`** stops each test installing a `keydown` listener on `document`, and
  `destroyTelemetry()` in `afterEach` keeps one test's installation out of the next one's.
- **`createMemoryRepository` means no IndexedDB**, so a component test needs no `fake-indexeddb`.
- **happy-dom is enough.** Vitest with `environment: 'happy-dom'` — what this repository's own suite
  runs on — renders and clicks fine; the one thing it lacks is a `Worker`
  ([worker failures and dynamic imports](./07-workers-and-dynamic-imports.md)).

> **Source note.** Neither double reproduces the real pipeline — no dedupe, no throttling, no
> fingerprinting — so use them to assert what **your** code called, and the memory repository to assert
> what the library stored. `createMemoryRepository` mirrors the IndexedDB semantics, `mergeContext`'s
> pending-only rule included, so the test above exercises real logic rather than a stub.

## See also

- [the vanilla page](../../vanilla/more-advanced/08-dedupe-throttling-and-testing.md) — the enrichment
  rule field by field, the throttle's arithmetic, and `toError`'s conversion table.
- [worker failures and dynamic imports](./07-workers-and-dynamic-imports.md) — the two capture paths the
  global handlers cannot see, and how to test them.
- [what actually arrives at your collector](../advanced/02-what-arrives-at-the-collector.md) — where
  `tags`, `source` and `severity` end up in the request body.
- [docs/API.md](../../../docs/API.md#captureerror) — the dedupe rule and the throttle in the reference.
