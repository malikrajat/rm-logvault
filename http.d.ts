import { E as ErrorContext } from './types-vgch86Bo.js';

/**
 * A framework-agnostic HTTP client contract, and an adapter to the telemetry transport.
 *
 * @remarks
 * The library has exactly one egress of its own — {@link RemoteTransport}, used to
 * upload batches. Applications, though, make *all* their HTTP calls through
 * something, and they want one interception point where a failure becomes a
 * captured error. Without this, every team writes the same interceptor against
 * whatever client they happen to use, and each one re-derives status
 * classification, timeout detection and request metadata from scratch.
 *
 * This module is the **contract**; {@link createFetchHttpClient} is the shipped
 * implementation, and `@codewithrajat/rm-logvault/http` is where it lives. An
 * axios or ky implementation can satisfy the same interface and drop in.
 *
 * ### What this deliberately does not do
 *
 * It is not a request library. There is no cache, no deduplication, no request
 * queueing, no token-refresh state machine — those are application concerns with
 * application-specific correctness requirements, and a general-purpose client that
 * guesses at them is worse than none. What it provides is a stable shape, a
 * contained timeout, interceptors that cannot break the caller, and one place to
 * turn a failure into a telemetry record.
 *
 * @packageDocumentation
 */

/** HTTP methods the client issues. */
type HttpMethod = 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE' | 'HEAD' | 'OPTIONS';
/**
 * One request.
 *
 * @remarks
 * `url` is resolved against `HttpClientOptions.baseUrl` when it is relative.
 */
interface HttpRequest {
    readonly url: string;
    readonly method: HttpMethod;
    /** Merged **over** the client's default headers and its header provider. */
    readonly headers?: Record<string, string> | undefined;
    /** Serialised according to `HttpClientOptions.bodyMode`. */
    readonly body?: unknown;
    /** Per-request override of the client's `timeoutMs`. */
    readonly timeoutMs?: number | undefined;
    /** Per-request override of the client's `credentials`. */
    readonly credentials?: RequestCredentials | undefined;
    /** Per-request override of the client's `retry` count. */
    readonly retry?: number | undefined;
    /** Per-request abort signal, honoured alongside the timeout. */
    readonly signal?: AbortSignal | undefined;
}
/** One response, with the body already decoded. */
interface HttpResponse<T = unknown> {
    readonly status: number;
    readonly statusText: string;
    readonly headers: Record<string, string>;
    readonly data: T;
    readonly ok: boolean;
    /** Round-trip time in milliseconds. */
    readonly durationMs: number;
}
/**
 * A failed request.
 *
 * @remarks
 * Thrown **only** when the request itself failed — a transport error, a timeout, a
 * non-2xx status, or an aborted signal. A `fetch` that resolves is never converted
 * into a throw when `HttpClientOptions.rejectOnHttpError` is set, because a `4xx`
 * is a legitimate response in most applications.
 *
 * This is also a real `Error`, so `captureError(httpError, ...)` records it as one
 * rather than as an opaque object.
 */
interface HttpError extends Error {
    readonly request: HttpRequest;
    /** Present for a non-2xx response; absent for a network failure or timeout. */
    readonly response?: HttpResponse | undefined;
    /** The request never reached a server (DNS, CORS, offline). */
    readonly isNetworkError: boolean;
    /** The request was aborted by the timeout budget. */
    readonly isTimeout: boolean;
    /** An `AbortSignal` other than the timeout's aborted the request. */
    readonly isAbort: boolean;
    /** `response.status`, or `0` when there was no response. */
    readonly statusCode: number;
    /** Attempts made, including the first. */
    readonly attempts: number;
}
/**
 * An {@link HttpError} that will produce the same failure if retried.
 *
 * @remarks
 * A header provider that throws and a body that cannot be serialised are both
 * **deterministic**: the same input raises the same throw, so retrying only
 * multiplies the work. Such a failure carries `isRetryable: false`, which tells
 * `createFetchHttpClient` to surface it immediately.
 *
 * `isNetworkError` is `true`, because no request reached a server. It is the
 * `isRetryable` flag, not the error class, that suppresses the retry.
 */
