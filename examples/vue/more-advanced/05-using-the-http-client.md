# more-advanced — the shipped HTTP client

**Problem it solves:** every team writes the same interceptor against whatever HTTP client they use —
pull out the status, decide whether it is a timeout, guess whether it is retryable, and attach a token.
This one ships with the library, reports through `captureError` without a cast, and has a documented
auth seam.

**What you will learn:**

- One module-level client, and why `onError` is where capture happens.
- `timeoutMs` is **per attempt**, and how `retry` multiplies it.
- `readAs: 'none'` for a request whose body you must not read.
- An interceptor, and what a throwing one does.
- The full auth flow: one provider feeding both the client and `initTelemetry`.
- Why this is the one surface allowed to reject.

## One client, at module scope

```ts
// src/http.ts
import { createFetchHttpClient } from '@codewithrajat/rm-logvault/http';
import { captureError } from '@codewithrajat/rm-logvault';

export const http = createFetchHttpClient({
  baseUrl: import.meta.env.VITE_API_BASE_URL ?? '/api',
  timeoutMs: 10_000,
  retry: 1,
  // The failure is a real `Error`, and `context` is already an `ErrorContext`,
  // so the two compose without a cast.
  onError: (error, context) => captureError(error, context),
});
```

`baseUrl` is a prefix for **relative** URLs; an absolute URL ignores it. `createFetchHttpClient` reads
`globalThis.fetch` per request unless you pass `fetchImpl`, so a later instrumentation of `fetch` still
applies.

```ts
const { data } = await http.get<Order[]>('/orders');
await http.post('/orders', { sku: 'A-1', qty: 2 });
```

`HttpClient` is `request<T>(req)`, `get<T>(url, opts?)`, `post<T>(url, body?, opts?)`, `put`, `patch`,
`delete`, plus `setInterceptors(list)` and `getInterceptors()`.

| Option | Default | What it decides |
| --- | --- | --- |
| `baseUrl` | none | Prefix for relative URLs. |
| `timeoutMs` | `30000` | Abort budget **per attempt**, not per call. |
| `headers` | none | Merged into every request. |
| `getHeaders` | none | Awaited per request, merged **last** so a rotated token wins over a static header. |
| `bodyMode` | `'json'` | `'json'` \| `'text'` \| `'raw'`. Only `'json'` adds `Content-Type: application/json`. |
| `readAs` | `'auto'` | `'auto'` \| `'json'` \| `'text'` \| `'arrayBuffer'` \| `'blob'` \| `'none'`. |
| `credentials` | `'same-origin'` | `'include'` is **never** implied. |
| `retry` | `0` | Additional attempts. Total attempts = `1 + retry`. |
| `retryDelayMs` | `300` | Backoff base. |
| `rejectOnHttpError` | `true` | Reject on a non-2xx response. |
| `onError` | none | `(error, context) => void`. Runs **before** the rejection. |
| `fetchImpl` | `globalThis.fetch` | Swap in a polyfill or a stub. |

## `timeoutMs` is per attempt

This is the option most likely to surprise you. With `retry: 2` a call can take three times `timeoutMs`
before it rejects — each attempt gets its own full budget:

| `retry` | Attempts | Worst case with `timeoutMs: 10_000` |
| --- | --- | --- |
| `0` **(default)** | 1 | ~10 s |
| `1` | 2 | ~20 s + backoff |
| `2` | 3 | ~30 s + backoff |

Backoff is `min(retryDelayMs × 2^(attempt − 1), 30_000)`, so with the default `retryDelayMs` of `300`
the gaps are 300 ms, 600 ms, 1200 ms…

Only **`0`, `408`, `429` and every `5xx`** are retried, via `isRetryableStatus(status)`. A `404` or a
`401` will not succeed on retry, so retrying it would multiply load while guaranteeing the same answer.
A **deterministic** failure — a throwing `getHeaders`, or a body that cannot be serialised — is marked
non-retryable and surfaced immediately.

> **Source note.** `retry` only applies to failures that **reject**. With `rejectOnHttpError: false` a
> non-ok response *is* the result, so the retry check is never reached and `retry` has no effect. The
> two options look orthogonal and are not.

```ts
// A 503 is returned, not thrown, and is not retried.
const probe = createFetchHttpClient({ rejectOnHttpError: false, retry: 3 });
const { status } = await probe.get('/health');
```

## Not reading a body you do not need

`readAs: 'none'` never touches the response body. Use it for a health check, a beacon, or any request
whose only meaningful result is the status:

```ts
const { status, ok } = await http.post('/telemetry/heartbeat', { at: Date.now() }, {
  readAs: 'none',
});
```

