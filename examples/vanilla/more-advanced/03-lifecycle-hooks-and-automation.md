# Lifecycle hooks and automation

**Problem it solves:** three jobs that belong to the application rather than the library — a policy
decision at the last moment before storage, visibility into the library's own failures, and the half of
retrying that needs credentials or a human decision.

## `beforeCapture` and `beforeStore` — the last point before storage

Called with the finished record, after sanitization, immediately before it is written:

```ts
initTelemetry({
  errors: {
    beforeCapture: (record) => {
      // Drop it entirely.
      if (record.tags?.['drop'] === 'yes') return null;

      // Or rewrite it.
      return { ...record, tags: { ...record.tags, reviewed: 'true' } };
    },
  },
  logs: {
    beforeStore: (record) => (record.message.includes('noisy') ? null : record),
  },
});
```

| You return | What happens |
| --- | --- |
| `null` | The record is dropped. Silently — no record, no notification. |
| A record | **That** record is stored, so this is a rewrite, not just a veto. |

There is no third case: the declared type is `(record) => ErrorRecord | null`, so a hook must return
either the record (possibly modified) or `null`. Returning nothing is a type error, and at runtime it is
not quietly treated as "keep the original" — the returned value replaces the record. If you only want to
inspect, return the record unchanged.

This is the right place for application-specific policy that has nothing to do with the library:
"never store anything from this route", "annotate everything from this tenant", "drop the known-noisy
ResizeObserver loop error".

> **Source note.** A hook that **throws** is reported through `onInternalError` and then **ignored** — the
> original record is stored. That is the correct failure mode for an error-reporting library (a broken
> policy hook must not cost you the error), but it does mean a hook that throws on every call is
> invisible unless you are listening on `onInternalError`. Note also that a hook returning `null` for
> *everything* is indistinguishable in the report from nothing having happened, so it is worth logging
> your own counter if you drop by policy.

Two limits worth remembering: the hooks are synchronous, and they run on the capture path. Anything slow
in them costs the capture, not just the record.

## `onInternalError` — notice when the library is failing

```ts
initTelemetry({
  appName: 'my-app',
  onInternalError: (stage, error) => {
    // Called at most once per stage per initialisation.
    myOwnReporter.capture(stage, error);
  },
});
```

`stage` is a short label naming what failed. The ones worth recognising:

| Stage | What it means |
| --- | --- |
| `'storage'` | IndexedDB could not be opened or used — records are not being kept. |
| `'persist'` | A write failed, including the quota-exhausted path. |
| `'sync'` | An upload run failed at the transport level. |
| `'payload-limit'` | A record exceeded its budget at every reduction tier and was **dropped**. |
| `'log-source'` | Your `logSource.addSink` implementation threw. |
| `'capture'` | Something in the capture path itself threw. |

Two properties make this safe to use in production: it is called **at most once per stage per
initialisation** (so a loop that drops ten thousand records produces one notification), and it receives
the library's own errors rather than yours — it is a reporting channel, not an error handler.

Pair it with `getTelemetryStatus().storage` when diagnosing: the status tells you the current state, and
`onInternalError` tells you when it changed.

## The application-owned half of retry

The library retries on its own while the page is open, with exponential backoff and `Retry-After`. What
it cannot do is know about your credentials or your schedule. Three event handlers cover that:

```ts
import {
  initTelemetry,
  retryFailedTelemetry,
  syncTelemetry,
} from '@codewithrajat/rm-logvault';

initTelemetry({
  appName: 'my-app',
  rest: {
    errorsUrl: 'https://collector.example/v1/errors',
    onTerminalFailure: (status, records) => {
      // A 4xx that retrying will not fix. Refresh the token, then re-arm.
      if (status === 401) {
        void refreshToken().then(() => retryFailedTelemetry());
      }
    },
  },
});

// Upload early rather than waiting for the next interval.
window.addEventListener('online', () => {
  void syncTelemetry();
});

// Periodically re-arm anything that failed terminally for a transient reason.
setInterval(() => {
  void retryFailedTelemetry();
}, 60_000);
```

| Call | Effect | Network? |
| --- | --- | --- |
| `syncTelemetry()` | Claims a batch and uploads it now. | Yes |
| `retryFailedTelemetry()` | Returns `failed` records to `pending`, so the next run picks them up. | No |
| `flushTelemetry()` | Drains in-memory writes into IndexedDB. | **No** |
| `exportDiagnosticsReport()` | Flushes, then downloads the HTML report. | No |

`onTerminalFailure` is called **once per batch**, not once per record, so 50 records that fail with a
`401` produce one call carrying all 50.

### The distinction that trips people up

`flushTelemetry()` and `syncTelemetry()` are not interchangeable, and using the wrong one in an unload
handler is a real bug:

```ts
// Correct in pagehide: completes locally, so it cannot be cancelled.
window.addEventListener('pagehide', () => {
  void flushTelemetry();
});

// Wrong here: an upload started while the page is going away is often cancelled.
window.addEventListener('pagehide', () => {
  void syncTelemetry();
});
```

For genuinely sending during unload, the default transport uses `keepalive` for bodies under 60 000
bytes during an unload flush. See the numbers table in [the outbox](../advanced/01-the-outbox.md).

## Related

- [more-advanced](./README.md) — the other seams.
- [advanced](../advanced/README.md) — the options these hooks sit alongside.
- [docs/API.md](../../../docs/API.md#lifecycle) — the full function reference.
