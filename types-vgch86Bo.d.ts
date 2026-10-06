/**
 * Shared primitives used across every module.
 *
 * @remarks
 * `exactOptionalPropertyTypes` is enabled project-wide. Record and options
 * interfaces therefore widen every optional member to `T | undefined` so that
 * records can be assembled from partial fragments without conditional spreads.
 * See `docs/DECISIONS.md` (D-002).
 *
 * @packageDocumentation
 */
/** An explicitly-nullable-optional value. Shorthand for `T | undefined`. */
type Maybe<T> = T | undefined;
/** Milliseconds since the Unix epoch. */
type Timestamp = number;
/**
 * Outbox lifecycle state of a persisted record.
 *
 * - `pending`   — waiting to be claimed for upload (or IndexedDB-only forever).
 * - `uploading` — claimed by a flush; protected from aggregation and cleanup.
 * - `uploaded`  — the server accepted it; the row is normally deleted instead.
 * - `failed`    — terminal failure (4xx); excluded from automatic retries.
 */
type UploadStatus = 'pending' | 'uploading' | 'uploaded' | 'failed';
/** Kinds of record the library persists. */
type RecordKind = 'errors' | 'logs';
/**
 * Uniform outcome of an operation that is contractually forbidden from throwing.
 *
 * @remarks
 * The library never throws across its public boundary, so fallible internals
 * return a `Result` instead. `reason` is a closed union so callers can branch on
 * a stable, documented set of failure classes.
 */
type Result<T, R extends string = string> = {
    readonly ok: true;
    readonly value: T;
} | {
    readonly ok: false;
    readonly reason: R;
};

/**
 * Error-domain types: the ingestion contract and the persisted record shape.
 *
 * @packageDocumentation
 */

/**
 * Where an error entered the library.
 *
 * @remarks
 * Every error funnels through a single ingestion point (`captureError`), and this
 * is the discriminator that says which integration produced it.
 *
 * @remarks
 * `vue`, `angular` and `svelte` are additions beyond the original source list,
 * which named only `react`. Reusing `react` for every framework boundary would
 * make the `source` field actively misleading in a report, so each framework gets
 * its own value. See `docs/DECISIONS.md` (D-004).
 */
type ErrorSource = 'react' | 'vue' | 'angular' | 'svelte' | 'api' | 'window' | 'unhandledrejection' | 'resource' | 'chunk' | 'csp' | 'event-handler' | 'worker' | 'query' | 'storage' | 'manual';
/** Impact of the error on the user experience. */
type ErrorSeverity = 'fatal' | 'error' | 'warning' | 'info';
/** Coarse classification used for grouping and dashboards. */
type ErrorCategory = 'runtime' | 'chunk' | 'resource' | 'http' | 'network' | 'timeout' | 'abort' | 'parse' | 'auth' | 'security';
/** What the caller actually threw, before normalisation. */
type ThrownType = 'error' | 'string' | 'number' | 'boolean' | 'object' | 'null' | 'undefined' | 'other';
/** Classification of an HTTP/transport failure. */
type ApiErrorKind = 'auth' | 'abort' | 'timeout' | 'parse' | 'http' | 'network' | 'unknown';
/** Source position of a runtime error. */
interface ErrorLocation {
    readonly source?: Maybe<string>;
    readonly line?: Maybe<number>;
    readonly column?: Maybe<number>;
}
/** One link in a normalised `cause` chain. */
interface ErrorCause {
    readonly name: string;
    readonly message: string;
    readonly stack?: Maybe<string>;
}
/**
 * Correlatable request metadata.
 *
 * @remarks
 * Only ever populated from an explicit allow-list of fields: method, url, status,
 * statusText, code, timeout, duration and the first present correlation header.
 * Request/response bodies, parameters, cookies and arbitrary headers are NEVER read.
 */