The `'auto'` default decodes JSON when the `Content-Type` says so and text otherwise — which is a
content-type check on headers the client already has, never a body read the caller did not ask for.

## Interceptors

```ts
import { createFetchHttpClient, type HttpInterceptor } from '@codewithrajat/rm-logvault/http';

const timing: HttpInterceptor = {
  name: 'timing',
  onRequest: (request) => ({
    ...request,
    headers: { ...request.headers, 'x-trace-id': crypto.randomUUID() },
  }),
  onResponse: (response) => {
    performance.mark(`http:${response.status}`);
    return response;
  },
  onError: (error) => {
    if (error.isTimeout) reportSlowEndpoint(error.request.url);
  },
};

const http = createFetchHttpClient({ baseUrl: '/api', onError: (e, c) => captureError(e, c) });
http.setInterceptors([timing]);
```

| Hook | Returns | Notes |
| --- | --- | --- |
| `onRequest(request)` | the request to send, or `null` to cancel | Run in order. Returning `null` rejects with an `HttpError`. |
| `onResponse(response, request)` | the response to use | Success path only. |
| `onError(error)` | nothing | Runs on every failure, before the rejection. |

Interceptor throws are contained: an `onRequest` that throws fails **that request** as a deterministic,
non-retried `HttpError`; a throwing `onResponse` or `onError` is reported through internal diagnostics
and does not change the outcome.

> **Source note.** Per-request headers win over the provider's, and the provider's win over
> `options.headers`:
> `{ ...options.headers, ...provided, ...request.headers }`. So a per-request `Authorization` overrides
> the token from `getHeaders` — useful for one-off calls, and a foot-gun if you set it by accident.

## The full auth flow

One `AuthProvider` implementation serves both the HTTP client and telemetry uploads. That is the point
of the seam: one refresh policy, not two.

```ts
// src/auth.ts
import { defineStore } from 'pinia';
import { ref } from 'vue';

export const useSessionStore = defineStore('session', () => {
  const token = ref<string | undefined>(readSessionToken());
  const expiresAt = ref<number>(0);
  return { token, expiresAt };
});
```

```ts
// src/auth-provider.ts
import { createAuthHeaderProvider, createAuthInterceptor } from '@codewithrajat/rm-logvault/http';
import { useSessionStore } from '@/auth';
import { router } from '@/router';

const session = useSessionStore();

export const auth = createAuthHeaderProvider({
  getToken: () => session.token,
  refreshToken: async () => {
    const response = await fetch('/auth/refresh', { method: 'POST', credentials: 'include' });
    if (!response.ok) return undefined;
    const body = (await response.json()) as { token: string; expiresAt: number };
    session.token = body.token;
    session.expiresAt = body.expiresAt;
    return body.token;
  },
  isTokenExpired: (token) => session.expiresAt <= Date.now() && token.length > 0,
  onUnauthorized: () => {
    void router.push('/login');
  },
  logout: () => {
    session.token = undefined;
    session.expiresAt = 0;
  },
});

export const authInterceptor = createAuthInterceptor(auth);
```

Wire it into both places:

```ts
// src/http.ts
import { createFetchHttpClient } from '@codewithrajat/rm-logvault/http';
import { captureError } from '@codewithrajat/rm-logvault';
import { authInterceptor } from '@/auth-provider';

export const http = createFetchHttpClient({
  baseUrl: '/api',
  timeoutMs: 10_000,
  onError: (error, context) => captureError(error, context),
});

http.setInterceptors([authInterceptor]);
```

```ts
// src/telemetry.ts
import { setupTelemetry } from '@codewithrajat/rm-logvault';
import { auth } from '@/auth-provider';

export const telemetry = setupTelemetry({
  app: 'checkout',
  version: __APP_VERSION__,
  url: '/telemetry',
  level: 'warn',
  // The flat alias for `rest.getHeaders`. The same provider the HTTP client uses.
  headers: auth.getHeaders,
});
```

`AuthProvider` is `{ getToken, refreshToken?, isTokenExpired?, onUnauthorized?, logout? }` — only
`getToken` is required. `createAuthHeaderProvider(provider, options?)` takes `headerName`
(default `'Authorization'`), `scheme` (default `'Bearer '`, set `''` for a bare API key) and
`getExtraHeaders`, and returns `{ getHeaders(), refresh() }`.

