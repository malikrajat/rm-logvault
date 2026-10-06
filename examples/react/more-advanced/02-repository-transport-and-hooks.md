# Repository, transport and hooks in a React app

**Problem it solves:** the seams are framework-agnostic, but *where the code lives* is not. An option
passed to `initTelemetry` belongs in a module; a value that changes over time belongs in React state.
Getting that wrong produces a hook that is recreated on every render and never applies.

**What you will learn:**

- Where each seam belongs in a React codebase, and why.
- Surfacing `onInternalError` in the UI without polling.
- A custom `repository` for tests, and when it is worth customising the cleanup cadence.
- A custom `rest.transport` for a backend that is not plain REST.

## Where each seam lives

| Seam | Where it goes | Why |
| --- | --- | --- |
| `onInternalError` | The module that calls `initTelemetry`, forwarding into a small store | It is a subscription that must exist before the first capture. |
| `beforeCapture` / `beforeStore` | The same module | Policy is fixed at initialisation and cannot be added later. |
| `rest.transport` | The same module, or a dedicated module imported by it | Stateless; a token is fetched per request by `getHeaders`, not captured. |
| `repository` | The same module, or a test helper | Deciding where data lives is an initialisation decision. |

The one thing you cannot do is add any of these after `initTelemetry` has run. Initialisation is
idempotent — a second call returns the existing handle and installs nothing — so changing configuration
at runtime means `destroyTelemetry()` and then initialising again. That is a deliberate teardown, not a
reconfiguration API, and it is worth designing around rather than fighting.

## Surfacing `onInternalError` in the UI

The library's own failures — storage never opened, a record dropped for exceeding its budget — are
invisible to users and easy to miss in development. A module-level store plus `useSyncExternalStore`
makes them visible without polling:

```ts
// src/telemetry-health.ts — module level, imported by your entry file
let healthy = true;
const listeners = new Set<() => void>();

export function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function getSnapshot(): boolean {
  return healthy;
}

export function markUnhealthy(): void {
  healthy = false;
  for (const listener of listeners) {
    listener();
  }
}
```

```ts
// src/main.tsx
import { initTelemetry } from '@codewithrajat/rm-logvault';
import { markUnhealthy } from './telemetry-health';

initTelemetry({
  appName: 'my-app',
  onInternalError: (stage, error) => {
    // Once per stage per initialisation, so this cannot flood.
    report(stage, error);
    markUnhealthy();
  },
});
```

```tsx
// any leaf component
import { useSyncExternalStore } from 'react';
import { getSnapshot, subscribe } from './telemetry-health';

export function TelemetryHealthBanner() {
  const healthy = useSyncExternalStore(subscribe, getSnapshot);
  if (healthy) return null;
  return <p role="status">Diagnostics are degraded — see the console for details.</p>;
}
```

`useSyncExternalStore` is the React 18+ API for exactly this: subscribing to a value that lives outside
React, without tearing. Polling `getTelemetryStatus()` on a timer also works and is cheaper to write, but
it cannot tell you a failure happened between two polls.

## A custom repository

Two reasons, and only two:

1. **Tests.** `createMemoryRepository()` from `@codewithrajat/rm-logvault/testing` — see
   [the adapter and testing](./01-the-react-adapter-and-testing.md).
2. **A different cleanup cadence.** `createErrorRepository` / `createLogRepository` accept
   `cleanupEveryWrites`, which has no option equivalent.

The full contract, the both-failed readiness gate, and what you become responsible for are written out
in [../../vanilla/more-advanced/01-custom-repository.md](../../vanilla/more-advanced/01-custom-repository.md).
The short version:

```ts
export interface TelemetryRepository {
  readonly errors: ErrorRepository;
  readonly logs: LogRepository;
  initialize(): Promise<StorageResult<void>>; // resolve false-ish only if BOTH are unusable
  close(): void;
}
```

> **Source note.** `initialize()` and `close()` are **required**. A hand-built object with only
> `{ errors, logs }` will not typecheck, and nothing would be written if it did — uploads and the report
> both wait on the readiness gate.

If you only want the in-memory repository, you never touch this interface: `createMemoryRepository()`
already satisfies it.

## A custom transport

Worth it when your collector is not a plain REST endpoint — an OTLP gateway, a Sentry envelope, a
`sendBeacon`-based endpoint. The request arrives already sanitized and already serialised, so a custom
transport cannot leak raw data, and status classification plus backoff remain the library's:

```ts
import type { RemoteTransport } from '@codewithrajat/rm-logvault';

const transport: RemoteTransport = {
  name: 'otlp-gateway',
  async send(request) {
    const response = await fetch(request.url, {
      method: 'POST',
      headers: { ...request.headers, 'content-type': 'application/json' },
      body: request.body,
      credentials: request.credentials,
      keepalive: request.keepalive,
      signal: AbortSignal.timeout(request.timeoutMs),
    });
    return { status: response.status };
  },
};
```

Supplying a transport **also activates sync**, which is what makes `mode` infer `'remote'`. Without an
`errorsUrl` or `logsUrl` the transport is never called, so give it an endpoint. The full request and
response field reference is in
[../../vanilla/more-advanced/02-custom-transport-and-log-source.md](../../vanilla/more-advanced/02-custom-transport-and-log-source.md).

## `beforeCapture` / `beforeStore`

Plain options, so they live in the module that initialises — not in a component. This is application
policy, and the most common uses are dropping known noise and stamping a tenant:

```ts
initTelemetry({
  appName: 'my-app',
  errors: {
    beforeCapture: (record) =>
      record.message.includes('ResizeObserver loop') ? null : record,
  },
});
```

Return `null` to drop, or the record (modified or not) to store it. A hook that throws is reported
through `onInternalError` and then ignored, so the original record is stored — capture is never lost to a
broken policy hook. Details:
[../../vanilla/more-advanced/03-lifecycle-hooks-and-automation.md](../../vanilla/more-advanced/03-lifecycle-hooks-and-automation.md).

## Related

- [more-advanced](./README.md) — the adapter and the seams, indexed.
- [advanced/01-export-and-manual-sync.md](../advanced/01-export-and-manual-sync.md) — the calls these
  seams sit under.
