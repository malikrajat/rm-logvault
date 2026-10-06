import { L as LogLevelSetting, a as LogRecord, T as TelemetryRepository, E as ExternalLogSource, F as FlushSummary, b as ErrorRepository, c as LogRepository, S as StorageState, d as LogSink, e as Logger, f as LogLevel, g as StorageFailureReason, C as CleanupPolicy } from './storage.types-D8ZNGNNT.js';
export { h as LOG_LEVELS, i as LOG_LEVEL_PRIORITY, j as LogEnvironment, P as PRE_INIT_LOG_BUFFER_SIZE, k as StorageResult, l as levelPriority, m as meetsLevel } from './storage.types-D8ZNGNNT.js';
import { R as RemoteTransport, S as SyncStatus, a as RestBatchBody } from './sync.types-DFUwO42J.js';
export { T as TERMINAL_STATUSES, b as TransportRequest, c as TransportResponse, d as backoffDelay, p as parseRetryAfter } from './sync.types-DFUwO42J.js';
import { M as Maybe, a as ErrorRecord, T as Timestamp, A as ApiErrorContext, b as ErrorCategory, c as ErrorSeverity, d as ApiErrorKind, E as ErrorContext, N as NormalizedError, e as ErrorSource, f as ErrorEventInfo, g as ErrorLocation, R as Result, h as RecordKind } from './types-vgch86Bo.js';
export { i as ErrorCause, j as ThrownType } from './types-vgch86Bo.js';

/**
 * Public configuration surface and its resolution rules.
 *
 * @remarks
 * Every option is optional and every option has a safe default, so
 * `initTelemetry({ appName: 'x' })` is a complete configuration. Resolution
 * follows one precedence rule everywhere:
 *
 * **explicit option > environment adapter (`fromEnv`) > built-in default**
 *
 * Two defensive rules apply while resolving:
 *
 * - A non-positive, `NaN` or `Infinity` numeric is **ignored**, falling back to
 *   the default. `maxRecords: 0` cannot mean "store nothing"; it means "you made a
 *   mistake", and silently disabling retention would be the surprising outcome.
 * - An unrecognised log-level string is **ignored**, keeping the previous level.
 *   A typo must never be able to turn on verbose persistence.
 *
 * @packageDocumentation
 */

/** Error-capture configuration. */
interface ErrorsOptions {
    /** Capture errors at all. Default `true`. */
    readonly enabled?: Maybe<boolean>;
    /** Hard cap on retained error rows. Default `500`. */
    readonly maxRecords?: Maybe<number>;
    /** Delete errors older than this. Default `7` days. */
    readonly retentionDays?: Maybe<number>;
    /** UTF-8 byte budget per record before progressive reduction. Default `16384`. */
    readonly maxPayloadBytes?: Maybe<number>;
    /** Fixed-window rate limit. Excess is dropped and summarised. Default `120`. */
    readonly maxEventsPerMinute?: Maybe<number>;
    /** Query parameter names whose values survive URL redaction. */
    readonly allowedQueryParams?: Maybe<readonly string[]>;
    /**
     * Call `preventDefault()` on `unhandledrejection`. Default `false`.
     *
     * @remarks
     * Left `false` because the library must never change host application behaviour.
     */
    readonly preventDefaultUnhandledRejection?: Maybe<boolean>;
    /** Attach a capture-phase listener for failed `<script>`/`<link>`/`<img>` loads. Default `false`. */
    readonly captureResources?: Maybe<boolean>;
    /** Listen for `securitypolicyviolation` events. Default `false`. */
    readonly captureCsp?: Maybe<boolean>;
    /** Treat dynamic-import failures as `source: 'chunk'` with `fatal` severity. Default `true`. */
    readonly captureChunkErrors?: Maybe<boolean>;
    /**
     * Last chance to inspect, modify or drop a record before storage.
     *
     * @returns the record to store, or `null` to drop it
     */
    readonly beforeCapture?: Maybe<(record: ErrorRecord) => ErrorRecord | null>;
}
/** Log-capture configuration. */
interface LogsOptions {
    /** Persist logs at all. Default `true`. */
    readonly enabled?: Maybe<boolean>;
    /**
     * Minimum level that is persisted. Default `'warn'`.
     *
     * @remarks
     * Independent of the console level: `setLevel('off')` silences the console while
     * persistence continues.
     */
    readonly level?: Maybe<LogLevelSetting>;
    /**
     * Console verbosity to apply at initialisation.
     *
     * @remarks
     * **No default, and that is deliberate.** When this is omitted the logger keeps
     * whatever level it already has (`'warn'` until someone calls
     * `logger.setLevel(...)`), so initialising telemetry never changes console
     * output on its own. Set it to apply a build-time level — `'off'` in production,
     * `'debug'` in development — without a second call.
     */
    readonly consoleLevel?: Maybe<LogLevelSetting>;
    /** Hard cap on retained log rows. Default `2000`. */
    readonly maxRecords?: Maybe<number>;
    /** Delete logs older than this. Default `3` days. */
    readonly retentionDays?: Maybe<number>;
    /** UTF-8 byte budget per record before progressive reduction. Default `4096`. */
    readonly maxPayloadBytes?: Maybe<number>;
    /** Fixed-window rate limit. Excess is dropped and summarised. Default `600`. */
    readonly maxLogsPerMinute?: Maybe<number>;
    /**
     * How long a buffered log may sit in memory before it is written. Default `1000`
     * milliseconds.
     *
     * @remarks
     * An upper bound, not a poll interval: a write happens as soon as **either** this
     * elapses **or** {@link LogsOptions.writeBatchSize} entries have accumulated,
     * whichever comes first. Lower it if a hard crash loses too much of a burst;
     * raise it to spend fewer IndexedDB transactions on a chatty page.
     */
    readonly writeFlushMs?: Maybe<number>;
    /**
     * Number of buffered entries that triggers an immediate write. Default `50`.
     *
     * @remarks
     * This is the batch size as well as the trigger: one IndexedDB transaction
     * carries up to this many records. Raising it writes more per transaction at the
     * cost of holding more records in memory during a burst.
     */
    readonly writeBatchSize?: Maybe<number>;
    /** Wrap `console.warn`/`console.error` so existing calls are captured. Default `false`. */
    readonly captureConsole?: Maybe<boolean>;
    /**
     * Last chance to inspect, modify or drop a log record before storage.
     *
     * @returns the record to store, or `null` to drop it
     */
    readonly beforeStore?: Maybe<(record: LogRecord) => LogRecord | null>;
}
/** Redaction extensions. */
interface RedactionOptions {
    /** Extra sensitive key names or patterns. Strings match the normalised key exactly. */
    readonly extraSensitiveKeys?: Maybe<readonly (string | RegExp)[]>;
    /** Extra free-text patterns to redact, applied after the built-in rules. */
    readonly extraPatterns?: Maybe<readonly RegExp[]>;
    /** Query parameter names whose values survive redaction, replacing the default list. */
    readonly allowedQueryParams?: Maybe<readonly string[]>;
}
/** REST upload configuration. */
interface RestOptions {
    /** Enable uploads. Default `true` when a valid URL is supplied, otherwise `false`. */
    readonly enabled?: Maybe<boolean>;
    /** Endpoint for error batches. */
    readonly errorsUrl?: Maybe<string>;
    /** Endpoint for log batches. */
    readonly logsUrl?: Maybe<string>;
    /** Delay between successful flushes. Default `30000` ms. */
    readonly intervalMs?: Maybe<number>;
    /** Records per request. Default `50`. */
    readonly batchSize?: Maybe<number>;
    /** `fetch` credentials mode. Default `'same-origin'`. Never implicitly `'include'`. */
    readonly credentials?: Maybe<RequestCredentials>;
    /** Headers provider, awaited per request. A throwing provider is a retryable failure. */
    readonly getHeaders?: Maybe<() => Record<string, string> | Promise<Record<string, string>>>;
    /** Custom transport. Supplying one also activates sync. */
    readonly transport?: Maybe<RemoteTransport>;
    /** Reject plain `http:` endpoints except on localhost. Default `false`. */
    readonly requireHttps?: Maybe<boolean>;
    /** Called once per batch that fails terminally, so the app can re-auth and retry. */
    readonly onTerminalFailure?: Maybe<(status: number, records: readonly {
        id: string;
    }[]) => void>;
}
/** Hidden diagnostics-export shortcut configuration. */
interface ShortcutOptions {
    /** Physical key. A single letter maps to `Key<X>`. Default `'d'`. */
    readonly key?: Maybe<string>;
    /** Require Ctrl. Default `true`. */
    readonly ctrl?: Maybe<boolean>;
    /** Require Shift. Default `true`. */
    readonly shift?: Maybe<boolean>;
    /** Require Alt. Default `true`. */
    readonly alt?: Maybe<boolean>;
    /** Require Meta/Cmd. Default `false`. */
    readonly meta?: Maybe<boolean>;
    /** Event target for the listener. Defaults to `document`. */
    readonly target?: Maybe<EventTarget>;
    /** Gate that must return `true` for the shortcut to fire. */
    readonly allow?: Maybe<() => boolean>;
    /** Downloaded filename prefix. Default `'diagnostics-report'`. */
    readonly filenamePrefix?: Maybe<string>;
    /** Called with the export outcome. */
    readonly onExported?: Maybe<(ok: boolean) => void>;
}
/**
 * The single bootstrap configuration object.
 *
 * @example
 * ```ts
 * import { initTelemetry } from '@codewithrajat/rm-logvault';
 *
 * // Zero config
 * initTelemetry({ appName: 'checkout' });
 *
 * // Everything on
 * initTelemetry({
 *   appName: 'checkout',
 *   appVersion: '2.4.1',
 *   environment: 'production',
 *   errors: { maxRecords: 1000, captureCsp: true, captureResources: true },
 *   logs: { level: 'info', captureConsole: true },
 *   redaction: { allowedQueryParams: ['page', 'locale'] },
 *   rest: { errorsUrl: '/telemetry/errors', logsUrl: '/telemetry/logs' },
 *   shortcut: { key: 'd', allow: () => isInternalUser() },
 * });
 * ```
 */
/**
 * Where captured records are kept.
 *
 * @remarks
 * `'local'` is the default and means the library never touches the network.
 * `'remote'` adds an upload step on top of local persistence — records are always
 * written to IndexedDB first, so an unreachable endpoint costs nothing.
 */
type StorageMode = 'local' | 'remote';
interface TelemetryOptions {
    /** Application name, stamped onto every record. */
    readonly appName?: Maybe<string>;
    /** Application version. */
    readonly appVersion?: Maybe<string>;
    /** Build identifier (commit SHA, CI run id). */
    readonly buildId?: Maybe<string>;
    /** Deployment environment, e.g. `production`. */
    readonly environment?: Maybe<string>;
    /**
     * Shorthand for `rest.errorsUrl` **and** `rest.logsUrl`.
     *
     * @remarks
     * The single-endpoint case: one collector that accepts both kinds. Set one or
     * both of {@link TelemetryOptions.errorUrl} / {@link TelemetryOptions.logUrl} to
     * split them; those win over this.
     */
    readonly url?: Maybe<string>;
    /** Shorthand for `rest.errorsUrl`. */
    readonly errorUrl?: Maybe<string>;
    /** Shorthand for `rest.logsUrl`. */
    readonly logUrl?: Maybe<string>;
    /** Shorthand for `rest.getHeaders`. */
    readonly headers?: Maybe<() => Record<string, string> | Promise<Record<string, string>>>;
    /** Shorthand for `logs.level` — the minimum level that is **persisted**. */
    readonly level?: Maybe<LogLevelSetting>;
    /** Shorthand for `logs.consoleLevel` — the console verbosity applied at init. */
    readonly consoleLevel?: Maybe<LogLevelSetting>;
    /** Shorthand for `logs.captureConsole`. */
    readonly captureConsole?: Maybe<boolean>;
    /** Shorthand for `errors.maxRecords`. */
    readonly maxErrors?: Maybe<number>;
    /** Shorthand for `logs.maxRecords`. */
    readonly maxLogs?: Maybe<number>;
    /** Shorthand for `errors.retentionDays`. */
    readonly errorRetentionDays?: Maybe<number>;
    /** Shorthand for `logs.retentionDays`. */
    readonly logRetentionDays?: Maybe<number>;
    /**
     * The simple front door.
     *
     * @remarks
     * `initTelemetry` accepts an already-flat object through the aliases above, so
     * this is a convenience rather than the only way in: it renames the handful of
     * fields whose flat name differs, and nothing else, then delegates. Prefer
     * {@link setupTelemetry} in a new integration — it reads as one line and the
     * editor offers exactly the options that matter.
     */
    readonly app?: Maybe<string>;
    /** Shorthand for `appVersion`. Used by {@link setupTelemetry}. */
    readonly version?: Maybe<string>;
    /** Shorthand for `buildId`. Used by {@link setupTelemetry}. */
    readonly build?: Maybe<string>;
    /** Master switch. `false` makes every capture call a no-op. Default `true`. */
    readonly enabled?: Maybe<boolean>;
    /**
     * Where records go.
     *
     * - `'local'` **(default)** — IndexedDB only. The library makes **no network
     *   requests at all**, so it works with no backend, in an air-gapped app, in a
     *   locked-down CSP, and with zero configuration.
     * - `'remote'` — write to IndexedDB first (always, so nothing is lost), then
     *   upload to the configured REST endpoints with retry and backoff.
     *
     * @remarks
     * You usually do not need to set this. It **infers** from whether uploads are
     * enabled: `'remote'` when `rest.enabled` is true — which itself defaults to true
     * when a `rest.errorsUrl`, `rest.logsUrl` or custom `rest.transport` is supplied —
     * and `'local'` otherwise. So "no endpoint means no upload" is the behaviour you
     * get by default, and endpoints that are configured but switched off with
     * `rest.enabled: false` correctly report `'local'`.
     *
     * Set it explicitly to be certain:
     *
     * - `mode: 'local'` — force uploads off even if a URL is configured (for
     *   example in tests, or while an endpoint is being stood up).
     * - `mode: 'remote'` — assert that records must be uploaded. If no endpoint is
     *   configured at all, the library stays local and reports
     *   `mode-remote-without-endpoint` through `onInternalError`, rather than
     *   silently discarding records.
     */
    readonly mode?: Maybe<StorageMode>;
    /** Database name prefix. Default `'rm-logvault'`. */
    readonly dbPrefix?: Maybe<string>;
    /**
     * How long to wait for an IndexedDB `open()` before declaring storage
     * unavailable. Default `5000` milliseconds.
     *
     * @remarks
     * A slow open is normal on a cold profile, and an open can hang forever when
     * another tab is holding an upgrade open. This is the upper bound that turns
     * either case into console-only operation instead of a page that waits. Raise it
     * on a slow device where storage is being given up too eagerly; lower it in tests
     * that need a fast failure.
     */
    readonly openTimeoutMs?: Maybe<number>;
    /**
     * Opt in to reading build-time environment variables.
     *
     * @remarks
     * `true` uses {@link DEFAULT_ENV_PREFIXES}; a string or array pins specific
     * prefixes. Values from the environment are applied **under** explicit options,
     * never over them. Default `false`, so the core never inspects `import.meta.env`
     * unless asked.
     */
    readonly env?: Maybe<boolean | string | readonly string[]>;
    readonly errors?: Maybe<ErrorsOptions>;
    readonly logs?: Maybe<LogsOptions>;
    readonly redaction?: Maybe<RedactionOptions>;
    readonly rest?: Maybe<RestOptions>;
    /** `false` disables the shortcut entirely. */
    readonly shortcut?: Maybe<false | ShortcutOptions>;
    /**
     * Consent gate, evaluated before every capture, persist and upload.
     *
     * @returns `true` to allow telemetry; `false` drops silently without storing.
     */
    readonly consent?: Maybe<() => boolean>;
    /** Observe the library's own internal failures without them surfacing to users. */
    readonly onInternalError?: Maybe<(stage: string, error: unknown) => void>;
    /** Swap IndexedDB for a custom backend. See `@codewithrajat/rm-logvault/testing`. */
    readonly repository?: Maybe<TelemetryRepository>;
    /** Attach to an existing application logger that exposes `addSink`. */
    readonly logSource?: Maybe<ExternalLogSource>;
}
/** Fully-resolved error options: every member present. */
interface ResolvedErrorsOptions {
    readonly enabled: boolean;
    readonly maxRecords: number;
    readonly retentionDays: number;
    readonly maxPayloadBytes: number;
    readonly maxEventsPerMinute: number;
    readonly allowedQueryParams: readonly string[];
    readonly preventDefaultUnhandledRejection: boolean;
    readonly captureResources: boolean;
    readonly captureCsp: boolean;
    readonly captureChunkErrors: boolean;
    readonly beforeCapture: ((record: ErrorRecord) => ErrorRecord | null) | undefined;
}
/** Fully-resolved log options: every member present. */
interface ResolvedLogsOptions {
    readonly enabled: boolean;
    readonly level: LogLevelSetting;
    /** `undefined` means "leave the console level as it is". */
    readonly consoleLevel: LogLevelSetting | undefined;
    readonly maxRecords: number;
    readonly retentionDays: number;
    readonly maxPayloadBytes: number;
    readonly maxLogsPerMinute: number;
    readonly writeFlushMs: number;
    readonly writeBatchSize: number;
    readonly captureConsole: boolean;
    readonly beforeStore: ((record: LogRecord) => LogRecord | null) | undefined;
}
/** Fully-resolved redaction options. */
interface ResolvedRedactionOptions {
    readonly extraSensitiveKeys: readonly (string | RegExp)[];
    readonly extraPatterns: readonly RegExp[];
    readonly allowedQueryParams: readonly string[] | undefined;
}
/** Fully-resolved REST options. */
interface ResolvedRestOptions {
    readonly enabled: boolean;
    readonly errorsUrl: string | undefined;
    readonly logsUrl: string | undefined;
    readonly intervalMs: number;
    readonly batchSize: number;
    readonly credentials: RequestCredentials;
    readonly getHeaders: (() => Record<string, string> | Promise<Record<string, string>>) | undefined;
    readonly transport: RemoteTransport | undefined;
    readonly requireHttps: boolean;
    readonly onTerminalFailure: ((status: number, records: readonly {
        id: string;
    }[]) => void) | undefined;
}
/** Fully-resolved shortcut options. */
interface ResolvedShortcutOptions {
    readonly key: string;
    readonly ctrl: boolean;
    readonly shift: boolean;
    readonly alt: boolean;
    readonly meta: boolean;
    readonly target: EventTarget | undefined;
    readonly allow: (() => boolean) | undefined;
    readonly filenamePrefix: string;
    readonly onExported: ((ok: boolean) => void) | undefined;
}
/** Fully-resolved configuration, frozen after `initTelemetry` returns. */
interface ResolvedTelemetryOptions {
    readonly appName: string | undefined;
    readonly appVersion: string | undefined;
    readonly buildId: string | undefined;
    readonly environment: string | undefined;
    readonly enabled: boolean;
    readonly mode: StorageMode;
    readonly dbPrefix: string;
    readonly openTimeoutMs: number;
    readonly errors: ResolvedErrorsOptions;
    readonly logs: ResolvedLogsOptions;
    readonly redaction: ResolvedRedactionOptions;
    readonly rest: ResolvedRestOptions;
    readonly shortcut: false | ResolvedShortcutOptions;
    readonly consent: (() => boolean) | undefined;
    readonly onInternalError: ((stage: string, error: unknown) => void) | undefined;
    readonly repository: TelemetryRepository | undefined;
    readonly logSource: ExternalLogSource | undefined;
}
/** Built-in defaults, exported so documentation and tests share one source of truth. */
declare const DEFAULT_OPTIONS: {
    readonly enabled: true;
    readonly dbPrefix: "rm-logvault";
    /** Shared with the storage layer, so the wrapper's own fallback cannot drift. */
    readonly openTimeoutMs: 5000;
    readonly errors: {
        readonly enabled: true;
        readonly maxRecords: 500;
        readonly retentionDays: 7;
        readonly maxPayloadBytes: 16384;
        readonly maxEventsPerMinute: 120;
        readonly preventDefaultUnhandledRejection: false;
        readonly captureResources: false;
        readonly captureCsp: false;
        readonly captureChunkErrors: true;
    };
    readonly logs: {
        readonly enabled: true;
        readonly level: LogLevelSetting;
        /** No default: omitting it leaves the logger's own level untouched. */
        readonly consoleLevel: undefined;
        readonly maxRecords: 2000;
        readonly retentionDays: 3;
        readonly maxPayloadBytes: 4096;
        readonly maxLogsPerMinute: 600;
        /** Shared with the tracker, so its batching limits cannot drift from these. */
        readonly writeFlushMs: 1000;
        readonly writeBatchSize: 50;
        readonly captureConsole: false;
    };
    readonly rest: {
        readonly intervalMs: 30000;
        readonly batchSize: 50;
        readonly credentials: RequestCredentials;
        readonly requireHttps: false;
    };
};
/**
 * Resolve user options into a frozen, fully-populated configuration.
 *
 * @param options - the caller's (partial) configuration
 * @returns a {@link ResolvedTelemetryOptions} with no `undefined` gaps
 *
 * @example
 * ```ts
 * import { resolveOptions, DEFAULT_OPTIONS } from '@codewithrajat/rm-logvault';
 *
 * resolveOptions({ errors: { maxRecords: -5 } }).errors.maxRecords;
 * // 500 — a non-positive value falls back to the default
 * ```
 */
