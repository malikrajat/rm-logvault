# more-advanced — using the HTTP client

**Problem it solves:** you want one place where a failed request becomes a captured error with its
status, method and URL attached — and you want the token attached to the telemetry upload too, so the
same refresh policy covers both. Angular's `HttpClient` gives you interceptors but no telemetry; every
application writes the same interceptor against it and re-derives status classification from scratch.

**What you will learn:**

- What the library's own client is, and the one thing it deliberately is not.
- A client provided once, with `onError` wired to `captureError`.
- `retry` and `timeoutMs` used correctly — the timeout is **per attempt**.
- `readAs: 'none'` for the status-only case.
- A client interceptor, and how it differs from an Angular HTTP interceptor.
- The full auth flow: one provider feeding both the client and the telemetry upload.
- The property that makes this subpath different from the rest of the package.

## This is not Angular's `HttpClient`

It is a small, dependency-free client shipped by this library. Two consequences follow, and both are
deliberate:

- It **never touches Angular's interceptors** and it does not go through `HttpClient`. If you want
  Angular's interceptor chain, keep using Angular's client and leave this one alone.
- It is the **one public surface in the package allowed to reject**, because an HTTP client that cannot
  report a failure is not an HTTP client. Every rejection is an `HttpError`, a real `Error`, so
  `captureError` records it properly rather than as an opaque object.

Nothing on the telemetry capture path can reject — the never-throw guarantee elsewhere is unaffected,
because nothing in the core imports this module.

```ts
// src/app/http/http-client.provider.ts
import { InjectionToken, type Provider } from '@angular/core';
import { captureError } from '@codewithrajat/rm-logvault';
import { createFetchHttpClient, type HttpClient } from '@codewithrajat/rm-logvault/http';
import { environment } from '../../environments/environment';

export const HTTP_CLIENT = new InjectionToken<HttpClient>('HTTP_CLIENT');

export function provideHttpClient(): Provider {
  return {
    provide: HTTP_CLIENT,
    useFactory: (): HttpClient =>
      createFetchHttpClient({
        baseUrl: environment.apiBaseUrl,
        timeoutMs: 10_000,   // per attempt, not per call
        retry: 1,            // attempts = 1 + retry = 2
        retryDelayMs: 300,
        // The error is a real Error and the context is already an ErrorContext,
        // so the two compose without a cast.
        onError: (error, context) => captureError(error, context),
      }),
  };
}
```

> **Source note.** This client is a **provider**, not an Angular service, because it takes values rather
> than injectables — the same reasoning as `provideTelemetry()`. Wrap it in an `@Injectable` if you want
> to inject `HttpClient` directly; the token above is enough for most applications.

## Options

| Option | Type | Default | What it does |
| --- | --- | --- | --- |
| `baseUrl` | `string` | none | Prefix for a relative request URL. An already-absolute URL ignores it. |
| `timeoutMs` | `number` | `30000` | Abort budget **per attempt**. |
| `headers` | `Record<string, string>` | none | Merged into every request, before the per-request ones. |
| `getHeaders` | `() => Record<string, string> \| Promise<...>` | none | Awaited per request and merged **last**, so a rotated token wins. A throwing provider fails the request. |
| `bodyMode` | `'json' \| 'text' \| 'raw'` | `'json'` | How the request body is serialised. `'json'` sets `Content-Type: application/json`. |
| `readAs` | `'auto' \| 'json' \| 'text' \| 'arrayBuffer' \| 'blob' \| 'none'` | `'auto'` | How the response body is decoded. `'none'` **never reads the body**. |
| `credentials` | `RequestCredentials` | `'same-origin'` | `'include'` is never implied. |
| `retry` | `number` | `0` | Extra attempts for a retryable failure. |
| `retryDelayMs` | `number` | `300` | Base delay; backoff is `min(300 * 2^(n-1), 30000)`. |
| `rejectOnHttpError` | `boolean` | `true` | `false` makes a non-ok response the *result* rather than a rejection. |
| `onError` | `(error: HttpError, context: ErrorContext) => void` | none | Runs **before** the rejection; its own throw is contained. |
| `fetchImpl` | `typeof fetch` | `globalThis.fetch` | Resolved per request, so a later instrumentation still applies. |

`HttpClient` has `request<T>(req)`, `get<T>(url, opts?)`, `post<T>(url, body?, opts?)`, `put`, `patch`,
`delete`, `setInterceptors(list)` and `getInterceptors()`.

## The timeout is per attempt

This is the detail that bites. `timeoutMs: 10_000` with `retry: 2` can take **thirty seconds** before it
rejects, because each attempt gets its own budget.

```ts
// Worst case: 3 attempts x 10s = 30s before this rejects.
const http = createFetchHttpClient({ timeoutMs: 10_000, retry: 2 });

// A tighter per-request override, when one endpoint deserves less patience.
await http.get<Order[]>('/orders', { timeoutMs: 3_000, retry: 0 });
```

