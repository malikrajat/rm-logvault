# Observing and extending telemetry from React

**Problem it solves:** a recorder that only writes to IndexedDB is hard to build a product on. You want
a badge that shows the error count, a store that mirrors new records, and a way to teach the classifier
about an error shape only *your* application understands — without replacing anything the library already
does.

**What you will learn:**

- `setupTelemetry()` and the flat aliases, and the inside-out precedence rule that governs them.
- `handle.events`: a `useSyncExternalStore` badge and a `useEffect` subscription, with the init-ordering
  caveat that will otherwise waste an afternoon.
- Registering an error context builder at module load, and why an explicit `source: 'react'` still wins.
- `installBuiltinContextBuilders()`, and why nothing self-registers.
- Listing, identifying and detaching logger sinks by key.
- Downloading JSONL and copying CSV from buttons.

## The short form: `setupTelemetry` and the flat aliases

The nested configuration is precise but not short. The shortest real setup is `rest.errorsUrl`,
`rest.logsUrl` and `logs.level` — three levels of nesting to express two facts. `setupTelemetry()` takes
the flat form:

```ts
// src/telemetry.ts — module level, imported by your entry file
import { setupTelemetry } from '@codewithrajat/rm-logvault';

setupTelemetry({
  app: 'checkout',
  version: '2.4.1',
  url: '/telemetry', // feeds BOTH rest.errorsUrl and rest.logsUrl
  level: 'info', // the PERSIST level
  maxErrors: 1000,
});
```

The same flat names work directly on `initTelemetry`, so the two are interchangeable and you can migrate
one option at a time:

```ts
import { initTelemetry } from '@codewithrajat/rm-logvault';

// These two are equivalent.
initTelemetry({ appName: 'checkout', rest: { errorsUrl: '/t', logsUrl: '/t' }, logs: { level: 'info' } });
initTelemetry({ appName: 'checkout', url: '/t', level: 'info' });
```

`setupTelemetry` is **not** a second configuration system: it forwards to `initTelemetry` unchanged. It is
idempotent in exactly the same way — a second call returns the same handle object and installs nothing.
Anything the flat form cannot express (adapters, `beforeCapture`, a custom `repository`) is still
available through `initTelemetry`.

| Flat alias | Maps to | Notes |
| --- | --- | --- |
| `url` | `rest.errorsUrl` **and** `rest.logsUrl` | the one-collector case |
| `errorUrl` / `logUrl` | `rest.errorsUrl` / `rest.logsUrl` | split the two endpoints |
| `headers` | `rest.getHeaders` | awaited per request |
| `level` | `logs.level` | the minimum level **persisted** |
| `consoleLevel` | `logs.consoleLevel` | console verbosity applied at init |
| `captureConsole` | `logs.captureConsole` | wraps `console.warn`/`console.error` |
| `maxErrors` / `maxLogs` | `errors.maxRecords` / `logs.maxRecords` | rows retained |
| `errorRetentionDays` / `logRetentionDays` | `errors.retentionDays` / `logs.retentionDays` | days |
| `app` / `version` / `build` | `appName` / `appVersion` / `buildId` | identity |

### The precedence rule runs inside-out

```
nested option   >   flat alias   >   environment   >   built-in default
```

So a nested value beats its own flat alias, which is what lets you set one collector and then override
just errors:

```ts
initTelemetry({
  url: '/everything', // both kinds go here…
  rest: { errorsUrl: '/errors' }, // …except errors, which go here.
});
// errors → /errors      logs → /everything
```

An invalid or empty nested value **falls through to the next candidate** rather than winning:

```ts
initTelemetry({ level: 'error', logs: { level: 'verbose' } });
// → 'error'. An unrecognised level is ignored, so the flat alias is consulted.
```

For the two flat spellings of the same thing, the explicit long name wins:
`{ appName: 'a', app: 'b' }` resolves to `'a'`.

> **Source note.** `level` is the **persist** level, not the console level. They are independent by design,
> so `logger.setLevel('off')` silences console output while persistence continues. If you want to quiet the
> console at initialisation, that is `consoleLevel` — and omitting it leaves the logger's own level
> untouched, which is why initialising telemetry never changes console output on its own.

## Events: a badge without polling