declare function resolveOptions(options?: TelemetryOptions): ResolvedTelemetryOptions;
/**
 * Names of the two IndexedDB databases derived from `dbPrefix`.
 *
 * @remarks
 * Never throws. A prefix that cannot be interpolated — a `Symbol`, or an object
 * with a hostile `Symbol.toPrimitive` — falls back to the default prefix rather
 * than raising `TypeError` out of an exported function.
 */
declare function databaseNames(dbPrefix: string): {
    readonly errors: string;
    readonly logs: string;
};

/**
 * The upload outbox.
 *
 * @remarks
 * Records are written to IndexedDB first and uploaded second, so an offline user
 * loses nothing and a failing endpoint never costs data. This module owns the
 * "second" half:
 *
 * - **Claim, then send.** `claimPending` flips rows to `uploading` atomically, so
 *   two tabs cannot upload the same record. A claim that is never completed (tab
 *   closed mid-upload) is returned to `pending` by the stale-lease sweep.
 * - **One run at a time.** Concurrent `flush()` calls share a single in-flight run
 *   instead of racing.
 * - **Backoff, not busy-waiting.** Failures schedule the next attempt
 *   exponentially further out, honouring `Retry-After` when the server sends one.
 * - **Never self-inflicted.** Uploads go through the configured transport, not the
 *   application's HTTP client, so an upload failure cannot create a new error.
 *
 * @packageDocumentation
 */

/** Result of one flush run. */
interface FlushResult {
    readonly errors: FlushSummary;
    readonly logs: FlushSummary;
}
/** Options for {@link createSyncManager}. */
interface SyncManagerOptions {
    /** Error repository, or `null` when error capture is disabled. */
    readonly errors: ErrorRepository | null;
    /** Log repository, or `null` when log capture is disabled. */
    readonly logs: LogRepository | null;
    /** Resolved configuration. */
    readonly options: ResolvedTelemetryOptions;
    /** Storage readiness gate. Uploads never start before this returns `true`. */
    readonly isStorageReady: () => boolean;
}
/**
 * The uploader.
 *
 * @remarks
 * Exposed for advanced wiring and tests. Applications normally only observe it
 * through `syncTelemetry()`, `getTelemetryStatus()` and `retryFailedTelemetry()`.
 */
interface SyncManager {
    /** Requeue stale claims, attach the `online` listener and schedule the first run. */
    start(): void;
    /** Clear timers and the `online` listener. In-flight work still settles. */
    stop(): void;
    /** Force a flush. Concurrent calls share one run. */
    flush(keepalive?: boolean): Promise<FlushResult>;
    /** Pull the next scheduled flush forward after new records arrive. */
    notifyNewRecords(): void;
    /** Current uploader state. */
    status(): SyncStatus;
    /** Timestamp of the last fully successful run. */
    lastSync(): Timestamp | undefined;
    /** Move terminally-failed records back to `pending`. Returns how many moved. */
    retryFailed(): Promise<number>;
    /** Whether uploads are configured and valid. */
    isEnabled(): boolean;
    /** Permanently stop the manager: clear timers, listeners and any pending schedule. */
    dispose(): void;
}
/**
 * Create the sync manager.
 *
 * @param syncOptions - see {@link SyncManagerOptions}
 * @returns a {@link SyncManager}
 *
 * @example
 * ```ts
 * import { createSyncManager, createErrorRepository, createLogRepository, resolveOptions } from '@codewithrajat/rm-logvault';
 *
 * const errors = createErrorRepository({ dbName: 'rm-logvault-errors' });
 * const logs = createLogRepository({ dbName: 'rm-logvault-logs' });
 * const manager = createSyncManager({
 *   errors,
 *   logs,
 *   options: resolveOptions({ rest: { errorsUrl: '/telemetry/errors' } }),
 *   isStorageReady: () => true,
 * });
 * manager.start();
 * ```
 */
declare function createSyncManager(syncOptions: SyncManagerOptions): SyncManager;

/**
 * A tiny, throwing-proof event emitter for state observation.
 *
 * @remarks
 * The library deliberately does **not** ship a state container. Frameworks have
 * their own (Redux, Zustand, signals, `useSyncExternalStore`), and picking one
 * would make the package opinionated about something it has no business deciding.
 * What it ships instead is this: a way to observe what the library did, so a
 * consumer's own store can react to it.
 *
 * Three rules make it safe to hand to a host application:
 *
 * 1. **A listener can never break a capture.** Every listener runs inside its own
 *    guarded call, so a throwing subscriber cannot stop the error it was notified
 *    about from being persisted.
 * 2. **An async listener can never produce an unhandled rejection.** A returned
 *    promise is observed and its failure routed to
 *    {@link reportInternalFailure}, which is the whole reason `on` accepts a
 *    possibly-async listener at all.
 * 3. **A listener can unsubscribe during dispatch.** The subscriber set is
 *    snapshotted before iteration, so removing a listener from inside its own
 *    callback — or while an earlier listener is running — is well-defined.
 *
 * @packageDocumentation
 */
/** Every event the library can emit. */
type TelemetryEventType = 'error:captured' | 'log:written' | 'sync:started' | 'sync:completed' | 'sync:failed' | 'record:dropped';
/**
 * The members every event shares.
 *
 * @remarks
 * Deliberately **not** carrying an index signature. One would make each specific
 * payload below unassignable to this base — TypeScript requires every property of
 * a source type to satisfy a target's index signature — so the shared fields live
 * here and the payload-specific ones live on the interfaces that extend it.
 */
interface TelemetryEvent {
    /** Which event this is. */
    readonly type: TelemetryEventType;
    /** Milliseconds since the Unix epoch, stamped by the emitter. */
    readonly timestamp: number;
}
/** An error record was accepted and persisted. */
interface ErrorCapturedEvent extends TelemetryEvent {
    readonly type: 'error:captured';
    /** The record's id. */
    readonly recordId: string;
    /** Stable grouping key for the failure. */
    readonly fingerprint: string;
    readonly severity: string;
    readonly source: string;
    readonly category: string;
    /** Whether the application handled it before it reached the library. */
    readonly handled: boolean;
    /** Occurrences aggregated into this record so far. */
    readonly occurrenceCount: number;
}
/** A log record passed the persist level and reached the sinks. */
interface LogWrittenEvent extends TelemetryEvent {
    readonly type: 'log:written';
    readonly recordId: string;
    readonly level: string;
    /** The already-sanitized message. */
    readonly message: string;
}
/** An upload pass began. */
interface SyncStartedEvent extends TelemetryEvent {
    readonly type: 'sync:started';
    readonly kind: 'errors' | 'logs';
    readonly recordCount: number;
}
/** An upload pass finished. */
interface SyncCompletedEvent extends TelemetryEvent {
    readonly type: 'sync:completed';
    readonly kind: 'errors' | 'logs';
    readonly uploaded: number;
    readonly retried: number;
    readonly failed: number;
}
/** An upload pass ended with records the server rejected terminally. */
interface SyncFailedEvent extends TelemetryEvent {
    readonly type: 'sync:failed';
    readonly kind: 'errors' | 'logs';
    /**
     * HTTP status of the failing batch, or `0` when it was not captured.
     *
     * @remarks
     * `FlushSummary` is a per-kind aggregate over several batch attempts, which can
     * fail for different reasons, so it carries no single status. `0` therefore means
     * **"not captured"**, not "network failure" — do not read it as the transport
     * convention used by `HttpError.statusCode`. Use `recordCount` for the size and
     * `onTerminalFailure` on the REST options when you need the actual status.
     */
    readonly status: number;
    readonly recordCount: number;
}
/** A capture was discarded, with the reason, so a UI can explain the gap. */
interface RecordDroppedEvent extends TelemetryEvent {
    readonly type: 'record:dropped';
    readonly kind: 'errors' | 'logs';
    /** `rate-limit`, `consent`, `payload-limit` or `before-hook`. */
    readonly reason: string;
    readonly count: number;
}
/**
 * Every event payload, keyed by its `type`.
 *
 * @remarks
 * The typed overloads on {@link EventEmitter.emit} are generated from this map, so
 * `emit` refuses a payload whose `type` and body disagree.
 */
interface TelemetryEventMap {
    'error:captured': ErrorCapturedEvent;
    'log:written': LogWrittenEvent;
    'sync:started': SyncStartedEvent;
    'sync:completed': SyncCompletedEvent;
    'sync:failed': SyncFailedEvent;
    'record:dropped': RecordDroppedEvent;
}
/**
 * Any event payload the library can emit.
 *
 * @remarks
 * A discriminated union rather than `TelemetryEvent`, so `switch (event.type)`
 * narrows to the exact payload and a listener can read `event.fingerprint`
 * without a cast.
 */
type TelemetryEventPayload = ErrorCapturedEvent | LogWrittenEvent | SyncStartedEvent | SyncCompletedEvent | SyncFailedEvent | RecordDroppedEvent;
/**
 * A subscriber.
 *
 * @remarks
 * Returning a promise is allowed. The emitter observes it and routes a rejection
 * to the library's internal diagnostics rather than letting it surface as an
 * unhandled rejection.
 */
type TelemetryEventListener = (event: TelemetryEventPayload) => void | Promise<void>;
/**
 * The observer handle exposed on `initTelemetry`'s return value.
 *
 * @example
 * ```ts
 * import { initTelemetry } from '@codewithrajat/rm-logvault';
 *
 * const telemetry = initTelemetry({ appName: 'checkout' });
 *
 * const off = telemetry.events.on('error:captured', (event) => {
 *   badge.textContent = String(Number(badge.textContent) + 1);
 *   void event.fingerprint;
 * });
 *
 * off(); // unsubscribe; safe to call more than once
 * ```
 */
interface EventEmitter {
    /**
     * Subscribe to one event type.
     *
     * @param type - the event to observe
     * @param listener - called for every occurrence
     * @returns an unsubscribe function; calling it twice is safe
     */
    on<T extends TelemetryEventType>(type: T, listener: (event: TelemetryEventMap[T]) => void | Promise<void>): () => void;
    /**
     * Subscribe to every event type.
     *
     * @param listener - called for every occurrence, whatever its type
     * @returns an unsubscribe function; calling it twice is safe
     */
    onAny(listener: TelemetryEventListener): () => void;
    /**
     * Remove a previously registered listener.
     *
     * @param type - the event it was registered for
     * @param listener - the exact function reference passed to `on`
     */
    off<T extends TelemetryEventType>(type: T, listener: (event: TelemetryEventMap[T]) => void | Promise<void>): void;
    /**
     * Emit an event to every matching subscriber.
     *
     * @param event - the payload. Its `type` selects the subscribers; a payload
     * whose body does not match its `type` is a compile error.
     *
     * @remarks
     * Never throws. `timestamp` is stamped by the emitter when the caller did not
     * supply one.
     */
    emit(event: TelemetryEventPayload): void;
    /** Number of listeners for one type, or for all types when omitted. */
    listenerCount(type?: TelemetryEventType): number;
    /** Remove every listener. Called on `destroyTelemetry`. */
    clear(): void;
}
/**
 * Create an {@link EventEmitter}.
 *
 * @returns a fresh emitter. Emitters are not shared: one belongs to one
 * `initTelemetry` installation and is replaced on re-initialization.
 *
 * @example
 * ```ts
 * import { createEventEmitter } from '@codewithrajat/rm-logvault';
 *
 * const events = createEventEmitter();
 * const off = events.on('error:captured', (event) => console.log(event.recordId));
 * off();
 * ```
 */
declare function createEventEmitter(): EventEmitter;

/**
 * Initialization, teardown and status.
 *
 * @remarks
 * `initTelemetry({ appName: 'x' })` is the whole integration. Everything the
 * library does — global handlers, persistence, the outbox, the export shortcut —
 * is wired here, and everything is registered with a {@link CleanupRegistry} so
 * `destroyTelemetry()` provably leaves no listener, timer or open database behind.
 *
 * Both entry points are **idempotent and never throw**. Calling `initTelemetry`
 * twice returns the same handle and installs nothing new (which is what makes HMR
 * and duplicate bundles safe); calling `destroyTelemetry` twice is a no-op.
 *
 * @packageDocumentation
 */

/**
 * The object returned by `initTelemetry`.
 *
 * @remarks
 * A convenience bundle for code that holds a reference rather than importing the
 * module-level functions. Both are equivalent.
 */
interface TelemetryHandle {
    /** The configured application name, if any. */
    readonly appName: string | undefined;
    /** The identifier shared by every record from this page load. */
    readonly pageLoadId: string;
    /** Whether capture is enabled. */
    readonly enabled: boolean;
    /** Persistence state at the moment `initTelemetry` returned. */
    readonly storage: StorageState;
    /**
     * Observe captures, writes and sync runs.
     *
     * @remarks
     * The same object is returned by every `initTelemetry` call, so a reference
     * captured once keeps working across a re-initialization.
     */
    readonly events: EventEmitter;
    /** Tear everything down. Equivalent to {@link destroyTelemetry}. */
    readonly destroy: () => void;
    /** Wait for every buffered write to settle. */
    readonly flush: () => Promise<void>;
    /** Force an upload pass. */
    readonly sync: () => Promise<FlushResult>;
}
/**
 * A synchronous snapshot of the library's state.
 *
 * @remarks
 * `pending` counts are a **snapshot**, refreshed at initialization, after every
 * flush, after a sync and after `clearTelemetryData()`. Reading them does not hit
 * IndexedDB, because this function is synchronous. Call
 * `flushTelemetry()` first if you need a fresh count.
 */
interface TelemetryStatus {
    readonly initialized: boolean;
    /** Where records go: `'local'` (IndexedDB only) or `'remote'` (also uploaded). */
    readonly mode: StorageMode;
    readonly storage: StorageState;
    readonly online: boolean;
    readonly pending: {
        readonly errors: number;
        readonly logs: number;
    };
    readonly droppedByRateLimit: number;
    readonly lastSync: number | undefined;
    readonly syncStatus: SyncStatus;
}
/**
 * The fields {@link setupTelemetry} accepts.
 *
 * @remarks
 * A focused subset of {@link TelemetryOptions}: the identity fields, the flat
 * endpoint aliases, the two log levels, the retention caps and the escape hatches.
 * Everything is optional, and anything omitted takes the same default the nested
 * option would.
 *
 * It is a `Pick` of `TelemetryOptions` rather than a separate shape, so the two
 * cannot drift: adding a field to the simple path is adding it to the real one.
 */
