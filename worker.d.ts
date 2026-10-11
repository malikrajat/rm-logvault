import { E as ErrorContext } from './types--hrpBzU7.js';

/**
 * `@codewithrajat/rm-logvault/worker` — capture failures from a `Worker`.
 *
 * @remarks
 * A worker's `error` and `messageerror` events fire on the **`Worker` object**, not
 * on `window`. Nothing the core installs can see them, so without this adapter every
 * application that owns a worker hand-writes the same two listeners — and, more
 * often, does not, which is how a worker that died on its first message becomes a
 * feature that "sometimes does nothing".
 *
 * `'worker'` has been a member of `ErrorSource` since the first release. This is the
 * adapter that finally produces it.
 *
 * @example
 * ```ts
 * import { attachWorker } from '@codewithrajat/rm-logvault/worker';
 *
 * const worker = new Worker(new URL('./health.worker.ts', import.meta.url), { type: 'module' });
 * const detach = attachWorker(worker, { name: 'healthStatus' });
 *
 * // …on teardown
 * detach();
 * ```
 *
 * @packageDocumentation
 */

/** Options for {@link attachWorker}. */
interface AttachWorkerOptions {
    /**
     * Name stamped onto every record as the `worker` tag, and used in the timeout
     * message. Defaults to `'worker'`.
     *
     * @remarks
     * Set it. A page with three workers and a report full of `worker: 'worker'` is a
     * page whose report cannot say which one died.
     */
    readonly name?: string | undefined;
    /**
     * Milliseconds `expectResponse()` waits before a silent worker is reported.
     *
     * @remarks
     * Unset disables the timeout, and `expectResponse()` then only returns a cancel
     * function. A worker that is alive but wedged produces **no event at all**, so this
     * is the only signal available for that failure — but it is also a guess about how
     * long work should take, which is why it is opt-in and per-attachment rather than a
     * global default.
     */
    readonly responseTimeoutMs?: number | undefined;
    /** Context merged into every record this attachment produces. */
    readonly context?: ErrorContext | undefined;
}
/**
 * The handle {@link attachWorker} returns.
 *
 * @remarks
 * Callable, so the common case reads as `const detach = attachWorker(w)` and teardown
 * is `detach()`. The extra members hang off the same function rather than living in a
 * wrapper object, because a wrapper would make the documented one-liner a two-step
 * every caller has to remember.
 */
interface WorkerAttachment {
    /** Detach every listener and cancel pending timeouts. Safe to call twice. */
    (): void;
    /** The same function as calling the attachment; for code that prefers a member. */
    detach(): void;
    /**
     * Start watching for a response, and report the worker as silent if none arrives.
     *
     * @param label - what was being asked of the worker, e.g. `'health-check'`
     * @returns a function to call when the response arrives, cancelling the timer.
     * Safe to call more than once.
     *
     * @remarks
     * A no-op that returns a no-op when `responseTimeoutMs` is unset.
     */
    expectResponse(label?: string): () => void;
}
/**
 * Attach error capture to a `Worker` (or `SharedWorker`, or any `EventTarget`).
 *
 * @param worker - the worker to watch. A value with no `addEventListener` is accepted
 * and produces an inert attachment, so this can be called unconditionally.
 * @param options - see {@link AttachWorkerOptions}
 * @returns a {@link WorkerAttachment}. **Never throws.**
 *
 * @remarks
 * Two events are captured, and nothing else is read from either:
 *
 * - **`error`** — filed as `source: 'worker'`, `tags.op: 'fatal'`, `severity:
 *   'fatal'` and `handled: false`. The worker's own error object is preferred when the
 *   engine supplies one; otherwise the `ErrorEvent`'s `message` is used, with
 *   `filename`, `lineno` and `colno` recorded as the record's `location`. That is the
 *   same field allow-list the window handler reads.
 * - **`messageerror`** — a *deserialisation* failure: the worker sent something that
 *   could not be structured-cloned. There is no error object and no stack, and the
 *   `error` event never fires for it, so the message is synthesised and tagged
 *   `tags.op: 'messageerror'`.
 *
 * Neither listener calls `preventDefault()`. A worker error is not something the
 * library may decide to swallow, and the worker's default handling is what surfaces
 * the failure during development.
 *
 * @example
 * ```ts
 * import { attachWorker } from '@codewithrajat/rm-logvault/worker';
 *
 * const worker = new Worker('/search.worker.js');
 * const attachment = attachWorker(worker, { name: 'search', responseTimeoutMs: 10_000 });
 *
 * worker.postMessage({ type: 'query', term });
 * const settle = attachment.expectResponse('query');
 * worker.addEventListener('message', () => settle());
 * ```
 */
declare function attachWorker(worker: unknown, options?: AttachWorkerOptions): WorkerAttachment;

export { type AttachWorkerOptions, type WorkerAttachment, attachWorker };
