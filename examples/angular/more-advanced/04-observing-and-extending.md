# more-advanced — observing and extending (Angular)

**Problem it solves:** the recorder writes to IndexedDB, and that is all it does. A badge that shows the
error count, a store that mirrors new records, a classifier for the error codes your API returns, or a
report your support team can actually read — none of those exist yet, and polling
`getTelemetryStatus()` is a workaround rather than a seam.

**What you will learn:**

- `setupTelemetry` and the flat aliases, with initialisation order made explicit in a provider.
- The precedence rule, and why `{ url, rest: { errorsUrl } }` does what it does.
- `handle.events` as an injectable service holding Angular signals.
- Why `on()` before `initTelemetry` is a no-op, and what that means for service construction.
- Teaching the library your own error vocabulary with context builders.
- Listing and detaching logger sinks by key.
- The four export formats — including JSONL and CSV — with a progress callback.

## One call, flat options

The nested configuration is the precise form; the flat aliases are the short one. They are not a
different system — the flat names resolve into the same nested options, and `setupTelemetry` forwards to
`initTelemetry` unchanged.

```ts
import { setupTelemetry } from '@codewithrajat/rm-logvault';

setupTelemetry({
  app: 'checkout',
  version: '2.4.1',
  environment: 'production',
  url: '/api/telemetry',   // BOTH rest.errorsUrl and rest.logsUrl
  level: 'info',           // the PERSIST level — logs.level
  maxErrors: 1000,
});
```

Those two calls are equivalent, and mixing them in one codebase is fine:

```ts
import { initTelemetry } from '@codewithrajat/rm-logvault';

initTelemetry({
  appName: 'checkout',
  appVersion: '2.4.1',
  environment: 'production',
  rest: { errorsUrl: '/api/telemetry', logsUrl: '/api/telemetry' },
  logs: { level: 'info' },
  errors: { maxRecords: 1000 },
});
```

| Flat alias | Nested option | Unit | Default |
| --- | --- | --- | --- |
| `url` | `rest.errorsUrl` **and** `rest.logsUrl` | path or absolute `http(s)` | none |
| `errorUrl` / `logUrl` | `rest.errorsUrl` / `rest.logsUrl` | path or absolute `http(s)` | none |
| `headers` | `rest.getHeaders` | provider, awaited per request | none |
| `level` | `logs.level` — the **persist** level | level | `warn` |
| `consoleLevel` | `logs.consoleLevel` — applied at init | level | **none** (console untouched) |
| `captureConsole` | `logs.captureConsole` | boolean | `false` |
| `maxErrors` / `maxLogs` | `errors.maxRecords` / `logs.maxRecords` | rows | `500` / `2000` |
| `errorRetentionDays` / `logRetentionDays` | `errors.retentionDays` / `logs.retentionDays` | days; `0` = no age deletion | `7` / `3` |
| `app` / `version` / `build` | `appName` / `appVersion` / `buildId` | string | none |

## The precedence rule runs inside-out

**Nested option > flat alias > environment > built-in default.** So a nested value beats its own alias,
which is what makes the two forms mixable without a surprise:

```ts
setupTelemetry({
  url: '/api/telemetry',            // both kinds go here…
  rest: { errorsUrl: '/api/errors' } // …except errors, which go here.
});
// errors -> /api/errors      logs -> /api/telemetry
```

An invalid value **falls through** rather than winning by being present. A level the library does not
recognise is ignored, so the alias below it still applies:

```ts
setupTelemetry({ level: 'error', logs: { level: 'verbose' as never } });
// logs.level === 'error' — 'verbose' is not a level, so it is skipped
```

The same holds for an empty string, and the explicit long name beats the short one:

```ts
setupTelemetry({ appName: 'checkout', app: 'ignored' }); // appName stays 'checkout'
setupTelemetry({ url: '/fallback', rest: { errorsUrl: '' } }); // errors -> /fallback
```

> **Source note.** The flat aliases and `setupTelemetry` are *additive*. No nested option changed
> meaning, and `initTelemetry({ appName: 'x' })` behaves exactly as it did — so the two can be adopted
> file by file.

## Making initialisation order explicit

Angular has one requirement that the library does not: the pipeline has to exist **before** the first
component is created, because the `ErrorHandler` provider needs something live to report into. A factory
provider states that ordering in the DI graph rather than relying on the statement order of `main.ts`.

