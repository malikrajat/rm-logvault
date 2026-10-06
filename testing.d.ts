import { R as RemoteTransport, b as TransportRequest, a as RestBatchBody } from './sync.types-DFUwO42J.js';
import { a as ErrorRecord, M as Maybe } from './types-vgch86Bo.js';
import { b as ErrorRepository, c as LogRepository, a as LogRecord, T as TelemetryRepository, g as StorageFailureReason } from './storage.types-D8ZNGNNT.js';

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

export { type FakeTransport, type FakeTransportOptions, type InspectableErrorRepository, type InspectableLogRepository, type MemoryRepository, type MemoryRepositoryOptions, createFakeTransport, createMemoryRepository };
