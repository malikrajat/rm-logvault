# Observing and extending — events, context builders, sinks and export formats

**Problem it solves:** the recorder writes to IndexedDB and reports nothing. In an App Router app that
leaves three concrete gaps: no way to show an in-app error count without polling, no way to teach the
library that *your* `code: 'ALARM_NOT_FOUND'` is a domain error, and no way to export anything but the
HTML report — which matters when the person triaging the bug wants JSONL for `jq` or CSV for a
spreadsheet.

**What you will learn:**

- `setupTelemetry` and the flat aliases, and where the call belongs in the App Router.
- `handle.events`: subscribing in a client component, and the four guarantees that make it safe.
- Why `on()` before `initTelemetry` is a no-op, and why that matters most in React.
- `registerErrorContextBuilder` for domain classification, plus `installBuiltinContextBuilders()`.
- The sink registry: listing and detaching sinks by key.
- Exporting as JSONL and CSV from a button, with progress.

> **Everything on this page is client-side.** IndexedDB and `document` do not exist during SSR, so every
> snippet belongs in a `'use client'` module or the provider effect — see
> [01-framework-adapter.md](./01-framework-adapter.md).

## The short form: `setupTelemetry` and flat aliases

The nested configuration is precise but not short. The shortest real setup is three levels deep to
express two facts:

```ts
// The long form. Correct, and more nesting than the facts deserve.
initTelemetry({
  appName: 'checkout',
  rest: { errorsUrl: '/api/telemetry/errors', logsUrl: '/api/telemetry/logs' },
  logs: { level: 'info' },
});
```

`setupTelemetry` is the flat equivalent, and it belongs wherever `initTelemetry` belongs — the effect
inside your client provider:

```tsx
// app/providers.tsx
'use client';

import { useEffect, type ReactElement, type ReactNode } from 'react';
import { destroyTelemetry, setupTelemetry } from '@codewithrajat/rm-logvault';

export function Providers({ children }: { readonly children: ReactNode }): ReactElement {
  useEffect(() => {
    setupTelemetry({
      app: 'checkout',
      version: process.env.NEXT_PUBLIC_APP_VERSION,
      url: '/api/telemetry',   // feeds BOTH errors and logs
      level: 'info',           // the PERSIST level, = logs.level
      maxErrors: 1_000,
      env: 'NEXT_PUBLIC_',     // still composable with the env layer
    });

    return (): void => {
      destroyTelemetry();
    };
  }, []);

  return <>{children}</>;
}
```

`setupTelemetry` is **not** a second configuration system. It forwards to `initTelemetry` unchanged, so
the two are interchangeable, can be mixed in one codebase, and are idempotent in exactly the same way —
a second call returns the *same handle object* rather than reconfiguring. Anything the flat shape cannot
express (a custom `repository`, `beforeCapture`, a transport) still goes through `initTelemetry`.

Every alias also works directly on `initTelemetry`:

| Flat alias | Maps to | Notes |
| --- | --- | --- |
| `url` | `rest.errorsUrl` **and** `rest.logsUrl` | The one-collector case. |
| `errorUrl` / `logUrl` | `rest.errorsUrl` / `rest.logsUrl` | Split them. These win over `url`. |
| `headers` | `rest.getHeaders` | Awaited per request. |
| `level` | `logs.level` | The **persist** level, not the console level. |
| `consoleLevel` | `logs.consoleLevel` | What gets printed. |
| `captureConsole` | `logs.captureConsole` | Default `false`. |
| `maxErrors` / `maxLogs` | `errors.maxRecords` / `logs.maxRecords` | Rows retained. |
| `errorRetentionDays` / `logRetentionDays` | `errors.retentionDays` / `logs.retentionDays` | Days. |
| `app` / `version` / `build` | `appName` / `appVersion` / `buildId` | Stamped onto every record. |

### Precedence runs inside-out

**nested option > flat alias > env > built-in default.** So a nested value beats its flat alias, which
beats the environment, which beats the default:

```ts
setupTelemetry({
  url: '/api/telemetry',           // both kinds go here…
  rest: { errorsUrl: '/api/errors' }, // …except errors, which go here instead.
});
// errors → /api/errors      logs → /api/telemetry
```

