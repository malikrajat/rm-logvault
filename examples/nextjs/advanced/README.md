# advanced — Next.js App Router

**Problem it solves:** the records are real, but they are trapped on the user's device — and the only
way to get a report out is a keyboard shortcut, which does not exist on a phone. This tier makes
records reach a collector and makes the report a button.

**What you will learn:**

- `mode: 'remote'` with **separate** endpoints for errors and logs.
- Why IndexedDB stays the outbox, so an unreachable collector costs nothing.
- Retention and caps: `retentionDays`, `maxRecords`, `maxPayloadBytes` — and which limit wins.
- The difference between the **persist** level and the **console** level.
- `exportDiagnosticsReport()` from a button, and why the shortcut is not enough.

## Turning on uploads

```tsx
// app/providers.tsx
'use client';

import { useEffect, type ReactElement, type ReactNode } from 'react';
import { destroyTelemetry, initTelemetry } from '@codewithrajat/rm-logvault';

export function Providers({ children }: { readonly children: ReactNode }): ReactElement {
  useEffect(() => {
    initTelemetry({
      appName: 'my-app',
      appVersion: '2.4.1',
      environment: 'production',
      rest: {
        errorsUrl: '/api/telemetry/errors',
        logsUrl: '/api/telemetry/logs',
      },
    });

    return (): void => {
      destroyTelemetry();
    };
  }, []);

  return <>{children}</>;
}
```

Supplying either URL implies `mode: 'remote'`, so the `mode` option is not needed. Set it explicitly
when you want to be certain, or to force uploads **off** while leaving the URLs in place:

```ts
initTelemetry({ appName: 'my-app', mode: 'local', rest: { errorsUrl: '/api/telemetry/errors' } });
```

> **Source note.** `mode` follows whether uploads are actually *enabled*, not whether a URL is present.
> URLs configured and then switched off with `rest.enabled: false` report `'local'`, because that is
> what is happening — and the library stays silent rather than reporting a missing endpoint that exists.

### A separate endpoint per kind

`errorsUrl` and `logsUrl` are independent on purpose. Errors and logs have different volumes, different
retention, and usually different consumers — an error tracker and an observability pipeline. Give only
one and only that kind uploads; the other keeps filling its local store.

**IndexedDB is always written first.** A record reaches the store before any network call is attempted,
so a collector that is down, slow, or never configured costs you nothing but disk. Uploads retry with
exponential backoff and honour a server `Retry-After`.

### A relative path is resolved in the browser

`errorsUrl: '/api/telemetry/errors'` resolves against your own origin, which is what you want when a
route in the same Next app accepts the batches. Uploads come from the client, so that route must be a
**route handler** (`app/api/telemetry/errors/route.ts`), not a server action, and it must accept a
`POST` from the browser. Use an absolute `https://` URL to send records somewhere else entirely.

## Retention, caps and payload budgets

| Option | Unit | Default | What it decides |
| --- | --- | --- | --- |
| `errors.retentionDays` | days | `7` | Age at which an error row is deleted. `0` disables age-based deletion. |
| `errors.maxRecords` | rows | `500` | Hard cap on retained errors. `0` is rejected as a mistake; use `errors.enabled: false` to store nothing. |
| `errors.maxPayloadBytes` | UTF-8 bytes | `16384` | Per-record budget. Exceeding it starts the reduction ladder; a record that cannot be reduced is dropped and reported. |
| `logs.retentionDays` | days | `3` | Shorter than errors by default: logs are more voluminous and less precious. |
| `logs.maxRecords` | rows | `2000` | Larger than errors for the same reason. |
| `logs.maxPayloadBytes` | UTF-8 bytes | `4096` | The log equivalent of the error budget. |

**Whichever limit is reached first deletes a row**: age first, then the oldest surplus above
`maxRecords`. Bytes are not a deletion trigger — they decide whether a record can be stored at all.

```ts
initTelemetry({
  appName: 'my-app',
  errors: { retentionDays: 14, maxRecords: 1_000, maxPayloadBytes: 32_768 },
  logs: { retentionDays: 2, maxRecords: 5_000 },
  rest: { errorsUrl: '/api/telemetry/errors', logsUrl: '/api/telemetry/logs' },
});
```

## Log persistence, and the two levels

```ts
initTelemetry({
  appName: 'my-app',
  logs: { enabled: true, level: 'info', consoleLevel: 'error' },
});
```

| Option | Default | What it controls |
| --- | --- | --- |
| `logs.enabled` | `true` | Whether logs are stored **at all**. `false` leaves `logger.*` console output working and stores nothing. |
| `logs.level` | `'warn'` | The **persist** threshold — the minimum level written to IndexedDB. |
| `logs.consoleLevel` | **none** | The **console** threshold, applied at initialisation. With no default, initialising telemetry never changes console output on its own. |