interface NonRetryableHttpError extends HttpError {
    readonly isRetryable: false;
}
/** Options for {@link createHttpClient}. */
interface HttpClientOptions {
    /** Prefix for relative request URLs. */
    readonly baseUrl?: string | undefined;
    /** Abort budget per attempt. Default `30_000`. */
    readonly timeoutMs?: number | undefined;
    /** Headers merged into every request, before the per-request ones. */
    readonly headers?: Record<string, string> | undefined;
    /**
     * Awaited per request, and merged **last** — so a rotated auth token wins over a
     * static header of the same name.
     *
     * @remarks
     * A throwing provider fails the request rather than sending it unauthenticated,
     * because silently dropping an `Authorization` header turns an auth problem into
     * an unexplained `401` storm.
     */
    readonly getHeaders?: (() => Record<string, string> | Promise<Record<string, string>>) | undefined;
    /**
     * How the request body is serialised. Default `'json'`.
     *
     * - `'json'` — `JSON.stringify`, `Content-Type: application/json`.
     * - `'text'` — as-is, `Content-Type: text/plain`.
     * - `'raw'` — passed straight through, no `Content-Type` added.
     */
    readonly bodyMode?: 'json' | 'text' | 'raw' | undefined;
    /**
     * How the response body is decoded. Default `'auto'`.
     *
     * - `'auto'` — JSON when the `Content-Type` says so, text otherwise.
     * - `'json'`, `'text'`, `'arrayBuffer'`, `'blob'` — forced.
     * - `'none'` — the body is **never read**. Use this when the caller only cares
     *   about the status.
     */
    readonly readAs?: 'auto' | 'json' | 'text' | 'arrayBuffer' | 'blob' | 'none' | undefined;
    /** `fetch` credentials mode. Default `'same-origin'`. */
    readonly credentials?: RequestCredentials | undefined;
    /** Attempts for a retryable failure. `0` disables retrying. Default `0`. */
    readonly retry?: number | undefined;
    /** Base delay for the retry backoff, in milliseconds. Default `300`. */
    readonly retryDelayMs?: number | undefined;
    /** Reject on a non-2xx response. Default `true`. */
    readonly rejectOnHttpError?: boolean | undefined;
    /** Called with the failure before it is thrown. Must not throw. */
    readonly onError?: ((error: HttpError, context: ErrorContext) => void) | undefined;
    /** `fetch` implementation. Defaults to `globalThis.fetch`, resolved per request. */
    readonly fetchImpl?: typeof fetch | undefined;
}
/** One interceptor in the request/response chain. */
interface HttpInterceptor {
    /** Stable identifier, for inspection and error reporting. */
    readonly name?: string | undefined;
    /**
     * Amend the request before it is sent.
     *
     * @returns the request to send. Returning `null` cancels the call with an
     * `HttpError` instead of sending it.
     */
    readonly onRequest?: ((request: HttpRequest) => HttpRequest | null | Promise<HttpRequest | null>) | undefined;
    /** Observe or replace a successful response. */
    readonly onResponse?: (<T>(response: HttpResponse<T>, request: HttpRequest) => HttpResponse<T> | Promise<HttpResponse<T>>) | undefined;
    /** Observe a failure. The original error is still thrown. */
    readonly onError?: ((error: HttpError) => void | Promise<void>) | undefined;
}
/**
 * The client.
 *
 * @remarks
 * Every method **can reject** — that is what an HTTP client is for, and the
 * rejection is always an {@link HttpError}. This is the one place in the package
 * where a thrown error crosses the public boundary by design; the telemetry
 * pipeline's never-throw guarantee is unaffected because nothing here is on the
 * capture path.
 */