> **Source note.** An **invalid** value falls *through* to the next candidate rather than stopping the
> chain — an unrecognised level string or an empty URL is treated as absent, exactly as the
> "a bad value is ignored" rule says. So
> `setupTelemetry({ level: 'error', logs: { level: 'verbose' } })` resolves to `'error'`, not to the
> default. The explicit long name also beats the short one: `{ appName: 'a', app: 'b' }` is `'a'`.

## `handle.events`: observing captures

`setupTelemetry` and `initTelemetry` both return a handle with an `events` member. Subscribe **in a
client component, after the provider's effect has run**.

Because the provider creates the emitter and a sibling component needs to reach it, the App Router shape
is a small client module that both import — a module-level store holding the **same** emitter object:

```tsx
// app/telemetry.ts — a client module, imported by the provider and the components
'use client';

import type { EventEmitter } from '@codewithrajat/rm-logvault';

export const telemetryStore: { events: EventEmitter | null } = { events: null };
```

```tsx
// app/providers.tsx
'use client';

import { useEffect, type ReactElement, type ReactNode } from 'react';
import { destroyTelemetry, setupTelemetry } from '@codewithrajat/rm-logvault';
import { telemetryStore } from './telemetry';

export function Providers({ children }: { readonly children: ReactNode }): ReactElement {
  useEffect(() => {
    const handle = setupTelemetry({ app: 'checkout', url: '/api/telemetry' });
    telemetryStore.events = handle.events;

    return (): void => {
      telemetryStore.events = null;
      destroyTelemetry();
    };
  }, []);

  return <>{children}</>;
}
```

```tsx
// app/error-badge.tsx — subscribes to the emitter the provider created
'use client';

import { useEffect, useState, type ReactElement } from 'react';
import { telemetryStore } from './telemetry';

export function ErrorBadge(): ReactElement {
  const [count, setCount] = useState(0);

  useEffect(() => {
    const events = telemetryStore.events;
    // `null` before the provider's effect runs. Returning here is correct, but see
    // the Source note below: a component that mounts first must re-run this effect
    // once the emitter exists.
    if (events === null) return;

    return events.on('error:captured', (event) => {
      setCount((current) => current + 1);
      // `fingerprint` is the stable grouping key; `severity` and `source` come free.
      void event.fingerprint;
      void event.severity;
    });
  }, []);

  return <span>{count} errors recorded</span>;
}
```

### The event catalogue

| Event | Fires when | Payload |
| --- | --- | --- |
| `error:captured` | an error record is accepted | `recordId`, `fingerprint`, `severity`, `source`, `category`, `handled`, `occurrenceCount` |
| `log:written` | a log passes the persist level | `recordId`, `level`, `message` (**already sanitized**) |
| `sync:started` | an explicit `syncTelemetry()` begins, per kind | `kind`, `recordCount` |
| `sync:completed` | a kind's upload pass finishes | `kind`, `uploaded`, `retried`, `failed` |
| `sync:failed` | a kind had terminally-failed records | `kind`, `status`, `recordCount` |
| `record:dropped` | the rate limiter discarded captures | `kind`, `reason`, `count` |

Every payload also carries `timestamp`.

`onAny` receives all six; `event.type` narrows, so no cast is needed:

```tsx
'use client';

import { useEffect, type ReactElement } from 'react';
import { telemetryStore } from './telemetry';

export function SyncIndicator(): ReactElement {
  useEffect(() => {
    const events = telemetryStore.events;
    if (events === null) return;

    return events.onAny((event) => {
      switch (event.type) {
        case 'sync:completed':
          console.log(`uploaded ${String(event.uploaded)} ${event.kind}`);
          break;
        case 'record:dropped':
          // A gap in the vault, with the reason, so a UI can explain it.
          console.warn(`dropped ${String(event.count)} ${event.kind}: ${event.reason}`);
          break;
        default:
          break;
      }
    });
  }, []);

  return <></>;
}
```

### Four guarantees, and why they matter in React

1. **A throwing listener cannot break the capture it was notified about.** Each listener runs in its own
   `try`/`catch`, so a bad subscriber cannot stop the error from being persisted. That is what makes it
   safe to subscribe from a component you do not fully control.
