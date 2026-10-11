# Duplicates, polling failures and non-`Error` throws in a Vue app

**Problem it solves:** three failures that look like the library misbehaving in a Vue app, and are
not. A `catch` that reports with `logger.error(...)` writes a log line and **no error record**. A
record arrives with `source: 'vue'` and none of your tags, because two paths captured the same
`Error`. And a failing health poll spends the error budget on a failure that is already in the
report, so the *new* failures are the ones dropped.

**What you will learn:**

- Why `logger.error` cannot create an error record, and the one line that does.
- The enrichment rule as the Vue plugin exercises it: your `catch`, the chained `errorHandler`, and
  the `warnHandler` path with its `tags.framework: 'vue'`.
- What an explicit `source` protects, and `toError` at a rejected-promise site.
- `errors.maxRepeatsPerMinute` for a polling composable, and what a five-second poll costs.
- Testing it in Vitest with `createCaptureErrorMock`, `createLoggerMock` and
  `createMemoryRepository`.

## `logger.error` is not a capture

Reaching for the logger inside a `catch` is the natural Vue habit, and it records nothing in the
errors store: `logger` writes `LogRecord`s to sinks, and nothing under `src/logger/` touches
`captureError`, the one ingestion point for errors. Adding
`captureError(error, { tags: { flow: 'checkout' } })` beside the `logger.error(...)` line is what
creates the record — the two calls are separate stores, not two halves of one.

| Call | Produces | Lands in |
| --- | --- | --- |
| `captureError(error, ctx)` | An `ErrorRecord` | The errors store |
| `logger.error(msg, …)` | A `LogRecord` | The logs store, if `logs.level` admits it |
| `console.error`, with `logs.captureConsole: true` | A `LogRecord` | The logs store, never an error |
| `warnHandler`, installed by the plugin | An `ErrorRecord`, `severity: 'warning'` | The errors store (below) |

## Two paths, one record: the enrichment rule in Vue

Deduplication is by **object identity**: the same `Error` instance reaching the library twice is one
failure with `occurrenceCount: 1`. What changed in 1.0.1 is what the second call does — it no longer
vanishes, it **enriches** the record the first call produced:

```ts
try {
  await loadOrders(orderId);
} catch (error) {
  // No explicit source, so the adapter's `source: 'vue'` will replace `'manual'`.
  captureError(error, { tags: { route: '/orders/:id' } });
  throw error; // Vue routes it to app.config.errorHandler
}
```

The adapter calls `captureError(error, { source: 'vue', extra: { vueInfo } })`. Because the call
above passed **no** source, `'vue'` replaces the `'manual'` default — and `source` is the first hashed
part, so the fingerprint is recomputed with it:

| Field | After your `catch` | After the adapter |
| --- | --- | --- |
| `source` | `'manual'` (defaulted) | `'vue'` — a default is replaceable |
| `tags.route` | `'/orders/:id'` | Unchanged; the adapter writes `extra`, not `tags` |
| `extra` | — | `{ vueInfo: 'mounted hook' }`, merged in |
| `severity`, `handled` | Defaults for `'manual'` | Unchanged — neither is in that patch |
| `occurrenceCount` | `1` | `1` — context, not a second occurrence |

An **explicit** source is protected instead: `captureError(error, { source: 'api' })` is never
rewritten to `'vue'` by the adapter's later call. That is the difference between a record that says
what Vue was doing and one that says what your integration was doing.

> **Source note.** "Explicit" means the *resolved* context carries a source, not that your call site
> typed one. `resolveErrorContext` merges a registered context builder's fields in before the record
> is built, so an error a builder classified is not relabelled by a later Vue capture either. See
> [observing and extending](./04-observing-and-extending.md).

### The `warnHandler` path

The plugin also chains `app.config.warnHandler` (unless you pass `captureWarnings: false`), which is
the only way Vue's own warnings become records:

| Field | Value on a warning record |
| --- | --- |
| `source` / `severity` | `'vue'` / `'warning'` |
| `category` / `handled` | `'runtime'` / `true` |
| `tags` | `{ framework: 'vue', kind: 'warning' }` |
| `extra.vueTrace` | Vue's component trace, when it supplies a non-empty one |

Two consequences:

1. **A warning is a brand-new `Error`**, built inside the adapter from Vue's message, so identity
   deduplication can never apply to it; the same warning twice aggregates by fingerprint. Its `stack`
   points into the adapter rather than at your component, which is why `extra.vueTrace` — lines like
   `at <OrdersPanel>` — is what names where it came from.