interface HttpClient {
    /** Issue a request, running the interceptor chain. */
    request<T = unknown>(request: HttpRequest): Promise<HttpResponse<T>>;
    get<T = unknown>(url: string, options?: Partial<HttpRequest>): Promise<HttpResponse<T>>;
    post<T = unknown>(url: string, body?: unknown, options?: Partial<HttpRequest>): Promise<HttpResponse<T>>;
    put<T = unknown>(url: string, body?: unknown, options?: Partial<HttpRequest>): Promise<HttpResponse<T>>;
    patch<T = unknown>(url: string, body?: unknown, options?: Partial<HttpRequest>): Promise<HttpResponse<T>>;
    delete<T = unknown>(url: string, options?: Partial<HttpRequest>): Promise<HttpResponse<T>>;
    /** Replace the interceptor chain. */
    setInterceptors(interceptors: readonly HttpInterceptor[]): void;
    /** The interceptors currently installed. */
    getInterceptors(): readonly HttpInterceptor[];
}
/** Compose a base URL and a possibly-relative path without ever throwing. */
declare function resolveRequestUrl(url: string, baseUrl: string | undefined): string;
/** Default per-attempt abort budget. */
declare const DEFAULT_HTTP_TIMEOUT_MS = 30000;
/** Default base delay between retries. */
declare const DEFAULT_HTTP_RETRY_DELAY_MS = 300;
/**
 * Whether a status is worth retrying.
 *
 * @param status - the response status, or `0` for a transport failure
 * @returns `true` for `0`, `408`, `429` and every `5xx`
 *
 * @remarks
 * Deliberately narrow. A `4xx` other than `408`/`429` will not succeed on retry, so
 * retrying it multiplies load while guaranteeing the same answer.
 */
declare function isRetryableStatus(status: number): boolean;
/**
 * Map an HTTP status onto an error-record category.
 *
 * @param status - the response status, or `0` for a transport failure
 * @param timedOut - whether the timeout budget expired
 * @returns the matching `ErrorCategory`
 *
 * @example
 * ```ts
 * import { categoryForHttpStatus } from '@codewithrajat/rm-logvault';
 *
 * categoryForHttpStatus(401, false); // 'auth'
 * categoryForHttpStatus(504, false); // 'timeout'
 * categoryForHttpStatus(0, false);   // 'network'
 * ```
 */
declare function categoryForHttpStatus(status: number, timedOut: boolean): 'auth' | 'timeout' | 'network' | 'http' | 'abort';
/**
 * Map an HTTP failure onto the error-record severity.
 *
 * @param status - the response status, or `0`
 * @param timedOut - whether the timeout budget expired
 * @returns `'error'` for a `5xx`/transport failure, `'warning'` for a `4xx`
 */
declare function severityForHttpError(status: number, timedOut: boolean): 'error' | 'warning';
/**
 * Build the {@link ErrorContext} for an HTTP failure.
 *
 * @param error - the failure
 * @returns a context carrying `source: 'api'`, the derived category and severity,
 * and an `api` block
 *
 * @remarks
 * Only an allow-list of fields is copied — method, url, status, statusText, the
 * timeout budget and the duration. Request and response **bodies are never read**
 * and never appear here (I-2). A caller that passes `onError` to
 * {@link createHttpClient} receives this and can hand it straight to
 * `captureError`.
 *
 * @example
 * ```ts
 * import { buildHttpErrorContext, createFetchHttpClient, captureError } from '@codewithrajat/rm-logvault';
 *
 * const http = createFetchHttpClient({
 *   baseUrl: '/api',
 *   onError: (error, context) => captureError(error, context),
 * });
 * ```
 */
declare function buildHttpErrorContext(error: HttpError): ErrorContext;

/**
 * Token acquisition, refresh and header injection — without owning the token.
 *
 * @remarks
 * Authentication is the clearest example of something the library must **not**
 * implement. Every product stores its token somewhere different, expires it on a
 * different schedule, and refreshes it against a different endpoint. What is
 * universal is the *shape* of the problem: get a token, notice it is stale,
 * refresh it once even under concurrent requests, attach it to outgoing headers,
 * and re-authenticate once on a `401`.
 *
 * This module provides that shape and nothing else. It never reads
 * `localStorage`, never decodes a JWT and never invents a refresh endpoint — the
 * application supplies {@link AuthProvider}, and the library only asks it
 * questions (I-2).
 *
 * @packageDocumentation
 */

/**
 * What the library needs from an application's authentication.
 *
 * @remarks
 * Only {@link AuthProvider.getToken} is required. Everything else is optional so a
 * token that never expires — or one managed by a service worker — needs no extra
 * code.
 */
