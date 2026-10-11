import { R as RemoteTransport, b as TransportRequest, a as RestBatchBody } from './sync.types-BZrlF0p7.js';
import { a as ErrorRecord, M as Maybe, E as ErrorContext } from './types--hrpBzU7.js';
import { b as ErrorRepository, c as LogRepository, a as LogRecord, T as TelemetryRepository, g as StorageFailureReason, f as LogLevel, e as Logger, d as LogSink, L as LogLevelSetting } from './storage.types-Bdis0_H9.js';

/**
 * A scriptable transport for consumer tests.
 *
 * @remarks
 * Lets a test drive every branch of the outbox — success, retryable failure,
 * terminal failure, `Retry-After`, transport rejection — without a server:
 *
 * ```ts
 * const transport = createFakeTransport({ status: 503, retryAfterMs: 30_000 });
 * initTelemetry({ appName: 'test', rest: { errorsUrl: '/e', transport } });
 * // …
 * transport.requests[0].body;   // the exact JSON that was sent
 * ```
 *
 * @packageDocumentation
 */

/** How a fake transport should answer. */
interface FakeTransportOptions {
    /** Fixed status, or a function of the request and its zero-based index. */
    readonly status?: number | ((request: TransportRequest, index: number) => number) | undefined;
    /** `Retry-After` hint reported alongside the status. */
    readonly retryAfterMs?: number | undefined;
    /** Reject (not merely fail) the first N sends, simulating a network failure. */
    readonly failTimes?: number | undefined;
    /** Called after each send is recorded. */
    readonly onSend?: ((request: TransportRequest, index: number) => void) | undefined;
}
/** The instrumented transport. */
interface FakeTransport extends RemoteTransport {
    /** Every request that was handed to {@link RemoteTransport.send}, in order. */
    readonly requests: readonly TransportRequest[];
    /** How many sends happened, including rejected ones. */
    readonly sendCount: number;
    /** Parse the most recent body. */
    lastBody(): RestBatchBody | undefined;
    /** Clear recorded requests and the failure counter. */
    reset(): void;
}
/**
 * Create a scriptable {@link RemoteTransport}.
 *
 * @param options - see {@link FakeTransportOptions}
 * @returns a {@link FakeTransport}
 *
 * @example
 * ```ts
 * import { createFakeTransport } from '@codewithrajat/rm-logvault/testing';
 *
 * // Succeed once, then fail with a retry hint.
 * let calls = 0;
 * const transport = createFakeTransport({
 *   status: () => (calls++ === 0 ? 202 : 503),
 *   retryAfterMs: 60_000,
 * });
 * ```
 */
declare function createFakeTransport(options?: FakeTransportOptions): FakeTransport;

/**
 * In-memory storage backend for consumer tests.
 *
 * @remarks
 * Swap IndexedDB for memory so a test can assert on stored records without a
 * browser, `fake-indexeddb`, or async timing games:
 *
 * ```ts
 * const repository = createMemoryRepository();
 * initTelemetry({ appName: 'test', repository, shortcut: false });
 * captureError(new Error('boom'));
 * await flushTelemetry();
 * repository.errors.all();      // the stored ErrorRecord
 * ```
 *
 * The semantics intentionally mirror the IndexedDB repositories — pending-only
 * aggregation, atomic claiming, stale-lease requeue, retention cleanup — so a test
 * that passes here is testing real logic, not a stub.
 *
 * @packageDocumentation
 */

/** Options for {@link createMemoryRepository}. */
interface MemoryRepositoryOptions {
    /** Make every operation fail with this reason, to exercise degradation paths. */
    readonly failWith?: Maybe<StorageFailureReason>;
    /**
     * Fail writes with `'quota'` once this many rows are stored.
     *
     * @remarks
     * Used to test the quota-recovery path (cleanup with half the cap, then one retry).
     */
    readonly quotaAt?: Maybe<number>;
}
/** Extra inspection helpers layered onto the in-memory repositories. */
interface InspectableErrorRepository extends ErrorRepository {
    /** Every stored record, newest `lastSeen` first. */
    all(): ErrorRecord[];
    /** Drop everything without touching configuration. */
    reset(): void;
}
/** Extra inspection helpers layered onto the in-memory log repository. */
interface InspectableLogRepository extends LogRepository {
    /** Every stored record, newest first. */
    all(): LogRecord[];
    /** Drop everything without touching configuration. */
    reset(): void;
}
/** The in-memory backend. */
interface MemoryRepository extends TelemetryRepository {
    readonly errors: InspectableErrorRepository;
    readonly logs: InspectableLogRepository;
    /** Drop every stored record in both stores. */
    reset(): void;
}
/**
 * Create an in-memory {@link TelemetryRepository}.
 *
 * @param options - see {@link MemoryRepositoryOptions}
 * @returns a fully-featured in-memory backend
 *
 * @example
 * ```ts
 * import { createMemoryRepository } from '@codewithrajat/rm-logvault/testing';
 * import { initTelemetry, captureError, flushTelemetry } from '@codewithrajat/rm-logvault';
 *
 * const repository = createMemoryRepository();
 * initTelemetry({ appName: 'test', repository, shortcut: false });
 *
 * captureError(new Error('boom'));
 * await flushTelemetry();
 *
 * console.log(repository.errors.all()[0]?.message); // 'boom'
 * ```
 */
declare function createMemoryRepository(options?: MemoryRepositoryOptions): MemoryRepository;