type SimpleTelemetryOptions = Pick<TelemetryOptions, 'app' | 'version' | 'build' | 'environment' | 'url' | 'errorUrl' | 'logUrl' | 'headers' | 'level' | 'consoleLevel' | 'captureConsole' | 'maxErrors' | 'maxLogs' | 'enabled' | 'consent' | 'onInternalError' | 'env'>;
/**
 * The one-line front door to {@link initTelemetry}.
 *
 * @param options - see {@link SimpleTelemetryOptions}. Omitted entirely, this is
 * a complete configuration.
 * @returns the same {@link TelemetryHandle} `initTelemetry` returns. **Never
 * throws.**
 *
 * @remarks
 * This exists because the nested configuration is *precise* but not *short*: the
 * shortest real setup is `rest.errorsUrl`, `rest.logsUrl` and `logs.level`, which
 * is three levels of nesting to express two facts. `setupTelemetry` flattens it.
 *
 * It is deliberately **not** a second configuration system. It forwards to
 * `initTelemetry` unchanged, so:
 *
 * - The two are interchangeable, and can be mixed in one codebase.
 * - It is idempotent in exactly the same way — a second call returns the existing
 *   handle rather than reconfiguring.
 * - Anything it cannot express (adapters, `beforeCapture`, a custom `repository`)
 *   is still available by calling `initTelemetry` with the full options.
 *
 * @example
 * ```ts
 * import { setupTelemetry } from '@codewithrajat/rm-logvault';
 *
 * // Local only — no endpoint, nothing ever leaves the browser.
 * setupTelemetry({ app: 'checkout', version: '2.4.1' });
 *
 * // One collector for both kinds, persisted from `info` up.
 * setupTelemetry({
 *   app: 'checkout',
 *   url: '/telemetry',
 *   level: 'info',
 *   maxErrors: 1000,
 * });
 * ```
 */
declare function setupTelemetry(options?: SimpleTelemetryOptions): TelemetryHandle;
/**
 * Initialize telemetry.
 *
 * @param options - see {@link TelemetryOptions}. Every field is optional; zero
 * config gives IndexedDB persistence, global handlers and the export shortcut.
 * @returns a {@link TelemetryHandle}. **Never throws.**
 *
 * @remarks
 * Idempotent: calling it again returns the existing handle without installing a
 * second set of listeners. Call `destroyTelemetry()` first to reconfigure.
 *
 * @example
 * ```ts
 * import { initTelemetry } from '@codewithrajat/rm-logvault';
 *
 * // Zero config
 * initTelemetry({ appName: 'checkout' });
 *
 * // With uploads and a gated shortcut
 * initTelemetry({
 *   appName: 'checkout',
 *   appVersion: '2.4.1',
 *   errors: { captureCsp: true, captureResources: true },
 *   logs: { level: 'info', captureConsole: true },
 *   rest: { errorsUrl: '/telemetry/errors', logsUrl: '/telemetry/logs' },
 *   shortcut: { allow: () => isInternalUser() },
 * });
 * ```
 */
declare function initTelemetry(options?: TelemetryOptions): TelemetryHandle;
/**
 * Tear down everything `initTelemetry` installed.
 *
 * @remarks
 * Idempotent and **never throws**. It stops dispatch, removes every listener and
 * timer, flushes buffered records, closes both databases, restores any wrapped
 * `console` methods and restores the default sanitizer. The flush and close are
 * asynchronous; the synchronous part (listener removal, dispatch stop) completes
 * before this function returns, so no further capture can occur.
 *
 * @example
 * ```ts
 * import { initTelemetry, destroyTelemetry } from '@codewithrajat/rm-logvault';
 *
 * const handle = initTelemetry({ appName: 'checkout' });
 * // …later, e.g. on unmount of a test harness or a microfrontend teardown
 * destroyTelemetry();
 * ```
 */
declare function destroyTelemetry(): void;
/**
 * Wait until every buffered write has settled.
 *
 * @returns a promise that resolves once the log batch, the error queue and the
 * pending-count snapshot are up to date. **Never rejects.**
 *
 * @example
 * ```ts
 * import { logger, flushTelemetry } from '@codewithrajat/rm-logvault';
 *
 * logger.error('[Checkout] payment failed', error);
 * await flushTelemetry();     // the record is now in IndexedDB
 * ```
 */
declare function flushTelemetry(): Promise<void>;
/**
 * Force an upload pass.
 *
 * @returns one {@link FlushSummary} per record kind. **Never rejects.**
 *
 * @remarks
 * Buffered records are flushed to IndexedDB first, so everything eligible is
 * included in the upload. Concurrent calls share a single run.
 *
 * @example
 * ```ts
 * import { syncTelemetry } from '@codewithrajat/rm-logvault';
 *
 * const { errors, logs } = await syncTelemetry();
 * console.log(`uploaded ${errors.uploaded} errors and ${logs.uploaded} logs`);
 * ```
 */
declare function syncTelemetry(): Promise<FlushResult>;
/**
 * Move terminally-failed records back to `pending` and retry immediately.
 *
 * @returns how many records were re-queued. **Never rejects.**
 *
 * @remarks
 * This exists because a `401` marks a batch `failed` permanently — otherwise a
 * single expired token would silently discard every record captured during the
 * outage. After re-authenticating, call this to re-queue them.
 *
 * @example
 * ```ts
 * import { retryFailedTelemetry } from '@codewithrajat/rm-logvault';
 *
 * await refreshSession();
 * const requeued = await retryFailedTelemetry();
 * ```
 */
declare function retryFailedTelemetry(): Promise<number>;
/**
 * Delete every stored record from both databases.
 *
 * @returns `true` when both databases were cleared. **Never rejects.**
 *
 * @remarks
 * This is the GDPR "right to erasure" primitive. It clears the vault, not the
 * configuration: capture continues afterwards.
 *
 * @example
 * ```ts
 * import { clearTelemetryData } from '@codewithrajat/rm-logvault';
 *
 * await clearTelemetryData();   // user revoked consent
 * ```
 */
declare function clearTelemetryData(): Promise<boolean>;
/**
 * Read a synchronous snapshot of the library's state.
 *
 * @returns a {@link TelemetryStatus}. **Never throws.**
 *
 * @remarks
 * `pending` is a snapshot refreshed at init, after each flush and after a sync —
 * reading it does not touch IndexedDB, which is why this function is synchronous.
 * Call `flushTelemetry()` first when you need current numbers.
 *
 * @example
 * ```ts
 * import { getTelemetryStatus } from '@codewithrajat/rm-logvault';
 *
 * const status = getTelemetryStatus();
 * if (status.storage === 'unavailable') showStorageWarning();
 * console.log(status.pending.errors, 'errors queued');
 * ```
 */
declare function getTelemetryStatus(): TelemetryStatus;
/** Whether `initTelemetry` has completed and not been destroyed. */
declare function isTelemetryInitialized(): boolean;

/**
 * A descriptor for each integration the package ships.
 *
 * @remarks
 * The comparison this library was measured against proposed an "adapter registry" —
 * a lookup that answers "is there a Vue adapter, and what does it export?".
 *
 * It is a real question, and it deserves an answer that cannot go stale. What it
 * does **not** deserve is a runtime registry: a `Map` that each adapter module
 * populates at import time, which reports `[]` for every adapter the application did
 * not happen to import, and which costs every consumer bundle size for information
 * that is constant at build time.
 *
 * So this is a frozen constant instead. It is accurate by construction, tree-shakes
 * to nothing when unused, and the test suite asserts it against the real `package.json`
 * export map — which is a stronger guarantee than self-registration ever gave.
 *
 * @example
 * ```ts
 * import { ADAPTERS, adapterFor } from '@codewithrajat/rm-logvault';
 *
 * ADAPTERS.map((adapter) => adapter.framework);
 * // ['react', 'vue', 'angular', 'axios', 'fetch', 'tanstack-query', 'core', 'core', 'core']
 * // 'core' marks an integration with no framework: /http, /storage and /testing.
 *
 * adapterFor('vue')?.entryPoint;
 * // '@codewithrajat/rm-logvault/vue'
 * ```
 *
 * @packageDocumentation
 */
/** What an integration is for. */
type AdapterKind = 'framework' | 'http-client' | 'storage' | 'transport';
/** One shipped integration. */
interface AdapterDescriptor {
    /** Stable key, matching the subpath. */
    readonly key: string;
    /** Human-readable name. */
    readonly name: string;
    /**
     * The framework or library this integrates with, or `'core'` when it has none.
     */
    readonly framework: string;
    /** Import specifier for the integration. */
    readonly entryPoint: string;
    /** Whether it is part of the core entry rather than a subpath. */
    readonly inCore: boolean;
    /** Roughly the versions it targets. */
    readonly targets: string;
    /** Every export the entry point provides. */
    readonly exports: readonly string[];
    /** What the integration does, in one line. */
    readonly description: string;
    /** How it reports an error, in one line. */
    readonly kind: AdapterKind;
}
/**
 * Every integration the package ships.
 *
 * @remarks
 * Annotated `@__PURE__` so a bundler can drop the whole table when nothing reads it.
 * This matters more than it looks: the `framework` and `key` fields are the literal
 * strings `'react'`, `'vue'` and `'axios'`, and without the annotation they survive
 * into every consumer bundle — wasting bytes, and making `pnpm run size:consumers`
 * report bundled peer dependencies that were never bundled.
 */
declare const ADAPTERS: readonly AdapterDescriptor[];
/**
 * Look up an adapter by subpath key.
 *
 * @param key - the subpath, e.g. `'vue'`
 * @returns the descriptor, or `undefined` when nothing matches
 */
declare function adapterFor(key: string): AdapterDescriptor | undefined;
/**
 * Every distinct framework an adapter integrates with.
 *
 * @returns a sorted list; `'core'` is included for the framework-agnostic ones
 */
declare function adapterFrameworks(): readonly string[];

/**
 * Environment detection and safe global access.
 *
 * @remarks
 * Importing this module must never touch `window` or `indexedDB` at module scope —
 * the package has to be importable in Node, in SSR frameworks and inside Web
 * Workers. Every accessor here is a function that feature-detects on call.
 */
/** Read a property from `globalThis` without ever throwing. */
declare function getGlobal(key: string): unknown;
/**
 * Read a property from an arbitrary object without triggering hostile getters.
 *
 * @param target - the object or function to read from
 * @param key - the property name
 * @returns the value, or `undefined` if reading threw
 *
 * @remarks
 * A function is a valid target. Static members live on constructors and `typeof`
 * reports those as `'function'`, so rejecting anything that is not a plain object
 * made every static lookup return `undefined` — including
 * `URL.createObjectURL`, which the diagnostics download depends on.
 *
 * @example
 * ```ts
 * safeGet(hostileProxy, 'message'); // undefined instead of throwing
 * safeGet(URL, 'createObjectURL'); // the static method, not undefined
 * ```
 */
declare function safeGet(target: unknown, key: string): unknown;
/**
 * Whether a DOM-capable browser environment is present.
 *
 * @example
 * ```ts
 * if (isBrowser()) installDiagnosticsExportShortcut();
 * ```
 */
declare function isBrowser(): boolean;
/** Default bundler prefixes tried by {@link fromEnv}, in priority order. */
declare const DEFAULT_ENV_PREFIXES: readonly string[];
/** The subset of `TelemetryOptions` that {@link fromEnv} can populate. */
interface EnvOptions {
    readonly appName?: string;
    readonly appVersion?: string;
    readonly buildId?: string;
    readonly environment?: string;
    readonly enabled?: boolean;
    readonly dbPrefix?: string;
    /** `TELEMETRY_OPEN_TIMEOUT_MS` — milliseconds to wait for an IndexedDB open. */
    readonly openTimeoutMs?: number;
    /** `ERROR_TRACKING_ENABLED`. */
    readonly errorsEnabled?: boolean;
    /** `ERROR_TRACKING_RETENTION_DAYS` — days; `0` disables age-based deletion. */
    readonly errorsRetentionDays?: number;
    /** `ERROR_TRACKING_MAX_RECORDS` — rows retained. */
    readonly errorsMaxRecords?: number;
    /** `ERROR_TRACKING_MAX_PAYLOAD_BYTES` — UTF-8 byte budget per record. */
    readonly errorsMaxPayloadBytes?: number;
    /** `ERROR_TRACKING_MAX_EVENTS_PER_MINUTE` — `0` disables the limiter. */
    readonly errorsMaxEventsPerMinute?: number;
    /** `LOG_PERSIST_ENABLED`. */
    readonly logsEnabled?: boolean;
    /** `LOG_LEVEL` — the **console** level applied at initialisation. */
    readonly consoleLevel?: string;
    /** `LOG_PERSIST_LEVEL` — the **persist** level. Falls back to `LOG_LEVEL` when empty. */
    readonly persistLevel?: string;
    /** `TELEMETRY_LOG_LEVEL` — legacy name for the persist level. */
    readonly logLevel?: string;
    /** `LOG_PERSIST_RETENTION_DAYS` — days; `0` disables age-based deletion. */
    readonly logsRetentionDays?: number;
    /** `LOG_PERSIST_MAX_RECORDS` — rows retained. */
    readonly logsMaxRecords?: number;
    /** `LOG_PERSIST_MAX_PAYLOAD_BYTES` — UTF-8 byte budget per record. */
    readonly logsMaxPayloadBytes?: number;
    /** `LOG_PERSIST_MAX_LOGS_PER_MINUTE` — `0` disables the limiter. */
    readonly logsMaxLogsPerMinute?: number;
    /** `LOG_PERSIST_WRITE_FLUSH_MS` — upper bound in milliseconds on a buffered log. */
    readonly logsWriteFlushMs?: number;
    /** `LOG_PERSIST_WRITE_BATCH_SIZE` — buffered entries that trigger a write. */
    readonly logsWriteBatchSize?: number;
    /** `TELEMETRY_REST_ENABLED`. */
    readonly restEnabled?: boolean;
    /** `ERROR_TRACKING_REST_URL`. */
    readonly errorsUrl?: string;
    /** `LOG_TRACKING_REST_URL`. */
    readonly logsUrl?: string;
    /** `TELEMETRY_SYNC_INTERVAL_MS` — delay between flush runs, in milliseconds. */
    readonly restIntervalMs?: number;
    /** `TELEMETRY_SYNC_BATCH_SIZE` — records per request. */
    readonly restBatchSize?: number;
}
/**
 * Build telemetry options from build-time environment variables.
 *
 * @param prefix - one prefix, or a list, to search. Defaults to
 * `['VITE_', 'NEXT_PUBLIC_', 'REACT_APP_']`.
 * @returns a partial options object; every field is omitted unless the matching
 * environment variable was present, non-empty and parseable.
 *
 * @remarks
 * Every variable is optional, and the prefix is supplied by the caller so the
 * same names work in any bundler. Variables are shown below without their prefix.
 *
 * **Application identity**
 *
 * | Variable                   | Option                | Default     |
 * | -------------------------- | --------------------- | ----------- |
 * | `APP_NAME`                 | `appName`             | none        |
 * | `APP_VERSION`              | `appVersion`          | none        |
 * | `BUILD_ID`                 | `buildId`             | none        |
 * | `APP_ENV`, `ENVIRONMENT`   | `environment`         | none        |
 * | `TELEMETRY_ENABLED`        | `enabled`             | `true`      |
 * | `TELEMETRY_DB_PREFIX`      | `dbPrefix`            | `rm-logvault` |
 * | `TELEMETRY_OPEN_TIMEOUT_MS` | `openTimeoutMs`      | `5000`      |
 *
 * **Errors — their own IndexedDB store**
 *
 * | Variable                                | Option                      | Unit                          | Default   |
 * | --------------------------------------- | --------------------------- | ----------------------------- | --------- |
 * | `ERROR_TRACKING_ENABLED`                | `errors.enabled`            | boolean                       | `true`    |
 * | `ERROR_TRACKING_RETENTION_DAYS`         | `errors.retentionDays`      | days, `0` = no age deletion   | `7`       |
 * | `ERROR_TRACKING_MAX_RECORDS`            | `errors.maxRecords`         | rows                          | `500`     |
 * | `ERROR_TRACKING_MAX_PAYLOAD_BYTES`      | `errors.maxPayloadBytes`    | UTF-8 bytes                   | `16384`   |
 * | `ERROR_TRACKING_MAX_EVENTS_PER_MINUTE`  | `errors.maxEventsPerMinute` | events per 60 s, `0` = off    | `120`     |
 *
 * **Logs — their own IndexedDB store**
 *
 * | Variable                          | Option                    | Unit                        | Default |
 * | --------------------------------- | ------------------------- | --------------------------- | ------- |
 * | `LOG_PERSIST_ENABLED`             | `logs.enabled`            | boolean                     | `true`  |
 * | `LOG_LEVEL`                       | `logs.consoleLevel`       | level                       | unchanged |
 * | `LOG_PERSIST_LEVEL`               | `logs.level`              | level; empty inherits `LOG_LEVEL` | `warn` |
 * | `LOG_PERSIST_RETENTION_DAYS`      | `logs.retentionDays`      | days, `0` = no age deletion | `3`     |
 * | `LOG_PERSIST_MAX_RECORDS`         | `logs.maxRecords`         | rows                        | `2000`  |
 * | `LOG_PERSIST_MAX_PAYLOAD_BYTES`   | `logs.maxPayloadBytes`    | UTF-8 bytes                 | `4096`  |
 * | `LOG_PERSIST_MAX_LOGS_PER_MINUTE` | `logs.maxLogsPerMinute`   | logs per 60 s, `0` = off    | `600`   |
 * | `LOG_PERSIST_WRITE_FLUSH_MS`      | `logs.writeFlushMs`       | milliseconds                | `1000`  |
 * | `LOG_PERSIST_WRITE_BATCH_SIZE`    | `logs.writeBatchSize`     | entries per write           | `50`    |
 *
 * **REST upload** — errors and logs may post to different endpoints, and IndexedDB
 * stays the offline outbox either way.
 *
 * | Variable                      | Option              | Unit                    | Default        |
 * | ----------------------------- | ------------------- | ----------------------- | -------------- |
 * | `TELEMETRY_REST_ENABLED`      | `rest.enabled`      | boolean                 | `true` when a URL is set |
 * | `ERROR_TRACKING_REST_URL`     | `rest.errorsUrl`    | absolute `http(s)` or a path | none     |
 * | `LOG_TRACKING_REST_URL`       | `rest.logsUrl`      | absolute `http(s)` or a path | none     |
 * | `TELEMETRY_SYNC_INTERVAL_MS`  | `rest.intervalMs`   | milliseconds            | `30000`        |
 * | `TELEMETRY_SYNC_BATCH_SIZE`   | `rest.batchSize`    | records per request     | `50`           |
 *
 * **Legacy aliases**, still read so an earlier configuration keeps working. The
 * specific names above win when both are set: `TELEMETRY_ERRORS_ENABLED`,
 * `TELEMETRY_LOGS_ENABLED`, `TELEMETRY_PERSIST_LEVEL`, `TELEMETRY_LOG_LEVEL`
 * (persist level only — it never sets the console level), `TELEMETRY_ERRORS_URL`,
 * `TELEMETRY_LOGS_URL`.
 *
 * A value that cannot be parsed is ignored, exactly as an invalid option is, so a
 * typo falls back to the default instead of silently changing behaviour.
 *
 * Reading never throws, even when both `import.meta.env` and `process.env` are
 * absent.
 *
 * @example
 * ```ts
 * import { initTelemetry, fromEnv } from '@codewithrajat/rm-logvault';
 *
 * // Apply the whole environment: `options.env` is what `resolveOptions` consults.
 * initTelemetry({ env: true });
 * initTelemetry({ env: 'NEXT_PUBLIC_' });
 *
 * // `fromEnv()` reads the values. Its fields are FLAT, so place the nested ones
 * // yourself — spreading it carries only the six top-level identity fields.
 * const env = fromEnv();
 * initTelemetry({ appName: env.appName, errors: { maxRecords: env.errorsMaxRecords } });
 * ```
 */
