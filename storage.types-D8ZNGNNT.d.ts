import { M as Maybe, U as UploadStatus, T as Timestamp, R as Result, a as ErrorRecord } from './types-vgch86Bo.js';

/**
 * Logger constants: level ladder, numeric priorities and reserved prefixes.
 *
 * @packageDocumentation
 */
/** A persistable log level. `off` disables persistence entirely. */
type LogLevel = 'trace' | 'debug' | 'info' | 'warn' | 'error';
/** A console verbosity setting, which additionally accepts `off`. */
type LogLevelSetting = LogLevel | 'off';
/** Numeric priority ladder. Higher wins. */
declare const LOG_LEVEL_PRIORITY: Readonly<Record<LogLevel, number>>;
/** Ascending level order, useful for `>= level` comparisons and UI filters. */
declare const LOG_LEVELS: readonly LogLevel[];
/** Maximum number of log calls buffered before `initTelemetry` runs. */
declare const PRE_INIT_LOG_BUFFER_SIZE = 50;
/** Numeric priority for a level setting. `off` maps to `Infinity` so nothing passes. */
declare function levelPriority(level: LogLevelSetting): number;
/**
 * Whether `actual` is at or above `threshold`.
 *
 * @param actual - the level a record was emitted at
 * @param threshold - the configured minimum
 */
declare function meetsLevel(actual: LogLevel, threshold: LogLevelSetting): boolean;

/**
 * Logger types: the `logger` facade, sinks and the persisted log record.
 *
 * @packageDocumentation
 */

/**
 * Application/environment metadata stamped onto every log record.
 *
 * @remarks
 * Deliberately narrower than the error environment block: logs are high-volume,
 * so only stable application identity is duplicated onto each row.
 */
interface LogEnvironment {
    readonly appName?: Maybe<string>;
    readonly appVersion?: Maybe<string>;
    readonly buildId?: Maybe<string>;
    readonly environment?: Maybe<string>;
}
/**
 * A persisted log entry.
 *
 * @remarks
 * `seq` is a per-page-load monotonic counter that gives deterministic ordering
 * for entries sharing a millisecond timestamp.
 */
interface LogRecord {
    readonly schemaVersion: 1;
    readonly id: string;
    readonly uploadStatus: UploadStatus;
    readonly uploadAttempts: number;
    readonly claimedAt?: Maybe<Timestamp>;
    readonly level: LogLevel;
    readonly message: string;
    readonly data?: Maybe<readonly unknown[]>;
    readonly route?: Maybe<string>;
    readonly pageLoadId: string;
    readonly environment: LogEnvironment;
    readonly timestamp: Timestamp;
    readonly seq: number;
}
/**
 * A destination for emitted log records.
 *
 * @remarks
 * Sinks run **before** the console-level filter, so persistence keeps working in
 * production even when console output is silent. A sink that throws is swallowed,
 * and a sink that logs is protected against re-entrancy.
 */
interface LogSink {
    readonly name?: Maybe<string>;
    /** Called for every record that passes the *persist* level. Must not throw. */
    readonly write: (record: LogRecord) => void;
}
/** A single logged argument list captured at the call site. */
type LogArgs = readonly unknown[];
/**
 * The public logging facade.
 *
 * @example
 * ```ts
 * import { logger } from '@codewithrajat/rm-logvault';
 *
 * logger.info('[Checkout] cart loaded', { items: 3 });
 * logger.error('[Checkout] payment failed', error);
 *
 * const off = logger.addSink({ name: 'my-sink', write: (r) => ship(r) });
 * off(); // unsubscribe
 * ```
 */
