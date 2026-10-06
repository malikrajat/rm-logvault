/**
 * `fetch` adapter: an opt-in global wrapper.
 *
 * @remarks
 * Monkey-patching `fetch` is invasive, so this is **opt-in** and fully reversible.
 * It captures exactly two things and reads nothing else:
 *
 * - the rejection reason of a failed call (network error, abort, timeout), and
 * - the status of a non-2xx response.
 *
 * Response **bodies are never read**, and the wrapper returns the *original*
 * `Response` object untouched, so the application's own body consumption and
 * streaming behaviour are unaffected.
 *
 * The library's own upload endpoints are skipped by URL, so a failing upload can
 * never produce a captured error that triggers another upload.
 *
 * @packageDocumentation

 * @packageDocumentation
 */
/** Options for {@link instrumentFetch}. */
interface InstrumentFetchOptions {
    /** Capture rejections (network failures, aborts, timeouts). Default `true`. */
    readonly captureNetworkErrors?: boolean | undefined;
    /** Capture resolved responses whose status is not 2xx. Default `true`. */
    readonly captureNon2xx?: boolean | undefined;
    /** The `fetch` to wrap. Defaults to `globalThis.fetch`. */
    readonly fetchImpl?: typeof fetch | undefined;
}
/**
 * Register a URL that the fetch wrapper must ignore.
 *
 * @param url - the endpoint to ignore
 * @returns a function that removes the registration
 *
 * @remarks
 * Useful with a custom {@link RemoteTransport} that posts somewhere other than the
 * configured `errorsUrl`/`logsUrl`.
 *
 * @example
 * ```ts
 * import { registerTelemetryUrl } from '@codewithrajat/rm-logvault/fetch';
 *
 * const unregister = registerTelemetryUrl('https://otlp.example.com/v1/logs');
 * ```
 */
declare function registerTelemetryUrl(url: string): () => void;
/**
 * Wrap `globalThis.fetch` so request failures are captured.
 *
 * @param options - see {@link InstrumentFetchOptions}
 * @returns a restore function. Safe to call twice, and safe to call when another
 * library has since replaced `fetch` — that replacement is left alone.
 *
 * @example
 * ```ts
 * import { instrumentFetch } from '@codewithrajat/rm-logvault/fetch';
 *
 * const restore = instrumentFetch();
 * // …later
 * restore();
 * ```
 */
declare function instrumentFetch(options?: InstrumentFetchOptions): () => void;

export { type InstrumentFetchOptions, instrumentFetch, registerTelemetryUrl };