declare function fromEnv(prefix?: string | readonly string[]): EnvOptions;

/**
 * A named sink registry: introspection and lifecycle for logger sinks.
 *
 * @remarks
 * `logger.addSink()` has always returned an unsubscribe function, which is enough
 * to *install* a sink. It is not enough to answer the questions that come up once
 * an application has three of them — a persistence sink from `initTelemetry`, a
 * remote sink, a debug overlay:
 *
 * - "Which sinks are currently attached?"
 * - "Remove the one I installed in that other module."
 * - "Is the library's own persistence sink still there, or did a hot reload
 *   detach it?"
 *
 * The registry answers those without adding a second way to install a sink.
 * `logger.addSink(...)` remains *the* installation API; the registry is what sits
 * behind it. A consumer that never touches this module is unaffected, and pays
 * nothing for it beyond a `Map` it never reads.
 *
 * @packageDocumentation
 */

/**
 * A registry entry: what was registered, and under which key.
 */
interface SinkRegistration {
    /** The key the sink was registered under, unique within one registry. */
    readonly key: string;
    /** The sink's own `name`, when it declared one. */
    readonly name: string | undefined;
    /** The sink itself. */
    readonly sink: LogSink;
}
/**
 * A named collection of sinks.
 *
 * @remarks
 * Every member is guarded: a hostile sink or a malformed key is reported through
 * the library's internal diagnostics and then ignored, never thrown.
 */
interface SinkRegistry {
    /**
     * Register a sink under a key.
     *
     * @param key - unique identifier. Registering an existing key **replaces** the
     * previous sink and returns the new unregister function.
     * @param sink - the sink to attach
     * @returns an unregister function; safe to call twice, and it only removes this
     * exact sink (a later registration under the same key is left alone)
     */
    register(key: string, sink: LogSink): () => void;
    /** Remove a sink by key. Returns `true` when one was removed. */
    unregister(key: string): boolean;
    /** The sink registered under a key, if any. */
    get(key: string): LogSink | undefined;
    /** Whether a key is registered. */
    has(key: string): boolean;
    /** Every registration, in insertion order. */
    list(): readonly SinkRegistration[];
    /** Every registered key, in insertion order. */
    keys(): readonly string[];
    /** How many sinks are registered. */
    size(): number;
    /**
     * Send one record to every registered sink.
     *
     * @param record - the already-sanitized record
     *
     * @remarks
     * Throwing sinks are contained individually, so one bad sink cannot stop the
     * others from receiving the record.
     */
    write(record: LogRecord): void;
    /** Remove every sink. Called on `destroyTelemetry`. */
    clear(): void;
}
/**
 * Create a {@link SinkRegistry}.
 *
 * @returns a fresh, empty registry
 *
 * @example
 * ```ts
 * import { createSinkRegistry } from '@codewithrajat/rm-logvault';
 *
 * const registry = createSinkRegistry();
 * registry.register('overlay', { name: 'overlay', write: (record) => render(record) });
 * registry.keys(); // ['overlay']
 * ```
 */
declare function createSinkRegistry(): SinkRegistry;

/**
 * The logging facade, sink dispatch and pre-init buffering.
 *
 * @remarks
 * Three design decisions in this module are load-bearing:
 *
 * 1. **Sinks run before the console filter.** Persistence must keep working in
 *    production, where nobody is watching the console. `setLevel('off')` silences
 *    output without touching what gets stored.
 * 2. **Reserved prefixes are never persisted.** Messages beginning with
 *    `[ErrorTracking]`, `[LogTracking]`, `[Telemetry]` or `[DiagnosticsExport]`
 *    are the library's own diagnostics. Persisting them would create a feedback
 *    loop where each storage warning produces another record.
 * 3. **Re-entrancy is blocked, not just discouraged.** A sink that logs, or a
 *    wrapped `console.warn` called from inside our own writer, is dropped rather
 *    than recursed into.
 *
 * @packageDocumentation
 */

/** Internal controller around the public {@link Logger}. */
interface LoggerController {
    /** The public facade. */
    readonly logger: Logger;
    /** Re-dispatch anything captured before initialization. Idempotent. */
    replayPreInit(): void;
    /** How many pre-init calls are currently held. */
    bufferedCount(): number;
    /** Install or remove the opt-in `console.warn`/`console.error` wrapper. */
    setConsoleCapture(enabled: boolean): void;
    /** Emit through the reserved internal prefix, skipping all sinks. */
    emitInternal(level: LogLevel, message: string, args: readonly unknown[]): void;
    /** The sinks attached to this logger, for inspection and keyed removal. */
    readonly sinks: SinkRegistry;
    /** Restore console wrapping and drop buffered calls. Used by `destroyTelemetry`. */
    reset(): void;
}
/**
 * Create the logger controller.
 *
 * @returns a {@link LoggerController}; the public facade is `controller.logger`
 *
 * @example
 * ```ts
 * import { createLogger } from '@codewithrajat/rm-logvault';
 *
 * const controller = createLogger();
 * controller.logger.addSink({ write: (record) => ship(record) });
 * controller.logger.warn('[Checkout] retrying payment');
 * ```
 */
declare function createLogger(): LoggerController;
/**
 * The logging facade.
 *
 * @example
 * ```ts
 * import { logger } from '@codewithrajat/rm-logvault';
 *
 * logger.info('[Checkout] cart loaded', { items: 3 });
 * logger.error('[Checkout] payment failed', error);
 * ```
 */
declare const logger: Logger;
/**
 * The sink registry behind the module-level {@link logger}.
 *
 * @returns the {@link SinkRegistry} holding every sink attached to the shared
 * logger — including the library's own IndexedDB persistence sink
 *
 * @remarks
 * Read-only introspection and keyed removal. Install a sink with
 * `logger.addSink()`, which is what keeps pre-init replay and the re-entrancy
 * guard working; registering directly in the registry would bypass both.
 *
 * @example
 * ```ts
 * import { getSinkRegistry, logger } from '@codewithrajat/rm-logvault';
 *
 * logger.addSink({ name: 'overlay', write: (record) => render(record) });
 * getSinkRegistry().keys();   // ['@codewithrajat/rm-logvault-indexeddb#1', 'overlay#2']
 *
 * // Detach the overlay later, from anywhere.
 * const entry = getSinkRegistry().list().find((item) => item.name === 'overlay');
 * if (entry !== undefined) getSinkRegistry().unregister(entry.key);
 * ```
 */
declare function getSinkRegistry(): SinkRegistry;

/**
 * Request-failure classification shared by the axios, fetch and TanStack Query
 * adapters.
 *
 * @remarks
 * Two rules govern this module and both are security requirements:
 *
 * 1. **Read an allow-list, nothing else.** Only `method`, `url`, `status`,
 *    `statusText`, `code`, `timeout`, `duration` and the first present correlation
 *    header are ever touched. Request/response **bodies**, `params`, `data`,
 *    cookies and arbitrary headers are never read, so nothing sensitive can reach
 *    the vault through this path.
 * 2. **Never swallow.** Adapters classify the error and rethrow the *original*
 *    rejection unchanged.
 *
 * @packageDocumentation
 */

/** Correlation headers probed in priority order. Never enumerated beyond these. */
declare const CORRELATION_HEADERS: readonly string[];
/**
 * Tag an error as an authentication failure so `captureApiError` classifies it as
 * `auth` with `warning` severity.
 *
 * @param error - the rejection to tag; returned unchanged for chaining
 * @returns the same object, so it can be used inline in an interceptor
 *
 * @example
 * ```ts
 * import { markAuthError } from '@codewithrajat/rm-logvault';
 *
 * axios.interceptors.response.use(undefined, (error) => {
 *   if (error.response?.status === 401) markAuthError(error);
 *   return Promise.reject(error);
 * });
 * ```
 */
declare function markAuthError<T>(error: T): T;
/** Whether an error was tagged by {@link markAuthError}. */
declare function isAuthError(error: unknown): boolean;
/** Minimal description of an outgoing request. */
interface FetchRequestInfo {
    /** HTTP method, e.g. `GET`. */
    readonly method?: string | undefined;
    /** Absolute or relative request URL. */
    readonly url?: string | undefined;
    /** `performance.now()`/`Date.now()` captured before the request was issued. */
    readonly startedAt?: number | undefined;
}
/** What went wrong with a `fetch` call. */
interface FetchFailure {
    /** The rejection reason, when the call rejected (network error, abort, timeout). */
    readonly error?: unknown;
    /** The response, when the call resolved with a non-2xx status. */
    readonly response?: unknown;
    /** Marker set by an abort-on-timeout wrapper. */
    readonly timedOut?: boolean | undefined;
}
/** Classification result shared by both builders. */
interface ApiClassification {
    readonly api: ApiErrorContext;
    readonly category: ErrorCategory;
    readonly severity: ErrorSeverity;
}
/** Map an {@link ApiErrorKind} onto a record category. */
declare function categoryForKind(kind: ApiErrorKind): ErrorCategory;
/**
 * Severity for a classified request failure.
 *
 * @remarks
 * `abort` is `info` because navigating away or typing in a search box aborts
 * requests constantly and is not a defect. `auth` is `warning`. A 4xx `http`
 * failure is `warning`; 5xx and everything else is `error`.
 */
declare function severityForKind(kind: ApiErrorKind, status: number | undefined): ErrorSeverity;
/**
 * Classify an axios-style rejection.
 *
 * @param error - the rejection reason (axios error, fetch error, or anything else)
 * @param startedAt - timestamp captured before the request was issued
 * @returns the API context plus derived `category` and `severity`
 *
 * @remarks
 * Kind resolution order is: `auth` → `abort` → `timeout` → `parse` → `http` →
 * `network` → `unknown`.
 *
 * | Signal | Kind |
 * | --- | --- |
 * | {@link markAuthError} tag | `auth` |
 * | `ERR_CANCELED`, `CanceledError`, `AbortError` | `abort` |
 * | `ECONNABORTED`, `ETIMEDOUT`, `TimeoutError`, aborted-with-`timedOut` | `timeout` |
 * | `SyntaxError`, or `ERR_BAD_RESPONSE` with a 2xx/absent status | `parse` |
 * | any non-2xx status | `http` |
 * | `ERR_NETWORK`, or an axios error with no `response` | `network` |
 * | anything else | `unknown` |
 *
 * @example
 * ```ts
 * import { captureApiError, markAuthError } from '@codewithrajat/rm-logvault';
 *
 * axios.interceptors.response.use(undefined, (error) => {
 *   const startedAt = Date.now() - (error.config?.timeout ?? 0);
 *   captureApiError(error, startedAt);
 *   return Promise.reject(error);        // always rethrow unchanged
 * });
 * ```
 */
declare function buildApiErrorContext(error: unknown, startedAt?: number): ApiClassification;
/**
 * Classify a failed `fetch` call.
 *
 * @param request - the request that was issued (method, url, start timestamp)
 * @param failure - the rejection reason and/or the non-2xx response
 * @returns the API context plus derived `category` and `severity`
 *
 * @remarks
 * Unlike axios, `fetch` rejects only on transport failure; a 500 resolves normally.
 * The fetch adapter therefore reports both shapes through this one builder, and
 * `status === 0` (or an absent response) is classified as `network`.
 *
 * @example
 * ```ts
 * import { captureFetchError } from '@codewithrajat/rm-logvault';
 *
 * const startedAt = Date.now();
 * const response = await fetch('/api/orders');
 * if (!response.ok) {
 *   captureFetchError({ method: 'GET', url: '/api/orders', startedAt }, { response });
 * }
 * ```
 */
declare function buildFetchErrorContext(request: FetchRequestInfo, failure: FetchFailure): ApiClassification;

/**
 * The single error ingestion point.
 *
 * @remarks
 * Every source — global handlers, framework adapters, the HTTP adapters, and
 * manual calls — funnels through `captureError`. That is what makes the
 * guarantees in this file global rather than per-integration:
 *
 * - **It cannot throw.** The whole body is guarded and failures go to
 *   {@link reportInternalFailure}.
 * - **It cannot recurse.** A `capturing` flag drops any error raised while the
 *   pipeline is already running, so an error inside sanitisation cannot produce a
 *   second capture, and so on.
 * - **It cannot double count.** A `WeakSet` remembers object/function errors, so
 *   the same `Error` arriving through a React boundary *and* `window.onerror`
 *   *and* an axios interceptor becomes exactly one record.
 * - **It cannot flood.** A fixed-window rate limit drops excess and reports one
 *   summary when the window rolls.
 * - **It cannot lose pre-init errors.** Failures thrown before `initTelemetry`
 *   runs are normalised immediately (bounded, sanitized, no live object graph
 *   retained) and replayed once application metadata is known.
 *
 * @packageDocumentation
 */

/**
 * The internal error pipeline for one initialization.
 *
 * @remarks
 * Exposed for advanced wiring and tests. Applications normally use the
 * module-level {@link captureError} instead.
 */
interface ErrorTracker {
    /** Normalise, deduplicate and persist a thrown value. Never throws. */
    capture(error: unknown, ctx?: ErrorContext): void;
    /** Ingest an already-normalised error (used to replay the pre-init buffer). */
    captureNormalized(normalized: NormalizedError, ctx: Maybe<ErrorContext>, timestamp: Timestamp): void;
    /** Observe accepted records. Returns an unsubscribe function. */
    subscribe(listener: (record: ErrorRecord) => void): () => void;
    /** Events dropped by the rate limiter in the current window. */
    droppedByRateLimit(): number;
    /** Stop accepting records. */
    destroy(): void;
    /** Persist everything queued and wait for the write chain to settle. */
    flush(): Promise<void>;
}
/** An error captured before `initTelemetry` ran. */
interface BufferedError {
    readonly normalized: NormalizedError;
    readonly ctx: Maybe<ErrorContext>;
    readonly timestamp: Timestamp;
}
/**
 * Capture anything that was thrown.
 *
 * @param error - the thrown value. Any type is accepted, including `null`, a
 * `Symbol`, a hostile Proxy or an `AggregateError`.
 * @param ctx - optional source, tags, severity and correlation context
 *
 * @remarks
 * This function **never throws** and never returns a rejection. It is safe to call
 * from a `catch` block, from a `window.onerror` handler, or from a React error
 * boundary without any further guarding. Calling it before `initTelemetry` buffers
 * the error (up to 50) and replays it once application metadata is known.
 *
 * @example
 * ```ts
 * import { captureError } from '@codewithrajat/rm-logvault';
 *
 * try {
 *   checkout();
 * } catch (error) {
 *   captureError(error, {
 *     source: 'manual',
 *     tags: { flow: 'checkout' },
 *     extra: { cartId },
 *   });
 * }
 * ```
 */
declare function captureError(error: unknown, ctx?: ErrorContext): void;
/**
 * Wrap a handler so a throw or rejection is captured **and then re-thrown**.
 *
 * @param handler - the function to run
 * @param ctx - optional context; `source` defaults to `'event-handler'`
 * @returns exactly what `handler` returned
 *
 * @remarks
 * The error is captured before it propagates, so the application's own error
 * handling is unchanged. For an async handler the returned promise rejects with
 * the **same** error value, not a wrapper.
 *
 * @example
 * ```ts
 * import { withErrorCapture } from '@codewithrajat/rm-logvault';
 *
 * button.addEventListener('click', withErrorCapture(async () => {
 *   await submitOrder();
 * }, { tags: { flow: 'checkout' } }));
 * ```
 */
declare function withErrorCapture<T>(handler: () => T, ctx?: ErrorContext): T;
/**
 * Capture an HTTP client failure with full request context.
 *
 * @param error - the axios-shaped rejection (or any thrown value)
 * @param startedAt - timestamp captured before the request was issued, used to
 * compute `api.duration`
 *
 * @remarks
 * Only an allow-list of request metadata is read — method, url, status,
 * statusText, code, timeout, duration and the first present correlation header.
 * Bodies, parameters, cookies and arbitrary headers are never touched.
 *
 * @example
 * ```ts
 * import { captureApiError } from '@codewithrajat/rm-logvault';
 *
 * axios.interceptors.response.use(undefined, (error) => {
 *   captureApiError(error, error.config?.metadata?.startedAt);
 *   return Promise.reject(error);
 * });
 * ```
 */
declare function captureApiError(error: unknown, startedAt?: number): void;
/**
 * Capture a failed `fetch` call.
 *
 * @param request - the request that was issued
 * @param failure - the rejection reason and/or the non-2xx response
 *
 * @example
 * ```ts
 * import { captureFetchError } from '@codewithrajat/rm-logvault';
 *
 * const startedAt = Date.now();
 * const response = await fetch('/api/orders');
 * if (!response.ok) {
 *   captureFetchError({ method: 'GET', url: '/api/orders', startedAt }, { response });
 * }
 * ```
 */
declare function captureFetchError(request: FetchRequestInfo, failure: FetchFailure): void;

/**
 * Error fingerprinting and deduplication keys.
 *
 * @remarks
 * A fingerprint answers "is this the same bug?" for two failures that are not
 * object-identical: the same handler throwing from the same frame with the same
 * message, across two tabs or two page loads. It is computed from **already
 * sanitized** fields only, so a fingerprint can never leak a secret into an index.
 *
 * @packageDocumentation
 */

