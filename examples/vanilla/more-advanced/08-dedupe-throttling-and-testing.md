# Duplicates, floods and non-`Error` throws

**Problem it solves:** three failures that look like the library misbehaving, and are not.

An error reported by two paths arrives with the wrong `source` and none of the tags the second caller
supplied. A health-check poll that fails every five seconds fills the error budget on its own, and the
records that get dropped are the **new** ones. And a `catch` block that needs an `Error` ends up writing
`String(error)` — which trips a lint rule and produces `[object Object]` — or `JSON.stringify(error)`,
which throws on a circular object and turns "report this failure" into a second, worse failure.

**What you will learn:**

- Why a second `captureError` call for the same `Error` is not a second occurrence, and what it does do.
- Which fields a repeat call can change, and the one that also rewrites the fingerprint.
- What the three limits of that rule are.
- `errors.maxRepeatsPerMinute`: the arithmetic that makes one failing poll a problem, and how to tell a
  throttled repeat from a genuine gap.
- `toError`: turning any thrown value into a real `Error` without ever stringifying raw input.
- Testing all of it with `createCaptureErrorMock` and `createLoggerMock`.

## The rule: a duplicate enriches, it does not duplicate

Deduplication is by **object identity**. The same `Error` instance reaching the library twice is one
failure, and the record keeps `occurrenceCount: 1`. That has been true since 0.1.0.

What used to happen next was the problem. The **first** path to arrive won, and every later call was
discarded whole — and the first path is usually the one that knows least:

```ts
// window.onerror fires before any application code sees the error, so it wins the race.
window.addEventListener('error', () => {
  captureError(error); // record created here: source 'manual', no tags
});

// The route loader that actually produced it knows where it came from. This vanished.
captureError(error, { source: 'router', tags: { route: '/orders/:id' } });
```

The record was still written, which made this worse than a drop: the report showed the failure with the
wrong origin and none of the context that would have identified it, and nothing anywhere said a
better-informed capture had been thrown away.

A repeat call now **enriches** the record the first one produced:

| Field | What a repeat call does |
| --- | --- |
| `tags` | Merged. A key present in both resolves to the **second** call's value. |
| `extra` | Merged, shallowly. |
| `severity` | Replaced. |
| `source` | Replaced **only if the first capture passed no explicit source.** |
| `message`, `stack`, `category`, `page`, `environment` | Not patchable. They describe the occurrence, and the first capture already recorded it. |

```ts
const error = new Error('orders 42 not found');

captureError(error);                                  // source 'manual', no tags
captureError(error, {                                 // enrichment, not a second row
  source: 'router',
  tags: { route: '/orders/:id' },
  extra: { orderId: 42 },
});

// One record. occurrenceCount 1. source 'router'. tags.route '/orders/:id'.
```

> **Source note.** A `source` change also **recomputes the fingerprint**, because `source` is the first
> hashed part and `save` aggregates on `[fingerprint, 'pending']`. Changing one without the other would
> file a record under a group its own fields do not describe. `applyErrorContextPatch` does both together,
> which is why it is the one exported helper for this.

### The "explicit source" subtlety

`source` replaces the record's source **only when the first capture did not pass one.** That is what makes
the useful case work without letting a later guess overwrite a decision:

```ts
// First call passes no source, so the record defaults to 'manual'. Correctable:
captureError(err);                                    // → 'manual'
captureError(err, { source: 'router' });              // → 'router'   (the default was replaced)

// First call states a source deliberately. Not overwritten:
captureError(err, { source: 'vue' });                 // → 'vue'
captureError(err, { source: 'angular' });             // → still 'vue'
```

`source` is also a member of `ErrorSource` for each integration, and this release added two more:

| Source | For |
| --- | --- |
| `'router'` | A route-loader or navigation failure. Previously had to be filed as `'chunk'`, which is indistinguishable from a genuine dynamic-import failure in a report. |
| `'timeout'` | Something that never answered. `'timeout'` is in `UNHANDLED_SOURCES`, so `handled` defaults to `false`; `'router'` is not, so it defaults to `true`. |