`initTelemetry` returns a handle whose `events` member is an emitter. Six events exist:
| Event | Fires when | Useful fields |
| --- | --- | --- |
| `error:captured` | an error record is accepted | `recordId`, `fingerprint`, `severity`, `source`, `category`, `handled`, `occurrenceCount` |
| `log:written` | a log passes the persist level | `recordId`, `level`, `message` (already sanitized) |
| `sync:started` | `syncTelemetry()` begins, per kind | `kind`, `recordCount` |
| `sync:completed` | a kind's upload pass finishes | `kind`, `uploaded`, `retried`, `failed` |
| `sync:failed` | a kind had terminally-failed records | `kind`, `status`, `recordCount` |
| `record:dropped` | the rate limiter discarded captures | `kind`, `reason`, `count` |

A module-level counter plus `useSyncExternalStore` renders it without polling — the same shape as the
`telemetry-health.ts` store in [the seams page](./02-repository-transport-and-hooks.md):

```ts
// src/telemetry-counter.ts — module level
import { initTelemetry } from '@codewithrajat/rm-logvault';

// Initialise at module scope, BEFORE subscribing: `on()` is a no-op on a handle
// whose telemetry is not initialized yet (see the note below).
export const telemetry = initTelemetry({ appName: 'checkout', url: '/telemetry' });

let count = 0;
let lastFingerprint = '';
let snapshot = { count: 0, lastFingerprint: '' };
const listeners = new Set<() => void>();

function emitChange(): void {
  // A new object every time, which is what makes the subscription fire.
  snapshot = { count, lastFingerprint };
  for (const listener of listeners) listener();
}

telemetry.events.on('error:captured', (event) => {
  count += 1;
  lastFingerprint = event.fingerprint;
  emitChange();
});

export function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

// Must return the CACHED object — a fresh one each call makes React re-render forever.
export function getSnapshot(): { count: number; lastFingerprint: string } {
  return snapshot;
}
```

```tsx
// src/ErrorCountBadge.tsx
import { useSyncExternalStore } from 'react';
import { getSnapshot, subscribe } from './telemetry-counter';

export function ErrorCountBadge() {
  const { count, lastFingerprint } = useSyncExternalStore(subscribe, getSnapshot);

  if (count === 0) return null;

  return (
    <span role="status" title={lastFingerprint}>
      {count} error{count === 1 ? '' : 's'} recorded
    </span>
  );
}
```

`useSyncExternalStore` is the React 18+ API for a value that lives outside React, without tearing. The
snapshot must be **cached**: returning a fresh object on every `getSnapshot()` call makes React re-render
without end.

> **Source note.** That store calls `initTelemetry` itself, which is fine but worth understanding:
> initialisation is **idempotent**, so whichever module gets there first wins and every later call returns
> the same handle and installs nothing. In a real app, put the single `setupTelemetry` call in one module
> (your entry file or `src/telemetry.ts`) and `import` the handle from there — a second `initTelemetry`
> with different options is silently ignored, not merged.

The same effect is cleaner when the store already lives in React state. This is the ordinary subscription
pattern, with the unsubscribe the emitter returns:

```tsx
// src/RecentErrors.tsx
import { useEffect, useState } from 'react';
import { telemetry } from './telemetry-counter';

export function RecentErrors() {
  const [recent, setRecent] = useState<readonly string[]>([]);

  useEffect(() => {
    // `on` returns an unsubscribe function; React uses it as the cleanup.
    const off = telemetry.events.on('error:captured', (event) => {
      setRecent((previous) => [event.fingerprint, ...previous].slice(0, 5));
    });

    return off;
  }, []);

  if (recent.length === 0) return null;

  return (
    <ul>
      {recent.map((fingerprint, index) => (
        <li key={`${fingerprint}-${String(index)}`}>{fingerprint}</li>
      ))}
    </ul>
  );
}
```

> **Source note.** Subscribe **after** `initTelemetry` has returned. `events.on(...)` on a handle whose
> telemetry is not initialized is a **no-op**: it still returns an unsubscribe function, but the listener is
> never registered and never called. Because `setupTelemetry`/`initTelemetry` is called at module load in
> an entry file, subscribing at module scope after that call is fine — subscribing inside a component that
> renders before initialisation is not.

### Three guarantees that make this safe

- **A throwing listener cannot break the capture it was notified about.** Every listener runs inside its
  own `try`/`catch`, so a broken badge cannot stop a record from being persisted.
