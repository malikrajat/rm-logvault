# more-advanced — Vue 3

**Problem it solves:** "IndexedDB plus `fetch`" is not the shape of your deployment. You need a
different store, a transport that goes through your own HTTP client, your existing logger's records in
the same vault, or the ability to rewrite a record before it is stored.

**What you will learn:**

- The full `TelemetryRepository` contract, and how to replace the store.
- A custom `rest.transport` — and the lighter `rest.getHeaders` alternative.
- Attaching a logger you already have, with `logSource`.
- `beforeCapture` / `beforeStore`: rewrite a record or drop it.
- `onInternalError` and `consent`: observing and gating the library itself.
- Driving sync yourself instead of waiting for the interval.
- `setupTelemetry` and the flat aliases, and the inside-out precedence rule.
- `handle.events` through a composable, and `registerErrorContextBuilder`.
- The shipped HTTP client, with one auth provider feeding the client and the recorder.
- Encrypting stored fields, and what that costs you.

## Two kinds of page in this tier

The first group **replaces** a part of the library; the second **watches and teaches** it. That
distinction is worth holding on to when you decide how much to take on: observing costs nothing and
cannot break a capture, while replacing a part is a guarantee you now own.

| Group | Seam | Read |
| --- | --- | --- |
| Replace | `repository` | [Replace the store](#replacing-the-store) below |
| Replace | `rest.transport`, `logSource` | [A custom transport](#a-custom-transport) |
| Replace | `beforeCapture` / `beforeStore` | [Rewriting or dropping a record](#rewriting-or-dropping-a-record) |
| Observe | `handle.events`, context builders, sink registry, export formats | [04-observing-and-extending.md](./04-observing-and-extending.md) |
| Add | The shipped HTTP client and auth | [05-using-the-http-client.md](./05-using-the-http-client.md) |
| Add | Encryption at rest | [06-encrypting-stored-records.md](./06-encrypting-stored-records.md) |

## The short form of the configuration

`setupTelemetry` is a thin front door to `initTelemetry`, and the flat aliases collapse the nesting the
option tables above are full of:

```ts
import { setupTelemetry } from '@codewithrajat/rm-logvault';

// Equivalent to { appName, rest: { errorsUrl, logsUrl }, logs: { level } }.
setupTelemetry({ app: 'my-app', url: '/telemetry', level: 'info' });
```

Precedence runs **inside-out** — nested option > flat alias > `env` > default — and an invalid nested
value falls through to the alias rather than winning. The full alias table and the precedence examples
are in [04-observing-and-extending.md](./04-observing-and-extending.md#the-short-form-of-the-configuration).

## Replacing the store

`initTelemetry` builds an IndexedDB repository pair for you unless you supply one. The contract is four
members — and `initialize()` and `close()` are **required**, not optional:

```ts
interface TelemetryRepository {
  readonly errors: ErrorRepository;
  readonly logs: LogRepository;
  initialize(): Promise<StorageResult<void>>;
  close(): void;
}
```

| Member | Contract |
| --- | --- |
| `errors` / `logs` | The two stores. Each is the full repository interface — `initialize`, `save`/`saveBatch`, `get`, `getAll`, `getPending`, `claimPending`, `requeueStale`, `getFailed`, `delete`, `updateUploadStatus`, `count`, `pendingCount`, `cleanup`, `clear`, `close`. |
| `initialize()` | The **readiness gate**. Sync never starts before it resolves `true`. |
| `close()` | Called on `destroyTelemetry()`. Must be safe to call twice. |

`StorageResult<T>` is `{ ok: true, value: T }` or `{ ok: false, reason }`, where `reason` is one of
`'unavailable'`, `'quota'`, `'serialization'`, `'transaction'`. Nothing in the storage layer throws — a
failure is a value.

> **Source note.** The built-in pair treats storage as ready when **at least one** store opened. It
> reports `'unavailable'` only when *both* the error and the log database failed, so one working store
> is not a reason to stop recording.

The shipped in-memory implementation is the smallest complete example, and is the right starting point
for tests:

```ts
import { initTelemetry } from '@codewithrajat/rm-logvault';
import { createMemoryRepository } from '@codewithrajat/rm-logvault/testing';

const repository = createMemoryRepository();

initTelemetry({ appName: 'my-app', repository });
```

A hand-rolled pair is possible — `createErrorRepository` and `createLogRepository` are public — but then
the database names and cleanup policies are yours to keep in step with `dbPrefix` and `errors.*`.
`createErrorRepository({ dbName, cleanupPolicy, cleanupEveryWrites })` is also the supported way to
change the **cleanup cadence**, which is deliberately not an option: the store *size* is governed by
`retentionDays` and `maxRecords`, and the cadence only decides when the sweep runs.

## A custom transport

```ts
interface RemoteTransport {
  readonly name?: string;
  send(request: TransportRequest): Promise<TransportResponse>;
}
```

`TransportRequest` carries `url`, `headers`, `credentials`, `body` (already-serialised JSON),
`timeoutMs`, `keepalive` and `kind`. `TransportResponse` carries `status` and an optional
`retryAfterMs`.

```ts
import { initTelemetry, retryFailedTelemetry } from '@codewithrajat/rm-logvault';
import type { RemoteTransport, TransportRequest, TransportResponse } from '@codewithrajat/rm-logvault';

const transport: RemoteTransport = {
  name: 'my-http-client',
  async send(request: TransportRequest): Promise<TransportResponse> {
    // `request.body` is already the exact JSON to send; do not rebuild it.
    const response = await myHttpClient.post(request.url, request.body, {
      headers: request.headers,
      withCredentials: request.credentials === 'include',
      timeout: request.timeoutMs,
    });

    return { status: response.status };
  },
};

initTelemetry({
  appName: 'my-app',
  rest: { transport, errorsUrl: '/api/telemetry/errors' },
});
```

Supplying a transport also activates sync. A transport that **throws** is treated as a retryable
failure, not a permanent one, so a flaky client does not silently discard records.

If you only need a header, reach for `rest.getHeaders` first — it is awaited per request, and a throwing
provider is also retryable:

```ts
initTelemetry({
  appName: 'my-app',
  rest: {
    errorsUrl: '/api/telemetry/errors',
    getHeaders: () => ({ authorization: `Bearer ${getToken()}` }),
    onTerminalFailure: (status, records) => {
      // A batch failed terminally. Re-authenticate, then ask for a retry.
      if (status === 401) void refreshToken().then(() => retryFailedTelemetry());
    },
  },
});
```

`credentials` is `'same-origin'` by default and `'include'` is **never** implied — a cross-origin
collector needs it set explicitly.

## Attaching a logger you already have

```ts
interface ExternalLogSource {
  addSink(sink: LogSink): () => void; // returns a detach function
}
```

`LogSink` is `{ name: string; write(record: LogRecord): void }`. The detach function is registered with
the cleanup registry, so `destroyTelemetry()` removes it.

```ts
initTelemetry({
  appName: 'my-app',
  logSource: {
    addSink: (sink) => myLogger.addSink(sink), // your logger's own subscription API
  },
});
```

> **Source note.** `logSource` is for a logger **you** own. `initTelemetry` already registers its own
> sink, so pointing this at the library's `logger` would write every record twice. A `LogRecord` handed
> to a sink has **already** been sanitized — that is the boundary, and a sink must not re-send raw data.

## Rewriting or dropping a record

Both hooks are the last chance to change a record before it is stored. Returning `null` drops it.

```ts
initTelemetry({
  appName: 'my-app',
  errors: {
    beforeCapture: (record) => {
      // Drop a known-noisy failure before it consumes a row.
      if (record.message.includes('ResizeObserver loop')) return null;
      return { ...record, tags: { ...record.tags, reviewed: 'yes' } };
    },
  },
  logs: {
    beforeStore: (record) => (record.level === 'debug' ? null : record),
  },
});
```

A hook that throws is reported through `onInternalError` and **ignored**, so a bug in your filter cannot
stop the library from recording everything else.

## Observing and gating the library

```ts
initTelemetry({
  appName: 'my-app',
  onInternalError: (stage, error) => {
    // Once per stage per initialization — not once per failure.
    if (stage === 'storage') showStorageWarning(error);
  },
  consent: () => userHasAcceptedDiagnostics(),
});
```

`onInternalError(stage, error)` reports the library's own problems: a storage open failure, a payload
that could not be reduced, a transport that threw. Stages are reported **at most once per
initialization**, which is what stops a broken store producing one message per captured error.

`consent` is evaluated before every capture, save and upload, and it **fails closed**: a gate that
throws stores nothing. Use it for a real consent decision, not for feature flags.

## Driving sync yourself

```ts
import {
  flushTelemetry,
  getTelemetryStatus,
  retryFailedTelemetry,
  syncTelemetry,
} from '@codewithrajat/rm-logvault';

await flushTelemetry();          // drain buffered records into the store, no upload
await syncTelemetry();           // flush, then upload everything pending
const requeued = await retryFailedTelemetry(); // move 'failed' rows back to 'pending'
getTelemetryStatus();            // synchronous; does not read IndexedDB
```

Typical triggers: a "send now" button, a `window.addEventListener('online', …)`, or a visibility change.

```ts
window.addEventListener('online', () => {
  void syncTelemetry();
});
```

## Framework notes for Vue

- **The adapter's guarantees are in [01-framework-adapter.md](./01-framework-adapter.md)** — the
  chaining rule and `captureWarnings`.
- **A "send now" button is just a component method** calling `syncTelemetry()`; it needs nothing from
  Vue beyond a click handler.
- **Keep the plugin installed** when you replace the store. The store and the transport are
  `initTelemetry` options; the plugin only installs the error and warning hooks.
- **If you replace `repository`, re-init with care.** `initTelemetry` is idempotent, so apply the change
  by calling `destroyTelemetry()` first, as in any other reconfiguration.
- **Subscribe to events from `onMounted`, and unsubscribe in `onUnmounted`.** `handle.events.on()` does
  nothing before `initTelemetry` has returned, so a module-scope subscription made too early is
  silently dropped — see
  [04-observing-and-extending.md](./04-observing-and-extending.md#observing-captures-with-a-composable).
- **`onDecryptFailure` is a diagnosis hook, not a data-loss handler.** A field that cannot be decrypted
  keeps its stored value, so nothing is lost — you just have to notice the warning. See
  [06-encrypting-stored-records.md](./06-encrypting-stored-records.md#when-a-field-cannot-be-decrypted).

## Next

- **Watch and teach the pipeline:** [04-observing-and-extending.md](./04-observing-and-extending.md) —
  `setupTelemetry`, the flat aliases, `handle.events` in a composable, context builders, the sink
  registry, and the four export formats.
- **Call your API through the shipped client:**
  [05-using-the-http-client.md](./05-using-the-http-client.md) — one client, retries that are per
  attempt, an interceptor, and one auth provider feeding both the client and the recorder.
- **Encrypt what is stored:** [06-encrypting-stored-records.md](./06-encrypting-stored-records.md) —
  Base64 versus AES-GCM, wrapping both repositories, and which fields to leave alone.
- [The recipes and choosing between them](./03-recipes-and-deciding.md) — the decision table across
  Vue's error paths, the chaining guarantee, and how to assert each one in a test.
- The Vue adapter in depth: [01-framework-adapter.md](./01-framework-adapter.md).
- Every option, boundary and invalid-value rule:
  [docs/API.md](../../../docs/API.md#every-option-annotated).
- The same tier for another framework:
  [../../angular/more-advanced/README.md](../../angular/more-advanced/README.md),
  [../../nextjs/more-advanced/README.md](../../nextjs/more-advanced/README.md).