### The three limits

1. **Only objects and functions are tracked by identity.** `captureError('boom')` twice produces two
   records, which storage then aggregates onto one row by fingerprint. That is not a bug — a thrown string
   has no identity to key on.
2. **Enrichment needs a row to enrich.** It is applied only while the record is still `pending`. A row
   already claimed for upload belongs to an in-flight request and is never modified — the same rule that
   governs aggregation.
3. **A custom `ErrorRepository` written before 1.0.1 has no `mergeContext`**, so it loses the enrichment
   silently rather than writing a second record. Implement the optional method with the exported
   `applyErrorContextPatch` if you want it:

   ```ts
   import { applyErrorContextPatch } from '@codewithrajat/rm-logvault';
   import type { ErrorContextPatch, ErrorRecord } from '@codewithrajat/rm-logvault';
   import type { StorageResult } from '@codewithrajat/rm-logvault';

   mergeContext: async (
     id: string,
     patch: ErrorContextPatch,
   ): Promise<StorageResult<ErrorRecord | undefined>> => {
     const row = rows.get(id);
     // Never touch a row that is not `pending`: it belongs to an in-flight request.
     if (row === undefined || row.uploadStatus !== 'pending') return { ok: true, value: undefined };
     const merged = applyErrorContextPatch(row, patch); // total; null means "nothing changed"
     if (merged === null) return { ok: true, value: row };
     rows.set(id, merged);
     return { ok: true, value: merged };
   },
   ```

## Floods: `errors.maxRepeatsPerMinute`

`errors.maxEventsPerMinute` (default `120`) is a global fixed window. It answers "how many errors may this
page produce per minute" and it does that well. It does not answer "may *this* error be produced again" —
and that is the question a failing poll asks.

The arithmetic, because it is the whole reason the option exists:

| | |
| --- | --- |
| A health-check worker polled every 5 s | 12 records per minute |
| Default global budget | 120 records per minute |
| Share of the budget spent on **one** bug already in the report | **10 %** |
| Distinct failing queries that exhaust the budget | **10** |
| Records then dropped | the **new** ones — the poll is guaranteed to be there first |

So the report shows one failure twelve times and none of the ten that followed it. That is not a
throughput problem; it is a triage problem.

`errors.maxRepeatsPerMinute` (default `12`, env `ERROR_TRACKING_MAX_REPEATS_PER_MINUTE`) caps how many
records **one** fingerprint may produce per 60-second window. The check runs **before** the global limiter,
and that ordering is the entire mechanism:

```ts
if (repeats.blocked(key)) return null;   // over its own cap: costs nothing at all
if (!limiter.allow()) return null;       // global backstop
repeats.record(key);
```

A refused repeat must not reach the global limiter, because charging it a token is precisely what starves
everything else. Records that **are** admitted still aggregate onto the one `pending` row for their
fingerprint, so twelve admitted repeats are one row with `occurrenceCount: 12` — not twelve rows.

### Telling a throttled repeat from a real gap

These mean opposite things, so they are counted separately:

```ts
import { getTelemetryStatus, initTelemetry } from '@codewithrajat/rm-logvault';

initTelemetry({
  appName: 'checkout',
  onInternalError: (stage, error) => console.warn(stage, error),
});

const status = getTelemetryStatus();
status.droppedByRateLimit; // records genuinely missing — the page produced too much
status.droppedByRepeat;    // already in the report — its budget went to new failures instead
```

The same distinction is available as an event, which is what you want for an alert:

```ts
const handle = initTelemetry({ appName: 'checkout' });

handle.events.on('record:dropped', (event) => {
  // 'rate-limit' | 'repeat-limit' | 'consent' | 'payload-limit' | 'before-hook'
  if (event.reason === 'rate-limit') alertOnMissingRecords(event.count);
  if (event.reason === 'repeat-limit') reportThrottledRepeat(event.count);
});
```