/**
 * `cyrb53` — a fast, well-distributed 53-bit string hash.
 *
 * @param input - the string to hash
 * @param seed - hash seed
 * @returns an integer in `[0, 2^53)`
 *
 * @remarks
 * Chosen over a cryptographic digest because fingerprints are computed on the hot
 * error path and are not a security boundary — they are a grouping key. Two
 * independent seeds are combined into a 28-hex-character fingerprint, giving ~106
 * bits and making accidental collisions negligible for realistic error volumes.
 */
declare function cyrb53(input: string, seed?: number): number;
/**
 * Normalise a path for fingerprinting so that instance identifiers do not split
 * one logical route into thousands of groups.
 *
 * @param input - a route, a full URL, or `undefined`
 * @returns the path with the query and fragment dropped, and numeric / UUID /
 * long-hex segments collapsed to `:id`
 *
 * @example
 * ```ts
 * import { normalizePathForFingerprint } from '@codewithrajat/rm-logvault';
 *
 * normalizePathForFingerprint('/asset/103?tab=1');       // '/asset/:id'
 * normalizePathForFingerprint('/asset/104');             // '/asset/:id'
 * normalizePathForFingerprint('/o/8f3c…-…-…');           // '/o/:id'
 * ```
 */
declare function normalizePathForFingerprint(input: string | undefined): string;
/**
 * Pick the most identifying stack frames.
 *
 * @param stack - raw or sanitized stack text
 * @param count - maximum frames to keep
 * @returns the frames joined with `|`, or `''`
 */
declare function topStackFrames(stack: string | undefined, count: number): string;
/** Everything that contributes to a fingerprint. All fields must be pre-sanitized. */
interface FingerprintInput {
    readonly source: ErrorSource | string;
    readonly category: ErrorCategory | string;
    readonly name: string;
    readonly message: string;
    readonly stack?: string | undefined;
    readonly componentStack?: string | undefined;
    /** Already-normalised route, or a raw path that will be normalised here. */
    readonly route?: string | undefined;
    readonly api?: Pick<ApiErrorContext, 'kind' | 'method' | 'url' | 'status'> | undefined;
    readonly event?: Pick<ErrorEventInfo, 'type' | 'resourceUrl' | 'directive'> | undefined;
    readonly location?: ErrorLocation | undefined;
}
/**
 * Build the ordered list of parts hashed into a fingerprint.
 *
 * @param input - see {@link FingerprintInput}
 * @returns the parts, in the documented order
 */
declare function fingerprintParts(input: FingerprintInput): string[];
/**
 * Compute a stable, collision-resistant deduplication fingerprint.
 *
 * @param input - the sanitized record fields that identify the failure
 * @returns a 28-character lowercase hex fingerprint, or an
 * `unfingerprinted-…` token if hashing somehow fails
 *
 * @example
 * ```ts
 * import { fingerprint } from '@codewithrajat/rm-logvault';
 *
 * fingerprint({ source: 'window', category: 'runtime', name: 'TypeError', message: 'x is not a function' });
 * // '3f9a1c2b7d4e01f5b6c7d8e9a0b1'
 * ```
 */
declare function fingerprint(input: FingerprintInput): string;

/**
 * Normalisation of arbitrarily-thrown values into a single shape.
 *
 * @remarks
 * `throw` accepts anything: `undefined`, a `Symbol`, a Proxy whose every getter
 * throws, an object with a circular `cause` graph, or an `AggregateError` with a
 * thousand members. `normalizeError` turns all of them into a {@link NormalizedError}
 * and **never throws** — the final fallback is a hard-coded literal.
 *
 * @packageDocumentation
 */

/** The literal returned when even the fallback path fails. */
declare const UNNORMALIZABLE: NormalizedError;
/**
 * Normalise any thrown value into a {@link NormalizedError}.
 *
 * @param input - the value that was thrown or reported
 * @returns a fully-populated, sanitised, bounded normalised error. Never throws.
 *
 * @remarks
 * Handling order:
 *
 * 1. DOM `Event`/`ErrorEvent` — unwraps `.error` when present, otherwise reports
 *    `"<type> event"`.
 * 2. `AggregateError` — keeps the first {@link MAX_AGGREGATE_ERRORS} sub-errors
 *    and records `aggregatedCount`.
 * 3. Error-like objects (`message` plus `name`/`stack`), including cross-realm and
 *    exotic `Error` subclasses.
 * 4. Non-Error values — primitives, `null`, `undefined`, functions, plain objects
 *    (`NonErrorObject`), and hostile objects whose getters throw.
 * 5. Hard-coded {@link UNNORMALIZABLE} fallback.
 *
 * @example
 * ```ts
 * import { normalizeError } from '@codewithrajat/rm-logvault';
 *
 * normalizeError('boom').thrownType;            // 'string'
 * normalizeError(null).name;                    // 'ThrownNull'
 * normalizeError({ a: 1 }).name;                // 'NonErrorObject'
 * normalizeError(new TypeError('bad')).name;    // 'TypeError'
 * ```
 */
declare function normalizeError(input: unknown): NormalizedError;
/**
 * Redact an already-normalised error a second time, immediately before it is
 * written to storage or embedded in an exported report.
 *
 * @param normalized - the value produced by {@link normalizeError}
 * @returns a redacted copy. Never throws.
 */
declare function sanitizeNormalized(normalized: NormalizedError): NormalizedError;

/**
 * Registered error-context builders: application knowledge, injected into the core.
 *
 * @remarks
 * The library can classify an HTTP failure, a chunk-load error or a React
 * boundary crash, because those are shapes it knows. It cannot know that
 * `code === 'ALARM_NOT_FOUND'` means an alarm-context error, or that
 * `error.status === 402` means "billing" in one team's product and "payment
 * required" in another's.
 *
 * A context builder is how that knowledge gets in without a callback threaded
 * through every `captureError` call site and without the library learning any
 * product vocabulary. Register once at startup; every subsequent capture —
 * including ones from global handlers and third-party adapters, which the
 * application never sees — is classified.
 *
 * @example
 * ```ts
 * import { registerErrorContextBuilder } from '@codewithrajat/rm-logvault';
 *
 * const off = registerErrorContextBuilder({
 *   name: 'alarms',
 *   canHandle: (error) => (error as { code?: string })?.code?.startsWith('ALARM_') === true,
 *   build: () => ({ source: 'api', category: 'runtime', tags: { domain: 'alarms' } }),
 * });
 *
 * off(); // unregister
 * ```
 *
 * @packageDocumentation
 */

/**
 * One registered classifier.
 *
 * @remarks
 * Both members are optional-callable in effect: a throwing `canHandle` is treated
 * as "does not match" and a throwing `build` falls through to the next builder,
 * because a third-party classifier must never be able to swallow a capture.
 */
interface ErrorContextBuilder {
    /**
     * Stable identifier, used to replace or list a registration.
     *
     * @remarks
     * Registering a second builder under an existing name **replaces** the first.
     * That is what makes a hot-reload or a test re-registration idempotent instead
     * of stacking duplicates.
     */
    readonly name: string;
    /**
     * Whether this builder understands the error.
     *
     * @param error - the raw thrown value, exactly as `captureError` received it
     * @param ctx - the caller's own context, when `captureError` was passed one
     * @returns `true` to have {@link ErrorContextBuilder.build} consulted
     */
    readonly canHandle: (error: unknown, ctx?: ErrorContext) => boolean;
    /**
     * Build the context contribution.
     *
     * @param error - the raw thrown value
     * @param ctx - the caller's own context
     * @returns the fields to contribute, or `null` to decline after all
     */
    readonly build: (error: unknown, ctx?: ErrorContext) => ErrorContext | null;
}
/**
 * Register a context builder.
 *
 * @param builder - the classifier. A `name` already present is replaced.
 * @returns an unregister function; calling it twice is safe, and it only removes
 * this exact builder (a later registration under the same name is left alone)
 *
 * @remarks
 * Resolution order is **registration order**, and the first builder whose
 * `canHandle` returns `true` wins. Register the specific classifiers before the
 * general ones.
 *
 * The registry is global and process-wide, shared by every copy of the library in
 * the page — the same mechanism that keeps `captureError` from double-capturing.
 * It is intentionally **not** reset by `destroyTelemetry`: a builder describes the
 * application, not an installation, and a re-init after an HMR reload must not
 * silently lose the classification.
 */
declare function registerErrorContextBuilder(builder: ErrorContextBuilder): () => void;
/**
 * Remove a context builder by name.
 *
 * @param name - the name passed to {@link registerErrorContextBuilder}
 * @returns `true` when a builder was removed
 */
declare function unregisterErrorContextBuilder(name: string): boolean;
/**
 * Remove every context builder.
 *
 * @remarks
 * Intended for tests and for an application that swaps its classification wholesale.
 * Ordinary teardown should use the function returned by
 * {@link registerErrorContextBuilder} instead.
 */
declare function clearErrorContextBuilders(): void;
/**
 * List the registered builders, in resolution order.
 *
 * @returns a snapshot array; mutating it does not affect the registry
 */
declare function listErrorContextBuilders(): readonly ErrorContextBuilder[];
/** How many builders are registered. */
declare function errorContextBuilderCount(): number;
/**
 * Resolve the effective context for one error.
 *
 * @param error - the raw thrown value
 * @param ctx - the caller's explicit context
 * @returns the caller's context enriched by the first matching builder, unchanged
 * when no builder matches. **Never throws.**
 *
 * @remarks
 * The caller's explicit fields always win over a builder's. A builder cannot
 * override `source` on a `captureError(err, { source: 'react' })` call, which is
 * the property that keeps a registration from silently relabelling an integration
 * the application already described correctly.
 *
 * @example
 * ```ts
 * import { resolveErrorContext } from '@codewithrajat/rm-logvault';
 *
 * // With nothing registered this is the identity function.
 * resolveErrorContext(new Error('x'), { tags: { flow: 'checkout' } });
 * ```
 */
declare function resolveErrorContext(error: unknown, ctx?: ErrorContext): ErrorContext;

/**
 * The context builders the library ships, ready to register.
 *
 * @remarks
 * These cover the three shapes a client-side error most often has before anyone
 * writes product-specific logic: an HTTP failure with a response, a request that
 * ran out of time, and a `TypeError` thrown by application code.
 *
 * **Nothing here registers itself.** Importing this module has no effect until
 * {@link installBuiltinContextBuilders} is called, so upgrading the library can
 * never silently change how an existing application classifies its errors.
 *
 * @example
 * ```ts
 * import { installBuiltinContextBuilders, registerErrorContextBuilder } from '@codewithrajat/rm-logvault';
 *
 * // Opt in to all three, in the documented order.
 * const off = installBuiltinContextBuilders();
 *
 * // …or pick one, and add your own domain knowledge ahead of it.
 * registerErrorContextBuilder(httpErrorContextBuilder);
 * registerErrorContextBuilder({
 *   name: 'alarms',
 *   canHandle: (error) => (error as { code?: string })?.code === 'ALARM_NOT_FOUND',
 *   build: () => ({ tags: { domain: 'alarms' } }),
 * });
 *
 * off(); // removes only the ones it installed
 * ```
 *
 * @packageDocumentation
 */

/**
 * Classify an HTTP failure that carries a response.
 *
 * @remarks
 * Delegates to {@link buildApiErrorContext}, which reads only an allow-list of
 * fields — method, url, status, statusText, code, timeout, duration and one
 * correlation header. Request and response **bodies are never read** (I-2).
 *
 * Its `canHandle` requires a response-like object with a numeric `status`, so a
 * plain `TypeError` or a bare `Error` is left for the builders registered after
 * it.
 */
declare const httpErrorContextBuilder: ErrorContextBuilder;
/**
 * Classify a request timeout.
 *
 * @remarks
 * Matched on the message because that is the only signal a timeout carries across
 * `fetch`, axios and `XMLHttpRequest`. Registered **before** the HTTP builder in
 * {@link installBuiltinContextBuilders}, because a timed-out axios request has both
 * a message and sometimes a response, and `timeout` is the more specific
 * classification.
 */
declare const timeoutErrorContextBuilder: ErrorContextBuilder;
/**
 * Classify a `TypeError`.
 *
 * @remarks
 * A `TypeError` in a browser is almost always one of four things: reading a
 * property of `undefined`, calling something that is not a function, a failed
 * `fetch` (`Failed to fetch`), or a bad assignment to a read-only target. Tagging
 * them together separates "our rendering code has a null bug" from "the network
 * is down", which otherwise land in the same bucket.
 */
declare const typeErrorContextBuilder: ErrorContextBuilder;
/**
 * Register every shipped builder, in the order they should resolve.
 *
 * @returns one unregister function that removes exactly the three builders it
 * added; safe to call twice
 *
 * @remarks
 * Order matters and is deliberate:
 *
 * 1. `timeout` — most specific. A timed-out request can also look like an HTTP
 *    failure, and "timeout" is the more useful label.
 * 2. `http` — a response-bearing failure.
 * 3. `type-error` — the general case, last so it cannot shadow either.
 *
 * Register your own domain builders **before** calling this to give them
 * precedence; the registry resolves in registration order.
 *
 * @example
 * ```ts
 * import { installBuiltinContextBuilders } from '@codewithrajat/rm-logvault';
 *
 * const off = installBuiltinContextBuilders();
 * // …later
 * off();
 * ```
 */
declare function installBuiltinContextBuilders(): () => void;

/** Placeholder substituted for anything the sanitizer removes. */
declare const REDACTED = "[REDACTED]";
/**
 * Matched against a lowercased object key with `[-_\s]` stripped out, so that
 * `access_token`, `accessToken` and `ACCESS TOKEN` all normalise to `accesstoken`.
 */
declare const SENSITIVE_KEY_PATTERN: RegExp;
/** Maximum nesting depth walked by `sanitizeValue`. */
declare const MAX_DEPTH = 4;
/** Maximum own enumerable keys copied from a plain object. */
declare const MAX_KEYS = 30;
/** Maximum array items copied from an array. */
declare const MAX_ARRAY_ITEMS = 20;
/** Maximum length of a sanitised free-text/string value. */
declare const MAX_STRING_LENGTH = 2000;
/** Maximum length of an error message. */
declare const MAX_MESSAGE_LENGTH = 1000;
/** Maximum length of an error stack. */
declare const MAX_STACK_LENGTH = 8000;
/** Maximum length of a React/Vue/Angular component stack. */
declare const MAX_COMPONENT_STACK_LENGTH = 4000;
/** Maximum `cause` chain depth normalised into `causes[]`. */
declare const MAX_CAUSE_DEPTH = 3;
/** Maximum number of tags accepted on an error record. */
declare const MAX_TAGS = 20;
/** Maximum log arguments captured per call. */
declare const MAX_LOG_ARGS = 5;
/** Maximum errors buffered before `initTelemetry` runs. */
declare const PRE_INIT_ERROR_BUFFER_SIZE = 50;
/** Query parameter names whose *values* survive redaction by default. */
declare const DEFAULT_ALLOWED_QUERY_PARAMS: readonly string[];
/**
 * Sources that represent an error the application did not explicitly handle.
 * `handled` is derived as `!UNHANDLED_SOURCES.has(source)`.
 */
declare const UNHANDLED_SOURCES: ReadonlySet<string>;

/**
 * Redaction and serialisation of untrusted values.
 *
 * @remarks
 * This module is the library's security boundary. Every record passes through it
 * **before** it is written to IndexedDB and again **before** it is exported or
 * uploaded, so a value that slips through here leaks to disk and to the network.
 *
 * Three invariants hold under all inputs, including hostile ones:
 *
 * 1. **Never throws.** Any internal exception degrades to `[REDACTED]` (text) or
 *    `[Unserializable]` (values). The library fails closed, not open.
 * 2. **Bounded work.** Input is hard-truncated before any regular expression runs,
 *    depth/keys/array-length are capped, so a 5 MB message cannot hang a tab and
 *    no pattern can be driven into catastrophic backtracking.
 * 3. **Bounded, JSON-safe output.** The result of `sanitizeValue` is always
 *    structured-cloneable and `JSON.stringify`-safe.
 *
 * @packageDocumentation
 */
/** Caller-supplied extensions to the default redaction rules. */
interface SanitizerConfig {
    /**
     * Extra key names or patterns treated as sensitive. A string matches the
     * separator-stripped, lowercased key exactly; a `RegExp` is tested against both
     * the raw key and its normalised form.
     */
    readonly extraSensitiveKeys?: readonly (string | RegExp)[] | undefined;
    /** Extra patterns applied to free text after the built-in rules. */
    readonly extraPatterns?: readonly RegExp[] | undefined;
    /** Query parameter names whose values survive redaction. */
    readonly allowedQueryParams?: readonly string[] | undefined;
}
/** The sanitizer surface. Obtain one from {@link createSanitizer}. */
interface Sanitizer {
    /** Scrub one line of free text. Never throws. */
    readonly text: (input: unknown, maxLength?: number) => string;
    /** Scrub an error stack, dropping query-string cache busters. Never throws. */
    readonly stack: (input: unknown, maxLength?: number) => string;
    /** Scrub a URL. Returns `undefined` for non-strings and empty input. */
    readonly url: (input: unknown, maxLength?: number) => string | undefined;
    /** Deep-scrub any value into a bounded, JSON-safe structure. Never throws. */
    readonly value: (input: unknown, key?: string) => unknown;
    /** Whether a key name is treated as sensitive. */
    readonly isSensitiveKey: (key: string) => boolean;
}
/**
 * Build a sanitizer with optional caller-supplied extensions.
 *
 * @param config - extra sensitive keys, extra text patterns and the query
 * parameter allow-list. Invalid entries are ignored rather than throwing.
 * @returns a {@link Sanitizer}
 *
 * @example
 * ```ts
 * import { createSanitizer } from '@codewithrajat/rm-logvault';
 *
 * const sanitize = createSanitizer({
 *   extraSensitiveKeys: ['x-tenant-id', /^internal/i],
 *   extraPatterns: [/\b\d{16}\b/g],           // credit-card-ish
 *   allowedQueryParams: ['page', 'locale'],
 * });
 *
 * sanitize.text('token=abc123 page=2');
 * // 'token=[REDACTED] page=2'
 * ```
 */
declare function createSanitizer(config?: SanitizerConfig): Sanitizer;
/**
 * Scrub one line of free text.
 *
 * @param input - any value; non-strings are coerced via `.message` or `String()`
 * @param maxLength - character budget, default `2000`
 * @returns the scrubbed text. Never throws; returns `[REDACTED]` on failure.
 *
 * @example
 * ```ts
 * import { sanitizeText } from '@codewithrajat/rm-logvault';
 *
 * sanitizeText('GET /me failed with Authorization: Bearer eyJhbGciOi...');
 * // 'GET /me failed with Authorization: Bearer [REDACTED]'
 *
 * sanitizeText('mail me at dev@example.com');
 * // 'mail me at [REDACTED]'
 * ```
 */
