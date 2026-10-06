# more-advanced — observing and extending

**Problem it solves:** a recorder that only writes to disk is hard to build a product on. You want a
badge showing the error count without polling, you want errors classified by a rule only *your*
application understands, and you want to shorten a configuration that has become three levels of
nesting to express two facts.

**What you will learn:**

- `setupTelemetry` and the flat aliases, and the inside-out precedence rule that decides which wins.
- `handle.events` through a **composable** — subscribe in `onMounted`, unsubscribe in `onUnmounted`.
- When a subscription silently does nothing, and the two guarantees that make a listener safe.
- `registerErrorContextBuilder`: teaching the library your error vocabulary.
- `installBuiltinContextBuilders()`, and why nothing registers itself.
- `getSinkRegistry()`: listing and detaching sinks by key.
- `format`, `pretty` and `onProgress` on the export, and the return-type change that came with them.

## The short form of the configuration

`setupTelemetry` is a thin front door to `initTelemetry`. It forwards to it unchanged, so the two are
interchangeable, can be mixed in one codebase, and are idempotent in exactly the same way — a second
call returns the **same handle object** and ignores the new options.

```ts
// src/telemetry.ts
import { setupTelemetry } from '@codewithrajat/rm-logvault';

// Local only: no endpoint, so nothing ever leaves the browser.
setupTelemetry({ app: 'checkout', version: '2.4.1' });
```

Three levels of nesting to express two facts is the problem the flat aliases solve. The same flat names
work directly on `initTelemetry`, so there is no migration cliff:

```ts
import { initTelemetry, resolveOptions } from '@codewithrajat/rm-logvault';

// These two resolve to the same configuration.
resolveOptions({
  appName: 'checkout',
  rest: { errorsUrl: '/t', logsUrl: '/t' },
  logs: { level: 'info' },
});
resolveOptions({ appName: 'checkout', url: '/t', level: 'info' });

// So you can migrate one option at a time.
initTelemetry({ appName: 'checkout', url: '/t', logs: { level: 'info' } });
```

### The precedence rule runs inside-out

**nested option > flat alias > `env` layer > built-in default.** An invalid or empty nested value
**falls through** to the next candidate rather than winning:

```ts
import { initTelemetry, resolveOptions } from '@codewithrajat/rm-logvault';

// Errors go to /errors, logs to /everything.
initTelemetry({ url: '/everything', rest: { errorsUrl: '/errors' } });

// `'verbose'` is not a level, so it is ignored and the flat alias is used.
resolveOptions({ level: 'error', logs: { level: 'verbose' } }).logs.level; // 'error'

// The explicit long name beats the short one.
resolveOptions({ appName: 'a', app: 'b' }).appName; // 'a'
```

| Flat alias | Maps to | Notes |
| --- | --- | --- |
| `url` | `rest.errorsUrl` **and** `rest.logsUrl` | The one-collector case. `errorUrl` / `logUrl` split them and win over it. |
| `errorUrl`, `logUrl` | `rest.errorsUrl`, `rest.logsUrl` | |
| `headers` | `rest.getHeaders` | Awaited per request. |
| `level` | `logs.level` | The **persist** level — what is stored, not what is printed. |
| `consoleLevel` | `logs.consoleLevel` | Console verbosity applied at init. |
| `captureConsole` | `logs.captureConsole` | Wraps `console.warn` / `console.error`. Default `false`. |
| `maxErrors`, `maxLogs` | `errors.maxRecords` (`500`), `logs.maxRecords` (`2000`) | Rows retained. |
| `errorRetentionDays`, `logRetentionDays` | `errors.retentionDays` (`7`), `logs.retentionDays` (`3`) | Days. |
| `app`, `version`, `build` | `appName`, `appVersion`, `buildId` | |

`SimpleTelemetryOptions` is a `Pick` of `TelemetryOptions`, so it offers exactly:
`app`, `version`, `build`, `environment`, `url`, `errorUrl`, `logUrl`, `headers`, `level`,
`consoleLevel`, `captureConsole`, `maxErrors`, `maxLogs`, `enabled`, `consent`, `onInternalError`,
`env`. Anything outside that list — a custom `repository`, `beforeCapture`, `mode`, `rest.transport` —
is still an `initTelemetry` option; reach for the full object for those.

> **Source note.** `setupTelemetry` does not disable or replace anything. `initTelemetry` and
> `setupTelemetry` write to the same singleton, so calling one after the other is a no-op, not a
> reconfiguration. To change options you must `destroyTelemetry()` first.

## Observing captures with a composable

