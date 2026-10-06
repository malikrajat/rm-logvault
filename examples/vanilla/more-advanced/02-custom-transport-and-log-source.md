# Custom transport and logSource

**Problem it solves:** two ends of the pipeline that a real deployment sometimes owns — how a batch
leaves the browser, and where log records come from in the first place.

## `rest.transport` — replace the network, keep the retry policy

```ts
export interface RemoteTransport {
  readonly name?: string; // used in status output and internal diagnostics
  send(request: TransportRequest): Promise<TransportResponse>;
}
```

One method, and the request is fully prepared for you:

| Field | Type | Notes |
| --- | --- | --- |
| `url` | `string` | Absolute. Already resolved and validated. |
| `headers` | `Readonly<Record<string, string>>` | Already merged with your `getHeaders()` output. |
| `credentials` | `RequestCredentials` | Straight from `rest.credentials`. |
| `body` | `string` | **Already sanitized and already serialised.** |
| `timeoutMs` | `number` | The abort budget to honour. |
| `keepalive` | `boolean` | Whether this request may outlive the page. |
| `kind` | `RecordKind` | `'errors'` or `'logs'` — which store the body came from. |

Return a status, and optionally a `Retry-After` hint:

```ts
import type { RemoteTransport } from '@codewithrajat/rm-logvault';

const transport: RemoteTransport = {
  name: 'my-backend',
  async send(request) {
    const response = await fetch(request.url, {
      method: 'POST',
      headers: { ...request.headers, 'content-type': 'application/json' },
      body: request.body,
      credentials: request.credentials,
      signal: AbortSignal.timeout(request.timeoutMs),
      keepalive: request.keepalive,
    });
    return { status: response.status };
  },
};
```

Three things are worth knowing before you write one:

- **The body is already safe.** `request.body` has been sanitized and serialised, which is the whole
  reason a custom transport cannot accidentally persist raw data. Do not re-encode it from the records —
  you are not given the records.
- **You get the status classifications for free.** Returning `{ status: 401 }` marks the batch terminal;
  returning `{ status: 503 }` schedules a backoff retry. You do not reimplement retry policy.
- **Throwing means "retryable".** A transport that throws is signalling a network failure rather than a
  server verdict, and the batch goes back to `pending`.

```ts
initTelemetry({
  appName: 'my-app',
  rest: { transport, errorsUrl: 'https://collector.example/v1/errors' },
});
```

Supplying a transport **also activates sync**, which is what makes `mode` infer `'remote'`. If you want
the transport wired up but uploads off, set `mode: 'local'` or `rest.enabled: false` explicitly.

The full classification table — which statuses are terminal and what the backoff schedule is — is in
[the outbox](../advanced/01-the-outbox.md).

## `logSource` — feed records in from a logger you already own

```ts
import type { ExternalLogSource } from '@codewithrajat/rm-logvault';

let sink: LogSink | undefined;

const appLogger: ExternalLogSource = {
  addSink: (incoming) => {
    sink = incoming; // the library hands you its sink, once, at initialisation
    return () => {
      sink = undefined;
    };
  },
};

initTelemetry({ appName: 'my-app', logSource: appLogger });
```

The contract is one method. The library calls `addSink` with its sink at initialisation; from then on you
may hand it records your own logger produces:

```ts
sink?.write(record); // `record` must already be sanitized
```

The returned function is a **detach**, and it is optional — the library checks for a function and
registers it for teardown if you provide one.

> **Source note.** **The records must already be sanitized.** The library cannot re-sanitize a record it
> did not build, which is exactly why this is an advanced seam and not a one-liner. In a real integration
> your logger already constructs records from values it has scrubbed; hand those over. Building a
> `LogRecord` by hand and passing it in would be a way to store whatever you put in it.

This seam exists for the application that adopted structured logging before it adopted error tracking:
rather than migrating every call site to the library's `logger`, you bridge the sink and get persistence,
redaction-on-export and the diagnostics report for records you were already producing.

## Related

- [more-advanced](./README.md) — the other seams.
- [the outbox](../advanced/01-the-outbox.md) — statuses, backoff and leases.
- [docs/API.md](../../../docs/API.md#sync) — the transport and sync reference.
