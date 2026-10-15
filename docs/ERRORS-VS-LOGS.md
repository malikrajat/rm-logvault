# Errors vs. logs: which call writes which database

RM LogVault keeps **two** IndexedDB databases. They hold different record shapes, they are written by
different APIs, and they are never written by the same call. Almost every "the same row is in both
databases" report comes from one line of application code that calls an error API *and* a logging API
for one event — so this page states the classification as a rule, names every API on each side, and
shows what the duplication looks like when it happens.

One sentence: **`captureError` (and everything that funnels into it) writes the errors database;
`logger.*` and opt-in console capture write the logs database. For one event, call exactly one of
them.**

- [1. The two databases](#1-the-two-databases)
- [2. The rule](#2-the-rule)
- [3. The complete classification](#3-the-complete-classification)
- [4. Choosing between them](#4-choosing-between-them)
- [5. How the "duplicate" happens](#5-how-the-duplicate-happens)
- [6. When two records for one event is legitimate](#6-when-two-records-for-one-event-is-legitimate)
- [7. Why they are two databases](#7-why-they-are-two-databases)
- [8. Telling them apart in practice](#8-telling-them-apart-in-practice)
- [9. Source notes](#9-source-notes)

---

## 1. The two databases

Both names derive from `dbPrefix` (default `'rm-logvault'`), so changing that option changes both.

| Database                | Object store | Record     | What it is                                                                  |
| ----------------------- | ------------ | ---------- | --------------------------------------------------------------------------- |
| `${dbPrefix}-errors`    | `errors`     | `ErrorRecord` | One row per distinct failure. Repeats bump `occurrenceCount` instead of adding a row. |
| `${dbPrefix}-logs`      | `logs`       | `LogRecord`   | One row per saved log call, in call order (`seq`).                          |

The defaults differ because the two kinds have different lifetimes and costs:

|                | Errors                          | Logs                          |
| -------------- | ------------------------------- | ----------------------------- |
| Row cap        | `errors.maxRecords` — **500**   | `logs.maxRecords` — **2000**  |
| Retention      | `errors.retentionDays` — **7**  | `logs.retentionDays` — **3**  |
| Payload budget | `errors.maxPayloadBytes` — **16384** | `logs.maxPayloadBytes` — **4096** |
| Rate limit     | `errors.maxEventsPerMinute` — **120**, plus `errors.maxRepeatsPerMinute` — **12** per fingerprint | `logs.maxLogsPerMinute` — **600** |
| Persist level  | not level-filtered (an error is an error) | `logs.level` — **`'warn'`** by default |
| Write timing   | queued immediately — error records are not batched | batched: every `logs.writeBatchSize` (**50**) rows or `logs.writeFlushMs` (**1000 ms**) |
| Aggregation    | one row per fingerprint while the row is `pending` | never — every call is its own row |
| Upload         | `rest.errorsUrl`                | `rest.logsUrl`                |

They are separate databases rather than two stores in one database precisely because the policies
above are independent, and because either one can fail without taking the other down: a blocked
`${dbPrefix}-errors` upgrade does not stop logs from being written, which is a documented and
deliberately honest degradation ([BROWSER-SUPPORT.md](BROWSER-SUPPORT.md)).

## 2. The rule

```ts
// 1. Something went WRONG and you have the thrown value. -> errors database
import { captureError } from '@codewithrajat/rm-logvault';

try {
  await submitOrder();
} catch (error) {
  captureError(error, { tags: { flow: 'checkout' }, extra: { orderId } });
  showErrorToast(error);
}

// 2. You are recording WHAT HAPPENED, at a level. -> logs database
import { logger } from '@codewithrajat/rm-logvault';

logger.info('[Checkout] cart loaded', { items: 3 });
logger.warn('[Checkout] payment retrying', { attempt: 2 });
```

**Do not do both for the same statement.** That is the whole rule. If one line calls `captureError`
and also `logger.error` (or `console.error`) with the same failure, you have asked the library for two
records and it will faithfully write two — one in each database — and no amount of de-duplication will
merge them, because they are not the same kind of record and they do not share an `id`, a fingerprint
or a store.

The one-line version to remember when you are reading a stack trace in a hurry:

| You want                                                       | Call                                                              |
| -------------------------------------------------------------- | ----------------------------------------------------------------- |
| A row in `${dbPrefix}-errors`                                   | `captureError(error, ctx)` — or the helper that ends in it (§3.1) |
| A row in `${dbPrefix}-logs`                                     | `logger.info` / `logger.warn` / `logger.error`, and nothing else   |

## 3. The complete classification

### 3.1 Writes to the errors database

Every one of these ends in exactly one call to `captureError`, which is the single ingestion point for
`${dbPrefix}-errors`.

| API                                             | `source` on the record | Notes                                                                     |
| ----------------------------------------------- | ---------------------- | ------------------------------------------------------------------------- |
| `captureError(error, ctx)`                      | `'manual'` by default  | The one to reach for. Accepts any thrown value; `ctx.source` names the caller. |
| `captureApiError(error, startedAt?)`            | `'api'`                | An axios-shaped rejection, with the allow-listed request metadata.         |
| `captureFetchError(request, failure)`           | `'api'`                | A rejected `fetch`, or an explicit non-2xx `{ response }`.                 |
| `withErrorCapture(handler, ctx?)`               | `'event-handler'`      | Captures, then re-throws the same value.                                   |
| `withChunkCapture(route, loader)`               | `'chunk'`              | Names the screen whose lazy import failed; re-throws unchanged.            |
| `attachWorker(worker, options)`                 | `'worker'`             | From `@codewithrajat/rm-logvault/worker`. Never attached automatically.     |
| `reactRootErrorHandlers()`, `TelemetryErrorBoundary` | `'react'`         | From `/react`.                                                             |
| `createTelemetryVuePlugin()`                    | `'vue'`                | Chains Vue's `errorHandler` rather than replacing it.                      |
| `provideTelemetryErrorHandler()`                | `'angular'`            | Chains Angular's `ErrorHandler`, then delegates to `console.error` (see §5). |
| `attachAxios(...)`, `attachFetch(...)`          | `'api'`                | From `/axios` and `/fetch`.                                                |
| The TanStack Query adapter                      | `'query'`              | From `/react-query`.                                                       |

And the automatic paths, which need no call at all — all of them `handled: false`:

| Captured automatically                              | `source`             | On by default                        |
| --------------------------------------------------- | -------------------- | ------------------------------------ |
| An uncaught error (`window.onerror`, chained)       | `'window'`           | yes                                  |
| An unhandled promise rejection                      | `'unhandledrejection'` | yes                                |
| A failed dynamic import / `ChunkLoadError` / Vite preload error | `'chunk'` | yes                                |
| A failed `<script>`, `<link>` or `<img>` load       | `'resource'`         | no — `errors.captureResources: true` |
| A `securitypolicyviolation` event                   | `'csp'`              | no — `errors.captureCsp: true`       |

### 3.2 Writes to the logs database

| API                                                        | Record                    | Notes                                                                 |
| ---------------------------------------------------------- | ------------------------- | --------------------------------------------------------------------- |
| `logger.trace` / `debug` / `info` / `warn` / `error`       | `LogRecord` with `level`  | Saved only at or above `logs.level` (default `'warn'`).               |
| `console.warn(...)` / `console.error(...)`                 | `LogRecord` with `level`  | **Only** when `logs.captureConsole: true`. Nothing else is captured.  |
| `logSource.addSink(tracker.sink)` (the `logSource` option) | the host logger's record  | Records from your own logger, funnelled into the same store.          |

Three things follow from that table, and each one is a support question in its own right:

- **`logger.error(...)` is a log level, not error capture.** It writes a `LogRecord` with
  `level: 'error'` to `${dbPrefix}-logs` and **never** creates an `ErrorRecord` — not at any level, not
  for any argument type, including a real `Error`. This has been true since 1.0.0 and is stated in
  [API.md §logger](API.md#logger).
- **`console.log` and `console.info` are never captured**, even with `logs.captureConsole: true`. Only
  `console.warn` and `console.error` are wrapped.
- **The library's own console output is never stored.** The logger's console writer and the Angular
  adapter's delegation to `console.error` run inside an internal suppression window, so a console line
  the *library* prints can never become a log record. That is the 1.0.2 fix described in §5.

### 3.3 Writes to neither

Not every `logger` call becomes a row, and none of these is a bug:

| Situation                                                        | What happens                                                   |
| ---------------------------------------------------------------- | -------------------------------------------------------------- |
| The level is below `logs.level` (default `'warn'`)               | Printed to the console if the console level allows; not stored. |
| The message starts with a reserved prefix                        | Never stored: `[Telemetry]`, `[ErrorTracking]`, `[LogTracking]`, `[DiagnosticsExport]`. |
| `logs.enabled: false` / `errors.enabled: false`                  | That store is not written at all.                              |
| `consent()` returned anything but `true`                         | Dropped, fail-closed.                                          |
| `beforeCapture` / `beforeStore` returned `null`                  | Dropped on purpose by your own hook.                           |
| The rate limit was exhausted                                     | Dropped, with one summary line per window.                     |
| The record exceeded `maxPayloadBytes` at every reduction tier    | Dropped, reported as `payload-limit`.                          |
| A log record sits under 50 rows for under `writeFlushMs`         | Still in memory; `await flushTelemetry()` writes it.           |

## 4. Choosing between them

Ask what the *reader* of the diagnostics report needs:

1. **Is there a thrown value?** → `captureError`. It has a stack, a fingerprint, a severity and an
   occurrence count, and the report groups it.
2. **Is it a sentence about the state of the application?** → `logger.<level>`. It has a level, a
   message and a `data` array, and the report lists it in order next to the errors.
3. **Is it a failure you handle and continue from?** → `captureError` once, then do your handling. Do
   not add a `console.error` to "make sure it is logged" — that is exactly the duplication in §5.
4. **Do you need context to travel with the failure?** → `captureError(error, { tags, extra })`, not a
   preceding `logger.info`. Both records are stamped with the same `pageLoadId`, so the report already
   shows the log lines that surround an error; the leading `info` is not what carries the context.

```ts
// Correct: one event, one record, and the context travels with the failure.
try {
  await submitOrder(orderId);
} catch (error) {
  captureError(error, {
    source: 'manual',
    severity: 'error',
    tags: { flow: 'checkout' },
    extra: { orderId, step: 'payment' },
  });
  showErrorToast(error);
}
```

```ts
// Wrong: the same failure, filed twice — once in each database.
try {
  await submitOrder(orderId);
} catch (error) {
  captureError(error, { tags: { flow: 'checkout' } });
  logger.error('[Checkout] submitOrder failed', error); // a second row, in the other store
  console.error(error);                                  // and with captureConsole, a third
  showErrorToast(error);
}
```

## 5. How the "duplicate" happens

There are exactly three ways to end up with what looks like one entry in both databases. Two are
application code; one was a library defect, fixed in 1.0.2.

### A. Calling both APIs at one call site (the common one)

`captureError(error)` writes the `ErrorRecord`; `logger.error(msg, error)` writes a `LogRecord`. Two
calls, two stores, two rows — and because both records carry the same `pageLoadId`, same route and
roughly the same timestamp, the diagnostics viewer shows them next to each other with what looks like
the same message:

| Store    | `message`                   | `level` / `severity` |
| -------- | --------------------------- | -------------------- |
| `errors` | `payment declined`          | `severity: 'error'`  |
| `logs`   | `[Checkout] payment failed` | `level: 'error'`     |

**Fix:** delete one of the two calls. Keep `captureError`, because it is the one that groups repeats
and carries the fingerprint.

### B. `captureError` plus `console.error`, with `captureConsole` on

The same shape, with the browser console as the log side. With `logs: { captureConsole: true }`, every
`console.warn` and `console.error` in your application is stored — including the one you added next to
`captureError`. The log record is written with the message `[console]` and the argument itself in
`data`, which is why it can look like a malformed duplicate rather than a deliberate one:

```ts
try {
  submitOrder();
} catch (error) {
  captureError(error);
  console.error(error); // -> LogRecord { level: 'error', message: '[console]', data: [Error] }
}
```

**Fix:** either drop the `console.error`, or accept that it is a *log* line and say so in its message
so the two rows are distinguishable:

```ts
console.error('[Checkout] submitOrder threw; error record filed above');
```

If you only want the console output and not a second record, log through the library — `logger.error`
is a log call, so it is stored once and printed once.

### C. The Angular adapter's own `console.error`, and the console echo (library bugs, 1.0.2)

Two defects in the library's console-capture feature produced rows the application never asked for.
Both are fixed in **1.0.2**:

1. **The Angular adapter's delegation was captured.** `TelemetryErrorHandler.handleError` reports the
   failure with `captureError` and then delegates to `console.error`, exactly as Angular's default
   handler does, so that framework diagnostics are unchanged. With `logs.captureConsole: true`, that
   delegation was also stored as a `[console]` `LogRecord` in `logs` — so a project using both
   documented options got one Angular failure in **both** databases, with no application code at fault.
   The delegation now runs inside an internal suppression window: it still prints, it is never stored.
2. **A captured console call was printed twice.** The library's own console writer echoed the captured
   call, so `console.warn('hello')` printed `hello` *and* `[rm-logvault] hello`. A captured call is now
   persisted without the console echo.

If you are on 1.0.0 or 1.0.1 and you see `[console]` rows in `${dbPrefix}-logs` that you did not ask
for, this is the cause; upgrade to 1.0.2, or set `logs.captureConsole: false` in the meantime.

## 6. When two records for one event is legitimate

Sometimes you genuinely want both: an error record so the failure aggregates and can be triaged, and a
log record as a breadcrumb in a sequence. That is allowed — the library will not stop you, and it is
not a bug. It is a decision, so make it visible:

```ts
captureError(error, {
  tags: { flow: 'checkout', alsoLogged: 'true' }, // so a reader can tell this pair is deliberate
});

logger.error('[Checkout] submitOrder failed', error);
```

What you should not expect is for the two to be linked. They do not share an `id`, they do not share a
fingerprint, and one is not derived from the other. What they do share is `pageLoadId`, which is what
the diagnostics report uses to show "the logs recorded during this load" next to an error.

## 7. Why they are two databases

- **Aggregation is meaningful for failures and meaningless for a log trail.** An `ErrorRecord` carries
  `fingerprint`, `severity`, `category`, `handled`, `occurrenceCount`, `firstSeen` and `lastSeen`;
  repeats merge into one pending row. A `LogRecord` carries `level`, `message`, `data` and `seq`, and
  every call is its own appended row. Merging log calls would destroy the trail — which is what you
  actually read when you reconstruct what a user did before an error.
- **Different retention and volume.** Errors are kept 7 days and capped at 500 rows; logs are kept 3
  days and capped at 2000, because there are far more of them.
- **Different upload endpoints and shapes.** `rest.errorsUrl` and `rest.logsUrl` are separate routes
  with separate `kind` values in the batch envelope ([REST-CONTRACT.md](REST-CONTRACT.md)).
- **Different privacy weight.** Both are redacted by the same sanitizer before they are written, but a
  log row is free text an application chose to write, while an error row is a stack trace. Keeping them
  separable is what makes "delete the logs, keep the errors" or the reverse a possible retention
  decision.
- **Independent failure.** One database can be unavailable — a blocked upgrade, a quota, a private
  window — without the other being affected, and the status report tells you which one it was.

## 8. Telling them apart in practice

**In the diagnostics report.** The viewer has two tables. The errors table groups by fingerprint and
shows `severity`, `source` and `occurrenceCount`; the logs table shows `level`, `message` and the log's
`environment`. Selecting a page load filters both; selecting an error highlights the logs inside that
error's own time window. The `kind` of a row is therefore visible from which table it is in, never from
its message.

**In DevTools.** Both databases are listed under **Application → IndexedDB**; expand `${dbPrefix}-errors`
→ `errors`, or `${dbPrefix}-logs` → `logs`.

**From the console**, count both in one go:

```js
// typed into the DevTools console — not a file
const { getState, flushTelemetry } = await import('@codewithrajat/rm-logvault');

await flushTelemetry(); // the log batch may still be in memory
const repository = getState().repository;

const errors = await repository.errors.getAll();
const logs = await repository.logs.getAll();

console.table({
  'errors (ErrorRecord)': errors.ok ? errors.value.length : errors.reason,
  'logs (LogRecord)': logs.ok ? logs.value.length : logs.reason,
});

if (errors.ok) console.table(errors.value.map((r) => ({ kind: 'error', source: r.source, n: r.occurrenceCount, message: r.message })));
if (logs.ok) console.table(logs.value.map((r) => ({ kind: 'log', level: r.level, message: r.message })));
```

Two rows with the same message but different `kind` are the §5 pattern; a row whose `kind` is `log` and
whose `message` is `[console]` is either an application `console.error`/`console.warn` (case B) or, on
1.0.0/1.0.1, the Angular adapter (case C).

## 9. Source notes

- **1.0.2.** `logs: { captureConsole: true }` no longer captures the library's own console output. The
  Angular adapter's `console.error` delegation (case C1) and the console echo of a captured call
  (case C2) are both fixed. The internal mechanism and the alternatives that were rejected are recorded
  in [D-040](DECISIONS.md#d-040--console-capture-suppresses-the-librarys-own-console-output).
- **1.0.1.** `logger.error(msg, error)` was documented elsewhere as auto-capturing an `Error`. It never
  did: `logger` has always written to `${dbPrefix}-logs` and only that store. The claim was removed and
  the rule stated in [API.md §logger](API.md#logger), the README and
  [TROUBLESHOOTING.md](TROUBLESHOOTING.md#duplicate-records-appear).
- **`captureError` is the only application-facing API that writes the errors store.** Every adapter,
  global handler and helper above funnels into it; none of them writes a log record, and none is
  required in addition to it.

See also [API.md §logger](API.md#logger), [API.md §captureError](API.md#captureerror),
[ARCHITECTURE.md §2](ARCHITECTURE.md#2-the-capture-pipeline) for how each record is built, and
[TROUBLESHOOTING.md](TROUBLESHOOTING.md#duplicate-records-appear) for the diagnostic procedure.