interface Logger {
    trace(message: string, ...args: LogArgs): void;
    debug(message: string, ...args: LogArgs): void;
    info(message: string, ...args: LogArgs): void;
    warn(message: string, ...args: LogArgs): void;
    error(message: string, ...args: LogArgs): void;
    /**
     * Register a sink for every persisted record.
     *
     * @returns an unsubscribe function
     */
    addSink(sink: LogSink): () => void;
    /** Set the console verbosity. `off` silences console output but not persistence. */
    setLevel(level: LogLevelSetting): void;
    /** Master enable/disable for the logger. */
    setEnabled(enabled: boolean): void;
    /** Current console level and enabled flag. */
    getConfig(): {
        readonly level: LogLevelSetting;
        readonly enabled: boolean;
    };
}
/**
 * A logger produced by an application that this library can attach to.
 *
 * @remarks
 * Lets `initTelemetry({ logSource })` forward an existing app logger's records
 * into the vault without replacing it.
 */
interface ExternalLogSource {
    addSink(sink: LogSink): () => void;
}

/**
 * Storage contracts: failure classes, cleanup policy and repository interfaces.
 *
 * @packageDocumentation
 */

/**
 * Why a storage operation failed.
 *
 * - `unavailable`   — IndexedDB is missing or blocked (private mode, sandboxed iframe, SSR).
 * - `quota`         — the origin's storage quota was exceeded.
 * - `serialization` — a value could not be structured-cloned (`DataCloneError`).
 * - `transaction`   — any other IndexedDB failure, including aborts and timeouts.
 */
type StorageFailureReason = 'unavailable' | 'quota' | 'serialization' | 'transaction';
/** Outcome of a storage operation. Storage never throws; it returns this. */
type StorageResult<T> = Result<T, StorageFailureReason>;
/**
 * Lifecycle state of the persistence layer, surfaced by `getTelemetryStatus()`.
 *
 * - `initializing` — `initTelemetry` has returned but the backend has not settled.
 *   IndexedDB opens asynchronously, so this is the honest state for the window
 *   between the synchronous `initTelemetry` call and the readiness promise.
 * - `ready`        — the backend is usable.
 * - `unavailable`  — the backend failed to open, so the library is console-only.
 * - `disabled`     — the master switch is off; persistence was never attempted.
 */
type StorageState = 'initializing' | 'ready' | 'unavailable' | 'disabled';
/** Retention and overflow policy applied by `cleanup()`. */
interface CleanupPolicy {
    /** Delete records older than this many days. */
    readonly retentionDays: number;
    /** Hard cap on retained rows; oldest overflow is deleted first. */
    readonly maxRecords: number;
}
/** Summary of one upload/delete pass, returned by `syncTelemetry()`. */
interface FlushSummary {
    /** Records handed to the transport. */
    readonly claimed: number;
    /** Records the server accepted and that were deleted locally. */
    readonly uploaded: number;
    /** Records put back to `pending` after a retryable failure. */
    readonly retried: number;
    /** Records marked terminally `failed`. */
    readonly failed: number;
    /** `true` when the flush stopped early (offline, backoff or error). */
    readonly stopped: boolean;
}
/**
 * Persistence for error records.
 *
 * @remarks
 * Implementations must be safe to call before `initialize()` and must never
 * throw. `claimPending` is the only method that mutates `uploadStatus`, and it
 * must do so atomically so multiple tabs cannot claim the same row.
 */
