# Using the HTTP client from React

**Problem it solves:** every application needs one place where an HTTP failure becomes a captured error.
Writing that interceptor against whatever client you happen to use means re-deriving status
classification, timeout detection and request metadata from scratch — in every project. This subpath is
that place, shipped once.

**What you will learn:**

- Creating one module-level client and wiring `onError` to `captureError`.
- Why `timeoutMs` is **per attempt**, and how `retry` interacts with it.
- Reading nothing at all from a response with `readAs: 'none'`.
- Interceptors, including one that cancels a request.
- Auth that feeds the client and the telemetry uploader from a single provider.

## One client, at module level

```ts
// src/http.ts
import { captureError } from '@codewithrajat/rm-logvault';
import { createFetchHttpClient } from '@codewithrajat/rm-logvault/http';

export const http = createFetchHttpClient({
  baseUrl: '/api',
  timeoutMs: 10_000,
  retry: 1,
  // Called with the failure BEFORE it is thrown, and the failure is a real Error
  // carrying an ErrorContext — so the two compose without a cast.
  onError: (error, context) => {
    captureError(error, context);
  },
});
```

```tsx
// anywhere
import { http } from './http';

const { data } = await http.get<Order[]>('/orders');
```

The client belongs at module scope for the same reason `initTelemetry` does: it is stateless
configuration, and creating it inside a component would rebuild it on every render.

| Option | Default | What it does |
| --- | --- | --- |
| `baseUrl` | none | prefix for relative request URLs |
| `timeoutMs` | `30000` | abort budget **per attempt** |
| `headers` | none | merged into every request, before the per-request ones |
| `getHeaders` | none | awaited per request, merged **last** |
| `bodyMode` | `'json'` | `'json'` / `'text'` / `'raw'` request encoding |
| `readAs` | `'auto'` | `'auto'` / `'json'` / `'text'` / `'arrayBuffer'` / `'blob'` / `'none'` |
| `credentials` | `'same-origin'` | `fetch` credentials mode |
| `retry` | `0` | extra attempts for a retryable failure |
| `retryDelayMs` | `300` | base backoff delay |
| `rejectOnHttpError` | `true` | reject on a non-2xx response |
| `onError` | none | observe the failure before it is thrown |
| `fetchImpl` | `globalThis.fetch` | the `fetch` to use |

## `timeoutMs` is per attempt, not per call

This is the detail that surprises people. Attempts are `1 + retry`, and each one gets its own
`timeoutMs` budget, so `retry: 2` with the default timeout can take about **90 seconds** before it
rejects:

```ts
const http = createFetchHttpClient({
  baseUrl: '/api',
  // Per attempt. Worst case here is 3 × 5s = 15s, not 5s.
  timeoutMs: 5_000,
  retry: 2,
});

// Or override it for one call, which also gets its own per-attempt budget.
await http.get('/slow-report', { timeoutMs: 60_000, retry: 0 });
```

Only statuses `0` (no response), `408`, `429` and every `5xx` are retried, with backoff
`min(300 * 2^(n-1), 30000)` milliseconds. A `404` will not succeed on retry, so it is not retried. A
**deterministic** failure — a throwing `getHeaders` provider, or a body that cannot be serialised — is
not retried either, because the same input raises the same throw.

> **Source note.** `retry` applies to failures that *reject*. With `rejectOnHttpError: false` a non-ok
> response **is** the result, so there is nothing to retry and `retry` is inert. Pick one: either you want
> failures thrown and retried, or you want responses handed back to inspect.

## Reading nothing from the response

`readAs: 'none'` never touches the body. Use it for a health check, a ping, or any call where only the
status matters, and you save the transfer and the parse:

```ts
const health = createFetchHttpClient({
  baseUrl: '/api',
  readAs: 'none', // the body is never read
  timeoutMs: 3_000,
  retry: 2,
});

const { status, ok } = await health.get('/healthz');
```

For a JSON API `'auto'` is right: it parses when the `Content-Type` says JSON and returns text otherwise.

## Interceptors

```ts
import { logger } from '@codewithrajat/rm-logvault';
import type { HttpInterceptor } from '@codewithrajat/rm-logvault/http';
import { http } from './http';

const correlation: HttpInterceptor = {
  name: 'correlation',

  onRequest: (request) => ({
    ...request,
    headers: { ...request.headers, 'x-request-id': crypto.randomUUID() },
  }),

  onResponse: (response, request) => {
    if (response.durationMs > 2_000) {
      logger.warn('[http] slow response', { url: request.url, ms: response.durationMs });
    }
    return response;
  },
};

http.setInterceptors([correlation]);
http.getInterceptors(); // [correlation]
```