```ts
// src/app/telemetry/telemetry.config.ts
import type { Provider } from '@angular/core';
import type { TelemetryHandle, TelemetryOptions } from '@codewithrajat/rm-logvault';
import { setupTelemetry } from '@codewithrajat/rm-logvault';
import { environment } from '../../environments/environment';
import { TELEMETRY_HANDLE } from './telemetry.tokens';

/** The build-time half of the configuration, as a plain value. */
export const TELEMETRY_OPTIONS: TelemetryOptions = {
  appName: 'checkout',
  appVersion: environment.appVersion,
  buildId: environment.buildId,
  environment: environment.name,
  url: environment.telemetryUrl,
  level: environment.production ? 'warn' : 'info',
  maxErrors: 1000,
  // Keep local-only when no collector is configured for this environment.
  enabled: environment.telemetryEnabled,
};

export function provideTelemetry(): Provider {
  return {
    provide: TELEMETRY_HANDLE,
    useFactory: (): TelemetryHandle => setupTelemetry(TELEMETRY_OPTIONS),
  };
}
```

```ts
// src/app/telemetry/telemetry.tokens.ts
import { InjectionToken } from '@angular/core';
import type { TelemetryHandle } from '@codewithrajat/rm-logvault';

export const TELEMETRY_HANDLE = new InjectionToken<TelemetryHandle>('TELEMETRY_HANDLE');
```

```ts
// src/main.ts
import { bootstrapApplication } from '@angular/platform-browser';
import { captureError } from '@codewithrajat/rm-logvault';
import { provideTelemetryErrorHandler } from '@codewithrajat/rm-logvault/angular';
import { AppComponent } from './app/app.component';
import { appConfig } from './app/app.config';

bootstrapApplication(AppComponent, {
  providers: [
    // Telemetry first: the ErrorHandler below needs a live pipeline.
    ...(appConfig.providers ?? []),
    provideTelemetry(),
    provideTelemetryErrorHandler(),
  ],
}).catch((error: unknown) => {
  // A bootstrap failure happens before any ErrorHandler exists.
  captureError(error, { source: 'manual', tags: { phase: 'bootstrap' } });
});
```

> **Source note.** `setupTelemetry` is idempotent in the same way `initTelemetry` is: a second call
> returns the **same handle object** and installs nothing. That is why a provider is safe under
> hot-reload and why reconfiguring at runtime needs `destroyTelemetry()` first.

> **Source note.** If your Angular version has `provideAppInitializer`, it also works — but keep the
> callback **synchronous**. A callback that awaits something makes the bootstrap asynchronous, and
> Angular will render the shell before telemetry exists.

## Events as an injectable service

`initTelemetry`'s handle carries `events: EventEmitter`. Wrapping it in a service is what turns it into
Angular state: a signal a template can read, with the subscription tied to the service's lifetime.

```ts
// src/app/telemetry/telemetry-events.service.ts
import { DestroyRef, Injectable, computed, inject, signal } from '@angular/core';
import type { ErrorCapturedEvent, LogWrittenEvent } from '@codewithrajat/rm-logvault';
import { TELEMETRY_HANDLE } from './telemetry.tokens';

@Injectable({ providedIn: 'root' })
export class TelemetryEventsService {
  private readonly telemetry = inject(TELEMETRY_HANDLE);
  private readonly destroyRef = inject(DestroyRef);

  /** Incremented for every accepted error record. */
  readonly errorCount = signal(0);
  /** Incremented for every log record that passed the persist level. */
  readonly logCount = signal(0);
  /** The fingerprint of the most recent error, for a "last failure" panel. */
  readonly lastFingerprint = signal<string | null>(null);
  /** Total records the library observed this page load. */
  readonly total = computed(() => this.errorCount() + this.logCount());

  public constructor() {
    // Subscribe AFTER initTelemetry has run. Subscribing earlier is a no-op — see below.
    const offError = this.telemetry.events.on('error:captured', (event: ErrorCapturedEvent) => {
      this.errorCount.update((count) => count + 1);
      this.lastFingerprint.set(event.fingerprint);
    });

    const offLog = this.telemetry.events.on('log:written', (event: LogWrittenEvent) => {
      this.logCount.update((count) => count + 1);
      void event.level; // already-sanitized message is on event.message
    });

    this.destroyRef.onDestroy(() => {
      offError();
      offLog();
    });
  }
}
```

