import { Component, ReactNode, ErrorInfo } from 'react';

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
 *
 * `router` and `timeout` are additions for the same reason. A route-loader failure
 * filed as `'chunk'` and a silent worker filed as `'window'` both make a report
 * lie about where the failure came from — and the two are indistinguishable from a
 * genuine chunk-load failure and a genuine uncaught error respectively. See
 * `docs/DECISIONS.md` (D-033).
 */
type ErrorSource = 'react' | 'vue' | 'angular' | 'svelte' | 'api' | 'window' | 'unhandledrejection' | 'resource' | 'chunk' | 'csp' | 'event-handler' | 'worker' | 'router' | 'timeout' | 'query' | 'storage' | 'manual';
/** Impact of the error on the user experience. */
type ErrorSeverity = 'fatal' | 'error' | 'warning' | 'info';
/** Coarse classification used for grouping and dashboards. */
type ErrorCategory = 'runtime' | 'chunk' | 'resource' | 'http' | 'network' | 'timeout' | 'abort' | 'parse' | 'auth' | 'security';
/** Classification of an HTTP/transport failure. */
type ApiErrorKind = 'auth' | 'abort' | 'timeout' | 'parse' | 'http' | 'network' | 'unknown';
/** Source position of a runtime error. */
interface ErrorLocation {
    readonly source?: Maybe<string>;
    readonly line?: Maybe<number>;
    readonly column?: Maybe<number>;
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
 * React adapter: an error boundary, React 19 root error handlers and a hook.
 *
 * @remarks
 * React 19 replaced `componentDidCatch`-only reporting with three root-level
 * hooks (`onUncaughtError`, `onCaughtError`, `onRecoverableError`). This adapter
 * covers both worlds, and every path funnels into the same `captureError`, so a
 * failure that reaches the boundary *and* the root still produces one record —
 * the pipeline's identity-based deduplication handles that.
 *
 * @packageDocumentation
 */

/** Props accepted by {@link TelemetryErrorBoundary}. */
interface TelemetryErrorBoundaryProps {
    /** The subtree to protect. */
    readonly children?: ReactNode | undefined;
    /**
     * What to render after a failure.
     *
     * @remarks
     * A function receives the error and a `reset` callback that clears the boundary
     * state, which is what makes "try again" possible without a full reload.
     */
    readonly fallback?: ReactNode | ((error: Error, reset: () => void) => ReactNode) | undefined;
    /** Called after the error has been captured. */
    readonly onError?: ((error: Error, info: ErrorInfo) => void) | undefined;
    /** Extra context merged into the captured record. */
    readonly context?: ErrorContext | undefined;
}
/** Boundary state. */
interface TelemetryErrorBoundaryState {
    readonly error: Error | null;
}
/**
 * An error boundary that reports to the vault.
 *
 * @example
 * ```tsx
 * import { TelemetryErrorBoundary } from '@codewithrajat/rm-logvault/react';
 *
 * root.render(
 *   <TelemetryErrorBoundary fallback={(error, reset) => (
 *     <div>
 *       <p>Something went wrong: {error.message}</p>
 *       <button onClick={reset}>Try again</button>
 *     </div>
 *   )}>
 *     <App />
 *   </TelemetryErrorBoundary>,
 * );
 * ```
 */
declare class TelemetryErrorBoundary extends Component<TelemetryErrorBoundaryProps, TelemetryErrorBoundaryState> {
    state: TelemetryErrorBoundaryState;
    static getDerivedStateFromError(error: Error): TelemetryErrorBoundaryState;
    componentDidCatch(error: Error, info: ErrorInfo): void;
    private readonly reset;
    render(): ReactNode;
}
/**
 * Handler bundle accepted by `createRoot(container, options)`.
 *
 * @remarks
 * `componentStack` is declared `string | undefined`, **not** `string | null |
 * undefined`, even though React can pass `null`. That is what makes the bundle
 * assignable to React 19's own `RootOptions`: under `exactOptionalPropertyTypes` an
 * optional property does not accept `null`, so widening it here would force every
 * call site to cast — and the documented usage is to spread this straight into
 * `createRoot`. Each handler already coalesces `null` to `undefined` before it
 * reaches `captureError`.
 */
interface ReactRootErrorHandlers {
    readonly onUncaughtError: (error: unknown, errorInfo: {
        componentStack?: string | undefined;
    }) => void;
    readonly onCaughtError: (error: unknown, errorInfo: {
        componentStack?: string | undefined;
    }) => void;
    readonly onRecoverableError: (error: unknown, errorInfo: {
        componentStack?: string | undefined;
    }) => void;
}
/**
 * Build React 19 root error handlers.
 *
 * @param context - extra context merged into every captured record
 * @returns handlers to spread into `createRoot`'s options
 *
 * @example
 * ```tsx
 * import { createRoot } from 'react-dom/client';
 * import { reactRootErrorHandlers } from '@codewithrajat/rm-logvault/react';
 *
 * createRoot(document.getElementById('root')!, reactRootErrorHandlers()).render(<App />);
 * ```
 */
declare function reactRootErrorHandlers(context?: ErrorContext): ReactRootErrorHandlers;
/**
 * A stable capture function for use inside components and effects.
 *
 * @param context - extra context merged into every captured record
 * @returns a function equivalent to `captureError`, pre-bound with `context`
 *
 * @example
 * ```tsx
 * import { useErrorCapture } from '@codewithrajat/rm-logvault/react';
 *
 * function Checkout() {
 *   const capture = useErrorCapture({ tags: { flow: 'checkout' } });
 *   return <button onClick={() => { try { pay(); } catch (error) { capture(error); } }}>Pay</button>;
 * }
 * ```
 */
declare function useErrorCapture(context?: ErrorContext): (error: unknown, extra?: ErrorContext) => void;

export { type ReactRootErrorHandlers, TelemetryErrorBoundary, type TelemetryErrorBoundaryProps, reactRootErrorHandlers, useErrorCapture };