Only `0` (no response reached the server), `408`, `429` and every `5xx` are retried. A `4xx` other than
`408`/`429` will not succeed on retry, so retrying it multiplies load while guaranteeing the same
answer. A **deterministic** failure — a throwing `getHeaders`, a body that cannot be serialised — is
marked `isRetryable: false` and never retried, because the same input raises the same throw.

> **Source note.** `retry` applies to failures that **reject**. With `rejectOnHttpError: false` a non-ok
> response *is* the result, so there is nothing to retry and `retry` has no effect.

## Reading only the status

A health check, a `DELETE`, or a `HEAD`-shaped call needs the status and nothing else. `readAs: 'none'`
never consumes the body at all:

```ts
import { inject } from '@angular/core';
import { HTTP_CLIENT } from '../http/http-client.provider';

export class OrderApi {
  private readonly http = inject(HTTP_CLIENT);

  public async isHealthy(): Promise<boolean> {
    try {
      // The body is never read, so a large or streaming response costs nothing.
      const response = await this.http.get<void>('/health', { readAs: 'none' });
      return response.ok;
    } catch {
      return false;
    }
  }

  public async placeOrder(order: NewOrder): Promise<Order> {
    const { data } = await this.http.post<Order>('/orders', order);
    return data;
  }

  public async cancelOrder(id: string): Promise<void> {
    // 204 No Content: nothing to decode.
    await this.http.delete<void>(`/orders/${id}`, { readAs: 'none' });
  }
}
```

Every response carries `status`, `statusText`, `headers`, `data`, `ok` and `durationMs`.

## Interceptors

An `HttpInterceptor` here is a plain object with up to three hooks. It is **not** an Angular
`HttpInterceptorFn` and it is not registered with `provideHttpClient(withInterceptors(...))`.

```ts
import { logger } from '@codewithrajat/rm-logvault';
import type { HttpInterceptor } from '@codewithrajat/rm-logvault/http';

const correlationId: HttpInterceptor = {
  name: 'correlation-id',

  onRequest: (request) => ({
    ...request,
    headers: { ...request.headers, 'x-correlation-id': crypto.randomUUID() },
  }),

  onResponse: (response, request) => {
    logger.debug(`[http] ${request.method} ${request.url} -> ${response.status}`);
    return response;
  },

  onError: (error) => {
    // The failure is still thrown afterwards; this only observes it.
    if (error.statusCode === 503) showMaintenanceBanner();
  },
};

http.setInterceptors([correlationId]);
```

| Hook | Returns | Notes |
| --- | --- | --- |
| `onRequest(request)` | the request to send, or `null` to cancel | Returning `null` rejects with an `HttpError`. A throw here is reported and the call rejects. |
| `onResponse(response, request)` | a response | Runs on the **success** path only. Replacing it replaces what the caller receives. |
| `onError(error)` | nothing | Runs before `onError` on the client options, and before the rejection. |

If you prefer the Angular framing, an `HttpInterceptorFn` is the same shape as `onRequest` — only the
registration differs, because this client has no DI of its own:

```ts
import type { HttpInterceptorFn } from '@angular/common/http';

/** Reusable in both clients: same signature, two registrations. */
export const authHeaderFn: HttpInterceptorFn = (request, next) => next(request.clone({
  setHeaders: { authorization: `Bearer ${readToken() ?? ''}` },
}));

// Angular's client:
provideHttpClient(withInterceptors([authHeaderFn]));

// This client — it takes the request and returns the request, so wrap it:
import type { HttpInterceptor, HttpRequest } from '@codewithrajat/rm-logvault/http';

export const authHeaderInterceptor: HttpInterceptor = {
  name: 'auth-header',
  onRequest: (request: HttpRequest) => ({
    ...request,
    headers: { ...request.headers, authorization: `Bearer ${readToken() ?? ''}` },
  }),
};
```

> **Source note.** They are not interchangeable at runtime. Angular's chain wraps `HttpClient` and only
> sees calls made through it; this client's chain only sees its own calls. Sharing a *function* is fine —
> sharing a registration is not.

## The full auth flow

`createAuthHeaderProvider` is the interesting piece: it coalesces refreshes, so ten parallel requests
with an expired token refresh **once**, and it never rejects. That is what lets it feed both the HTTP
client and the telemetry uploader.

```ts
// src/app/auth/auth.provider.ts
import { InjectionToken, type Provider } from '@angular/core';
import { createAuthHeaderProvider, type AuthHeaderProvider, type AuthProvider } from '@codewithrajat/rm-logvault/http';
import { sessionService } from './session.service';

export const AUTH_HEADERS = new InjectionToken<AuthHeaderProvider>('AUTH_HEADERS');

export function provideAuthHeaders(): Provider {
  return {
    provide: AUTH_HEADERS,
    useFactory: (): AuthHeaderProvider =>
      createAuthHeaderProvider(
        {
          getToken: () => sessionService.token,
          refreshToken: async () => (await sessionService.refresh()).token,
          isTokenExpired: (token) => sessionService.expiresAt(token) <= Date.now(),
          onUnauthorized: () => void sessionService.redirectToLogin(),
          logout: async () => {
            await sessionService.clear();
          },
        },
        { headerName: 'Authorization', scheme: 'Bearer ' },
      ),
  };
}
```