`initTelemetry` returns a handle with an `events` member. The listener's payload type is narrowed by the
event name, so no cast is needed:

```ts
// src/telemetry-events.ts
import { shallowRef, onMounted, onUnmounted, type ShallowRef } from 'vue';
import { type ErrorCapturedEvent, type TelemetryHandle } from '@codewithrajat/rm-logvault';

/**
 * Subscribes to `error:captured` for the lifetime of the component.
 *
 * `shallowRef` is deliberate: an event payload is a plain snapshot, and making it
 * deeply reactive would proxy an object the library owns for no benefit.
 */
export function useErrorCount(telemetry: TelemetryHandle): ShallowRef<number> {
  const count = shallowRef(0);
  let unsubscribe: (() => void) | undefined;

  onMounted(() => {
    unsubscribe = telemetry.events.on('error:captured', () => {
      count.value += 1;
    });
  });

  onUnmounted(() => {
    unsubscribe?.();
  });

  return count;
}

/** The most recent capture, or `undefined` until one happens. */
export function useLastError(telemetry: TelemetryHandle): ShallowRef<ErrorCapturedEvent | undefined> {  const last = shallowRef<ErrorCapturedEvent>();
  let unsubscribe: (() => void) | undefined;

  onMounted(() => {
    unsubscribe = telemetry.events.on('error:captured', (event) => {
      last.value = event;
    });
  });

  onUnmounted(() => {
    unsubscribe?.();
  });

  return last;
}
```

A component then uses it like any other composable:

```vue
<script setup lang="ts">
import { useErrorCount, useLastError } from '@/telemetry-events';
import { telemetry } from '@/telemetry';

const errorCount = useErrorCount(telemetry);
const lastError = useLastError(telemetry);
</script>

<template>
  <p v-if="errorCount > 0">
    {{ errorCount }} error<span v-if="errorCount !== 1">s</span> recorded
    <small v-if="lastError">({{ lastError.severity }} · {{ lastError.source }})</small>
  </p>
</template>
```

One subscription can serve several concerns. `onAny` receives every event and `event.type`
discriminates:

```ts
// src/telemetry-bus.ts
import { telemetry } from '@/telemetry';

/** Subscribe once, at application scope, and fan out to your own store. */
export function startTelemetryBridge(): () => void {
  return telemetry.events.onAny((event) => {
    switch (event.type) {
      case 'error:captured':
        errorStore.add(event.recordId, event.severity);
        break;
      case 'log:written':
        if (event.level === 'error') errorStore.note(event.message);
        break;
      case 'sync:completed':
        errorStore.setUploaded(event.kind, event.uploaded);
        break;
      case 'record:dropped':
        errorStore.noteDropped(event.kind, event.count);
        break;
      default:
        // 'sync:started' and 'sync:failed' are not interesting to this store.
        break;
    }
  });
}
```

### The event table

| Event | Fires when | Payload |
| --- | --- | --- |
| `error:captured` | An error record is accepted. | `recordId`, `fingerprint`, `severity`, `source`, `category`, `handled`, `occurrenceCount` |
| `log:written` | A log passes the persist level. | `recordId`, `level`, `message` (**already sanitized**) |
| `sync:started` | `syncTelemetry()` begins, per kind. | `kind`, `recordCount` |
| `sync:completed` | A kind's upload pass finishes. | `kind`, `uploaded`, `retried`, `failed` |
| `sync:failed` | A kind had terminally-failed records. | `kind`, `status`, `recordCount` |
| `record:dropped` | The rate limiter discarded captures. | `kind`, `reason`, `count` |

Every payload also carries `timestamp` (milliseconds since the epoch).

> **Source note.** `sync:failed.status` is **always `0`**, and `0` means "not captured" — not the HTTP
> status and not a network failure. `FlushSummary` is a per-kind aggregate over several batch attempts,
> which can fail for different reasons, so no single status is available on this event. Use
> `recordCount` for the size, and `rest.onTerminalFailure(status, records)` when you need the real
> status.
>
> `record:dropped.reason` is `'rate-limit'` today. The type also allows other reasons, but only the
> rate limiter emits this event.

> **Source note.** `on()` while telemetry is **not** initialized is a no-op: it returns an unsubscribe
> function, but the listener is never registered and is never called. `handle.events` is a stable object
> that delegates to the live installation, so there is nothing to attach to before
> `initTelemetry()` runs. **Subscribe after `initTelemetry` returns** — from a component's `onMounted`,
> or from the module that calls `initTelemetry` immediately after it.
>
> ```ts
> // Wrong: silently never fires.
> const off = telemetry.events.on('error:captured', handler); // before init
> ```
>
> The same applies after `destroyTelemetry()`: it clears listeners. The `handle.events` **object
> identity** survives a destroy/re-init cycle, so a saved reference keeps working — but registrations do
> not, and are not re-attached for you.

