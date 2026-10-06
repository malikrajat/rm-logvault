# Using the HTTP client, and wiring auth into it

**Problem it solves:** you want one interception point where a failed request becomes a captured error
with request context attached — method, URL, status, duration — instead of writing that interceptor
against whatever client you happen to use, and re-deriving status classification every time. And you
want the token used for telemetry uploads to come from the same place as the token used for the rest of
your API calls.

**What you will learn:**

- `createFetchHttpClient` from `@codewithrajat/rm-logvault/http`, configured once at module level.
- Turning a failure into a record with `onError: (error, context) => captureError(error, context)`.
- Why `timeoutMs` is **per attempt**, and how `retry` interacts with `rejectOnHttpError`.
- `readAs: 'none'` when you only care about the status.
- An interceptor, and how `null` from `onRequest` cancels a request.
- `createAuthHeaderProvider` feeding **both** the client and `initTelemetry`, plus
  `createAuthInterceptor`.
- The difference from Next's own `fetch` patching.

> **This whole subpath is client-side.** It is `fetch` plus `AbortController`; a Server Component or a
> Route Handler must not import it for browser capture. See
> [01-framework-adapter.md](./01-framework-adapter.md).

## One client, created once, in a client module

```ts
// app/http.ts — a client module. Imported by client components, never by a route handler.
'use client';

import { createFetchHttpClient } from '@codewithrajat/rm-logvault/http';
import { captureError } from '@codewithrajat/rm-logvault';

export const http = createFetchHttpClient({
  baseUrl: '/api',
  timeoutMs: 10_000,
  retry: 1,
  // The failure is a real `Error` and `context` is already an `ErrorContext`, so the
  // two compose without a cast. This is the whole interception point.
  onError: (error, context) => captureError(error, context),
});
```

Then, from a client component:

```tsx
'use client';

import type { ReactElement } from 'react';
import { useEffect, useState } from 'react';
import { http } from './http';

interface Order {
  readonly id: string;
  readonly total: number;
}

export function Orders(): ReactElement {
  const [orders, setOrders] = useState<readonly Order[]>([]);

  useEffect(() => {
    async function load(): Promise<void> {
      try {
        const response = await http.get<readonly Order[]>('/orders');
        setOrders(response.data);
      } catch (error) {
        // Already captured by `onError`. Swallow it so React does not see a
        // rejected promise from an effect.
      }
    }

    void load();
  }, []);

  return <ul>{orders.map((order) => <li key={order.id}>{order.total}</li>)}</ul>;
}
```

> **Source note.** This is the **one public surface in the package allowed to reject.** A method returns
> a rejection on a failed request, and it is always an `HttpError` — unlike the telemetry API, where
> every exported function is contractually forbidden from throwing (I-1). It can make that exception
> because nothing in core, errors, storage, sync or export imports it. The rejection is deliberate: an
> HTTP client that cannot report a failure is not an HTTP client.

## Options, with their real defaults

| Option | Type | Default | What it means |
| --- | --- | --- | --- |
| `baseUrl` | `string` | none | Prefix for relative URLs. An absolute URL ignores it. |
| `timeoutMs` | `number` | `30000` | Abort budget **per attempt** — see below. |
| `headers` | `Record<string, string>` | none | Merged into every request, before the per-request ones. |
| `getHeaders` | `() => Record<string,string> \| Promise<…>` | none | Awaited per request, merged **last**. |
| `bodyMode` | `'json' \| 'text' \| 'raw'` | `'json'` | How the body is serialised, and which `Content-Type` is added. |
| `readAs` | `'auto' \| 'json' \| 'text' \| 'arrayBuffer' \| 'blob' \| 'none'` | `'auto'` | How the response is decoded. `'none'` **never reads the body**. |
| `credentials` | `RequestCredentials` | `'same-origin'` | Never implicitly `'include'`. |
| `retry` | `number` | `0` | Extra attempts. Attempts total `1 + retry`. |
| `retryDelayMs` | `number` | `300` | Backoff base; `min(300 × 2^(n-1), 30000)`. |
| `rejectOnHttpError` | `boolean` | `true` | Whether a non-2xx becomes a rejection. |
| `onError` | `(error: HttpError, context: ErrorContext) => void` | none | Called **before** the rejection. |
| `fetchImpl` | `typeof fetch` | `globalThis.fetch` | Resolved per request. |

### `timeoutMs` is per attempt

```ts
const http = createFetchHttpClient({ timeoutMs: 10_000, retry: 2 });
// Worst case: 3 attempts × 10 s = 30 s before this rejects, plus backoff delays.
```

If 30 seconds is too long for your UI, lower `timeoutMs` — that is the number that governs it, not a
separate total budget. Retrying is **off** by default, so most apps only pay one attempt.