interface AuthProvider {
    /**
     * The current token, or `undefined` when there is none.
     *
     * @remarks
     * May be async, because a cached token is often read through an async store. A
     * throwing implementation is treated as "no token" and reported once through the
     * library's internal diagnostics; it is never allowed to fail a request by
     * throwing out of the header provider.
     */
    readonly getToken: () => string | undefined | Promise<string | undefined>;
    /**
     * Exchange the current credentials for a fresh token.
     *
     * @returns the new token, or `undefined` when the refresh failed
     */
    readonly refreshToken?: (() => Promise<string | undefined>) | undefined;
    /**
     * Whether a token is already stale.
     *
     * @param token - the token to inspect
     *
     * @remarks
     * Optional. When omitted, the library never proactively refreshes and relies on
     * the reactive `401` path instead. That is a deliberate default: guessing at
     * expiry from a token's contents would mean decoding it, and the library does not
     * do that.
     */
    readonly isTokenExpired?: ((token: string) => boolean) | undefined;
    /**
     * Called when the token is gone for good, so the application can redirect to a
     * login screen.
     *
     * @remarks
     * Invoked in exactly two situations, both of them a **lost session**:
     *
     * 1. `createAuthHeaderProvider` — a token *was* present, `isTokenExpired` rejected
     *    it, and `refreshToken` then failed to replace it.
     * 2. `createAuthInterceptor` — a request came back `401` and the refresh attempt
     *    that followed failed.
     *
     * Deliberately **not** called when there is simply no token. That is the normal
     * anonymous state before a user signs in, and firing there would redirect to a
     * login page on every request.
     */
    readonly onUnauthorized?: (() => void | Promise<void>) | undefined;
    /**
     * Discard the current token. Called when authentication is unrecoverable.
     */
    readonly logout?: (() => void | Promise<void>) | undefined;
}
/** Options for {@link createAuthHeaderProvider}. */
interface AuthHeaderProviderOptions {
    /** Header to set. Default `'Authorization'`. */
    readonly headerName?: string | undefined;
    /**
     * Prefix for the token. Default `'Bearer '`.
     *
     * @remarks
     * Set it to `''` for an API key that is sent bare, e.g. `X-API-Key: <key>`.
     */
    readonly scheme?: string | undefined;
    /**
     * Additional headers produced alongside the token.
     *
     * @remarks
     * For a session id, a tenant header, a CSRF token — anything that travels with
     * authentication but is not the token itself.
     */
    readonly getExtraHeaders?: (() => Record<string, string> | Promise<Record<string, string>>) | undefined;
}
/**
 * A header provider for `rest.getHeaders`.
 *
 * @remarks
 * `() => headers` with the refresh policy built in. It never throws and never
 * rejects, because `rest.getHeaders` treats a throwing provider as a retryable
 * sync failure — which would turn an expired session into an upload backlog
 * instead of a clear `401`.
 */
interface AuthHeaderProvider {
    /** Resolve the headers for one request. Never rejects. */
    readonly getHeaders: () => Promise<Record<string, string>>;
    /** Force a refresh, coalesced with any in-flight one. */
    readonly refresh: () => Promise<string | undefined>;
}
/**
 * Build the header-provider half of an {@link AuthProvider}.
 *
 * @param provider - the application's authentication
 * @param options - header name, scheme and any extra headers
 * @returns an {@link AuthHeaderProvider}, ready to pass as `rest.getHeaders`
 *
 * @remarks
 * Behaviour:
 *
 * - A token that {@link AuthProvider.isTokenExpired} rejects is refreshed **before**
 *   the request, so a stale token does not cost a wasted round trip.
 * - If no token can be obtained, the result is an **empty header bag** and
 *   {@link AuthProvider.onUnauthorized} is called — not a throw. The request still
 *   goes out and the server's `401` is the single, visible failure.
 * - Concurrent `refresh()` calls share one in-flight attempt. A page that fires ten
 *   parallel requests with an expired token refreshes once, not ten times.
 *
 * @example
 * ```ts
 * import { createAuthHeaderProvider, setupTelemetry } from '@codewithrajat/rm-logvault';
 *
 * const auth = createAuthHeaderProvider({
 *   getToken: () => sessionStore.token,
 *   refreshToken: async () => (await refreshSession()).token,
 *   isTokenExpired: (token) => jwtExpiry(token) < Date.now(),
 *   onUnauthorized: () => router.push('/login'),
 * });
 *
 * setupTelemetry({
 *   app: 'checkout',
 *   url: '/telemetry',
 *   headers: auth.getHeaders,   // the flat alias for `rest.getHeaders`
 * });
 * ```
 */