2. **A warning raised with no component context never reaches `warnHandler`.** Vue resolves the
   handler from the component on its internal warning stack and logs to `console.warn` itself when
   there is none; with `logs.captureConsole: true` that is a **log** record, not an error.

Your plugin `context` option can replace these values wholesale, because the adapter spreads it last:
[the recipes page](./03-recipes-and-deciding.md) has the key-by-key table.

## Non-`Error` throws: `toError` at a promise boundary

A composable that rejects hands a value to Vue, and a `throw` accepts anything. On the async-component
loader path Vue then normalises the rejection as `new Error(String(err))`, and `String` turns a plain
object into `[object Object]` — which is the message that ends up in the report. `toError(thrown)` is
the bridge, and the polling composable below is where it belongs:

| Thrown value | `toError(value)` returns | Effect on deduplication |
| --- | --- | --- |
| An `Error` from this realm | The **same object** | None — identity is kept |
| An Error-like object from another realm | The same object (`instanceof` cannot see it) | None |
| A string, number, `null`, a plain object, a `Proxy` | A **new** `Error` from `normalizeError`, with `cause` | Two records |

> **Source note.** `toError` never throws and never calls `JSON.stringify` on raw input, so a cyclic
> object becomes a `cause` rather than a `TypeError`. `cause` is attached with
> `Object.defineProperty`, because the `Error` options bag is ES2022 and the library targets ES2020;
> a runtime that refuses the definition still gets a usable `Error`, minus the link.

## A polling composable and `errors.maxRepeatsPerMinute`

```ts
// src/composables/useHealthPoll.ts
import { onScopeDispose, ref } from 'vue';
import { toError } from '@codewithrajat/rm-logvault';
import { captureError, logger } from '../telemetry';

const POLL_INTERVAL_MS = 5_000; // twelve attempts a minute

export function useHealthPoll(fetchStatus: () => Promise<string>) {
  const status = ref('unknown');

  async function tick(): Promise<void> {
    try {
      status.value = await fetchStatus();
    } catch (thrown) {
      // `source` is half of the key the repeat throttle counts against; it survives
      // the Vue capture that follows.
      const error = toError(thrown);
      captureError(error, { source: 'api', tags: { job: 'health-poll' } });
      logger.error('[Health] poll failed', error.message);
      status.value = 'unavailable';
    }
  }

  const timer = setInterval(() => void tick(), POLL_INTERVAL_MS);
  void tick();
  onScopeDispose(() => clearInterval(timer)); // the cleanup, not `onUnmounted`

  return { status };
}
```

`errors.maxEventsPerMinute` (default `120`) answers "how many errors may this page produce per
minute". It does not answer "may *this* error be produced again", which is the question a failing
poll asks. `errors.maxRepeatsPerMinute` does, and its default is the number in that comment:

| | |
| --- | --- |
| One failing poll, every 5 s | 12 records per minute |
| `errors.maxRepeatsPerMinute` default | 12 records per fingerprint per 60-second window |
| Result at the default | Exactly enough: every attempt is admitted, none is dropped |
| The same poll every 3 s | 20 attempts, 8 refused — `droppedByRepeat` counts them |

Two properties make that safe rather than lossy. The per-fingerprint check runs **before** the global
limiter, so a refused repeat costs no global token and cannot starve other failures; and admitted
repeats still aggregate onto the one `pending` row, so twelve attempts are one row with
`occurrenceCount: 12`. The key is the source, the error name, the message and the error's **top stack
frame** — where it was constructed, not where it was caught.

Which matters before you write the message. A stable message from a stable throw site is one key; a
message carrying an order id or a timestamp is a **different key every attempt**, so the throttle
never engages and the report fills with one row per poll. Keep the message stable and put the varying
value in `extra`.

```ts
import { getTelemetryStatus, initTelemetry } from '@codewithrajat/rm-logvault';

const status = getTelemetryStatus();
status.droppedByRateLimit; // records genuinely missing — the page produced too much
status.droppedByRepeat; // already in the report; its budget went to new failures

initTelemetry({
  appName: 'checkout',
  // Raise it only if the repeat count itself is the signal you want.
  errors: { maxRepeatsPerMinute: 40 },
  // `0` disables per-fingerprint throttling entirely; a negative number is ignored.
});
```

