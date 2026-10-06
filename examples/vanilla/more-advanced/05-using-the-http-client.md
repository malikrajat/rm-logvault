# Calling an API: the HTTP client

**Problem it solves:** every application already makes HTTP calls, and every team ends up writing the
same interceptor — read the status, guess whether it is a timeout or a network drop, pull the method and
URL off the request so the record is useful, and attach it to error tracking. Doing that by hand is where
`api.status` ends up missing on half your records.

`@codewithrajat/rm-logvault/http` is a small client that does that part once. The failure it produces is a
real `Error` carrying the request metadata the library already knows how to classify, so
`captureError(error, context)` composes without a cast.

**What you will learn:**

- Why this is a separate import, and what it does **not** replace.
- Creating one client, and wiring `onError` so a failed request becomes a record.
- The one trap in the whole page: `timeoutMs` is **per attempt**.
- Which failures are retried, and which are deliberately not.
- Skipping the response body entirely with `readAs: 'none'`.
- Interceptors, and how `null` cancels a request.
- The auth flow, shared between this client and the telemetry uploader.

## What this is, and is not

| It is | It is not |
| --- | --- |
| A `fetch` wrapper that classifies failures and builds an `ErrorContext`. | A replacement for `fetch`, axios or your own client. |
| The **one** public surface in this package allowed to reject. | Part of the capture pipeline — nothing in `core/`, `errors/`, `storage/`, `sync/` or `export/` imports it. |
| A client you can use for your own application calls. | The library's upload path. `rest.transport` stays the library's own `fetch` transport. |

That second row is why the never-throw guarantee elsewhere is unaffected: an HTTP client that cannot
report a failure is useless, so this module is walled off from the error path rather than pretending
otherwise. It lives on its own subpath so an application using axios pays nothing for it.

> **Source note.** The library's own telemetry uploads never go through this client. Routing them through
> an application interceptor would re-enter the interceptor that captures errors, so a failing upload
> would generate more errors to upload. If you want a custom upload path, that is `rest.transport`.

## One client, wired to capture

```ts
// src/http.ts — module level, created once
import { createFetchHttpClient } from '@codewithrajat/rm-logvault/http';
import { captureError } from '@codewithrajat/rm-logvault';

export const http = createFetchHttpClient({
  baseUrl: '/api',
  timeoutMs: 10_000,
  retry: 1,
  onError: (error, context) => {
    // `error` is a real Error and `context` is already an ErrorContext, so this is
    // the whole integration. No cast, no manual status extraction.
    captureError(error, context);
  },
});
```

Then use it exactly as you would expect:

```ts
const { data, status } = await http.get<Order[]>('/orders');

await http.post('/orders', { sku: 'ABC-1', quantity: 2 });

await http.put(`/orders/${id}`, { quantity: 3 });
```

`onError` runs **before** the rejection, so the record exists even though the caller still receives the
throw. A throw from `onError` itself is contained and reported internally — a broken reporter cannot
change the outcome of the request.

## The trap: `timeoutMs` is per attempt

This is the one thing worth reading twice.

```ts
const slow = createFetchHttpClient({
  timeoutMs: 5_000, // NOT a budget for the whole call
  retry: 2,
});

// This can take 15 seconds before it rejects: three attempts of five seconds each.
await slow.get('/reports/2026');
```

| Option | Default | Unit |
| --- | --- | --- |
| `timeoutMs` | `30000` | Abort budget for **one attempt** |
| `retry` | `0` | Additional attempts after the first. Total attempts = `1 + retry` |
| `retryDelayMs` | `300` | Base backoff, doubling per attempt, capped at 30 s |

Worst-case wall time is `1 + retry` times `timeoutMs`, plus backoff. If a caller has its own deadline,
pass **its** number rather than the client's:

```ts
// One attempt, four seconds, because this is called while a user waits.
await http.get('/search', { timeoutMs: 4_000, retry: 0 });
```

