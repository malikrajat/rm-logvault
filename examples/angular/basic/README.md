# basic — Angular (standalone)

**Problem it solves:** you want a real error and log record kept on the device, from one call, before
anyone has agreed on a collector — and in Angular that call has to happen before
`bootstrapApplication`, because the provider needs a live pipeline to report into.

**What you will learn:**

- The whole integration: `initTelemetry()` and one entry in the `providers` array.
- *Where* the call goes relative to `bootstrapApplication`, and what breaks if it moves.
- Why the provider is a **factory**, and the compiler option that would otherwise be required.
- The one failure Angular's `ErrorHandler` cannot cover, and how to report an error by hand into the
  errors store.
- How to read `getTelemetryStatus()` and where the records physically are.

## The integration

`src/main.ts` — the whole thing:

```ts
import { bootstrapApplication } from '@angular/platform-browser';
import { captureError, initTelemetry } from '@codewithrajat/rm-logvault';
import { provideTelemetryErrorHandler } from '@codewithrajat/rm-logvault/angular';
import { AppComponent } from './app/app.component';

initTelemetry({ appName: 'my-app' });

bootstrapApplication(AppComponent, {
  providers: [provideTelemetryErrorHandler({ tags: { shell: 'checkout' } })],
}).catch((error: unknown) => {
  // A bootstrap failure happens before Angular's ErrorHandler can be reached, so
  // this one is reported by hand.
  captureError(error, { source: 'manual', tags: { phase: 'bootstrap' } });
});
```

### Where the call goes

`initTelemetry` **before** `bootstrapApplication`. A component that throws while bootstrapping should
already be covered, and the provider needs a live pipeline to report into.

Do not move the call into a component, an `APP_INITIALIZER`, or the root component's constructor. It
would run late, and because `initTelemetry` is idempotent every call after the first returns the
*existing* handle and **ignores your options**.

### One provider entry, and why it is a factory

`provideTelemetryErrorHandler()` returns `{ provide: ErrorHandler, useFactory: … }` rather than
`useClass`. That is deliberate and load-bearing:

- A `useClass` provider for a class with **constructor parameters** requires Angular DI metadata, which
  only exists when the consumer's tsconfig enables **both** `experimentalDecorators` **and**
  `emitDecoratorMetadata`.
- A factory has no such requirement, so the adapter works in any Angular project regardless of how its
  compiler is configured. A project with `"emitDecoratorMetadata": false` still works: `@Component`
  needs `experimentalDecorators`, but this adapter needs neither.

### Chaining Angular's own handler

Angular routes every error to its `ErrorHandler`, whose default implementation is `console.error`. The
adapter reports first and **then** calls `console.error`, so your console output is unchanged — you get
telemetry *and* the behaviour you already had, rather than telemetry instead of it.

### Where each failure is recorded

| Failure | Recorded as | Where it lands |
| --- | --- | --- |
| Thrown in a template event handler, a lifecycle hook, or a subscription | `ErrorHandler`, `source: 'angular'` | `rm-logvault-errors` |
| A bootstrap failure | Reported by hand in `.catch(...)` — no `ErrorHandler` exists yet | `rm-logvault-errors` |
| An error you report by hand | `captureError(err, { source: 'manual' })` | `rm-logvault-errors` |
| An HTTP failure | Only with the `axios`/`fetch` adapters — see [more-advanced](../more-advanced/README.md) | `rm-logvault-errors` |
| An explicit `logger.error(...)` | Straight to the vault, with `data` sanitized before storage | `rm-logvault-logs` |

