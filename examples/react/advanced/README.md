# advanced — React 19

**Problem it solves:** the same two questions as the vanilla tier — where do records go, and how much is
kept — in a React application. The structure is deliberately **identical** to
[basic](../basic/README.md), because that is the lesson: turning on uploads is configuration, not
architecture.

**What you will learn:**

- The same integration as tier 1, with uploads and retention set explicitly.
- That placement does not change: module top level, before `createRoot`, still.
- Calling `exportDiagnosticsReport()`, `syncTelemetry()` and `retryFailedTelemetry()` from components.
- How to poll `getTelemetryStatus()` from a component without causing a re-render storm.

## The integration

`src/main.tsx` differs from [basic](../basic/README.md) **only inside the options object**:

```tsx
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { initTelemetry } from '@codewithrajat/rm-logvault';
import { TelemetryErrorBoundary, reactRootErrorHandlers } from '@codewithrajat/rm-logvault/react';
import { App } from './App';

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
    maxPayloadBytes: 4_096,
  },
});

createRoot(document.getElementById('root') as HTMLElement, {
  ...reactRootErrorHandlers({ tags: { shell: 'app' } }),
}).render(
  <StrictMode>
    <TelemetryErrorBoundary fallback={(error, reset) => /* … */}>
      <App />
    </TelemetryErrorBoundary>
  </StrictMode>,
);
```

Everything about *placement* is unchanged from [basic](../basic/README.md): module top level, before
`createRoot`, with the root handlers and a boundary. If you are tempted to move the call into a
provider "because this is the advanced tier" — do not; that is a downgrade, for the reasons given in
tier 1.

## What is new relative to basic

| Option | Unit | Default | Why this example changes it |
| --- | --- | --- | --- |
| `mode: 'remote'` | — | `'local'` | Turns uploads on. Without it, the two URLs below are only used for the inference. |
| `rest.errorsUrl` / `logsUrl` | absolute `http(s)` or a path | none | Two endpoints, so errors and logs can go to different collectors. |
| `rest.batchSize` | records per request | `50` | Set to `20` for smaller requests and finer retry granularity. |
| `rest.intervalMs` | milliseconds | `30000` | The floor between flushes **after a success**; failures use exponential backoff and `Retry-After`. |
| `errors.retentionDays` / `maxRecords` / `maxPayloadBytes` | days / rows / UTF-8 bytes | `7` / `500` / `16384` | Set explicitly to show they are choices, not constants. |
| `logs.level` | level | `'warn'` | Raised to `'info'` so `logger.info(...)` is stored. `logger.debug(...)` is neither printed nor stored at the default console level — see [levels and thresholds](../config/03-levels-and-thresholds.md). |

The reasoning behind each of these — including why `maxPayloadBytes` is a ladder rather than a
truncation point, and which limit deletes a row first — is framework-independent and written out in the
vanilla tree:

- [the outbox](../../vanilla/advanced/01-the-outbox.md) — batching, backoff, terminal versus retryable.
- [retention and payload budgets](../../vanilla/advanced/02-retention-and-payload-budgets.md) — the two
  limits and the reduction ladder.

## Exporting a report from a component

<kbd>Ctrl</kbd>+<kbd>Shift</kbd>+<kbd>Alt</kbd>+<kbd>D</kbd> is a keyboard listener, so it does not
exist on a phone or a tablet. In React the replacement is an ordinary event handler:

```tsx
import { useState } from 'react';
import { exportDiagnosticsReport } from '@codewithrajat/rm-logvault';

export function ExportButton() {
  const [busy, setBusy] = useState(false);

  return (
    <button
      type="button"
      disabled={busy}
      onClick={() => {
        setBusy(true);
        void exportDiagnosticsReport().finally(() => {
          setBusy(false);
        });
      }}
    >
      Download diagnostics
    </button>
  );
}
```

The `finally` matters: `exportDiagnosticsReport()` returns a promise, and leaving it unhandled is both a
lint problem and the reason a button gets stuck in a disabled state. It flushes pending writes first, so
pressing it never loses the record you are complaining about.

The manual-sync and retry calls, and the one distinction that trips people up in an unload handler, are
in [export and manual sync](./01-export-and-manual-sync.md).

## Polling the status from a component

```tsx
import { useEffect, useState } from 'react';
import { getTelemetryStatus } from '@codewithrajat/rm-logvault';

export function StatusLine() {
  const [status, setStatus] = useState(() => getTelemetryStatus());

  useEffect(() => {
    const timer = setInterval(() => {
      setStatus(getTelemetryStatus());
    }, 1000);
    return () => {
      clearInterval(timer);
    };
  }, []);

  return (
    <p>
      mode={status.mode} storage={String(status.storage)} pending={status.pending.errors}/
      {status.pending.logs} sync={status.syncStatus}
    </p>
  );
}
```

Two things make this safe to write naively:

- `getTelemetryStatus()` reports **in-memory** state and never reads IndexedDB, so polling costs
  nothing measurable.
- The returned object is a fresh snapshot, so `setStatus` with a new object re-renders — which is what
  you want for a status line, and is why it should live in a leaf component rather than near the root.

`status.syncStatus` is `'idle' | 'running' | 'offline' | 'ok' | 'retry' | 'error'`, which is the
quickest way to tell "nothing to send" apart from "sending failed".

## Watching it work

There is no mock collector in this tree — these are guides, not a running app. To see a batch arrive,
point the two URLs at your own collector, or set up a throwaway endpoint that returns `202` and logs the
request body.

The request body field by field, the record shape, and three ways to prove a record was delivered from
inside the browser are in
[what arrives at your collector](./02-what-arrives-at-the-collector.md). Read it before you debug a
"nothing arrived" report, because it separates a capture failure from an upload failure.

A useful failure to try deliberately: point `errorsUrl` at an endpoint that returns `401`. The batch is
classified **terminal**, the records are marked `failed` rather than retried forever, and
`rest.onTerminalFailure` is where you would refresh a token and call `retryFailedTelemetry()`.

## Next

- What the collector receives: [what arrives at your collector](./02-what-arrives-at-the-collector.md).
- The full configuration surface: [../config/README.md](../config/README.md).
- The adapter in depth, plus the seams: [../more-advanced/README.md](../more-advanced/README.md).
- The same tier with no framework:
  [../../vanilla/advanced/README.md](../../vanilla/advanced/README.md).
