# more-advanced — the Vue adapter

**Problem it solves:** Vue permits exactly one `app.config.errorHandler`. If the adapter replaced it,
installing telemetry would silently disable whatever error reporting you already had — so you need to
know precisely what it does with your handler, and what it does with Vue's warnings.

**What you will learn:**

- The two entry points, and when to use the function instead of the plugin.
- The **chaining** guarantee, for both `errorHandler` and `warnHandler`.
- What every captured record looks like: `source`, `extra`, and the warning shape.
- Which Vue failures the adapter cannot see.

## Two entry points, one implementation

```ts
import { createTelemetryVuePlugin, attachVueTelemetry } from '@codewithrajat/rm-logvault/vue';

// The plugin, for the normal case.
createApp(App).use(createTelemetryVuePlugin({ context: { tags: { shell: 'checkout' } } }));

// The function, when you already have the app instance.
attachVueTelemetry(app, { context: { tags: { shell: 'checkout' } } });
```

`createTelemetryVuePlugin(options)` returns `{ install(app) }`, which Vue calls for you. It delegates
straight to `attachVueTelemetry(app, options)`, so the two are exactly equivalent — pick whichever fits
how your app is constructed.

## The chaining guarantee

Vue gives you one handler per slot. The adapter captures the previous one and calls it **after**
reporting, so both run and neither is lost:

```ts
const previousErrorHandler = app.config.errorHandler;

app.config.errorHandler = (error, instance, info) => {
  try {
    captureError(error, {
      source: 'vue',
      // `info` is Vue's lifecycle hook name — the closest thing Vue offers to a
      // component stack.
      ...(typeof info === 'string' ? { extra: { vueInfo: info } } : {}),
      ...(context ?? {}),
    });
  } catch {
    // Reporting must never break the application.
  }

  // Chain: the application's own handler still runs, exactly once.
  if (typeof previousErrorHandler === 'function') {
    try {
      previousErrorHandler(error, instance, info);
    } catch {
      // A throwing app handler is not our problem.
    }
  }
};
```

`app.config.warnHandler` is chained the same way. Three details are worth noticing:

1. **Your handler runs second**, so it sees the original error untouched.
2. **A throw from your handler is swallowed.** It cannot take down the reporting path.
3. **A throw from the adapter's own work is swallowed too**, so a hostile error object cannot break boot.

## What each capture looks like

| Origin | Record |
| --- | --- |
| `errorHandler` | `source: 'vue'`; the hook name in `extra.vueInfo` when Vue supplies it |
| `warnHandler` | `source: 'vue'`, `severity: 'warning'`, `category: 'runtime'`, `handled: true`, `tags: { framework: 'vue', kind: 'warning' }`, Vue's trace in `extra.vueTrace` when present |
| Anything you pass to `captureError` / `logger.error` | **Your** context only — `VueAdapterOptions.context` is not applied to calls you make yourself |

## `VueAdapterOptions`

| Option | Type | Default | What it decides |
| --- | --- | --- | --- |
| `context` | `ErrorContext` | none | Merged into every record the adapter reports. `tags` is the useful part. |
| `captureWarnings` | `boolean` | `true` | Whether `warnHandler` is wrapped at all. Set `false` to leave Vue's warnings entirely alone and record only errors. |

```ts
createApp(App).use(
  createTelemetryVuePlugin({
    context: { tags: { shell: 'checkout' }, extra: { release: '2.4.1' } },
    captureWarnings: false, // errors only
  }),
);
```

## What the adapter cannot see

- **A rejected promise.** `unhandledrejection` is a browser event, not a Vue hook, so no component is
  attached and no Vue context is merged. It is still captured — by the global handler.
- **An error inside a `setTimeout` or a raw event listener.** Same reason: no Vue frame is involved.
- **A warning suppressed before it reaches `warnHandler`** (Vue's own filtering, or a production build).
- **An error after `destroyTelemetry()`.** Teardown removes the library's sink and the global handlers;
  the Vue handler you installed stays yours, and `initTelemetry` is idempotent if you re-initialise.

## Keeping it installed

The plugin installs hooks; it does not create the store or the transport. Replacing
`repository`/`rest.transport` is an `initTelemetry` option change, and because `initTelemetry` is
idempotent you apply it by calling `destroyTelemetry()` and then initialising again. The plugin can stay
installed throughout — it reports into whatever pipeline is current.

## Next

- Back to the power surface: [README.md](./README.md).
- The exhaustive option reference: [docs/API.md](../../../docs/API.md#every-option-annotated).