```ts
// src/app/status-badge/status-badge.component.ts
import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { TelemetryEventsService } from '../telemetry/telemetry-events.service';

@Component({
  selector: 'app-status-badge',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @if (events.errorCount() > 0) {
      <span class="badge" [title]="events.lastFingerprint() ?? ''">
        {{ events.errorCount() }} error(s)
      </span>
    }
  `,
})
export class StatusBadgeComponent {
  protected readonly events = inject(TelemetryEventsService);
}
```

The six events and their payloads:

| Event | Fires when | Useful fields |
| --- | --- | --- |
| `error:captured` | an error record is accepted | `recordId`, `fingerprint`, `severity`, `source`, `category`, `handled`, `occurrenceCount` |
| `log:written` | a log passes the persist level | `recordId`, `level`, `message` (already sanitized) |
| `sync:started` | an explicit `syncTelemetry()` begins, per kind | `kind`, `recordCount` |
| `sync:completed` | a kind's upload pass finishes | `kind`, `uploaded`, `retried`, `failed` |
| `sync:failed` | a kind had terminally-failed records | `kind`, `status`, `recordCount` |
| `record:dropped` | the rate limiter discarded captures | `kind`, `reason`, `count` |

> **Source note.** **`on()` is a no-op before `initTelemetry` runs.** It returns an unsubscribe function
> and registers nothing, so a listener subscribed too early is silently never called. That is why the
> service above is constructed *after* the provider — and why injecting it from an `APP_INITIALIZER`
> factory that runs before `provideTelemetry()` would not work. The `handle.events` **object identity**
> survives a `destroyTelemetry()` → `initTelemetry()` cycle, but the registrations are cleared by
> teardown, so re-subscribe after re-initialising.

> **Source note.** `sync:failed.status` is **always `0`**, meaning "not captured" — not an HTTP status.
> `FlushSummary` is a per-kind aggregate over several batch attempts, so it carries no single status. Use
> `rest.onTerminalFailure` when you need the real one.

Three guarantees make this safe to hand to application code:

- **A throwing listener cannot break the capture it was notified about.** Each listener runs in its own
  `try`/`catch`.
- **An async listener's rejection can never become an unhandled rejection.** It is routed into the
  library's `[Telemetry]` diagnostics.
- **Nested emission is bounded.** A listener that emits is delivered **once, asynchronously**, and
  further nesting is dropped — so `onAny(() => logger.warn(...))` cannot recurse forever.

> **Source note.** Events report `captureError` and `logger` activity plus **explicit** `syncTelemetry()`
> runs. The automatic background flush is internal and does **not** emit `sync:started` or
> `sync:completed`, because those are framed as "the pass you asked for".

## Teaching the library your error shapes

The library classifies what it produces — HTTP failures, chunk-load errors, timeouts. It cannot know
that `code: 'ALARM_NOT_FOUND'` is a domain error. Register a builder and **every** capture is
classified, including ones routed through `provideTelemetryErrorHandler()`, whose call site you do not
control.

```ts
// src/app/telemetry/telemetry-context.ts
import {
  captureError,
  registerErrorContextBuilder,
  type ErrorContextBuilder,
} from '@codewithrajat/rm-logvault';

const alarms: ErrorContextBuilder = {
  name: 'alarms',
  canHandle: (error) => {
    const code = (error as { code?: unknown } | null)?.code;
    return typeof code === 'string' && code.startsWith('ALARM_');
  },
  build: (error) => ({
    category: 'runtime',
    severity: 'warning',
    tags: { domain: 'alarms', code: String((error as { code?: unknown }).code) },
  }),
};

// Call this before bootstrapApplication, so it applies to bootstrap failures too.
export function installTelemetryContext(): void {
  registerErrorContextBuilder(alarms);
}
```

```ts
// src/main.ts (top of file, before bootstrap)
import { installTelemetryContext } from './app/telemetry/telemetry-context';
import { installBuiltinContextBuilders } from '@codewithrajat/rm-logvault';

installTelemetryContext();
// timeout -> http -> type-error, in that order.
installBuiltinContextBuilders();
```

Two rules decide what a builder can and cannot change:

- **Registration order wins, first match.** Register specific classifiers before general ones, which is
  why the three built-ins are ordered `timeout` → `http` → `type-error`.
- **Your explicit call-site fields always beat the builder's.** A builder cannot relabel an integration
  you already described correctly:

```ts
// The record's source is 'angular', not whatever the builder returned.
captureError(error, { source: 'angular' });
```

`tags` and `extra` are the exception: they **merge key-by-key** with the call site winning on a
conflict, because those two are additive by nature.

```ts
// builder contributes { domain: 'alarms' }, the call site contributes { flow: 'checkout' }
captureError(error, { tags: { flow: 'checkout' } });
// record.tags === { domain: 'alarms', flow: 'checkout' }
```

> **Source note.** The registry is process-wide and **survives `destroyTelemetry`**, because it
> describes the application rather than an installation. A duplicate `name` **replaces** the earlier
> builder. A throwing `canHandle` counts as "no match" and a throwing `build` falls through to the next
> builder, so a third-party classifier cannot swallow a capture.

> **Source note.** **Nothing self-registers.** Importing the built-in builders has no effect until you
> call `installBuiltinContextBuilders()`, so upgrading the library can never silently change how your
> existing application classifies its errors.

## Listing and detaching logger sinks

`logger.addSink(sink)` remains **the** way to install a sink — it is what drives pre-init replay and the
re-entrancy guard. The registry is what sits behind it, for the questions that come up once there are
three sinks.

```ts
// src/app/telemetry/overlay-sink.ts
import { getSinkRegistry, logger, type LogRecord, type LogSink } from '@codewithrajat/rm-logvault';

