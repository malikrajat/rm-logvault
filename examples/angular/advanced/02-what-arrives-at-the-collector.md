# What actually arrives at your collector (Angular)

**Problem it solves:** you turned uploads on by following [advanced](./README.md), and now you want to
know what the request contains, whether your tags survived the trip, and how to prove from the browser
that a record was delivered rather than merely created. The capture recipes themselves are in
[basic](../basic/01-capture-recipes.md) — this page follows them one step further, over the network.

**What you will learn:**

- The exact request body, field by field.
- Where `tags`, `extra` and `source` end up in it, and which ones the library sets.
- How to watch a batch leave from an Angular component, without a debugger.
- Why a "sync now" button is the fastest way to answer "did anything arrive?".

## The integration this page assumes

The capture side is unchanged — same four recipes, same component methods. What changed is only the
options object, which is the point of the tier:

```ts
// src/main.ts
import { bootstrapApplication } from '@angular/platform-browser';
import { captureError, initTelemetry } from '@codewithrajat/rm-logvault';
import { provideTelemetryErrorHandler } from '@codewithrajat/rm-logvault/angular';
import { AppComponent } from './app/app.component';
import { environment } from './environments/environment';

initTelemetry({
  appName: 'checkout',
  appVersion: '1.4.0',
  buildId: environment.buildId,
  environment: environment.environment,
  rest: {
    errorsUrl: '/telemetry/errors',
    logsUrl: '/telemetry/logs',
    batchSize: 20,
    intervalMs: 10_000,
  },
});

bootstrapApplication(AppComponent, {
  providers: [provideTelemetryErrorHandler({ tags: { shell: 'checkout' } })],
}).catch((error: unknown) => {
  captureError(error, { source: 'manual', tags: { phase: 'bootstrap' } });
});
```

Supplying either URL implies `mode: 'remote'`, so `mode` is not written here. `buildId` and
`environment` come from `src/environments/environment.ts`, swapped per configuration by
`fileReplacements` — a stock Angular browser build has no `import.meta.env`, so there is no
environment layer to read. See [config](../config/README.md) for that mechanism, and
[environment variables](../config/01-environment-variables.md) if you generate the values instead.

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

This is the record shape your four recipes produce. The interesting columns are the last two:

```json
{
  "schemaVersion": 1,
  "id": "e_9f2c…",
  "fingerprint": "7d1a4c09b2e5f831",
  "name": "Error",
  "message": "[checkout] order 8123 could not be submitted",
  "stack": "Error: …\n    at RecipesComponent.recipeTwo (recipes.component.ts:31:11)",
  "source": "angular",
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
  "tags": { "shell": "checkout" },
  "extra": { "cartId": "c_8123" }
}
```

| What you wrote | Where it lands | Who set it |
| --- | --- | --- |
| `tags: { shell: 'checkout' }` (provider context) | `tags` | You |
| `extra: { cartId }` at a call site | `extra` | You |
| — (a `throw` in a template handler) | `source: "angular"` | Angular's `ErrorHandler`, redirected by the adapter |
| — (a `throw` in a raw listener or timer) | `source: "window"` | the library's chained `window.onerror` |
| `withErrorCapture(…)` | `source: "event-handler"` | the default context of that call |
| — | `fingerprint`, `page.*`, `timestamp`, `firstSeen`/`lastSeen` | the library, automatically |
| — | `uploadStatus`, `uploadAttempts` | the outbox, as it retries |

Optional fields appear only when there is something to put in them: `claimedAt` on a claimed row,
`causes` when a rejection carried a `cause`, and `location`, `api`, `event` or `componentStack` when a
context supplied one. `componentStack` is part of the shape, but this adapter never generates one.

Two of these are worth a second look:

- **`fingerprint` is what makes a count meaningful.** Repeated occurrences of the same failure do not
  append rows: `occurrenceCount` increments and the `[firstSeen, lastSeen]` window widens, so a bug that
  fired a thousand times is one row with a thousand in it. That is how you sort a report by "what is
  actually hurting users" rather than by "what happened most recently". Aggregation only touches
  `pending` rows, so a row that has been claimed and is uploading is immutable — it cannot change under
  a request that is already in flight.
- **`uploadStatus` is per record, not per batch.** One rejected batch does not lose the records in it —
  they go back to `pending`, or to `failed` if the failure was terminal. `rest.onTerminalFailure(status,
  records)` is called once per batch, not once per record, so it is the place to notice that a whole
  batch was rejected; `retryFailedTelemetry()` re-arms the `failed` rows once the cause is fixed.

> **Source note.** `severity` defaults to `'error'` and `handled` to `false`, and the Angular adapter
> does not override either: it calls `captureError(error, { source: 'angular', …context })`, so a
> `severity` or `handled` you put in the provider's `context` wins over the default and nothing else
> does. A throw from a template handler is therefore filed as an unhandled error, not as a fatal one —
> `'fatal'` is a value you choose, not one Angular's path decides for you.