Per-request `timeoutMs` and `retry` override the client's, so a background sync can be patient while a
user-facing call is not.

## What gets retried, and what does not

| Failure | Retried? | Why |
| --- | --- | --- |
| Transport failure / offline (`statusCode: 0`) | Yes | The next attempt may well succeed. |
| `408`, `429`, every `5xx` | Yes | Transient by definition. |
| Every other `4xx` | No | A `404` will be a `404` again. Retrying multiplies load for the same answer. |
| A throwing `getHeaders` provider | **No** | Deterministic: the same input raises the same throw. Marked `isRetryable: false`. |
| A body that cannot be serialised | **No** | Same reason. |
| Anything, when `rejectOnHttpError: false` | **No** | A non-ok response is then the *result*, not a failure. |

That last row surprises people. The two options look independent but are not:

```ts
const lenient = createFetchHttpClient({ rejectOnHttpError: false, retry: 3 });

const response = await lenient.get('/flaky');
// A 503 resolves here. `retry` is never consulted, because nothing failed.
if (!response.ok) showMaintenanceBanner();
```

If you want retries *and* to inspect non-ok responses yourself, leave `rejectOnHttpError` at its default
and catch the rejection.

## Not reading the body

`readAs` decides how the response body is decoded, and `'none'` means it is **never read**:

| Value | Body handling |
| --- | --- |
| `'auto'` (default) | JSON when `Content-Type` says so, otherwise text. |
| `'json'`, `'text'`, `'arrayBuffer'`, `'blob'` | Forced. |
| `'none'` | Never read. Only the status is used. |

```ts
const pinger = createFetchHttpClient({ readAs: 'none' });

// Health checks, fire-and-forget writes, DELETE calls: the body is a payload you
// are not going to look at, so nothing downstream of `fetch` ever touches it.
const health = await pinger.get('/health');
if (health.status === 204) markHealthy();
```

Reading a body costs bandwidth and hands the client a payload it has no use for.

## Interceptors

An interceptor is a plain object with any of three hooks. Order is the order you pass them in.

```ts
import type { HttpInterceptor } from '@codewithrajat/rm-logvault/http';

const timing: HttpInterceptor = {
  name: 'timing',
  onRequest: (request) => {
    performance.mark(`http:${request.method}:${request.url}:start`);
    return request;
  },
  onResponse: (response) => {
    performance.measure('http', `http:start`);
    return response;
  },
  onError: (error) => {
    if (error.statusCode === 0) setOfflineBanner(true);
  },
};

http.setInterceptors([timing, authInterceptor]);
```

| Hook | Called | Returning |
| --- | --- | --- |
| `onRequest(request)` | Before sending | A request to send, or **`null` to cancel** the call. |
| `onResponse(response, request)` | On a successful response only | A response, possibly replaced. |
| `onError(error)` | On every failure, before `onError` on the options | Nothing; the original error is still thrown. |

`null` from `onRequest` cancels with an `HttpError`, so a caller sees a rejected promise rather than a
hang:

```ts
const gated: HttpInterceptor = {
  name: 'consent-gate',
  onRequest: (request) =>
    request.url.startsWith('/analytics') && !consentGranted() ? null : request,
};
```

Every interceptor callback is contained. A throwing `onRequest` produces a failed request with an
`HttpError` rather than leaking an arbitrary value to the caller.

## Auth: one provider, two consumers

The token problem is universal — get a token, notice it is stale, refresh **once** even when ten requests
fire at the same moment — so it is provided once and used in both places that need it.

```ts
// src/auth.ts
import { createAuthHeaderProvider } from '@codewithrajat/rm-logvault/http';

export const auth = createAuthHeaderProvider({
  getToken: () => sessionStore.token,
  refreshToken: async () => (await refreshSession()).token,
  isTokenExpired: (token) => jwtExpiry(token) < Date.now(),
  onUnauthorized: () => router.push('/login'),
});
```

