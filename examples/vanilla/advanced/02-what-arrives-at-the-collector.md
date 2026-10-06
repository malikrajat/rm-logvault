# What actually arrives at your collector

**Problem it solves:** you turned uploads on by following [advanced](./README.md), and now you want to
know what the request contains, whether your tags survived the trip, and how to prove from the browser
that a record was delivered rather than merely created. The capture recipes themselves are in
[basic](../basic/01-capture-recipes.md) — this page follows them one step further, over the network.

**What you will learn:**

- The exact request body, field by field.
- Where `tags`, `extra` and `source` end up in it, and which of them the library sets.
- How to watch a batch leave from the page itself, without a debugger.
- Why a "sync now" button is the fastest way to answer "did anything arrive?".

## The integration this page assumes

The capture side is unchanged — the same four recipes, the same two imports. What changed is only the
options object, which is the point of the tier:

```ts
// src/main.ts — still the first statement of the entry module
import { initTelemetry } from '@codewithrajat/rm-logvault';

initTelemetry({
  appName: 'checkout',
  appVersion: '1.4.0',
  buildId: '2026-01-01.3',
  environment: 'production',
  mode: 'remote',
  rest: {
    errorsUrl: '/telemetry/errors',
    logsUrl: '/telemetry/logs',
    batchSize: 20,
    intervalMs: 10_000,
  },
});
```

Nothing about placement changes: uploading is configuration, not architecture. `buildId` is hard-coded
here to keep the example self-contained; reading it from a build-time variable is
[the environment layer](../config/02-environment-variables.md).

Nothing in the recipes changes either. A plain `throw`, `withErrorCapture` and `captureError` all
produce a record; the only difference is that the record can now leave the device.

## The request body

Every upload is one JSON object. Errors and logs go to **different URLs** but share the envelope:

```json
{
  "schemaVersion": 1,
  "kind": "error",
  "sentAt": 1735689600000,
  "app": {
    "appName": "checkout",
    "appVersion": "1.4.0",
    "buildId": "2026-01-01.3",
    "environment": "production"
  },
  "records": [ /* the captured records */ ]
}
```

| Field | Source | Notes |
| --- | --- | --- |
| `schemaVersion` | constant `1` | The wire format's version, not your app's. |
| `kind` | `'error'` or `'log'` | Which of the two endpoints this is. |
| `sentAt` | clock at send time | Milliseconds since epoch. |
| `app.*` | your `initTelemetry` options | `buildId` is the one that answers "which deploy". |
| `records` | the batch | At most `rest.batchSize` entries, default `50`, here `20`. |

Supplying either URL implies `mode: 'remote'`; the default `mode` is `'local'`, in which case nothing is
uploaded at all. The two URLs are separate because `kind` is the only thing a shared endpoint has to
tell the two streams apart.

## One record, and where everything went

This is the record shape your recipes produce. The interesting columns are the last two:

```json
{
  "schemaVersion": 1,
  "id": "e_9f2c…",
  "fingerprint": "7d1a4c09b2e5f831",
  "name": "Error",
  "message": "[checkout] order 8123 could not be submitted",
  "stack": "Error: …\n    at recipeTwo (src/main.ts:31:11)",
  "source": "event-handler",
  "severity": "error",
  "category": "runtime",
  "handled": false,
  "thrownType": "error",
  "uploadStatus": "pending",
  "uploadAttempts": 0,
  "timestamp": 1735689598123,
  "firstSeen": 1735689598123,
  "lastSeen": 1735689598123,
  "occurrenceCount": 1,
  "page": { "url": "https://app.example/checkout", "route": "/checkout", "pageLoadId": "p_3c81…" },
  "environment": {
    "appName": "checkout",
    "buildId": "2026-01-01.3",
    "environment": "production",
    "viewport": "1280x720",
    "online": true
  },
  "tags": { "flow": "checkout", "step": "submit" },
  "extra": { "cartId": "c_8123" }
}
```

| What you wrote | Where it lands | Who set it |
| --- | --- | --- |
| `tags: { flow, step }` | `tags` | You |
| `extra: { cartId }` | `extra` | You |
| — (recipe 1: a bare `throw`) | `source: "window"` | The global handler |
| `withErrorCapture(…)` | `source: "event-handler"` | The default context of that call |
| — | `fingerprint`, `page.*`, `timestamp`, `firstSeen`/`lastSeen` | The library, automatically |
| — | `uploadStatus`, `uploadAttempts` | The outbox, as it retries |

The optional fields are genuinely optional: `stack` is absent when there is none to report,
`causes`/`componentStack` come from the error value itself, and `location`, `api` and `event` are
populated only when the failure carried one.

Two of these are worth a second look:

- **`fingerprint` is what makes a count meaningful.** Repeated occurrences of the same failure do not
  append rows: `occurrenceCount` increments and the `[firstSeen, lastSeen]` window widens, so a bug
  that fired a thousand times is one row with a thousand in it. Aggregation only ever touches
  `pending` rows, so a record that has been claimed for upload is immutable — its count cannot change
  underneath a request that is already in flight.
- **`uploadStatus` is per record, not per batch.** One rejected batch does not lose the records in it:
  they go back to `pending`, or to `failed` if the failure was terminal. A `401` is terminal, and
  `rest.onTerminalFailure(status, records)` fires **once per batch**, not once per record.