## Watching the request leave, from a component

The shortest honest version: a status line, a "sync now" button, and the browser's own Network tab.

```ts
// src/app/delivery-panel.component.ts
import { Component } from '@angular/core';
import { getTelemetryStatus, syncTelemetry } from '@codewithrajat/rm-logvault';

@Component({
  selector: 'app-delivery-panel',
  template: `
    <p>
      mode={{ status.mode }} pending errors={{ status.pending.errors }} logs={{ status.pending.logs }}
      sync={{ status.syncStatus }}
    </p>
    <button type="button" (click)="refresh()">Refresh status</button>
    <button type="button" [disabled]="syncing" (click)="uploadNow()">Upload now</button>
  `,
})
export class DeliveryPanelComponent {
  public status = getTelemetryStatus();
  public syncing = false;

  public refresh(): void {
    this.status = getTelemetryStatus();
  }

  public async uploadNow(): Promise<void> {
    this.syncing = true;
    try {
      await syncTelemetry();
    } finally {
      this.syncing = false;
      this.status = getTelemetryStatus();
    }
  }
}
```

`getTelemetryStatus()` is in-memory only and never reads IndexedDB, which is why polling it from a
component is cheap. Read the panel in this order, and the three states are distinguishable without a
debugger:

| What you see | What it means |
| --- | --- |
| `pending errors=1`, then `0` after **Upload now** | The record was created and delivered. |
| `pending` never reaches `0`, `sync=retry` | Sending is failing — look at the response status. |
| `pending` stays `0` and nothing sent | The record was never created. That is a capture problem, not a network one. |

`syncStatus` is `'idle' | 'running' | 'offline' | 'ok' | 'retry' | 'error'`, which is the difference
between "nothing to send" and "sending failed". A `retry` is not an error: the outbox is waiting for
its next attempt, with exponential backoff, and it honours a `Retry-After` header.

## Proving it with the report instead

<kbd>Ctrl</kbd>+<kbd>Shift</kbd>+<kbd>Alt</kbd>+<kbd>D</kbd> builds a report from everything **recorded**,
whether or not it has been uploaded. That makes it the perfect answer to "is my capture broken or my
upload broken?":

| Report shows | Upload state | Conclusion |
| --- | --- | --- |
| The record | `pending` | Capture works; the upload has not run or is failing. |
| The record | absent | You are looking at a different build, origin or `dbPrefix`. |
| Nothing | — | Capture never happened. Check where `initTelemetry` runs. |

On a phone there is no keyboard, so call the same export from a button. The method is `async` and
awaits it, because the export flushes first and then builds the file:

```ts
public async downloadReport(): Promise<void> {
  // Resolves { ok, format, bytes } — not a boolean. Never throws and never rejects.
  const result = await exportDiagnosticsReport();
  if (!result.ok) return;
  console.info(`wrote ${result.bytes} bytes as ${result.format}`);
}
```

The full component, the option table, the four formats and the file-naming rules are in
[advanced](./README.md#exporting-without-a-keyboard). For a machine-readable export — JSONL or CSV, with
progress — see
[observing and extending](../more-advanced/04-observing-and-extending.md#reports-in-four-formats).

## The three mistakes this tier makes

1. **`mode` left at the default.** `'local'` means no network egress at all, and the two URLs are then
   only used for inference. Nothing to send is not the same as nothing to send *yet*.
2. **A `401` treated as retryable.** It is classified terminal: the records are marked `failed` and are
   not retried forever. Re-arm them with `retryFailedTelemetry()` after refreshing the token — it does
   not upload and touches no network — then let the outbox run again.
3. **Endpoints swapped.** `errorsUrl` takes error records and `logsUrl` takes log records; the `kind`
   field in the envelope is how your collector tells them apart. Pointing both at one endpoint is fine;
   pointing them at each other's is not.

A fourth, Angular-shaped one: a bootstrap failure reported with `source: 'angular'`. It was not routed
by `ErrorHandler` — no handler exists that early — so `'manual'` is the honest label, and it is what the
`.catch(...)` above uses.

## Try it yourself

1. Set the two `rest` URLs to any endpoint that answers `202` and prints its body, and reload.
2. Click recipe 2 from [the capture recipes](../basic/01-capture-recipes.md) — the one with tags.
3. Press **Upload now**, or wait out `intervalMs`.
4. Check the printed body: your tags are in `records[0].tags`, and `records[0].source` is
   `event-handler` for that one, `angular` for a plain template-handler throw.

Then change the endpoint to answer `401` and click again. The records move to `failed`, `syncStatus`
becomes `error`, and nothing is retried — which is the behaviour you want, and the reason
`onTerminalFailure` exists.

## Related

- [advanced](./README.md) — the options used above, with units and defaults.
- [the capture recipes](../basic/01-capture-recipes.md) — the four recipes these records come from.
- [the outbox](../../vanilla/advanced/01-the-outbox.md) — batching, backoff, and which statuses are
  terminal.
