# advanced — Angular (standalone)

**Problem it solves:** the records are real, but they are trapped on the user's device — and the only
way to get a report out is a keyboard shortcut, which does not exist on a phone. This tier makes
records reach a collector and makes the report a button.

**What you will learn:**

- `mode: 'remote'` with **separate** endpoints for errors and logs.
- Why IndexedDB stays the outbox, so an unreachable collector costs nothing.
- Retention and caps: `retentionDays`, `maxRecords`, `maxPayloadBytes` — and which limit wins.
- The difference between the **persist** level and the **console** level.
- `exportDiagnosticsReport()` from a button, and why the shortcut is not enough.
- The four output formats, the options that shape them, and the return-type change.

## Turning on uploads

```ts
import { bootstrapApplication } from '@angular/platform-browser';
import { captureError, initTelemetry } from '@codewithrajat/rm-logvault';
import { provideTelemetryErrorHandler } from '@codewithrajat/rm-logvault/angular';
import { AppComponent } from './app/app.component';

initTelemetry({
  appName: 'my-app',
  appVersion: '2.4.1',
  environment: 'production',
  rest: {
    errorsUrl: '/api/telemetry/errors',
    logsUrl: '/api/telemetry/logs',
  },
});

bootstrapApplication(AppComponent, {
  providers: [provideTelemetryErrorHandler({ tags: { shell: 'checkout' } })],
}).catch((error: unknown) => {
  captureError(error, { source: 'manual', tags: { phase: 'bootstrap' } });
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
| `logs.maxPayloadBytes` | UTF-8 bytes | `4096` | The log equivalent of the error budget — and it is spent on `data` first. |

**Whichever limit is reached first deletes a row**: age first, then the oldest surplus above
`maxRecords`. Bytes are not a deletion trigger — they decide whether a record can be stored at all.

For a log record the reduction order is fixed, and worth knowing before you blame redaction for a
missing field: **`data` is dropped first**, then the message is shortened to 300 characters, then the
record is dropped and reported. So a log line that is over budget keeps its message and loses its
structured fields. [Writing a log call](../../../docs/API.md#writing-a-log-call) covers what belongs in
`data`, why `undefined` and `null` both store as `null`, and the reserved message prefixes that are
never persisted at all.

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

```ts
// src/app/app.component.ts
import { Component, signal } from '@angular/core';
import { exportDiagnosticsReport } from '@codewithrajat/rm-logvault';

@Component({
  selector: 'app-root',
  template: `
    <button type="button" (click)="downloadReport()" [disabled]="busy()">
      Download diagnostics
    </button>
    @if (percent() > 0 && percent() < 100) {
      <progress [value]="percent()" max="100"></progress>
    }
  `,
})
export class AppComponent {
  protected readonly busy = signal(false);
  protected readonly percent = signal(0);

  public async downloadReport(): Promise<void> {
    this.busy.set(true);
    try {
      const result = await exportDiagnosticsReport({
        format: 'html',
        onProgress: (processed, total) => {
          this.percent.set(total === 0 ? 100 : Math.round((processed / total) * 100));
        },
      });
      // `result` is { ok, format, bytes } — NOT a boolean.
      if (!result.ok) {
        // The export returned early: no browser, nothing stored, or one already in flight.
      }
    } finally {
      this.busy.set(false);
    }
  }
}
```

| Option | Type | Default | What it means |
| --- | --- | --- | --- |
| `format` | `'html' \| 'json' \| 'jsonl' \| 'csv'` | `'html'` | HTML is the report a person can open; JSON is one document; JSONL is one compact object per line; CSV is one wide table. |
| `copyToClipboard` | `boolean` | `false` | Write to the clipboard instead of downloading. |
| `pretty` | `boolean` | `false` | Indent the JSON output. **Applies to `'json'` only** — ignored by `'jsonl'`, where an indented object would break one-record-per-line. |
| `redactAgain` | `boolean` | `false` | Second sanitisation pass over the already-sanitised records. |
| `filenamePrefix` | `string` | the shortcut's prefix, then `'diagnostics-report'` | The downloaded file is `${prefix}-${timestamp}.${ext}`. |
| `onProgress` | `(processed, total) => void` | none | Called once per 500 records and once at the end. |
| `onExported` | `(ok: boolean) => void` | none | Called after an export that ran. **Not** called when the export returned early. |

| `format` | Output | Extension | Good for |
| --- | --- | --- | --- |
| `'html'` | self-contained report with the JSON payload embedded | `.html` | sending to a person |
| `'json'` | `{ schemaVersion, generatedAt, app, page, errors, logs }` | `.json` | a script, or your own viewer |
| `'jsonl'` | one `{"kind":"error"\|"log",...}` per line | `.jsonl` | `grep`, `jq`, a log pipeline |
| `'csv'` | one wide table for both kinds, leading `kind` column | `.csv` | a spreadsheet |

> **Source note.** **The return type changed** from `Promise<boolean>` to
> `Promise<{ ok, format, bytes }>`, so the older `const written = await exportDiagnosticsReport()` no
> longer means what it reads like. `if (await exportDiagnosticsReport())` still works, because the object
> is truthy — but check `result.ok` explicitly, which is also where `format` and `bytes` come from.

> **Source note.** `'csv'` neutralises spreadsheet formula injection: a cell beginning with `=`, `+`,
> `-`, `@`, a tab or a carriage return is prefixed with an apostrophe. Excel, Sheets and LibreOffice
> execute such a cell on open, and an error message is attacker-influenced input.

It resolves an object, never `true`/`false` directly. It never throws and never rejects.

## Framework notes for Angular

- **`initTelemetry` before `bootstrapApplication`** — unchanged from [basic](../basic/README.md).
  Turning on uploads does not move the call.
- **A button is just a component method.** No `@angular/forms` and no `HttpClient` are involved.
- **Gate it if the report is sensitive.** The `shortcut.allow` gate covers the keyboard shortcut; for a
  button, guard the method with your own authorisation check.
- **`ErrorHandler` still logs to the console.** The adapter reports first and then calls `console.error`,
  so enabling uploads does not change what you see in DevTools.
- **Zone consideration.** `exportDiagnosticsReport()` is async and touches no Angular state unless you
  assign its result, so it needs no special handling.

## What this tier deliberately does not cover

- **The full option surface, units, and how values reach an Angular bundle.** [config](../config/README.md).
- **Replacing the store or the transport.** [more-advanced](../more-advanced/README.md).

## Next

- What the collector receives: [what arrives at your collector](./02-what-arrives-at-the-collector.md).
- Every option with its unit and default: [config](../config/README.md).
- The same tier for another framework: [../../vue/advanced/README.md](../../vue/advanced/README.md),
  [../../nextjs/advanced/README.md](../../nextjs/advanced/README.md).