const overlay: LogSink = {
  name: 'overlay',
  write: (record: LogRecord): void => renderInDebugPanel(record),
};

// Install through addSink — never by registering directly.
const off = logger.addSink(overlay);

// Inspect what is attached. Keys are `${sink.name ?? 'sink'}#${n}`.
getSinkRegistry().keys();
// ['@codewithrajat/rm-logvault-indexeddb#1', 'overlay#2']

// Detach by key from anywhere, including a teardown path.
export function removeOverlay(): void {
  for (const entry of getSinkRegistry().list()) {
    if (entry.name === 'overlay') getSinkRegistry().unregister(entry.key);
  }
}
```

| Member | Use |
| --- | --- |
| `list()` | every registration as `{ key, name, sink }`, in insertion order |
| `keys()` / `size()` / `has(key)` / `get(key)` | introspection and lookup |
| `unregister(key)` | detach one sink; returns `true` when one was removed |
| `register(key, sink)` / `clear()` | used by the facade; prefer `addSink` and the returned unsubscribe |

This sits **beside** `provideTelemetryErrorHandler()`, not instead of it. The provider routes Angular's
`ErrorHandler` into `captureError`; a sink observes log records once they are built. A sink is the right
tool for "also mirror records into a debug panel"; the provider is the right tool for "Angular routed an
error here".

> **Source note.** The sequence suffix in the key is what keeps two sinks declaring the same `name` from
> replacing each other. Re-registering an existing key replaces that sink; calling an older unsubscribe
> function afterwards is safe and does not remove the replacement.

## Reports in four formats

`exportDiagnosticsReport` returns `{ ok, format, bytes }` — **not** a `boolean`. It is still truthy on
success, but reading the fields is more useful.

```ts
// src/app/diagnostics/diagnostics.service.ts
import { Injectable, signal } from '@angular/core';
import { exportDiagnosticsReport } from '@codewithrajat/rm-logvault';

@Injectable({ providedIn: 'root' })
export class DiagnosticsService {
  readonly progress = signal(0);
  readonly busy = signal(false);
  readonly lastBytes = signal(0);

  public async exportJsonLines(): Promise<void> {
    this.busy.set(true);
    try {
      const result = await exportDiagnosticsReport({
        format: 'jsonl',
        // `pretty` is ignored by jsonl on purpose: one compact object per line.
        onProgress: (processed, total) => {
          this.progress.set(total === 0 ? 100 : Math.round((processed / total) * 100));
        },
      });
      if (!result.ok) {
        // No browser, nothing stored, or an export was already in flight.
        return;
      }
      this.lastBytes.set(result.bytes);
    } finally {
      this.busy.set(false);
    }
  }

  public async exportCsv(): Promise<void> {
    // One table for both kinds, with a leading `kind` column.
    await exportDiagnosticsReport({ format: 'csv', filenamePrefix: 'support-bundle' });
  }
}
```

| `format` | Output | Good for |
| --- | --- | --- |
| `'html'` (default) | self-contained report with the JSON payload embedded | sending to a person |
| `'json'` | one document: `{ schemaVersion, generatedAt, app, page, errors, logs }` | a script, or your own viewer |
| `'jsonl'` | one compact `{"kind":"error"\|"log",...}` per line | `grep`, `jq`, a log pipeline |
| `'csv'` | one wide table, both kinds, CRLF line endings | a spreadsheet |

> **Source note.** **The return type is a breaking change** from `Promise<boolean>`, which is what the
> older guides show. `if (await exportDiagnosticsReport())` still works because the object is truthy, but
> `const written = await exportDiagnosticsReport(); if (!written)` reads as "did it work" while testing
> an object — check `result.ok` instead.

> **Source note.** `'csv'` neutralises spreadsheet formula injection: a cell beginning with `=`, `+`,
> `-`, `@`, a tab or a carriage return is prefixed with an apostrophe, because Excel, Sheets and
> LibreOffice execute such a cell on open — and an error message is attacker-influenced input.

> **Source note.** `onProgress` fires once per 500 records and once at the end. `onExported` is **not**
> called when the export returns early (non-browser, no repository, or a concurrent call).

## Related

- [Using the HTTP client](./05-using-the-http-client.md) — the library's own client, with `onError`
  wired to `captureError`.
- [Encrypting stored records](./06-encrypting-stored-records.md) — what changes when a field is
  encrypted, including why `message` is a bad candidate.
- [The Angular adapter](./01-framework-adapter.md) — `provideTelemetryErrorHandler` in depth.
- [Environment variables](../config/01-environment-variables.md) — mapping each name to its nested and
  flat option.