declare function createAuthHeaderProvider(provider: AuthProvider, options?: AuthHeaderProviderOptions): AuthHeaderProvider;
/**
 * An {@link HttpInterceptor} that attaches an auth token and reacts to a `401`.
 *
 * @remarks
 * Two hooks:
 *
 * - `onRequest` resolves the token through the same provider, so the HTTP client
 *   and the telemetry uploader share one refresh policy.
 * - `onError` on a `401` performs **one** refresh and then calls
 *   {@link AuthProvider.onUnauthorized} if it failed. It does not re-issue the
 *   request: the client owns its own retry policy, and a silent second request
 *   would double-report the original failure. Re-issue explicitly from your own
 *   code when you want that.
 *
 * @example
 * ```ts
 * import { createAuthInterceptor, createFetchHttpClient } from '@codewithrajat/rm-logvault/http';
 *
 * const http = createFetchHttpClient({ baseUrl: '/api' });
 * http.setInterceptors([createAuthInterceptor(authProvider)]);
 * ```
 */
declare function createAuthInterceptor(provider: AuthProvider): HttpInterceptor;

/**
 * The shipped `fetch` implementation of the HTTP client contract.
 *
 * @remarks
 * Lives on its own subpath (`@codewithrajat/rm-logvault/http`) so an
 * application that uses an axios or ky client pays nothing for this one, and so the
 * core entry keeps its bundle budget (I-8).
 *
 * It is written to the same rules as the rest of the package: every interceptor
 * callback is contained, the abort timer is always cleared, and a failure surfaces
 * as a real `HttpError` carrying only allow-listed request metadata. Unlike the
 * telemetry pipeline it **does** read response bodies — that is the point of an
 * HTTP client — but it never copies them into an error context.
 *
 * @packageDocumentation
 */

/**
 * Create a `fetch`-based {@link HttpClient}.
 *
 * @param options - see {@link HttpClientOptions}
 * @returns an {@link HttpClient}
 *
 * @remarks
 * Behaviour worth knowing:
 *
 * - **The timeout is per attempt.** A `retry: 2` call can take three times
 *   `timeoutMs` before it rejects. Retrying is off by default (`retry: 0`).
 * - **Only `0`, `408`, `429` and `5xx` are retried.** See
 *   {@link isRetryableStatus}.
 * - **A missing `fetch` rejects** with an `HttpError` whose `isNetworkError` is
 *   `true`, rather than throwing a `ReferenceError` from a different module.
 * - **`onError` runs before the rejection**, and its own failure is contained, so
 *   a broken reporter cannot change the outcome of the request.
 *
 * @example
 * ```ts
 * import { createFetchHttpClient } from '@codewithrajat/rm-logvault/http';
 * import { captureError } from '@codewithrajat/rm-logvault';
 *
 * const http = createFetchHttpClient({
 *   baseUrl: '/api',
 *   timeoutMs: 10_000,
 *   retry: 1,
 *   onError: (error, context) => captureError(error, context),
 * });
 *
 * const { data } = await http.get<Order[]>('/orders');
 * ```
 */
declare function createFetchHttpClient(options?: HttpClientOptions): HttpClient;

export { type AuthHeaderProvider, type AuthHeaderProviderOptions, type AuthProvider, DEFAULT_HTTP_RETRY_DELAY_MS, DEFAULT_HTTP_TIMEOUT_MS, type HttpClient, type HttpClientOptions, type HttpError, type HttpInterceptor, type HttpMethod, type HttpRequest, type HttpResponse, type NonRetryableHttpError, buildHttpErrorContext, categoryForHttpStatus, createAuthHeaderProvider, createAuthInterceptor, createFetchHttpClient, isRetryableStatus, resolveRequestUrl, severityForHttpError };