/**
 * Ready-made spies for the two functions an application most often mocks.
 *
 * @remarks
 * Almost every test suite that uses this library contains the same hand-rolled
 * mock, and almost every hand-rolled version gets one of these wrong:
 *
 * ```ts
 * // Wrong: the mock is module-scoped, so the second test file that imports it
 * // appends to records the first one asserted on.
 * export const captured: unknown[] = [];
 * vi.mock('shared/telemetry', () => ({
 *   captureError: (error: unknown) => captured.push(error),
 * }));
 *
 * // Wrong: the shape is a bare `vi.fn()`, so a test that needs `ctx.tags` has to
 * // reach into `mock.calls[0][1]` and cast.
 * vi.mock('shared/telemetry', () => ({ captureError: vi.fn() }));
 * ```
 *
 * These factories hand back a **recording** double with a typed inspection API and an
 * explicit `reset()`, so a suite states what it is asserting on instead of unpacking
 * a call tuple. Neither reaches the library's own state: importing the `/testing`
 * subpath installs nothing, starts nothing and opens no database.
 *
 * @packageDocumentation
 */

/** One recorded `captureError` call. */
interface CaptureErrorCall {
    /** Exactly the value the caller passed. */
    readonly error: unknown;
    /** Exactly the context the caller passed, or `undefined`. */
    readonly ctx: ErrorContext | undefined;
    /**
     * The normalised message, so a test can assert on a non-`Error` throw without
     * reproducing the normaliser.
     *
     * @remarks
     * Derived through the library's own `normalizeError`, which cannot throw — so
     * recording a hostile value and then reading `messages()` is safe.
     */
    readonly message: string;
}
/** A recording stand-in for `captureError`. */
interface CaptureErrorMock {
    /** Pass this wherever the code under test expects `captureError`. */
    readonly captureError: (error: unknown, ctx?: ErrorContext) => void;
    /** Every call, in order. */
    readonly calls: readonly CaptureErrorCall[];
    /** The most recent call, or `undefined`. */
    last(): Maybe<CaptureErrorCall>;
    /** How many times it was called. */
    count(): number;
    /** The normalised message of every call, in order. */
    messages(): readonly string[];
    /** How many calls carried a `source`. */
    withSource(source: string): readonly CaptureErrorCall[];
    /** Drop every recorded call. */
    reset(): void;
}
/**
 * Create a recording `captureError` double.
 *
 * @returns a {@link CaptureErrorMock}
 *
 * @example
 * ```ts
 * import { describe, expect, it, vi } from 'vitest';
 * import { createCaptureErrorMock } from '@codewithrajat/rm-logvault/testing';
 *
 * const telemetry = createCaptureErrorMock();
 * vi.mock('shared/telemetry', () => ({ captureError: telemetry.captureError }));
 *
 * it('reports a failed load with its route', () => {
 *   await loadOrders('42');
 *   expect(telemetry.messages()).toEqual(['orders 42 not found']);
 *   expect(telemetry.last()?.ctx?.source).toBe('router');
 * });
 * ```
 */
declare function createCaptureErrorMock(): CaptureErrorMock;
/** One recorded logger call. */
interface LogCall {
    readonly level: LogLevel;
    /** The message exactly as passed. */
    readonly message: string;
    /** The arguments exactly as passed, without the leading message. */
    readonly args: readonly unknown[];
}
/** A recording stand-in for the `logger` facade. */
interface LoggerMock {
    /** Pass this wherever the code under test expects `logger`. */
    readonly logger: Logger;
    /** Every call, in order. */
    readonly calls: readonly LogCall[];
    /** Calls at one exact level. */
    atLevel(level: LogLevel): readonly LogCall[];
    /** Calls at `level` or above. */
    atLeast(level: LogLevel): readonly LogCall[];
    /** The most recent call, or `undefined`. */
    last(): Maybe<LogCall>;
    /** The message of every call, in order. */
    messages(): readonly string[];
    /** Sinks registered through `addSink`, still live. */
    readonly sinks: readonly LogSink[];
    /** Drop every recorded call and sink. */
    reset(): void;
}
/** Options for {@link createLoggerMock}. */
interface LoggerMockOptions {
    /** Initial console level. Default `'warn'`, matching the real facade. */
    readonly level?: Maybe<LogLevelSetting>;
    /** Initial enabled flag. Default `true`. */
    readonly enabled?: Maybe<boolean>;
}
/**
 * Create a recording `logger` double.
 *
 * @param options - see {@link LoggerMockOptions}
 * @returns a {@link LoggerMock}
 *
 * @remarks
 * Unlike a bare spy, this implements the whole {@link Logger} contract, so it can be
 * substituted anywhere the real facade is accepted:

 * ```ts
 * import { createLoggerMock } from '@codewithrajat/rm-logvault/testing';
 * import { initTelemetry } from '@codewithrajat/rm-logvault';
 *
 * const { logger } = createLoggerMock();
 * initTelemetry({ appName: 'test', logSource: { addSink: (sink) => logger.addSink(sink) } });
 * ```
 *
 * `atLeast` uses the same level ladder the library does, so a test asserting
 * "warn or above" cannot drift from the real filter.
 *
 * @example
 * ```ts
 * const { logger, messages } = createLoggerMock();
 * logger.warn('[Checkout] retrying payment', { attempt: 2 });
 * expect(messages()).toEqual(['[Checkout] retrying payment']);
 * ```
 */
declare function createLoggerMock(options?: LoggerMockOptions): LoggerMock;

export { type CaptureErrorCall, type CaptureErrorMock, type FakeTransport, type FakeTransportOptions, type InspectableErrorRepository, type InspectableLogRepository, type LogCall, type LoggerMock, type LoggerMockOptions, type MemoryRepository, type MemoryRepositoryOptions, createCaptureErrorMock, createFakeTransport, createLoggerMock, createMemoryRepository };