They are independent, and that is the point: persisting `'info'` while printing only `'error'` is a
normal production shape. Avoid `logs.captureConsole: true` unless you want the library to wrap
`console.warn`/`console.error` — it changes a global.

## Exporting without a keyboard

The <kbd>Ctrl</kbd>+<kbd>Shift</kbd>+<kbd>Alt</kbd>+<kbd>D</kbd> shortcut is a keyboard listener, so it
does not exist on a phone or a tablet. Call the same export from a button — in a **client** component,
because it reads IndexedDB and writes a file:

```tsx
// app/report-button.tsx
'use client';

import type { ReactElement } from 'react';
import { exportDiagnosticsReport } from '@codewithrajat/rm-logvault';

export function ReportButton(): ReactElement {
  async function downloadReport(): Promise<void> {
    const result = await exportDiagnosticsReport({ format: 'html' });
    if (!result.ok) {
      // The export returned early: no browser, nothing stored, or one already in flight.
      return;
    }
    console.log(`wrote ${String(result.bytes)} bytes as ${result.format}`);
  }

  return (
    <button type="button" onClick={() => void downloadReport()}>
      Download diagnostics
    </button>
  );
}
```

> **Source note — breaking change.** `exportDiagnosticsReport` returns
> `Promise<{ ok, format, bytes }>`, **not** `Promise<boolean>`. `if (await exportDiagnosticsReport())`
> still compiles and still runs the export, because the object is always truthy — but that check no
> longer tells you whether it worked, because an early return is *also* truthy. Test `result.ok`.

| Option | Type | Default | What it means |
| --- | --- | --- | --- |
| `format` | `'html' \| 'json' \| 'jsonl' \| 'csv'` | `'html'` | HTML is the self-contained report a person can open; JSON is one document; JSONL is one object per line; CSV is one spreadsheet table. |
| `pretty` | `boolean` | `false` | Indents `'json'` **only** — ignored by `'jsonl'`, where indentation would break one-record-per-line. |
| `copyToClipboard` | `boolean` | `false` | Copy the output instead of downloading it, if the platform allows it. |
| `redactAgain` | `boolean` | `false` | Second sanitisation pass over the already-sanitised records. |
| `filenamePrefix` | `string` | the shortcut's prefix, then `'diagnostics-report'` | The downloaded file is `${prefix}-${timestamp}.${ext}`. |
| `onProgress` | `(processed, total) => void` | none | Called once per 500 records and once at the end — enough for a progress bar on a large vault. |
| `onExported` | `(ok: boolean) => void` | none | Called with the outcome. A throwing callback is contained. |

The two machine-readable formats suit different jobs:

| Format | Shape | Use it when |
| --- | --- | --- |
| `'jsonl'` | One `{"kind":"error",…}` / `{"kind":"log",…}` per line | You will `grep`, `jq` or stream it into a pipeline. |
| `'csv'` | One table for both kinds, a leading `kind` column | You will sort or pivot it in a spreadsheet. |

It never throws and never rejects. The report needs `document` to download and IndexedDB to read the
records, so it is browser-only; on the server the call resolves with `ok: false`. Full detail, including
the CSV formula-injection protection: [more-advanced/04-observing-and-extending.md](../more-advanced/04-observing-and-extending.md).

## Framework notes for Next.js

- **The provider effect is still the only correct place** for `initTelemetry` — see
  [basic](../basic/README.md). Uploads do not move it.
- **Every export and status call must be client-side.** `exportDiagnosticsReport()` reads IndexedDB and
  creates a Blob; on the server there is neither. A shared component that calls it needs `'use client'`.
- **Server components cannot read the vault.** A record written on the client is in the browser's
  IndexedDB, invisible to any server render. If you need the data server-side, upload it (this tier) and
  read it from your collector.
- **`NEXT_PUBLIC_` is what makes a variable reachable in the browser** — see
  [config/01-environment-variables.md](../config/01-environment-variables.md).
- **A short `rest.intervalMs` is wasted during SSR.** Sync only runs in the browser, so the interval is
  a client-side concern.

## What this tier deliberately does not cover

- **The full option surface, units, and the `NEXT_PUBLIC_` environment layer.**
  [config](../config/README.md).
- **Replacing the store or the transport.** [more-advanced](../more-advanced/README.md).
- **The observation surface and the machine-readable formats.**
  [more-advanced/04-observing-and-extending.md](../more-advanced/04-observing-and-extending.md) —
  `handle.events`, context builders, JSONL/CSV.

## Next

- What the collector receives: [what arrives at your collector](./02-what-arrives-at-the-collector.md).
- Every option with its unit and default: [config](../config/README.md).
- Watching captures live, and exporting JSONL or CSV:
  [more-advanced/04-observing-and-extending.md](../more-advanced/04-observing-and-extending.md).
- The same tier for another framework: [../../vue/advanced/README.md](../../vue/advanced/README.md),
  [../../angular/advanced/README.md](../../angular/advanced/README.md).