Every interceptor callback is contained: a throwing `onRequest`, `onResponse` or `onError` is reported
through the library's internal diagnostics and does not break the request.

An `onRequest` that returns `null` **cancels** the call with an `HttpError` instead of sending it — useful
for a feature flag or an offline check:

```ts
const offlineGuard: HttpInterceptor = {
  name: 'offline-guard',
  onRequest: (request) => (navigator.onLine ? request : null),
};

http.setInterceptors([offlineGuard]);
```

## One auth provider, two consumers

The auth helpers exist so the HTTP client and the telemetry uploader share a single refresh policy.
Concurrent refreshes coalesce into one in-flight attempt, so ten parallel requests with an expired token
refresh **once**.

```ts
// src/auth.ts
import { createAuthHeaderProvider } from '@codewithrajat/rm-logvault/http';

export const auth = createAuthHeaderProvider({
  getToken: () => sessionStore.token,
  refreshToken: async () => (await refreshSession()).token,
  isTokenExpired: (token) => jwtExpiry(token) < Date.now(),
  onUnauthorized: () => {
    router.navigate('/login');
  },
});
```

```ts
// src/telemetry.ts
import { setupTelemetry } from '@codewithrajat/rm-logvault';
import { auth } from './auth';

setupTelemetry({
  app: 'checkout',
  url: '/telemetry',
  // `headers` is the flat alias for `rest.getHeaders`. The provider is awaited per
  // request, so a rotated token is picked up without re-initialising.
  headers: auth.getHeaders,
});
```

```ts
// src/http.ts
import { createAuthInterceptor, createFetchHttpClient } from '@codewithrajat/rm-logvault/http';
import { captureError } from '@codewithrajat/rm-logvault';
import { auth } from './auth';

export const http = createFetchHttpClient({
  baseUrl: '/api',
  onError: (error, context) => captureError(error, context),
});

// Attaches the token on every request and reacts to a 401.
http.setInterceptors([createAuthInterceptor(auth)]);
```

`createAuthInterceptor` attaches the token in `onRequest`, with the provider's headers merged **under** the
per-request ones. On a `401` its `onError` attempts **one** refresh and then calls `logout()` and
`onUnauthorized()` if that failed.

> **Source note.** The interceptor does **not** re-issue the request. The client owns its own retry policy,
> and a silent second request would double-report the original failure. Re-issue explicitly from your own
> code when you want that.

For an API key that is sent bare rather than as a bearer token, change the scheme:

```ts
const apiKeyAuth = createAuthHeaderProvider(
  { getToken: () => import.meta.env['VITE_API_KEY'] },
  { headerName: 'X-API-Key', scheme: '' }, // no 'Bearer ' prefix
);
```

> **Source note.** `onUnauthorized` is **not** called when there is simply no token — that is the normal
> anonymous path, and calling it there would nag on every request made before a user logs in. It **is**
> called when a present token was stale and could not be refreshed, which is a real loss of session.

## The failure is a real `Error`

`HttpError extends Error` with `name: 'HttpError'`, so `captureError(error, context)` records it as an
error with a proper name, message and stack rather than as an opaque object. The extra fields describe the
request without ever reading a body:

| Field | Meaning |
| --- | --- |
| `request` | the request that was issued |
| `response` | the response, when there was one |
| `isNetworkError` | the request never reached a server |
| `isTimeout` | the timeout budget expired |
| `isAbort` | a caller's `AbortSignal` aborted it |
| `statusCode` | `response.status`, or `0` with no response |
| `attempts` | attempts made, including the first |

> **Source note.** This subpath is the **one** public surface allowed to reject by design — an HTTP client
> that cannot report a failure is useless. It is walled off from the capture path: nothing in the core,
> error, storage, sync or export modules imports it, so the library's own never-throw guarantee is
> unaffected. The `onError` hook is how the two meet, and that is a deliberate one-way edge.

## Related

- [observing and extending](./04-observing-and-extending.md) — the events, context builders and sinks this
  client's errors flow into.
- [the seams](./02-repository-transport-and-hooks.md) — `rest.transport`, for a collector that is not plain
  REST.
- [advanced/01-export-and-manual-sync.md](../advanced/01-export-and-manual-sync.md) — `syncTelemetry()` and
  recovering from a terminal `401` on the upload path.
- [../../vanilla/more-advanced/03-recipes-and-deciding.md](../../vanilla/more-advanced/03-recipes-and-deciding.md)
  — where each capture path sits in the pipeline.
