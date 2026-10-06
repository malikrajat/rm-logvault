import { ErrorHandler, Provider } from '@angular/core';
import { E as ErrorContext } from './types-vgch86Bo.js';

/**
 * Angular adapter: an `ErrorHandler` implementation and a ready-made provider.
 *
 * @remarks
 * Angular's `ErrorHandler` is an ordinary injectable class, so the adapter is a
 * subclass that reports and then delegates to `console.error`, exactly as the
 * default implementation does — the framework's own diagnostics stay intact.
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
    /** Report the error, then preserve Angular's default console output. */
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
