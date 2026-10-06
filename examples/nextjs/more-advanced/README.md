# more-advanced — Next.js App Router

**Problem it solves:** "IndexedDB plus `fetch`" is not the shape of your deployment. You need a different
store, a transport that goes through your own HTTP client, your existing logger's records in the same
vault, or the ability to rewrite a record before it is stored.

**What you will learn:**

- The full `TelemetryRepository` contract, and how to replace the store.
- A custom `rest.transport` — and the lighter `rest.getHeaders` alternative.
- Attaching a logger you already have, with `logSource`.
- `beforeCapture` / `beforeStore`: rewrite a record or drop it.
- `onInternalError` and `consent`: observing and gating the library itself.
- Driving sync yourself instead of waiting for the interval.
- `setupTelemetry` and the flat aliases, plus the observation surface: `handle.events`,
  `registerErrorContextBuilder`, the sink registry and the JSONL/CSV export formats.
- The `/http` subpath — a fetch client with interceptors and auth — and the `/storage` subpath's
  encryption adapters.

> **Everything in this tier is client-side.** The store, the transport and the hooks only exist where
> IndexedDB and `fetch` do, so every snippet here belongs in a `'use client'` module or the provider
> effect — see [basic](../basic/README.md).

## The pages in this tier

| Page | What it covers |
| --- | --- |
| [The server boundary](./01-framework-adapter.md) | What a server **import** does versus a server **call**, the per-runtime pre-init buffer, what is client-only, and the failure that is not captured. |
| [The recipes and choosing](./03-recipes-and-deciding.md) | The decision table across the client's error paths, what the server boundary means for each, and how to assert it in a test. |
| [Observing and extending](./04-observing-and-extending.md) | `setupTelemetry` and the flat aliases, `handle.events` in a client component, context builders, the sink registry, and exporting JSONL/CSV from a button. |
| [Using the HTTP client](./05-using-the-http-client.md) | `createFetchHttpClient` with `onError` wired to `captureError`, interceptors, retry and timeout semantics, and an auth provider feeding both the client and telemetry. |
| [Encrypting stored records](./06-encrypting-stored-records.md) | Base64 versus AES-GCM, the `crypto.subtle` fallback, wrapping one repository at a time, and assembling `TelemetryRepository` by hand. |

The two seams, grouped by what they cost you:

| | Replace a part | Observe and extend |
| --- | --- | --- |
| Pages | [01](./01-framework-adapter.md), this README | [04](./04-observing-and-extending.md) |
| You take on | The database names, the readiness gate, or the request itself | Nothing — observing cannot break a capture |
| Reach for it when | The default genuinely does not fit your deployment | You want a count, a custom classification, or a different export format |

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
> reports `'unavailable'` only when *both* the error and the log database failed.

```tsx
// app/providers.tsx
'use client';

import { useEffect } from 'react';
import { destroyTelemetry, initTelemetry } from '@codewithrajat/rm-logvault';
import { createMemoryRepository } from '@codewithrajat/rm-logvault/testing';

useEffect(() => {
  initTelemetry({ appName: 'my-app', repository: createMemoryRepository() });
  return () => destroyTelemetry();
}, []);
```

A hand-rolled pair is possible — `createErrorRepository` and `createLogRepository` are public — but then
the database names and cleanup policies are yours to keep in step with `dbPrefix` and `errors.*`.
`createErrorRepository({ dbName, cleanupPolicy, cleanupEveryWrites })` is also the supported way to
change the **cleanup cadence**, which is deliberately not an option.

[06-encrypting-stored-records.md](./06-encrypting-stored-records.md) is the fully worked example of this:
it wraps each repository in an encrypting adapter and assembles the four-member object by hand, including
the readiness gate.

> **A server-side import cannot touch the store.** A repository imported in a server component would be a
> different module instance with no IndexedDB behind it. Keep this configuration client-side.

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
// app/providers.tsx
'use client';