2. **An async listener's rejection is contained.** Return a promise and a rejection goes to the library's
   internal diagnostics (`onInternalError`) — never an unhandled rejection that Next's dev overlay
   would blame on you.
3. **Nested emission is bounded.** A listener that emits is delivered **once, asynchronously**; further
   nesting is dropped rather than recursed into. Without this, `onAny(() => logger.warn(...))` — which
   writes a log record, which emits `log:written`, which logs… — would hang the tab.
4. **Unsubscribing during dispatch is well-defined.** The subscriber set is snapshotted, so returning
   `off()` from `useEffect` mid-dispatch is safe.

> **Source note.** `on()` and `onAny()` **while telemetry is not initialized are a no-op.** They return
> an unsubscribe function, but the listener is never registered and never called. This is the one that
> bites in React: a module-level `handle.events.on(...)` or a subscription in a component that renders
> *before* the provider's effect subscribes to nothing, silently. Always subscribe after
> `initTelemetry`/`setupTelemetry` has returned — from the same callback, or via a store like
> `telemetryStore` above. The `events` **object identity** survives `destroyTelemetry()`, so a captured
> reference keeps working across a re-initialization, but the **registrations are cleared**, so
> re-subscribe after every init.

> **Source note — honest scope.** Events report `captureError`/`logger` activity and explicit
> `syncTelemetry()` runs. The **automatic background flush does not emit** `sync:started` or
> `sync:completed`: those are framed as "the pass you asked for". Also, `sync:failed.status` is always
> `0`, meaning *not captured* — `FlushSummary` is a per-kind aggregate over several batches, so it
> carries no single status. Use `rest.onTerminalFailure(status, records)` when you need the real code.

### A Server Component cannot subscribe

```tsx
// app/page.tsx — a SERVER component. This is wrong, and it fails quietly.
import { telemetryStore } from './telemetry';

telemetryStore.events?.on('error:captured', () => {}); // never called on the server
```

There is no browser emitter in the server process, no `window`, and no IndexedDB — a server render
happens in a different runtime from the one your provider initialized in. Subscription **must** live in
a client component. The same rule covers `useEffect`, `useState` and every browser API.

## Teaching the library your error shapes

The library classifies the shapes it produces. It cannot know that `code === 'ALARM_NOT_FOUND'` is a
domain error, and it should not learn your vocabulary to find out. Register a builder once, in the
client bootstrap module, and **every** subsequent capture is classified — including ones your code never
sees, such as errors arriving through `window.onerror`.

```tsx
// app/providers.tsx
'use client';

import { useEffect, type ReactElement, type ReactNode } from 'react';
import {
  destroyTelemetry,
  registerErrorContextBuilder,
  setupTelemetry,
} from '@codewithrajat/rm-logvault';

export function Providers({ children }: { readonly children: ReactNode }): ReactElement {
  useEffect(() => {
    const unregister = registerErrorContextBuilder({
      name: 'alarms',
      canHandle: (error) => {
        const code = (error as { code?: unknown } | null)?.code;
        return typeof code === 'string' && code.startsWith('ALARM_');
      },
      build: (error) => ({
        source: 'api',
        category: 'runtime',
        severity: 'warning',
        tags: { domain: 'alarms', code: String((error as { code?: unknown }).code) },
      }),
    });

    setupTelemetry({ app: 'checkout', url: '/api/telemetry' });

    return (): void => {
      unregister();
      destroyTelemetry();
    };
  }, []);

  return <>{children}</>;
}
```

Rules that decide the outcome:

| Rule | Consequence |
| --- | --- |
| **Registration order**, first match wins | Register specific classifiers before general ones. |
| **The caller's explicit fields always beat the builder's** | A builder cannot override `source` on `captureError(err, { source: 'react' })`. |
| `tags` and `extra` **merge key-by-key**, caller wins | A builder saying `{ domain: 'alarms' }` and a call site saying `{ flow: 'checkout' }` end up together. |
| A throwing `canHandle` counts as **no match** | A third-party classifier cannot swallow a capture. |
| A throwing `build` **falls through** to the next builder | Same. |
| A duplicate `name` **replaces** the previous builder | Re-registering after a Fast Refresh is idempotent, not additive. |
| The registry is **process-wide** and **survives `destroyTelemetry`** | It describes the app, not an installation — so a remount does not lose it. |