The real fix is upstream: back off, cache the failure, or gate the refetch on connectivity. The
throttle is a backstop for a failure you have not fixed yet, not a substitute for fixing it. In a
Vite app the option is also readable from `VITE_ERROR_TRACKING_MAX_REPEATS_PER_MINUTE` with
`env: 'VITE_'`; the layer itself is in
[environment variables](../config/01-environment-variables.md).

## Testing it in Vitest

This repository's own suite runs on Vitest with `environment: 'happy-dom'`, which is what a Vue app
needs the moment a test calls `mount()`. The composable tests below need no DOM at all.

`@codewithrajat/rm-logvault/testing` ships the doubles. The pattern is one module that replaces your
own facade, as the
[vanilla page](../../vanilla/more-advanced/08-dedupe-throttling-and-testing.md) builds it:
`src/testing/telemetry-double.ts` calls `createCaptureErrorMock()` and `createLoggerMock()` once, and
`vi.mock('../telemetry', …)` swaps `captureError` and `logger` for them. The test imports the double,
never the library:

```ts
// src/composables/useHealthPoll.test.ts
import { effectScope } from 'vue';
import { expect, it, vi } from 'vitest';
import { logging, telemetry } from '../testing/telemetry-double';
import { useHealthPoll } from './useHealthPoll';

it('captures the failure and logs beside it, without confusing the two', async () => {
  const scope = effectScope();
  scope.run(() => useHealthPoll(() => Promise.reject('status endpoint down')));

  await vi.waitFor(() => expect(telemetry.count()).toBe(1));

  expect(telemetry.last()?.ctx?.source).toBe('api');
  expect(telemetry.last()?.ctx?.tags).toEqual({ job: 'health-poll' });
  expect(logging.messages()).toEqual(['[Health] poll failed']); // logged, not captured

  scope.stop(); // clears the interval, exactly as an unmount would
});
```

That test keeps the two stores apart: one `captureError` call and one log line. Had `tick` only
called `logger.error`, `telemetry.count()` would be `0`. Call `telemetry.reset()` and
`logging.reset()` in an `afterEach` — a module-scoped double otherwise leaks between files.

> **Source note.** Neither double reproduces the real pipeline — no dedupe, no throttling, no
> fingerprinting — so use them to assert on **your** calls. Mocking `../telemetry` does not intercept
> the Vue adapter either: it imports `captureError` from inside the library, which is why the
> enrichment needs the real pipeline below.

`createMemoryRepository()` mirrors the IndexedDB semantics, including `mergeContext` and its
pending-only rule, so the adapter can be exercised for real:

```ts
// src/telemetry.integration.test.ts
import { createApp, h } from 'vue';
import { afterEach, expect, it } from 'vitest';
import {
  captureError,
  destroyTelemetry,
  flushTelemetry,
  initTelemetry,
} from '@codewithrajat/rm-logvault';
import { createTelemetryVuePlugin } from '@codewithrajat/rm-logvault/vue';
import { createMemoryRepository } from '@codewithrajat/rm-logvault/testing';

afterEach(destroyTelemetry); // init is idempotent: each test needs its own

it('enriches the record your catch made instead of writing a second one', async () => {
  const repository = createMemoryRepository();
  initTelemetry({ appName: 'test-app', repository, shortcut: false });

  const failure = new Error('orders 42 not found');
  const Broken = {
    setup() {
      try {
        throw failure;
      } catch (error) {
        captureError(error, { tags: { route: '/orders/:id' } }); // no explicit source
      }
      throw failure; // Vue sends this to app.config.errorHandler
    },
    render: () => h('div'),
  };

  createApp(Broken).use(createTelemetryVuePlugin()).mount(document.createElement('div'));
  await flushTelemetry(); // the merge is queued behind the save

  const [record] = repository.errors.all();
  expect(repository.errors.all()).toHaveLength(1); // one record, not two
  expect(record?.source).toBe('vue'); // the defaulted source was replaceable
  expect(record?.tags?.['route']).toBe('/orders/:id'); // your tag survived
  expect(record?.extra?.['vueInfo']).toBe('setup function');
});
```

## See also

- [duplicates, floods and non-`Error` throws](../../vanilla/more-advanced/08-dedupe-throttling-and-testing.md)
  — the full enrichment table, `record:dropped`, and the throttle's ordering.
- [worker failures and dynamic imports in a Vue app](./07-workers-and-dynamic-imports.md)
- [what arrives at your collector](../advanced/02-what-arrives-at-the-collector.md)
- [docs/API.md](../../../docs/API.md#captureerror) — the `captureError` contract, its dedupe rule and
  `toError`.
