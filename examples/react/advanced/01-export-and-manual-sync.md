# Export and manual sync from React

**Problem it solves:** the shortcut only exists on a keyboard, a user should not have to wait for the
next flush to see their own bug report, and a terminal upload failure needs a human-defined recovery.
All three are ordinary event handlers in React.

## The three calls

| Call | What it does | Touches the network? |
| --- | --- | --- |
| `exportDiagnosticsReport(options?)` | Builds and downloads the report — HTML, JSON, JSONL or CSV. | No |
| `syncTelemetry()` | Claims a batch and uploads it now, instead of waiting for the interval. | Yes |
| `retryFailedTelemetry()` | Returns terminally-failed records to `pending`. | No — it only re-arms them |
| `flushTelemetry()` | Drains in-memory writes down to IndexedDB. | **No** |

`syncTelemetry()` and `flushTelemetry()` sound interchangeable and are not. That difference is the
whole point of the last section below.

## The report button

<kbd>Ctrl</kbd>+<kbd>Shift</kbd>+<kbd>Alt</kbd>+<kbd>D</kbd> is a keyboard listener, so on a phone or
a tablet it simply does not exist. This is the supported path there:

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

Two details worth copying:

- **`void` and `.finally`.** The call returns a promise. `void` marks it as deliberately not awaited
  (which is what a linter wants to see), and `finally` is what stops the button being stuck disabled if
  the export fails — for example when storage never opened.
- **The report is built after a flush**, so it includes writes still in memory. You are never looking at
  a report that is missing the record you are complaining about.

## Four formats, and the return type

`exportDiagnosticsReport` returns `{ ok, format, bytes }` — not a boolean, which is a **breaking** change.
`if (await exportDiagnosticsReport())` still works, because the object is truthy, but anything that
compared against `true` must read `.ok`.

| `format` | Output | Use it for |
| --- | --- | --- |
| `'html'` (default) | the self-contained report, payload embedded | sending to a support engineer |
| `'json'` | one document: `{ schemaVersion, generatedAt, app, page, errors, logs }` | programmatic ingest |
| `'jsonl'` | one compact object per line, `{"kind":"error",…}` / `{"kind":"log",…}` | `grep`, `jq`, a log pipeline |
| `'csv'` | one table for both kinds, leading `kind` column | a spreadsheet |

```tsx
import { useState } from 'react';
import { exportDiagnosticsReport } from '@codewithrajat/rm-logvault';

export function MachineReadableExport() {
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);

  return (
    <div>
      <button
        type="button"
        disabled={busy}
        onClick={() => {
          setBusy(true);
          void exportDiagnosticsReport({
            format: 'jsonl',
            onProgress: (processed, total) => {
              setNote(`Marshalled ${String(processed)} of ${String(total)}`);
            },
          })
            .then((result) => {
              setNote(result.ok ? `${String(result.bytes)} bytes written` : 'Export failed');
            })
            .finally(() => {
              setBusy(false);
            });
        }}
      >
        Download JSONL
      </button>
      {note !== '' && <p role="status">{note}</p>}
    </div>
  );
}
```

The other options are `pretty` (indent the JSON — it applies to `'json'` **only**), `copyToClipboard`
(write to the clipboard instead of downloading, returning `ok: false` rather than silently falling back to
a download), `redactAgain` (re-run the sanitizer over every record) and `filenamePrefix`.

> **Source note.** `pretty` is ignored by `'jsonl'` on purpose: an indented object would span several lines
> and break the one-record-per-line contract that makes the format greppable.

> **Source note.** The CSV export neutralises spreadsheet formula injection. A cell beginning with `=`,
> `+`, `-`, `@`, a tab or a carriage return is prefixed with an apostrophe, because Excel, Sheets and
> LibreOffice execute such a cell on open — and an error message is attacker-influenced input. The columns
> are listed in `DIAGNOSTICS_CSV_COLUMNS`.

## A "sync now" button

Useful while debugging, and the fastest way to confirm an outbox drains:

```tsx
import { useState } from 'react';
import { syncTelemetry } from '@codewithrajat/rm-logvault';

export function SyncNowButton() {
  const [syncing, setSyncing] = useState(false);

  return (
    <button
      type="button"
      disabled={syncing}
      onClick={() => {
        setSyncing(true);
        void syncTelemetry().finally(() => {
          setSyncing(false);
        });
      }}
    >
      Upload pending now
    </button>
  );
}
```

In production you rarely need this. Uploads already happen on an interval, on coming back online, and
when enough records accumulate. The button exists here because "nothing arrived at my collector" is much
easier to diagnose when you can force the attempt.

## Recovering from a terminal failure

A `401` will not fix itself, so the library marks those records `failed` and stops. The hook is where you
decide what to do about it:

```tsx
initTelemetry({
  rest: {
    errorsUrl: '/telemetry/errors',
    onTerminalFailure: (status, records) => {
      // status is the HTTP status; records are the ones that were marked failed.
      if (status === 401) {
        void refreshToken().then(() => retryFailedTelemetry());
      }
    },
  },
});
```

`onTerminalFailure` is called **once per batch**, not once per record, so a 50-record batch that fails
produces one call with 50 records in it. Refreshing the token and then re-arming is the intended shape;
see [the outbox](../../vanilla/advanced/01-the-outbox.md) for which statuses are terminal and why.

## The unload case — and the trap in it

The instinct is to add a `pagehide` handler that flushes. The trap is reaching for `syncTelemetry()`
there: an upload started during unload is frequently cancelled by the browser, because the page is going
away and the request has no owner. `flushTelemetry()` is the call that is safe in that position, because
it completes locally — writes have already been made durable in IndexedDB by the time the page dies.

```tsx
useEffect(() => {
  const onHide = () => {
    // Local only. This does NOT upload, and that is why it is safe here.
    void flushTelemetry();
  };

  window.addEventListener('pagehide', onHide);
  return () => {
    window.removeEventListener('pagehide', onHide);
  };
}, []);
```

If you genuinely need to send something during unload, that is what `keepalive` requests are for, and
the library's default transport handles it for bodies under 60 000 bytes during an unload flush. See the
numbers table in [the outbox](../../vanilla/advanced/01-the-outbox.md).

## Related

- [advanced](./README.md) — the options this page assumes are configured.
- [observing and extending](../more-advanced/04-observing-and-extending.md) — the `jsonl`/`csv` export
  buttons in a fuller component, plus `onProgress`.
- [more-advanced](../more-advanced/README.md) — replacing the transport these calls go through.