### Two guarantees, and one bound

- **A throwing listener cannot break the capture it was notified about.** Each listener runs in its own
  `try`/`catch`, so a bug in your badge counter never stops the error being persisted.
- **An async listener's rejection is contained.** A returned promise is observed and its failure is
  routed into the library's internal diagnostics — it never becomes an unhandled rejection.
- **A listener that emits is bounded.** Nested emission — `onAny` that calls `logger.warn`, or a
  listener that calls `captureError` — is delivered **once, asynchronously**, and any further nesting is
  **dropped** rather than queued. The first drop is reported once through the reserved `[Telemetry]`
  prefix.

```ts
import { logger } from '@codewithrajat/rm-logvault';

// This terminates. Without the bound, the `logger.warn` below would emit
// `log:written`, whose listener would log again, and so on without end.
telemetry.events.onAny(() => {
  logger.warn('[ui] an event was observed');
});
```

> **Source note.** Events report `captureError` and `logger` activity plus **explicit** `syncTelemetry()`
> runs. The automatic background flush is internal and does **not** emit `sync:started` or
> `sync:completed`, so a progress indicator driven by these events only moves when you (or your button)
> ask for a sync.

## Teaching the library your error shapes

The library classifies the shapes it produces — HTTP failures, chunk-load errors, CSP violations. It
cannot know that `code === 'ALARM_NOT_FOUND'` is a domain error, and it should not learn your
vocabulary to find out. Register a builder at module load, before `initTelemetry`:

```ts
// src/telemetry-context.ts
import { registerErrorContextBuilder } from '@codewithrajat/rm-logvault';

interface DomainError {
  readonly code?: unknown;
  readonly alarmId?: unknown;
}

registerErrorContextBuilder({
  name: 'alarms',
  canHandle: (error) => {
    const code = (error as DomainError | null)?.code;
    return typeof code === 'string' && code.startsWith('ALARM_');
  },
  build: (error) => {
    const domain = error as DomainError;
    return {
      category: 'runtime',
      severity: 'warning',
      // `tags` values are strings; `String(...)` keeps a hostile value out of the
      // record shape without needing a cast.
      tags: { domain: 'alarms', code: String(domain.code) },
      extra: { alarmId: domain.alarmId },
    };
  },
});
```

Resolution is **registration order** and the first match wins, so register the specific classifiers
before the general ones.

### The caller always wins

The `source` field is the important case: the Vue adapter reports
`captureError(error, { source: 'vue' })`, and a builder cannot overwrite it. An explicit
`captureError(err, { source: 'vue' })` from your own code wins for the same reason — the fields you pass
are never relabelled by a registration you made for a different purpose.

```ts
import { captureError } from '@codewithrajat/rm-logvault';

// `source` stays 'vue'. The `alarms` builder matched but set no `source`, so the
// field the call site supplied is used. Builder fields fill gaps; they do not
// overwrite what you passed.
captureError(new Error('alarm 42 vanished'), { source: 'vue' });
```

`tags` and `extra` are the deliberate exception. Those two **merge key-by-key**, with the caller winning
on a conflict, because they are additive by nature — a builder saying `{ domain: 'alarms' }` and a call
site saying `{ flow: 'checkout' }` describe the same error from two angles:

```ts
// builder contributes { domain: 'alarms' }; the call site contributes { flow: 'checkout' }
captureError(domainError, { source: 'vue', tags: { flow: 'checkout' } });
// record.tags === { domain: 'alarms', flow: 'checkout' }
```

Two properties worth relying on:

- **The registry is process-wide and survives `destroyTelemetry`.** A builder describes your
  application, not an installation, so a hot reload or a re-init does not lose it. Registering a
  duplicate `name` **replaces** the earlier builder.
- **A broken builder cannot swallow a capture.** A throwing `canHandle` counts as "no match"; a throwing
  `build` falls through to the next builder.

## The three builders the library ships

```ts
// src/telemetry-context.ts
import { installBuiltinContextBuilders } from '@codewithrajat/rm-logvault';

// Registers timeout → http → type-error, and hands back ONE unregister function.
export const uninstallBuiltinBuilders = installBuiltinContextBuilders();
```

