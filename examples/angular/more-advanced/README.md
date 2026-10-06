# more-advanced — Angular (standalone)

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
- `setupTelemetry` and the flat configuration aliases.
- `handle.events` as an injectable Angular service, plus context builders and the sink registry.
- The library's own HTTP client, with auth wired into both it and the telemetry upload.
- Encryption at rest, and which fields are worth encrypting.

## The pages in this tier

| Page | Problem it solves | Start here if |
| --- | --- | --- |
| [01 — the Angular adapter](./01-framework-adapter.md) | Why the provider is a factory, what the handler does, and how to chain or replace it. | You need to understand the `ErrorHandler` integration. |
| [03 — the recipes and choosing](./03-recipes-and-deciding.md) | The decision table across Angular's error paths. | You are unsure which path an error takes. |
| [04 — observing and extending](./04-observing-and-extending.md) | Events as signals, context builders, named sinks, and the four export formats. | You want a badge, your own store, or a report a support team can read. |
| [05 — using the HTTP client](./05-using-the-http-client.md) | The library's own client, with `onError` wired to `captureError` and one auth policy for both consumers. | Failures in your API calls are not being recorded. |
| [06 — encrypting stored records](./06-encrypting-stored-records.md) | AES-GCM at rest, and which fields are worth encrypting. | IndexedDB readability is a compliance question for you. |

The rest of this page is the reference those three build on: the store, the transport, the hooks and the
lifecycle.

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

```ts
import { initTelemetry } from '@codewithrajat/rm-logvault';
import { createMemoryRepository } from '@codewithrajat/rm-logvault/testing';

const repository = createMemoryRepository();

initTelemetry({ appName: 'my-app', repository });
```

A hand-rolled pair is possible — `createErrorRepository` and `createLogRepository` are public — but then
the database names and cleanup policies are yours to keep in step with `dbPrefix` and `errors.*`.
`createErrorRepository({ dbName, cleanupPolicy, cleanupEveryWrites })` is also the supported way to
change the **cleanup cadence**, which is deliberately not an option.

To encrypt what is at rest, wrap each repository before assembling the pair — see
[encrypting stored records](./06-encrypting-stored-records.md).

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
  name: 'angular-http-client',
  async send(request: TransportRequest): Promise<TransportResponse> {
    // Route through your own client (an interceptor can attach the token) rather than
    // rebuilding `request.body` — it is already the exact JSON to send.
    const response = await lastValueFrom(
      http.post(request.url, request.body, { observe: 'response' }),
    );

    return { status: response.status };
  },
};

initTelemetry({
  appName: 'my-app',
  rest: {
    transport,
    errorsUrl: '/api/telemetry/errors',
    onTerminalFailure: (status) => {
      if (status === 401) void refreshToken().then(() => retryFailedTelemetry());
    },
  },
});
```

Supplying a transport also activates sync. A transport that **throws** is treated as a retryable
failure, not a permanent one.

If you only need a header, reach for `rest.getHeaders` first — awaited per request, and a throwing
provider is also retryable:

```ts
initTelemetry({
  appName: 'my-app',
  rest: { errorsUrl: '/api/telemetry/errors', getHeaders: () => ({ authorization: `Bearer ${token}` }) },
});
```

`credentials` is `'same-origin'` by default and `'include'` is **never** implied.

## Attaching a logger you already have

```ts
initTelemetry({
  appName: 'my-app',
  logSource: {
    addSink: (sink) => myLogger.addSink(sink), // your logger's own subscription API
  },
});
```

`LogSink` is `{ name: string; write(record: LogRecord): void }`, and the detach function returned by
`addSink` is registered with the cleanup registry.

> **Source note.** `logSource` is for a logger **you** own. `initTelemetry` already registers its own
> sink, so pointing this at the library's `logger` would write every record twice. A `LogRecord` handed
> to a sink has **already** been sanitized.

## Rewriting or dropping a record

```ts
initTelemetry({
  appName: 'my-app',
  errors: {
    beforeCapture: (record) => {
      if (record.message.includes('ResizeObserver loop')) return null; // drop noise
      return { ...record, tags: { ...record.tags, reviewed: 'yes' } };
    },
  },
  logs: {
    beforeStore: (record) => (record.level === 'debug' ? null : record),
  },
});
```

A hook that throws is reported through `onInternalError` and **ignored**, so a bug in your filter cannot
stop the library recording everything else.

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

`consent` is evaluated before every capture, save and upload, and it **fails closed**: a gate that throws
stores nothing.

## Driving sync yourself

```ts
import { flushTelemetry, getTelemetryStatus, retryFailedTelemetry, syncTelemetry } from '@codewithrajat/rm-logvault';

