import { ErrorHandler, Provider } from '@angular/core';
import { E as ErrorContext } from './types--hrpBzU7.js';

/**
 * Angular adapter: an `ErrorHandler` implementation and a ready-made provider.
 *
 * @remarks
 * Angular's `ErrorHandler` is an ordinary injectable class, so the adapter is a
 * subclass that reports and then delegates to `console.error`, exactly as the
 * default implementation does — the framework's own diagnostics stay intact.
 *
 * That delegation is the library's own console output, not an application log call,
 * so it runs inside `withConsoleCaptureSuppressed` (from `src/core/state.ts`, which
 * this entry already inlines). Without it, a project using both documented options —
 * `provideTelemetryErrorHandler()` and `logs: { captureConsole: true }` — stored every
 * handler failure twice: once as an `ErrorRecord` in the errors database and once as
 * a `[console]` `LogRecord` in the logs database. Fixed in 1.0.2; see
 * [docs/ERRORS-VS-LOGS.md](../../docs/ERRORS-VS-LOGS.md).
 *
 * The provider uses `useFactory` rather than `useClass` deliberately. A `useClass`
 * provider for a class carrying constructor parameters requires Angular DI
 * metadata, which in turn requires `experimentalDecorators` +
 * `emitDecoratorMetadata` in the *consumer's* tsconfig. A factory has no such
 * requirement, so this adapter works in any Angular project regardless of how its
 * compiler is configured.
 *
 * @packageDocumentation
 */

/**
 * An `ErrorHandler` that reports to the vault and then logs as Angular normally would.
 *
 * @example
 * ```ts
 * import { ErrorHandler } from '@angular/core';
 * import { TelemetryErrorHandler } from '@codewithrajat/rm-logvault/angular';
 *
 * @Component({
 *   // …
 *   providers: [{ provide: ErrorHandler, useClass: TelemetryErrorHandler }],
 * })
 * export class AppComponent {}
 * ```
 */
declare class TelemetryErrorHandler implements ErrorHandler {
    /** Extra context merged into every captured record. */
    private readonly context;
    /**
     * @param context - optional context merged into every captured record
     */
    constructor(context?: ErrorContext);
    /**
     * Report the error, then preserve Angular's default console output.
     *
     * @remarks
     * The console delegation is muted for capture on purpose: the failure is already
     * in the errors store, and `logs.captureConsole` must not turn the framework's own
     * console line into a second, `[console]` log record. The line itself still prints.
     */
    handleError(error: unknown): void;
}
/**
 * Build the provider entry for {@link TelemetryErrorHandler}.
 *
 * @param context - optional context merged into every captured record
 * @returns an object to place in an Angular `providers` array
 *
 * @example
 * ```ts
 * import { bootstrapApplication } from '@angular/platform-browser';
 * import { provideTelemetryErrorHandler } from '@codewithrajat/rm-logvault/angular';
 *
 * bootstrapApplication(AppComponent, {
 *   providers: [provideTelemetryErrorHandler({ tags: { shell: 'checkout' } })],
 * });
 * ```
 */
declare function provideTelemetryErrorHandler(context?: ErrorContext): Provider;
/**
 * Install the handler on an existing Angular injector.
 *
 * @param injector - an object with a `get` method, such as `Injector`
 * @returns `true` when a handler was replaced
 *
 * @remarks
 * Provided for the rare case where an application wants to keep a reference to the
 * previous handler and chain it itself.
 */
declare function getPreviousErrorHandler(injector: {
    get(token: typeof ErrorHandler, notFoundValue?: unknown): unknown;
}): ErrorHandler | undefined;

export { TelemetryErrorHandler, getPreviousErrorHandler, provideTelemetryErrorHandler };
