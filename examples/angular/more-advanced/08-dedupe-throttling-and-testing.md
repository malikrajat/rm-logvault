# Duplicates, throttling and testing in an Angular app

**Problem it solves:** three Angular-shaped surprises that all look like the library misbehaving.

A `logger.error(...)` in a `catch` block reads like reporting, and writes only a log record. One failure
often reaches **two** of Angular's capture paths — the `TelemetryErrorHandler` the provider installs, and
your own `catchError` operator — and the second path either enriches a record you did not expect it to
touch, or is mistaken for a duplicate. And a `timer()` / `interval()` poll that fails on every tick spends
the whole error budget on one bug, after which the records dropped are the **new** ones.

**What you will learn:**

- Why `logger.error(...)` never captures, and the two places that must call `captureError` instead.
- What a second capture changes when `TelemetryErrorHandler` and your `catchError` both see one error.
- `toError` inside a `catchError` operator, and the rejection value it hands back untouched.
- Where `errors.maxRepeatsPerMinute` bites: a polling stream, and how to read `droppedByRepeat`.
- Testing it in Vitest with `createCaptureErrorMock`, `createLoggerMock` and `createMemoryRepository` —
  no `TestBed`, no Karma.
- The one `record:dropped` reason the JSDoc does not mention.

## `logger.error(...)` is a log line, not a capture

| What your Angular code does | Error record | Log record |
| --- | --- | --- |
| `throw` in a template handler, a lifecycle hook or a subscription, provider installed | yes, `source: 'angular'` | no |
| `logger.error('[Checkout] failed', error)` | **no** | yes |
| `catch (error) { }` with nothing in it | no | no |
| `captureError(error, { … })` | yes | no |

`ErrorHandler` is the framework's route, and `provideTelemetryErrorHandler()` is what plugs it into the
vault — so an `ErrorHandler` of your own that only logs is a handler that reports nothing. Everywhere
else, the call site is yours:

```ts
// src/app/checkout/checkout.service.ts — a method on an `@Injectable({ providedIn: 'root' })`
// service. It imports from a one-line local barrel (`src/app/telemetry/report.ts`, which
// re-exports these two names), because that barrel is the module a test can replace.
import { captureError, logger } from '../telemetry/report';

public submit(cartId: string): void {
  try {
    this.reallySubmit(cartId);
  } catch (error) {
    logger.error('[Checkout] submit failed', { cartId }); // -> rm-logvault-logs
    captureError(error, { tags: { flow: 'checkout' }, extra: { cartId } }); // -> errors
  }
}
```

