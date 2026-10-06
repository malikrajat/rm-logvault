# API reference

Every symbol exported from `src/index.ts`, grouped by concern and alphabetised within each group,
plus the subpath adapters. Signatures are the real ones; defaults come from `DEFAULT_OPTIONS` in
`src/core/config.ts`.

Conventions used below:

- `Maybe<T>` is `T | undefined`. Option and record interfaces use it because
  `exactOptionalPropertyTypes` is enabled.
- "Never throws" is not a figure of speech. The public boundary is contractually forbidden from
  throwing; fallible internals return `Result<T, R>` (`{ ok: true, value }` or
  `{ ok: false, reason }`).
- Functions that cannot throw also cannot reject unless the signature says `Promise`.

**Contents**

| Group                                                                 | Symbols                                                                                                                                                                                                                                                                                                                                                        |
|-----------------------------------------------------------------------|----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------|
| [Lifecycle](#lifecycle)                                               | `clearTelemetryData`, `destroyTelemetry`, `flushTelemetry`, `getTelemetryStatus`, `initTelemetry`, `isTelemetryInitialized`, `retryFailedTelemetry`, `setupTelemetry`, `syncTelemetry`                                                                                                                                                                         |
| [Events](#events)                                                     | `createEventEmitter`                                                                                                                                                                                                                                                                                                                                           |
| [Configuration](#configuration)                                       | `databaseNames`, `DEFAULT_OPTIONS`, `resolveOptions`                                                                                                                                                                                                                                                                                                           |
| [Adapter descriptors](#adapter-descriptors)                           | `ADAPTERS`, `adapterFor`, `adapterFrameworks`                                                                                                                                                                                                                                                                                                                  |
| [Environment](#environment)                                           | `DEFAULT_ENV_PREFIXES`, `fromEnv`, `getGlobal`, `isBrowser`, `safeGet`                                                                                                                                                                                                                                                                                         |
| [Logger](#logger)                                                     | `createLogger`, `createSinkRegistry`, `getSinkRegistry`, `levelPriority`, `logger`, `LOG_LEVELS`, `LOG_LEVEL_PRIORITY`, `meetsLevel`                                                                                                                                                                                                                           |
| [Error capture](#error-capture)                                       | `captureApiError`, `captureError`, `captureFetchError`, `withErrorCapture`                                                                                                                                                                                                                                                                                     |
| [Normalisation and classification](#normalisation-and-classification) | `buildApiErrorContext`, `buildFetchErrorContext`, `categoryForKind`, `CORRELATION_HEADERS`, `isAuthError`, `markAuthError`, `normalizeError`, `sanitizeNormalized`, `severityForKind`, `UNNORMALIZABLE`                                                                                                                                                        |
| [Error context builders](#error-context-builders)                     | `clearErrorContextBuilders`, `errorContextBuilderCount`, `httpErrorContextBuilder`, `installBuiltinContextBuilders`, `listErrorContextBuilders`, `registerErrorContextBuilder`, `resolveErrorContext`, `timeoutErrorContextBuilder`, `typeErrorContextBuilder`, `unregisterErrorContextBuilder`                                                                |
| [Fingerprinting](#fingerprinting)                                     | `cyrb53`, `fingerprint`, `fingerprintParts`, `normalizePathForFingerprint`, `topStackFrames`                                                                                                                                                                                                                                                                   |
| [Sanitisation](#sanitisation)                                         | `createSanitizer`, `getDefaultSanitizer`, `isSensitiveKey`, `sanitizeStack`, `sanitizeText`, `sanitizeUrl`, `sanitizeValue`                                                                                                                                                                                                                                    |
| [Constants](#constants)                                               | `DEFAULT_ALLOWED_QUERY_PARAMS`, `MAX_*`, `REDACTED`, `SENSITIVE_KEY_PATTERN`, `UNHANDLED_SOURCES`                                                                                                                                                                                                                                                              |
| [Global handlers](#global-handlers)                                   | `globalHandlerCount`, `globalHandlersAttached`, `installGlobalErrorHandlers`                                                                                                                                                                                                                                                                                   |
| [Diagnostics export](#diagnostics-export)                             | `buildReportPayload`, `diagnosticsFilename`, `encodeJsonForHtml`, `escapeHtml`, `escapeJsonText`, `exportDiagnosticsReport`, `installDiagnosticsExportShortcut`, `installShortcut`, `isEditableTarget`, `isExportInFlight`, `matchesShortcut`, `expectedCode`, `renderDiagnosticsReport`, `REPORT_PRIVACY_BANNER`, `sanitizeErrorRecord`, `sanitizeLogRecord`  |
| [Storage](#storage)                                                   | `classifyStorageError`, `createDbConnection`, `createErrorRepository`, `createLogRepository`, `isErrorRecord`, `isLogRecord`, `promisifyRequest`                                                                                                                                                                                                               |
| [Sync](#sync)                                                         | `backoffDelay`, `buildRestBody`, `classifyResponse`, `createFetchTransport`, `createSyncManager`, `isSyncConfigured`, `parseRetryAfter`, `resolveEndpoint`, `resolveEndpoints`, `TERMINAL_STATUSES`                                                                                                                                                            |
| [Payload budgeting](#payload-budgeting)                               | `byteLength`, `reduceErrorPayload`, `reduceLogPayload`                                                                                                                                                                                                                                                                                                         |
| [Observability internals](#observability-internals)                   | `createRateLimiter`, `createSerialQueue`, `getState`, `newId`, `newPageLoadId`, `reportInternalFailure`, `reportInternalNote`                                                                                                                                                                                                                                  |
| [Subpath adapters](#subpath-adapters)                                 | `@codewithrajat/rm-logvault/react`, `/vue`, `/angular`, `/axios`, `/fetch`, `/react-query`, `/http`, `/storage`, `/testing`                                                                                                                                                                                                                                    |

---

## Lifecycle

### `clearTelemetryData`

```ts
function clearTelemetryData(): Promise<boolean>;
```

Deletes **every stored record** from both repositories. This is the GDPR "right to erasure"
primitive.

- **Parameters:** none.
- **Returns:** `Promise<boolean>` — `true` when both stores were cleared. Resolves `false` when no
  repository is active (disabled, or before `initTelemetry`).
- **Never rejects.** Failures go to `reportInternalFailure('clear', …)`.

Clears the vault, not the configuration: capture continues afterwards, and pre-init buffered errors
are dropped too. It wipes the rows inside the two object stores (`store.clear()`) — the databases
themselves are not deleted.

```ts
import { clearTelemetryData } from '@codewithrajat/rm-logvault';

await clearTelemetryData(); // user revoked consent
```

### `destroyTelemetry`

```ts
function destroyTelemetry(): void;
```

Tears down everything `initTelemetry` installed. Idempotent, never throws, synchronous.

The synchronous part completes before it returns, so no capture can occur afterwards: dispatch
stops, every registered listener and timer is removed, and the sync manager is disposed. The
asynchronous part — flushing buffered records and closing both databases — is deferred into a
floating promise whose every step is individually guarded. It also restores any wrapped `console`
methods, restores the built-in sanitizer, drops pre-init buffers and resets the shared state.

```ts
import { destroyTelemetry } from '@codewithrajat/rm-logvault';

destroyTelemetry(); // e.g. in a test harness or a microfrontend teardown
```

### `flushTelemetry`

```ts
function flushTelemetry(): Promise<void>;
```

Waits until every buffered write has settled: the error tracker's serial queue, the log tracker's
pending batch, and the pending-count snapshot.

- **Returns:** `Promise<void>`. **Never rejects.**
- Does **not** upload. Use `syncTelemetry()` for that.

```ts
import { logger, flushTelemetry } from '@codewithrajat/rm-logvault';

logger.error('[Checkout] payment failed', error);
await flushTelemetry(); // the record is now in IndexedDB
```

### `getTelemetryStatus`

```ts
function getTelemetryStatus(): TelemetryStatus;
```

A **synchronous** snapshot. Reading it does not touch IndexedDB, which is why it is not async.

| Field                | Type                                                       | Meaning                                                                                                    |
|----------------------|------------------------------------------------------------|------------------------------------------------------------------------------------------------------------|
| `initialized`        | `boolean`                                                  | `initTelemetry` has completed and not been destroyed.                                                      |
| `mode`               | `'local' \| 'remote'`                                      | Where records go. `'local'` means **no network requests at all**. See [D-015](DECISIONS.md).               |
| `storage`            | `'initializing' \| 'ready' \| 'unavailable' \| 'disabled'` | Persistence usability.                                                                                     |
| `online`             | `boolean`                                                  | `navigator.onLine`, defaulting to `true` when unknown.                                                     |
| `pending`            | `{ errors: number; logs: number }`                         | **Snapshot** counts, refreshed at init, after each flush, after a sync and after `clearTelemetryData()`.   |
| `droppedByRateLimit` | `number`                                                   | Errors plus logs dropped by the fixed-window limiter in the current window.                                |
| `lastSync`           | `number \| undefined`                                      | Timestamp of the last fully successful flush run.                                                          |
| `syncStatus`         | `SyncStatus`                                               | `'idle' \| 'running' \| 'offline' \| 'ok' \| 'retry' \| 'error'`.                                          |

`'initializing'` is the honest state during the window between the synchronous `initTelemetry()` call
returning and the IndexedDB readiness promise settling — IndexedDB opens asynchronously, so a status
read immediately after `initTelemetry()` may report it. `await flushTelemetry()` settles the
readiness promise, after which the state is `'ready'`, `'unavailable'` or `'disabled'`.

Because `pending` is a snapshot, `await flushTelemetry()` first if you need fresh numbers.

```ts
import { getTelemetryStatus } from '@codewithrajat/rm-logvault';

const status = getTelemetryStatus();
if (status.storage === 'unavailable') showStorageWarning();
console.log(status.pending.errors, 'errors queued');
```

### `initTelemetry`

```ts
function initTelemetry(options?: TelemetryOptions): TelemetryHandle;
```

The whole integration. **Never throws**, and strictly idempotent: a second call returns the existing
handle and installs nothing. Reconfiguring requires `destroyTelemetry()` first.

| Parameter | Type               | Default | Description                                                                                             |
|-----------|--------------------|---------|---------------------------------------------------------------------------------------------------------|
| `options` | `TelemetryOptions` | `{}`    | Every field optional; zero config gives IndexedDB persistence, global handlers and the export shortcut. |

Returns a `TelemetryHandle`:

| Member       | Type                         | Description                                                                                           |
|--------------|------------------------------|-------------------------------------------------------------------------------------------------------|
| `appName`    | `string \| undefined`        | The configured application name.                                                                      |
| `pageLoadId` | `string`                     | The identifier shared by every record from this page load.                                            |
| `enabled`    | `boolean`                    | Whether capture is enabled. `false` when master-disabled.                                             |
| `mode`       | `StorageMode`                | Resolved storage mode — `'local'` (IndexedDB only) or `'remote'` (also uploaded).                     |
| `storage`    | `StorageState`               | Persistence state at the moment init returned — `'initializing'` until the readiness promise settles. |
| `events`     | `EventEmitter`               | Observe captures, writes and sync runs. See [Events](#events).                                        |
| `destroy()`  | `() => void`                 | Equivalent to `destroyTelemetry()`.                                                                   |
| `flush()`    | `() => Promise<void>`        | Wait for buffered writes to settle.                                                                   |
| `sync()`     | `() => Promise<FlushResult>` | Force an upload pass.                                                                                 |

```ts
import { initTelemetry } from '@codewithrajat/rm-logvault';

initTelemetry({ appName: 'checkout' });

initTelemetry({
  appName: 'checkout',
  appVersion: '2.4.1',
  errors: { captureCsp: true, captureResources: true },
  logs: { level: 'info', captureConsole: true },
  rest: { errorsUrl: '/telemetry/errors', logsUrl: '/telemetry/logs' },
  shortcut: { allow: () => isInternalUser() },
});
```

On a master-disable (`enabled: false`) it returns a `disabledHandle()`: `enabled` is `false`,
`storage` is `'disabled'`, capture is suppressed and nothing is buffered.

### `isTelemetryInitialized`

```ts
function isTelemetryInitialized(): boolean;
```

Whether `initTelemetry` has completed and not been destroyed. Reads the shared state directly, so it
is a pure synchronous check.

### `retryFailedTelemetry`

```ts
function retryFailedTelemetry(): Promise<number>;
```

Moves terminally-failed records back to `pending` and retries immediately.

- **Returns:** `Promise<number>` — how many records were re-queued. **Never rejects.**
- Clears the failure counter and the `Retry-After` hint, then schedules a run immediately.

Delete this function from your mental model at your peril: a `401` marks a batch `failed`
permanently, and without a requeue a single expired token would silently discard every record
captured during the outage.

```ts
import { retryFailedTelemetry } from '@codewithrajat/rm-logvault';

await refreshSession();
const requeued = await retryFailedTelemetry();
```

### `setupTelemetry`

```ts
function setupTelemetry(options?: SimpleTelemetryOptions): TelemetryHandle;
```

The flat front door to `initTelemetry`. It is **not** a second configuration system: it forwards to
`initTelemetry` unchanged, so the two are interchangeable, can be mixed in one codebase, and are
idempotent in exactly the same way. Anything `SimpleTelemetryOptions` cannot express — `errors`,
`redaction`, `rest` as a whole, `shortcut`, `mode`, `repository`, `logSource` — is still available
by calling `initTelemetry` directly.

`SimpleTelemetryOptions` is a `Pick<TelemetryOptions, …>` of seventeen fields, so the two cannot drift:

```ts
type SimpleTelemetryOptions = Pick<
  TelemetryOptions,
  | 'app'
  | 'version'
  | 'build'
  | 'environment'
  | 'url'
  | 'errorUrl'
  | 'logUrl'
  | 'headers'
  | 'level'
  | 'consoleLevel'
  | 'captureConsole'
  | 'maxErrors'
  | 'maxLogs'
  | 'enabled'
  | 'consent'
  | 'onInternalError'
  | 'env'
>;
```

Note that `app`, `version`, `build`, `url`, `errorUrl`, `logUrl`, `headers`, `level`,
`consoleLevel`, `captureConsole`, `maxErrors` and `maxLogs` are precisely the
[flat aliases](#flat-aliases-on-telemetryoptions) documented under [Configuration](#configuration),
so `initTelemetry` accepts the same object. `setupTelemetry` exists for the editor experience, not
for a different resolution path.

| Parameter | Type                     | Default | Description                                                              |
|-----------|--------------------------|---------|--------------------------------------------------------------------------|
| `options` | `SimpleTelemetryOptions` | `{}`    | Everything optional. Omitted entirely, this is a complete configuration. |

**Returns** the same `TelemetryHandle` `initTelemetry` returns. **Never throws** — `initTelemetry`
is already total, and this adds a second guard that returns a disabled handle and reports through
`reportInternalFailure('setup', …)`.

```ts
import { setupTelemetry } from '@codewithrajat/rm-logvault';

// Local only — no endpoint, nothing ever leaves the browser.
setupTelemetry({ app: 'checkout', version: '2.4.1' });

// One collector for both kinds, persisted from `info` up.
setupTelemetry({
  app: 'checkout',
  url: '/telemetry',
  level: 'info',
  maxErrors: 1000,
});
```

### `syncTelemetry`

```ts
function syncTelemetry(): Promise<FlushResult>;
```

Forces an upload pass. Buffered records are flushed to IndexedDB first, so everything eligible is
included. Concurrent calls share a single in-flight run.

```ts
interface FlushResult {
  readonly errors: FlushSummary;
  readonly logs: FlushSummary;
}

interface FlushSummary {
  readonly claimed: number; // records handed to the transport
  readonly uploaded: number; // accepted by the server and deleted locally
  readonly retried: number; // put back to 'pending'
  readonly failed: number; // marked terminally 'failed'
  readonly stopped: boolean; // the run stopped early
}
```

**Never rejects.** A failure returns an empty summary and reports internally.

```ts
import { syncTelemetry } from '@codewithrajat/rm-logvault';

const { errors, logs } = await syncTelemetry();
console.log(`uploaded ${errors.uploaded} errors and ${logs.uploaded} logs`);
```

---

## Events

The library deliberately does **not** ship a state container. Frameworks have their own (Redux,
Zustand, signals, `useSyncExternalStore`), and picking one would make the package opinionated about
something it has no business deciding. What it ships instead is a way to observe what it did, so a
consumer's own store can react to it.

Three rules make the emitter safe to hand to a host application:

1. **A listener can never break a capture.** Every listener runs inside its own guarded call, so a
   throwing subscriber cannot stop the error it was notified about from being persisted.
2. **A listener can never produce an unhandled rejection.** A returned promise is observed and its
   failure routed to `reportInternalFailure('event-listener', …)`.
3. **A listener can unsubscribe during dispatch.** The subscriber set is snapshotted before
   iteration, so removing a listener from inside its own callback — or while an earlier listener is
   running — is well-defined.

### `createEventEmitter`

```ts
function createEventEmitter(): EventEmitter;
```

| Method                  | Signature                                                                                                                 | Description                                                                                                                                  |
|-------------------------|---------------------------------------------------------------------------------------------------------------------------|----------------------------------------------------------------------------------------------------------------------------------------------|
| `on(type, listener)`    | `<T extends TelemetryEventType>(type: T, listener: (event: TelemetryEventMap[T]) => void \| Promise<void>) => () => void` | Subscribe to one event type. Returns an unsubscribe function; calling it twice is safe. A non-function listener returns a no-op unsubscribe. |
| `onAny(listener)`       | `(listener: TelemetryEventListener) => () => void`                                                                        | Subscribe to every event type.                                                                                                               |
| `off(type, listener)`   | `<T extends TelemetryEventType>(type: T, listener: …) => void`                                                            | Remove a listener by exact function reference.                                                                                               |
| `emit(event)`           | `(event: TelemetryEventPayload) => void`                                                                                  | Dispatch. The payload's `type` selects the subscribers; a payload whose body disagrees with its `type` is a compile error.                   |
| `listenerCount(type?)`  | `(type?: TelemetryEventType) => number`                                                                                   | Listeners for one type, or for all types when omitted (the `onAny` set included).                                                            |
| `clear()`               | `() => void`                                                                                                              | Remove every listener. Called on `destroyTelemetry`.                                                                                         |

**Never throws.** Emitters are not shared: one belongs to one `initTelemetry` installation and is
replaced on re-initialization — except that the handle's `events` is a **stable delegating emitter**,
so a reference captured from the first handle keeps observing after a re-initialization. Before an
initialization and after a teardown, subscriptions land on a dormant emitter, so a listener
registered at module load is still attached when `initTelemetry` runs.

`emit` is **re-entrancy safe**: a listener that emits is queued and drained after the current
dispatch rather than recursing without bound — which an `error:captured` listener that itself calls
`captureError` would otherwise do forever. Each queued round replaces the pending event rather than
appending to it, so a listener that emits on every event cannot spin.

```ts
import { createEventEmitter } from '@codewithrajat/rm-logvault';

const events = createEventEmitter();
const off = events.on('error:captured', (event) => console.log(event.recordId));
off();
```

The one you actually want is on the handle:

```ts
import { initTelemetry } from '@codewithrajat/rm-logvault';

const telemetry = initTelemetry({ appName: 'checkout' });

const off = telemetry.events.on('error:captured', (event) => {
  badge.textContent = String(Number(badge.textContent) + 1);
  void event.fingerprint;
});

off(); // unsubscribe; safe to call more than once
```

### `TelemetryEventType` and the payloads

```ts
type TelemetryEventType =
  | 'error:captured'
  | 'log:written'
  | 'sync:started'
  | 'sync:completed'
  | 'sync:failed'
  | 'record:dropped';
```

Every payload carries `type` and `timestamp` (milliseconds since the Unix epoch, stamped by the
emitter when the caller did not supply one). `TelemetryEventMap` keys each payload by its `type`, and
`TelemetryEventPayload` is the discriminated union of all six, so `switch (event.type)` narrows to
the exact payload.

| Event               | Payload interface      | Extra fields                                                                                 |
|---------------------|------------------------|----------------------------------------------------------------------------------------------|
| `'error:captured'`  | `ErrorCapturedEvent`   | `recordId`, `fingerprint`, `severity`, `source`, `category`, `handled`, `occurrenceCount`.   |
| `'log:written'`     | `LogWrittenEvent`      | `recordId`, `level`, `message` (already sanitized).                                          |
| `'sync:started'`    | `SyncStartedEvent`     | `kind: 'errors' \| 'logs'`, `recordCount`. Emitted only when `recordCount > 0`.              |
| `'sync:completed'`  | `SyncCompletedEvent`   | `kind`, `uploaded`, `retried`, `failed`.                                                     |
| `'sync:failed'`     | `SyncFailedEvent`      | `kind`, `status`, `recordCount`.                                                             |
| `'record:dropped'`  | `RecordDroppedEvent`   | `kind`, `reason` (`'rate-limit' \| 'consent' \| 'payload-limit' \| 'before-hook'`), `count`. |

> **Source note.** `SyncFailedEvent.status` is documented by the event interface as "the status that
> caused the failure", but `initTelemetry` emits it with `status: 0`, because the sync manager does
> not surface a per-batch status at that point. Read `0` as "no HTTP status was involved — this was a
> terminal classification", not as a network failure. `recordCount` carries `summary.failed`.
>
> `'record:dropped'` is only ever emitted for `kind: 'errors'` with `reason: 'rate-limit'`, and only
> from `destroyTelemetry()` or `syncTelemetry()` — it reports the count the two rate limiters
> discarded in the window just closed. The other `reason` values are part of the type's contract but
> are not currently produced by the core.

`TelemetryEventListener` is `(event: TelemetryEventPayload) => void | Promise<void>`.

---

## Configuration

### `databaseNames`

```ts
function databaseNames(dbPrefix: string): { readonly errors: string; readonly logs: string };
```

Derives the two IndexedDB database names from a prefix. `databaseNames('rm-logvault')` returns
`{ errors: 'rm-logvault-errors', logs: 'rm-logvault-logs' }`.

### `DEFAULT_OPTIONS`

```ts
const DEFAULT_OPTIONS: {
  readonly enabled: true;
  readonly dbPrefix: 'rm-logvault';
  readonly openTimeoutMs: 5000;
  readonly errors: {
    readonly enabled: true;
    readonly maxRecords: 500;
    readonly retentionDays: 7;
    readonly maxPayloadBytes: 16384;
    readonly maxEventsPerMinute: 120;
    readonly preventDefaultUnhandledRejection: false;
    readonly captureResources: false;
    readonly captureCsp: false;
    readonly captureChunkErrors: true;
  };
  readonly logs: {
    readonly enabled: true;
    readonly level: 'warn';
    /** No default: omitting it leaves the logger's own level untouched. */
    readonly consoleLevel: undefined;
    readonly maxRecords: 2000;
    readonly retentionDays: 3;
    readonly maxPayloadBytes: 4096;
    readonly maxLogsPerMinute: 600;
    readonly writeFlushMs: 1000;
    readonly writeBatchSize: 50;
    readonly captureConsole: false;
  };
  readonly rest: {
    readonly intervalMs: 30000;
    readonly batchSize: 50;
    readonly credentials: 'same-origin';
    readonly requireHttps: false;
  };
};
```

Exported so documentation and tests share one source of truth. `dbPrefix`, `openTimeoutMs`, `logs.writeFlushMs` and `logs.writeBatchSize` are members that reference the constants owning those values — `DEFAULT_DB_PREFIX`, `DEFAULT_OPEN_TIMEOUT_MS` in the storage layer, and `LOG_FLUSH_INTERVAL_MS` / `LOG_FLUSH_BATCH_SIZE` in the logger — so a default cannot drift from the behaviour that uses it. One default is *not* in this object because it is a literal in `resolveOptions`: the shortcut's `filenamePrefix`, from `DEFAULT_FILENAME_PREFIX` (`'diagnostics-report'`).

### `resolveOptions`

```ts
function resolveOptions(options?: TelemetryOptions): ResolvedTelemetryOptions;
```

Resolves user options into a frozen, fully-populated configuration.

- **Parameters:** `options` — the caller's partial configuration.
- **Returns:** `ResolvedTelemetryOptions` with no gaps other than the genuinely optional identity
  fields.

Precedence is one rule everywhere: **explicit option > `fromEnv` layer > built-in default**.

Two defensive rules apply while resolving:

- A non-positive, `NaN`, `Infinity` or non-numeric numeric is **ignored** and the default is used.
  `maxRecords: 0` cannot mean "store nothing"; it means you made a mistake, and silently disabling
  retention would be the surprising outcome. `allowZero` is set for `retentionDays` and for both
  rate limits.
- An unrecognised level string is **ignored**, keeping the previous level. A typo must never be able
  to turn on verbose persistence. Valid strings are `trace`, `debug`, `info`, `warn`, `error`, and
  the disable synonyms `off`, `none`, `silent` (all normalised to `'off'`).

```ts
import { resolveOptions, DEFAULT_OPTIONS } from '@codewithrajat/rm-logvault';

resolveOptions({ errors: { maxRecords: -5 } }).errors.maxRecords;
// 500 — a non-positive value falls back to the default
```

The returned object and each of its groups are `Object.freeze`d, so a consumer cannot mutate a live
configuration by accident (or on purpose).

---

### Every option, annotated

**Nothing is required.** `initTelemetry()` with no arguments is a valid, fully-working call. Every
option has a built-in default except the identity fields (`appName`, `appVersion`, `buildId`,
`environment`), which stay `undefined` until you supply them. There is no "set this or it breaks" —
only "this is what happens if you do not".

Configuration arrives in three layers, and one rule decides every option:

| Layer                | Supplied by                                                          | Wins over     |
|----------------------|----------------------------------------------------------------------|---------------|
| **Explicit option**  | `initTelemetry({ … })`                                               | everything    |
| **Environment**      | `initTelemetry({ env: true })`, or `initTelemetry(fromEnv('VITE_'))` | defaults only |
| **Built-in default** | `DEFAULT_OPTIONS`                                                    | nothing       |

#### What the units mean

Six kinds of number appear in the options, and they are not interchangeable:

| Unit                    | Options                                                 | What it actually means                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              |
|-------------------------|---------------------------------------------------------|-------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------|
| **UTF-8 bytes**         | `errors.maxPayloadBytes`, `logs.maxPayloadBytes`        | The size of **one serialised record**, measured by `byteLength()`. Bytes, not characters — `'é'` counts as 2 — and it budgets a single row, not a request and not the database. Exceeding it starts the reduction ladder (see [Payload budgeting](#payload-budgeting)); a record that cannot be reduced below the budget is **dropped and reported** rather than stored truncated.                                                                                                                                                                                                                                                  |
| **Rows**                | `errors.maxRecords`, `logs.maxRecords`                  | A hard cap on how many rows that store keeps. Cleanup deletes the **oldest** surplus. `0` is rejected as a mistake (minimum 1); "store nothing" is spelled `errors.enabled: false`.                                                                                                                                                                                                                                                                                                                                                                                                                                                 |
| **Days**                | `errors.retentionDays`, `logs.retentionDays`            | The age at which a row is deleted. `0` **is** allowed and means "never delete by age — keep only the count cap". Fractional values work: `0.5` is twelve hours.                                                                                                                                                                                                                                                                                                                                                                                                                                                                     |
| **Records per request** | `rest.batchSize`                                        | How many records are put into one `POST` body. Bigger batches mean fewer requests and a wider blast radius when a status is terminal; smaller batches mean more requests but finer retry granularity.                                                                                                                                                                                                                                                                                                                                                                                                                               |
| **Milliseconds**        | `rest.intervalMs`, `logs.writeFlushMs`, `openTimeoutMs` | Time in all three, but three different waits. `rest.intervalMs` is the delay between flush runs — a **floor after a success**, not a poll interval: failures are governed instead by exponential backoff (15 s → 30 s → 60 s … capped at 15 min) and by a server `Retry-After`, whichever is longer. `logs.writeFlushMs` is the **upper bound** on how long a buffered log waits before being written, and a write also happens as soon as `writeBatchSize` entries accumulate. `openTimeoutMs` is the deadline on a single IndexedDB `open()`, after which storage is declared unavailable and the library continues console-only. |
| **Events per 60 s**     | `errors.maxEventsPerMinute`, `logs.maxLogsPerMinute`    | A fixed-window rate limiter. Excess is dropped and summarised in **one** line per rolled window. `0` disables the limiter entirely.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 |

#### Which limit deletes a row first

Both stores are cleaned by the same rule, and it is **whichever limit is reached first**:

1. **Age** — delete anything older than `retentionDays`. Skipped entirely when it is `0`.
2. **Count** — if more than `maxRecords` rows remain, delete the oldest surplus.

Cleanup runs at initialisation and then on a cadence: every **25** successful error writes and every
**200** successful log writes, in chunks of **200** rows, so a busy page pays for it in small
instalments instead of one long blocking pass. A quota failure halves the cap, runs cleanup, and
retries that same write exactly once.

#### Top level

| Option          | Type                         | Default         | Meaning                                                                                                                                                                                                                                                                                                                                                                                                     |
|-----------------|------------------------------|-----------------|-------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------|
| `enabled`       | `boolean`                    | `true`          | Master switch. `false` installs nothing, captures nothing and returns an inert handle — the "turn it off in this environment" option.                                                                                                                                                                                                                                                                       |
| `mode`          | `'local' \| 'remote'`        | derived         | **The IndexedDB-or-REST decision.** `'local'` keeps records on the device and makes uploads structurally impossible. `'remote'` uploads as well. Omitted, it follows whether uploads are actually **enabled** — not merely whether a URL is present — so configuring endpoints and then switching them off with `rest.enabled: false` reports `'local'`, which is the truth. An explicit value always wins. |
| `dbPrefix`      | `string`                     | `'rm-logvault'` | Database names become `${dbPrefix}-errors` and `${dbPrefix}-logs`. Changing it points the library at a **different** database; existing rows are not migrated.                                                                                                                                                                                                                                              |
| `openTimeoutMs` | `number` (ms)                | `5000`          | Deadline on a single IndexedDB `open()`. A slow open is normal on a cold profile, and an open can hang forever when another tab holds an upgrade open; when this elapses, storage is declared unavailable and the library carries on console-only instead of making the page wait. Raise it on a slow device, lower it in tests.                                                                            |
| `appName`       | `string`                     | none            | Copied onto every record and into the upload envelope.                                                                                                                                                                                                                                                                                                                                                      |
| `appVersion`    | `string`                     | none            | As above.                                                                                                                                                                                                                                                                                                                                                                                                   |
| `buildId`       | `string`                     | none            | As above — the fastest way to tell "which deploy produced this".                                                                                                                                                                                                                                                                                                                                            |
| `environment`   | `string`                     | none            | As above (`'production'`, `'staging'`, …).                                                                                                                                                                                                                                                                                                                                                                  |
| `repository`    | `TelemetryRepository`        | none            | Replace IndexedDB wholesale. `createMemoryRepository()` from `@codewithrajat/rm-logvault/testing` is the documented use.                                                                                                                                                                                                                                                                                    |
| `logSource`     | `ExternalLogSource`          | none            | Attach to an application logger that already exposes `addSink`.                                                                                                                                                                                                                                                                                                                                             |
| `env`           | `true \| string \| string[]` | none            | Opt in to reading build-time variables. `true` uses `DEFAULT_ENV_PREFIXES`; a string or list pins your own.                                                                                                                                                                                                                                                                                                 |
| `shortcut`      | `false \| ShortcutOptions`   | enabled         | The diagnostics-export shortcut. `false` removes it.                                                                                                                                                                                                                                                                                                                                                        |

<a id="flat-aliases-on-telemetryoptions"></a>

#### Flat aliases

Twelve top-level fields are shorthands for a nested one, for the common case where the nested object
would hold a single field. They exist so `initTelemetry({ url: '/telemetry', level: 'info' })` is a
complete configuration without learning `rest.errorsUrl` and `logs.level` first.

| Alias                | Maps to                                 | Notes                                                                                |
|----------------------|-----------------------------------------|--------------------------------------------------------------------------------------|
| `url`                | `rest.errorsUrl` **and** `rest.logsUrl` | The one-collector case. Set `errorUrl`/`logUrl` to split them; those win over `url`. |
| `errorUrl`           | `rest.errorsUrl`                        | Wins over `url`.                                                                     |
| `logUrl`             | `rest.logsUrl`                          | Wins over `url`.                                                                     |
| `headers`            | `rest.getHeaders`                       | `rest.getHeaders` wins when both are supplied.                                       |
| `level`              | `logs.level`                            | The **persist** threshold, not the console one.                                      |
| `consoleLevel`       | `logs.consoleLevel`                     | The console threshold applied at init.                                               |
| `captureConsole`     | `logs.captureConsole`                   | Wrap `console.warn`/`console.error`.                                                 |
| `maxErrors`          | `errors.maxRecords`                     |                                                                                      |
| `maxLogs`            | `logs.maxRecords`                       |                                                                                      |
| `errorRetentionDays` | `errors.retentionDays`                  |                                                                                      |
| `logRetentionDays`   | `logs.retentionDays`                    |                                                                                      |
| `app`                | `appName`                               | `appName` wins when both are supplied. Also the name `setupTelemetry` uses.          |
| `version`            | `appVersion`                            | `appVersion` wins when both are supplied.                                            |
| `build`              | `buildId`                               | `buildId` wins when both are supplied.                                               |

Precedence is unchanged and now runs **inside out**: nested option > flat alias > environment >
built-in default. So `{ url: '/a', rest: { errorsUrl: '/b' } }` uploads errors to `/b` and logs to
`/a`. Nothing here changes the meaning of an existing option.

```ts
import { initTelemetry } from '@codewithrajat/rm-logvault';

// Nested — the long form, unchanged.
initTelemetry({
  appName: 'checkout',
  rest: { errorsUrl: '/telemetry/errors', logsUrl: '/telemetry/logs' },
  logs: { level: 'info' },
});

// Flat — the same configuration through the aliases.
initTelemetry({ app: 'checkout', url: '/telemetry', level: 'info' });
```

#### `errors.*` — one IndexedDB store for captured errors

| Option                             | Type                              | Default | Meaning                                                                                                                                                           |
|------------------------------------|-----------------------------------|---------|-------------------------------------------------------------------------------------------------------------------------------------------------------------------|
| `enabled`                          | `boolean`                         | `true`  | Capture errors at all. `false` installs no global handlers and stores no rows.                                                                                    |
| `maxRecords`                       | `number` (rows)                   | `500`   | Count cap.                                                                                                                                                        |
| `retentionDays`                    | `number` (days)                   | `7`     | Age cap; `0` disables it.                                                                                                                                         |
| `maxPayloadBytes`                  | `number` (UTF-8 bytes)            | `16384` | Per-record budget. When exceeded, the reduction ladder drops `extra`, then trims `stack`/`causes`/`componentStack`, then the minimal tier, then gives up.         |
| `maxEventsPerMinute`               | `number` (events / 60 s)          | `120`   | Rate limit; `0` disables it. Protects a failing render loop from filling the vault.                                                                               |
| `preventDefaultUnhandledRejection` | `boolean`                         | `false` | `true` calls `preventDefault()` on `unhandledrejection`, silencing the browser's own console error for it. `false` leaves the browser's default reporting intact. |
| `captureResources`                 | `boolean`                         | `false` | `true` adds a capture-phase listener for `<img>`, `<script>` and `<link>` load failures (`source: 'resource'`).                                                   |
| `captureCsp`                       | `boolean`                         | `false` | `true` listens for `securitypolicyviolation` (`source: 'csp'`), which is how a blocked script becomes visible.                                                    |
| `captureChunkErrors`               | `boolean`                         | `true`  | `true` recognises dynamic-import / chunk load failures as `source: 'chunk'` — the signal that a deploy changed the asset hashes.                                  |
| `allowedQueryParams`               | `readonly string[]`               | `[]`    | Query-parameter names whose values survive redaction. Given here **or** on `redaction.allowedQueryParams`; the `errors` spelling wins.                            |
| `beforeCapture`                    | `(record) => ErrorRecord \| null` | none    | Last chance to inspect, modify or drop a record before it is stored. Returning `null` drops it. A throwing hook is reported and ignored.                          |

#### `logs.*` — a second, independent IndexedDB store

| Option             | Type                            | Default  | Meaning                                                                                                                                                                                                                                                                                                 |
|--------------------|---------------------------------|----------|---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------|
| `enabled`          | `boolean`                       | `true`   | Persist logs at all. `false` leaves `logger.*` console output working but stores nothing.                                                                                                                                                                                                               |
| `level`            | `LogLevelSetting`               | `'warn'` | The **persist** threshold. A log below it is never written, whatever the console level says.                                                                                                                                                                                                            |
| `consoleLevel`     | `LogLevelSetting`               | **none** | The **console** threshold, applied at initialisation. There is deliberately no default, so initialising telemetry never changes console output on its own; omit it and `logger.setLevel()` stays your runtime control. Note that `destroyTelemetry()` resets the console level to the factory `'warn'`. |
| `maxRecords`       | `number` (rows)                 | `2000`   | Count cap. Logs are high-volume, so this default is larger than the error one.                                                                                                                                                                                                                          |
| `retentionDays`    | `number` (days)                 | `3`      | Age cap; `0` disables it. Shorter than errors by default, because logs are more voluminous and less precious.                                                                                                                                                                                           |
| `maxPayloadBytes`  | `number` (UTF-8 bytes)          | `4096`   | Per-record budget: drops `data`, then shortens `message`, then drops the record.                                                                                                                                                                                                                        |
| `maxLogsPerMinute` | `number` (logs / 60 s)          | `600`    | Rate limit; `0` disables it.                                                                                                                                                                                                                                                                            |
| `writeFlushMs`     | `number` (ms)                   | `1000`   | Upper bound on how long a buffered log sits in memory before it is written. Not a poll interval: a write also happens the instant `writeBatchSize` entries accumulate, whichever comes first. Lower it if a hard crash loses too much of a burst; raise it to spend fewer IndexedDB transactions.       |
| `writeBatchSize`   | `number` (entries)              | `50`     | Buffered entries that trigger an immediate write — and the batch size, since one IndexedDB transaction carries up to this many records. Raising it writes more per transaction at the cost of holding more in memory during a burst.                                                                    |
| `captureConsole`   | `boolean`                       | `false`  | `true` wraps `console.warn` and `console.error` so calls you have not migrated yet are still captured. Off by default because it changes a global.                                                                                                                                                      |
| `beforeStore`      | `(record) => LogRecord \| null` | none     | The log equivalent of `beforeCapture`.                                                                                                                                                                                                                                                                  |

#### `redaction.*` — the security boundary

| Option               | Type                            | Default | Meaning                                                                                                                                               |
|----------------------|---------------------------------|---------|-------------------------------------------------------------------------------------------------------------------------------------------------------|
| `extraSensitiveKeys` | `readonly (string \| RegExp)[]` | `[]`    | Additional key names or patterns treated as sensitive. A string matches the normalised key exactly.                                                   |
| `extraPatterns`      | `readonly RegExp[]`             | `[]`    | Additional free-text patterns, applied **after** the built-in rules.                                                                                  |
| `allowedQueryParams` | `readonly string[]`             | `[]`    | Replaces the default allow-list of query parameters whose values are kept. Explicitly configuring it wins over the `errors.allowedQueryParams` alias. |

#### `rest.*` — uploads, one endpoint per kind

| Option              | Type                                        | Default                               | Meaning                                                                                                                                                                                                                                                                     |
|---------------------|---------------------------------------------|---------------------------------------|-----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------|
| `errorsUrl`         | `string`                                    | none                                  | Where error batches are posted. Absolute `http(s)` or a relative path.                                                                                                                                                                                                      |
| `logsUrl`           | `string`                                    | none                                  | Where log batches are posted. **Separate from `errorsUrl` on purpose**, so errors and logs can go to different collectors; give only one and only that kind uploads.                                                                                                        |
| `enabled`           | `boolean`                                   | `true` when a URL or transport exists | Explicitly disable uploads while leaving the URLs configured — the usual "filled in the endpoints but not ready to send" state. Uploads then stay off, and `mode` reports `'local'` because that is what is happening. `mode: 'local'` is the stronger, more explicit form. |
| `intervalMs`        | `number` (ms)                               | `30000`                               | Floor between flush runs after a success.                                                                                                                                                                                                                                   |
| `batchSize`         | `number` (records)                          | `50`                                  | Records per request.                                                                                                                                                                                                                                                        |
| `credentials`       | `'omit' \| 'same-origin' \| 'include'`      | `'same-origin'`                       | `fetch` credentials mode. `'include'` is never implied.                                                                                                                                                                                                                     |
| `getHeaders`        | `() => Record<string,string> \| Promise<…>` | none                                  | Awaitable per request, so a rotating token works. A throwing provider is treated as **retryable**, not terminal.                                                                                                                                                            |
| `transport`         | `RemoteTransport`                           | none                                  | Replace `fetch`. Supplying one also activates sync.                                                                                                                                                                                                                         |
| `requireHttps`      | `boolean`                                   | `false`                               | `true` rejects plain `http:` endpoints except on localhost.                                                                                                                                                                                                                 |
| `onTerminalFailure` | `(status, records) => void`                 | none                                  | Called once per batch that fails terminally, so the app can re-authenticate and call `retryFailedTelemetry()`.                                                                                                                                                              |

#### `shortcut` — the diagnostics export

| Option                            | Type                    | Default                            | Meaning                                                                                                                                       |
|-----------------------------------|-------------------------|------------------------------------|-----------------------------------------------------------------------------------------------------------------------------------------------|
| `key`                             | `string`                | `'d'`                              | A single letter or digit, matched on the physical key.                                                                                        |
| `ctrl` / `shift` / `alt` / `meta` | `boolean`               | `true` / `true` / `true` / `false` | Required modifiers. Matching is **exact**: an extra modifier means no match. `meta: false` is why macOS uses Control+Shift+Option+D, not Cmd. |
| `target`                          | `EventTarget`           | `document`                         | Where the listener is attached, in the capture phase.                                                                                         |
| `allow`                           | `() => boolean`         | none                               | Gate evaluated on every match; must return exactly `true`. Use it to restrict the shortcut to internal users.                                 |
| `filenamePrefix`                  | `string`                | `'diagnostics-report'`             | The downloaded file is `${prefix}-${ISO timestamp}.html`.                                                                                     |
| `onExported`                      | `(ok: boolean) => void` | none                               | Called after an export that ran. **Not** called when the export returned early (already in flight, no browser, no repository).                |

#### A complete configuration, both ways

The same settings, expressed as environment variables and as options. The env spellings are the ones
[`fromEnv`](#fromenv) reads; see [Environment](#environment) for the full table including legacy
names.

```bash
# Application identity
VITE_APP_NAME=checkout
VITE_APP_VERSION=2.4.1
VITE_APP_ENV=production

# Error tracking (its own IndexedDB store)
VITE_ERROR_TRACKING_ENABLED=true
VITE_ERROR_TRACKING_RETENTION_DAYS=7
VITE_ERROR_TRACKING_MAX_RECORDS=500
VITE_ERROR_TRACKING_MAX_PAYLOAD_BYTES=16384

# Log persistence (its own IndexedDB store)
VITE_LOG_PERSIST_ENABLED=true
VITE_LOG_PERSIST_LEVEL=            # empty inherits VITE_LOG_LEVEL
VITE_LOG_PERSIST_RETENTION_DAYS=3
VITE_LOG_PERSIST_MAX_RECORDS=2000
VITE_LOG_PERSIST_MAX_PAYLOAD_BYTES=4096
VITE_LOG_LEVEL=warn                # console only

# Uploads: one URL per kind, and IndexedDB stays the offline outbox
VITE_TELEMETRY_REST_ENABLED=true
VITE_ERROR_TRACKING_REST_URL=/api/telemetry/errors
VITE_LOG_TRACKING_REST_URL=/api/telemetry/logs
VITE_TELEMETRY_SYNC_INTERVAL_MS=30000
VITE_TELEMETRY_SYNC_BATCH_SIZE=50
```

```ts
import { initTelemetry } from '@codewithrajat/rm-logvault';

// Identical, without a build-time environment: `env: true` reads the same names.
initTelemetry({ env: true });

// …or spelled out as options, which always win over the environment.
initTelemetry({
  appName: 'checkout',
  appVersion: '2.4.1',
  environment: 'production',
  mode: 'remote',
  errors: {
    enabled: true,
    retentionDays: 7,
    maxRecords: 500,
    maxPayloadBytes: 16_384,
  },
  logs: {
    enabled: true,
    level: 'warn', // persist
    consoleLevel: 'warn', // console
    retentionDays: 3,
    maxRecords: 2_000,
    maxPayloadBytes: 4_096,
  },
  rest: {
    enabled: true,
    errorsUrl: '/api/telemetry/errors',
    logsUrl: '/api/telemetry/logs',
    intervalMs: 30_000,
    batchSize: 50,
  },
});
```

---

## Adapter descriptors

A frozen, build-time constant describing every integration the package ships. It is deliberately
**not** a runtime registry: a `Map` that each adapter module populates at import time would report
`[]` for every adapter the application did not happen to import, and would cost every consumer bytes
for information that is constant at build time. The constant is annotated `@__PURE__`, so a bundler
drops the whole table when nothing reads it.

### `ADAPTERS`

```ts
const ADAPTERS: readonly AdapterDescriptor[];
```

| `key`         | `framework`     | `entryPoint`                                 | `inCore` | `kind`         |
|---------------|-----------------|----------------------------------------------|----------|----------------|
| `react`       | `react`         | `@codewithrajat/rm-logvault/react`           | `false`  | `framework`    |
| `vue`         | `vue`           | `@codewithrajat/rm-logvault/vue`             | `false`  | `framework`    |
| `angular`     | `angular`       | `@codewithrajat/rm-logvault/angular`         | `false`  | `framework`    |
| `axios`       | `axios`         | `@codewithrajat/rm-logvault/axios`           | `false`  | `http-client`  |
| `fetch`       | `fetch`         | `@codewithrajat/rm-logvault/fetch`           | `false`  | `http-client`  |
| `react-query` | `tanstack-query`| `@codewithrajat/rm-logvault/react-query`     | `false`  | `framework`    |
| `http`        | `core`          | `@codewithrajat/rm-logvault/http-fetch`      | `false`  | `http-client`  |
| `storage`     | `core`          | `@codewithrajat/rm-logvault/storage`         | `false`  | `storage`      |
| `testing`     | `core`          | `@codewithrajat/rm-logvault/testing`         | `false`  | `transport`    |

Each descriptor also carries `name` (human-readable), `targets` (roughly the versions it supports),
`exports` (every symbol its entry point provides) and `description` (one line).

`AdapterDescriptor` is `{ key, name, framework, entryPoint, inCore, targets, exports, description,
kind }`. `AdapterKind` is `'framework' | 'http-client' | 'storage' | 'transport'`.

> **Source note.** Three documentation defects live in `src/adapters/descriptors.ts` and the table
> above reproduces what the source *data* says, not what its prose says:
>
> - The `http` descriptor's `entryPoint` is `'@codewithrajat/rm-logvault/http-fetch'`. There is **no
>   `/http-fetch` subpath** in `package.json`; the real specifier is
>   `@codewithrajat/rm-logvault/http`. The same stale name appears in `src/adapters/http.ts` and
>   `src/adapters/httpFetch.ts`.
> - The `http` descriptor lists only three exports (`createFetchHttpClient`, `createAuthHeaderProvider`,
>   `createAuthInterceptor`), omitting the contract and helper exports the subpath really provides.
> - The module's `@example` block claims `ADAPTERS.map((adapter) => adapter.framework)` returns
>   `['react', 'vue', 'angular', 'axios', 'fetch', 'tanstack-query', 'http', 'storage']`. That is
>   wrong twice over: it omits `testing`, and the three framework-agnostic entries report
>   `framework: 'core'`, not `'http'`/`'storage'`. See the real output above.
>
> Treat the [subpath sections](#subpath-adapters) below as authoritative for import specifiers.

### `adapterFor`

```ts
function adapterFor(key: string): AdapterDescriptor | undefined;
```

Looks up a descriptor by subpath key, e.g. `'vue'`. Returns `undefined` for an empty or non-string
key, or when nothing matches.

### `adapterFrameworks`

```ts
function adapterFrameworks(): readonly string[];
```

Every distinct `framework` across `ADAPTERS`, deduplicated and sorted. `'core'` is included for the
framework-agnostic entries:

```ts
adapterFrameworks();
// ['angular', 'axios', 'core', 'fetch', 'react', 'tanstack-query', 'vue']
```

```ts
import { ADAPTERS, adapterFor } from '@codewithrajat/rm-logvault';

ADAPTERS.map((adapter) => adapter.framework);
// ['react', 'vue', 'angular', 'axios', 'fetch', 'tanstack-query', 'http', 'storage', 'testing']

adapterFor('vue')?.entryPoint;
// '@codewithrajat/rm-logvault/vue'
```

---

## Environment

### `DEFAULT_ENV_PREFIXES`

```ts
const DEFAULT_ENV_PREFIXES: readonly string[]; // ['VITE_', 'NEXT_PUBLIC_', 'REACT_APP_']
```

Tried in order; the first non-empty match wins.

### `fromEnv`

```ts
function fromEnv(prefix?: string | readonly string[]): EnvOptions;
```

Builds partial telemetry options from build-time environment variables. Reading never throws, even
when both `import.meta.env` and `process.env` are absent.

| Parameter | Type                          | Default                | Description                                                      |
|-----------|-------------------------------|------------------------|------------------------------------------------------------------|
| `prefix`  | `string \| readonly string[]` | `DEFAULT_ENV_PREFIXES` | One prefix or a list. An empty array falls back to the defaults. |

Returns `EnvOptions` — a flat partial-options object. Every field is present **only** when the
matching variable was found, non-empty and parseable, so an absent variable never overrides a default.

Recognised suffixes, with `VITE_` shown as the prefix. The prefix itself is yours
(`NEXT_PUBLIC_`, `REACT_APP_`, …); the suffix is what `fromEnv` looks for.

**Identity and lifecycle**

| Variable                           | Option          | Unit / values                              | Default       |
|------------------------------------|-----------------|--------------------------------------------|---------------|
| `VITE_APP_NAME`                    | `appName`       | string                                     | none          |
| `VITE_APP_VERSION`                 | `appVersion`    | string                                     | none          |
| `VITE_BUILD_ID`                    | `buildId`       | string                                     | none          |
| `VITE_APP_ENV`, `VITE_ENVIRONMENT` | `environment`   | string                                     | none          |
| `VITE_TELEMETRY_ENABLED`           | `enabled`       | `true`/`false`                             | `true`        |
| `VITE_TELEMETRY_DB_PREFIX`         | `dbPrefix`      | string                                     | `rm-logvault` |
| `VITE_TELEMETRY_OPEN_TIMEOUT_MS`   | `openTimeoutMs` | milliseconds to wait for an IndexedDB open | `5000`        |

**Errors — their own IndexedDB store**

| Variable                                    | Option                      | Unit                            | Default |
|---------------------------------------------|-----------------------------|---------------------------------|---------|
| `VITE_ERROR_TRACKING_ENABLED`               | `errors.enabled`            | `true`/`false`                  | `true`  |
| `VITE_ERROR_TRACKING_RETENTION_DAYS`        | `errors.retentionDays`      | days; `0` = never delete by age | `7`     |
| `VITE_ERROR_TRACKING_MAX_RECORDS`           | `errors.maxRecords`         | rows                            | `500`   |
| `VITE_ERROR_TRACKING_MAX_PAYLOAD_BYTES`     | `errors.maxPayloadBytes`    | UTF-8 bytes per record          | `16384` |
| `VITE_ERROR_TRACKING_MAX_EVENTS_PER_MINUTE` | `errors.maxEventsPerMinute` | events / 60 s; `0` = unlimited  | `120`   |

**Logs — their own IndexedDB store**

| Variable                               | Option                  | Unit                                        | Default   |
|----------------------------------------|-------------------------|---------------------------------------------|-----------|
| `VITE_LOG_PERSIST_ENABLED`             | `logs.enabled`          | `true`/`false`                              | `true`    |
| `VITE_LOG_LEVEL`                       | `logs.consoleLevel`     | level                                       | unchanged |
| `VITE_LOG_PERSIST_LEVEL`               | `logs.level`            | level; **empty inherits `VITE_LOG_LEVEL`**  | `warn`    |
| `VITE_LOG_PERSIST_RETENTION_DAYS`      | `logs.retentionDays`    | days; `0` = never delete by age             | `3`       |
| `VITE_LOG_PERSIST_MAX_RECORDS`         | `logs.maxRecords`       | rows                                        | `2000`    |
| `VITE_LOG_PERSIST_MAX_PAYLOAD_BYTES`   | `logs.maxPayloadBytes`  | UTF-8 bytes per record                      | `4096`    |
| `VITE_LOG_PERSIST_MAX_LOGS_PER_MINUTE` | `logs.maxLogsPerMinute` | logs / 60 s; `0` = unlimited                | `600`     |
| `VITE_LOG_PERSIST_WRITE_FLUSH_MS`      | `logs.writeFlushMs`     | milliseconds; upper bound on a buffered log | `1000`    |
| `VITE_LOG_PERSIST_WRITE_BATCH_SIZE`    | `logs.writeBatchSize`   | entries that trigger a write                | `50`      |

**REST upload** — errors and logs may post to different endpoints, and IndexedDB stays the offline
outbox either way.

| Variable                          | Option            | Unit / values                         | Default                  |
|-----------------------------------|-------------------|---------------------------------------|--------------------------|
| `VITE_TELEMETRY_REST_ENABLED`     | `rest.enabled`    | `true`/`false`                        | `true` when a URL is set |
| `VITE_ERROR_TRACKING_REST_URL`    | `rest.errorsUrl`  | absolute `http(s)` or a relative path | none                     |
| `VITE_LOG_TRACKING_REST_URL`      | `rest.logsUrl`    | absolute `http(s)` or a relative path | none                     |
| `VITE_TELEMETRY_SYNC_INTERVAL_MS` | `rest.intervalMs` | milliseconds                          | `30000`                  |
| `VITE_TELEMETRY_SYNC_BATCH_SIZE`  | `rest.batchSize`  | records per request                   | `50`                     |

**Parsing rules**, which are the same for every variable:

- **Booleans** accept `true`/`1`/`yes`/`on` and `false`/`0`/`no`/`off`, case-insensitively. Anything
  else is **ignored**, so `VITE_ERROR_TRACKING_ENABLED=maybe` leaves the default in place rather than
  silently disabling capture.
- **Numbers** must be non-negative and finite. Whitespace, an empty string, a non-number and a
  negative value are all ignored. Integers are floored (`10.9` → `10`), except `retentionDays`, where
  a fraction is meaningful (`0.5` = twelve hours). `0` is preserved, and each option decides what it
  means — see [What the units mean](#what-the-units-mean).
- A variable that is present but empty counts as **absent**, which is what makes the documented
  `VITE_LOG_PERSIST_LEVEL=` "inherit `VITE_LOG_LEVEL`" behaviour work.

**Legacy aliases**, still read so an earlier configuration keeps working. When both a specific name
and its alias are set, the specific one wins:

| Alias                           | Equivalent now                 | Note                                                                                                                 |
|---------------------------------|--------------------------------|----------------------------------------------------------------------------------------------------------------------|
| `VITE_TELEMETRY_ERRORS_ENABLED` | `VITE_ERROR_TRACKING_ENABLED`  |                                                                                                                      |
| `VITE_TELEMETRY_LOGS_ENABLED`   | `VITE_LOG_PERSIST_ENABLED`     |                                                                                                                      |
| `VITE_TELEMETRY_PERSIST_LEVEL`  | `VITE_LOG_PERSIST_LEVEL`       |                                                                                                                      |
| `VITE_TELEMETRY_LOG_LEVEL`      | —                              | **Persist level only.** It never sets the console level, so an existing deployment's console output does not change. |
| `VITE_TELEMETRY_ERRORS_URL`     | `VITE_ERROR_TRACKING_REST_URL` |                                                                                                                      |
| `VITE_TELEMETRY_LOGS_URL`       | `VITE_LOG_TRACKING_REST_URL`   |                                                                                                                      |

```ts
import { initTelemetry, fromEnv } from '@codewithrajat/rm-logvault';

// The environment layer, with every prefix from DEFAULT_ENV_PREFIXES.
initTelemetry({ env: true });

// One prefix, several in order.
initTelemetry({ env: 'NEXT_PUBLIC_' });
initTelemetry({ env: ['VITE_', 'PUBLIC_'] });

// `fromEnv()` reads the values; it is NOT a drop-in options object, because its
// fields are flat while the environment layer is read through `options.env`.
const env = fromEnv();
initTelemetry({ appName: env.appName, errors: { maxRecords: env.errorsMaxRecords } });
```

### `getGlobal`

```ts
function getGlobal(key: string): unknown;
```

Reads a property from `globalThis` without ever throwing. Returns `undefined` if the read throws.

### `isBrowser`

```ts
function isBrowser(): boolean;
```

`true` only when both `window` and `document` are present. `exportDiagnosticsReport` uses this as
its first check.

```ts
import { isBrowser, installDiagnosticsExportShortcut } from '@codewithrajat/rm-logvault';

if (isBrowser()) installDiagnosticsExportShortcut();
```

### `safeGet`

```ts
function safeGet(target: unknown, key: string): unknown;
```

Reads a property from an arbitrary object without triggering hostile getters. Returns `undefined`
if the read throws or if the target is not an object.

```ts
safeGet(hostileProxy, 'message'); // undefined instead of throwing
```

---

## Logger

### `createLogger`

```ts
function createLogger(): LoggerController;
```

Creates a logger controller with its own sinks, buffer and console level. The module-level `logger`
is one of these.

| `LoggerController` member            | Type                                                                   | Description                                                   |
|--------------------------------------|------------------------------------------------------------------------|---------------------------------------------------------------|
| `logger`                             | `Logger`                                                               | The public facade.                                            |
| `replayPreInit()`                    | `() => void`                                                           | Re-dispatch buffered calls. Idempotent.                       |
| `bufferedCount()`                    | `() => number`                                                         | How many pre-init calls are held.                             |
| `setConsoleCapture(enabled)`         | `(enabled: boolean) => void`                                           | Install or remove the `console.warn`/`console.error` wrapper. |
| `emitInternal(level, message, args)` | `(level: LogLevel, message: string, args: readonly unknown[]) => void` | Emit through the reserved internal path, skipping all sinks.  |
| `reset()`                            | `() => void`                                                           | Restore console wrapping and drop buffered calls.             |

```ts
import { createLogger } from '@codewithrajat/rm-logvault';

const controller = createLogger();
controller.logger.addSink({ write: (record) => ship(record) });
controller.logger.warn('[Checkout] retrying payment');
```

### `createSinkRegistry`

```ts
function createSinkRegistry(): SinkRegistry;
```

A named collection of sinks, with introspection and keyed removal. `logger.addSink(...)` remains
*the* installation API; the registry is what sits behind it. A consumer that never touches this
module is unaffected and pays nothing for it beyond a `Map` it never reads.

| Member                | Signature                                                  | Description                                                                                                                                                       |
|-----------------------|------------------------------------------------------------|-------------------------------------------------------------------------------------------------------------------------------------------------------------------|
| `register(key, sink)` | `(key: string, sink: LogSink) => () => void`               | Register under a key. An existing key **replaces** the previous sink. Returns an unregister function that is safe to call twice and removes only this exact sink. |
| `unregister(key)`     | `(key: string) => boolean`                                 | Remove by key. `true` when one was removed.                                                                                                                       |
| `get(key)`            | `(key: string) => LogSink \| undefined`                    | The sink under a key.                                                                                                                                             |
| `has(key)`            | `(key: string) => boolean`                                 | Whether a key is registered.                                                                                                                                      |
| `list()`              | `() => readonly SinkRegistration[]`                        | Every registration, in insertion order.                                                                                                                           |
| `keys()`              | `() => readonly string[]`                                  | Every key, in insertion order.                                                                                                                                    |
| `size()`              | `() => number`                                             | How many sinks are registered.                                                                                                                                    |
| `write(record)`       | `(record: LogRecord) => void`                              | Send one already-sanitized record to every sink. Each throwing sink is contained individually, so one bad sink cannot stop the others.                            |
| `clear()`             | `() => void`                                               | Remove every sink. Called on `destroyTelemetry`.                                                                                                                  |

`SinkRegistration` is `{ key, name, sink }`, where `name` is the sink's own `name` or `undefined`.
Every member is guarded: a hostile sink or a malformed key is reported through the library's internal
diagnostics and then ignored, never thrown.

```ts
import { createSinkRegistry } from '@codewithrajat/rm-logvault';

const registry = createSinkRegistry();
registry.register('overlay', { name: 'overlay', write: (record) => render(record) });
registry.keys(); // ['overlay']
```

### `getSinkRegistry`

```ts
function getSinkRegistry(): SinkRegistry;
```

The registry holding every sink attached to the shared `logger` — **including the library's own
IndexedDB persistence sink**.

Registry keys are `` `${sink.name ?? 'sink'}#${n}` ``, where `n` is a registration sequence number.
The sequence is what keeps two sinks that declare the same `name` from replacing each other.

```ts
import { getSinkRegistry, logger } from '@codewithrajat/rm-logvault';

logger.addSink({ name: 'overlay', write: (record) => render(record) });
getSinkRegistry().keys();   // ['@codewithrajat/rm-logvault-indexeddb#1', 'overlay#2']

// Detach the overlay later, from anywhere.
const entry = getSinkRegistry().list().find((item) => item.name === 'overlay');
if (entry !== undefined) getSinkRegistry().unregister(entry.key);
```

> **Source note.** Install through `logger.addSink()`, not through `register` on this registry.
> `addSink` is what keeps pre-init replay and the logger's re-entrancy guard working; registering
> directly in the registry bypasses both. The registry is for *inspecting* what is attached and for
> detaching a sink by key from somewhere else in the codebase.

### `logger`

```ts
const logger: Logger;
```

The shared logging facade.

**Every `logger.*` call produces a _log_ record, whatever the level.** The destination is chosen by
the API you called, not by the level: `logger.error(...)` is a `LogRecord` with `level: 'error'` and
is written to the `logs` store in `${dbPrefix}-logs`. It does **not** create an `ErrorRecord` and it
never appears in `${dbPrefix}-errors`, however error-like it sounds:

| You call                                                      | Record                         | Database → store                |
|---------------------------------------------------------------|--------------------------------|---------------------------------|
| `logger.error(...)` / `logger.warn(...)` / `logger.info(...)` | `LogRecord` (`level`)          | `rm-logvault-logs` → `logs`     |
| `console.error(...)` with `logs.captureConsole`               | `LogRecord` (`level: 'error'`) | `rm-logvault-logs` → `logs`     |
| `captureError(error, ctx)`                                    | `ErrorRecord` (`source`)       | `rm-logvault-errors` → `errors` |
| A `throw` in a framework handler, or an uncaught error        | `ErrorRecord` (`source`)       | `rm-logvault-errors` → `errors` |

The two kinds are deliberately not interchangeable. An `ErrorRecord` carries a `fingerprint`,
`severity`, `category`, `handled`, `occurrenceCount` and `firstSeen`/`lastSeen`, and repeated
occurrences **aggregate** into one pending row; a `LogRecord` carries `level`, `message`, `data` and
`seq`, and every call is its own appended row. Use `captureError` when you want grouping, severity and
the diagnostics report's fingerprint view; use `logger.error` when you want a message-shaped event.

| Member       | Signature                                            | Description                                                                                                                                                      |
|--------------|------------------------------------------------------|------------------------------------------------------------------------------------------------------------------------------------------------------------------|
| `trace`      | `(message: string, ...args: LogArgs) => void`        | Lowest level.                                                                                                                                                    |
| `debug`      | `(message: string, ...args: LogArgs) => void`        |                                                                                                                                                                  |
| `info`       | `(message: string, ...args: LogArgs) => void`        |                                                                                                                                                                  |
| `warn`       | `(message: string, ...args: LogArgs) => void`        | Persisted by default (`logs.level` is `'warn'`).                                                                                                                 |
| `error`      | `(message: string, ...args: LogArgs) => void`        |                                                                                                                                                                  |
| `addSink`    | `(sink: LogSink) => () => void`                      | Register a sink; returns an unsubscribe function. It installs through [`getSinkRegistry()`](#getsinkregistry) under the key `` `${sink.name ?? 'sink'}#${n}` ``. |
| `setLevel`   | `(level: LogLevelSetting) => void`                   | Set the **console** level. `'off'` silences output but not persistence.                                                                                          |
| `setEnabled` | `(enabled: boolean) => void`                         | Master switch for the logger.                                                                                                                                    |
| `getConfig`  | `() => { level: LogLevelSetting; enabled: boolean }` | Current console level and enabled flag.                                                                                                                          |

`LogSink` is `{ readonly name?: Maybe<string>; readonly write: (record: LogRecord) => void }`. A sink
that throws is swallowed; a sink that logs is protected against re-entrancy; a sink registered when
the buffer is non-empty and it is the first sink triggers a pre-init replay.

`LogArgs` is `readonly unknown[]`. At most `MAX_LOG_ARGS` (5) arguments are captured, each deep
scrubbed by `sanitizeValue`.

```ts
import { logger } from '@codewithrajat/rm-logvault';

logger.info('[Checkout] cart loaded', { items: 3 });
logger.error('[Checkout] payment failed', error);

const off = logger.addSink({ name: 'my-sink', write: (r) => ship(r) });
off(); // unsubscribe
```

### Writing a log call

The shape is `logger.<level>(message, ...args)`. The message is scrubbed as free text — URLs, bearer
tokens, `key=value` secrets and e-mail addresses are redacted — and capped at
`MAX_LOG_MESSAGE_LENGTH` (1000) characters. Up to `MAX_LOG_ARGS` (5) arguments are deep-scrubbed by
`sanitizeValue` and stored as the record's `data` array.

```ts
logger.warn('[checkout] payment failed', { orderId: 'A-1024', attempt: 2 });
// message: '[checkout] payment failed'
// data:    [{ orderId: 'A-1024', attempt: 2 }]
```

A stable, greppable message with the varying parts in `data` is what makes a log trail searchable.
Interpolating values into the message instead makes every occurrence a different string.

| Do                                                     | Why                                                                                                                                                                                                                      |
|--------------------------------------------------------|--------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------|
| Pass values as you have them, `undefined` included     | Nothing you pass can void the record — a missing property stores as `null` and a function as `'[Function]'`. See [`sanitizeValue`](#sanitizevalue).                                                                      |
| Encode "absent" explicitly when the difference matters | `undefined` and `null` both store as `null`, so `{ orderId }` cannot tell you whether the field was missing or deliberately null. Pass `{ orderId: orderId ?? 'none' }`, or add `{ hasOrderId: orderId !== undefined }`. |
| Log a callback's name, not the callback                | A function stores as the literal string `'[Function]'`, which identifies nothing. Use `{ handler: fetchUser.name }`.                                                                                                     |
| Keep `data` to the fields you would actually filter on | Each record has a `maxPayloadBytes` budget (default 4096). Over it, `data` is dropped first, then the message is shortened to 300 characters, then the record is dropped entirely.                                       |
| Give sensitive fields their real names                 | A key matching `SENSITIVE_KEY_PATTERN` — `token`, `password`, `session`, `email`, `phone`, … — stores `[REDACTED]` regardless of its value, so naming it honestly is safe.                                               |

Two behaviours worth knowing before you debug a missing record:

- **A message starting with a reserved prefix is never persisted.** `[Telemetry]`, `[ErrorTracking]`,
  `[LogTracking]` and `[DiagnosticsExport]` are the library's own reserved diagnostics; persisting
  them would create a feedback loop where each storage warning produces another record. So
  `logger.warn('[Telemetry] my own note')` reaches the console and nothing else. Use a different
  prefix.
- **Past the caps a value is bounded, not rejected**: depth past `MAX_DEPTH` (4) becomes `[MaxDepth]`,
  an object past `MAX_KEYS` (30) gains a `…` overflow entry, an array past `MAX_ARRAY_ITEMS` (20)
  gains `[+N]`, a string past `MAX_STRING_LENGTH` (2000) is truncated with a length suffix, and a
  cycle becomes `[Circular]`.

### `LOG_LEVELS`

```ts
const LOG_LEVELS: readonly LogLevel[]; // ['trace', 'debug', 'info', 'warn', 'error']
```

Ascending order, useful for `>= level` comparisons and UI filters.

### `LOG_LEVEL_PRIORITY`

```ts
const LOG_LEVEL_PRIORITY: Readonly<Record<LogLevel, number>>;
// { trace: 10, debug: 20, info: 30, warn: 40, error: 50 }
```

Higher wins.

### `levelPriority`

```ts
function levelPriority(level: LogLevelSetting): number;
```

Numeric priority for a level setting. `'off'` maps to `Infinity`, so nothing passes.

### `meetsLevel`

```ts
function meetsLevel(actual: LogLevel, threshold: LogLevelSetting): boolean;
```

Whether `actual` is at or above `threshold`. Returns `false` whenever the threshold is `'off'`.

| Parameter   | Type              | Description                        |
|-------------|-------------------|------------------------------------|
| `actual`    | `LogLevel`        | The level a record was emitted at. |
| `threshold` | `LogLevelSetting` | The configured minimum.            |

### `LogRecord`, `LogEnvironment`, `ExternalLogSource`

```ts
interface LogRecord {
  readonly schemaVersion: 1;
  readonly id: string;
  readonly uploadStatus: UploadStatus;
  readonly uploadAttempts: number;
  readonly claimedAt?: Maybe<Timestamp>;
  readonly level: LogLevel;
  readonly message: string;
  readonly data?: Maybe<readonly unknown[]>;
  readonly route?: Maybe<string>;
  readonly pageLoadId: string;
  readonly environment: LogEnvironment;
  readonly timestamp: Timestamp;
  readonly seq: number;
}

interface LogEnvironment {
  readonly appName?: Maybe<string>;
  readonly appVersion?: Maybe<string>;
  readonly buildId?: Maybe<string>;
  readonly environment?: Maybe<string>;
}

interface ExternalLogSource {
  addSink(sink: LogSink): () => void;
}
```

`seq` is a per-page-load monotonic counter giving deterministic ordering for records that share a
millisecond. `LogEnvironment` is deliberately narrower than the error environment block, because
logs are high-volume and only stable application identity is worth duplicating onto every row.

---

## Error capture

Everything in this section produces an **`ErrorRecord`**, written to the `errors` store in
`${dbPrefix}-errors`. This is the only family of APIs that does. `logger.*` and captured
`console.*` calls produce `LogRecord`s in `${dbPrefix}-logs` instead, at every level — so a
`logger.error(...)` never appears in the errors store. See [`logger`](#logger).

### `captureApiError`

```ts
function captureApiError(error: unknown, startedAt?: number): void;
```

Captures an HTTP client failure with full request context, using the allow-listed field set.

| Parameter   | Type                  | Description                                                                       |
|-------------|-----------------------|-----------------------------------------------------------------------------------|
| `error`     | `unknown`             | The axios-shaped rejection, or any thrown value.                                  |
| `startedAt` | `number \| undefined` | Timestamp captured before the request was issued, used to compute `api.duration`. |

Never throws. Records use `source: 'api'` with the classification from `buildApiErrorContext`.

```ts
import { captureApiError } from '@codewithrajat/rm-logvault';

axios.interceptors.response.use(undefined, (error) => {
  captureApiError(error, error.config?.metadata?.startedAt);
  return Promise.reject(error);
});
```

### `captureError`

```ts
function captureError(error: unknown, ctx?: ErrorContext): void;
```

Captures anything that was thrown. This is the single ingestion point for every source.

| Parameter | Type                        | Description                                                                                                                               |
|-----------|-----------------------------|-------------------------------------------------------------------------------------------------------------------------------------------|
| `error`   | `unknown`                   | Any type, including `null`, a `Symbol`, a hostile Proxy or an `AggregateError`.                                                           |
| `ctx`     | `ErrorContext \| undefined` | Optional source, severity, category, component stack, location, api context, event, tags, extra, handled override and timestamp override. |

**Never throws**, never returns a rejection, and is safe to call from a `catch` block, a
`window.onerror` handler or a React error boundary. Before `initTelemetry` it buffers the error
(up to 50, normalised and sanitized immediately — never a live reference to your object graph) and
replays it once application metadata is known.

Guarantees, all enforced in `createErrorTracker`:

- **Cannot recurse** — a `capturing` flag drops anything raised while the pipeline is running.
- **Cannot double count** — a `WeakSet<object>` remembers object and function errors.
- **Cannot flood** — a fixed 60-second-window rate limiter drops excess and reports one summary.
- **Cannot lose pre-init errors** — see above.

This is the only application-facing API that writes to the `errors` store in `${dbPrefix}-errors`, and
the write is queued **immediately** — error records are not batched, unlike logs, which are written once
50 accumulate or `logs.writeFlushMs` (default 1000 ms) elapses. `flushTelemetry()` awaits that queue and
is the deterministic way to know a record has been handed to storage. A write that fails is reported
under the `error-persist` stage. `ctx.source` defaults to `'manual'`; see [`logger`](#logger) for why a
`logger.error(...)` never appears in the errors store.

```ts
import { captureError } from '@codewithrajat/rm-logvault';

try {
  checkout();
} catch (error) {
  captureError(error, {
    source: 'manual',
    tags: { flow: 'checkout' },
    extra: { cartId },
  });
}
```

### `captureFetchError`

```ts
function captureFetchError(request: FetchRequestInfo, failure: FetchFailure): void;
```

Captures a failed `fetch` call.

| Parameter | Type               | Description                                                                            |
|-----------|--------------------|----------------------------------------------------------------------------------------|
| `request` | `FetchRequestInfo` | `{ method?, url?, startedAt? }` — the request that was issued.                         |
| `failure` | `FetchFailure`     | `{ error?, response?, timedOut? }` — the rejection reason and/or the non-2xx response. |

Never throws. Unlike axios, `fetch` rejects only on transport failure; a 500 resolves normally, so
pass `{ response }` for a non-2xx and `{ error }` for a rejection.

```ts
import { captureFetchError } from '@codewithrajat/rm-logvault';

const startedAt = Date.now();
const response = await fetch('/api/orders');
if (!response.ok) {
  captureFetchError({ method: 'GET', url: '/api/orders', startedAt }, { response });
}
```

### `withErrorCapture`

```ts
function withErrorCapture<T>(handler: () => T, ctx?: ErrorContext): T;
```

Wraps a handler so a throw or rejection is captured **and then re-thrown**.

| Parameter | Type                        | Description                                               |
|-----------|-----------------------------|-----------------------------------------------------------|
| `handler` | `() => T`                   | The function to run.                                      |
| `ctx`     | `ErrorContext \| undefined` | Optional context; `source` defaults to `'event-handler'`. |

**Returns exactly what `handler` returned.** For an async handler the returned promise rejects with
the _same_ error value, not a wrapper, so the application's own error handling is unchanged.

```ts
import { withErrorCapture } from '@codewithrajat/rm-logvault';

button.addEventListener(
  'click',
  withErrorCapture(
    async () => {
      await submitOrder();
    },
    { tags: { flow: 'checkout' } },
  ),
);
```

---

## Normalisation and classification

### `buildApiErrorContext`

```ts
function buildApiErrorContext(error: unknown, startedAt?: number): ApiClassification;
```

Classifies an axios-style rejection into `{ api, category, severity }`. **Never throws**; falls back
to `{ api: { kind: 'unknown' }, category: 'runtime', severity: 'error' }`.

Kind resolution order: `auth` → `abort` → `timeout` → `parse` → `http` → `network` → `unknown`.

| Signal                                                        | Kind                                           |
|---------------------------------------------------------------|------------------------------------------------|
| `markAuthError` tag (`_isTokenFetchError`)                    | `auth`                                         |
| `ERR_CANCELED`, `CanceledError`, `AbortError`                 | `abort`, or `timeout` when `timedOut === true` |
| `ECONNABORTED`, `ETIMEDOUT`, `TimeoutError`                   | `timeout`                                      |
| `SyntaxError`, or `ERR_BAD_RESPONSE` with a 2xx/absent status | `parse`                                        |
| Any non-2xx status                                            | `http`                                         |
| `ERR_NETWORK`, or a response object is present                | `network`                                      |
| Anything else                                                 | `unknown`                                      |

The `ApiClassification` shape is `{ api: ApiErrorContext; category: ErrorCategory; severity: ErrorSeverity }`.

### `buildFetchErrorContext`

```ts
function buildFetchErrorContext(
  request: FetchRequestInfo,
  failure: FetchFailure,
): ApiClassification;
```

Classifies a failed `fetch` call. `status === 0` (or an absent response) is classified as `network`.
Never throws.

### `categoryForKind`

```ts
function categoryForKind(kind: ApiErrorKind): ErrorCategory;
```

Maps `http`→`http`, `network`→`network`, `timeout`→`timeout`, `abort`→`abort`, `parse`→`parse`,
`auth`→`auth`, everything else → `runtime`.

### `CORRELATION_HEADERS`

```ts
const CORRELATION_HEADERS: readonly string[];
// ['x-request-id', 'x-correlation-id', 'x-trace-id', 'traceparent']
```

Probed in priority order; the first present value becomes `api.requestId`. Nothing is enumerated
beyond these four names.

### `isAuthError`

```ts
function isAuthError(error: unknown): boolean;
```

Whether an error was tagged by `markAuthError`. Reads the non-enumerable `_isTokenFetchError`
property defensively.

### `markAuthError`

```ts
function markAuthError<T>(error: T): T;
```

Tags an error as an authentication failure so `captureApiError` classifies it as `auth` with
`warning` severity. Returns the **same object**, so it chains inline in an interceptor. A frozen or
exotic object is left untagged and classification falls back to `http`/`network`.

Auth cannot be inferred reliably from a status code alone: a 401 from a refresh-token endpoint is
the refresh flow working, not an auth failure.

```ts
import { markAuthError } from '@codewithrajat/rm-logvault';

axios.interceptors.response.use(undefined, (error) => {
  if (error.response?.status === 401) markAuthError(error);
  return Promise.reject(error);
});
```

### `normalizeError`

```ts
function normalizeError(input: unknown): NormalizedError;
```

Turns anything into a `NormalizedError`. Contractually forbidden from throwing, including for
hostile inputs: Proxies whose every getter throws, throwing getters, circular `cause` graphs, and
`AggregateError`s. The final fallback is the hard-coded `UNNORMALIZABLE` literal.

```ts
interface NormalizedError {
  readonly name: string;
  readonly message: string;
  readonly stack?: Maybe<string>;
  readonly causes?: Maybe<readonly ErrorCause[]>;
  readonly thrownType: ThrownType;
  readonly isChunkError: boolean;
  readonly isCrossOrigin: boolean;
  readonly category?: Maybe<ErrorCategory>;
  readonly aggregatedCount?: Maybe<number>;
  readonly extra?: Maybe<Record<string, unknown>>;
}
```

Cross-realm safe: `instanceof Error` fails across iframes, workers and `vm` contexts, so a
structural check (a string `message` plus either a `name` or a `stack`) is used instead. Non-Error
throws get the name `NonErrorObject` and a message prefixed with `Non-Error value thrown`.
`AggregateError` sub-errors are read up to `MAX_AGGREGATE_ERRORS` (5).

### `sanitizeNormalized`

```ts
function sanitizeNormalized(normalized: NormalizedError): NormalizedError;
```

Re-runs the sanitizer over an already-normalised error. Used when a normalised form is produced
before the configured sanitizer is known (the pre-init path) and has to be scrubbed again later.
Never throws.

### `severityForKind`

```ts
function severityForKind(kind: ApiErrorKind, status: number | undefined): ErrorSeverity;
```

| Input                                 | Severity                                                                       |
|---------------------------------------|--------------------------------------------------------------------------------|
| `kind === 'abort'`                    | `'info'` — navigating away or typing aborts requests constantly; not a defect. |
| `kind === 'auth'`                     | `'warning'`                                                                    |
| `kind === 'http'` with `status < 500` | `'warning'`                                                                    |
| Everything else                       | `'error'`                                                                      |

### `UNNORMALIZABLE`

```ts
const UNNORMALIZABLE: NormalizedError;
// { name: 'Error', message: 'Unnormalizable error value', thrownType: 'other',
//   isChunkError: false, isCrossOrigin: false, category: 'runtime' }
```

The literal returned when even the fallback path fails. Exported so callers can compare against it.

### `ApiErrorContext`, `ErrorContext`, `ErrorRecord` and friends

```ts
interface ApiErrorContext {
  readonly kind: ApiErrorKind;
  readonly method?: Maybe<string>;
  readonly url?: Maybe<string>;
  readonly status?: Maybe<number>;
  readonly statusText?: Maybe<string>;
  readonly code?: Maybe<string>;
  readonly timeout?: Maybe<number>;
  readonly duration?: Maybe<number>;
  readonly requestId?: Maybe<string>;
}
```

Only ever populated from that explicit allow-list. Request/response bodies, parameters, cookies and
arbitrary headers are never read; the `url` is scrubbed by `sanitizer.url` before it is stored, so
even a caller passing a raw URL cannot leak credentials.

`ErrorContext` is the caller-supplied side: `source`, `severity`, `category`, `componentStack`,
`location`, `api`, `event`, `tags`, `extra`, `handled` and `timestamp`, all optional.

`ErrorRecord` is the persisted shape, documented in full in the
[REST contract](REST-CONTRACT.md#2-json-schema-draft-2020-12).

Type unions exported alongside: `ErrorSource`, `ErrorSeverity`, `ErrorCategory`, `ThrownType`,
`ApiErrorKind`, `ErrorCause`, `ErrorLocation`.

---

## Error context builders

The library can classify an HTTP failure, a chunk-load error or a React boundary crash, because those
are shapes it knows. It cannot know that `code === 'ALARM_NOT_FOUND'` means an alarm-context error, or
that `error.status === 402` means "billing" in one team's product and "payment required" in another's.

A context builder is how that knowledge gets in without a callback threaded through every
`captureError` call site and without the library learning any product vocabulary. Register once at
startup; every subsequent capture — including ones from global handlers and third-party adapters,
which the application never sees — is classified.

### `registerErrorContextBuilder`

```ts
function registerErrorContextBuilder(builder: ErrorContextBuilder): () => void;
```

| Parameter | Type                  | Description                                                            |
|-----------|-----------------------|------------------------------------------------------------------------|
| `builder` | `ErrorContextBuilder` | The classifier. A `name` already present is **replaced**, not stacked. |

- **Returns:** an unregister function; calling it twice is safe, and it removes only this exact
  builder object (a later registration under the same name survives the original's teardown).
- A malformed builder — `null`, a missing or empty `name`, a non-function `canHandle` or `build` —
  is ignored and a no-op unregister function is returned. **Never throws.**

`ErrorContextBuilder` is:

```ts
interface ErrorContextBuilder {
  readonly name: string;
  readonly canHandle: (error: unknown, ctx?: ErrorContext) => boolean;
  readonly build: (error: unknown, ctx?: ErrorContext) => ErrorContext | null;
}
```

`build` may return `null` to decline **after** `canHandle` matched, in which case resolution
continues to the next builder.

Resolution order is **registration order**, and the first builder whose `canHandle` returns `true`
wins. Register the specific classifiers before the general ones. A throwing `canHandle` is treated as
"does not match" and a throwing `build` falls through to the next builder, each reported under
`context-builder-match:<name>` / `context-builder-build:<name>` — a third-party classifier must never
be able to swallow a capture.

The registry is **global and process-wide**, shared by every copy of the library in the page. It is
intentionally **not** reset by `destroyTelemetry`: a builder describes the application, not an
installation, and a re-init after an HMR reload must not silently lose the classification.

```ts
import { registerErrorContextBuilder } from '@codewithrajat/rm-logvault';

const off = registerErrorContextBuilder({
  name: 'alarms',
  canHandle: (error) => (error as { code?: string })?.code?.startsWith('ALARM_') === true,
  build: () => ({ source: 'api', category: 'runtime', tags: { domain: 'alarms' } }),
});

off(); // unregister
```

### `unregisterErrorContextBuilder`

```ts
function unregisterErrorContextBuilder(name: string): boolean;
```

Removes a builder by name. Returns `true` when one was removed. Never throws.

### `clearErrorContextBuilders`

```ts
function clearErrorContextBuilders(): void;
```

Removes every builder. Intended for tests and for an application that swaps its classification
wholesale. Ordinary teardown should use the function `registerErrorContextBuilder` returned instead.

### `listErrorContextBuilders`

```ts
function listErrorContextBuilders(): readonly ErrorContextBuilder[];
```

A snapshot array in resolution order. Mutating it does not affect the registry.

### `errorContextBuilderCount`

```ts
function errorContextBuilderCount(): number;
```

How many builders are registered.

### `resolveErrorContext`

```ts
function resolveErrorContext(error: unknown, ctx?: ErrorContext): ErrorContext;
```

The caller's context enriched by the first matching builder, unchanged when no builder matches.
**Never throws.**

Two fields are **merged** rather than replaced: `tags` and `extra`, key by key with the **caller
winning** on a collision. Those are additive by nature — a builder supplying `{ domain: 'alarms' }`
and a caller supplying `{ flow: 'checkout' }` describe the same error from two angles, and letting one
silently discard the other would lose information with no warning. Every other field is scalar and
the **caller's value always replaces the builder's**, so a builder cannot override `source` on a
`captureError(err, { source: 'react' })` call.

With nothing registered this is the identity function, and it costs one `Map` lookup:

```ts
import { resolveErrorContext } from '@codewithrajat/rm-logvault';

resolveErrorContext(new Error('x'), { tags: { flow: 'checkout' } });
```

### `installBuiltinContextBuilders` and the shipped builders

```ts
function installBuiltinContextBuilders(): () => void;

const httpErrorContextBuilder: ErrorContextBuilder;
const timeoutErrorContextBuilder: ErrorContextBuilder;
const typeErrorContextBuilder: ErrorContextBuilder;
```

Registers all three shipped builders and returns **one** unregister function that removes exactly the
three it added; safe to call twice. Nothing here self-registers — importing the module has no effect
until this is called, so upgrading the library can never silently change how an existing application
classifies its errors.

The order is deliberate and is the order they resolve in:

| Order | Builder                      | `canHandle`                                                                                                                                                                 | Contributes                                                                                         |
|-------|------------------------------|-----------------------------------------------------------------------------------------------------------------------------------------------------------------------------|-----------------------------------------------------------------------------------------------------|
| 1     | `timeoutErrorContextBuilder` | `code` is `'ETIMEDOUT'` or `'ECONNABORTED'`, or the message matches `TIMEOUT_PATTERN` (`timeout`, `timed out`, `ETIMEDOUT`, `ECONNABORTED`, case-insensitive, word-bounded) | `{ category: 'timeout', severity: 'warning', tags: { kind: 'timeout' } }`                           |
| 2     | `httpErrorContextBuilder`    | A response-like object with a finite positive numeric `status`, or a direct `status`/`statusCode`                                                                           | `{ category, severity, api, tags }` from `buildApiErrorContext`, plus `tags.kind`/`method`/`status` |
| 3     | `typeErrorContextBuilder`    | `name === 'TypeError'`, or a constructor named `TypeError` (cross-realm safe)                                                                                               | `{ category: 'runtime', severity: 'error', tags: { kind: 'type-error' } }`                          |

`timeout` comes first because a timed-out axios request has both a message and sometimes a response,
and "timeout" is the more specific label. `type-error` comes last so the general case cannot shadow
either. Register your own domain builders **before** calling this to give them precedence.

```ts
import { installBuiltinContextBuilders, registerErrorContextBuilder } from '@codewithrajat/rm-logvault';

// Opt in to all three, in the documented order.
const off = installBuiltinContextBuilders();

// …or pick one, and add your own domain knowledge ahead of it.
registerErrorContextBuilder(httpErrorContextBuilder);
registerErrorContextBuilder({
  name: 'alarms',
  canHandle: (error) => (error as { code?: string })?.code === 'ALARM_NOT_FOUND',
  build: () => ({ tags: { domain: 'alarms' } }),
});

off(); // removes only the ones it installed
```

`httpErrorContextBuilder` delegates to `buildApiErrorContext`, which reads only an allow-list of
fields — method, url, status, statusText, code, timeout, duration and one correlation header. Request
and response **bodies are never read**.

---

## Fingerprinting

### `cyrb53`

```ts
function cyrb53(input: string, seed?: number): number;
```

A fast, well-distributed 53-bit string hash returning an integer in `[0, 2^53)`. Chosen over a
cryptographic digest because fingerprints are computed on the hot error path and are a grouping
key, not a security boundary.

### `fingerprint`

```ts
function fingerprint(input: FingerprintInput): string;
```

Computes a stable, collision-resistant deduplication fingerprint.

- **Returns:** a 28-character lowercase hex string (two 14-character `cyrb53` halves with different
  seeds, ~106 bits), or an `unfingerprinted-…` token if hashing somehow fails.

Every field of `FingerprintInput` must already be sanitized: the fingerprint is computed from
sanitized values so a secret can never influence an index key.

```ts
import { fingerprint } from '@codewithrajat/rm-logvault';

fingerprint({
  source: 'window',
  category: 'runtime',
  name: 'TypeError',
  message: 'x is not a function',
});
// '3f9a1c2b7d4e01f5b6c7d8e9a0b1'
```

### `fingerprintParts`

```ts
function fingerprintParts(input: FingerprintInput): string[];
```

The ordered list of parts hashed into a fingerprint. Exported for tests and for anyone who wants to
see _why_ two errors grouped together. The order is: source, category, name, message, top 5 stack
frames (`FINGERPRINT_STACK_FRAMES`), top 3 component-stack frames
(`FINGERPRINT_COMPONENT_FRAMES`), normalised route, then the API quadruple (kind, method, URL,
status), the event triple (type, resource URL, directive), and finally the location — which is only
consulted when there is no stack at all, because otherwise the same throw site would split into many
groups.

### `normalizePathForFingerprint`

```ts
function normalizePathForFingerprint(input: string | undefined): string;
```

Drops the query and fragment, and collapses numeric, UUID and long-hex path segments to `:id`, so
instance identifiers do not split one logical route into thousands of groups.

```ts
import { normalizePathForFingerprint } from '@codewithrajat/rm-logvault';

normalizePathForFingerprint('/asset/103?tab=1'); // '/asset/:id'
normalizePathForFingerprint('/asset/104'); // '/asset/:id'
```

Uses `DIGITS_ONLY_PATTERN`, `UUID_PATTERN` (`[0-9a-f]{8}-…` v1–v8) and `LONG_HEX_PATTERN`
(`/^[0-9a-f]{24,}$/i`, which catches commit SHAs, content hashes and session ids).

### `topStackFrames`

```ts
function topStackFrames(stack: string | undefined, count: number): string;
```

Picks the most identifying stack frames and joins them with `|`. Recognises both `at …` (V8) and
`fn@url` (SpiderMonkey) frame shapes. Returns `''` for an absent or empty stack.

### `FingerprintInput`

```ts
interface FingerprintInput {
  readonly source: ErrorSource | string;
  readonly category: ErrorCategory | string;
  readonly name: string;
  readonly message: string;
  readonly stack?: string | undefined;
  readonly componentStack?: string | undefined;
  readonly route?: string | undefined;
  readonly api?: Pick<ApiErrorContext, 'kind' | 'method' | 'url' | 'status'> | undefined;
  readonly event?: Pick<ErrorEventInfo, 'type' | 'resourceUrl' | 'directive'> | undefined;
  readonly location?: ErrorLocation | undefined;
}
```

---

## Sanitisation

### `createSanitizer`

```ts
function createSanitizer(config?: SanitizerConfig): Sanitizer;
```

Builds a sanitizer with optional caller-supplied extensions. Invalid entries are ignored rather
than throwing.

| `SanitizerConfig` member | Type                                         | Description                                                                                                                             |
|--------------------------|----------------------------------------------|-----------------------------------------------------------------------------------------------------------------------------------------|
| `extraSensitiveKeys`     | `readonly (string \| RegExp)[] \| undefined` | A string matches the separator-stripped, lowercased key exactly; a `RegExp` is tested against both the raw key and its normalised form. |
| `extraPatterns`          | `readonly RegExp[] \| undefined`             | Applied to free text **after** the built-in rules, so they win.                                                                         |
| `allowedQueryParams`     | `readonly string[] \| undefined`             | Replaces the default allow-list. Defaults to `DEFAULT_ALLOWED_QUERY_PARAMS` when omitted.                                               |

The returned `Sanitizer` has: `text(input, maxLength?)`, `stack(input, maxLength?)`,
`url(input, maxLength?)`, `value(input, key?)` and `isSensitiveKey(key)`.

Three invariants hold under all inputs: **never throws** (internal exceptions degrade to
`[REDACTED]` or `[Unserializable]` — it fails closed), **bounded work** (input is hard-truncated to
`HARD_TEXT_CAP` before any regular expression runs, and depth/keys/array length are capped), and
**bounded, JSON-safe output** (`sanitizeValue`'s result is always structured-cloneable and
`JSON.stringify`-safe).

```ts
import { createSanitizer } from '@codewithrajat/rm-logvault';

const sanitize = createSanitizer({
  extraSensitiveKeys: ['x-tenant-id', /^internal/i],
  extraPatterns: [/\b\d{16}\b/g], // credit-card-ish
  allowedQueryParams: ['page', 'locale'],
});

sanitize.text('token=abc123 page=2');
// 'token=[REDACTED] page=2'
```

### `getDefaultSanitizer`

```ts
function getDefaultSanitizer(): Sanitizer;
```

The sanitizer currently in force. `initTelemetry` swaps in one built from `options.redaction`, so
configuration applies to _all_ sanitization — record building, the logger, URL classification and
the diagnostics export — rather than only to the paths that happen to receive the options object.
`destroyTelemetry()` restores the built-in one.

### `isSensitiveKey`

```ts
function isSensitiveKey(key: string): boolean;
```

Whether a key name is treated as sensitive by the active rules. Fails closed: if the check itself
throws, the answer is `true`.

### `sanitizeStack`

```ts
function sanitizeStack(input: unknown, maxLength?: number): string;
```

Scrubs an error stack after dropping Vite-style `?t=`/`?v=` cache busters. Default budget
`MAX_STACK_LENGTH` (8000).

```ts
import { sanitizeStack } from '@codewithrajat/rm-logvault';

sanitizeStack('at App (/src/App.tsx?t=1712345:12:3)');
// 'at App (/src/App.tsx:12:3)'
```

### `sanitizeText`

```ts
function sanitizeText(input: unknown, maxLength?: number): string;
```

Scrubs one line of free text. Non-strings are coerced via `.message` or `String()`. Default budget
`MAX_STRING_LENGTH` (2000). Never throws; returns `[REDACTED]` on failure.

```ts
import { sanitizeText } from '@codewithrajat/rm-logvault';

sanitizeText('GET /me failed with Authorization: Bearer eyJhbGciOi...');
// 'GET /me failed with Authorization: Bearer [REDACTED]'

sanitizeText('mail me at dev@example.com');
// 'mail me at [REDACTED]'
```

The free-text rules run in this order: embedded URLs, JWTs, `Bearer`/`Basic`/`Token` schemes,
`key=value` secrets (`token`, `access_token`, `refresh_token`, `id_token`, `password`, `pwd`,
`secret`, `client_secret`, `api_key`, `api-key`, `apikey`, `session`, `sessionid`, `phone`, `mobile`,
`msisdn`, `telephone`, `email`), long opaque tokens with no `key=value` context
(`LONG_SECRET_TEXT_PATTERN` — a 32–200 character `[\w-]` run), e-mail addresses, then
`redaction.extraPatterns`. URL path segments that decode to an e-mail, start with `eyJ`, or match
`LONG_SECRET_PATTERN` (`/^[\w-]{32,}$/`) are replaced wholesale.

**Known limitation.** A bare short secret in prose is not detectable —
`sanitizeText('failed with hunter2')` keeps `hunter2`, because a seven-character word is
indistinguishable from ordinary prose and no pattern can catch it without redacting the message. For
a known value, use `redaction.extraPatterns`. This is asserted by `src/errors/sanitize.test.ts`.

### `sanitizeUrl`

```ts
function sanitizeUrl(input: unknown, maxLength?: number): string | undefined;
```

Scrubs a URL, redacting credentials, fragments and every non-allow-listed query value. Returns
`undefined` for a non-string or empty input, and `[REDACTED]` if scrubbing throws.

```ts
import { sanitizeUrl } from '@codewithrajat/rm-logvault';

sanitizeUrl('https://u:p@api.test/v1/users/42?token=abc&page=2#top');
// 'https://api.test/v1/users/42?token=[REDACTED]&page=2'

sanitizeUrl('/orders/103?email=a@b.co');
// '/orders/103?email=[REDACTED]'
```

Relative inputs stay relative. A non-web absolute scheme such as `mailto:` collapses to
`` `${scheme}[REDACTED]` `` and `data:` becomes `data:[REDACTED]`.

### `sanitizeValue`

```ts
function sanitizeValue(input: unknown, key?: string): unknown;
```

Deep-scrubs any value into a bounded, JSON-safe structure. Pass `key` to force redaction when the
property name is sensitive regardless of the value.

The walker: caps depth at `MAX_DEPTH` (4) with `[MaxDepth]`, caps object keys at `MAX_KEYS` (30)
with a `…` overflow entry, caps arrays and sets at `MAX_ARRAY_ITEMS` (20) with `[+N]`, marks cycles
as `[Circular]`, renders `Event`/`Element`/DOM nodes as short descriptors, converts `Date` to ISO,
reduces `Error`-like objects to `{ name, message }`, renders functions as `[Function]`, `undefined`
as `null`, and non-finite numbers as their string form.

Keys `__proto__`, `constructor` and `prototype` are skipped entirely, and the result is built with
`Object.fromEntries`, whose own-property definitions cannot mutate any prototype.

No value can cause a record to be discarded. The sanitizer degrades what it cannot represent, so a
missing property, a function, a cycle, a hostile getter or a value past the caps is *reported* rather
than treated as a reason to drop the write. A record only fails to be stored at one of the explicit
gates: the store is disabled, `consent()` returns false, the persist level (`logs.level`) is not met,
the rate limiter dropped it, `beforeCapture`/`beforeStore` returned `null`, or the record exceeded its
payload budget at every reduction tier.

```ts
import { sanitizeValue } from '@codewithrajat/rm-logvault';

sanitizeValue({ user: 'ada', accessToken: 'abc', deep: { a: { b: { c: 1 } } } });
// { user: 'ada', accessToken: '[REDACTED]', deep: { a: { b: '[MaxDepth]' } } }

const circular: Record<string, unknown> = {};
circular.self = circular;
sanitizeValue(circular); // { self: '[Circular]' }

// A property that is not on the object at all, and a function passed alongside it.
// Both are degraded in place — the record is still written.
sanitizeValue({ orderId: window.rajat, nested: { a: [undefined, () => {}] } });
// { orderId: null, nested: { a: [null, '[Function]'] } }
```

---

## Constants

### `REDACTED`

```ts
const REDACTED = '[REDACTED]';
```

The placeholder substituted for anything the sanitizer removes.

### `SENSITIVE_KEY_PATTERN`

```ts
const SENSITIVE_KEY_PATTERN: RegExp;
// /(authorization|cookie|token|password|passwd|pwd|secret|apikey|accesskey|privatekey|credential|session|signature|bearer|otp|^auth$|email|phone)/
```

Matched against a lowercased key with `[-_\s]` stripped, so `access_token`, `accessToken` and
`ACCESS TOKEN` all normalise to `accesstoken` and all match.

### `DEFAULT_ALLOWED_QUERY_PARAMS`

```ts
const DEFAULT_ALLOWED_QUERY_PARAMS: readonly string[];
// ['limit','offset','page','pageSize','size','sort','order','scope','lng','lang','type']
```

Query parameter names whose **values** survive redaction by default. A key that is also sensitive
is never allowed through.

### Timing, buffering and retention constants

Exported so the defaults are **readable from the API** rather than only from the source. None of them
is an option, and the table says what to change instead.

| Constant                      | Value | What it governs                                                                  | If you need to change it                                                              |
|-------------------------------|-------|----------------------------------------------------------------------------------|---------------------------------------------------------------------------------------|
| `PRE_INIT_ERROR_BUFFER_SIZE`  | `50`  | How many errors are held before `initTelemetry` runs.                            | Not configurable — see below.                                                         |
| `PRE_INIT_LOG_BUFFER_SIZE`    | `50`  | How many log calls are held until the first sink is registered.                  | Not configurable — see below.                                                         |
| `ERROR_CLEANUP_EVERY_WRITES`  | `25`  | Successful error writes between automatic retention sweeps.                      | Replace the repository — see [How retention is enforced](#how-retention-is-enforced). |
| `LOG_CLEANUP_EVERY_WRITES`    | `200` | Successful log writes between automatic retention sweeps.                        | Replace the repository — see below.                                                   |

**Why the pre-init buffer cannot be an option.** It holds records captured *before* `initTelemetry`
runs, so a value passed *to* `initTelemetry` arrives after the only window it governs has closed.
Initialising earlier is the lever: call `initTelemetry()` at the top of your entry module, before
framework bootstrap, and the window (and the buffer) stop mattering. Nothing is lost either way —
whatever was buffered is replayed into storage as ordinary records once initialisation succeeds.

**Why the cleanup cadence is not an option.** It decides *when* the sweep runs, not *what it keeps* —
the size of the store is governed entirely by `retentionDays` and `maxRecords`, which are options. The
cadence is deliberately amortised so a busy page never pays for one long blocking pass.

### Hard limits

| Constant                     | Value  |
|------------------------------|--------|
| `MAX_DEPTH`                  | `4`    |
| `MAX_KEYS`                   | `30`   |
| `MAX_ARRAY_ITEMS`            | `20`   |
| `MAX_STRING_LENGTH`          | `2000` |
| `MAX_MESSAGE_LENGTH`         | `1000` |
| `MAX_STACK_LENGTH`           | `8000` |
| `MAX_COMPONENT_STACK_LENGTH` | `4000` |
| `MAX_CAUSE_DEPTH`            | `3`    |
| `MAX_TAGS`                   | `20`   |
| `MAX_LOG_ARGS`               | `5`    |

The module also defines `HARD_TEXT_CAP` (20000), `MAX_AGGREGATE_ERRORS` (5),
`MAX_TAG_KEY_LENGTH` (50), `MAX_TAG_VALUE_LENGTH` (200), `MAX_USER_AGENT_LENGTH` (500),
`MAX_LOG_MESSAGE_LENGTH` (1000), `PRE_INIT_ERROR_BUFFER_SIZE` (50), `MAX_ROUTE_LENGTH` (300),
`MAX_URL_LENGTH` (2000), `MAX_ALLOWED_QUERY_VALUE_LENGTH` (100), `SCHEMA_VERSION` (1),
`SINGLETON_KEY`, `JWT_PATTERN`,
`AUTH_SCHEME_PATTERN`, `EMAIL_PATTERN`, `KV_SECRET_PATTERNS`, `STACK_QUERY_PATTERN`,
`LONG_SECRET_PATTERN` (`/^[\w-]{32,}$/`), `LONG_SECRET_TEXT_PATTERN`
(`/(^|[^\w-])([\w-]{32,200})(?=[^\w-]|$)/g`), `CHUNK_ERROR_PATTERN`, `FINGERPRINT_SEPARATOR`,
`RESERVED_LOG_PREFIXES` and `truncationSuffix` — these are internal, not re-exported from
`src/index.ts`.

### `UNHANDLED_SOURCES`

```ts
const UNHANDLED_SOURCES: ReadonlySet<string>;
// Set { 'window', 'unhandledrejection', 'resource', 'chunk', 'csp', 'worker' }
```

The `handled` flag on a record is derived as `!UNHANDLED_SOURCES.has(source)`, so a source in this
set defaults to `handled: false` unless `ctx.handled` overrides it.

---

## Global handlers

`initTelemetry` installs these for you whenever `errors.enabled` is true — the default — so most runtime
failures reach the `errors` store with no call of your own:

| Runtime failure                                                   | Captured with no call?                                                                   | `source`                          |
|-------------------------------------------------------------------|------------------------------------------------------------------------------------------|-----------------------------------|
| An uncaught `throw` — a plain listener, a timer, an inline script | **Yes**                                                                                  | `'window'`                        |
| An unhandled promise rejection                                    | **Yes**                                                                                  | `'unhandledrejection'`            |
| A failed dynamic `import()`                                       | **Yes** (`errors.captureChunkErrors`, default `true`)                                    | `'chunk'`                         |
| A `throw` inside a framework handler, hook or subscriber          | **Yes**, through that framework's adapter                                                | `'angular'` / `'react'` / `'vue'` |
| A `throw` before `initTelemetry` ran                              | **Yes** — buffered (up to 50) and replayed once metadata is known                        | as reported                       |
| A failed `<script>` / `<link>` / `<img>` load                     | **No** — needs `errors.captureResources: true`                                           | `'resource'`                      |
| A CSP violation                                                   | **No** — needs `errors.captureCsp: true`                                                 | `'csp'`                           |
| `console.error(...)`                                              | **No** — needs `logs.captureConsole: true`, and it is a *log* record                     | —                                 |
| Reading a property that does not exist                            | **Never — it is not a failure.** `window.missing` returns `undefined` and throws nothing | —                                 |
| An error you catch and do not report                              | **Never** — swallowing it removes it from every automatic path                           | —                                 |

The last two rows are the ones that surprise people. `window.rajat` where `rajat` is absent evaluates to
`undefined`; only *using* that value throws — and that throw **is** captured automatically. And a
`try { … } catch { }` that discards its error leaves nothing for any handler to see, so if you catch an
error, reporting it is your call:

```ts
try {
  risky();
} catch (error) {
  captureError(error, { source: 'manual', tags: { flow: 'checkout' } });
  throw error; // only if the caller still needs to see it
}
```

### `installGlobalErrorHandlers`

```ts
function installGlobalErrorHandlers(options: GlobalHandlerOptions): () => void;
```

Installs the global browser error handlers. Idempotent, safe in SSR and in workers without `self`,
and never throws.

| `GlobalHandlerOptions` member      | Type                                          | Default  | Description                                                                |
|------------------------------------|-----------------------------------------------|----------|----------------------------------------------------------------------------|
| `onError`                          | `(error: unknown, ctx: ErrorContext) => void` | required | Sink for every captured error. Called synchronously from the DOM listener. |
| `preventDefaultUnhandledRejection` | `boolean \| undefined`                        | `false`  | Call `preventDefault()` on `unhandledrejection`.                           |
| `captureResources`                 | `boolean \| undefined`                        | `false`  | Attach a capture-phase listener for failed resource loads.                 |
| `captureCsp`                       | `boolean \| undefined`                        | `false`  | Listen for `securitypolicyviolation`.                                      |
| `captureChunkErrors`               | `boolean \| undefined`                        | `true`   | Classify dynamic-import failures as `source: 'chunk'`.                     |

**Returns** a cleanup function that removes exactly this registration.

Four contract rules: it **never overwrites** a pre-existing `window.onerror` (the previous handler
is chained and _its_ return value is returned, so the application's suppression decision stands); it
**never detaches someone else's work** (on cleanup, the previous handler is restored only if
`window.onerror` is still logVault's — otherwise logVault stays installed but inert); **one
registration** per target (multiple installs merge into a single listener set with independent
cleanups, so an error is never captured twice by the same mechanism); and it is **never the cause
of an error** (every callback is wrapped, every `addEventListener` is guarded).

```ts
import { installGlobalErrorHandlers, captureError } from '@codewithrajat/rm-logvault';

const cleanup = installGlobalErrorHandlers({
  onError: (error, ctx) => captureError(error, ctx),
  captureCsp: true,
});

cleanup(); // removes exactly this registration
```

### `globalHandlerCount`

```ts
function globalHandlerCount(): number;
```

Number of merged registrations. Used by tests and diagnostics.

### `globalHandlersAttached`

```ts
function globalHandlersAttached(): boolean;
```

Whether the DOM listeners are currently attached.

---

## Diagnostics export

### `exportDiagnosticsReport`

```ts
function exportDiagnosticsReport(
  options?: DiagnosticsExportOptions,
): Promise<DiagnosticsExportResult>;

interface DiagnosticsExportResult {
  readonly ok: boolean;
  readonly format: DiagnosticsFormat;
  readonly bytes: number;
}

type DiagnosticsFormat = 'html' | 'json' | 'jsonl' | 'csv';
```

> **Breaking change.** This function previously returned `Promise<boolean>`. It now returns a
> `DiagnosticsExportResult`, and the old boolean is the `ok` field. `await
> exportDiagnosticsReport()` still compiles inside a condition, because an object is always truthy —
> so a caller that tested the result must be updated to `(await exportDiagnosticsReport()).ok`. This
> is the one API change in the framework-agnostic layer that can silently change behaviour rather
> than failing to build.

Builds and downloads (or copies) a complete diagnostics report.

| Option            | Type                                                        | Default                                                      | Description                                                                                                                                                                                                                                        |
|-------------------|-------------------------------------------------------------|--------------------------------------------------------------|----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------|
| `format`          | `DiagnosticsFormat \| undefined`                            | `'html'`                                                     | `'html'` self-contained viewer, `'json'` one document, `'jsonl'` one JSON object per line, `'csv'` one wide spreadsheet table.                                                                                                                     |
| `copyToClipboard` | `boolean \| undefined`                                      | `false`                                                      | Write to the clipboard instead of downloading. Feature-detected; returns `ok: false` rather than silently downloading when the Clipboard API is unavailable.                                                                                       |
| `pretty`          | `boolean \| undefined`                                      | `false`                                                      | Indent the JSON output. Applies to `'json'` **only** — deliberately ignored by `'jsonl'`, where an indented object would break the one-record-per-line contract.                                                                                   |
| `redactAgain`     | `boolean \| undefined`                                      | `false`                                                      | Re-run the sanitizer over every record before export.                                                                                                                                                                                              |
| `filenamePrefix`  | `string \| undefined`                                       | the shortcut's `filenamePrefix`, then `'diagnostics-report'` | Filename prefix.                                                                                                                                                                                                                                   |
| `onProgress`      | `((processed: number, total: number) => void) \| undefined` | `undefined`                                                  | Called as records are marshalled. Invoked once per `EXPORT_SLICE_SIZE` records and once at the end, against the whole payload (errors plus logs), so the count never goes backwards when the second kind starts. A throwing callback is contained. |
| `onExported`      | `((ok: boolean) => void) \| undefined`                      | `undefined`                                                  | Called with the outcome.                                                                                                                                                                                                                           |

**Returns** a `DiagnosticsExportResult`. `ok` is `true` when a download or clipboard write was
initiated. `bytes` is the UTF-8 size of the produced payload. **Never rejects.**

| Format   | Extension | MIME type                            | Shape                                                                     |
|----------|-----------|--------------------------------------|---------------------------------------------------------------------------|
| `'html'` | `.html`   | `text/html;charset=utf-8`            | The self-contained report, with the JSON payload embedded.                |
| `'json'` | `.json`   | `application/json;charset=utf-8`     | `{ schemaVersion: 1, generatedAt, app, page, errors, logs }`.             |
| `'jsonl'`| `.jsonl`  | `application/x-ndjson;charset=utf-8` | One line per record: `{"kind":"error",…}` then `{"kind":"log",…}`.        |
| `'csv'`  | `.csv`    | `text/csv;charset=utf-8`             | One wide table, one row per record, CRLF line endings per RFC 4180.       |

An unrecognised `format` (including `undefined`) falls back to `'html'` rather than failing.

Behaviour: it returns `{ ok: false, format, bytes: 0 }` outside a browser, with no repository, or
when an export is already in flight; flushes first so a log written a millisecond ago is included;
reads **all** records regardless of `uploadStatus`; marshals in 500-record slices
(`EXPORT_SLICE_SIZE`) with a yield to the event loop between slices; and defers `revokeObjectURL` by
one second, because revoking synchronously after `click()` cancels the download in some Safari
versions.

```ts
import { exportDiagnosticsReport } from '@codewithrajat/rm-logvault';

// Default: self-contained HTML download
await exportDiagnosticsReport();

// Machine-readable, re-redacted, straight to the clipboard
await exportDiagnosticsReport({ format: 'json', redactAgain: true, copyToClipboard: true });

// One JSON object per line, for a log pipeline
const { bytes } = await exportDiagnosticsReport({ format: 'jsonl', pretty: false });
```

The result is what makes a progress UI possible without guessing:

```ts
const result = await exportDiagnosticsReport({
  format: 'csv',
  onProgress: (processed, total) => {
    bar.value = total === 0 ? 1 : processed / total;
  },
});

if (!result.ok) showExportFailed(result.format);
```

### `DIAGNOSTICS_CSV_COLUMNS`

```ts
const DIAGNOSTICS_CSV_COLUMNS: readonly string[];
// ['kind', 'id', 'timestamp', 'severity', 'source', 'category', 'name', 'message',
//  'occurrenceCount', 'fingerprint', 'route', 'method', 'url', 'status']
```

The `'csv'` export's columns, in order. One table holds both kinds, distinguished by the leading
`kind` column (`'error'` or `'log'`), rather than emitting two files — a CSV export exists to be
sorted and pivoted in a spreadsheet, and two tables in one file cannot be. Errors and logs share
these columns and leave the ones that do not apply empty.

| Column            | Errors                          | Logs                       |
|-------------------|---------------------------------|----------------------------|
| `kind`            | `'error'`                       | `'log'`                    |
| `id`              | `record.id`                     | `record.id`                |
| `timestamp`       | ISO 8601                        | ISO 8601                   |
| `severity`        | `record.severity`               | `record.level`             |
| `source`          | `record.source`                 | *(empty)*                  |
| `category`        | `record.category`               | *(empty)*                  |
| `name`            | `record.name`                   | *(empty)*                  |
| `message`         | `record.message`                | `record.message`           |
| `occurrenceCount` | `record.occurrenceCount`        | *(empty)*                  |
| `fingerprint`     | `record.fingerprint`            | *(empty)*                  |
| `route`           | `record.page?.route ?? ''`      | `record.route ?? ''`       |
| `method`          | `record.api?.method`            | *(empty)*                  |
| `url`             | `record.api?.url`               | *(empty)*                  |
| `status`          | `record.api?.status`            | *(empty)*                  |

**Spreadsheet formula injection is neutralised.** A cell whose text begins with `=`, `+`, `-`, `@`,
a tab or a carriage return is prefixed with an apostrophe, because Excel, Sheets and LibreOffice
execute such a cell as a formula on open — and a cell can contain an error message. Quoting is RFC
4180: a value containing a comma, a quote, a newline or a CR is wrapped in double quotes with
embedded quotes doubled.

### `EXPORT_SLICE_SIZE`

```ts
const EXPORT_SLICE_SIZE = 500;
```

Records marshalled per slice before yielding to the event loop. Exported so a caller can align its
own progress arithmetic with the emitter's cadence.

### `diagnosticsFilename`

```ts
function diagnosticsFilename(prefix: string, extension: string): string;
```

Builds the download filename: `` `${prefix}-${ISO stamp}.${extension}` `` with `:` and `.` replaced
by `-`, because both are illegal in Windows filenames and the ISO stamp contains both. Example:
`diagnostics-report-2026-10-03T07-55-01-123Z.html`.

### `isExportInFlight`

```ts
function isExportInFlight(): boolean;
```

Whether an export is currently running. The in-flight guard exists because a second shortcut press
during a marshalling pass is a double-click, not a request for two files.

### `installDiagnosticsExportShortcut`

```ts
function installDiagnosticsExportShortcut(options?: DiagnosticsShortcutOptions | false): () => void;
```

Installs the default diagnostics-export shortcut (Ctrl+Shift+Alt+D). Pass `false` to install
nothing. Returns a cleanup function.

`DiagnosticsShortcutOptions` extends `Partial<ShortcutConfig>` with `filenamePrefix`,
`exportOptions` (forwarded to `exportDiagnosticsReport`) and `onExported`.

Matching runs on the **physical key** (`KeyboardEvent.code`, falling back to `event.key`), requires an
**exact** match on all four modifiers, and is skipped when the event target is an editable element.
`onExported` fires with `true` or `false` for an export that ran, but is **not** called when the export
returns early — a concurrent export, no browser, or no repository.

> A shortcut is a keyboard listener, so it does not exist on a phone or a tablet: those devices never
> emit `keydown`. Drive `exportDiagnosticsReport()` from a button for mobile support.

```ts
import { installDiagnosticsExportShortcut } from '@codewithrajat/rm-logvault';

const cleanup = installDiagnosticsExportShortcut({
  key: 'd',
  allow: () => window.__IS_INTERNAL__ === true,
  onExported: (ok) => console.log(ok ? 'report downloaded' : 'report failed'),
});

cleanup();
```

### `installShortcut`

```ts
function installShortcut(
  config: Partial<ShortcutConfig> | undefined,
  onTrigger: () => void,
): () => void;
```

Installs a keyboard shortcut. Omitted config members take their defaults. Returns a cleanup function
that is safe to call twice.

The listener is attached in the **capture** phase on `config.target ?? document ?? getEventTarget()`,
so `stopPropagation()` in application code cannot prevent it. Events whose target is an editable
element are ignored, and `preventDefault()` is called only on a real match. In SSR or a worker it
installs nothing and hands back a no-op cleanup.

| `ShortcutConfig` member | Type                           | Default     |
|-------------------------|--------------------------------|-------------|
| `key`                   | `string`                       | `'d'`       |
| `ctrl`                  | `boolean`                      | `true`      |
| `shift`                 | `boolean`                      | `true`      |
| `alt`                   | `boolean`                      | `true`      |
| `meta`                  | `boolean`                      | `false`     |
| `target`                | `EventTarget \| undefined`     | `document`  |
| `allow`                 | `(() => boolean) \| undefined` | `undefined` |

```ts
import { installShortcut } from '@codewithrajat/rm-logvault';

const cleanup = installShortcut({ key: 'k', ctrl: true, shift: false, alt: false }, () =>
  console.log('fired'),
);
cleanup();
```

### `matchesShortcut`

```ts
function matchesShortcut(event: KeyboardEvent, config: ShortcutConfig): boolean;
```

Whether a keyboard event matches the configuration. **Never throws**; a malformed event returns
`false`.

Modifier matching is **exact**: pressing Ctrl+Shift+Alt+D with an extra Meta held does not match,
which prevents accidental triggers on OS-level shortcuts. The key is matched on
`KeyboardEvent.code` first (`expectedCode('d')` → `'KeyD'`) and falls back to `event.key`, because
`Alt`+letter mangles `event.key` on AZERTY, Dvorak, AltGr and macOS Option layouts.

### `expectedCode`

```ts
function expectedCode(key: string): string | undefined;
```

| Input  | Output      |
|--------|-------------|
| `'d'`  | `'KeyD'`    |
| `'7'`  | `'Digit7'`  |
| `'F5'` | `undefined` |

```ts
import { expectedCode } from '@codewithrajat/rm-logvault';

expectedCode('d'); // 'KeyD'
expectedCode('7'); // 'Digit7'
```

### `isEditableTarget`

```ts
function isEditableTarget(target: EventTarget | null | undefined): boolean;
```

`true` for an `<input>`, `<textarea>`, `<select>` or a `contenteditable` host. Uses `closest()`
first, then a tag-name check for detached or exotic nodes. Without this the shortcut would fire —
and `preventDefault()` the key — while someone is typing "d" into a form, which is a data-loss bug.

### Report rendering

#### `renderDiagnosticsReport`

```ts
function renderDiagnosticsReport(
  meta: ReportMeta,
  errors: readonly ErrorRecord[],
  logs: readonly LogRecord[],
  encodedPayload?: string,
): string;
```

Renders the complete, self-contained HTML report as a string. Supplying `encodedPayload` lets the
caller assemble the JSON in slices so a very large report does not block the main thread; when
omitted the payload is serialised here.

The output embeds `<meta http-equiv="Content-Security-Policy" content="default-src 'none';
style-src 'unsafe-inline'; script-src 'unsafe-inline'; img-src data:">`, `referrer: no-referrer` and
`robots: noindex, nofollow`.

#### `buildReportPayload`

```ts
function buildReportPayload(
  meta: ReportMeta,
  errors: readonly ErrorRecord[],
  logs: readonly LogRecord[],
): ReportPayload;
```

Builds the JSON document embedded in the report:
`{ schemaVersion, generatedAt, app: { appName, appVersion, buildId, environment }, page: { url, userAgent, online }, errors, logs }`.

#### `escapeHtml`

```ts
function escapeHtml(value: string): string;
```

Escapes `&`, `<`, `>`, `"` and `'` for interpolation into HTML text or an attribute.

```ts
escapeHtml('<img src=x onerror=alert(1)>');
// '&lt;img src=x onerror=alert(1)&gt;'
```

#### `escapeJsonText`

```ts
function escapeJsonText(json: string): string;
```

Escapes `<`, `>`, `&`, `U+2028` and `U+2029` as `\u` sequences in already-serialised JSON, making it
safe inside a `<script type="application/json">` element. Split out from `encodeJsonForHtml` so a
caller assembling the payload in slices can serialise first and escape once.

Because `<` can no longer appear literally, `</script>` cannot occur in the output, so the script
element cannot be terminated early — and `\u003c` is a valid JSON escape, so `JSON.parse` returns
the original string unchanged.

#### `encodeJsonForHtml`

```ts
function encodeJsonForHtml(value: unknown): string;
```

Serialises a value and escapes it for embedding. A value that cannot be serialised becomes `null`.

```ts
encodeJsonForHtml({ m: '</script><img onerror=alert(1)>' });
// '{"m":"\\u003c/script\\u003e\\u003cimg onerror=alert(1)\\u003e"}'
```

#### `REPORT_PRIVACY_BANNER`

```ts
const REPORT_PRIVACY_BANNER: string;
// 'This report may contain personal data (page URLs, browser details, application messages).
//  Review before sharing.'
```

Rendered at the top of every HTML report.

#### `ReportMeta`

```ts
interface ReportMeta {
  readonly generatedAt: string; // ISO-8601
  readonly appName: string;
  readonly appVersion: string;
  readonly buildId: string;
  readonly environment: string;
  readonly url: string; // sanitized
  readonly userAgent: string; // sanitized, max 500 characters
  readonly online: boolean;
  readonly errorCount: number;
  readonly logCount: number;
}
```

### `sanitizeErrorRecord`

```ts
function sanitizeErrorRecord(record: ErrorRecord): ErrorRecord;
```

Re-runs the sanitizer over every free-text field of a stored error record: `name`, `message`,
`stack`, `componentStack`, `causes[]`, `extra`, `tags`, `page.url`, `page.route`, `api.url`,
`api.statusText`, `api.requestId`, `event.resourceUrl`, `event.blockedURI` and the environment
strings. **Never throws**; a failure returns the record unchanged.

Records are already sanitized before storage. This pass exists because the redaction rules are
_configuration_, and configuration can change between the moment a record was written and the moment
a report is exported. Re-running is idempotent: redacting an already-redacted value yields the same
placeholder.

```ts
import { sanitizeErrorRecord } from '@codewithrajat/rm-logvault';

const safe = sanitizeErrorRecord(record);
```

### `sanitizeLogRecord`

```ts
function sanitizeLogRecord(record: LogRecord): LogRecord;
```

The log-record equivalent: `message`, each entry of `data`, `route` and the environment strings.
Never throws.

---

## Storage

### How retention is enforced

`initTelemetry` gives each store a **cleanup policy** — `{ retentionDays, maxRecords }`, taken from
`errors.*` and `logs.*` — and the sweep always runs age first:

1. Delete every row older than `retentionDays`. Skipped entirely when it is `0`.
2. If more than `maxRecords` rows remain, delete the oldest surplus.

It runs once when the store initialises, and then every `ERROR_CLEANUP_EVERY_WRITES` (25) successful
error writes and `LOG_CLEANUP_EVERY_WRITES` (200) successful log writes. One sweep is a single
transaction that deletes its surplus one row per `delete` request — the cadence is what amortises the
cost, not a row chunk size. Retention is therefore enforced **lazily, on write**: an app that writes
rarely can sit over its window between page loads, and the init-time sweep is what bounds that drift.

If you need a different cadence, the supported path is to build the repositories yourself and pass
them as `TelemetryOptions.repository` — both factories are public and both accept `cleanupEveryWrites`:

```ts
import {
  createErrorRepository,
  createLogRepository,
  databaseNames,
  initTelemetry,
} from '@codewithrajat/rm-logvault';

const names = databaseNames('rm-logvault');

initTelemetry({
  appName: 'checkout',
  repository: {
    errors: createErrorRepository({
      dbName: names.errors,
      cleanupPolicy: { retentionDays: 7, maxRecords: 500 },
      cleanupEveryWrites: 5,
    }),
    logs: createLogRepository({
      dbName: names.logs,
      cleanupPolicy: { retentionDays: 3, maxRecords: 2000 },
      cleanupEveryWrites: 50,
    }),
  },
});
```

Supplying `repository` replaces the IndexedDB pair wholesale, so the names and policies in it are
yours to keep in step with `dbPrefix` and `errors.*` / `logs.*`. That is precisely why the cadence is
not also an option: it is a power-user path, not a setting — the store *size* is what a consumer
should be deciding, and `retentionDays` / `maxRecords` already decide it.

### `createErrorRepository`

```ts
function createErrorRepository(options: ErrorRepositoryOptions): ErrorRepository;
```

Creates an IndexedDB-backed error repository. Construction never opens the database.

| Option               | Type                                     | Default                             | Description                                                           |
|----------------------|------------------------------------------|-------------------------------------|-----------------------------------------------------------------------|
| `dbName`             | `string`                                 | required                            | Physical database name, e.g. `rm-logvault-errors`.                    |
| `indexedDB`          | `IDBFactory \| undefined`                | `globalThis.indexedDB`              | Explicit factory, for tests with `fake-indexeddb`.                    |
| `onFailure`          | `((reason, error) => void) \| undefined` | `undefined`                         | Called once per distinct failure class.                               |
| `cleanupPolicy`      | `CleanupPolicy \| undefined`             | `undefined`                         | Retention policy. When omitted, automatic cleanup is **disabled**.    |
| `cleanupEveryWrites` | `number \| undefined`                    | `ERROR_CLEANUP_EVERY_WRITES` (`25`) | Successful writes between automatic retention sweeps.                 |
| `openTimeoutMs`      | `number \| undefined`                    | `DEFAULT_OPEN_TIMEOUT_MS` (`5000`)  | Open timeout passed through to the connection.                        |

Two behaviours distinguish it from a key/value store:

- **Pending-only aggregation.** `save` looks up the `[fingerprint, 'pending']` index entry and merges
  into it, so a bug that fires a thousand times occupies one row. It never mutates a row that is
  already `uploading`, because that row is owned by an in-flight request.
- **Atomic claiming.** `claimPending` moves rows from `pending` to `uploading` inside a single
  `readwrite` transaction, which is what makes multiple tabs safe.

On a `quota` failure it halves the cap, runs cleanup and retries the same write exactly once.

```ts
import { createErrorRepository } from '@codewithrajat/rm-logvault';

const repository = createErrorRepository({ dbName: 'rm-logvault-errors' });
await repository.initialize();
await repository.save(record);
const pending = await repository.claimPending(50, Date.now());
```

### `createLogRepository`

```ts
function createLogRepository(options: LogRepositoryOptions): LogRepository;
```

Same option shape; writes go through `saveBatch` instead of `save`, and there is no aggregation —
every log call is its own row.

### `createDbConnection`

```ts
function createDbConnection(options: IdbCoreOptions): DbConnection;
```

A lazily-opened, self-healing connection to one IndexedDB object store. Constructing it never opens
the database.

| Option          | Type                                     | Default                | Description                                                                              |
|-----------------|------------------------------------------|------------------------|------------------------------------------------------------------------------------------|
| `dbName`        | `string`                                 | required               | Physical database name.                                                                  |
| `version`       | `number`                                 | required               | Schema version. Bump only additively.                                                    |
| `storeName`     | `string`                                 | required               | The single object store this connection exposes.                                         |
| `upgrade`       | `(db, oldVersion, tx) => void`           | required               | Schema hook. Must be idempotent: it can run again after a mid-session database deletion. |
| `openTimeoutMs` | `number \| undefined`                    | `5000`                 | Time to wait for `open()` before declaring IndexedDB unavailable.                        |
| `indexedDB`     | `IDBFactory \| undefined`                | `globalThis.indexedDB` | Explicit factory.                                                                        |
| `onFailure`     | `((reason, error) => void) \| undefined` | `undefined`            | Called once per distinct failure class.                                                  |

`DbConnection` exposes `dbName`, `storeName`, `version`, `isOpen()`,
`ensureOpen()`, `transaction(mode, work)`, `deleteDatabase()` and `close()`.

**Invariant:** transactions are only safe while awaiting IDB requests. Awaiting a macrotask
(`setTimeout`, `fetch`) inside `transaction` lets the transaction auto-commit, after which further
requests throw `TransactionInactiveError`. For `readwrite`, the returned promise resolves only on
`oncomplete`, so a resolved write is durable.

```ts
import { createDbConnection, promisifyRequest } from '@codewithrajat/rm-logvault';

const connection = createDbConnection({
  dbName: 'rm-logvault-errors',
  version: 1,
  storeName: 'errors',
  upgrade(db, _old, tx) {
    if (!db.objectStoreNames.contains('errors')) {
      const store = db.createObjectStore('errors', { keyPath: 'id' });
      store.createIndex('by_fingerprint_status', ['fingerprint', 'uploadStatus']);
    }
  },
});

const result = await connection.transaction('readonly', (store) => promisifyRequest(store.count()));
if (result.ok) console.log(result.value);
```

### `classifyStorageError`

```ts
function classifyStorageError(error: unknown): StorageFailureReason;
```

Maps any thrown value onto `'quota'` (`QuotaExceededError`, `NS_ERROR_DOM_QUOTA_REACHED`, legacy
code `22`), `'serialization'` (`DataCloneError`), or `'transaction'` (everything else).

### `isErrorRecord` / `isLogRecord`

```ts
function isErrorRecord(value: unknown): value is ErrorRecord;
function isLogRecord(value: unknown): value is LogRecord;
```

Shallow structural validation of a persisted row: the fields the library and its consumers actually
read, not every optional member. IndexedDB is not a trusted store — a row can be malformed because
an older build wrote it, because a user edited it in DevTools, or because another library used the
same database name. Every read validates, and malformed rows are **deleted** rather than returned,
so a poison row cannot break the diagnostics export forever.

```ts
import { isErrorRecord } from '@codewithrajat/rm-logvault';

if (isErrorRecord(raw)) use(raw);
```

### `promisifyRequest`

```ts
function promisifyRequest<T>(request: IDBRequest<T>): Promise<T>;
```

Wraps an `IDBRequest` in a promise, rejecting with `request.error`.

### Repository types

```ts
type StorageFailureReason = 'unavailable' | 'quota' | 'serialization' | 'transaction';
type StorageResult<T> = Result<T, StorageFailureReason>;
type StorageState = 'initializing' | 'ready' | 'unavailable' | 'disabled';
/** Where records go. `'local'` makes network egress structurally impossible. See [D-015](DECISIONS.md). */
type StorageMode = 'local' | 'remote';

interface CleanupPolicy {
  readonly retentionDays: number;
  readonly maxRecords: number;
}

interface TelemetryRepository {
  readonly errors: ErrorRepository;
  readonly logs: LogRepository;
  initialize(): Promise<StorageResult<void>>;
  close(): void;
}
```

Both `ErrorRepository` and `LogRepository` expose `initialize`, `get`, `getAll`, `getPending`,
`claimPending`, `requeueStale`, `getFailed`, `delete`, `updateUploadStatus`, `count`, `pendingCount`,
`cleanup`, `clear` and `close`; the error repository adds `save(record)` and the log repository adds
`saveBatch(records)`. `pendingCount()` counts `pending` **plus** `uploading`.

Implementations must be safe to call before `initialize()` and must never throw. `claimPending` is
the only method that mutates `uploadStatus`, and it must do so atomically.

---

## Sync

### `createSyncManager`

```ts
function createSyncManager(options: SyncManagerOptions): SyncManager;
```

Creates the uploader.

| Option           | Type                       | Description                                                             |
|------------------|----------------------------|-------------------------------------------------------------------------|
| `errors`         | `ErrorRepository \| null`  | Error repository, or `null` when error capture is disabled.             |
| `logs`           | `LogRepository \| null`    | Log repository, or `null` when log capture is disabled.                 |
| `options`        | `ResolvedTelemetryOptions` | Resolved configuration.                                                 |
| `isStorageReady` | `() => boolean`            | Storage readiness gate. Uploads never start before this returns `true`. |

`SyncManager` exposes `start()`, `stop()`, `flush(keepalive?)`, `notifyNewRecords()`, `status()`,
`lastSync()`, `retryFailed()`, `isEnabled()` and `dispose()`.

`isEnabled()` is `rest.enabled && (endpoints.errorsUrl !== undefined || endpoints.logsUrl !== undefined)`
— with the endpoints already validated by `resolveEndpoint`. Concurrent `flush()` calls share one
in-flight run. `notifyNewRecords()` never pulls a run forward while a run is in flight or while the
failure counter is non-zero, because hammering a failing endpoint with one request per error is
exactly what the backoff exists to prevent.

```ts
import {
  createSyncManager,
  createErrorRepository,
  createLogRepository,
  resolveOptions,
} from '@codewithrajat/rm-logvault';

const errors = createErrorRepository({ dbName: 'rm-logvault-errors' });
const logs = createLogRepository({ dbName: 'rm-logvault-logs' });
const manager = createSyncManager({
  errors,
  logs,
  options: resolveOptions({ rest: { errorsUrl: '/telemetry/errors' } }),
  isStorageReady: () => true,
});
manager.start();
```

### `createFetchTransport`

```ts
function createFetchTransport(options?: FetchTransportOptions): RemoteTransport;
```

The default JSON-over-`fetch` transport, and the library's **only** network egress.

| Option      | Type                        | Default            | Description                                                                                                              |
|-------------|-----------------------------|--------------------|--------------------------------------------------------------------------------------------------------------------------|
| `timeoutMs` | `number \| undefined`       | `10000`            | Per-request abort budget. A non-positive or non-finite value falls back to the default.                                  |
| `fetchImpl` | `typeof fetch \| undefined` | `globalThis.fetch` | `fetch` implementation, resolved **per request** so tests can stub it and instrumentation installed later still applies. |

Three rules: it uses the platform `fetch`, never the application's HTTP client (an axios-based
upload path would re-enter the axios interceptor that captures errors); it **never reads the
response body**, not on success and not on error; and it never throws for an HTTP status — a 500 is
a normal `TransportResponse`, and only a genuine transport failure rejects.

```ts
import { createFetchTransport, initTelemetry } from '@codewithrajat/rm-logvault';

initTelemetry({
  appName: 'checkout',
  rest: {
    errorsUrl: '/telemetry/errors',
    transport: createFetchTransport({ timeoutMs: 5000 }),
  },
});
```

### `RemoteTransport`

```ts
interface RemoteTransport {
  readonly name?: Maybe<string>;
  send(request: TransportRequest): Promise<TransportResponse>;
}

interface TransportRequest {
  readonly url: string;
  readonly headers: Readonly<Record<string, string>>;
  readonly credentials: RequestCredentials;
  readonly body: string; // fully serialised JSON
  readonly timeoutMs: number;
  readonly keepalive: boolean;
  readonly kind: RecordKind;
}

interface TransportResponse {
  readonly status: number; // 0 when the request never reached the server
  readonly retryAfterMs?: Maybe<number>;
}
```

The transport receives a fully-serialised body and **never sees the raw records**, which keeps a
custom transport from accidentally persisting unsanitized data. Replacing it is how the library
grows towards OTLP, Sentry envelopes or `sendBeacon` without those ever becoming hard dependencies.
`send` should `throw` to signal a retryable network failure.

```ts
import { initTelemetry, type RemoteTransport } from '@codewithrajat/rm-logvault';

const transport: RemoteTransport = {
  name: 'otlp',
  async send(request) {
    const response = await fetch(request.url, {
      method: 'POST',
      headers: request.headers,
      body: request.body,
      credentials: request.credentials,
    });
    return { status: response.status };
  },
};

initTelemetry({ appName: 'x', rest: { transport, errorsUrl: '/v1/logs' } });
```

### `resolveEndpoint`

```ts
function resolveEndpoint(raw: string | undefined, requireHttps: boolean): string | undefined;
```

Validates and normalises a configured endpoint. Returns the absolute URL, or `undefined` when the
value is unusable. Rejected values cause the library to fall back to IndexedDB-only operation rather
than throwing, because a mistyped endpoint must not break the host app.

```ts
import { resolveEndpoint } from '@codewithrajat/rm-logvault';

resolveEndpoint('/telemetry/errors', false); // 'https://app.test/telemetry/errors'
resolveEndpoint('javascript:alert(1)', false); // undefined
resolveEndpoint('http://api.test/x', true); // undefined (requireHttps)
resolveEndpoint('http://localhost:3000/x', true); // 'http://localhost:3000/x'
```

### `resolveEndpoints`

```ts
function resolveEndpoints(options: ResolvedTelemetryOptions): {
  readonly errorsUrl: string | undefined;
  readonly logsUrl: string | undefined;
};
```

Resolves both endpoints once, at initialization.

### `isSyncConfigured`

```ts
function isSyncConfigured(options: ResolvedTelemetryOptions): boolean;
```

Whether uploads can run at all: sync enabled, and at least one endpoint survived validation.

```ts
import { resolveOptions, isSyncConfigured } from '@codewithrajat/rm-logvault';

isSyncConfigured(resolveOptions({ rest: { errorsUrl: '/telemetry/errors' } })); // true
isSyncConfigured(resolveOptions({ rest: { errorsUrl: 'javascript:void 0' } })); // false
```

### `classifyResponse`

```ts
type ResponseOutcome = 'ok' | 'terminal' | 'retryable';

function classifyResponse(status: number): ResponseOutcome;
```

`'ok'` for `2xx`; `'terminal'` for `TERMINAL_STATUSES`; `'retryable'` otherwise.

```ts
import { classifyResponse } from '@codewithrajat/rm-logvault';

classifyResponse(202); // 'ok'
classifyResponse(404); // 'terminal'
classifyResponse(503); // 'retryable'
```

### `TERMINAL_STATUSES`

```ts
const TERMINAL_STATUSES: ReadonlySet<number>;
// Set { 400, 401, 403, 404, 405, 410, 413, 415, 422 }
```

HTTP statuses that will never succeed on retry, so records are marked `failed`.

### `buildRestBody`

```ts
function buildRestBody(
  kind: RecordKind,
  records: readonly unknown[],
  options: ResolvedTelemetryOptions,
  sentAt: number,
): RestBatchBody;
```

Builds the JSON body for one batch. See
[REST-CONTRACT.md](REST-CONTRACT.md#2-json-schema-draft-2020-12) for the envelope.

```ts
import { buildRestBody, resolveOptions } from '@codewithrajat/rm-logvault';

const body = buildRestBody('errors', records, resolveOptions({ appName: 'x' }), Date.now());
// { schemaVersion: 1, kind: 'errors', sentAt: 1, app: { appName: 'x', … }, records: [...] }
```

### `backoffDelay`

```ts
function backoffDelay(failureCount: number): number;
```

Exponential backoff for a failure count: `min(15000 * 2^(failureCount-1), 900000)`. Returns `0` for
a count of `0` or less. The exponent is capped at 20 to avoid `Infinity` arithmetic.

### `parseRetryAfter`

```ts
function parseRetryAfter(value: string | null | undefined): number | undefined;
```

Parses a `Retry-After` header, in delta-seconds or HTTP-date form. Returns milliseconds clamped to
`[0, BACKOFF_MAX_MS]`, or `undefined` for an unparseable value.

```ts
import { parseRetryAfter } from '@codewithrajat/rm-logvault';

parseRetryAfter('120'); // 120000
parseRetryAfter('Wed, 21 Oct 2026 07:28:00 GMT'); // ms until that instant
parseRetryAfter('garbage'); // undefined
```

### `SyncStatus`, `RestBatchBody`, `SyncManagerOptions`, `FlushResult`

```ts
type SyncStatus = 'idle' | 'running' | 'offline' | 'ok' | 'retry' | 'error';

interface RestBatchBody {
  readonly schemaVersion: 1;
  readonly kind: RecordKind;
  readonly sentAt: number;
  readonly app: {
    readonly appName: string;
    readonly appVersion: string;
    readonly buildId: string;
    readonly environment: string;
  };
  readonly records: readonly unknown[];
}
```

`FlushResult` is `{ errors: FlushSummary; logs: FlushSummary }` — see `syncTelemetry`.

---

## Payload budgeting

### `byteLength`

```ts
function byteLength(value: unknown): number;
```

UTF-8 byte length of a value's JSON representation, or `Infinity` when it cannot be serialised.
Uses `TextEncoder` when available and a percent-encoding fallback otherwise.

```ts
import { byteLength } from '@codewithrajat/rm-logvault';

byteLength({ a: 'é' }); // 12 — 'é' is two bytes in UTF-8
```

### `reduceErrorPayload`

```ts
function reduceErrorPayload(record: ErrorRecord, maxBytes: number): ErrorRecord | null;
```

Reduces an error record until it fits its byte budget, through a fixed ladder of tiers. Returns
`null` when even the minimal tier does not fit — storing a truncated-to-useless record is worse
than storing nothing.

| Tier | What it does                                                                               |
|------|--------------------------------------------------------------------------------------------|
| 0    | Return unchanged if it already fits.                                                       |
| 1    | Drop `extra`, add the tag `truncated: 'true'`.                                             |
| 2    | Trim `causes` to 300 characters per link, `stack` to 2000, `componentStack` to 1000.       |
| 3    | Minimal: `stack` to 500, `message` to 300, `causes` and `componentStack` removed entirely. |
| 4    | Give up and return `null`.                                                                 |

A failure while measuring also returns `null`, because the budget cannot be guaranteed.

```ts
import { reduceErrorPayload } from '@codewithrajat/rm-logvault';

const fitted = reduceErrorPayload(record, 16_384);
if (fitted === null) reportInternalFailure('payload-limit', new Error('dropped'));
```

### `reduceLogPayload`

```ts
function reduceLogPayload(record: LogRecord, maxBytes: number): LogRecord | null;
```

The log equivalent: drop `data`, then shorten `message` to 300 characters, then return `null`.

```ts
import { reduceLogPayload } from '@codewithrajat/rm-logvault';

reduceLogPayload(record, 4_096) ?? reportDropped();
```

---

## Observability internals

These are exported so advanced wiring, custom backends and tests can reuse the same primitives.
Applications rarely need them.

### `createRateLimiter`

```ts
function createRateLimiter(
  maxPerWindow: number,
  onWindowRoll?: (dropped: number) => void,
): RateLimiter;
```

A fixed-window (60-second) counter.

| Parameter      | Type                                       | Description                                                                                            |
|----------------|--------------------------------------------|--------------------------------------------------------------------------------------------------------|
| `maxPerWindow` | `number`                                   | Maximum admitted events per window. A non-positive or non-finite value **disables limiting entirely**. |
| `onWindowRoll` | `((dropped: number) => void) \| undefined` | Called with the dropped count when a window rolls over, and only when at least one event was dropped.  |

`RateLimiter` exposes `allow()`, `dropped()`, `admitted()` and `reset()`. `allow()` fails **open**:
if the check itself throws, it returns `true`, because losing telemetry is worse than a burst.

```ts
import { createRateLimiter } from '@codewithrajat/rm-logvault';

const limiter = createRateLimiter(120, (dropped) => {
  console.warn(`rate-limit (${dropped} dropped)`);
});

if (limiter.allow()) capture();
```

### `createSerialQueue`

```ts
function createSerialQueue(): SerialQueue;
```

A strictly-ordered asynchronous task queue.

| Member  | Signature                                                     | Description                                                                     |
|---------|---------------------------------------------------------------|---------------------------------------------------------------------------------|
| `push`  | `<T>(task: () => Promise<T> \| T) => Promise<T \| undefined>` | Append a task. Resolves with the result, or `undefined` if it threw.            |
| `drain` | `() => Promise<void>`                                         | Resolve once the queue has drained, **including tasks appended while waiting**. |
| `size`  | `() => number`                                                | Tasks not yet started.                                                          |
| `clear` | `() => void`                                                  | Drop queued (not yet started) tasks. In-flight work is unaffected.              |

A failed task never breaks the chain, and ordering is preserved so error aggregation sees its own
row.

```ts
import { createSerialQueue } from '@codewithrajat/rm-logvault';

const queue = createSerialQueue();
queue.push(() => repository.save(record));
await queue.drain();
```

### `getState`

```ts
function getState(): TelemetryState;
```

The process-wide state object, installed on `globalThis` under `Symbol.for('logvault@1')` so a
second bundled copy of the library resolves the _same_ instance and merges into one set of
listeners instead of duplicating capture.

`TelemetryState` carries `__logvaultState`, `initialized`, `options`, `repository`, `storageState`,
`pendingErrors`, `pendingLogs`, `pageLoadId`, `teardown`, `flush`, `retryFailed` and `cleanup`.

```ts
import { getState } from '@codewithrajat/rm-logvault';

getState().initialized; // false before initTelemetry()
```

### `newId`

```ts
function newId(): string;
```

A collision-resistant identifier, never throwing, trying three strategies in descending order:

1. `crypto.randomUUID()` — RFC 4122 v4, secure contexts only.
2. `crypto.getRandomValues()` rendered as 32 hex characters.
3. `` `${time36}-${counter36}-${random36}` `` — always available, unique per realm.

```ts
const id = newId(); // 'f47ac10b-58cc-4372-a567-0e02b2c3d479'
```

### `newPageLoadId`

```ts
function newPageLoadId(): string;
```

The identifier shared by every record from one page load. Errors and logs live in separate
databases, so this is the only way to correlate them after the fact.

### `reportInternalFailure`

```ts
function reportInternalFailure(stage: string, error: unknown): void;
```

Reports a failure inside the library itself. Never throws and never rethrows `error`.

Each distinct `stage` is reported **exactly once per initialization**, through the logger under the
`[Telemetry]` reserved prefix (console-only, never persisted) and through the `onInternalError`
option. Repeats are suppressed because a failure inside the error path would otherwise produce one
warning per captured error. `initTelemetry` clears the suppression set so a fresh initialization
reports its own failures.

```ts
import { reportInternalFailure } from '@codewithrajat/rm-logvault';

try {
  await risky();
} catch (error) {
  reportInternalFailure('persist', error);
}
```

### `reportInternalNote`

```ts
function reportInternalNote(stage: string, detail: string): void;
```

A stage-level note rather than an exception, e.g. a rate-limit summary. Routed through the same
once-per-stage suppression, so a storm collapses to one line.

---

## Subpath adapters

Every adapter funnels into `captureError`, so its records are **error** records: they are written to
the `errors` store in the `${dbPrefix}-errors` database, never to the logs store. Each adapter stamps
its own `source` — `'react'`, `'vue'`, `'angular'`, `'query'` — which is what makes a report say which
framework path a failure arrived through. `logger.*` calls are unrelated to them and land in
`${dbPrefix}-logs`; see [Errors are missing while logs are stored](TROUBLESHOOTING.md#errors-are-missing-while-logs-are-stored)
when the two are confused.

> **Source note, 1.0.0 only.** Every adapter entry below was broken in 1.0.0. Each subpath was built as
> its own bundle with the core inlined, so it carried its own copy of the error pipeline whose tracker
> could never be installed: `setErrorTracker` is reachable only from `initTelemetry`, which lives in the
> root entry. Rollup proved the dispatch unreachable and compiled the branch body away, so every
> capture made *through an adapter* — `provideTelemetryErrorHandler`, `reactRootErrorHandlers`,
> `attachVueTelemetry`, the axios interceptor and `instrumentFetch` — was buffered into an array nothing
> drained, and reported nothing, because no operation failed. Importing `captureError` itself from the
> root entry was unaffected. Fixed in 1.0.1; see [D-026](DECISIONS.md#d-026--the-error-tracker-lives-on-the-shared-state-because-adapter-bundles-inline-the-core).

### `@codewithrajat/rm-logvault/react`

Peer: `react >= 17`. All three entry points funnel into `captureError` with `source: 'react'`, so a
failure that reaches the boundary _and_ the root still produces one record — the pipeline's
identity-based deduplication handles that.

#### `TelemetryErrorBoundary`

```tsx
class TelemetryErrorBoundary extends Component<
  TelemetryErrorBoundaryProps,
  TelemetryErrorBoundaryState
>
```

| Prop       | Type                                                                         | Description                                                                                                                                                                   |
|------------|------------------------------------------------------------------------------|-------------------------------------------------------------------------------------------------------------------------------------------------------------------------------|
| `children` | `ReactNode \| undefined`                                                     | The subtree to protect.                                                                                                                                                       |
| `fallback` | `ReactNode \| ((error: Error, reset: () => void) => ReactNode) \| undefined` | What to render after a failure. The function form receives a `reset` callback that clears the boundary state, which is what makes "try again" possible without a full reload. |
| `onError`  | `((error: Error, info: ErrorInfo) => void) \| undefined`                     | Called after the error has been captured.                                                                                                                                     |
| `context`  | `ErrorContext \| undefined`                                                  | Extra context merged into the captured record.                                                                                                                                |

Uses `getDerivedStateFromError` for rendering and `componentDidCatch` for reporting, with
`componentStack: info.componentStack ?? undefined`.

```tsx
import { TelemetryErrorBoundary } from '@codewithrajat/rm-logvault/react';

root.render(
  <TelemetryErrorBoundary
    fallback={(error, reset) => (
      <div>
        <p>Something went wrong: {error.message}</p>
        <button onClick={reset}>Try again</button>
      </div>
    )}
  >
    <App />
  </TelemetryErrorBoundary>,
);
```

#### `reactRootErrorHandlers`

```tsx
function reactRootErrorHandlers(context?: ErrorContext): ReactRootErrorHandlers;
```

Builds React 19 root error handlers for `createRoot`'s options object.

| Handler              | Severity            | `handled`         | Extra                                       |
|----------------------|---------------------|-------------------|---------------------------------------------|
| `onUncaughtError`    | `'fatal'`           | default (`false`) | component stack                             |
| `onCaughtError`      | default (`'error'`) | `true`            | component stack                             |
| `onRecoverableError` | `'warning'`         | `true`            | `tags.recoverable: 'true'`, component stack |

```tsx
import { createRoot } from 'react-dom/client';
import { reactRootErrorHandlers } from '@codewithrajat/rm-logvault/react';

createRoot(document.getElementById('root')!, reactRootErrorHandlers()).render(<App />);
```

#### `useErrorCapture`

```tsx
function useErrorCapture(context?: ErrorContext): (error: unknown, extra?: ErrorContext) => void;
```

A stable capture function for use inside components and effects. `captureError` is already a stable
module-level function, so the returned closure is stable per `context` identity and needs no
memoisation hook.

```tsx
import { useErrorCapture } from '@codewithrajat/rm-logvault/react';

function Checkout() {
  const capture = useErrorCapture({ tags: { flow: 'checkout' } });
  return (
    <button
      onClick={() => {
        try {
          pay();
        } catch (error) {
          capture(error);
        }
      }}
    >
      Pay
    </button>
  );
}
```

### `@codewithrajat/rm-logvault/vue`

Peer: `vue >= 3`.

#### `attachVueTelemetry`

```ts
function attachVueTelemetry(app: App, options?: VueAdapterOptions): void;
```

| Option            | Type                        | Default     | Description                                      |
|-------------------|-----------------------------|-------------|--------------------------------------------------|
| `context`         | `ErrorContext \| undefined` | `undefined` | Extra context merged into every captured record. |
| `captureWarnings` | `boolean \| undefined`      | `true`      | Also wrap `app.config.warnHandler`.              |

Vue allows exactly one `app.config.errorHandler`, so installing a second one silently discards the
first — a classic way to break someone else's error reporting. This adapter therefore **chains**: it
captures the handler that was already installed and calls it afterwards, so both run. Error records
use `source: 'vue'` and put Vue's lifecycle hook name in `extra.vueInfo`. Warning records use
`severity: 'warning'`, `handled: true`, `tags: { framework: 'vue', kind: 'warning' }` and
`extra.vueTrace`.

```ts
import { createApp } from 'vue';
import { attachVueTelemetry } from '@codewithrajat/rm-logvault/vue';

const app = createApp(App);
attachVueTelemetry(app, { context: { tags: { shell: 'checkout' } } });
app.mount('#app');
```

#### `createTelemetryVuePlugin`

```ts
function createTelemetryVuePlugin(options?: VueAdapterOptions): TelemetryVuePlugin;
```

A plugin suitable for `app.use()`.

```ts
import { createApp } from 'vue';
import { createTelemetryVuePlugin } from '@codewithrajat/rm-logvault/vue';

createApp(App).use(createTelemetryVuePlugin()).mount('#app');
```

### `@codewithrajat/rm-logvault/angular`

Peer: `@angular/core >= 15`.

#### `TelemetryErrorHandler`

```ts
class TelemetryErrorHandler implements ErrorHandler {
  constructor(context?: ErrorContext);
  handleError(error: unknown): void;
}
```

Reports to the vault, then delegates to `console.error`, exactly as Angular's default
implementation does — the framework's own diagnostics stay intact.

```ts
import { ErrorHandler } from '@angular/core';
import { TelemetryErrorHandler } from '@codewithrajat/rm-logvault/angular';

@Component({
  providers: [{ provide: ErrorHandler, useClass: TelemetryErrorHandler }],
})
export class AppComponent {}
```

#### `provideTelemetryErrorHandler`

```ts
function provideTelemetryErrorHandler(context?: ErrorContext): Provider;
```

Builds the provider entry: `{ provide: ErrorHandler, useFactory: () => new TelemetryErrorHandler(context) }`.

It uses `useFactory` rather than `useClass` deliberately. A `useClass` provider for a class carrying
constructor parameters requires Angular DI metadata, which in turn requires `experimentalDecorators`
and `emitDecoratorMetadata` in the _consumer's_ tsconfig. A factory has no such requirement, so this
adapter works in any Angular project regardless of how its compiler is configured.

```ts
import { bootstrapApplication } from '@angular/platform-browser';
import { provideTelemetryErrorHandler } from '@codewithrajat/rm-logvault/angular';

bootstrapApplication(AppComponent, {
  providers: [provideTelemetryErrorHandler({ tags: { shell: 'checkout' } })],
});
```

#### `getPreviousErrorHandler`

```ts
function getPreviousErrorHandler(injector: {
  get(token: typeof ErrorHandler, notFoundValue?: unknown): unknown;
}): ErrorHandler | undefined;
```

Reads the currently-registered handler from an injector, returning `undefined` when it is already a
`TelemetryErrorHandler`. Provided for the rare case where an application wants to keep a reference
and chain it itself.

#### Writing your own `ErrorHandler`

`provideTelemetryErrorHandler()` above is the default and needs no help. Reach for a handler of your
own when you need something it cannot express: per-error context computed from the error itself,
chaining into a handler you own, or reporting through a service that has to be injected.

```ts
// live-error-handler.ts
import { ErrorHandler } from '@angular/core';
// The ROOT entry. This is the copy of captureError that initTelemetry wired up.
import { captureError } from '@codewithrajat/rm-logvault';

export class LiveErrorHandler implements ErrorHandler {
  public handleError(error: unknown): void {
    try {
      captureError(error, { source: 'angular', tags: { shell: 'checkout' } });
    } catch {
      // reporting must never break the framework's own handling
    }
    try {
      console.error(error); // keep Angular's default console output
    } catch {
      // a hostile console is not our problem
    }
  }
}
```

```ts
// app.config.ts
import { ErrorHandler, type ApplicationConfig } from '@angular/core';
import { provideBrowserGlobalErrorListeners } from '@angular/platform-browser';
import { provideRouter } from '@angular/router';
import { LiveErrorHandler } from './live-error-handler';
import { routes } from './app.routes';

export const appConfig: ApplicationConfig = {
  providers: [
    provideBrowserGlobalErrorListeners(),
    provideRouter(routes),
    // A factory provider, for the same reason the adapter's is: no decorator
    // metadata is required, so no @Injectable() and no emitDecoratorMetadata.
    { provide: ErrorHandler, useFactory: () => new LiveErrorHandler() },
  ],
};
```

Two things you take on by writing your own:

- **`source: 'angular'` is now your choice, not the adapter's.** Keep it if the failure is Angular's
  own routing; use `'manual'` for a failure you report by hand. A misleading source is a bug in the
  report, not a cosmetic detail.
- **`ErrorContext` is no longer merged for you.** The provider's `context` option applied to every
  record; here you pass `tags`/`extra` per call.

> **Source note, 1.0.0 only.** On 1.0.0 this pattern was also the *workaround*: every adapter subpath
> bundle inlined its own copy of the error pipeline, whose tracker could never be installed, so
> `provideTelemetryErrorHandler()` silently discarded everything Angular routed to it. Fixed in 1.0.1.
> See [D-026](DECISIONS.md#d-026--the-error-tracker-lives-on-the-shared-state-because-adapter-bundles-inline-the-core)
> and [Errors are missing while logs are stored](TROUBLESHOOTING.md#errors-are-missing-while-logs-are-stored).

### `@codewithrajat/rm-logvault/axios`

Peer: `axios >= 1`.

#### `attachAxios`

```ts
function attachAxios(instance: AxiosInstance): () => void;
```

Attaches a response-error interceptor and returns an eject function.

The interceptor is deliberately one-directional: it classifies, captures, and returns the original
rejection **unchanged**. Swallowing a rejection, or replacing it with a different error, would
change how the application behaves. It reads only `method`, `url`, `status`, `statusText`, `code`,
`timeout`, the elapsed duration and the first present correlation header — request and response
bodies are never read.

`startedAt` is best-effort: axios does not expose a start timestamp, so the configured timeout is
subtracted from `Date.now()` as an upper bound, and the duration is clamped to `>= 0`.

```ts
import axios from 'axios';
import { attachAxios } from '@codewithrajat/rm-logvault/axios';

const api = axios.create({ baseURL: '/api' });
const detach = attachAxios(api);
// …later
detach();
```

### `@codewithrajat/rm-logvault/fetch`

#### `instrumentFetch`

```ts
function instrumentFetch(options?: InstrumentFetchOptions): () => void;
```

Wraps `globalThis.fetch` so request failures are captured. Monkey-patching `fetch` is invasive, so
this is **opt-in** and fully reversible.

| Option                 | Type                        | Default            | Description                                              |
|------------------------|-----------------------------|--------------------|----------------------------------------------------------|
| `captureNetworkErrors` | `boolean \| undefined`      | `true`             | Capture rejections (network failures, aborts, timeouts). |
| `captureNon2xx`        | `boolean \| undefined`      | `true`             | Capture resolved responses whose status is not 2xx.      |
| `fetchImpl`            | `typeof fetch \| undefined` | `globalThis.fetch` | The `fetch` to wrap.                                     |

Captures exactly two things and reads nothing else: the rejection reason, and the status of a
non-2xx response. Response **bodies are never read**, and the wrapper returns the _original_
`Response` object untouched, so the application's own body consumption and streaming behaviour are
unaffected. The library's own upload endpoints are skipped by URL, so a failing upload can never
produce a captured error that triggers another upload.

The restore function is safe to call twice, and safe to call when another library has since replaced
`fetch` — that replacement is left alone.

```ts
import { instrumentFetch } from '@codewithrajat/rm-logvault/fetch';

const restore = instrumentFetch();
// …later
restore();
```

#### `registerTelemetryUrl`

```ts
function registerTelemetryUrl(url: string): () => void;
```

Registers a URL that the fetch wrapper must ignore, and returns a function that removes the
registration. Useful with a custom `RemoteTransport` that posts somewhere other than the configured
`errorsUrl`/`logsUrl`.

```ts
import { registerTelemetryUrl } from '@codewithrajat/rm-logvault/fetch';

const unregister = registerTelemetryUrl('https://otlp.example.com/v1/logs');
```

### `@codewithrajat/rm-logvault/react-query`

Peer: `@tanstack/react-query >= 4`.

#### `attachQueryClient`

```ts
function attachQueryClient(queryClient: QueryClient): () => void;
```

Attaches telemetry to a `QueryClient` and returns a function that restores the previous `onError`
handlers.

TanStack Query funnels every failed query and mutation through `QueryCache.config.onError` and
`MutationCache.config.onError` — one hook per cache rather than one per observer, which makes this
the cheapest possible integration. It covers retries too, since TanStack only calls `onError` after
the retry budget is exhausted. Any handler already installed is **chained**, not replaced.

Captured records use `source: 'query'`, `category: 'network'`, and carry `tags.queryKey` or
`tags.mutationKey` (array keys are joined with `/`) so a report shows _which_ request failed, not
just that one did.

```ts
import { QueryClient } from '@tanstack/react-query';
import { attachQueryClient } from '@codewithrajat/rm-logvault/react-query';

const queryClient = new QueryClient();
const detach = attachQueryClient(queryClient);
// …later
detach();
```

### `@codewithrajat/rm-logvault/http`

The HTTP client contract, its `fetch` implementation, and the auth helpers. The whole HTTP surface
lives on a subpath rather than in the core entry, for two reasons: an application that already uses
an axios or ky client should pay nothing for a `fetch` client it will never call, and the contract is
a dependency of the *implementation*, not of error recording, so the core has no reason to carry it.

> **The client is deliberately not never-throwing.** Every method **can reject**, and the rejection
> is always an `HttpError`. This is the one place in the package where a thrown error crosses the
> public boundary by design. The telemetry pipeline's never-throw guarantee is unaffected, because
> nothing here is on the capture path — wire `onError` to `captureError` and the failure becomes an
> ordinary record.
>
> Note that this subpath does read response bodies — that is the point of an HTTP client — but it
> never copies them into an error context.

#### `createFetchHttpClient`

```ts
function createFetchHttpClient(options?: HttpClientOptions): HttpClient;
```

Behaviour worth knowing before you rely on it:

- **The timeout is per attempt.** A `retry: 2` call can take three times `timeoutMs` before it
  rejects. Retrying is off by default.
- **Only `0`, `408`, `429` and every `5xx` are retried** (`isRetryableStatus`). A `4xx` other than
  `408`/`429` will not succeed on retry, so retrying it multiplies load while guaranteeing the same
  answer. A transport failure has no status and is always retried, which is why that branch does not
  consult the predicate.
- **A missing `fetch` rejects** with an `HttpError` whose `isNetworkError` is `true`, rather than
  throwing a `ReferenceError` from a different module. `fetch` is resolved **per request** from
  `globalThis`, so a polyfill installed later still takes effect.
- **`onError` runs before the rejection**, and its own failure is contained, so a broken reporter
  cannot change the outcome of the request.
- **An interceptor that throws does not escape as itself.** It is converted into an `HttpError` with
  the thrown message, `onError` is called, and that error is thrown — so a caller always has the
  `request`/`statusCode` shape to inspect.

| Option              | Type                                                                             | Default                        | Description                                                                                                                                                                                                                               |
|---------------------|----------------------------------------------------------------------------------|--------------------------------|-------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------|
| `baseUrl`           | `string \| undefined`                                                            | `undefined`                    | Prefix for relative request URLs. An already-absolute URL ignores it.                                                                                                                                                                     |
| `timeoutMs`         | `number \| undefined`                                                            | `30000`                        | Abort budget **per attempt**. A non-positive or non-finite value falls back to the default.                                                                                                                                               |
| `headers`           | `Record<string, string> \| undefined`                                            | `undefined`                    | Merged into every request, **first**.                                                                                                                                                                                                     |
| `getHeaders`        | `(() => Record<string, string> \| Promise<Record<string, string>>) \| undefined` | `undefined`                    | Awaited per request and merged **after** `headers` and **before** the per-request ones, so a rotated auth token wins over a static header of the same name. A throwing provider fails the request rather than sending it unauthenticated. |
| `bodyMode`          | `'json' \| 'text' \| 'raw' \| undefined`                                         | `'json'`                       | `'json'` sets `Content-Type: application/json` (when the caller has not set one) and `JSON.stringify`s; `'text'` sets `text/plain;charset=utf-8`; `'raw'` passes the body straight through and adds no content type.                      |
| `readAs`            | `'auto' \| 'json' \| 'text' \| 'arrayBuffer' \| 'blob' \| 'none' \| undefined`   | `'auto'`                       | `'auto'` decodes JSON when the response `Content-Type` says so, text otherwise. `'none'` never reads the body at all.                                                                                                                     |
| `credentials`       | `RequestCredentials \| undefined`                                                | `'same-origin'`                | `fetch` credentials mode.                                                                                                                                                                                                                 |
| `retry`             | `number \| undefined`                                                            | `0`                            | Attempts for a retryable failure. `0` disables retrying; a negative or non-finite value takes the default.                                                                                                                                |
| `retryDelayMs`      | `number \| undefined`                                                            | `300`                          | Base delay for the exponential backoff. `0` is honoured; a negative or non-finite value takes the default.                                                                                                                                |
| `rejectOnHttpError` | `boolean \| undefined`                                                           | `true`                         | Reject on a non-2xx response. Only the literal `false` turns it off.                                                                                                                                                                      |
| `onError`           | `((error: HttpError, context: ErrorContext) => void) \| undefined`               | `undefined`                    | Called with the failure before it is thrown. The context is already an `ErrorContext`, so it hands straight to `captureError`.                                                                                                            |
| `fetchImpl`         | `typeof fetch \| undefined`                                                      | `globalThis.fetch`             | Explicit `fetch` implementation.                                                                                                                                                                                                          |

The backoff is `min(retryDelayMs * 2 ** min(attempt - 1, 6), 30_000)` — bounded, so a mis-set retry
delay cannot hang a request.

Response headers are copied into a plain record with **lowercased** keys. `setInterceptors` replaces
the chain; `getInterceptors` returns it.

```ts
import { createFetchHttpClient } from '@codewithrajat/rm-logvault/http';
import { captureError } from '@codewithrajat/rm-logvault';

const http = createFetchHttpClient({
  baseUrl: '/api',
  timeoutMs: 10_000,
  retry: 1,
  onError: (error, context) => captureError(error, context),
});

const { data } = await http.get<Order[]>('/orders');
```

#### `HttpClient`, `HttpRequest`, `HttpResponse`, `HttpError`

```ts
interface HttpClient {
  request<T = unknown>(request: HttpRequest): Promise<HttpResponse<T>>;
  get<T = unknown>(url: string, options?: Partial<HttpRequest>): Promise<HttpResponse<T>>;
  post<T = unknown>(url: string, body?: unknown, options?: Partial<HttpRequest>): Promise<HttpResponse<T>>;
  put<T = unknown>(url: string, body?: unknown, options?: Partial<HttpRequest>): Promise<HttpResponse<T>>;
  patch<T = unknown>(url: string, body?: unknown, options?: Partial<HttpRequest>): Promise<HttpResponse<T>>;
  delete<T = unknown>(url: string, options?: Partial<HttpRequest>): Promise<HttpResponse<T>>;
  setInterceptors(interceptors: readonly HttpInterceptor[]): void;
  getInterceptors(): readonly HttpInterceptor[];
}

interface HttpRequest {
  readonly url: string;
  readonly method: HttpMethod;
  readonly headers?: Record<string, string> | undefined;
  readonly body?: unknown;
  readonly timeoutMs?: number | undefined;
  readonly credentials?: RequestCredentials | undefined;
  readonly retry?: number | undefined;
  readonly signal?: AbortSignal | undefined;
}

interface HttpResponse<T = unknown> {
  readonly status: number;
  readonly statusText: string;
  readonly headers: Record<string, string>;
  readonly data: T;
  readonly ok: boolean;
  readonly durationMs: number;
}
```

`HttpMethod` is `'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE' | 'HEAD' | 'OPTIONS'`. An unrecognised
method is normalised to `'GET'` rather than sent as-is.

`HttpError` **extends `Error`**, so `captureError(httpError, …)` records it as a real error rather
than an opaque object:

| Member            | Type                        | Meaning                                                                              |
|-------------------|-----------------------------|--------------------------------------------------------------------------------------|
| `name`            | `'HttpError'`               | Set explicitly.                                                                      |
| `request`         | `HttpRequest`               | The request that failed.                                                             |
| `response`        | `HttpResponse \| undefined` | Present for a non-2xx response; **absent** for a network failure or a timeout.       |
| `isNetworkError`  | `boolean`                   | The request never reached a server (DNS, CORS, offline).                             |
| `isTimeout`       | `boolean`                   | The request was aborted by the timeout budget.                                       |
| `isAbort`         | `boolean`                   | An `AbortSignal` other than the timeout's aborted the request.                       |
| `statusCode`      | `number`                    | `response.status`, or `0` when there was no response.                                |
| `attempts`        | `number`                    | Attempts made, including the first.                                                  |

##### `NonRetryableHttpError`

```ts
interface NonRetryableHttpError extends HttpError {
  readonly isRetryable: false;
}
```

An `HttpError` that will produce the same failure if tried again. A **throwing `getHeaders` provider**
and a **body that cannot be serialised** are both deterministic — the same input raises the same throw —
so they are marked non-retryable and surfaced immediately, whatever `retry` says. `isNetworkError` is
still `true` for these, because no request reached a server; it is `isRetryable`, not the error class,
that suppresses the retry.

The flag is additive rather than a discriminated union, so a plain `HttpError` has no `isRetryable`
member at all:

```ts
import type { HttpError, NonRetryableHttpError } from '@codewithrajat/rm-logvault/http';

const isPermanentFailure = (error: HttpError): boolean =>
  (error as Partial<NonRetryableHttpError>).isRetryable === false;
```

`createFetchHttpClient` applies this check itself; it is documented so a custom client or a retry wrapper
can honour the same signal.

#### `HttpInterceptor`

```ts
interface HttpInterceptor {
  readonly name?: string | undefined;
  readonly onRequest?: ((request: HttpRequest) => HttpRequest | null | Promise<HttpRequest | null>) | undefined;
  readonly onResponse?: <T>(response: HttpResponse<T>, request: HttpRequest) => HttpResponse<T> | Promise<HttpResponse<T>>;
  readonly onError?: ((error: HttpError) => void | Promise<void>) | undefined;
}
```

`onRequest` returning `null` **cancels** the call with an `HttpError` whose message is `'request
cancelled by an interceptor'`, instead of sending it. `onResponse` runs only on the success path.
`onError` cannot change the outcome: the original error is still thrown, and a throwing hook is
reported and ignored.

#### `createAuthHeaderProvider` and `createAuthInterceptor`

```ts
function createAuthHeaderProvider(
  provider: AuthProvider,
  options?: AuthHeaderProviderOptions,
): AuthHeaderProvider;

function createAuthInterceptor(provider: AuthProvider): HttpInterceptor;
```

`AuthProvider` — what the library needs from an application's authentication. Only `getToken` is
required:

| Member            | Signature                                                   | Meaning                                                                                                                                                                                                                 |
|-------------------|-------------------------------------------------------------|-------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------|
| `getToken`        | `() => string \| undefined \| Promise<string \| undefined>` | **Required.** The current token. A throwing implementation is treated as "no token" and reported once.                                                                                                                  |
| `refreshToken`    | `(() => Promise<string \| undefined>) \| undefined`         | Exchange the current credentials for a fresh token.                                                                                                                                                                     |
| `isTokenExpired`  | `((token: string) => boolean) \| undefined`                 | Whether a token is already stale. Omitted, the library never proactively refreshes and relies on the reactive `401` path. A throwing predicate is treated as **not** expired, to avoid a refresh loop on every request. |
| `onUnauthorized`  | `(() => void \| Promise<void>) \| undefined`                | Called when the token is gone for good. Invoked **before** a refresh attempt and again when a refresh fails.                                                                                                            |
| `logout`          | `(() => void \| Promise<void>) \| undefined`                | Discard the current token, when authentication is unrecoverable.                                                                                                                                                        |

`AuthHeaderProviderOptions`:

| Option             | Type                                                                             | Default           | Description                                                                                                                                                                         |
|--------------------|----------------------------------------------------------------------------------|-------------------|-------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------|
| `headerName`       | `string \| undefined`                                                            | `'Authorization'` | Header to set. An empty string takes the default.                                                                                                                                   |
| `scheme`           | `string \| undefined`                                                            | `'Bearer '`       | Prefix for the token, **space included**. Set it to `''` for a bare API key such as `X-API-Key`.                                                                                    |
| `getExtraHeaders`  | `(() => Record<string, string> \| Promise<Record<string, string>>) \| undefined` | `undefined`       | Additional headers produced alongside the token — a session id, a tenant header, a CSRF token. The token is set **last**, so a misconfigured provider cannot shadow the credential. |

`AuthHeaderProvider` is `{ getHeaders: () => Promise<Record<string, string>>; refresh: () =>
Promise<string | undefined> }`. **`getHeaders` never rejects**, because `rest.getHeaders` treats a
throwing provider as a retryable sync failure — which would turn an expired session into an upload
backlog instead of a clear `401`.

Behaviour:

- A token that `isTokenExpired` rejects is refreshed **before** the request, so a stale token does
  not cost a wasted round trip.
- If no token can be obtained at all, the result is an **empty header bag** (plus extra headers) and
  `onUnauthorized` is **not** called. An anonymous request is a normal state, and reporting it would
  nag on every request made before a user logs in.
- A token that was present, was stale, and could not be replaced **does** call `onUnauthorized`.
- Concurrent `refresh()` calls share **one** in-flight attempt. A page that fires ten parallel
  requests with an expired token refreshes once, not ten times.

`createAuthInterceptor` attaches a token via `onRequest` and, on `onError` with `statusCode === 401`,
performs **one** refresh and then calls `logout` and `onUnauthorized` if it failed. It does **not**
re-issue the request: the client owns its own retry policy, and a silent second request would
double-report the original failure.

```ts
import { createAuthHeaderProvider, setupTelemetry } from '@codewithrajat/rm-logvault/http';

const auth = createAuthHeaderProvider({
  getToken: () => sessionStore.token,
  refreshToken: async () => (await refreshSession()).token,
  isTokenExpired: (token) => jwtExpiry(token) < Date.now(),
  onUnauthorized: () => router.push('/login'),
});

setupTelemetry({ app: 'checkout', url: '/telemetry', headers: auth.getHeaders });
```

#### `buildHttpErrorContext`

```ts
function buildHttpErrorContext(error: HttpError): ErrorContext;
```

Builds the `ErrorContext` for an HTTP failure: `source: 'api'`, the derived category and severity,
an `api` block, and `tags` carrying `kind: 'http'`, `method`, `status` (when above `0`) and
`attempts` (only when more than one attempt was made).

Only an allow-list of fields is copied — method, url, status, statusText, the per-request timeout
budget and the duration. Request and response **bodies are never read** and never appear here.

#### `categoryForHttpStatus`

```ts
function categoryForHttpStatus(
  status: number,
  timedOut: boolean,
): 'auth' | 'timeout' | 'network' | 'http' | 'abort';
```

| Input                              | Category             |
|------------------------------------|----------------------|
| `timedOut === true`                | `'timeout'` (first)  |
| `status === 0`                     | `'network'`          |
| `401`, `403`, `407`                | `'auth'`             |
| `408`, `504`                       | `'timeout'`          |
| `499`                              | `'abort'`            |
| anything else                      | `'http'`             |

#### `severityForHttpError`

```ts
function severityForHttpError(status: number, timedOut: boolean): 'error' | 'warning';
```

`'error'` when `timedOut` or `status === 0` or `status >= 500`; `'warning'` otherwise.

#### `isRetryableStatus`

```ts
function isRetryableStatus(status: number): boolean;
```

`true` for `0`, `408`, `429` and every status in `500`–`599`. Deliberately narrow.

#### `resolveRequestUrl`

```ts
function resolveRequestUrl(url: string, baseUrl: string | undefined): string;
```

Composes a base URL and a possibly-relative path. Never throws. An empty or non-string `url` yields
`''`; an already-absolute URL (`scheme://…`) ignores the base; a trailing slash on the base and a
missing leading slash on the path are both normalised away, so `resolveRequestUrl('orders', '/api/')`
is `'/api/orders'`.

#### `DEFAULT_HTTP_TIMEOUT_MS`, `DEFAULT_HTTP_RETRY_DELAY_MS`

```ts
const DEFAULT_HTTP_TIMEOUT_MS = 30_000;
const DEFAULT_HTTP_RETRY_DELAY_MS = 300;
```

The per-attempt abort budget and the base backoff delay, in milliseconds.

Subpath exports, in full: `HttpClient`, `HttpRequest`, `HttpResponse`, `HttpError`, `HttpInterceptor`,
`HttpClientOptions`, `HttpMethod`, `AuthProvider`, `AuthHeaderProvider`, `AuthHeaderProviderOptions`,
`createFetchHttpClient`, `createAuthHeaderProvider`, `createAuthInterceptor`, `buildHttpErrorContext`,
`categoryForHttpStatus`, `severityForHttpError`, `isRetryableStatus`, `resolveRequestUrl`,
`DEFAULT_HTTP_TIMEOUT_MS`, `DEFAULT_HTTP_RETRY_DELAY_MS`.

### `@codewithrajat/rm-logvault/storage`

Encryption adapters for stored records, and a repository wrapper that uses them. A separate entry
point because the AES provider is meaningful only to an application that has decided it needs
encryption at rest.

> **Read this before choosing a provider.**
>
> The library's default position is that **redaction, not encryption, is the privacy control** —
> `createSanitizer` strips sensitive keys, URL parameters and free-text patterns *before* a record is
> written, so an unencrypted vault is already scrubbed. Encryption is defence in depth for the case
> where someone else gets read access to the origin's storage.
>
> - **`createBase64EncryptionProvider` is encoding, not encryption.** It stops a record being
>   readable at a glance in devtools and provides **no** confidentiality: anyone with the value can
>   decode it with `atob`. It is named `base64` rather than `basic` on purpose. Use it to keep an
>   incidental screenshot from being a data incident, not to protect a secret.
> - **`createAesGcmEncryptionProvider` is real AES-GCM-256 through the platform `crypto.subtle`, and
>   it is only as strong as where you keep the key.** A key derived from a password stored in the
>   same origin — in the same bundle, in `localStorage` — protects against a database dump and
>   against nothing else. There is no way around that in a browser without a server, and pretending
>   otherwise would be the bug.
> - The key is created **non-extractable**, so a script on the page cannot read it back out of the
>   `CryptoKey`. That does not stop a script from *using* it.

#### `EncryptionProvider`

```ts
interface EncryptionProvider {
  readonly encrypt: (plaintext: string) => string | Promise<string>;
  readonly decrypt: (stored: string) => string | Promise<string>;
  readonly name?: string | undefined;
}
```

Both members may be synchronous or asynchronous, so one interface covers `btoa` and
`crypto.subtle`. Neither may throw: a provider that fails must return the input unchanged for
`encrypt` and signal failure for `decrypt` by throwing, which the wrapper contains.

#### `createBase64EncryptionProvider`

```ts
function createBase64EncryptionProvider(): EncryptionProvider;
```

`name: 'base64'`. Encrypts with `btoa(encodeURIComponent(value))` and decrypts with
`decodeURIComponent(atob(value))`. **Encoding, not encryption** — see the warning above.

Falls back to identity when `btoa`/`atob` are absent (Node without a DOM shim), so an SSR import
cannot crash the module. `decrypt` is deliberately **unguarded**: a value written by a different
provider, or a corrupted one, must signal failure so the wrapper leaves the stored text in place
rather than blanking the field.

#### `deriveAesKey`

```ts
function deriveAesKey(
  password: string,
  salt: Uint8Array,
  iterations = 250_000,
): Promise<CryptoKey | undefined>;
```

PBKDF2-SHA-256 → AES-GCM-256, created non-extractable. Resolves `undefined` — never rejects — when
`crypto.subtle` is unavailable (any non-secure context, including plain `http:`), and reports a
failure through `reportInternalFailure('derive-aes-key', …)`.

#### `createWebCryptoEncryptionProvider`

```ts
function createWebCryptoEncryptionProvider(key: CryptoKey): EncryptionProvider | undefined;
```

Wraps an existing AES-GCM key. `name: 'aes-gcm'`. Output is Base64 of `[12-byte IV][ciphertext]`,
using a **fresh random IV per value**. Returns `undefined` when `crypto.subtle` is unavailable.
`decrypt` throws on a payload of 12 bytes or fewer — too short to contain an IV and a ciphertext —
which the wrapper reports.

#### `createAesGcmEncryptionProvider`

```ts
function createAesGcmEncryptionProvider(
  options: AesGcmEncryptionProviderOptions,
): Promise<EncryptionProvider | undefined>;
```

| Option       | Type                  | Default     | Description                                                                                                                                                                                                                |
|--------------|-----------------------|-------------|----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------|
| `password`   | `string`              | —           | Passphrase the AES key is derived from. An empty or non-string value resolves `undefined`.                                                                                                                                 |
| `salt`       | `Uint8Array`          | —           | PBKDF2 salt, as raw bytes. Must be the **same value on every load**, or previously stored records cannot be decrypted. Persist it somewhere that is not this database — a build-time constant, or a server-supplied value. |
| `iterations` | `number \| undefined` | `250000`    | PBKDF2 iteration count. A non-finite or non-positive value takes the default.                                                                                                                                              |

Resolves `undefined` — never rejects — when `crypto.subtle` is unavailable, so a non-secure context
degrades to local-only operation rather than throwing at startup.

```ts
import { createAesGcmEncryptionProvider } from '@codewithrajat/rm-logvault/storage';

const provider = await createAesGcmEncryptionProvider({
  password: import.meta.env.VITE_VAULT_PASSPHRASE,
  salt: new Uint8Array([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16]),
});
if (provider === undefined) {
  // Not a secure context — fall back to local-only operation.
}
```

#### `createEncryptingRepository`

```ts
function createEncryptingRepository<T>(
  inner: EncryptableRepository<T>,
  provider: EncryptionProvider,
  options: EncryptingRepositoryOptions,
): EncryptingRepository<T>;
```

| Option             | Type                                                     | Description                                                                                                                                                                                                     |
|--------------------|----------------------------------------------------------|-----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------|
| `fields`           | `readonly string[]`                                      | Which fields to encrypt. A plain field name, or a dotted path for one level of nesting (`'api.url'`). A path that matches nothing is skipped silently. Entries that are not non-empty strings are filtered out. |
| `onDecryptFailure` | `((field: string, error: unknown) => void) \| undefined` | Called per field that cannot be decrypted. The field keeps its **stored** value, so a key rotation produces a readable error instead of a silently empty report. A throwing callback is contained.              |

`EncryptableRepository<T>` is structural — it needs `getAll`, `get` and `save`, and passes through
`saveBatch`, `claimPending`, `getFailed`, `pendingCount` and `updateUploadStatus` **only when the
inner repository has them**. `EncryptingRepository<T>` adds `inner` (the unwrapped repository) and
`provider`.

Everything above the repository keeps working on plaintext, including the diagnostics export, because
the wrapper encrypts on write and decrypts on read. Claiming, counting and cleanup pass straight
through, because those operations key on `id`, `fingerprint` and `uploadStatus` — **encrypting those
would break them**.

> **Encrypting a field changes its value**, so a field used as a grouping key — `message`, `stack`,
> `fingerprint` — stops grouping correctly once encrypted. Encrypt fields you intend to read back for
> a human, not fields you aggregate on.

```ts
import { createErrorRepository } from '@codewithrajat/rm-logvault';
import { createAesGcmEncryptionProvider, createEncryptingRepository } from '@codewithrajat/rm-logvault/storage';

const provider = await createAesGcmEncryptionProvider({ password, salt });
if (provider !== undefined) {
  const errors = createEncryptingRepository(
    createErrorRepository({ dbName: 'rm-logvault-errors' }),
    provider,
    { fields: ['message', 'stack'] },
  );
}
```

#### `encryptRecordFields` and `decryptRecordFields`

```ts
function encryptRecordFields<T>(
  record: T,
  fields: readonly string[],
  provider: EncryptionProvider,
): Promise<T>;

function decryptRecordFields<T>(
  record: T,
  fields: readonly string[],
  provider: EncryptionProvider,
  onFailure?: (field: string, error: unknown) => void,
): Promise<T>;
```

Both return a shallow **copy** — the input record is never mutated — and both are total. A
non-object record is returned unchanged.

`encryptRecordFields` **never throws**: a field whose encryption fails is written in **plaintext**
rather than lost, reported through `reportInternalFailure('encrypt:<field>', …)`. Non-string and
empty-string values are skipped.

`decryptRecordFields` reports each failure through `onFailure` and then
`reportInternalFailure('decrypt:<field>', …)`, leaving the stored value in place. An empty decrypt
result is treated as a failure for the same reason, because blanking a message would be worse than
showing it.

#### `AesGcmEncryptionProviderOptions`, `EncryptingRepositoryOptions`

Type aliases for the option objects documented above.

Subpath exports, in full: `EncryptionProvider`, `EncryptableRepository`, `EncryptingRepository`,
`EncryptingRepositoryOptions`, `AesGcmEncryptionProviderOptions`, `CleanupPolicy`,
`StorageFailureReason`, `createBase64EncryptionProvider`, `createAesGcmEncryptionProvider`,
`createWebCryptoEncryptionProvider`, `createEncryptingRepository`, `deriveAesKey`,
`encryptRecordFields`, `decryptRecordFields`.

### `@codewithrajat/rm-logvault/testing`

Importing this subpath pulls in nothing from the browser-specific code paths beyond type
definitions, so it is safe in Node-only test runners.

#### `createMemoryRepository`

```ts
function createMemoryRepository(options?: MemoryRepositoryOptions): MemoryRepository;
```

| Option     | Type                                | Description                                                                                 |
|------------|-------------------------------------|---------------------------------------------------------------------------------------------|
| `failWith` | `StorageFailureReason \| undefined` | Make every operation fail with this reason, to exercise degradation paths.                  |
| `quotaAt`  | `number \| undefined`               | Fail writes with `'quota'` once this many rows are stored, to test the quota-recovery path. |

`MemoryRepository` extends `TelemetryRepository` with `reset()` and inspection helpers:
`errors.all(): ErrorRecord[]`, `logs.all(): LogRecord[]`, and `reset()` on each.

The semantics intentionally mirror the IndexedDB repositories — pending-only aggregation, atomic
claiming, stale-lease requeue, retention cleanup — so a test that passes here is testing real logic,
not a stub.

```ts
import { createMemoryRepository } from '@codewithrajat/rm-logvault/testing';
import { initTelemetry, captureError, flushTelemetry } from '@codewithrajat/rm-logvault';

const repository = createMemoryRepository();
initTelemetry({ appName: 'test', repository, shortcut: false });

captureError(new Error('boom'));
await flushTelemetry();

console.log(repository.errors.all()[0]?.message); // 'boom'
```

#### `createFakeTransport`

```ts
function createFakeTransport(options?: FakeTransportOptions): FakeTransport;
```

| Option         | Type                                                                            | Description                                                                                                               |
|----------------|---------------------------------------------------------------------------------|---------------------------------------------------------------------------------------------------------------------------|
| `status`       | `number \| ((request: TransportRequest, index: number) => number) \| undefined` | Fixed status, or a function of the request and its zero-based index. Defaults to `202`. A throwing function yields `500`. |
| `retryAfterMs` | `number \| undefined`                                                           | `Retry-After` hint reported alongside the status.                                                                         |
| `failTimes`    | `number \| undefined`                                                           | Reject (not merely fail) the first N sends, simulating a network failure.                                                 |
| `onSend`       | `((request, index) => void) \| undefined`                                       | Called after each send is recorded.                                                                                       |

`FakeTransport` extends `RemoteTransport` with `requests` (every request handed to `send`, in
order), `sendCount` (including rejected sends), `lastBody()` (parses the most recent body) and
`reset()`.

```ts
import { createFakeTransport } from '@codewithrajat/rm-logvault/testing';

// Succeed once, then fail with a retry hint.
let calls = 0;
const transport = createFakeTransport({
  status: () => (calls++ === 0 ? 202 : 503),
  retryAfterMs: 60_000,
});
```

---

## Not exported

These are used internally and are deliberately absent from `src/index.ts`. They are listed so you
do not spend time looking for them:

`createErrorTracker`, `createLogTracker`, `getLoggerController`, `setDefaultSanitizer`,
`resetDefaultSanitizer`, `getBuiltInSanitizer`, `setErrorTracker`, `setCaptureSuppressed`,
`flushPreInitErrors`, `preInitErrorCount`, `clearPreInitErrors`, `currentRoute`, `currentPageInfo`,
`currentEnvironment`, `createCleanupRegistry`, `resetState`,
`resetInternalFailures`, `DEFAULT_KEY`, `DEFAULT_SHORTCUT_CONFIG`,
`EMPTY_FLUSH_SUMMARY`, `truncationSuffix`, and the bulk of the pattern and limit
constants in `src/errors/constants.ts` beyond the fourteen re-exported ones.

If you need one of them, open an issue with the use case rather than deep-importing
`@codewithrajat/rm-logvault/dist/...` — deep imports are not covered by the package's `exports` map and will break on
any refactor.