declare function sanitizeText(input: unknown, maxLength?: number): string;
/**
 * Scrub a URL, redacting credentials, fragments and every non-allow-listed query value.
 *
 * @param input - the candidate URL
 * @param maxLength - character budget, default `2000`
 * @returns the scrubbed URL, or `undefined` when the input is not a non-empty string
 *
 * @example
 * ```ts
 * import { sanitizeUrl } from '@codewithrajat/rm-logvault';
 *
 * sanitizeUrl('https://u:p@api.test/v1/users/42?token=abc&page=2#top');
 * // 'https://api.test/v1/users/42?token=[REDACTED]&page=2'
 *
 * sanitizeUrl('/orders/103?email=a@b.co');
 * // '/orders/103?email=[REDACTED]'
 * ```
 */
declare function sanitizeUrl(input: unknown, maxLength?: number): string | undefined;
/**
 * Scrub an error stack, dropping Vite-style `?t=` cache busters first.
 *
 * @param input - the stack text
 * @param maxLength - character budget, default `8000`
 *
 * @example
 * ```ts
 * import { sanitizeStack } from '@codewithrajat/rm-logvault';
 *
 * sanitizeStack('at App (/src/App.tsx?t=1712345:12:3)');
 * // 'at App (/src/App.tsx:12:3)'
 * ```
 */
declare function sanitizeStack(input: unknown, maxLength?: number): string;
/**
 * Deep-scrub any value into a bounded, JSON-safe structure.
 *
 * @param input - the value to scrub
 * @param key - optional property name; a sensitive name forces `[REDACTED]`
 *
 * @example
 * ```ts
 * import { sanitizeValue } from '@codewithrajat/rm-logvault';
 *
 * sanitizeValue({ user: 'ada', accessToken: 'abc', deep: { a: { b: { c: 1 } } } });
 * // { user: 'ada', accessToken: '[REDACTED]', deep: { a: { b: '[MaxDepth]' } } }
 *
 * const circular: Record<string, unknown> = {};
 * circular.self = circular;
 * sanitizeValue(circular); // { self: '[Circular]' }
 * ```
 */
declare function sanitizeValue(input: unknown, key?: string): unknown;
/** Whether a key name is treated as sensitive by the active rules. */
declare function isSensitiveKey(key: string): boolean;
/** Access the sanitizer currently in force. */
declare function getDefaultSanitizer(): Sanitizer;

/**
 * Global browser error handlers.
 *
 * @remarks
 * Installing a `window.onerror` handler is one of the most invasive things a
 * library can do, so this module follows a strict contract:
 *
 * - **Never overwrite.** A pre-existing `window.onerror` is chained: it is called
 *   and *its* return value is returned, so the application's decision about
 *   suppressing the default console message still stands.
 * - **Never detach someone else's work.** On cleanup we restore the previous
 *   handler *only* if `window.onerror` is still ours. If application code chained
 *   on top of us, we stay installed but **inert**: we keep forwarding to the
 *   original handler and capture nothing.
 * - **One registration.** Multiple installs (duplicate bundles, HMR, two
 *   frontends) merge into a single set of listeners with a single cleanup, so an
 *   error is never captured twice by the same mechanism.
 * - **Never the cause of an error.** Every callback is wrapped, and every
 *   `addEventListener` call is guarded.
 *
 * @packageDocumentation
 */

/** Options accepted by {@link installGlobalErrorHandlers}. */
interface GlobalHandlerOptions {
    /** Call `preventDefault()` on `unhandledrejection`. Default `false`. */
    readonly preventDefaultUnhandledRejection?: boolean | undefined;
    /** Attach a capture-phase listener for failed resource loads. Default `false`. */
    readonly captureResources?: boolean | undefined;
    /** Listen for `securitypolicyviolation`. Default `false`. */
    readonly captureCsp?: boolean | undefined;
    /** Classify dynamic-import failures as `source: 'chunk'`. Default `true`. */
    readonly captureChunkErrors?: boolean | undefined;
    /**
     * Sink for every captured error.
     *
     * @remarks
     * Called synchronously from the DOM listener. Implementations must not throw;
     * they are wrapped regardless.
     */
    readonly onError: (error: unknown, ctx: ErrorContext) => void;
}
/**
 * Install the global error handlers.
 *
 * @param options - see {@link GlobalHandlerOptions}
 * @returns a cleanup function. Idempotent, and safe to call when the handlers
 * were never attached (SSR, workers without `self`).
 *
 * @remarks
 * Multiple calls **merge**: registering twice, or from two copies of the library,
 * produces one set of DOM listeners that fans out to both callbacks, and one
 * cleanup that removes each independently.
 *
 * @example
 * ```ts
 * import { installGlobalErrorHandlers, captureError } from '@codewithrajat/rm-logvault';
 *
 * const cleanup = installGlobalErrorHandlers({
 *   onError: (error, ctx) => captureError(error, ctx),
 *   captureCsp: true,
 * });
 *
 * cleanup(); // removes exactly this registration
 * ```
 */
declare function installGlobalErrorHandlers(options: GlobalHandlerOptions): () => void;
/** Number of merged registrations. Used by tests and diagnostics. */
declare function globalHandlerCount(): number;
/** Whether listeners are currently attached. Used by tests and diagnostics. */
declare function globalHandlersAttached(): boolean;

/**
 * Diagnostics export: flush, read everything, build one file, download it.
 *
 * @remarks
 * The export is the last line of support, so it is deliberately forgiving:
 *
 * - It **never throws**; it returns `false`.
 * - It reads **all** records regardless of upload status, so a record stuck in
 *   `failed` or still `pending` is still in the report.
 * - It **flushes first**, so a log written a millisecond ago is included.
 * - It marshals large sets in 500-record slices with a yield between slices, so a
 *   50 000-row vault does not freeze the tab.
 * - It **defers `revokeObjectURL`**, because revoking synchronously after
 *   `click()` cancels the download in some Safari versions.
 *
 * @packageDocumentation
 */
/** Records marshalled per slice before yielding to the event loop. */
declare const EXPORT_SLICE_SIZE = 500;
/**
 * Output format of the export.
 *
 * @remarks
 * - `'html'` — the self-contained report, with the JSON payload embedded.
 * - `'json'` — one document: `{ schemaVersion, generatedAt, app, page, errors, logs }`.
 * - `'jsonl'` — one JSON object per line, `{"kind":"error",…}` or `{"kind":"log",…}`.
 *   Made for `grep`, `jq` and a log pipeline.
 * - `'csv'` — a single wide table, one row per record, openable in a spreadsheet.
 */
type DiagnosticsFormat = 'html' | 'json' | 'jsonl' | 'csv';
/** Options for {@link exportDiagnosticsReport}. */
interface DiagnosticsExportOptions {
    /** Output format. Default `'html'`. */
    readonly format?: DiagnosticsFormat | undefined;
    /**
     * Copy the report to the clipboard instead of downloading it.
     *
     * @remarks
     * Feature-detected; when the Clipboard API is unavailable the call returns
     * `false` rather than falling back to a download the user did not ask for.
     */
    readonly copyToClipboard?: boolean | undefined;
    /**
     * Indent the JSON output for readability.
     *
     * @remarks
     * Applies to `'json'` only. It is deliberately ignored by `'jsonl'`, where an
     * indented object would break the one-record-per-line contract.
     */
    readonly pretty?: boolean | undefined;
    /**
     * Re-run the sanitizer over every record before export. Default `false`.
     *
     * @remarks
     * Redaction already happened before storage. Enable this when the redaction
     * configuration changed after the records were written, or when exporting for a
     * third party and you want a documented second pass.
     */
    readonly redactAgain?: boolean | undefined;
    /** Filename prefix. Defaults to the shortcut's `filenamePrefix`, then `'diagnostics-report'`. */
    readonly filenamePrefix?: string | undefined;
    /**
     * Called as records are marshalled, so a UI can show progress.
     *
     * @param processed - records marshalled so far
     * @param total - total records, errors plus logs
     *
     * @remarks
     * Invoked once per {@link EXPORT_SLICE_SIZE} records and once at the end. A
     * throwing callback is contained.
     */
    readonly onProgress?: ((processed: number, total: number) => void) | undefined;
    /** Called with the outcome. */
    readonly onExported?: ((ok: boolean) => void) | undefined;
}
/** What {@link exportDiagnosticsReport} produced. */
interface DiagnosticsExportResult {
    /** `true` when a download or clipboard write was initiated. */
    readonly ok: boolean;
    /** The format actually used. */
    readonly format: DiagnosticsFormat;
    /** Size of the produced payload in UTF-8 bytes. */
    readonly bytes: number;
}
/** Whether an export is currently running. */
declare function isExportInFlight(): boolean;
/**
 * Columns of the `'csv'` export, in order.
 *
 * @remarks
 * One table holds both kinds, distinguished by the leading `kind` column, rather
 * than emitting two files. A CSV export exists to be sorted and pivoted in a
 * spreadsheet, and two tables in one file cannot be. Errors and logs therefore
 * share these columns and leave the ones that do not apply empty.
 */
declare const DIAGNOSTICS_CSV_COLUMNS: readonly string[];
/** Build the download filename from a prefix and extension. */
declare function diagnosticsFilename(prefix: string, extension: string): string;
/**
 * Build and download a complete diagnostics report.
 *
 * @param options - see {@link DiagnosticsExportOptions}
 * @returns a {@link DiagnosticsExportResult}. `ok` is `true` when a download or
 * clipboard write was initiated. **Never throws.**
 *
 * @remarks
 * Concurrent calls are rejected with `ok: false`: a second shortcut press while the
 * first export is still marshalling records is a double-click, not a request for two
 * files.
 *
 * @example
 * ```ts
 * import { exportDiagnosticsReport } from '@codewithrajat/rm-logvault';
 *
 * // Default: self-contained HTML download
 * await exportDiagnosticsReport();
 *
 * // Machine-readable, re-redacted, straight to the clipboard
 * await exportDiagnosticsReport({ format: 'json', redactAgain: true, copyToClipboard: true });
 *
 * // One JSON object per line, for a log pipeline
 * const { bytes } = await exportDiagnosticsReport({ format: 'jsonl', pretty: false });
 * ```
 */
declare function exportDiagnosticsReport(options?: DiagnosticsExportOptions): Promise<DiagnosticsExportResult>;

/**
 * Second-pass redaction of persisted records.
 *
 * @remarks
 * Records are already sanitized before they reach storage. This pass exists
 * because the redaction rules are **configuration**, and configuration can change
 * between the moment a record was written and the moment a report is exported — a
 * new `extraSensitiveKeys` entry, a tightened query allow-list, or simply a
 * support engineer exporting with `redactAgain: true` to be certain.
 *
 * Running the sanitiser over a record a second time is idempotent: redacting an
 * already-redacted value yields the same placeholder.
 *
 * @packageDocumentation
 */

/**
 * Re-run the sanitizer over an error record.
 *
 * @param record - the stored record
 * @returns a redacted copy. Never throws.
 *
 * @example
 * ```ts
 * import { sanitizeErrorRecord } from '@codewithrajat/rm-logvault';
 *
 * const safe = sanitizeErrorRecord(record);
 * ```
 */
declare function sanitizeErrorRecord(record: ErrorRecord): ErrorRecord;
/**
 * Re-run the sanitizer over a log record.
 *
 * @param record - the stored record
 * @returns a redacted copy. Never throws.
 *
 * @example
 * ```ts
 * import { sanitizeLogRecord } from '@codewithrajat/rm-logvault';
 *
 * const safe = sanitizeLogRecord(record);
 * ```
 */
declare function sanitizeLogRecord(record: LogRecord): LogRecord;

/**
 * The self-contained HTML diagnostics report.
 *
 * @remarks
 * The report is the artefact a support engineer actually receives, so it has to be
 * safe to open, safe to email, and safe to open again from `file://` with no
 * network. Three rules make that true:
 *
 * 1. **Record data is never interpolated into markup.** It is written once into
 *    `<script type="application/json" id="diagnostics-data">` with `<`, `>`, `&`,
 *    `U+2028` and `U+2029` escaped, so no record content can terminate the script
 *    element or start a new one.
 * 2. **The viewer never uses `innerHTML`.** Every value reaches the DOM through
 *    `textContent` or `document.createElement`, so a message containing
 *    `<img onerror=…>` renders as those literal characters.
 * 3. **Nothing is fetched.** No remote scripts, fonts or images; the embedded CSP
 *    (`default-src 'none'`) makes that structural rather than aspirational.
 *
 * @packageDocumentation
 */

/** Metadata block rendered above the tables. */
interface ReportMeta {
    /** ISO-8601 generation timestamp. */
    readonly generatedAt: string;
    readonly appName: string;
    readonly appVersion: string;
    readonly buildId: string;
    readonly environment: string;
    /** Sanitized page URL the report was taken from. */
    readonly url: string;
    /** Sanitized user agent. */
    readonly userAgent: string;
    /** Whether the browser reported itself online at export time. */
    readonly online: boolean;
    readonly errorCount: number;
    readonly logCount: number;
}
/** The JSON document embedded in the report. */
interface ReportPayload {
    readonly schemaVersion: number;
    readonly generatedAt: string;
    readonly app: {
        readonly appName: string;
        readonly appVersion: string;
        readonly buildId: string;
        readonly environment: string;
    };
    readonly page: {
        readonly url: string;
        readonly userAgent: string;
        readonly online: boolean;
    };
    readonly errors: readonly ErrorRecord[];
    readonly logs: readonly LogRecord[];
}
/** Warning shown at the top of every report. */
declare const REPORT_PRIVACY_BANNER = "This report may contain personal data (page URLs, browser details, application messages). Review before sharing.";
/**
 * Escape a value for interpolation into HTML text or an attribute.
 *
 * @param value - the raw text
 * @returns the escaped text
 *
 * @example
 * ```ts
 * import { escapeHtml } from '@codewithrajat/rm-logvault';
 *
 * escapeHtml('<img src=x onerror=alert(1)>');
 * // '&lt;img src=x onerror=alert(1)&gt;'
 * ```
 */
declare function escapeHtml(value: string): string;
/**
 * Escape JSON *text* so it is safe inside a `<script type="application/json">` element.
 *
 * @param json - already-serialised JSON
 * @returns the same JSON with `<`, `>`, `&`, `U+2028` and `U+2029` `\u`-escaped
 *
 * @remarks
 * Split out from {@link encodeJsonForHtml} so a caller that assembles the payload
 * in slices can serialise first and escape once.
 */
declare function escapeJsonText(json: string): string;
/**
 * Serialise a value for safe embedding inside a `<script type="application/json">` element.
 *
 * @param value - any JSON-serialisable value
 * @returns JSON text in which `<`, `>`, `&`, `U+2028` and `U+2029` are `\u`-escaped
 *
 * @remarks
 * `\u003c` is a valid JSON escape, so `JSON.parse` returns the original string
 * unchanged. Because `<` can no longer appear literally, `</script>` cannot occur
 * in the output and the script element cannot be terminated early.
 *
 * @example
 * ```ts
 * import { encodeJsonForHtml } from '@codewithrajat/rm-logvault';
 *
 * encodeJsonForHtml({ m: '</script><img onerror=alert(1)>' });
 * // '{"m":"\\u003c/script\\u003e\\u003cimg onerror=alert(1)\\u003e"}'
 * ```
 */
declare function encodeJsonForHtml(value: unknown): string;
/** Build the JSON payload embedded in the report. */
declare function buildReportPayload(meta: ReportMeta, errors: readonly ErrorRecord[], logs: readonly LogRecord[]): ReportPayload;
/**
 * Render the complete, self-contained diagnostics report.
 *
 * @param meta - report metadata
 * @param errors - error records to embed (already sanitized)
 * @param logs - log records to embed (already sanitized)
 * @param encodedPayload - pre-serialised, HTML-escaped payload JSON. Supplying it
 * lets the caller assemble the JSON in slices so a very large report does not
 * block the main thread; when omitted the payload is serialised here.
 * @returns a standalone HTML document as a string
 *
 * @example
 * ```ts
 * import { renderDiagnosticsReport } from '@codewithrajat/rm-logvault';
 *
 * const html = renderDiagnosticsReport(meta, errors, logs);
 * // '<!doctype html><html …'
 * ```
 */
declare function renderDiagnosticsReport(meta: ReportMeta, errors: readonly ErrorRecord[], logs: readonly LogRecord[], encodedPayload?: string): string;

/**
 * The hidden keyboard shortcut that produces a diagnostics report.
 *
 * @remarks
 * The shortcut exists so a support engineer can say "press Ctrl+Shift+Alt+D and
 * send me the file" without shipping a debug menu, a query-string flag or a
 * customer-specific build.
 *
 * Two things are worth being explicit about:
 *
 * - **It is obscurity, not access control.** The report contains only data
 *   already stored locally on that machine, and that data is already sanitized.
 *   Anyone who knows the shortcut can produce a report; if that is unacceptable,
 *   gate it with `allow()` — for example on an internal-users flag.
 * - **It must survive hostile layouts and hostile pages.** Matching is done on
 *   `KeyboardEvent.code` (the *physical* key) with `event.key` as a fallback,
 *   because `Alt`+letter mangles `event.key` on AZERTY, Dvorak, AltGr and macOS
 *   Option layouts. The listener is attached in the **capture** phase on
 *   `document`, so a `stopPropagation()` elsewhere in the page cannot swallow it.
 *
 * @packageDocumentation
 */

/** Resolved shortcut configuration. */
interface ShortcutConfig {
    /** The key to require. A single letter or digit. */
    readonly key: string;
    readonly ctrl: boolean;
    readonly shift: boolean;
    readonly alt: boolean;
    readonly meta: boolean;
    /** Event target. Defaults to `document`. */
    readonly target?: EventTarget | undefined;
    /** Gate evaluated on every match; `false` suppresses the trigger. */
    readonly allow?: (() => boolean) | undefined;
}
/**
 * Expected `KeyboardEvent.code` for a configured key.
 *
 * @param key - a single letter or digit
 * @returns `Key<X>` / `Digit<N>`, or `undefined` for anything else
 *
 * @example
 * ```ts
 * import { expectedCode } from '@codewithrajat/rm-logvault';
 *
 * expectedCode('d'); // 'KeyD'
 * expectedCode('7'); // 'Digit7'
 * ```
 */
