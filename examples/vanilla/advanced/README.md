# advanced — vanilla TypeScript

**Problem it solves:** records are being captured, but they are only on the device. You need them to
reach a collector, and you need to decide — on purpose, rather than by inheriting a default — how much
the library keeps.

**What you will learn:**

- How `mode` decides between "device only" and "device plus upload", and why it is inferred.
- Where errors and logs actually go, and why the two endpoints are separate.
- Retention and payload budgets: the two limits, which one wins, and what happens at the boundary.
- The button-based replacement for the keyboard shortcut, which is the only option on a phone.

## The integration

The same single call as [basic](../basic/README.md), in the same place, with more options:

```ts
import { exportDiagnosticsReport, initTelemetry } from '@codewithrajat/rm-logvault';

initTelemetry({
  appName: 'my-app',
  mode: 'remote',
  rest: {
    errorsUrl: '/telemetry/errors',
    logsUrl: '/telemetry/logs',
    batchSize: 20,
    intervalMs: 10_000,
  },
  errors: { retentionDays: 14, maxRecords: 200, maxPayloadBytes: 8_192 },
  logs: {
    enabled: true,
    level: 'info',
    retentionDays: 1,
    maxRecords: 500,
    maxPayloadBytes: 2_048,
  },
});
```

Nothing about *placement* changes. Uploading is configuration, not architecture.

## `mode` — the decision that matters most

| Value | What it does |
| --- | --- |
| `'local'` **(default)** | IndexedDB only. **No network request is made at all** — not on error, not on a flush, not on unload. |
| `'remote'` | Write to IndexedDB first, then upload. |

You rarely have to set it: supplying `rest.errorsUrl`, `rest.logsUrl` or a custom `rest.transport`
implies `'remote'`, and supplying none implies `'local'`. It is still worth setting explicitly, because
it is the one option a reviewer will look for.

`mode` follows whether uploads are actually **enabled**, not merely whether a URL is present. So a
configuration with both endpoints filled in and `rest.enabled: false` reports `'local'` — which is what
is happening, and which also stops the library from printing a "no endpoint is configured" note that
would be false.

## `rest.*` — where records go

| Option | Unit | Default | Meaning, and when to change it |
| --- | --- | --- | --- |
| `errorsUrl` | absolute `http(s)` or a relative path | none | Where error batches are posted. |
| `logsUrl` | absolute `http(s)` or a relative path | none | Where log batches are posted. Separate from the errors URL **on purpose**: give only one, and only that kind uploads. |
| `enabled` | boolean | `true` when a URL or transport exists | Switch uploads off while leaving the URLs in place — the "filled in the endpoints but not ready to send" state. |
| `batchSize` | records per request | `50` | Set to `20` here: smaller requests, finer retry granularity, and a narrower blast radius when a status is terminal. |
| `intervalMs` | milliseconds | `30000` | The floor between flush runs **after a success**. It is not a poll interval — failures are governed by exponential backoff and by a server `Retry-After`. |
| `credentials` | `'omit' \| 'same-origin' \| 'include'` | `'same-origin'` | `fetch` credentials mode. `'include'` is never implied, so cross-origin cookies are a decision you make explicitly. |
| `getHeaders` | `() => Record<string, string> \| Promise<…>` | none | Awaited per request, so a rotating token works. A provider that throws is treated as **retryable**, not terminal. |
| `requireHttps` | boolean | `false` | `true` rejects plain `http:` endpoints except on localhost. |

For what happens between a capture and a successful upload — and what the retry schedule actually is —
see [the outbox](./01-the-outbox.md).

## `errors.*` / `logs.*` — how much is kept

| Option | Unit | Default | Meaning |
| --- | --- | --- | --- |
| `enabled` | boolean | `true` | Keep this store at all. `false` leaves `logger.*` console output working but stores nothing. |
| `retentionDays` | days | `7` (errors), `3` (logs) | Delete rows older than this. **`0` disables age-based deletion** and leaves only the count cap. Fractions work: `0.5` is twelve hours. |
| `maxRecords` | rows | `500` (errors), `2000` (logs) | Hard cap; the oldest surplus is deleted. `0` is rejected as a mistake, because "store nothing" is spelled `enabled: false`. |
| `maxPayloadBytes` | UTF-8 bytes, per record | `16384` (errors), `4096` (logs) | The budget for **one** record — bytes, not characters, so `'é'` costs 2. |
| `logs.level` | level | `'warn'` | The **persist** threshold. Raised to `'info'` here, so `logger.info(...)` is stored. `logger.debug(...)` is neither printed nor stored at the default console level — see [levels and thresholds](../config/03-levels-and-thresholds.md). |

The defaults are not arbitrary: logs are more voluminous and less precious, so they get a shorter
window and a larger cap. This example overrides both stores to make the point that they are choices.

Which of the two limits applies, and what a payload budget does when it is exceeded, is the subject of
[retention and payload budgets](./02-retention-and-payload-budgets.md).

## The export button

<kbd>Ctrl</kbd>+<kbd>Shift</kbd>+<kbd>Alt</kbd>+<kbd>D</kbd> is a keyboard listener, so it does not
exist on a phone or a tablet. This is the supported path there, and it produces exactly the same
self-contained HTML file:

```ts
document.querySelector('#export')?.addEventListener('click', () => {
  void exportDiagnosticsReport();
});
```

The report flushes pending writes first, so pressing it never loses the record you are complaining
about. It contains every stored error and log with the page URL, user agent and application metadata,
and its viewer groups errors by fingerprint and drills down from a page load to an error to the logs
around it.

## Watching it work

Point the two URLs at your own collector, or at a throwaway endpoint while you are evaluating. To see
the outbox behave, stop the collector, trigger a few failures, then start it again: the records queue in
IndexedDB and drain once uploads succeed. That is the write-ahead outbox, and it is the reason a network
failure never costs you a record.

## Next

- What the collector receives: [what arrives at your collector](./02-what-arrives-at-the-collector.md).
- The full configuration surface: [../config/README.md](../config/README.md).
- The same tier for React: [../../react/advanced/README.md](../../react/advanced/README.md).
