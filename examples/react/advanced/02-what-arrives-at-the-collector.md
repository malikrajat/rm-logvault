# What actually arrives at your collector

**Problem it solves:** you turned uploads on by following [advanced](./README.md), and now you want to
know what the request contains, whether your tags survived the trip, and how to prove from the browser
that a record was delivered rather than merely created. The capture recipes themselves are in
[basic](../basic/01-capture-recipes.md) — this page follows them one step further, over the network.

**What you will learn:**

- The exact request body, field by field.
- Where `tags`, `extra` and `source` end up in it, and which ones the library sets.
- How to watch a batch leave from a React component, without a debugger.
- Why a "sync now" button is the fastest way to answer "did anything arrive?".

## The integration this page assumes

The capture side is unchanged — same three recipes, same two imports. What changed is only the options
object, which is the point of the tier:

```ts
// src/main.tsx
import { initTelemetry } from '@codewithrajat/rm-logvault';

initTelemetry({
  appName: 'checkout',
  appVersion: '1.4.0',
  buildId: import.meta.env['VITE_BUILD_ID'] ?? 'dev',
  environment: import.meta.env['VITE_APP_ENV'] ?? 'development',
  mode: 'remote',
  rest: {
    errorsUrl: '/telemetry/errors',
    logsUrl: '/telemetry/logs',
    batchSize: 20,
    intervalMs: 10_000,
  },
});
```

Nothing in the recipes changes. `captureError`, `withErrorCapture` and a plain `throw` all produce a
record; the only difference is that the record can now leave the device.

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

## One record, and where everything went

This is the record shape your three recipes produce. The interesting columns are the last two:

```json
{
  "schemaVersion": 1,
  "id": "e_9f2c…",
  "fingerprint": "7d1a4c09b2e5f831",
  "name": "Error",
  "message": "[checkout] order 8123 could not be submitted",
  "stack": "Error: …\n    at submit (Recipes.tsx:31:11)",
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

Two of these are worth a second look:

- **`fingerprint` is what makes a count meaningful.** Repeated occurrences of the same failure do not
  append rows: `occurrenceCount` increments and the `[firstSeen, lastSeen]` window widens, so a bug that
  fired a thousand times is one row with a thousand in it. That is how you sort a report by "what is
  actually hurting users" rather than by "what happened most recently".
- **`uploadStatus` is per record, not per batch.** One rejected batch does not lose the records in it —
  they go back to `pending`, or to `failed` if the failure was terminal, which is what
  [`onTerminalFailure`](./01-export-and-manual-sync.md) exists to handle.

> **Source note.** `severity` defaults to `'error'`, and `handled` to `false`. `reactRootErrorHandlers`
> is the one path that overrides both: `onUncaughtError` sets `severity: 'fatal'`, while
> `onCaughtError` and `onRecoverableError` set `handled: true` and a recoverable one is downgraded to
> `severity: 'warning'` with `tags: { recoverable: 'true' }`. So the same failure can be filed
> differently depending on which React path reported it, and that is deliberate.

## Watching the request leave, from a component

The shortest honest version: a status line, a "sync now" button, and the browser's own Network tab.

```tsx
import { useState } from 'react';
import { getTelemetryStatus, syncTelemetry } from '@codewithrajat/rm-logvault';

export function DeliveryPanel() {
  const [status, setStatus] = useState(() => getTelemetryStatus());
  const [syncing, setSyncing] = useState(false);

  return (
    <div>
      <p>
        mode={status.mode} pending errors={status.pending.errors} logs={status.pending.logs} sync=
        {status.syncStatus}
      </p>
      <button type="button" onClick={() => setStatus(getTelemetryStatus())}>
        Refresh status
      </button>
      <button
        type="button"
        disabled={syncing}
        onClick={() => {
          setSyncing(true);
          void syncTelemetry().finally(() => {
            setSyncing(false);
            setStatus(getTelemetryStatus());
          });
        }}
      >
        Upload now
      </button>
    </div>
  );
}
```

Read it in this order, and the three states are distinguishable without a debugger:

| What you see | What it means |
| --- | --- |
| `pending errors=1`, then `0` after **Upload now** | The record was created and delivered. |
| `pending` never reaches `0`, `sync=retry` | Sending is failing — look at the response status. |
| `pending` stays `0` and nothing sent | The record was never created. That is a capture problem, not a network one. |

`syncStatus` is `'idle' | 'running' | 'offline' | 'ok' | 'retry' | 'error'`, which is the difference
between "nothing to send" and "sending failed". A `retry` is not an error: the outbox is waiting for
its next attempt.

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
[export and manual sync](./01-export-and-manual-sync.md).

## The three mistakes this tier makes

1. **`mode` left at the default.** `'local'` means no network egress at all, and the two URLs are then
   only used for inference. Nothing to send is not the same as nothing to send *yet*.
2. **A `401` treated as retryable.** It is terminal: the records are marked `failed` and the outbox
   stops rather than looping forever. Re-arm them after refreshing the token.
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
`onTerminalFailure` exists.

## Related

- [advanced](./README.md) — the options used above, with units and defaults.
- [basic/01-capture-recipes.md](../basic/01-capture-recipes.md) — the four recipes these records come from.
- [the outbox](../../vanilla/advanced/01-the-outbox.md) — batching, backoff, and which statuses are terminal.
