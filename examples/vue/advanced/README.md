# advanced — Vue 3

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

```ts
import { initTelemetry } from '@codewithrajat/rm-logvault';

initTelemetry({
  appName: 'my-app',
  appVersion: '2.4.1',
  environment: 'production',
  rest: {
    errorsUrl: '/api/telemetry/errors',
    logsUrl: '/api/telemetry/logs',
  },
});
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
does not exist on a phone or a tablet. Call the same export from a button:

```vue
<script setup lang="ts">
import { ref } from 'vue';
import { exportDiagnosticsReport } from '@codewithrajat/rm-logvault';

const busy = ref(false);

async function downloadReport(): Promise<void> {
  busy.value = true;
  const result = await exportDiagnosticsReport({ format: 'html' });
  busy.value = false;

  if (!result.ok) {
    // Nothing was exported: no browser storage, no records, or one already in flight.
  }
}
</script>

<template>
  <button type="button" :disabled="busy" @click="downloadReport">Download diagnostics</button>
</template>
```

| Option | Type | Default | What it means |
| --- | --- | --- | --- |
| `format` | `'html' \| 'json' \| 'jsonl' \| 'csv'` | `'html'` | HTML is the self-contained report a person can open; JSON is one document; JSONL is one record per line; CSV is one table for a spreadsheet. |
| `copyToClipboard` | `boolean` | `false` | Write to the clipboard instead of downloading, if the platform allows it. |
| `pretty` | `boolean` | `false` | Indent the JSON. **`'json'` only** — an indented `'jsonl'` would break its one-record-per-line contract. |
| `redactAgain` | `boolean` | `false` | Second sanitisation pass over the already-sanitised records. |
| `filenamePrefix` | `string` | the shortcut's prefix, then `'diagnostics-report'` | The downloaded file is `${prefix}-${timestamp}.${ext}`. |
| `onProgress` | `(processed, total) => void` | none | Called once per 500 records and once at the end, for a progress indicator. |
| `onExported` | `(ok: boolean) => void` | none | Called after an export that ran. |

It resolves a `DiagnosticsExportResult` — `{ ok, format, bytes }` — and never throws and never rejects.

> **Source note — breaking change.** This used to resolve a bare `boolean`. Code that only tested the
> result keeps working, because the object is truthy:
> `if (await exportDiagnosticsReport()) { … }`. Code that **stored** the boolean, or compared it with
> `=== true`, needs `result.ok`.
>
> ```ts
> // Still correct — the object is truthy when a file was written.
> if (await exportDiagnosticsReport()) { /* a file was written or copied */ }
>
> // Needs updating.
> const written: boolean = await exportDiagnosticsReport();   // type error
> const outcome = await exportDiagnosticsReport();
> if (outcome.ok) { /* … */ }
> ```

The `'csv'` writer neutralises **spreadsheet formula injection** — a cell beginning with `=`, `+`, `-`,
`@`, a tab or a carriage return is prefixed with an apostrophe, because Excel, Sheets and LibreOffice
execute such a cell on open and an error message is attacker-influenced input.

The four formats, and a component with a button for each, are in
[more-advanced/04-observing-and-extending.md](../more-advanced/04-observing-and-extending.md#exporting-the-vault-in-four-formats).

## Framework notes for Vue

- **`initTelemetry` first, then the plugin, then `mount()`** — unchanged from
  [basic](../basic/README.md). Turning on uploads does not move the call.
- **The export button belongs in a component.** It is a user action, not bootstrap work, so it can live
  wherever it is reachable — including a route only internal users can open.
- **Gate it if the report is sensitive.** `shortcut.allow` applies to the keyboard shortcut; for a
  button, guard the call site with your own authorisation check.
- **Vue's own warnings are stored too** when `captureWarnings` is left at its default, so the log store
  will contain framework warnings as well as your `logger.*` calls.

## What this tier deliberately does not cover

- **The full option surface, units, and the `VITE_` environment layer.** [config](../config/README.md).
- **Replacing the store or the transport.** [more-advanced](../more-advanced/README.md).

## Next

- What the collector receives: [what arrives at your collector](./02-what-arrives-at-the-collector.md).
- Every option with its unit and default: [config](../config/README.md).
- The same tier for another framework: [../../angular/advanced/README.md](../../angular/advanced/README.md),
  [../../nextjs/advanced/README.md](../../nextjs/advanced/README.md).