That second row is the one to remember. Your existing explicit capture is untouched:

```tsx
'use client';

import { captureError } from '@codewithrajat/rm-logvault';

// The registration above returns `{ source: 'api', … }`, but this stays 'react'.
// An explicit call site always wins, so registering a builder can never silently
// relabel an integration you already described correctly.
captureError(new Error('boundary failed'), { source: 'react' });
```

### The built-in builders

```tsx
// app/providers.tsx
'use client';

import { useEffect } from 'react';
import { installBuiltinContextBuilders } from '@codewithrajat/rm-logvault';

useEffect(() => {
  // Registers timeout → http → type-error, in that order.
  const uninstall = installBuiltinContextBuilders();
  return uninstall;
}, []);
```

| Builder | Matches | Contributes |
| --- | --- | --- |
| `timeout` | `code: 'ETIMEDOUT' \| 'ECONNABORTED'`, or a timeout-shaped message (thrown strings included) | `category: 'timeout'`, `severity: 'warning'` |
| `http` | a `response` object with a numeric `status`, or a numeric `status` / `statusCode` | `category`, `severity`, `api`, tags `method` / `status` / `kind` |
| `type-error` | a `TypeError`, including cross-realm ones | `category: 'runtime'`, `severity: 'error'` |

Order matters: `timeout` is first because a timed-out request can also look like an HTTP failure, and
"timeout" is the more useful label. `type-error` is last so it cannot shadow either.

> **Source note.** **Nothing self-registers.** Importing the module has no effect until you call
> `installBuiltinContextBuilders()`. That is deliberate: upgrading the library must never change how your
> existing app classifies its errors as a side effect. The individual builders are exported too, so you
> can install one and not the others, or interleave your own domain classifiers before them.

## The sink registry: listing and detaching

`logger.addSink(sink)` is still **the** way to install a sink — it is what drives pre-init replay and the
re-entrancy guard. The registry is what sits behind it, so you can answer "what is attached?" and detach
by key from anywhere:

```tsx
// app/debug-sinks.tsx
'use client';

import { useState, type ReactElement } from 'react';
import { getSinkRegistry, logger } from '@codewithrajat/rm-logvault';

export function SinkInspector(): ReactElement {
  const [keys, setKeys] = useState<readonly string[]>(() => getSinkRegistry().keys());

  function addOverlay(): void {
    logger.addSink({ name: 'overlay', write: (record) => console.log(record.message) });
    setKeys(getSinkRegistry().keys());
  }

  function detach(name: string): void {
    const entry = getSinkRegistry()
      .list()
      .find((item) => item.name === name);
    if (entry !== undefined) getSinkRegistry().unregister(entry.key);
    setKeys(getSinkRegistry().keys());
  }

  return (
    <>
      <button type="button" onClick={addOverlay}>
        Add overlay sink
      </button>
      <button type="button" onClick={() => detach('overlay')}>
        Detach overlay
      </button>
      <ul>
        {keys.map((key) => (
          <li key={key}>{key}</li>
        ))}
      </ul>
    </>
  );
}
```

`addSink` generates the key itself — `` `${sink.name ?? 'sink'}#${n}` ``, where `n` is a counter. The
sequence suffix is what stops two sinks that declare the same `name` from replacing each other. The
library's own persistence sink is in there too, under
`@codewithrajat/rm-logvault-indexeddb#1`.

> **Source note.** Registering directly through `getSinkRegistry().register(key, sink)` bypasses pre-init
> replay and the re-entrancy guard, because those live in `logger.addSink`. Use the registry to *inspect*
> and to *detach*, and `addSink` to install.

## Export formats: JSONL and CSV from a button

The <kbd>Ctrl</kbd>+<kbd>Shift</kbd>+<kbd>Alt</kbd>+<kbd>D</kbd> shortcut does not exist on a phone, so
a button is the accessible route — and the format is yours to choose:

```tsx
// app/export-buttons.tsx
'use client';

import { useState, type ReactElement } from 'react';
import { exportDiagnosticsReport, type DiagnosticsFormat } from '@codewithrajat/rm-logvault';

export function ExportButtons(): ReactElement {
  const [progress, setProgress] = useState(0);

  async function run(format: DiagnosticsFormat): Promise<void> {
    // Reads IndexedDB and creates a Blob — browser only, hence 'use client'.
    const result = await exportDiagnosticsReport({
      format,
      pretty: format === 'json',        // ignored by 'jsonl', which must stay one-per-line
      redactAgain: true,                // optional documented second sanitisation pass
      onProgress: (processed, total) => setProgress(total === 0 ? 0 : processed / total),
      onExported: (ok) => {
        if (!ok) console.warn('export did not run');
      },
    });

    if (!result.ok) {
      // Returned early: no browser, nothing stored, or an export already in flight.
    }
    setProgress(0);
  }

  return (
    <>
      <button type="button" onClick={() => void run('html')}>
        Download report
      </button>
      <button type="button" onClick={() => void run('jsonl')}>
        Download JSONL
      </button>
      <button type="button" onClick={() => void run('csv')}>
        Download CSV
      </button>
      <button type="button" onClick={() => void exportDiagnosticsReport({ format: 'json', copyToClipboard: true })}>
        Copy JSON
      </button>
      <progress value={progress} max={1} />
    </>
  );
}
```

| Option | Type | Default | What it means |
| --- | --- | --- | --- |
| `format` | `'html' \| 'json' \| 'jsonl' \| 'csv'` | `'html'` | Self-contained report, one JSON document, one object per line, or one spreadsheet table. |
| `pretty` | `boolean` | `false` | Indents `'json'` **only** — deliberately ignored by `'jsonl'`. |
| `copyToClipboard` | `boolean` | `false` | Write to the clipboard instead of downloading. |
| `redactAgain` | `boolean` | `false` | Second sanitisation pass over already-sanitised records. |
| `filenamePrefix` | `string` | the shortcut's prefix, then `'diagnostics-report'` | File is `${prefix}-${timestamp}.${ext}`. |
| `onProgress` | `(processed, total) => void` | none | Once per 500 records and once at the end. |
| `onExported` | `(ok: boolean) => void` | none | Called with the outcome. A throwing callback is contained. |

The two machine formats differ in shape, and the choice is about what you will do with the file:

| Format | Shape | Reach for it when |
| --- | --- | --- |
| `'jsonl'` | One `{"kind":"error",…}` or `{"kind":"log",…}` per line | You will `grep`, `jq` or stream it into a log pipeline. |
| `'csv'` | **One** table for both kinds, a leading `kind` column, CRLF line endings | You will sort or pivot it in a spreadsheet. |

> **Source note.** `exportDiagnosticsReport` returns `Promise<{ ok, format, bytes }>`, **not**
> `Promise<boolean>` — a breaking change from earlier versions. `if (await exportDiagnosticsReport())`
> still works, because the object is always truthy, but that check no longer tells you whether the
> export ran. Test `result.ok`.

> **Source note — the CSV is safe to open.** A cell that begins with `=`, `+`, `-`, `@`, a tab or a
> carriage return is prefixed with an apostrophe, because Excel, Sheets and LibreOffice execute such a
> cell on open and an error message is attacker-influenced input. One table holds both kinds so the file
> can be sorted and pivoted; errors and logs leave the columns that do not apply empty.

> **Source note.** The report needs `document` to trigger the download and IndexedDB to read the
> records, so it is browser-only. On the server there is neither, and the call returns `ok: false`
> without throwing.

## Related

- The server boundary in full: [01-framework-adapter.md](./01-framework-adapter.md).
- Sending records to your own HTTP client: [05-using-the-http-client.md](./05-using-the-http-client.md).
- Encrypting what is stored: [06-encrypting-stored-records.md](./06-encrypting-stored-records.md).
- The environment layer these aliases sit alongside:
  [../config/01-environment-variables.md](../config/01-environment-variables.md).
- Every symbol with its signature: [docs/API.md](../../../docs/API.md).