> **Source note.** `severity` defaults to `'error'`, `handled` to `false` and `category` to `'runtime'`.
> Nothing in the vanilla tier overrides them for you — there is no framework adapter path here. The only
> way to change them is a field on the `ErrorContext` you pass to `captureError` or `withErrorCapture`,
> which accepts `source`, `severity`, `category`, `componentStack`, `location`, `api`, `event`, `tags`,
> `extra`, `handled` and `timestamp`.

> **Source note.** For a cross-origin script without CORS the browser exposes only `"Script error."`
> and a null error. The library reports the location and tags it `crossOrigin: 'true'` rather than
> inventing a stack. A record that reads `Script error.` is the browser withholding information, not a
> bug in the capture.

## Watching the request leave, from the page

The shortest honest version: a status line, a "sync now" button, and the browser's own Network tab.

```html
<!-- index.html -->
<p id="status">…</p>
<button type="button" id="refresh">Refresh status</button>
<button type="button" id="upload">Upload now</button>
```

```ts
import { getTelemetryStatus, syncTelemetry } from '@codewithrajat/rm-logvault';

const statusLine = document.querySelector('#status');

const renderStatus = (): void => {
  const current = getTelemetryStatus();
  if (statusLine) {
    statusLine.textContent =
      `mode=${current.mode} pending errors=${current.pending.errors} ` +
      `logs=${current.pending.logs} sync=${current.syncStatus}`;
  }
};

document.querySelector('#refresh')?.addEventListener('click', renderStatus);
document.querySelector('#upload')?.addEventListener('click', () => {
  void syncTelemetry().finally(renderStatus); // awaits the upload, then re-reads the status
});

renderStatus(); // once at start-up, so the line is never blank
```

`syncTelemetry()` flushes the in-memory writes into the store, then awaits the upload run, so
`syncStatus` has already settled by the time its promise resolves — `.finally(renderStatus)` is what makes
the line show the outcome (`ok`, `retry` or `error`) rather than a stale value. The separate **Refresh
status** button is there because a *scheduled* flush can change the status without a click, and the
in-page line is a convenience rather than a replacement for the Network tab.

In application code you rarely need `flushTelemetry()` at all: it drains in-memory writes down to
IndexedDB, touches no network, and is only needed before a page unload (`pagehide`) — an upload started
during unload is frequently cancelled by the browser while local writes complete.

Read the pair in this order, and the three states are distinguishable without a debugger:

| What you see | What it means |
| --- | --- |
| `pending errors=1`, then `0` after **Upload now** | The record was created and delivered. |
| `pending` never reaches `0`, `sync=retry` | Sending is failing — look at the response status. |
| `pending` stays `0` and nothing sent | The record was never created. That is a capture problem, not a network one. |

`syncStatus` is `'idle' | 'running' | 'offline' | 'ok' | 'retry' | 'error'`, which is the difference
between "nothing to send" and "sending failed". A `retry` is not an error: the outbox is waiting for
its next attempt, having honoured exponential backoff or the server's `Retry-After`. `getTelemetryStatus()`
reads in-memory state only — it never reads IndexedDB — so polling it on a timer is cheap.

## Proving it with the report instead

<kbd>Ctrl</kbd>+<kbd>Shift</kbd>+<kbd>Alt</kbd>+<kbd>D</kbd> builds a report from everything **recorded**,
whether or not it has been uploaded. That makes it the perfect answer to "is my capture broken or my
upload broken?":

| Report shows | Upload state | Conclusion |
| --- | --- | --- |
| The record | `pending` | Capture works; the upload has not run or is failing. |
| The record | absent | You are looking at a different build, origin or `dbPrefix`. |
| Nothing | — | Capture never happened. Check where `initTelemetry` runs. |

The button path, for phones and tablets where there is no keyboard, is in
[advanced](./README.md#the-export-button):

```ts
import { exportDiagnosticsReport } from '@codewithrajat/rm-logvault';

document.querySelector('#export')?.addEventListener('click', () => {
  void exportDiagnosticsReport(); // returns a promise; it is not synchronous
});
```

## The three mistakes this tier makes

1. **`mode` left at the default.** `'local'` means no network egress at all, and the two URLs are then
   only used for inference. Nothing to send is not the same as nothing to send *yet*.
2. **A `401` treated as retryable.** It is terminal: the records are marked `failed` and the outbox
   stops rather than looping forever. Re-arm them after refreshing the token with
   `retryFailedTelemetry()`, which touches no network at all.
3. **Endpoints swapped.** `errorsUrl` takes error records and `logsUrl` takes log records; the `kind`
   field in the envelope is how your collector tells them apart. Pointing both at one endpoint is fine;
   pointing them at each other's is not.

## Try it yourself

1. Set `mode: 'remote'` and point `errorsUrl` at any endpoint that answers `202` and prints its body.
2. Click recipe 2 from [the capture recipes](../basic/01-capture-recipes.md) — the one with tags.
3. Press **Upload now**, or wait out `intervalMs`.
4. Check the printed body: your tags are in `records[0].tags`, and `records[0].source` is
   `event-handler`.

Then change the endpoint to answer `401` and click again. The records move to `failed`, `syncStatus`
becomes `error`, and nothing is retried — which is the behaviour you want, and the reason
`onTerminalFailure` exists. Everything between capture and a successful `POST` is in
[the outbox](./01-the-outbox.md).

## Related

- [advanced](./README.md) — the options used above, with units and defaults.
- [basic/01-capture-recipes.md](../basic/01-capture-recipes.md) — the four recipes these records come from.
- [the outbox](./01-the-outbox.md) — batching, backoff, and which statuses are terminal.
- [retention and payload budgets](./02-retention-and-payload-budgets.md) — what eventually deletes a
  record that never made it out.