- **An async listener cannot produce an unhandled rejection.** A returned promise is observed and a failure
  is routed into the library's `[Telemetry]` diagnostics.
- **Nested emission is bounded.** A listener that emits — or that calls `logger.warn(...)`, which writes a
  log record and so emits `log:written` — has its nested event delivered **once, asynchronously**, and any
  further nesting is dropped and reported once through internal diagnostics. A listener that emits on every
  event therefore cannot spiral.

> **Source note.** These events report `captureError` and `logger` activity plus explicit `syncTelemetry()`
> runs. The automatic background flush is internal and does **not** emit `sync:started` or
> `sync:completed`, so do not build a "last upload" indicator on them alone. `record:dropped` is likewise
> reported only from `syncTelemetry()` and `destroyTelemetry()`, so treat it as a periodic summary rather
> than a live counter. `destroyTelemetry()` clears listeners; the `handle.events` **object identity**
> survives a destroy/re-init cycle, but registrations do not.

> **Source note.** `sync:failed`'s `status` is always `0`, which means **"not captured"** — not "network
> failure". `FlushSummary` is a per-kind aggregate over several batch attempts that can fail for different
> reasons, so there is no single status to report. Use `rest.onTerminalFailure` when you need the actual
> HTTP status.

## Teaching the classifier your error shapes

The library classifies what it produces — HTTP failures, chunk-load errors, CSP violations. It cannot know
that `code: 'ALARM_NOT_FOUND'` is a domain error. Register a builder at module load:

```ts
// src/telemetry-domain-context.ts
import { registerErrorContextBuilder } from '@codewithrajat/rm-logvault';

export const unregister = registerErrorContextBuilder({
  name: 'alarms',
  canHandle: (error) => {
    const code = (error as { code?: unknown } | null)?.code;
    return typeof code === 'string' && code.startsWith('ALARM_');
  },
  build: (error) => ({
    category: 'runtime',
    severity: 'warning',
    tags: {
      domain: 'alarms',
      code: String((error as { code?: unknown }).code),
    },
  }),
});
```

Resolution is **registration order**, first match wins, so register specific classifiers before general
ones. A throwing `canHandle` counts as "no match" and a throwing `build` falls through to the next builder,
so a third-party classifier can never swallow a capture.

### The caller still wins

**Your explicit call-site fields always beat a builder's.** That is the property that stops a registration
from silently relabelling an integration you already described correctly:

```tsx
import { captureError } from '@codewithrajat/rm-logvault';
import { TelemetryErrorBoundary } from '@codewithrajat/rm-logvault/react';

// The alarms builder returns `category` and `tags`, but it cannot change `source`:
// this record is a React error, and saying otherwise would be a lie in the report.
captureError(new Error('render failed'), { source: 'react', tags: { boundary: 'checkout' } });
```

`tags` and `extra` are the exception: they **merge key-by-key**, with the caller winning on a conflict.
Those two are additive by nature, and letting either side discard the other would lose information with no
warning.

```ts
// builder contributes { domain: 'alarms' }; the call site contributes { boundary: 'checkout' }
captureError(error, { source: 'react', tags: { boundary: 'checkout' } });
// record.tags → { domain: 'alarms', boundary: 'checkout' }
```

> **Source note.** The registry is process-wide and **survives `destroyTelemetry()`**, because it describes
> your application rather than an installation — a hot reload or a microfrontend remount must not lose the
> classification. Registering a duplicate `name` **replaces** the previous builder, which is what makes a
> re-registration idempotent instead of stacking duplicates.

### The three built-ins, and why nothing self-registers

```ts
// src/main.tsx
import { installBuiltinContextBuilders } from '@codewithrajat/rm-logvault';

// timeout → http → type-error, in that order. Returns one unregister function.
installBuiltinContextBuilders();
```

| Builder | Matches | Contributes |
| --- | --- | --- |
| `timeout` | `code` of `ETIMEDOUT`/`ECONNABORTED`, or a timeout-shaped string/message (including a thrown string) | `category: 'timeout'`, `severity: 'warning'` |
| `http` | a `response` object with a numeric `status`, or a numeric `status`/`statusCode` | `category`, `severity`, `api`, tags `method`/`status`/`kind` |
| `type-error` | a `TypeError`, including cross-realm ones | `category: 'runtime'`, `severity: 'error'` |