declare function expectedCode(key: string): string | undefined;
/**
 * Whether a keyboard event matches the configuration.
 *
 * @param event - the keyboard event
 * @param config - the resolved configuration
 * @returns `true` on an exact match of key **and** every modifier
 *
 * @remarks
 * Modifier matching is **exact**: pressing Ctrl+Shift+Alt+D with an extra Meta held
 * does not match, which prevents accidental triggers on OS-level shortcuts.
 *
 * @example
 * ```ts
 * import { matchesShortcut, DEFAULT_SHORTCUT_CONFIG } from '@codewithrajat/rm-logvault';
 *
 * document.addEventListener('keydown', (event) => {
 *   if (matchesShortcut(event, DEFAULT_SHORTCUT_CONFIG)) console.log('hit');
 * }, true);
 * ```
 */
declare function matchesShortcut(event: KeyboardEvent, config: ShortcutConfig): boolean;
/**
 * Whether the event target is a text-entry context.
 *
 * @param target - the event target
 * @returns `true` for an `<input>`, `<textarea>`, `<select>` or editable host
 *
 * @remarks
 * Without this check the shortcut would fire — and `preventDefault()` the key —
 * while someone is typing "d" into a form, which is a data-loss bug.
 */
declare function isEditableTarget(target: EventTarget | null | undefined): boolean;
/**
 * Install a keyboard shortcut.
 *
 * @param config - partial configuration; omitted members take their default
 * @param onTrigger - called when the shortcut fires
 * @returns a cleanup function. Calling it twice is safe.
 *
 * @example
 * ```ts
 * import { installShortcut } from '@codewithrajat/rm-logvault';
 *
 * const cleanup = installShortcut({ key: 'k', ctrl: true, shift: false, alt: false },
 *   () => console.log('fired'));
 * cleanup();
 * ```
 */
declare function installShortcut(config: Partial<ShortcutConfig> | undefined, onTrigger: () => void): () => void;
/** Options for {@link installDiagnosticsExportShortcut}. */
interface DiagnosticsShortcutOptions extends Partial<ShortcutConfig> {
    /** Filename prefix passed to the export. */
    readonly filenamePrefix?: string | undefined;
    /** Forwarded to `exportDiagnosticsReport`. */
    readonly exportOptions?: DiagnosticsExportOptions | undefined;
    /** Called with the export outcome. */
    readonly onExported?: ((ok: boolean) => void) | undefined;
}
/**
 * Install the default diagnostics-export shortcut (Ctrl+Shift+Alt+D).
 *
 * @param options - configuration. Pass `false` to install nothing.
 * @returns a cleanup function that removes the listener.
 *
 * @remarks
 * The listener is attached in the **capture** phase, so `stopPropagation()` in
 * application code cannot prevent the report. Events whose target is an editable
 * element are ignored, and `preventDefault()` is called only on a real match.
 *
 * @example
 * ```ts
 * import { installDiagnosticsExportShortcut } from '@codewithrajat/rm-logvault';
 *
 * // Attached automatically by initTelemetry; install manually if you disabled it.
 * const cleanup = installDiagnosticsExportShortcut({
 *   key: 'd',
 *   allow: () => window.__IS_INTERNAL__ === true,
 *   onExported: (ok) => console.log(ok ? 'report downloaded' : 'report failed'),
 * });
 *
 * cleanup();
 * ```
 */
declare function installDiagnosticsExportShortcut(options?: DiagnosticsShortcutOptions | false): () => void;

/**
 * IndexedDB persistence for error records.
 *
 * @remarks
 * Two behaviours distinguish this repository from a plain key/value store:
 *
 * - **Pending-only aggregation.** `save` looks up the
 *   `[fingerprint, 'pending']` index entry first and merges into it, so a bug that
 *   fires a thousand times occupies one row. Aggregation never touches a row that
 *   is already `uploading`, because that row is owned by an in-flight request.
 * - **Atomic claiming.** `claimPending` moves rows from `pending` to `uploading`
 *   inside a single `readwrite` transaction, which is what makes multiple tabs
 *   safe: two tabs cannot claim the same row.
 *
 * @packageDocumentation
 */

/** Options for {@link createErrorRepository}. */
interface ErrorRepositoryOptions {
    /** Physical database name, e.g. `rm-logvault-errors`. */
    readonly dbName: string;
    /** Explicit `IDBFactory`. Defaults to `globalThis.indexedDB`. */
    readonly indexedDB?: Maybe<IDBFactory>;
    /** Called once per distinct failure class. */
    readonly onFailure?: Maybe<(reason: StorageFailureReason, error: unknown) => void>;
    /** Retention policy. When omitted, automatic cleanup is disabled. */
    readonly cleanupPolicy?: Maybe<CleanupPolicy>;
    /** How often to run automatic retention. Default {@link ERROR_CLEANUP_EVERY_WRITES}. */
    readonly cleanupEveryWrites?: Maybe<number>;
    /** Open timeout passed through to the connection. */
    readonly openTimeoutMs?: Maybe<number>;
}
/**
 * Create an error repository backed by IndexedDB.
 *
 * @param options - see {@link ErrorRepositoryOptions}
 * @returns an {@link ErrorRepository}. Construction never opens the database.
 *
 * @example
 * ```ts
 * import { createErrorRepository } from '@codewithrajat/rm-logvault';
 *
 * const repository = createErrorRepository({ dbName: 'rm-logvault-errors' });
 * await repository.initialize();
 * await repository.save(record);
 * const pending = await repository.claimPending(50, Date.now());
 * ```
 */
declare function createErrorRepository(options: ErrorRepositoryOptions): ErrorRepository;

/**
 * A dependency-free, self-healing IndexedDB connection wrapper.
 *
 * @remarks
 * IndexedDB is hostile in the real world: it is missing in Safari private mode,
 * throws from `open()` inside sandboxed iframes, hangs forever when another tab
 * holds an upgrade open, and disappears mid-session when a user clears site data.
 * This module therefore has one hard rule: **never throw**. Every fallible
 * operation returns a {@link StorageResult} so the rest of the library can degrade
 * to console-only instead of breaking the host application.
 *
 * @packageDocumentation
 */

/**
 * Map any thrown value onto a {@link StorageFailureReason}.
 *
 * @param error - the thrown value
 * @returns the failure class; defaults to `'transaction'`
 */
declare function classifyStorageError(error: unknown): StorageFailureReason;
/**
 * Promisify an `IDBRequest`.
 *
 * @param request - the request to await
 * @returns a promise resolving with the request result, rejecting with `request.error`
 */
declare function promisifyRequest<T>(request: IDBRequest<T>): Promise<T>;
/** Options accepted by {@link createDbConnection}. */
interface IdbCoreOptions {
    /** Physical database name, e.g. `rm-logvault-errors`. */
    readonly dbName: string;
    /** Schema version. Bump only additively; never edit a shipped version. */
    readonly version: number;
    /** The single object store this connection exposes. */
    readonly storeName: string;
    /**
     * Schema creation/migration hook. Must be idempotent: it can be invoked again
     * after the user manually deletes the database mid-session.
     */
    readonly upgrade: (db: IDBDatabase, oldVersion: number, transaction: IDBTransaction) => void;
    /** Milliseconds to wait for `open()` before giving up. Default `5000`. */
    readonly openTimeoutMs?: Maybe<number>;
    /** Explicit `IDBFactory`; defaults to `globalThis.indexedDB`. */
    readonly indexedDB?: Maybe<IDBFactory>;
    /** Called once per distinct failure class so the host can observe degradation. */
    readonly onFailure?: Maybe<(reason: StorageFailureReason, error: unknown) => void>;
}
/**
 * A lazily-opened, self-healing database handle.
 *
 * @remarks
 * Transactions are only safe while awaiting IDB requests. Awaiting a macrotask
 * (`setTimeout`, `fetch`) inside {@link DbConnection.transaction} lets the
 * transaction auto-commit, after which further requests throw
 * `TransactionInactiveError`.
 */
interface DbConnection {
    readonly dbName: string;
    readonly storeName: string;
    readonly version: number;
    /** Whether a live connection is currently cached. */
    isOpen(): boolean;
    /** Open (or reuse) the connection, re-running `upgrade` if the DB was deleted. */
    ensureOpen(): Promise<Result<IDBDatabase, StorageFailureReason>>;
    /**
     * Run `work` inside a transaction.
     *
     * @remarks
     * For `readwrite`, the promise resolves only on `oncomplete`, so callers know
     * the data is durable. If `work` rejects, the transaction is aborted and the
     * rejection reason is classified.
     */
    transaction<T>(mode: IDBTransactionMode, work: (store: IDBObjectStore, transaction: IDBTransaction) => Promise<T> | T): Promise<Result<T, StorageFailureReason>>;
    /**
     * Delete the whole database, including its schema.
     *
     * @remarks
     * This is *not* what `clearTelemetryData()` uses — that empties the stores with
     * `store.clear()` and keeps the schema, so capture can continue without a
     * re-upgrade. Use this only to remove the database entirely.
     */
    deleteDatabase(): Promise<Result<void, StorageFailureReason>>;
    /** Drop the cached connection. The next call reopens. */
    close(): void;
}
/**
 * Create a resilient connection to one IndexedDB object store.
 *
 * @param options - see {@link IdbCoreOptions}
 * @returns a {@link DbConnection}; constructing it never opens the database
 *
 * @example
 * ```ts
 * const connection = createDbConnection({
 *   dbName: 'rm-logvault-errors',
 *   version: 1,
 *   storeName: 'errors',
 *   upgrade(db, _old, tx) {
 *     if (!db.objectStoreNames.contains('errors')) {
 *       const store = db.createObjectStore('errors', { keyPath: 'id' });
 *       store.createIndex('by_fingerprint_status', ['fingerprint', 'uploadStatus']);
 *     }
 *   },
 * });
 *
 * const result = await connection.transaction('readonly', (store) =>
 *   promisifyRequest(store.count()),
 * );
 * if (result.ok) console.log(result.value);
 * ```
 */
declare function createDbConnection(options: IdbCoreOptions): DbConnection;

/**
 * IndexedDB persistence for log records.
 *
 * @remarks
 * Logs are appended, never aggregated — each call is its own event, and merging
 * them would destroy the ordering that makes a log trail useful. The repository is
 * otherwise a mirror of {@link createErrorRepository}: atomic
 * {@link LogRepository.claimPending}, stale-lease requeue, retention cleanup and
 * quota recovery.
 *
 * Batches are written one `readwrite` transaction per call, so a 50-entry batch
 * costs one transaction rather than fifty.
 *
 * @packageDocumentation
 */

/** Options for {@link createLogRepository}. */
interface LogRepositoryOptions {
    /** Physical database name, e.g. `rm-logvault-logs`. */
    readonly dbName: string;
    /** Explicit `IDBFactory`. Defaults to `globalThis.indexedDB`. */
    readonly indexedDB?: Maybe<IDBFactory>;
    /** Called once per distinct failure class. */
    readonly onFailure?: Maybe<(reason: StorageFailureReason, error: unknown) => void>;
    /** Retention policy. When omitted, automatic cleanup is disabled. */
    readonly cleanupPolicy?: Maybe<CleanupPolicy>;
    /** How often to run automatic retention. Default {@link LOG_CLEANUP_EVERY_WRITES}. */
    readonly cleanupEveryWrites?: Maybe<number>;
    /** Open timeout passed through to the connection. */
    readonly openTimeoutMs?: Maybe<number>;
}
/**
 * Create a log repository backed by IndexedDB.
 *
 * @param options - see {@link LogRepositoryOptions}
 * @returns a {@link LogRepository}. Construction never opens the database.
 *
 * @example
 * ```ts
 * import { createLogRepository } from '@codewithrajat/rm-logvault';
 *
 * const repository = createLogRepository({ dbName: 'rm-logvault-logs' });
 * await repository.initialize();
 * await repository.saveBatch(records);
 * const batch = await repository.claimPending(50, Date.now());
 * ```
 */
declare function createLogRepository(options: LogRepositoryOptions): LogRepository;

/** Run error retention every N writes. */
declare const ERROR_CLEANUP_EVERY_WRITES = 25;
/** Run log retention every N writes. */
declare const LOG_CLEANUP_EVERY_WRITES = 200;

/**
 * Structural validation of persisted rows.
 *
 * @remarks
 * IndexedDB is not a trusted store. A row can be malformed because an older build
 * wrote it, because a user edited it in DevTools, because a schema migration was
 * interrupted, or because a different library used the same database name. Every
 * read therefore validates, and malformed rows are **deleted** rather than
 * returned — a poison row must not be able to break the diagnostics export forever.
 *
 * Validation is deliberately shallow: it checks the fields the library and its
 * consumers actually read, not every optional member.
 *
 * @packageDocumentation
 */

/**
 * Validate an `ErrorRecord` read from storage.
 *
 * @param value - the raw stored value
 * @returns `true` when the row is usable
 *
 * @example
 * ```ts
 * import { isErrorRecord } from '@codewithrajat/rm-logvault';
 *
 * isErrorRecord(JSON.parse(row)); // false for legacy / hand-edited rows
 * ```
 */
declare function isErrorRecord(value: unknown): value is ErrorRecord;
/**
 * Validate a `LogRecord` read from storage.
 *
 * @param value - the raw stored value
 * @returns `true` when the row is usable
 *
 * @example
 * ```ts
 * import { isLogRecord } from '@codewithrajat/rm-logvault';
 *
 * isLogRecord({ schemaVersion: 1, id: 'a', uploadStatus: 'pending', uploadAttempts: 0,
 *   level: 'warn', message: 'hi', pageLoadId: 'p', timestamp: 1, seq: 1 });
 * // true
 * ```
 */
declare function isLogRecord(value: unknown): value is LogRecord;

/**
 * The default `fetch`-based transport.
 *
 * @remarks
 * This is the library's **only** network egress. Three rules apply:
 *
 * 1. It uses the platform `fetch`, never the application's HTTP client. An
 *    axios-based upload path would re-enter the axios interceptor that captures
 *    errors, and a failing upload would generate more errors to upload.
 * 2. It **never reads the response body**. Not for success, not for errors.
 *    Reading a body consumes the caller's bandwidth and can expose response
 *    payloads to a library that has no business seeing them.
 * 3. It never throws for an HTTP status. A 500 is a normal `TransportResponse`;
 *    only a genuine transport failure rejects, which the sync manager treats as
 *    retryable.
 *
 * @packageDocumentation
 */

/** Options for {@link createFetchTransport}. */
interface FetchTransportOptions {
    /** Per-request abort budget. Default 10 000 ms. */
    readonly timeoutMs?: number | undefined;
    /**
     * `fetch` implementation.
     *
     * @remarks
     * Defaults to `globalThis.fetch`, resolved per request so tests can stub it and
     * so instrumentation installed later still applies (the fetch adapter ignores the
     * library's own telemetry URLs).
     */
    readonly fetchImpl?: typeof fetch | undefined;
}
/**
 * Create the default JSON-over-`fetch` transport.
 *
 * @param options - see {@link FetchTransportOptions}
 * @returns a {@link RemoteTransport}
 *
 * @example
 * ```ts
 * import { createFetchTransport, initTelemetry } from '@codewithrajat/rm-logvault';
 *
 * initTelemetry({
 *   appName: 'checkout',
 *   rest: {
 *     errorsUrl: '/telemetry/errors',
 *     transport: createFetchTransport({ timeoutMs: 5000 }),
 *   },
 * });
 * ```
 */
declare function createFetchTransport(options?: FetchTransportOptions): RemoteTransport;

/**
 * REST endpoint validation, request assembly and response classification.
 *
 * @packageDocumentation
 */

/**
 * Validate and normalise a configured endpoint.
 *
 * @param raw - the configured URL, absolute or relative
 * @param requireHttps - reject plain `http:` except on localhost
 * @returns the absolute URL, or `undefined` when the value is unusable
 *
 * @remarks
 * Rejected values cause the library to fall back to IndexedDB-only operation
 * rather than throwing, because a mistyped endpoint must not break the host app.
 * Relative URLs resolve against the current origin; outside a browser there is no
 * origin, so a relative URL is unusable.
 *
 * @example
 * ```ts
 * import { resolveEndpoint } from '@codewithrajat/rm-logvault';
 *
 * resolveEndpoint('/telemetry/errors', false);           // 'https://app.test/telemetry/errors'
 * resolveEndpoint('javascript:alert(1)', false);         // undefined
 * resolveEndpoint('http://api.test/x', true);            // undefined (requireHttps)
 * resolveEndpoint('http://localhost:3000/x', true);      // 'http://localhost:3000/x'
 * ```
 */
declare function resolveEndpoint(raw: string | undefined, requireHttps: boolean): string | undefined;
/** How a response status should be treated. */
type ResponseOutcome = 'ok' | 'terminal' | 'retryable';
/**
 * Classify an HTTP status.
 *
 * @param status - the response status, `0` when the request never landed
 * @returns `'ok'` for 2xx, `'terminal'` for statuses that will never succeed on
 * retry, `'retryable'` otherwise
 *
 * @remarks
 * Terminal statuses ({@link TERMINAL_STATUSES}) mark records `failed` so they stop
 * consuming retry budget. Everything else — `408`, `429`, all 5xx, network errors
 * and timeouts — is retried with backoff.
 *
 * @example
 * ```ts
 * import { classifyResponse } from '@codewithrajat/rm-logvault';
 *
 * classifyResponse(202); // 'ok'
 * classifyResponse(404); // 'terminal'
 * classifyResponse(503); // 'retryable'
 * ```
 */
declare function classifyResponse(status: number): ResponseOutcome;
/**
 * Build the JSON body for one batch.
 *
 * @param kind - `'errors'` or `'logs'`
 * @param records - the claimed records
 * @param options - resolved options supplying application identity
 * @param sentAt - the send timestamp
 * @returns the wire envelope documented in `docs/REST-CONTRACT.md`
 *
 * @example
 * ```ts
 * import { buildRestBody, resolveOptions } from '@codewithrajat/rm-logvault';
 *
 * const body = buildRestBody('errors', records, resolveOptions({ appName: 'x' }), Date.now());
 * // { schemaVersion: 1, kind: 'errors', sentAt: 1, app: { appName: 'x', … }, records: [...] }
 * ```
 */
