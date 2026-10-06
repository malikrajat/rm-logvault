# basic — Vue 3

**Problem it solves:** you want a real error and log record kept on the device, from one call, before
anyone has agreed on a collector — and in Vue that call has to happen before the application mounts,
because Vue permits exactly one `errorHandler` and the adapter must chain it.

**What you will learn:**

- The whole integration: `initTelemetry()`, then `createTelemetryVuePlugin()`, then `mount()`.
- *Where* those three lines go, and why the order is not cosmetic.
- Why the plugin **chains** an existing `app.config.errorHandler` instead of replacing it.
- Which Vue failures reach which hook, and which one does not reach Vue at all.
- How to read `getTelemetryStatus()` and where the records physically are.

## The integration

`src/main.ts` — the whole thing:

```ts
import { createApp } from 'vue';
import { initTelemetry } from '@codewithrajat/rm-logvault';
import { createTelemetryVuePlugin } from '@codewithrajat/rm-logvault/vue';
import App from './App.vue';

initTelemetry({ appName: 'my-app' });

createApp(App)
  .use(createTelemetryVuePlugin({ context: { tags: { shell: 'checkout' } } }))
  .mount('#app');
```

### Where the call goes

`initTelemetry` **first**, then the plugin, then `mount()`. A component that throws during the initial
mount should already be inside the reporting pipeline, and the plugin needs a live pipeline to report
into.

Do not move the call into a component. It would run once per instance, and because `initTelemetry` is
idempotent every call after the first returns the *existing* handle and **ignores your options** — a
confusing bug to chase.

### Chaining, not replacing

Vue gives you one `app.config.errorHandler`. A real application usually installs one already, and a
naive adapter would silently disable it. The plugin captures the previous handler and calls it
**after** reporting, swallowing its exceptions:

```ts
const previous = app.config.errorHandler;
app.config.errorHandler = (error, instance, info) => {
  // report first …
  if (typeof previous === 'function') {
    try {
      previous(error, instance, info);
    } catch {
      // a throwing app handler is not our problem
    }
  }
};
```

`app.config.warnHandler` is chained the same way and recorded with `severity: 'warning'`.

### Where each failure is recorded

| Failure | What arrives |
| --- | --- |
| Thrown inside a Vue event handler, lifecycle hook or render function | `app.config.errorHandler`, `source: 'vue'`; the failing hook is recorded in `extra.vueInfo` |
| A warning Vue would normally print to the console | `warnHandler`, chained, `severity: 'warning'` |
| `Promise.reject(...)` with no `.catch` | `unhandledrejection` — **not Vue's**, so no component is attached |
| An explicit `logger.error(...)` | Straight to the vault, with `data` sanitized before storage |

```vue
<script setup lang="ts">
import { logger } from '@codewithrajat/rm-logvault';

function throwInHandler(): void {
  throw new Error('Thrown from a Vue event handler');
}

function reportExplicitly(): void {
  // Prefer explicit context over one long string.
  logger.error('[checkout] payment failed', { orderId: 'A-1024' });
}
</script>

<template>
  <button type="button" @click="throwInHandler">Throw in a handler</button>
  <button type="button" @click="reportExplicitly">logger.error()</button>
</template>
```

If you cannot use a plugin — say the app instance is created elsewhere — the same adapter is available
as a plain function:

```ts
import { attachVueTelemetry } from '@codewithrajat/rm-logvault/vue';

attachVueTelemetry(app, { context: { tags: { shell: 'checkout' } } });
```

### The options this tier uses

| Option | Type | Default | What it means, and when to change it |
| --- | --- | --- | --- |
| `appName` | `string` | none | Stamped onto every record. Set it — a report that cannot say which application produced it is far less useful. There is no default because a guess would be worse than nothing. |
| `context` (plugin) | `ErrorContext` | none | Merged into every record the adapter reports. `tags` is the useful part: it is how you tell two shells apart in one report. |

Everything else is defaulted, and the defaults are the interesting part:

