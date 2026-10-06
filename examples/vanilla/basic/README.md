# basic — vanilla TypeScript

**Problem it solves:** you want a real error and log record kept on the device, from one call, before
anyone has agreed on a collector — and you do not want to write `try`/`catch` around anything.

**What you will learn:**

- The whole integration: one `initTelemetry({ appName })` call.
- *Where* that call goes in a vanilla app — module top level, and why not later.
- The three ways a real failure arrives, and which browser mechanism catches each.
- What the defaults already do for you, so you know what you have not configured.
- How to read `getTelemetryStatus()` and where the records physically are.

## The integration

```ts
import { getTelemetryStatus, initTelemetry, logger } from '@codewithrajat/rm-logvault';

initTelemetry({ appName: 'my-app' });
```

That is the whole integration. Everything else in this tier is what happens *because* of that line.

### Where the call goes

At **module top level**, before anything else in your entry file can throw. There is no plugin, no
provider, no wrapper element and no `await`:

```ts
// src/main.ts
initTelemetry({ appName: 'my-app' });

// …your own code, and only then the rest of the application.
render();
```

Placement is the entire framework-specific question at this tier, and for vanilla the answer is also
the simplest one: the first statement of the entry module is the earliest point at which the library
can be listening, and it is the only point where "before anything can fail" is still true. Deferring
it — into a `DOMContentLoaded` listener, into an `async` IIFE after a `fetch`, or into the first
component's setup — opens a window in which a failure is simply lost.

### The options this tier uses

| Option | Type | Default | What it means, and when to change it |
| --- | --- | --- | --- |
| `appName` | `string` | none | Stamped onto every record. Set it — a report that cannot say which application produced it is far less useful. There is no default because a guess would be worse than nothing. |

Everything else is defaulted, and the defaults are the interesting part:

| Defaulted behaviour | Value | Why that is the default |
| --- | --- | --- |
| `mode` | `'local'` | Records go to IndexedDB and **nothing is uploaded**, so the library is safe to add before a collector exists. Supplying a `rest.errorsUrl` or `rest.logsUrl` implies `'remote'` — see [advanced](../advanced/README.md). |
| `enabled` | `true` | The master switch. `false` makes every capture call a no-op and installs nothing. |
| `errors.enabled` / `logs.enabled` | `true` / `true` | Both stores are on. You can keep one and drop the other. |
| `errors.retentionDays` / `maxRecords` | `7` days / `500` rows | Whichever limit is reached first deletes a row. |
| `logs.retentionDays` / `maxRecords` | `3` days / `2000` rows | Logs are more voluminous and less precious than errors, hence the shorter window and the larger cap. |
| `logs.level` | `'warn'` | The **persist** threshold. `logger.info(...)` is dropped here **and** by the console threshold, which also defaults to `'warn'` — so at this tier an `info` line is neither printed nor stored. Raise `logs.consoleLevel` to see it, `logs.level` to keep it. |
| `shortcut` | enabled, <kbd>Ctrl</kbd>+<kbd>Shift</kbd>+<kbd>Alt</kbd>+<kbd>D</kbd> | Downloads a self-contained HTML diagnostics report with no code at all. |

Full reference, including every boundary case:
[docs/API.md](../../../docs/API.md#every-option-annotated).

## The three ways a failure arrives

None of these needs a `try`/`catch` of your own:

| Trigger | Browser mechanism | Why it matters |
| --- | --- | --- |
| A synchronous `throw` in a click handler | `window.onerror` | The library **chains** any handler you already installed rather than replacing it, so an existing reporter keeps working. |
| `Promise.reject(...)` with no `.catch` | `unhandledrejection` | The most common silent failure in modern front-end code. |
| `logger.error('[checkout] payment failed', { orderId })` | explicit | For failures you *know* about but want stored beside the ones you do not. The `data` argument is sanitized before storage. |

```ts
document.querySelector('#throw')?.addEventListener('click', () => {
  throw new Error('Synchronous throw from a click handler');
});

document.querySelector('#reject')?.addEventListener('click', () => {
  void Promise.reject(new Error('Rejected promise nobody handled'));
});

document.querySelector('#log')?.addEventListener('click', () => {
  // Prefer explicit context over one long string: `data` is sanitized before storage.
  logger.error('[checkout] payment failed', { orderId: 'A-1024' });
});
```

## Reading the status

```ts
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
<kbd>Ctrl</kbd>+<kbd>Shift</kbd>+<kbd>Alt</kbd>+<kbd>D</kbd>: you get a single self-contained HTML file
with every stored record and a page-load drill-down. It is a keyboard listener, so it does not exist on
a phone — [advanced](../advanced/README.md) shows the button-based alternative.

## What this tier deliberately does not cover

- **Uploading.** Local-only is the default; [advanced](../advanced/README.md) turns on REST sync.
- **Retention and volume.** The same tier sets those numbers on purpose instead of inheriting them.
- **The environment layer, redaction and console capture.** [config](../config/README.md).
- **Custom repositories, transports and lifecycle hooks.** [more-advanced](../more-advanced/README.md).

## Next

- The four capture recipes: [capture recipes](./01-capture-recipes.md).
- Ready to upload: [advanced](../advanced/README.md).
- The same tier for React: [../../react/basic/README.md](../../react/basic/README.md) — identical
  library call, different placement.
