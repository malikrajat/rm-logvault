import { Component, ReactNode, ErrorInfo } from 'react';
import { E as ErrorContext } from './types-vgch86Bo.cjs';

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