**Errors and logs are two different databases.** A `throw` is not a log line and never appears in the
logs store, so "my logs are there but my error is not" usually means the second database was simply
not opened. The names come from `dbPrefix`; see
[Where the records actually are](#where-the-records-actually-are).

**Not every surprise is an error.** Reading a property that does not exist — `window.rajat` — returns
`undefined`. It does not throw, so there is nothing for any handler to record. Only *using* that value
throws, and that throw is captured with no call from you: by Angular's `ErrorHandler` if it happens
inside Angular (an event handler, a lifecycle hook, a subscription), or by the library's chained
`window.onerror` / `unhandledrejection` if it does not — a plain `addEventListener`, a timer, an inline
script. An error you catch **yourself** is the one case that is not automatic, because swallowing it
removes it from every handler.

### Putting a record in the errors store by hand

`captureError` is the **only** application-facing API that writes an error record, and it has to come
from the root entry. A service is the usual place for it:

```ts
// src/app/telemetry.service.ts
import { Injectable } from '@angular/core';
import { captureError } from '@codewithrajat/rm-logvault'; // root entry — no subpath exports this

@Injectable({ providedIn: 'root' })
export class TelemetryService {
  public report(error: unknown, tags?: Record<string, string>): void {
    captureError(error, tags === undefined ? { source: 'manual' } : { source: 'manual', tags });
  }
}
```

```ts
// src/app/app.component.ts
import { Component, inject } from '@angular/core';
import { TelemetryService } from './telemetry.service';

@Component({ /* … */ })
export class AppComponent {
  private readonly telemetry = inject(TelemetryService);

  public payWithMissingId(): void {
    // The property you are probing is not typed, so read it defensively.
    const orderId: unknown = Reflect.get(window, 'rajat');

    if (orderId === undefined) {
      this.telemetry.report(new Error('[checkout] window.rajat is missing'), {
        phase: 'checkout',
      });
    }
  }
}
```

`source: 'manual'` is deliberate: this failure was not routed by Angular's `ErrorHandler`, so labelling
it `'angular'` would misreport where it came from. `captureError` is synchronous and never throws, so it
is safe inside a `catch` block or an event handler.

Unlike logs — which are written when 50 accumulate or after `logs.writeFlushMs` (1000 ms) — an error
record is **queued for writing immediately**. Confirm it landed with `await flushTelemetry()` and then
`getTelemetryStatus().pending.errors`, or read `rm-logvault-errors` → `errors` directly.

```ts
// src/app/app.component.ts
import { Component } from '@angular/core';
import { logger } from '@codewithrajat/rm-logvault';

@Component({
  selector: 'app-root',
  template: `
    <button type="button" (click)="throwInHandler()">Throw in a handler</button>
    <button type="button" (click)="reportExplicitly()">logger.error()</button>
  `,
})
export class AppComponent {
  public throwInHandler(): void {
    // Stored only when logs.level allows 'info'; the default 'warn' drops it.
    logger.info('[checkout] about to throw from an Angular event handler');
    throw new Error('Thrown from an Angular event handler');
  }

  public reportExplicitly(): void {
    // No @angular/forms anywhere in these guides; plain bindings are enough.
    logger.error('[checkout] payment failed', { orderId: 'A-1024' });
  }
}
```

Standalone is the default in Angular 19+, so the component does not declare `standalone: true`.

### A log line and a `throw` are two independent records

The two statements above look like one story. They are not: they travel separate paths, carry separate
metadata, and land in **separate databases**.

```ts
logger.info('[checkout] about to throw');   // -> rm-logvault-logs,   level 'info'
throw new Error('Thrown from a handler');   // -> rm-logvault-errors, source 'angular'
```

- The `throw` neither suppresses, delays nor truncates the call before it. Order is irrelevant: the
  earlier statement has already been accepted or dropped by the time the `throw` runs.
- The call before it does **not** travel with the error. There is no breadcrumb buffer — an error
  record carries only what `captureError` was handed. To attach context to a failure, pass it at the
  throw site with `extra`, or once for every Angular error through the provider's `tags`.
- With the default `logs.level: 'warn'`, that `logger.info` is dropped at the sink (see the defaults
  table below) and appears in neither database. `logger.setLevel(...)` does not change this — that is
  the *console* level, which is deliberately independent of what is persisted.

So "the log is in IndexedDB but the error is not" is normally a lookup in the wrong database, not a
lost record. [docs/TROUBLESHOOTING.md](../../../docs/TROUBLESHOOTING.md#errors-are-missing-while-logs-are-stored)
walks through the four causes.

> Source note. On 1.0.0 the `provideTelemetryErrorHandler()` path did not record anything at all. Each
> adapter bundle inlined its own copy of the error pipeline, and that copy's tracker could never be
> installed, so every error Angular routed to it was buffered into an array nothing drained — silently,
> because no operation failed. Fixed in 1.0.1. If you are pinned to 1.0.0, the workaround is an
> `ErrorHandler` of your own that calls `captureError` from the **root** entry; the
> troubleshooting section above has it in full, along with a diagnosis that distinguishes this from an
> ordinary wrong-database mistake.

### The options this tier uses

| Option | Type | Default | What it means, and when to change it |
| --- | --- | --- | --- |
| `appName` | `string` | none | Stamped onto every record. Set it — a report that cannot say which application produced it is far less useful. There is no default because a guess would be worse than nothing. |
| `tags` (provider) | `Record<string, string>` | none | Merged into every record Angular's `ErrorHandler` reports. |

Everything else is defaulted, and the defaults are the interesting part:

| Defaulted behaviour | Value | Why that is the default |
| --- | --- | --- |
| `mode` | `'local'` | Records go to IndexedDB and **nothing is uploaded**, so the library is safe to add before a collector exists. Supplying a `rest.errorsUrl` or `rest.logsUrl` implies `'remote'` — see [advanced](../advanced/README.md). |
| `enabled` | `true` | The master switch. `false` makes every capture call a no-op and installs nothing. |
| `errors.enabled` / `logs.enabled` | `true` / `true` | Both stores are on. You can keep one and drop the other. |
| `errors.retentionDays` / `maxRecords` | `7` days / `500` rows | Whichever limit is reached first deletes a row. |
| `logs.retentionDays` / `maxRecords` | `3` days / `2000` rows | Logs are more voluminous and less precious than errors. |
| `logs.level` | `'warn'` | The **persist** threshold. `logger.info(...)` is dropped here **and** by the console threshold, which also defaults to `'warn'` — so at this tier an `info` line is neither printed nor stored. Raise `logs.consoleLevel` to see it, `logs.level` to keep it. |
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
poll it from a component without cost. When `storage` reports that the database failed to open — Safari
private mode, a blocked origin, a disabled setting — that is the first thing to check;
[docs/BROWSER-SUPPORT.md](../../../docs/BROWSER-SUPPORT.md) explains each cause.

```ts
// A status line without @angular/forms: poll and let Angular's change detection see the value.
private readonly timer = setInterval(() => {
  this.status = getTelemetryStatus();
}, 1000);
```

## Where the records actually are

Open DevTools → **Application** → **IndexedDB** → `rm-logvault-errors` (and `rm-logvault-logs`). The
database names come from `dbPrefix`, which defaults to `'rm-logvault'`; the object stores inside are
`errors` and `logs`.

For something you can attach to a ticket, press
<kbd>Ctrl</kbd>+<kbd>Shift</kbd>+<kbd>Alt</kbd>+<kbd>D</kbd>: one self-contained HTML file with every
stored record and a page-load drill-down. It is a keyboard listener, so it does not exist on a phone —
[advanced](../advanced/README.md) shows the button-based alternative.

### An Angular-specific type note

`tsc` checks the component **class** but not template expressions. Only `ng build` (AOT) does that, so
a mistyped binding is a build failure rather than a type error. Treat the build as the gate.

## What this tier deliberately does not cover

- **Uploading.** Local-only is the default; [advanced](../advanced/README.md) turns on REST sync.
- **Retention and volume.** The same tier sets those numbers on purpose instead of inheriting them.
- **The environment layer, redaction and console capture.** [config](../config/README.md) — including
  how values reach a browser bundle at all in Angular.
- **The factory-provider reasoning in full, custom repositories, transports and hooks.**
  [more-advanced](../more-advanced/README.md).

## Next

- The four capture recipes: [capture recipes](./01-capture-recipes.md).
- Ready to upload: [advanced](../advanced/README.md).
- The same tier for another framework: [../../vue/basic/README.md](../../vue/basic/README.md),
  [../../nextjs/basic/README.md](../../nextjs/basic/README.md),
  [../../vanilla/basic/README.md](../../vanilla/basic/README.md).