```ts
// src/main.ts — one provider, two consumers.
import { captureError, setupTelemetry } from '@codewithrajat/rm-logvault';
import {
  createAuthInterceptor,
  createFetchHttpClient,
  createAuthHeaderProvider,
  type AuthProvider,
} from '@codewithrajat/rm-logvault/http';

// Defined once; both consumers below read the same refresh policy.
export const authProvider: AuthProvider = {
  getToken: () => sessionService.token,
  refreshToken: async () => (await sessionService.refresh()).token,
  isTokenExpired: (token) => sessionService.expiresAt(token) <= Date.now(),
  onUnauthorized: () => void sessionService.redirectToLogin(),
};

const auth = createAuthHeaderProvider(authProvider);

// 1. The telemetry upload — flat `headers` is a shorthand for `rest.getHeaders`.
setupTelemetry({
  app: 'checkout',
  url: '/api/telemetry',
  headers: auth.getHeaders,
});

// 2. Your own API calls, with one refresh policy for both.
const http = createFetchHttpClient({
  baseUrl: '/api',
  onError: (error, context) => captureError(error, context),
});
http.setInterceptors([createAuthInterceptor(authProvider)]);
```

> **Source note.** `auth.getHeaders` and `createAuthInterceptor(authProvider)` are two views of the same
> provider. The interceptor reuses the identical refresh guard internally, so the client and the
> telemetry upload never refresh twice for one expiry.

| `AuthProvider` member | Required | What it does |
| --- | --- | --- |
| `getToken()` | yes | The current token, or `undefined`. May be async. A throwing implementation is treated as "no token". |
| `refreshToken()` | no | Returns the new token, or `undefined` on failure. |
| `isTokenExpired(token)` | no | When omitted, the library never proactively refreshes and relies on the reactive `401`. |
| `onUnauthorized()` | no | Called when a *present* token was stale and could not be refreshed. |
| `logout()` | no | Discards credentials; called by the interceptor when a `401` refresh fails. |

> **Source note.** `onUnauthorized` is **not** called when there is simply no token — that is the normal
> anonymous path, and calling it there would nag on every request made before a user logs in. It **is**
> called when a present token was stale and could not be replaced.

> **Source note.** `createAuthInterceptor`'s `onError` attempts **one** refresh on a `401` and then calls
> `logout()` and `onUnauthorized()` if it failed. It does **not** re-issue the request, because the client
> owns its own retry policy and a silent second request would double-report the original failure.
> Re-issue it explicitly when you want that.

> **Source note.** `scheme` defaults to `'Bearer '` (with the trailing space). Set it to `''` for a bare
> API key sent as `X-API-Key: <key>`.

## The `HttpError` you catch

```ts
import { isRetryableStatus } from '@codewithrajat/rm-logvault/http';

try {
  await this.http.get<Order[]>('/orders', { retry: 2 });
} catch (error) {
  const httpError = error as HttpError;
  httpError.statusCode;      // 0 when nothing reached the server
  httpError.isNetworkError;  // DNS, CORS, offline
  httpError.isTimeout;       // the timeout budget expired
  httpError.isAbort;         // a caller's AbortSignal aborted it
  httpError.attempts;        // attempts made, including the first
  httpError.request.method;  // allow-listed request metadata
  httpError.response?.status;
}
```

| Field | Meaning |
| --- | --- |
| `request` | method, url, timeout — never headers or a body |
| `response?` | present for a non-2xx response, absent for a network failure |
| `statusCode` | `response.status`, or `0` when there was no response |
| `isNetworkError` / `isTimeout` / `isAbort` | which of the three failure modes this was |
| `attempts` | attempts made; `0` when no attempt was issued |

Also exported from this subpath: `buildHttpErrorContext` (what `onError` receives),
`categoryForHttpStatus`, `severityForHttpError`, `isRetryableStatus`, `resolveRequestUrl`,
`DEFAULT_HTTP_TIMEOUT_MS` (`30000`) and `DEFAULT_HTTP_RETRY_DELAY_MS` (`300`).

> **Source note.** Request and response **bodies are never read into an error**. Only method, url,
> status, statusText, timeout and duration are copied, which is what keeps `onError` safe to wire
> straight into `captureError`.

## Related

- [Observing and extending](./04-observing-and-extending.md) — events, context builders and the sink
  registry.
- [The Angular adapter](./01-framework-adapter.md) — `provideTelemetryErrorHandler`, and why the
  `axios`/`fetch` adapters exist for Angular's own client.
- [A custom transport](./README.md#a-custom-transport) — routing the telemetry upload through Angular's
  `HttpClient` instead, if you need its interceptor chain.