await flushTelemetry();          // drain buffered records into the store, no upload
await syncTelemetry();           // flush, then upload everything pending
const requeued = await retryFailedTelemetry(); // move 'failed' rows back to 'pending'
getTelemetryStatus();            // synchronous; does not read IndexedDB
```

A component method is enough — no `@angular/forms`, no service:

```ts
public async sendNow(): Promise<void> {
  await syncTelemetry();
  this.status = getTelemetryStatus();
}
```

## Watching and teaching, rather than replacing

The seams above swap a part out. A second group lets you **observe** the pipeline, **teach** it about
error shapes only your application understands, and **choose where your requests go** — with nothing
replaced and nothing taken on:

| Seam | Gives you | Read |
| --- | --- | --- |
| `setupTelemetry` / flat aliases | The short form of the nested configuration. | [observing and extending](./04-observing-and-extending.md) |
| `handle.events` | Six events, so an Angular signal or your own store can react to a capture. | [observing and extending](./04-observing-and-extending.md) |
| `registerErrorContextBuilder` | Classification for errors the library cannot recognise. | [observing and extending](./04-observing-and-extending.md) |
| `getSinkRegistry()` | Listing, looking up and detaching logger sinks by key. | [observing and extending](./04-observing-and-extending.md) |
| `exportDiagnosticsReport` | Four formats — HTML, JSON, JSONL, CSV — with a progress callback. | [observing and extending](./04-observing-and-extending.md) |
| `createFetchHttpClient` | A client where one `onError` turns a failed request into a record. | [using the HTTP client](./05-using-the-http-client.md) |
| `createAuthHeaderProvider` | One token policy for your API calls **and** the telemetry upload. | [using the HTTP client](./05-using-the-http-client.md) |
| `createEncryptingRepository` | Encryption at rest for the fields you choose. | [encrypting stored records](./06-encrypting-stored-records.md) |

The distinction matters when you are deciding how much to take on: **observing costs nothing and can
never break a capture**, while **replacing is a guarantee you now own**. Prefer the first group unless
the default genuinely does not fit.

## Framework notes for Angular

- **The factory-provider reasoning is in [01-framework-adapter.md](./01-framework-adapter.md).**
- **`provideTelemetryErrorHandler()` is the default; a handler of your own is the escape hatch** — for
  per-error context, your own chaining, or a service that has to be injected.
  [01-framework-adapter.md](./01-framework-adapter.md#writing-your-own-errorhandler) has the two files
  and the two things you take on.
- **The repository and transport options are plain objects**, so they can come from an Angular service or
  an injection token if you prefer — `initTelemetry` takes values, not injectables.
- **Wrap the handle in an injection token for services.** `setupTelemetry` returns a `TelemetryHandle`;
  a token with a factory provider is what lets `TelemetryEventsService` inject it —
  [04-observing-and-extending.md](./04-observing-and-extending.md#making-initialisation-order-explicit).
- **Subscribe to events after `initTelemetry` runs.** `handle.events.on()` before initialisation is a
  no-op, not a buffer — so build the service from a provider, not from an `APP_INITIALIZER` that runs
  first.
- **The library's HTTP client is not Angular's `HttpClient`.** It has its own interceptors and never
  touches Angular's chain — [05-using-the-http-client.md](./05-using-the-http-client.md).
- **Encryption is bootstrap-time wiring**, because the provider is read once at initialisation —
  [06-encrypting-stored-records.md](./06-encrypting-stored-records.md).
- **Keep the provider installed** when you replace the store: the store is an `initTelemetry` option, the
  provider only routes Angular's `ErrorHandler` into the pipeline.
- **Reconfiguring means `destroyTelemetry()` first**, because `initTelemetry` is idempotent and a second
  call returns the existing handle.

## Next

- [Observing and extending](./04-observing-and-extending.md) — events as signals, context builders,
  named sinks, and the four report formats.
- [Using the HTTP client](./05-using-the-http-client.md) — the library's own client, and one auth
  provider feeding both it and the telemetry upload.
- [Encrypting stored records](./06-encrypting-stored-records.md) — AES-GCM at rest, and which fields are
  worth encrypting.
- [The recipes and choosing between them](./03-recipes-and-deciding.md) — the decision table across
  Angular's error paths, and how to assert each one in a test.
- The Angular adapter in depth: [01-framework-adapter.md](./01-framework-adapter.md).
- Every option, boundary and invalid-value rule:
  [docs/API.md](../../../docs/API.md#every-option-annotated).
- The same tier for another framework:
  [../../vue/more-advanced/README.md](../../vue/more-advanced/README.md),
  [../../nextjs/more-advanced/README.md](../../nextjs/more-advanced/README.md).