And in the console, once per rolled window rather than once per refused repeat:

```text
[rm-logvault] [Telemetry] repeat-limit: 47 repeat(s) of already-reported failures dropped this window
```

### What to do about it

Usually nothing. The failure is in the report, with its occurrence count intact, and the budget went where
it was needed. Change it only if the repeat count itself is the signal you want:

```ts
initTelemetry({
  appName: 'checkout',
  errors: {
    // Let a known-chatty failure through more often, while still bounding it.
    maxRepeatsPerMinute: 40,

    // Or disable the throttle entirely — every repeat then competes for the global
    // budget, which is exactly what this option exists to prevent.
    // maxRepeatsPerMinute: 0,
  },
});
```

The real fix is upstream: cache the failure, back off, or gate the refetch on connectivity. The throttle is
a backstop for a failure you have not fixed yet, not a substitute for fixing it.

## Non-`Error` throws: `toError`

`throw` accepts anything. When you need an `Error` back — to reject with, to hand to a framework, to put in
a `cause` chain — the two obvious lines are both wrong:

```ts
throw new Error(String(error));        // lint error, and '[object Object]' for a plain object
throw new Error(JSON.stringify(error)); // TypeError on a cyclic object — a second, worse failure
```

`toError` is the bridge, and it delegates the message to the normaliser the library already uses:

```ts
import { toError } from '@codewithrajat/rm-logvault';

toError(new TypeError('bad')).message; // 'bad' — the ORIGINAL object, unchanged
toError('boom').message;               // 'boom'
toError(42).message;                   // 'Non-Error value thrown: 42'
toError(null).message;                 // 'Non-Error value thrown: null'
toError({ a: 1 }).message;             // 'Non-Error value thrown: {"a":1}'

const cycle: Record<string, unknown> = {};
cycle['self'] = cycle;
toError(cycle).cause;                  // the cyclic object, never stringified
```

| Input | `toError` returns |
| --- | --- |
| A same-realm `Error` | The **same object**, so `throw toError(x)` keeps identity and the original stack. |
| An Error-like object from another realm (an iframe, a worker, a `vm` context) | The same object — `instanceof Error` cannot see it, but a string `message` plus `name`/`stack` can. |
| A string, number, boolean, `Symbol`, `BigInt`, `null`, `undefined`, a function, a plain object | A new `Error` whose message came from `normalizeError` — bounded by `MAX_MESSAGE_LENGTH` and already redacted — with `cause` set to the original value. |
| A `Proxy` whose every getter raises | The same as above. It never reads what it cannot read. |

**It never throws, and it never calls `JSON.stringify` on raw input.**

```ts
// A rejection that a caller can inspect, from a value of unknown shape.
someQueue.on('failed', (job) => {
  const error = toError(job.reason);      // real Error, whatever the producer sent
  error.message = `[worker] ${error.message}`;
  reject(error);
});
```

> **Source note.** `cause` is attached with `Object.defineProperty` rather than the `Error` options bag,
> which is an ES2022 feature while this library's build targets ES2020. On a runtime that refuses the
> definition you still get a usable `Error`; only the link is lost.

## Testing it

`@codewithrajat/rm-logvault/testing` ships recording doubles for the two functions applications mock most
often. Both reach no library state — importing `/testing` installs nothing, starts nothing and opens no
database — and both expose `reset()`, so a module-scoped double cannot leak assertions between files.

```ts
// test/telemetry-double.ts
import { vi } from 'vitest';
import { createCaptureErrorMock, createLoggerMock } from '@codewithrajat/rm-logvault/testing';

export const telemetry = createCaptureErrorMock();
export const logging = createLoggerMock();

// The module YOUR code imports, replaced once.
vi.mock('shared/telemetry', () => ({
  captureError: telemetry.captureError,
  logger: logging.logger,
}));
```