Only `0` (no response), `408`, `429` and every `5xx` are retried. A `4xx` other than those will not
succeed on retry, so it is surfaced immediately rather than multiplied.

> **Source note.** A **deterministic** failure is not retried. A throwing `getHeaders` provider and a
> body that cannot be serialised produce the same throw on every attempt, so they carry
> `isRetryable: false` and are surfaced at once. Separately, when `rejectOnHttpError: false` a non-ok
> response **is** the result — nothing throws, so `retry` does not apply to it.

### `readAs: 'none'` when you only want the status

A fire-and-forget call, or a health check, does not need the body — and not reading it is the honest
choice:

```ts
const beacon = createFetchHttpClient({
  baseUrl: '/api',
  readAs: 'none', // the response body is never consumed
  retry: 3,       // a beacon is exactly the case where retrying is worth it
});

await beacon.post('/events/heartbeat', { at: Date.now() });
```

### Reading a non-ok response instead of catching it

```ts
const lenient = createFetchHttpClient({
  baseUrl: '/api',
  rejectOnHttpError: false,
});

const response = await lenient.get<{ message: string }>('/maybe-missing');
if (!response.ok) {
  // `response.data` holds the decoded body; `response.status` the code.
  console.warn(response.status, response.data.message);
}
```

## `HttpError`, and what to do with it

`HttpError extends Error` with `name: 'HttpError'`, so `captureError` records it as an error rather than
an opaque object. It carries:

| Member | Meaning |
| --- | --- |
| `request` | The request that was issued. |
| `response` | Present for a non-2xx response; absent for a network failure or timeout. |
| `statusCode` | `response.status`, or `0` when there was no response. |
| `isNetworkError` | The request never reached a server. |
| `isTimeout` | The timeout budget expired. |
| `isAbort` | Something other than the timeout aborted the request. |
| `attempts` | Attempts made, including the first. |

```ts
import { http } from './http';
import type { HttpError } from '@codewithrajat/rm-logvault/http';

try {
  await http.get('/orders');
} catch (error) {
  const failure = error as HttpError;
  if (failure.isTimeout) showRetryPrompt();
  else if (failure.statusCode === 401) redirectToLogin();
  // `failure.attempts` tells you how hard it tried.
}
```

## Interceptors

An interceptor is a small object with up to three optional hooks. One place, no monkey-patching:

```ts
// app/http.ts
'use client';

import type { HttpInterceptor } from '@codewithrajat/rm-logvault/http';
import { logger } from '@codewithrajat/rm-logvault';

const timing: HttpInterceptor = {
  name: 'timing',
  onRequest: (request) => ({
    ...request,
    headers: { ...request.headers, 'x-client-timestamp': String(Date.now()) },
  }),
  onResponse: (response) => {
    logger.debug(`[http] ${String(response.status)} in ${String(response.durationMs)}ms`);
    return response;
  },
  onError: async (error) => {
    logger.warn(`[http] failed after ${String(error.attempts)} attempt(s)`);
  },
};

http.setInterceptors([timing]);
http.getInterceptors(); // readonly HttpInterceptor[]
```

| Hook | Receives | Returns |
| --- | --- | --- |
| `onRequest` | the request | the request to send, a promise of one, or **`null` to cancel** |
| `onResponse` | `(response, request)` | a response, or a promise of one |
| `onError` | the `HttpError` | nothing; the original error is still thrown |

Returning `null` from `onRequest` cancels the call with an `HttpError` instead of sending it — the
usual shape for a client-side guard:

```ts
const offlineGuard: HttpInterceptor = {
  name: 'offline-guard',
  onRequest: (request) =>
    navigator.onLine ? request : null, // cancels; resolves as a rejected HttpError
};
```

> **Source note.** Every interceptor callback is contained. A throwing `onRequest` surfaces as a
> wrapped `HttpError` rather than an arbitrary value, and a throwing `onResponse` or `onError` is
> reported through internal diagnostics and ignored — it never changes the outcome of the request.

## Auth: one provider, two consumers

`createAuthHeaderProvider` is `() => headers` with the refresh policy built in. Its real value is that
the **same** provider can feed both your HTTP client and the telemetry uploader, so a token rotation
happens once rather than in two places.