```ts
// The HTTP client …
import { createAuthInterceptor } from '@codewithrajat/rm-logvault/http';

http.setInterceptors([createAuthInterceptor(authProvider)]);

// … and the telemetry uploader, through the flat `headers` alias.
import { setupTelemetry } from '@codewithrajat/rm-logvault';

setupTelemetry({
  app: 'checkout',
  url: '/telemetry',
  headers: auth.getHeaders,
});
```

`headers` is the flat alias for `rest.getHeaders`, which is awaited per upload request — so a token
rotated mid-session is picked up without re-initialising anything.

Behaviour worth knowing:

- **`refresh()` coalesces.** Ten concurrent requests with a stale token cause one refresh call, not ten.
- **`onUnauthorized` is not called when there is simply no token.** That is the normal anonymous state;
  firing there would redirect to a login page on every request made before a user signs in. It *is* called
  when a token was present, was stale, and could not be replaced.
- **`createAuthInterceptor` does not re-issue the request on a 401.** It attempts one refresh and, if that
  fails, calls `logout()` and `onUnauthorized()`. Re-issuing is your decision, not the interceptor's —
  and doing it silently would double-report the original failure.

An API key that is sent bare, rather than as a bearer token:

```ts
// Note the shape: an AuthProvider *object*, whose getToken is a function.
const mapsKey = createAuthHeaderProvider(
  { getToken: () => import.meta.env.VITE_MAPS_KEY },
  { headerName: 'X-API-Key', scheme: '' }, // scheme '' → no "Bearer " prefix
);
```

## The error you actually catch

```ts
import { type HttpError } from '@codewithrajat/rm-logvault/http';

try {
  await http.get('/orders');
} catch (error) {
  const failure = error as HttpError;
  failure.statusCode; // 0 when no response arrived
  failure.isTimeout; // the abort budget expired
  failure.isNetworkError; // never reached a server
  failure.isAbort; // a caller-supplied signal fired
  failure.attempts; // how many were made, including the first
  failure.response?.status; // present for a non-2xx
}
```

It is an `Error` with `name === 'HttpError'`, so your own logging and any `instanceof Error` check work.

| Field | Meaning |
| --- | --- |
| `request` | The request as it was sent — `method`, `url`, `timeoutMs`. Bodies are never stored on it. |
| `response` | Present for a non-2xx. Absent for a timeout or a transport failure. |
| `statusCode` | `response.status`, or `0` when there was no response. |
| `attempts` | Attempts made **so far**, including the one that failed. |

## Classifying a failure without the client

The classification helpers are exported, so an existing axios or ky client can produce the same
`ErrorContext` the client does:

```ts
import {
  buildHttpErrorContext,
  categoryForHttpStatus,
  isRetryableStatus,
  severityForHttpError,
} from '@codewithrajat/rm-logvault/http';

categoryForHttpStatus(401, false); // 'auth'
categoryForHttpStatus(504, false); // 'timeout'
categoryForHttpStatus(0, false); // 'network'
severityForHttpError(503, false); // 'error'
severityForHttpError(404, false); // 'warning'
isRetryableStatus(429); // true
isRetryableStatus(404); // false
resolveRequestUrl('/orders', 'https://api.test'); // 'https://api.test/orders'
```

Only an allow-list of request fields is ever copied into a record — method, url, status, statusText, the
timeout budget and the duration. **Request and response bodies are never read into an error context**,
which is the same rule the rest of the library follows.

## Related

- [events, context builders and named sinks](./04-events-and-context-builders.md) — where the captured
  failure shows up afterwards.
- [custom transport and logSource](./02-custom-transport-and-log-source.md) — replacing the *upload* path,
  which is a different seam from this one.
- [what arrives at your collector](../advanced/02-what-arrives-at-the-collector.md) — the wire format your
  own client is unrelated to.
- [docs/API.md](../../../docs/API.md) — every export above with its full signature.