const transport: RemoteTransport = {
  name: 'my-http-client',
  async send(request: TransportRequest): Promise<TransportResponse> {
    // `request.body` is already the exact JSON to send; do not rebuild it.
    const response = await fetch(request.url, {
      method: 'POST',
      headers: request.headers,
      credentials: request.credentials,
      body: request.body,
      keepalive: request.keepalive,
      signal: AbortSignal.timeout(request.timeoutMs),
    });

    return { status: response.status };
  },
};
```

Supplying a transport also activates sync. A transport that **throws** is treated as retryable, not
permanent.

If you only need a header, reach for `rest.getHeaders` first — awaited per request, and a throwing
provider is retryable:

```ts
initTelemetry({
  appName: 'my-app',
  rest: {
    errorsUrl: '/api/telemetry/errors',
    getHeaders: async () => ({ authorization: `Bearer ${await getToken()}` }),
    onTerminalFailure: (status) => {
      if (status === 401) void refreshToken().then(() => retryFailedTelemetry());
    },
  },
});
```

> **Prefer a relative URL.** `/api/telemetry/errors` resolves against your own origin, so the upload goes
> through a **route handler** in the same app — which is where you attach a server-side token and forward
> to the real collector, keeping credentials out of the browser entirely.

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
`addSink` is registered with the cleanup registry. A logger constructed during SSR has no browser store
behind it, so attach a client-side one.

> **Source note.** `logSource` is for a logger **you** own. `initTelemetry` already registers its own
> sink, so pointing this at the library's `logger` would write every record twice. A `LogRecord` handed to
> a sink has **already** been sanitized.

## Rewriting or dropping a record

```ts
initTelemetry({
  appName: 'my-app',
  errors: {
    beforeCapture: (record) => {
      if (record.message.includes('ResizeObserver loop')) return null; // drop noise
      return { ...record, tags: { ...record.tags, route: window.location.pathname } };
    },
  },
  logs: {
    beforeStore: (record) => (record.level === 'debug' ? null : record),
  },
});
```

A hook that throws is reported through `onInternalError` and **ignored**.

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
stores nothing. A client-only consent store is the natural fit.

## Driving sync yourself

```ts
import { flushTelemetry, getTelemetryStatus, retryFailedTelemetry, syncTelemetry } from '@codewithrajat/rm-logvault';

await flushTelemetry();          // drain buffered records into the store, no upload
await syncTelemetry();           // flush, then upload everything pending
const requeued = await retryFailedTelemetry(); // move 'failed' rows back to 'pending'
getTelemetryStatus();            // synchronous; does not read IndexedDB
```

```tsx
'use client';

useEffect(() => {
  const onOnline = (): void => void syncTelemetry();
  window.addEventListener('online', onOnline);
  return () => window.removeEventListener('online', onOnline);
}, []);
```

## Framework notes for Next.js

- **The SSR boundary's guarantees are in [01-framework-adapter.md](./01-framework-adapter.md)** —
  including what a server import really does and why nothing is lost.
- **Serialisation is a real constraint.** `repository`, `transport`, `logSource`, `getHeaders`,
  `beforeCapture` and `beforeStore` are all functions or live objects, so none of them can cross from a
  server component into a client one. Build them on the client.
- **A route handler is the natural collector.** A relative `errorsUrl` is what lets you keep tokens
  server-side.
- **`rest.intervalMs` is a browser concern.** Sync does not run during SSR, so the interval only matters
  in the tab.
- **A Server Component cannot subscribe to events.** There is no browser emitter in the server process,
  and the subscription would target a different runtime — see
  [04-observing-and-extending.md](./04-observing-and-extending.md).
- **The `/http` subpath is separate from Next's patched `fetch`.** No `next: { revalidate }`, but it does
  bring interceptors, retry and one error-capture point. See
  [05-using-the-http-client.md](./05-using-the-http-client.md).
- **Encryption at rest needs `crypto.subtle`, so it needs a secure context.** A plain `http:` deployment
  gets `undefined` back, and the documented fallback is to record unencrypted — see
  [06-encrypting-stored-records.md](./06-encrypting-stored-records.md).

## Next

- [The recipes and choosing between them](./03-recipes-and-deciding.md) — the decision table across the
  client's error paths, what the server boundary means for each, and how to assert it in a test.
- The Next.js adapter and server boundary in depth: [01-framework-adapter.md](./01-framework-adapter.md).
- Watching what was captured: [04-observing-and-extending.md](./04-observing-and-extending.md).
- Every option, boundary and invalid-value rule:
  [docs/API.md](../../../docs/API.md#every-option-annotated).
- The same tier for another framework:
  [../../vue/more-advanced/README.md](../../vue/more-advanced/README.md),
  [../../angular/more-advanced/README.md](../../angular/more-advanced/README.md).