| Defaulted behaviour | Value | Why that is the default |
| --- | --- | --- |
| `mode` | `'local'` | Records go to IndexedDB and **nothing is uploaded**, so the library is safe to add before a collector exists. Supplying a `rest.errorsUrl` or `rest.logsUrl` implies `'remote'` — see [advanced](../advanced/README.md). |
| `enabled` | `true` | The master switch. `false` makes every capture call a no-op and installs nothing. |
| `errors.enabled` / `logs.enabled` | `true` / `true` | Both stores are on. You can keep one and drop the other. |
| `errors.retentionDays` / `maxRecords` | `7` days / `500` rows | Whichever limit is reached first deletes a row. |
| `logs.retentionDays` / `maxRecords` | `3` days / `2000` rows | Logs are more voluminous and less precious than errors. |
| `logs.level` | `'warn'` | The **persist** threshold. `logger.info(...)` is dropped here **and** by the console threshold, which also defaults to `'warn'` — so at this tier an `info` line is neither printed nor stored. Raise `logs.consoleLevel` to see it, `logs.level` to keep it. |
| `captureWarnings` | `true` | Vue's warnings are chained and recorded. Set it `false` to leave Vue's console output alone and record only errors. |
| `shortcut` | enabled, <kbd>Ctrl</kbd>+<kbd>Shift</kbd>+<kbd>Alt</kbd>+<kbd>D</kbd> | Downloads a self-contained HTML diagnostics report with no code at all. |

Full reference, including every boundary case:
[docs/API.md](../../../docs/API.md#every-option-annotated).

## Reading the status

```ts
import { getTelemetryStatus } from '@codewithrajat/rm-logvault';

const current = getTelemetryStatus();

current.mode;               // 'local' | 'remote'
current.storage;            // whether IndexedDB actually opened
current.pending.errors;     // records written but not yet uploaded
current.pending.logs;
current.online;
current.droppedByRateLimit;
```

`getTelemetryStatus()` reports in-memory state and does **not** read IndexedDB, which is why you can
poll it every second without cost. When `storage` reports that the database failed to open — Safari
private mode, a blocked origin, a disabled setting — that is the first thing to check;
[docs/BROWSER-SUPPORT.md](../../../docs/BROWSER-SUPPORT.md) explains each cause.

## Where the records actually are

Open DevTools → **Application** → **IndexedDB** → `rm-logvault-errors` (and `rm-logvault-logs`). The
database names come from `dbPrefix`, which defaults to `'rm-logvault'`; the object stores inside are
`errors` and `logs`.

For something you can attach to a ticket, press
<kbd>Ctrl</kbd>+<kbd>Shift</kbd>+<kbd>Alt</kbd>+<kbd>D</kbd>: one self-contained HTML file with every
stored record and a page-load drill-down. It is a keyboard listener, so it does not exist on a phone —
[advanced](../advanced/README.md) shows the button-based alternative.

### A Vue-specific type note

Plain `tsc` does **not** type-check the contents of a `.vue` file — neither the template nor the
`<script setup>` body — without a shim plus `vue-tsc`. Vite's Vue plugin does the real compilation, so
in practice `vite build` is what proves an SFC is valid. If you want that check in your own project,
add `vue-tsc`.

## What this tier deliberately does not cover

- **Uploading.** Local-only is the default; [advanced](../advanced/README.md) turns on REST sync.
- **Retention and volume.** The same tier sets those numbers on purpose instead of inheriting them.
- **The `VITE_` environment layer, redaction and console capture.** [config](../config/README.md).
- **The adapter's guarantees in full, custom repositories, transports and hooks.**
  [more-advanced](../more-advanced/README.md).

## Next

- The four capture recipes: [capture recipes](./01-capture-recipes.md).
- Ready to upload: [advanced](../advanced/README.md).
- The same tier for another framework: [../../angular/basic/README.md](../../angular/basic/README.md),
  [../../nextjs/basic/README.md](../../nextjs/basic/README.md),
  [../../vanilla/basic/README.md](../../vanilla/basic/README.md).