| Builder | Matches | Contributes |
| --- | --- | --- |
| `timeoutErrorContextBuilder` | `code` of `ETIMEDOUT` / `ECONNABORTED`, a timeout-shaped message, or a thrown string that looks like one | `category: 'timeout'`, `severity: 'warning'`, `tags: { kind: 'timeout' }` |
| `httpErrorContextBuilder` | A `response` object with a numeric `status`, or a numeric `status` / `statusCode` | derived `category`, `severity`, `api`, `tags: { kind, method?, status? }` |
| `typeErrorContextBuilder` | A `TypeError`, including a cross-realm one | `category: 'runtime'`, `severity: 'error'`, `tags: { kind: 'type-error' }` |

Order matters: `timeout` is first because a timed-out request can also look like an HTTP failure and
"timeout" is the more useful label, and `type-error` is last so it cannot shadow either.

> **Source note.** **Nothing self-registers.** Importing the module has no effect until you call
> `installBuiltinContextBuilders()`. That is deliberate: upgrading the library must never change how
> your existing application classifies its errors as a side effect. The individual builders are exported
> too, so you can register one, skip another, or interleave your own domain classifiers ahead of them.

`resolveErrorContext(error, ctx)` is the underlying function, exported so you can preview what a
capture will produce:

```ts
import { resolveErrorContext } from '@codewithrajat/rm-logvault';

// With nothing registered this is the identity function.
resolveErrorContext(new Error('x'), { tags: { flow: 'checkout' } });
```

## Listing and detaching sinks by key

`logger.addSink(sink)` is still **the** installation API — it is what drives pre-init replay and the
re-entrancy guard. The registry behind it exists so you can answer "what is attached?" once you have
three sinks:

```ts
import { getSinkRegistry, logger } from '@codewithrajat/rm-logvault';

logger.addSink({ name: 'overlay', write: (record) => renderOverlay(record) });
logger.addSink({ name: 'remote', write: (record) => queue(record) });

getSinkRegistry().keys();
// ['@codewithrajat/rm-logvault-indexeddb#1', 'overlay#2', 'remote#3']

// Detach the overlay later, from anywhere in the app.
for (const entry of getSinkRegistry().list()) {
  if (entry.name === 'overlay') getSinkRegistry().unregister(entry.key);
}
```

The key is `` `${sink.name ?? 'sink'}#${n}` ``. The sequence suffix is what keeps two sinks declaring
the same `name` from replacing each other. Re-registering an existing key replaces that sink and returns
a fresh unsubscribe function; an older unsubscribe function stays safe to call and does not remove the
replacement.

```ts
interface SinkRegistry {
  register(key: string, sink: LogSink): () => void;
  unregister(key: string): boolean;
  get(key: string): LogSink | undefined;
  has(key: string): boolean;
  list(): readonly { key: string; name: string | undefined; sink: LogSink }[];
  keys(): readonly string[];
  size(): number;
  write(record: LogRecord): void;
  clear(): void;
}
```

> **Source note.** This is the **core** seam, not the Vue adapter. `createTelemetryVuePlugin` /
> `attachVueTelemetry` (see [01-framework-adapter.md](./01-framework-adapter.md)) handle Vue's error and
> warning hooks; the sink registry handles where log records go once they exist. Installing the plugin
> does not add a sink, and adding a sink does not install the plugin — most applications want both, and
> they do not interact.

## Exporting the vault in four formats

`exportDiagnosticsReport` gained `'jsonl'` and `'csv'`, plus `pretty` and `onProgress` — and its return
type changed:

```vue
<script setup lang="ts">
import { ref } from 'vue';
import {
  exportDiagnosticsReport,
  type DiagnosticsExportResult,
  type DiagnosticsFormat,
} from '@codewithrajat/rm-logvault';

const busy = ref(false);
const progress = ref(0);
const note = ref('');

async function exportAs(format: DiagnosticsFormat, copyToClipboard = false): Promise<void> {
  busy.value = true;
  progress.value = 0;

  try {
    const result: DiagnosticsExportResult = await exportDiagnosticsReport({
      format,
      copyToClipboard,
      pretty: format === 'json', // ignored by 'jsonl', where indentation would break the format
      onProgress: (processed, total) => {
        progress.value = total === 0 ? 100 : Math.round((processed / total) * 100);
      },
    });

    note.value = result.ok
      ? `${result.format} · ${result.bytes} bytes${copyToClipboard ? ' copied' : ' downloaded'}`
      : 'Nothing was exported — no records, no browser storage, or an export is already running.';
  } finally {
    // The export never rejects, but a `finally` keeps the button from being stuck
    // disabled if a future change ever made it throw.
    busy.value = false;
  }
}
</script>

<template>
  <div>
    <button type="button" :disabled="busy" @click="exportAs('html')">HTML report</button>
    <button type="button" :disabled="busy" @click="exportAs('jsonl')">JSONL download</button>
    <button type="button" :disabled="busy" @click="exportAs('csv', true)">CSV to clipboard</button>
    <progress v-if="busy" :value="progress" max="100">{{ progress }}%</progress>
    <p v-if="note">{{ note }}</p>
  </div>
</template>
```

