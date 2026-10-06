# more-advanced — the server boundary

**Problem it solves:** in the App Router, a module that looks like it only runs in the browser also runs
on the server. You need to know exactly what the library does there — because "it is a no-op on the
server" is *not* quite true, and the difference changes where you are allowed to put the call.

**What you will learn:**

- What a server-side **import** does, and what a server-side **call** does.
- Why the pre-initialisation buffer is a *client* mechanism, and cannot carry records across the
  boundary.
- What is client-only, so you do not call it during a render.
- Which server-side failures are recorded and which are not.

## Importing is safe. Calling is not.

**Import:** every browser entry point is guarded, and the module does no work at import time. Importing
on the server is safe, and this is what lets a server component reference `logger` at all.

**Calling `initTelemetry` is different.** There is no early "no browser → do nothing" return: the
initialisation proceeds, the IndexedDB open fails against a missing `globalThis.indexedDB`, and that
installation ends up with `storage: 'unavailable'`.

> **Source note.** This corrects a claim that appears in older material: calling `initTelemetry` during
> SSR does **not** simply do nothing. It initialises an installation in the *server process*, where
> storage cannot open, so that installation reports `storage: 'unavailable'`, captures nothing to a
> store, and makes `getTelemetryStatus().initialized` return `true` in that process. It never throws
> (nothing in the public API does) and it cannot corrupt the browser's vault, because the server process
> and the browser are different module instances. It is still wasted, misleading work — which is why the
> call belongs behind `'use client'` in an effect, and not merely by convention.

```tsx
// app/providers.tsx — the only correct place for the call
'use client';

import { useEffect, type ReactElement, type ReactNode } from 'react';
import { destroyTelemetry, initTelemetry } from '@codewithrajat/rm-logvault';

export function Providers({ children }: { readonly children: ReactNode }): ReactElement {
  useEffect(() => {
    // An effect only runs in the browser, which is exactly the condition needed.
    initTelemetry({ appName: 'my-app' });

    return (): void => {
      destroyTelemetry();
    };
  }, []);

  return <>{children}</>;
}
```

## The pre-initialisation buffer is per runtime

The library buffers log calls and errors made **before** `initTelemetry` runs, and replays them into the
store when the first sink is registered. That mechanism is worth understanding precisely, because it is
often described as bridging the server and the client. It does not.

| Fact | Consequence |
| --- | --- |
| The buffer is created per logger instance, in the runtime that created it. | A server-side buffer lives in the server process. |
| There is no hydration or serialisation channel for it. | Nothing it holds can reach the browser's vault. |
| `replayPreInit()` re-emits into the **same** runtime's sinks. | A client-side pre-init call is replayed into the client's store. |
| The log buffer holds at most `PRE_INIT_LOG_BUFFER_SIZE` (`50`) calls. | Beyond that, the call is **not** buffered, so it is not replayed — and it still goes through the normal console check, which drops it too if it is below the console level. Errors use their own buffer, also `50` (`PRE_INIT_ERROR_BUFFER_SIZE`). |

So, concretely:

- A **client** `logger.info(...)` that runs before the provider's effect is buffered and then stored, with
  its original level and message. This is the case the buffer exists for.
- A **server** `logger.info(...)` in a server component prints on the server (through the guarded console
  writer) and its buffered entry is discarded with that process. It is genuinely harmless — but it does
  not appear in the browser's vault, and a report will not contain it.

```tsx
// app/layout.tsx — a server component
import { logger } from '@codewithrajat/rm-logvault';

// Safe: the import is guarded and this only reaches the SERVER console. It will not
// appear in the browser vault — see the table above.
logger.info('[checkout] layout rendered on the server');
```

## What is client-only

| Safe on the server | Client-only |
| --- | --- |
| Importing any entry point | `initTelemetry`, `destroyTelemetry` |
| `logger.*` (server console only; not stored) | `getTelemetryStatus`, `flushTelemetry` |
| `captureError` (buffered per runtime, not stored) | `syncTelemetry`, `retryFailedTelemetry`, `clearTelemetryData` |
| `resolveOptions`, `DEFAULT_OPTIONS`, the type surface | `exportDiagnosticsReport` (reads IndexedDB, writes a Blob) |
| | Any `repository`, `rest.transport`, `logSource` or hook you build |

A shared component that calls any of the right-hand column needs `'use client'`. A function cannot cross
the boundary either, which is why `repository`, `transport`, `logSource`, `getHeaders`, `beforeCapture`
and `beforeStore` must be constructed on the client — see [README.md](./README.md).

Two newer additions to the client-only list are worth calling out, because both look importable from
anywhere:

- **`handle.events` subscriptions.** `on()` and `onAny()` are no-ops while telemetry is not initialized,
  and a server process has no browser emitter at all — so a Server Component cannot subscribe. See
  [04-observing-and-extending.md](./04-observing-and-extending.md).
- **`createFetchHttpClient` and `createEncryptingRepository`.** The first is `fetch` plus
  `AbortController`; the second needs IndexedDB, and its AES provider needs `crypto.subtle`. See
  [05-using-the-http-client.md](./05-using-the-http-client.md) and
  [06-encrypting-stored-records.md](./06-encrypting-stored-records.md).

## The failure that is not captured

**An error thrown during a server render is not recorded.** There is no browser, no IndexedDB and no
client vault at that moment, so there is nowhere for it to go. Next's own error overlay in development
and your server logs in production are the right tools for it. If you need those failures centrally, log
them on the server to your server-side observability stack rather than trying to route them through this
library.

## Why the cleanup matters here more than elsewhere

React StrictMode runs effects twice in development, and Fast Refresh re-runs them after every edit.
`initTelemetry` is idempotent, so without a cleanup you would not see duplicate records — you would see
the *second* call return the existing handle and **silently ignore its options**, which is a far more
confusing bug. Returning `destroyTelemetry` removes the ambiguity.

## Configuring it

Only `NEXT_PUBLIC_`-prefixed variables reach the client bundle, and the environment layer has to be
applied where the call is — on the client. The prefix rule, every variable name with its unit and
default, is in [../config/01-environment-variables.md](../config/01-environment-variables.md).

## Next

- Back to the power surface: [README.md](./README.md).
- Configuring across environments: [../config/README.md](../config/README.md).
- The exhaustive option reference: [docs/API.md](../../../docs/API.md#every-option-annotated).