declare function buildRestBody(kind: RecordKind, records: readonly unknown[], options: ResolvedTelemetryOptions, sentAt: number): RestBatchBody;
/**
 * Whether uploads can run at all.
 *
 * @param options - resolved options
 * @returns `true` when sync is enabled, a transport is available and at least one
 * endpoint survived validation
 *
 * @example
 * ```ts
 * import { resolveOptions, isSyncConfigured } from '@codewithrajat/rm-logvault';
 *
 * isSyncConfigured(resolveOptions({ rest: { errorsUrl: '/telemetry/errors' } })); // true
 * isSyncConfigured(resolveOptions({ rest: { errorsUrl: 'javascript:void 0' } })); // false
 * ```
 */
declare function isSyncConfigured(options: ResolvedTelemetryOptions): boolean;
/** Resolve both endpoints once, at initialization. */
declare function resolveEndpoints(options: ResolvedTelemetryOptions): {
    readonly errorsUrl: string | undefined;
    readonly logsUrl: string | undefined;
};

/**
 * UTF-8 payload budgeting and progressive reduction.
 *
 * @remarks
 * A single pathological error — a 5 MB message, a 40 000-frame stack, an `extra`
 * object containing a whole application store — must not be allowed to fill the
 * origin's storage quota or blow past a server's request limit. Each record is
 * therefore measured in UTF-8 bytes and, if oversized, reduced through a fixed
 * ladder of tiers until it fits. If even the minimal tier does not fit, the record
 * is **dropped** and reported, because storing a truncated-to-useless record is
 * worse than storing nothing.
 *
 * @packageDocumentation
 */

/**
 * UTF-8 byte length of a value's JSON representation.
 *
 * @param value - any JSON-serialisable value
 * @returns the byte length, or `Infinity` when the value cannot be serialised
 *
 * @example
 * ```ts
 * import { byteLength } from '@codewithrajat/rm-logvault';
 *
 * byteLength({ a: 'é' }); // 10 — 'é' is two bytes in UTF-8, the rest is ASCII
 * ```
 */
declare function byteLength(value: unknown): number;
/**
 * Reduce an error record until it fits its byte budget.
 *
 * @param record - the candidate record
 * @param maxBytes - the UTF-8 budget
 * @returns a record that fits, or `null` when even the minimal tier is too large
 *
 * @remarks
 * The tiers are, in order:
 *
 * 1. Drop `extra` and tag the record `truncated: 'true'`.
 * 2. Trim `causes` to {@link TIER1_CAUSE_LENGTH} characters, `stack` to
 *    {@link TIER1_STACK_LENGTH} and `componentStack` to
 *    {@link TIER1_COMPONENT_STACK_LENGTH}.
 * 3. Minimal: `stack` to {@link TIER2_STACK_LENGTH} and `message` to
 *    {@link TIER2_MESSAGE_LENGTH}, with `causes` and `componentStack` removed.
 * 4. Give up and drop the record.
 *
 * @example
 * ```ts
 * import { reduceErrorPayload } from '@codewithrajat/rm-logvault';
 *
 * const fitted = reduceErrorPayload(record, 16_384);
 * if (fitted === null) reportInternalFailure('payload-limit', new Error('dropped'));
 * ```
 */
declare function reduceErrorPayload(record: ErrorRecord, maxBytes: number): ErrorRecord | null;
/**
 * Reduce a log record until it fits its byte budget.
 *
 * @param record - the candidate record
 * @param maxBytes - the UTF-8 budget
 * @returns a record that fits, or `null` when even the bare record is too large
 *
 * @remarks
 * The tiers are: drop `data`, then shorten `message` to
 * {@link LOG_REDUCED_MESSAGE_LENGTH}, then drop the record.
 *
 * @example
 * ```ts
 * import { reduceLogPayload } from '@codewithrajat/rm-logvault';
 *
 * reduceLogPayload(record, 4_096) ?? reportDropped();
 * ```
 */
declare function reduceLogPayload(record: LogRecord, maxBytes: number): LogRecord | null;

/**
 * Identifier generation.
 *
 * @remarks
 * IDs must be unique across tabs and page loads without any coordination, and
 * generation must never throw — a failed `crypto` call must not break error
 * capture. Three strategies are tried in descending order of strength.
 */
/**
 * Generate a collision-resistant identifier.
 *
 * @remarks
 * Strategy order:
 * 1. `crypto.randomUUID()` — RFC 4122 v4, secure contexts only.
 * 2. `crypto.getRandomValues()` rendered as 32 hex chars.
 * 3. `<time36>-<counter36>-<random36>` — always available, unique per realm.
 *
 * @returns a non-empty identifier string. This function never throws.
 *
 * @example
 * ```ts
 * const id = newId(); // 'f47ac10b-58cc-4372-a567-0e02b2c3d479'
 * ```
 */
declare function newId(): string;
/**
 * Generate the identifier shared by every record from one page load.
 *
 * @remarks
 * Errors and logs live in separate databases, so this value is the only way to
 * correlate them after the fact. It is created once per page load and reused.
 *
 * @returns a non-empty identifier string. Never throws.
 */
declare function newPageLoadId(): string;

/**
 * Internal failure reporting.
 *
 * @remarks
 * The library's own failures are none of the host application's business — but
 * they must be *observable*, or a silently degraded vault looks like a working one.
 * So each distinct failure `stage` is reported exactly once: through the logger
 * under a reserved prefix (console-only, never persisted) and through the
 * `onInternalError` option. Repeats are suppressed because a failure inside the
 * error path would otherwise produce one warning per captured error.
 *
 * @packageDocumentation
 */
/**
 * Report a failure inside the library itself.
 *
 * @param stage - a stable, low-cardinality stage name, e.g. `'persist'`
 * @param error - the thrown value
 *
 * @remarks
 * Never throws and never rethrows `error`. Each `<stage>` is reported once per
 * initialization; use {@link resetInternalFailures} to clear the suppression set.
 *
 * @example
 * ```ts
 * import { reportInternalFailure } from '@codewithrajat/rm-logvault';
 *
 * try {
 *   await risky();
 * } catch (error) {
 *   reportInternalFailure('persist', error);
 * }
 * ```
 */
declare function reportInternalFailure(stage: string, error: unknown): void;
/**
 * Report a stage-level note (not an exception), e.g. a rate-limit summary.
 *
 * @param stage - the stage name, used for the message
 * @param detail - extra human-readable detail
 *
 * @remarks
 * Routed through the same once-per-stage suppression as
 * {@link reportInternalFailure}, so a storm collapses to one line.
 */
declare function reportInternalNote(stage: string, detail: string): void;

/**
 * A serialized promise queue.
 *
 * @remarks
 * Storage writes must keep their order and one failure must not poison the chain,
 * so every mutation goes through a queue that (a) runs tasks strictly one at a
 * time, (b) swallows rejections so the chain stays usable, and (c) exposes a way to
 * wait until everything has settled.
 *
 * @packageDocumentation
 */
/** A strictly-ordered asynchronous task queue. */
interface SerialQueue {
    /**
     * Append a task.
     *
     * @param task - the work to run
     * @returns a promise resolving with the task result, or `undefined` if it threw
     */
    push<T>(task: () => Promise<T> | T): Promise<T | undefined>;
    /** Resolve once the queue has drained, including tasks appended while waiting. */
    drain(): Promise<void>;
    /** Number of tasks not yet started. */
    size(): number;
    /** Drop queued (not yet started) tasks. In-flight work is unaffected. */
    clear(): void;
}
/**
 * Create a {@link SerialQueue}.
 *
 * @returns a new queue
 *
 * @example
 * ```ts
 * import { createSerialQueue } from '@codewithrajat/rm-logvault';
 *
 * const queue = createSerialQueue();
 * queue.push(() => repository.save(record));
 * await queue.drain();
 * ```
 */
declare function createSerialQueue(): SerialQueue;

/** A fixed-window counter. */
interface RateLimiter {
    /** Whether the current call may proceed. Registers the attempt either way. */
    allow(): boolean;
    /** Events dropped in the current window. */
    dropped(): number;
    /** Events admitted in the current window. */
    admitted(): number;
    /** Drop in-flight window state. */
    reset(): void;
}
/**
 * Create a fixed-window rate limiter.
 *
 * @param maxPerWindow - maximum admitted events per 60-second window. A
 * non-positive or non-finite value disables limiting entirely.
 * @param onWindowRoll - called with the dropped count when a window rolls over;
 * only invoked when at least one event was dropped
 * @returns a {@link RateLimiter}
 *
 * @example
 * ```ts
 * import { createRateLimiter } from '@codewithrajat/rm-logvault';
 *
 * const limiter = createRateLimiter(120, (dropped) => {
 *   console.warn(`rate-limit (${dropped} dropped)`);
 * });
 *
 * if (limiter.allow()) capture();
 * ```
 */
declare function createRateLimiter(maxPerWindow: number, onWindowRoll?: (dropped: number) => void): RateLimiter;

/**
 * Process-wide singleton state and teardown bookkeeping.
 *
 * @remarks
 * Two hazards motivate this module:
 *
 * 1. **Duplicate copies.** Microfrontends and Module Federation routinely end up
 *    with two copies of the same package in one page. If each copy kept its own
 *    module-scoped state, installing global listeners twice would capture every
 *    error twice — and, because the adapter entries inline their own copy of the
 *    error pipeline, a capture made through one of them would be buffered by a
 *    copy whose buffer is never drained. The state therefore lives on
 *    `globalThis[Symbol.for('logvault@1')]`, which is shared by every copy.
 * 2. **Leaked listeners and timers.** `destroyTelemetry()` must leave no trace, so
 *    every listener and timer is registered with the {@link CleanupRegistry} rather
 *    than created ad hoc.
 *
 * @packageDocumentation
 */

/**
 * Tracks every side effect the library installs so `destroyTelemetry()` can undo
 * all of them deterministically.
 */
interface CleanupRegistry {
    /** Register an arbitrary teardown function. */
    add(teardown: () => void): void;
    /** Register a listener; removal is automatic on cleanup. */
    addListener(target: EventTarget, type: string, handler: EventListenerOrEventListenerObject, options?: AddEventListenerOptions | boolean): void;
    /** Register a timeout; clearing is automatic on cleanup. */
    setTimeout(handler: () => void, ms: number): number;
    /** Register an interval; clearing is automatic on cleanup. */
    setInterval(handler: () => void, ms: number): number;
    /** Run every teardown exactly once, in reverse registration order. */
    run(): void;
    /** Whether {@link CleanupRegistry.run} has already been called. */
    readonly ran: boolean;
}
/** Mutable process-wide state shared by every copy of the library in one realm. */
interface TelemetryState {
    /** Marker used by the cross-copy type guard. */
    readonly __logvaultState: true;
    /** Whether `initTelemetry` has completed and not yet been destroyed. */
    initialized: boolean;
    /** Resolved configuration, or `null` before init / after destroy. */
    options: ResolvedTelemetryOptions | null;
    /** The active persistence backend, or `null`. */
    repository: TelemetryRepository | null;
    /** Whether persistence is usable, disabled, or unavailable. */
    storageState: StorageState;
    /** Last known number of error records still awaiting upload. */
    pendingErrors: number;
    /** Last known number of log records still awaiting upload. */
    pendingLogs: number;
    /** Identifier shared by every record produced during this page load. */
    pageLoadId: string;
    /** Teardown for the current initialization. Replaced on re-init. */
    teardown: (() => void) | null;
    /** Flush hook for the current initialization. */
    flush: (() => Promise<void>) | null;
    /** Requeue hook that moves terminally-failed records back to `pending`. */
    retryFailed: (() => Promise<number>) | null;
    /** Cleanup registry for the current initialization. */
    cleanup: CleanupRegistry;
    /**
     * The live error tracker, or `null` before init / after destroy.
     *
     * @remarks
     * Deliberately not module-scoped in `captureError`. The adapter entries are
     * separate bundles that inline their own copy of the error pipeline, so a
     * module-scoped tracker left an adapter dispatching into a buffer nothing ever
     * drained — which is silent, because nothing failed. Holding it here is what
     * lets *any* copy of the library resolve the one live tracker.
     */
    errorTracker: ErrorTracker | null;
    /** Errors captured before initialization, shared so one copy's replay drains them all. */
    preInitErrors: BufferedError[];
    /** Whether capture is globally suppressed (`enabled: false`). Shared by every copy. */
    captureSuppressed: boolean;
    /**
     * The observer emitter for the current installation, or `null`.
     *
     * @remarks
     * Held here rather than in `init.ts` module scope for the same reason the error
     * tracker is: an adapter bundle inlines its own copy of the pipeline, and only
     * shared state gives every copy the one live emitter.
     */
    eventEmitter: EventEmitter | null;
}
/**
 * Read (or lazily create) the shared state object.
 *
 * @returns the process-wide {@link TelemetryState}
 *
 * @remarks
 * The object is installed on `globalThis` with `Symbol.for`, so a second bundled
 * copy of the library resolves the *same* instance and merges into one set of
 * listeners instead of duplicating capture.
 *
 * @example
 * ```ts
 * import { getState } from '@codewithrajat/rm-logvault';
 *
 * getState().initialized;   // false before initTelemetry()
 * ```
 */
declare function getState(): TelemetryState;

export { ADAPTERS, type AdapterDescriptor, type AdapterKind, type ApiClassification, ApiErrorContext, ApiErrorKind, CORRELATION_HEADERS, CleanupPolicy, DEFAULT_ALLOWED_QUERY_PARAMS, DEFAULT_ENV_PREFIXES, DEFAULT_OPTIONS, DIAGNOSTICS_CSV_COLUMNS, type DbConnection, type DiagnosticsExportOptions, type DiagnosticsExportResult, type DiagnosticsFormat, type DiagnosticsShortcutOptions, ERROR_CLEANUP_EVERY_WRITES, EXPORT_SLICE_SIZE, type EnvOptions, type ErrorCapturedEvent, ErrorCategory, ErrorContext, type ErrorContextBuilder, ErrorLocation, ErrorRecord, ErrorRepository, type ErrorRepositoryOptions, ErrorSeverity, ErrorSource, type ErrorsOptions, type EventEmitter, ExternalLogSource, type FetchFailure, type FetchRequestInfo, type FetchTransportOptions, type FingerprintInput, type FlushResult, FlushSummary, type GlobalHandlerOptions, type IdbCoreOptions, LOG_CLEANUP_EVERY_WRITES, LogLevel, LogLevelSetting, LogRecord, LogRepository, type LogRepositoryOptions, LogSink, type LogWrittenEvent, Logger, type LoggerController, type LogsOptions, MAX_ARRAY_ITEMS, MAX_CAUSE_DEPTH, MAX_COMPONENT_STACK_LENGTH, MAX_DEPTH, MAX_KEYS, MAX_LOG_ARGS, MAX_MESSAGE_LENGTH, MAX_STACK_LENGTH, MAX_STRING_LENGTH, MAX_TAGS, PRE_INIT_ERROR_BUFFER_SIZE, REDACTED, REPORT_PRIVACY_BANNER, type RateLimiter, type RecordDroppedEvent, type RedactionOptions, RemoteTransport, type ReportMeta, type ReportPayload, type ResolvedErrorsOptions, type ResolvedLogsOptions, type ResolvedRedactionOptions, type ResolvedRestOptions, type ResolvedShortcutOptions, type ResolvedTelemetryOptions, type ResponseOutcome, RestBatchBody, type RestOptions, SENSITIVE_KEY_PATTERN, type Sanitizer, type SanitizerConfig, type SerialQueue, type ShortcutConfig, type ShortcutOptions, type SimpleTelemetryOptions, type SinkRegistration, type SinkRegistry, StorageFailureReason, type StorageMode, StorageState, type SyncCompletedEvent, type SyncFailedEvent, type SyncManager, type SyncManagerOptions, type SyncStartedEvent, SyncStatus, type TelemetryEvent, type TelemetryEventListener, type TelemetryEventMap, type TelemetryEventPayload, type TelemetryEventType, type TelemetryHandle, type TelemetryOptions, TelemetryRepository, type TelemetryState, type TelemetryStatus, UNHANDLED_SOURCES, UNNORMALIZABLE, adapterFor, adapterFrameworks, buildApiErrorContext, buildFetchErrorContext, buildReportPayload, buildRestBody, byteLength, captureApiError, captureError, captureFetchError, categoryForKind, classifyResponse, classifyStorageError, clearErrorContextBuilders, clearTelemetryData, createDbConnection, createErrorRepository, createEventEmitter, createFetchTransport, createLogRepository, createLogger, createRateLimiter, createSanitizer, createSerialQueue, createSinkRegistry, createSyncManager, cyrb53, databaseNames, destroyTelemetry, diagnosticsFilename, encodeJsonForHtml, errorContextBuilderCount, escapeHtml, escapeJsonText, expectedCode, exportDiagnosticsReport, fingerprint, fingerprintParts, flushTelemetry, fromEnv, getDefaultSanitizer, getGlobal, getSinkRegistry, getState, getTelemetryStatus, globalHandlerCount, globalHandlersAttached, httpErrorContextBuilder, initTelemetry, installBuiltinContextBuilders, installDiagnosticsExportShortcut, installGlobalErrorHandlers, installShortcut, isAuthError, isBrowser, isEditableTarget, isErrorRecord, isExportInFlight, isLogRecord, isSensitiveKey, isSyncConfigured, isTelemetryInitialized, listErrorContextBuilders, logger, markAuthError, matchesShortcut, newId, newPageLoadId, normalizeError, normalizePathForFingerprint, promisifyRequest, reduceErrorPayload, reduceLogPayload, registerErrorContextBuilder, renderDiagnosticsReport, reportInternalFailure, reportInternalNote, resolveEndpoint, resolveEndpoints, resolveErrorContext, resolveOptions, retryFailedTelemetry, safeGet, sanitizeErrorRecord, sanitizeLogRecord, sanitizeNormalized, sanitizeStack, sanitizeText, sanitizeUrl, sanitizeValue, setupTelemetry, severityForKind, syncTelemetry, timeoutErrorContextBuilder, topStackFrames, typeErrorContextBuilder, unregisterErrorContextBuilder, withErrorCapture };