| Option | Type | Default | What it means |
| --- | --- | --- | --- |
| `format` | `'html' \| 'json' \| 'jsonl' \| 'csv'` | `'html'` | See the table below. |
| `copyToClipboard` | `boolean` | `false` | Write to the clipboard instead of downloading. Feature-detected; returns `ok: false` when unavailable rather than falling back to a download you did not ask for. |
| `pretty` | `boolean` | `false` | Indent the JSON. **`'json'` only** — the `'jsonl'` contract is one record per line. |
| `redactAgain` | `boolean` | `false` | Second sanitisation pass over already-sanitised records. |
| `filenamePrefix` | `string` | the shortcut's prefix, then `'diagnostics-report'` | File is `${prefix}-${timestamp}.${ext}`. |
| `onProgress` | `(processed, total) => void` | none | Called once per 500 records and once at the end. A throwing callback is contained. |
| `onExported` | `(ok: boolean) => void` | none | Called with the outcome. |

| Format | Shape | Good for |
| --- | --- | --- |
| `'html'` | One self-contained document, with the JSON payload embedded | Sending to a person; opens offline |
| `'json'` | One document: `{ schemaVersion, generatedAt, app, page, errors, logs }` | A script that wants the whole vault |
| `'jsonl'` | One compact `{"kind":"error",…}` or `{"kind":"log",…}` per line | `grep`, `jq`, a log pipeline |
| `'csv'` | **One** table for both kinds, with a leading `kind` column | Sorting and pivoting in a spreadsheet |

> **Source note — breaking change.** `exportDiagnosticsReport` now resolves a
> `DiagnosticsExportResult` — `{ ok, format, bytes }` — instead of a bare `boolean`. Existing code that
> only tested the result keeps working, because the object is truthy:
> `if (await exportDiagnosticsReport()) { … }`. Code that *stored* the boolean, or compared it with
> `=== true`, needs `result.ok`.
>
> ```ts
> // Still correct — the object is truthy when a file was written.
> if (await exportDiagnosticsReport()) { /* a file was written or copied */ }
>
> // Needs updating.
> const written: boolean = await exportDiagnosticsReport();       // type error
> const outcome = await exportDiagnosticsReport();
> if (outcome.ok) { /* … */ }
> ```

The `'csv'` writer neutralises **spreadsheet formula injection**: a cell beginning with `=`, `+`, `-`,
`@`, a tab or a carriage return is prefixed with an apostrophe, because Excel, Sheets and LibreOffice
execute such a cell on open and an error message is attacker-influenced input. Quoting follows RFC 4180
with CRLF line endings.

## Framework notes for Vue

- **Subscribe in `onMounted`, unsubscribe in `onUnmounted`.** A component-scoped subscription that is
  never removed keeps the component's closure alive for the lifetime of the page.
- **`shallowRef`, not `ref`, for a payload.** The payload is an immutable snapshot the library owns;
  deep reactivity would proxy it for no benefit.
- **Call `initTelemetry()` in `main.ts`, before `mount()`,** as in [basic](../basic/README.md). Events
  only fire once it has returned, so a subscription made at module scope but executed before init is a
  no-op.
- **Register context builders at module load,** next to the call that installs the plugin. They survive
  teardown, so there is no reason to re-register per component.
- **You do not need a plugin for any of this.** The events handle, the builder registry and the sink
  registry are core entry points; the Vue plugin only chains Vue's own two hooks.

## Related

- The Vue adapter in depth, including the chaining guarantee:
  [01-framework-adapter.md](./01-framework-adapter.md).
- Environment variables, and how the flat aliases compare to the `VITE_` names:
  [../config/01-environment-variables.md](../config/01-environment-variables.md).
- Reaching your own backend with the shipped HTTP client:
  [05-using-the-http-client.md](./05-using-the-http-client.md).
- Encrypting records at rest: [06-encrypting-stored-records.md](./06-encrypting-stored-records.md).
- Every signature and edge case: [docs/API.md](../../../docs/API.md).