interface ErrorRepository {
    initialize(): Promise<StorageResult<void>>;
    /** Insert or aggregate a record by `[fingerprint, 'pending']`. */
    save(record: ErrorRecord): Promise<StorageResult<void>>;
    get(id: string): Promise<StorageResult<Maybe<ErrorRecord>>>;
    /** All records, newest `lastSeen` first. */
    getAll(): Promise<StorageResult<ErrorRecord[]>>;
    /** Records in `pending` state, newest first. */
    getPending(limit?: number): Promise<StorageResult<ErrorRecord[]>>;
    /** Atomically move up to `limit` `pending` rows to `uploading`. */
    claimPending(limit: number, now: Timestamp): Promise<StorageResult<ErrorRecord[]>>;
    /** Rows stuck in `uploading` past the lease are returned to `pending`. */
    requeueStale(olderThanMs: number, now: Timestamp): Promise<StorageResult<number>>;
    /** Records in `failed` state, so callers can re-queue them. */
    getFailed(): Promise<StorageResult<ErrorRecord[]>>;
    delete(ids: readonly string[]): Promise<StorageResult<number>>;
    updateUploadStatus(ids: readonly string[], status: UploadStatus): Promise<StorageResult<number>>;
    count(): Promise<StorageResult<number>>;
    /** Number of records still awaiting upload (`pending` plus `uploading`). */
    pendingCount(): Promise<StorageResult<number>>;
    cleanup(policy: CleanupPolicy): Promise<StorageResult<number>>;
    /** Wipe every row (GDPR erasure). */
    clear(): Promise<StorageResult<number>>;
    close(): void;
}
/** Persistence for log records. Mirrors {@link ErrorRepository} without aggregation. */
interface LogRepository {
    initialize(): Promise<StorageResult<void>>;
    saveBatch(records: readonly LogRecord[]): Promise<StorageResult<void>>;
    get(id: string): Promise<StorageResult<Maybe<LogRecord>>>;
    /** All records, newest `timestamp` first. */
    getAll(): Promise<StorageResult<LogRecord[]>>;
    /** Records in `pending` state, oldest first so ordering is preserved. */
    getPending(limit?: number): Promise<StorageResult<LogRecord[]>>;
    /** Atomically move up to `limit` `pending` rows to `uploading`. */
    claimPending(limit: number, now: Timestamp): Promise<StorageResult<LogRecord[]>>;
    /** Rows stuck in `uploading` past the lease are returned to `pending`. */
    requeueStale(olderThanMs: number, now: Timestamp): Promise<StorageResult<number>>;
    /** Records in `failed` state, so callers can re-queue them. */
    getFailed(): Promise<StorageResult<LogRecord[]>>;
    delete(ids: readonly string[]): Promise<StorageResult<number>>;
    updateUploadStatus(ids: readonly string[], status: UploadStatus): Promise<StorageResult<number>>;
    count(): Promise<StorageResult<number>>;
    /** Number of records still awaiting upload (`pending` plus `uploading`). */
    pendingCount(): Promise<StorageResult<number>>;
    cleanup(policy: CleanupPolicy): Promise<StorageResult<number>>;
    /** Wipe every row (GDPR erasure). */
    clear(): Promise<StorageResult<number>>;
    close(): void;
}
/**
 * A complete custom storage backend.
 *
 * @remarks
 * Supply this via `TelemetryOptions.repository` to swap IndexedDB for memory
 * (tests), OPFS, a service worker cache, or a remote store. The shipped
 * in-memory implementation lives at `@codewithrajat/rm-logvault/testing`.
 *
 * @example
 * ```ts
 * import { initTelemetry } from '@codewithrajat/rm-logvault';
 * import { createMemoryRepository } from '@codewithrajat/rm-logvault/testing';
 *
 * const repository = createMemoryRepository();
 * initTelemetry({ appName: 'demo', repository });
 * ```
 */
interface TelemetryRepository {
    readonly errors: ErrorRepository;
    readonly logs: LogRepository;
    /** Shared readiness gate; sync never starts before this resolves `true`. */
    initialize(): Promise<StorageResult<void>>;
    close(): void;
}

export { type CleanupPolicy as C, type ExternalLogSource as E, type FlushSummary as F, type LogLevelSetting as L, PRE_INIT_LOG_BUFFER_SIZE as P, type StorageState as S, type TelemetryRepository as T, type LogRecord as a, type ErrorRepository as b, type LogRepository as c, type LogSink as d, type Logger as e, type LogLevel as f, type StorageFailureReason as g, LOG_LEVELS as h, LOG_LEVEL_PRIORITY as i, type LogEnvironment as j, type StorageResult as k, levelPriority as l, meetsLevel as m };