One log line and one throw are two independent records; the same pair from a component is in
[the capture recipes](../basic/README.md#a-log-line-and-a-throw-are-two-independent-records).

> **Source note.** `logs.captureConsole: true` does not change that: it wraps `console.warn` and
> `console.error` into **log** records, so the `console.error(error)` that `TelemetryErrorHandler`
> delegates to becomes a log record whose message falls back to `'[console]'`, while the error record
> still comes from `captureError` alone.

## When two Angular paths capture one error

A `catchError` operator that reports and re-throws, followed by the `ErrorHandler` receiving the same
object, is one failure on two paths. Deduplication is by object identity, so the second path **merges**
into the record the first one wrote, and which call wins is decided per field:

| What the second call passes | What happens to the record |
| --- | --- |
| `tags` / `extra` | Merged; a tag key present in both takes the second call's value. |
| `severity` | Replaced. |
| `source` | Replaced **only if the first capture passed no source at all**. |
| `handled` | **Not patchable** — `ErrorContextPatch` has no such field, so the first verdict stands. |
| `message`, `stack`, `category` | Not patchable. The first capture already described the occurrence. |

The rule is therefore about the **first** call site, and the choice is worth making deliberately:

```ts
// Three alternative FIRST captures of the same failure — one per call site, not a sequence.

// No source: the record defaults to 'manual', and a later 'angular' from the handler corrects it.
captureError(error, { tags: { flow: 'checkout' } });
// An explicit source is pinned. A later 'angular' cannot overwrite your decision.
captureError(error, { source: 'manual', tags: { flow: 'checkout' } });
// An explicit `handled` is preserved the same way, whichever path captures second.
captureError(error, { handled: true, tags: { flow: 'checkout' } });
```

Enrichment needs a row to enrich: it applies only while the record is still `pending`, and a row already
claimed for upload is never modified. The three limits of the rule are in
[the vanilla page](../../vanilla/more-advanced/08-dedupe-throttling-and-testing.md#the-three-limits).

## `toError` in a `catchError` operator

`toError` is the bridge from "something was rejected" to "a real `Error`". It never throws and never
stringifies raw input, so it is safe on whatever an `HttpClient` call rejects with:

```ts
// src/app/orders/orders.service.ts — the method, inside an `@Injectable({ providedIn: 'root' })`
// service. `Order` is your own interface; `this.http` is an injected `HttpClient`.
import { catchError, throwError, type Observable } from 'rxjs';
import { captureError, toError } from '@codewithrajat/rm-logvault';

public load(id: string): Observable<Order> {
  return this.http.get<Order>(`/api/orders/${id}`).pipe(
    catchError((error: unknown) => {
      const failure = toError(error);
      captureError(failure, { source: 'api', tags: { route: '/orders/:id' } });
      return throwError(() => failure); // the same value the subscriber would have seen
    }),
  );
}
```

Two things `toError` is **not** for. `captureError` does not need it — it normalises whatever you hand it,
so the call above would work with `error` unchanged; `toError` earns its place only when the value must
keep travelling as an `Error`, in a `throwError`, a `cause` chain or a `logger.error(...)` message. And it
is not a wrapper: for an `Error`, or any Error-like value, it returns the **same object**, so identity
deduplication still holds for whatever the router or `ErrorHandler` sees next.

> **Source note.** "Error-like" means a string `message` plus a string `name` or `stack` — the same duck
> type `normalizeError` uses. Angular's `HttpErrorResponse` has that shape, so `toError` returns it
> unchanged: the signature says `Error`, but `instanceof Error` is not guaranteed and `stack` may be
> `undefined`. A value that is *not* Error-like gets a **new** `Error`, so a re-thrown string or plain
> object no longer deduplicates against what was rejected: a second capture writes a second record.

## A polling stream, and `errors.maxRepeatsPerMinute`

The mistake in a poll is putting `catchError` on the **outer** stream, which turns one failed tick into a
completed subscription. The operator belongs inside the projection, so a failure is one tick:

```ts
// src/app/health/health-poller.service.ts — a field on an `@Injectable({ providedIn: 'root' })`
// service, with `this.http` an injected `HttpClient`.
import { catchError, of, switchMap, timer } from 'rxjs';
import { captureError } from '@codewithrajat/rm-logvault';

/** One failed tick, not a dead poll: the operator is inside the projection. */
public readonly poll = timer(0, 5_000).pipe(
  switchMap(() =>
    this.http.get<{ ok: boolean }>('/api/health').pipe(
      catchError((error: unknown) => {
        captureError(error, { source: 'api', tags: { poll: 'health' } });
        return of(undefined);
      }),
    ),
  ),
);
```

Every tick rejects with a **new** object, so identity deduplication does nothing here — which is the case
`errors.maxRepeatsPerMinute` (default `12`, fixed 60-second window, `0` disables it) exists for. It keeps
a bounded per-key counter, and the key is deliberately not the fingerprint:

```ts
// captureError.ts, `repeatKey` — the failure as the throw site sees it.
[ctx?.source ?? 'manual', normalized.name, normalized.message, topStackFrames(normalized.stack, 1)]
```

Two consequences worth knowing:

- A fixed URL that fails the same way keys identically on every tick, so twelve admitted repeats aggregate
  into one row with `occurrenceCount: 12` and the rest cost nothing — the check runs **before** the global
  limiter, so a refused repeat spends no global budget.
- A message that varies per call keys differently each time: `/api/orders/8123` and `/api/orders/8124` are
  two keys, each with its own cap. The throttle keys on text, not on the cause.

A refused repeat is not a gap. `handle.events.on('record:dropped', …)` reports it as a delta with
`event.reason === 'repeat-limit'`, which is what a badge or an alert should listen to:

> **Source note.** `RecordDroppedEvent.reason` is documented in `events.ts` as `rate-limit`, `consent`,
> `payload-limit` or `before-hook`, but the only values the initialiser ever emits are `'rate-limit'`
> (errors and logs) and `'repeat-limit'` (errors). A consent gate that refuses, a record over its payload
> budget and a `beforeCapture` that returns `null` all drop quietly: no event, no count. The event is
> emitted from `syncTelemetry()` and from `destroyTelemetry()`, while
> `getTelemetryStatus().droppedByRepeat` reflects the current window immediately and synchronously.

What to do about a throttled poll is usually nothing: the failure is in the report with its count intact.
Fix the poll — cache, back off, gate on connectivity — rather than the number, as
[D-034](../../../docs/DECISIONS.md#d-034--a-repeat-of-a-known-failure-is-throttled-per-fingerprint-ahead-of-the-global-limit)
sets out.

## Testing it in Vitest

`TestBed` is not needed for any of this: the provider is a factory, so `TelemetryErrorHandler` is
constructible with `new`, and a memory repository replaces IndexedDB.

```ts
// src/app/telemetry/telemetry.test.ts
import { afterEach, expect, it, vi } from 'vitest';
import {
  captureError,
  destroyTelemetry,
  flushTelemetry,
  getTelemetryStatus,
  initTelemetry,
  withChunkCapture,
} from '@codewithrajat/rm-logvault';
import { TelemetryErrorHandler } from '@codewithrajat/rm-logvault/angular';
import { createMemoryRepository } from '@codewithrajat/rm-logvault/testing';

afterEach(() => {
  vi.restoreAllMocks(); // the handler delegates to console.error on its way out
  destroyTelemetry(); // initialization is idempotent, so a stale one would swallow the next test
});

it('enriches a chunk record instead of writing a second one', async () => {
  const repository = createMemoryRepository();
  initTelemetry({ appName: 'test-app', repository, shortcut: false });
  vi.spyOn(console, 'error').mockImplementation(() => undefined);

  const handler = new TelemetryErrorHandler({ tags: { shell: 'checkout' } });
  const error = new Error('Failed to fetch dynamically imported module');
  const load = withChunkCapture('/orders/:id', () => Promise.reject(error));

  await expect(load()).rejects.toBe(error); // re-thrown unchanged
  handler.handleError(error); // what Angular does with the same rejection
  await flushTelemetry();

  const [record] = repository.errors.all();
  expect(repository.errors.all()).toHaveLength(1);
  expect(record?.source).toBe('chunk'); // an explicit source is never overwritten
  expect(record?.handled).toBe(false); // and `handled` is not patchable
  expect(record?.tags).toEqual({ route: '/orders/:id', shell: 'checkout' });
});

it('bounds a poll that fails the same way on every tick', async () => {
  const repository = createMemoryRepository();
  initTelemetry({
    appName: 'test-app',
    repository,
    shortcut: false,
    errors: { maxRepeatsPerMinute: 3 },
  });

  // A new object each tick, exactly as HttpClient rejects: identity cannot help, and the per-key
  // throttle is what bounds it. One line, so the stack — and the fingerprint — match every time.
  for (let tick = 0; tick < 10; tick += 1) {
    captureError(new Error('Http failure response for /api/health: 503'), { source: 'api' });
  }
  await flushTelemetry();

  expect(repository.errors.all()).toHaveLength(1);
  expect(repository.errors.all()[0]?.occurrenceCount).toBe(3);
  expect(getTelemetryStatus().droppedByRepeat).toBe(7);
});
```

For **your** code's calls, the two recording doubles are what you want — they reach no library state, and
`createCaptureErrorMock` records the context an assertion can read. Create them in their own module, so a
mock factory cannot run before they exist:

```ts
// test/telemetry-double.ts — one module, so no suite leaks assertions into another.
import { createCaptureErrorMock, createLoggerMock } from '@codewithrajat/rm-logvault/testing';

export const telemetry = createCaptureErrorMock();
export const logging = createLoggerMock();
```

Then replace the barrel the service imports from — one module, and nothing in `src/app` changes:

```ts
// src/app/checkout/checkout.service.test.ts
import { expect, it, vi } from 'vitest';
import { logging, telemetry } from '../../../test/telemetry-double';
import { CheckoutService } from './checkout.service';

vi.mock('src/app/telemetry/report', () => ({
  captureError: telemetry.captureError,
  logger: logging.logger,
}));

it('logs the failure and captures it, with no TestBed', () => {
  new CheckoutService().submit('c_8123'); // the class injects nothing, so `new` is enough

  expect(logging.messages()).toEqual(['[Checkout] submit failed']);
  expect(telemetry.count()).toBe(1);
  expect(telemetry.last()?.ctx?.tags?.['flow']).toBe('checkout');
});
```

What the doubles do **not** give you is the pipeline: no dedupe, no fingerprinting, no throttling. A test
asserting that a record reached storage belongs on the real thing with a memory repository, which mirrors
the IndexedDB semantics — `mergeContext` and its pending-only rule included — so those two tests exercise
real logic rather than a stub.

## See also

- [Duplicates, floods and non-`Error` throws](../../vanilla/more-advanced/08-dedupe-throttling-and-testing.md)
  — the depth: the enrichment rule, its three limits, the throttle's arithmetic, `toError` input by input.
- [Worker failures and dynamic imports](./07-workers-and-dynamic-imports.md) — `handled: false` when a
  chunk failure reaches the handler, and where the attachment lives.
- [What actually arrives at your collector](../advanced/02-what-arrives-at-the-collector.md) — where a
  merged tag, and a `source` that refused to change, end up in the uploaded body.
- [docs/API.md](../../../docs/API.md#captureerror) — the dedupe rule, `toError` and the testing doubles.
