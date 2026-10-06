import { M as Maybe, h as RecordKind } from './types-vgch86Bo.js';

/**
 * Sync and transport contracts, including the REST wire format.
 *
 * @packageDocumentation
 */

/**
 * A single request handed to a {@link RemoteTransport}.
 *
 * @remarks
 * The transport receives a fully-serialised body and never sees the raw records,
 * which keeps custom transports from accidentally persisting unsanitized data.
 */
interface TransportRequest {
    /** Absolute endpoint URL. */
    readonly url: string;
    /** Request headers, already merged with the caller's `getHeaders()` output. */
    readonly headers: Readonly<Record<string, string>>;
    /** `fetch` credentials mode. */
    readonly credentials: RequestCredentials;
    /** JSON body, exactly as it will be sent. */
    readonly body: string;
    /** Abort budget in milliseconds. */
    readonly timeoutMs: number;
    /** Whether the request may outlive the page (`keepalive`). */
    readonly keepalive: boolean;
    /** Which kind of records the body contains. */
    readonly kind: RecordKind;
}
/** Outcome of one transport attempt. */
interface TransportResponse {
    /** HTTP status, or `0` when the request never reached the server. */
    readonly status: number;
    /**
     * Parsed `Retry-After` delay in milliseconds, when the server sent one.
     *
     * @remarks
     * The header is parsed on **every** response, not just `429` and `503`, and the
     * sync manager schedules the next attempt at
     * `max(backoffDelay(failures), retryAfterMs)`. Parsing it broadly is the safe
     * choice: a server that sends `Retry-After` alongside a `500` means it, and
     * ignoring it would hammer the endpoint. The value is always clamped to
     * {@link BACKOFF_MAX_MS}.
     */
    readonly retryAfterMs?: Maybe<number>;
}
/**
 * The egress seam.
 *
 * @remarks
 * Replacing the transport is how the library grows towards OTLP, Sentry envelopes
 * or `sendBeacon` without those ever becoming hard dependencies. A custom
 * transport is called with an already-sanitized, already-serialised body.
 *
 * @example
 * ```ts
 * import { initTelemetry, type RemoteTransport } from '@codewithrajat/rm-logvault';
 *
 * const transport: RemoteTransport = {
 *   name: 'otlp',
 *   async send(request) {
 *     const response = await fetch(request.url, {
 *       method: 'POST',
 *       headers: request.headers,
 *       body: request.body,
 *       credentials: request.credentials,
 *     });
 *     return { status: response.status };
 *   },
 * };
 *
 * initTelemetry({ appName: 'x', rest: { transport, errorsUrl: '/v1/logs' } });
 * ```
 */
interface RemoteTransport {
    /** Identifier used in status output and internal diagnostics. */
    readonly name?: Maybe<string>;
    /**
     * Send one batch.
     *
     * @param request - the prepared request
     * @returns the response status and optional `Retry-After` hint
     * @throws to signal a retryable network failure
     */
    send(request: TransportRequest): Promise<TransportResponse>;
}
/** REST batch envelope sent to the configured endpoints. */
interface RestBatchBody {
    readonly schemaVersion: 1;
    readonly kind: RecordKind;
    readonly sentAt: number;
    readonly app: {
        readonly appName: string;
        readonly appVersion: string;
        readonly buildId: string;
        readonly environment: string;
    };
    readonly records: readonly unknown[];
}
/** Coarse state of the uploader, surfaced through `getTelemetryStatus()`. */
type SyncStatus = 'idle' | 'running' | 'offline' | 'ok' | 'retry' | 'error';
/** HTTP statuses that will never succeed on retry, so records are marked `failed`. */
declare const TERMINAL_STATUSES: ReadonlySet<number>;
/** Compute exponential backoff for a failure count, capped at {@link BACKOFF_MAX_MS}. */
declare function backoffDelay(failureCount: number): number;
/**
 * Parse a `Retry-After` header.
 *
 * @param value - the raw header value: delta-seconds or an HTTP-date
 * @returns milliseconds to wait, clamped to `[0, BACKOFF_MAX_MS]`, or `undefined`
 *
 * @example
 * ```ts
 * parseRetryAfter('120');                       // 120000
 * parseRetryAfter('Wed, 21 Oct 2026 07:28:00 GMT'); // ms until that instant
 * parseRetryAfter('garbage');                   // undefined
 * ```
 */
declare function parseRetryAfter(value: string | null | undefined): number | undefined;

export { type RemoteTransport as R, type SyncStatus as S, TERMINAL_STATUSES as T, type RestBatchBody as a, type TransportRequest as b, type TransportResponse as c, backoffDelay as d, parseRetryAfter as p };
