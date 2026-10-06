import { App } from 'vue';
import { E as ErrorContext } from './types-vgch86Bo.js';

/**
 * Vue 3 adapter: a plugin that installs `errorHandler` and `warnHandler`.
 *
 * @remarks
 * Vue lets exactly one `app.config.errorHandler` exist. Installing a second one
 * silently discards the first, which is a classic way to break someone else's
 * error reporting. This adapter therefore **chains**: it captures the handler that
 * was already installed and calls it afterwards, so both run.
 *
 * @packageDocumentation
 */

/** Options for {@link createTelemetryVuePlugin}. */
interface VueAdapterOptions {
    /** Extra context merged into every captured record. */
    readonly context?: ErrorContext | undefined;
    /** Also wrap `app.config.warnHandler`. Default `true`. */
    readonly captureWarnings?: boolean | undefined;
}
/** The object returned by {@link createTelemetryVuePlugin}. */
interface TelemetryVuePlugin {
    install(app: App): void;
}
/**
 * Attach telemetry to a Vue application.
 *
 * @param app - the Vue application instance
 * @param options - see {@link VueAdapterOptions}
 *
 * @example
 * ```ts
 * import { createApp } from 'vue';
 * import { attachVueTelemetry } from '@codewithrajat/rm-logvault/vue';
 *
 * const app = createApp(App);
 * attachVueTelemetry(app, { context: { tags: { shell: 'checkout' } } });
 * app.mount('#app');
 * ```
 */
declare function attachVueTelemetry(app: App, options?: VueAdapterOptions): void;
/**
 * Create a Vue plugin that installs telemetry.
 *
 * @param options - see {@link VueAdapterOptions}
 * @returns a plugin suitable for `app.use()`
 *
 * @example
 * ```ts
 * import { createApp } from 'vue';
 * import { createTelemetryVuePlugin } from '@codewithrajat/rm-logvault/vue';
 *
 * createApp(App).use(createTelemetryVuePlugin()).mount('#app');
 * ```
 */
declare function createTelemetryVuePlugin(options?: VueAdapterOptions): TelemetryVuePlugin;

export { type TelemetryVuePlugin, type VueAdapterOptions, attachVueTelemetry, createTelemetryVuePlugin };