Order matters: `timeout` is first because a timed-out request can also look like an HTTP failure and
"timeout" is the more useful label; `type-error` is last so it cannot shadow either.

**Nothing self-registers.** Importing the module has no effect until you call
`installBuiltinContextBuilders()`. That is deliberate: upgrading the library must never change how your
existing application classifies its errors as a side effect. The individual builders are exported too, so
you can register one without the others.

## Finding and detaching sinks

`logger.addSink(sink)` is still **the** installation API — it is what drives pre-init replay and the
re-entrancy guard. The registry is what sits behind it, so you can answer "what is attached?":

```ts
// src/telemetry-sinks.ts
import { getSinkRegistry, logger } from '@codewithrajat/rm-logvault';

logger.addSink({ name: 'overlay', write: (record) => renderOverlay(record) });
logger.addSink({ name: 'remote', write: (record) => queueForShipping(record) });

// Keys are `${sink.name ?? 'sink'}#${n}` — the sequence suffix stops two sinks
// that declare the same name from replacing each other.
getSinkRegistry().keys();
// ['@codewithrajat/rm-logvault-indexeddb#1', 'overlay#2', 'remote#3']

// Each entry is `{ key, name, sink }`, in insertion order.
getSinkRegistry().list().map((entry) => entry.name);
// ['@codewithrajat/rm-logvault-indexeddb', 'overlay', 'remote']

// Detach the overlay later, from anywhere in the app.
export function detachOverlay(): boolean {
  const entry = getSinkRegistry()
    .list()
    .find((item) => item.name === 'overlay');
  return entry === undefined ? false : getSinkRegistry().unregister(entry.key);
}
```

Each entry is `{ key, name, sink }`, so `list()` is enough to build a small debug panel. Re-registering an
existing key replaces that sink and returns a fresh unsubscribe function; calling the older one afterwards
is safe and does **not** remove the replacement.

> **Source note.** Registering directly in the registry would bypass pre-init replay and the re-entrancy
> guard, so `addSink` remains the installation path. The registry is introspection and keyed removal.

## Export formats, from buttons

`exportDiagnosticsReport` returns `{ ok, format, bytes }` and accepts `format`, `pretty`, `copyToClipboard`,
`redactAgain`, `filenamePrefix` and `onProgress`. `jsonl` is one compact object per line for a log
pipeline; `csv` is a single table for both kinds, openable in a spreadsheet.

```tsx
import { useState } from 'react';
import { exportDiagnosticsReport } from '@codewithrajat/rm-logvault';

export function ExportButtons() {
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');

  const run = async (format: 'jsonl' | 'csv', copyToClipboard: boolean) => {
    setBusy(true);
    setMessage('');
    try {
      const result = await exportDiagnosticsReport({
        format,
        copyToClipboard,
        // `pretty` applies to 'json' only — it is ignored by 'jsonl', where an
        // indented object would break one-record-per-line.
        onProgress: (processed, total) => {
          setMessage(`Marshalled ${processed} of ${total}`);
        },
      });
      setMessage(result.ok ? `${format} ready — ${result.bytes} bytes` : 'Export failed');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div>
      <button type="button" disabled={busy} onClick={() => void run('jsonl', false)}>
        Download JSONL
      </button>
      <button type="button" disabled={busy} onClick={() => void run('csv', true)}>
        Copy CSV
      </button>
      {message !== '' && <p role="status">{message}</p>}
    </div>
  );
}
```

> **Source note.** The return type is **breaking** — it used to be `Promise<boolean>`. The result is an
> object, so `if (await exportDiagnosticsReport())` still works because it is truthy, but code that compared
> against `true` must read `.ok`. The CSV writer prefixes a cell beginning with `=`, `+`, `-`, `@`, a tab or
> a carriage return with an apostrophe, because Excel, Sheets and LibreOffice execute such a cell on open
> and an error message is attacker-influenced input.

## See also

- [the seams](./02-repository-transport-and-hooks.md) — the `useSyncExternalStore` pattern this page
  extends, and the initialisation-time options.
- [using the HTTP client](./05-using-the-http-client.md) — where `onError` and the auth headers fit.
- [encrypting stored records](./06-encrypting-stored-records.md) — wrapping the repositories this page's
  options feed.
- [the recipes and choosing between them](./03-recipes-and-deciding.md) — the decision table for the four
  capture paths.
- [config](../config/README.md) — the full option surface the flat aliases are shorthand for.