| Behaviour | Detail |
| --- | --- |
| Never rejects | A throwing `getToken`, `refreshToken`, `isTokenExpired`, `getExtraHeaders` or `onUnauthorized` is contained. |
| Single-flight refresh | Concurrent `refresh()` calls share **one** in-flight attempt. Ten parallel 401s cause one refresh, not ten. |
| Proactive refresh | A token your `isTokenExpired` rejects is refreshed before the request, not after a wasted round trip. |
| No token = not an error | With no token at all, `onUnauthorized` is **not** called — that is the normal anonymous path, and nagging on every pre-login request would be a bug. |
| Stale token that cannot refresh | `onUnauthorized` **is** called: a present credential was lost. |

```ts
// A bare API key: no scheme prefix.
const apiKeyProvider = createAuthHeaderProvider(apiKeyAuth, {
  headerName: 'X-API-Key',
  scheme: '',
});
```

`createAuthInterceptor(provider)` is named `'auth'`. Its `onRequest` merges the provider's headers
**under** the per-request ones. Its `onError` on a `401` attempts **one** refresh, then calls
`logout()` and `onUnauthorized()` if that failed.

> **Source note.** The auth interceptor does **not** re-issue the request. The client owns its retry
> policy, and a silent second request would double-report the original failure. If you want the retry,
> do it yourself from the `onError` you pass to the client, or rely on the `401` path below.

For telemetry uploads specifically, a batch that fails with `401` is marked terminally `failed` rather
than retried forever, so re-authenticate and then ask for it back:

```ts
import { retryFailedTelemetry, syncTelemetry } from '@codewithrajat/rm-logvault';

setupTelemetry({
  app: 'checkout',
  url: '/telemetry',
  headers: auth.getHeaders,
  onInternalError: (stage) => {
    if (stage.includes('auth')) void router.push('/login');
  },
});

// After the user re-authenticates:
await syncTelemetry();
await retryFailedTelemetry();
```

## Errors you can switch on

```ts
import { type HttpError } from '@codewithrajat/rm-logvault/http';

try {
  await http.get('/orders');
} catch (error) {
  const http = error as HttpError;
  if (http.isTimeout) showSlowNetworkNotice();
  else if (http.isNetworkError) showOfflineNotice();
  else if (http.statusCode === 404) showEmptyState();
  else if (http.attempts > 1) reportFlakyEndpoint(http.request.url);
}
```

| Member | Meaning |
| --- | --- |
| `request` | The request that was attempted. |
| `response` | Present for a non-2xx response; absent for a network failure or timeout. |
| `isNetworkError` | No request reached a server (DNS, CORS, offline). |
| `isTimeout` | The abort budget expired. |
| `isAbort` | A caller's `AbortSignal` aborted it. |
| `statusCode` | `response.status`, or `0` when there was no response. |
| `attempts` | Attempts made, including the first. |

`error.name` is `'HttpError'`, and the class extends `Error` — which is why `captureError(error, context)`
records it as a real error rather than as an opaque object.

## Why this one surface is allowed to reject

Everything else in the library is contractually forbidden from throwing, because it runs on your
application's error path. An HTTP client is different: a client that cannot report a failure is
useless, so `createFetchHttpClient` returns a rejection for a failed request — always an `HttpError`.

That is safe because the client is **walled off** from the capture path. It does not replace
`rest.transport`, it does not touch the outbox, and nothing in the core, the error pipeline, storage,
sync or export imports it. Use it for your application's requests; leave telemetry uploads on
`rest.transport` so a failing upload can never re-enter the interceptor that captures errors.

```ts
// Your requests: the shipped client, with capture wired in.
export const http = createFetchHttpClient({ onError: (e, c) => captureError(e, c) });

// Telemetry uploads: the built-in transport, or your own RemoteTransport.
setupTelemetry({ app: 'checkout', url: '/telemetry' });
```

## Framework notes for Vue

- **One client at module scope.** Creating one per component gives each its own interceptor list, which
  is almost never what you want.
- **`crypto.randomUUID()` needs a secure context** — `https` or `localhost`. A trace-id interceptor
  should fall back rather than throw.
- **Do not call the client in `setup()`.** A request fired during `setup` runs before `onMounted`, and
  its rejection lands outside any component's error handling. Use `onMounted`, or a Vue Query /
  Pinia action.
- **`auth.getHeaders` is a function reference, not a call.** Pass `auth.getHeaders`, not
  `auth.getHeaders()` — the library awaits it per request so a rotated token is picked up.

## Related

- The observation surface these events come from:
  [04-observing-and-extending.md](./04-observing-and-extending.md).
- Encrypting what the client and the recorder store:
  [06-encrypting-stored-records.md](./06-encrypting-stored-records.md).
- The transport the recorder uses for its own uploads:
  [README.md](./README.md#a-custom-transport).
- Every signature: [docs/API.md](../../../docs/API.md).