```ts
// checkout.test.ts
import { telemetry, logging } from './telemetry-double.js';

afterEach(() => {
  telemetry.reset();
  logging.reset();
});

it('files a loader failure under its route', async () => {
  await loadOrders('42');

  expect(telemetry.messages()).toEqual(['orders 42 not found']);
  expect(telemetry.last()?.ctx?.source).toBe('router');
  expect(telemetry.last()?.ctx?.tags?.['route']).toBe('/orders/:id');
  expect(telemetry.count()).toBe(1);
});

it('warns once and does not capture', () => {
  retryPayment();

  expect(logging.messages()).toEqual(['[Checkout] retrying payment']);
  expect(logging.atLeast('warn')).toHaveLength(1);
  expect(telemetry.count()).toBe(0); // logger.error does NOT capture
});
```

What each one gives you:

| `createCaptureErrorMock()` | Meaning |
| --- | --- |
| `captureError(error, ctx?)` | Pass this wherever the code under test expects `captureError`. |
| `calls` | Every call in order: `{ error, ctx, message }`. `error` is **exactly** the value passed. |
| `last()` / `count()` | The most recent call, and how many there were. |
| `messages()` | The normalised message of every call — safe even for a hostile value, because it goes through `normalizeError`. |
| `withSource(source)` | Calls that carried that `source`. |

| `createLoggerMock(options?)` | Meaning |
| --- | --- |
| `logger` | A full `Logger` — `trace`…`error`, `addSink`, `setLevel`, `setEnabled`, `getConfig`. |
| `calls` / `atLevel(l)` / `atLeast(l)` / `last()` / `messages()` | Recorded calls. `atLeast` uses the library's own `LOG_LEVEL_PRIORITY`, so it cannot drift from the real filter. |
| `sinks` | Sinks registered through `addSink`, still live. |
| `reset()` | Drops calls and sinks and restores the initial `level` / `enabled`. |

> **Source note.** Neither double reproduces the real pipeline's behaviour — no dedupe, no throttling, no
> fingerprinting. If you are testing **your** code's calls, use these. If you are testing that a record
> reaches storage, use the real thing with a memory repository:
>
> ```ts
> import { createMemoryRepository } from '@codewithrajat/rm-logvault/testing';
>
> const repository = createMemoryRepository();
> initTelemetry({ appName: 'test', repository, shortcut: false });
>
> const error = new Error('boom');
> captureError(error);
> captureError(error, { tags: { route: '/orders' } });  // enriches, does not duplicate
> await flushTelemetry();
>
> expect(repository.errors.all()).toHaveLength(1);
> expect(repository.errors.all()[0]?.tags?.['route']).toBe('/orders');
> ```
>
> `createMemoryRepository` mirrors the IndexedDB semantics exactly, including `mergeContext` and its
> pending-only rule, so that test is testing real logic rather than a stub.

## See also

- [worker and dynamic-import failures](./07-workers-and-dynamic-imports.md) — the two capture paths the
  global handlers cannot see.
- [the recipes and choosing between them](./03-recipes-and-deciding.md) — asserting which path captured
  what.
- [events, context builders and named sinks](./04-events-and-context-builders.md) — the `record:dropped`
  event alongside the other five.
- [lifecycle hooks and automation](./03-lifecycle-hooks-and-automation.md) — `beforeCapture`, which is the
  last chance to drop or rewrite a record.
- [docs/API.md](../../../docs/API.md#captureerror) — the dedupe rule in the reference, next to the rest of
  the `captureError` contract.
- [docs/DECISIONS.md](../../../docs/DECISIONS.md#d-034--a-repeat-of-a-known-failure-is-throttled-per-fingerprint-ahead-of-the-global-limit)
  — why the throttle runs before the global limiter, and what was rejected.