```ts
// app/auth.ts — a client module
'use client';

import { createAuthHeaderProvider } from '@codewithrajat/rm-logvault/http';

export const session = {
  getToken: () => sessionStorage.getItem('token') ?? undefined,
  refreshToken: async (): Promise<string | undefined> => {
    const response = await fetch('/auth/refresh', { method: 'POST' });
    if (!response.ok) return undefined;
    const next = (await response.json()) as { token: string };
    sessionStorage.setItem('token', next.token);
    return next.token;
  },
  isTokenExpired: (token: string): boolean => jwtExpiry(token) < Date.now(),
  onUnauthorized: (): void => {
    // Nothing left to refresh: send the user to sign in.
    window.location.assign('/login');
  },
  logout: (): void => sessionStorage.removeItem('token'),
};

export const auth = createAuthHeaderProvider(session, {
  // headerName defaults to 'Authorization'; scheme defaults to 'Bearer '.
  // For a bare API key instead: { headerName: 'X-API-Key', scheme: '' }
});
```

The object passed as the first argument is structurally an `AuthProvider`, so it needs no annotation.
`createAuthHeaderProvider` does not read `sessionStorage` itself — that is your code, which is the point:
the library never touches storage on your behalf.

Now hand the **same** function to telemetry through the flat `headers` alias, and to the client:

```ts
// app/providers.tsx
'use client';

import { useEffect } from 'react';
import { destroyTelemetry, setupTelemetry } from '@codewithrajat/rm-logvault';
import { auth } from './auth';
import { http } from './http';

useEffect(() => {
  setupTelemetry({
    app: 'checkout',
    url: '/api/telemetry',
    headers: auth.getHeaders,   // the flat alias for rest.getHeaders
  });
  // `null` when no token: the request still goes out and the server's 401 is the
  // single visible failure, rather than a header silently dropped.
  return () => destroyTelemetry();
}, []);
```

> **Source note.** `createAuthHeaderProvider` **never rejects** — unlike the HTTP client it feeds. A
> throwing `getToken`, `isTokenExpired` or `getExtraHeaders` is contained and reported. That matters for
> the telemetry side specifically: `rest.getHeaders` treats a *throwing* provider as a **retryable sync
> failure**, which would turn an expired session into an upload backlog instead of one clear `401`.

> **Source note.** `onUnauthorized` is **not** called when there is simply no token. That is the normal
> anonymous path, and reporting it would nag on every request made before a user logs in. It **is**
> called when a token was present, was stale, and could not be refreshed.

### The interceptor variant

`createAuthInterceptor` wraps the same provider as an `HttpInterceptor`. Use it when you want the token
and the `401` reaction applied by the client itself:

```ts
// app/http.ts
'use client';

import { createAuthInterceptor } from '@codewithrajat/rm-logvault/http';
import { session } from './auth';

http.setInterceptors([createAuthInterceptor(session)]);
```

- `onRequest` merges the provider's headers **under** the per-request ones, so a per-request
  `Authorization` still wins.
- `onError` on a `401` makes **one** refresh attempt, then calls `logout()` and `onUnauthorized()` if it
  failed.
- It does **not** re-issue the request. The client owns its retry policy, and a silent second request
  would double-report the original failure — re-issue explicitly when you want that.

## How this differs from Next's own `fetch`

This matters, because Next patches `fetch` and you should not confuse the two:

| | Next's patched `fetch` | `createFetchHttpClient` |
| --- | --- | --- |
| What it is | The global `fetch`, extended with caching and revalidation | A **separate wrapper**, its own functions |
| `next: { revalidate }` | Yes — Route Handler and server-fetch semantics | **No.** This is not Next's fetch. |
| Interceptors | None | `setInterceptors([...])` |
| Automatic error capture | None | `onError` → `captureError` |
| Retry and backoff | None built in | `retry`, `retryDelayMs`, status classification |
| Timeout | Caller-supplied `AbortSignal` | `timeoutMs`, per attempt |
| Where it belongs | Server and client | **Client only** |

They coexist without interfering: the client calls the global `fetch`, so a request through it still
obeys whatever the platform does with `fetch`. What it does **not** get is Next's caching layer — so do
not reach for this client expecting `next: { revalidate: 60 }` to mean anything.

The reverse direction is worth knowing too: the library's `@codewithrajat/rm-logvault/fetch` subpath
*instruments* the global `fetch` so existing calls are captured. That is a different thing from this
client, and it is not Next-specific.

> **Source note.** The telemetry uploader uses neither of these. Its transport is the platform `fetch`
> directly (`rest.transport`), deliberately — routing uploads through an application HTTP client would
> re-enter the interceptor that captures errors, so a failing upload would generate more errors to
> upload. `createFetchHttpClient` is for **your application's** requests.

## Related

- The server boundary, and why a route handler must not import this: [01-framework-adapter.md](./01-framework-adapter.md).
- The upload path this sits beside (`rest.transport`, `rest.getHeaders`): [README.md](./README.md).
- Observing what was captured: [04-observing-and-extending.md](./04-observing-and-extending.md).
- Every export with its signature: [docs/API.md](../../../docs/API.md#codewithrajatrm-logvaulthttp).