interface ApiErrorContext {
    readonly kind: ApiErrorKind;
    readonly method?: Maybe<string>;
    readonly url?: Maybe<string>;
    readonly status?: Maybe<number>;
    readonly statusText?: Maybe<string>;
    readonly code?: Maybe<string>;
    readonly timeout?: Maybe<number>;
    readonly duration?: Maybe<number>;
    readonly requestId?: Maybe<string>;
}
/** Details extracted from a DOM event (`ErrorEvent`, resource error, CSP violation). */
interface ErrorEventInfo {
    readonly type: string;
    readonly targetTag?: Maybe<string>;
    readonly resourceUrl?: Maybe<string>;
    readonly directive?: Maybe<string>;
    readonly blockedURI?: Maybe<string>;
    readonly crossOrigin?: Maybe<string>;
}
/** Page context shared by all records from one page load. */
interface PageInfo {
    readonly url: string;
    readonly route: string;
    readonly pageLoadId: string;
}
/** Application and device metadata captured at ingestion time. */
interface EnvironmentInfo {
    readonly appName?: Maybe<string>;
    readonly appVersion?: Maybe<string>;
    readonly buildId?: Maybe<string>;
    readonly environment?: Maybe<string>;
    readonly userAgent?: Maybe<string>;
    readonly platform?: Maybe<string>;
    readonly viewport?: Maybe<string>;
    readonly online?: Maybe<boolean>;
    readonly visibilityState?: Maybe<string>;
}
/**
 * A persisted, deduplicated error.
 *
 * @remarks
 * Records are aggregated by `fingerprint`: repeated occurrences of the same
 * failure increment `occurrenceCount` and widen `[firstSeen, lastSeen]` instead of
 * appending rows. Aggregation only ever touches `pending` rows, so a row already
 * claimed for upload is immutable.
 */
interface ErrorRecord {
    readonly schemaVersion: 1;
    readonly id: string;
    readonly fingerprint: string;
    readonly uploadStatus: UploadStatus;
    readonly uploadAttempts: number;
    readonly claimedAt?: Maybe<Timestamp>;
    readonly source: ErrorSource;
    readonly severity: ErrorSeverity;
    readonly category: ErrorCategory;
    readonly handled: boolean;
    readonly thrownType: ThrownType;
    readonly name: string;
    readonly message: string;
    readonly stack?: Maybe<string>;
    readonly causes?: Maybe<readonly ErrorCause[]>;
    readonly componentStack?: Maybe<string>;
    readonly location?: Maybe<ErrorLocation>;
    readonly api?: Maybe<ApiErrorContext>;
    readonly event?: Maybe<ErrorEventInfo>;
    readonly page: PageInfo;
    readonly environment: EnvironmentInfo;
    readonly tags?: Maybe<Readonly<Record<string, string>>>;
    readonly extra?: Maybe<Record<string, unknown>>;
    readonly timestamp: Timestamp;
    readonly firstSeen: Timestamp;
    readonly lastSeen: Timestamp;
    readonly occurrenceCount: number;
}
/**
 * Caller-supplied context for {@link ErrorRecord}.
 *
 * @remarks
 * Everything is optional; omitted fields fall back to per-source defaults.
 */
interface ErrorContext {
    readonly source?: Maybe<ErrorSource>;
    readonly severity?: Maybe<ErrorSeverity>;
    readonly category?: Maybe<ErrorCategory>;
    readonly componentStack?: Maybe<string>;
    readonly location?: Maybe<ErrorLocation>;
    readonly api?: Maybe<ApiErrorContext>;
    readonly event?: Maybe<ErrorEventInfo>;
    readonly tags?: Maybe<Record<string, string>>;
    readonly extra?: Maybe<Record<string, unknown>>;
    /** Override the derived `handled` flag. */
    readonly handled?: Maybe<boolean>;
    /** Override the ingestion timestamp (used by pre-init replay and tests). */
    readonly timestamp?: Maybe<Timestamp>;
}
/**
 * The normalised, pre-fingerprint form of a thrown value.
 *
 * @remarks
 * Produced by `normalizeError`, which is contractually forbidden from throwing and
 * always yields one of these — including for hostile inputs such as Proxies,
 * throwing getters and circular `cause` graphs.
 */
interface NormalizedError {
    readonly name: string;
    readonly message: string;
    readonly stack?: Maybe<string>;
    readonly causes?: Maybe<readonly ErrorCause[]>;
    readonly thrownType: ThrownType;
    readonly isChunkError: boolean;
    readonly isCrossOrigin: boolean;
    /** Suggested category derived from the thrown value; the caller may override it. */
    readonly category?: Maybe<ErrorCategory>;
    readonly aggregatedCount?: Maybe<number>;
    readonly extra?: Maybe<Record<string, unknown>>;
}

export type { ApiErrorContext as A, ErrorContext as E, Maybe as M, NormalizedError as N, Result as R, Timestamp as T, UploadStatus as U, ErrorRecord as a, ErrorCategory as b, ErrorSeverity as c, ApiErrorKind as d, ErrorSource as e, ErrorEventInfo as f, ErrorLocation as g, RecordKind as h, ErrorCause as i, ThrownType as j };
