# more-advanced — the Angular adapter

**Problem it solves:** Angular has its own `ErrorHandler`, and the provider that redirects it has a
compiler-option constraint you need to understand — otherwise you cannot tell whether this adapter will
work in a given Angular project, or why it is shaped the way it is.

**What you will learn:**

- Why the provider is a **factory** and not `useClass`, and the exact compiler option at stake.
- What `TelemetryErrorHandler` does with an error, in order.
- The one failure Angular's `ErrorHandler` cannot cover.
- How to chain a previous handler yourself.
- How to write your own `ErrorHandler` when the provider is not enough, and what that costs.

## The provider

```ts
import { bootstrapApplication } from '@angular/platform-browser';
import { provideTelemetryErrorHandler } from '@codewithrajat/rm-logvault/angular';
import { AppComponent } from './app/app.component';

bootstrapApplication(AppComponent, {
  providers: [provideTelemetryErrorHandler({ tags: { shell: 'checkout' } })],
});
```

It returns a normal Angular provider:

```ts
{ provide: ErrorHandler, useFactory: () => new TelemetryErrorHandler(context) }
```

## Why a factory, and not `useClass`

This is the load-bearing detail. The equivalent `useClass` form would be:

```ts
// Do not do this: it requires DI metadata the consumer may not emit.
{ provide: ErrorHandler, useClass: TelemetryErrorHandler }
```

- A `useClass` provider for a class with **constructor parameters** requires Angular DI metadata, which
  only exists when the consumer's tsconfig enables **both** `experimentalDecorators` **and**
  `emitDecoratorMetadata`.
- A `useFactory` provider has no such requirement, because the factory constructs the instance itself.

So the adapter imposes **no compiler-option requirement beyond what Angular already needs**: a project
with `"emitDecoratorMetadata": false` works, because `@Component` needs `experimentalDecorators` but this
adapter needs neither.

The practical consequence: you can adopt this in an existing Angular project without touching its
compiler configuration, and without a decorator-metadata failure that would only appear at runtime.

## What the handler does, in order

```ts
export class TelemetryErrorHandler implements ErrorHandler {
  public constructor(private readonly context?: ErrorContext) {}

  public handleError(error: unknown): void {
    try {
      captureError(error, { source: 'angular', ...(this.context ?? {}) });
    } catch {
      // Reporting must never break the framework's own handling.
    }

    // …then delegate to console.error exactly as Angular's default handler does.
  }
}
```

Two guarantees follow:

1. **Reporting first, delegation second.** Angular's default output is preserved, so you get telemetry
   *and* the console behaviour you already had — never telemetry instead of it.
2. **`console` is reached through `Reflect.get` / `Reflect.apply`, inside a `try`.** A missing, deleted
   or hostile `console` cannot break error handling. (This is why the Angular adapter is one of the only
   two files allowed to touch `console.*` at all.)

## The failure `ErrorHandler` cannot cover

A **bootstrap** failure happens before any `ErrorHandler` exists, so Angular has nowhere to route it.
Report it by hand in the promise chain:

```ts
import { bootstrapApplication } from '@angular/platform-browser';
import { captureError, initTelemetry } from '@codewithrajat/rm-logvault';
import { provideTelemetryErrorHandler } from '@codewithrajat/rm-logvault/angular';
import { AppComponent } from './app/app.component';

initTelemetry({ appName: 'my-app' });

bootstrapApplication(AppComponent, {
  providers: [provideTelemetryErrorHandler()],
}).catch((error: unknown) => {
  captureError(error, { source: 'manual', tags: { phase: 'bootstrap' } });
});
```

`source: 'manual'` is deliberate: a bootstrap failure is not an `ErrorHandler` failure, and labelling it
`'angular'` would misreport where it came from.

## Chaining a previous handler yourself

If your application already replaced `ErrorHandler` and you want to keep that reference, resolve it from
an injector and chain it explicitly:

```ts
import { ErrorHandler, inject, Injector } from '@angular/core';
import { getPreviousErrorHandler } from '@codewithrajat/rm-logvault/angular';

const previous = getPreviousErrorHandler(inject(Injector));
```

`getPreviousErrorHandler(injector)` returns the existing handler, or `undefined` when there is none —
and it returns `undefined` when the existing handler is already a `TelemetryErrorHandler`, so you cannot
chain the adapter into itself by accident.

## Writing your own `ErrorHandler`

The provider is the default and needs nothing from you. Write your own when you need something it
cannot express — per-error context derived from the error itself, chaining into a handler you own, or a
handler that has to inject a service.

```ts
// live-error-handler.ts
import { ErrorHandler } from '@angular/core';
// The ROOT entry. This is the copy of captureError that initTelemetry() wired up.
import { captureError } from '@codewithrajat/rm-logvault';

export class LiveErrorHandler implements ErrorHandler {
  public handleError(error: unknown): void {
    try {
      captureError(error, { source: 'angular', tags: { shell: 'checkout' } });
    } catch {
      // reporting must never break the framework's own handling
    }
    try {
      console.error(error); // keep Angular's default console output
    } catch {
      // a hostile console is not our problem
    }
  }
}
```

```ts
// app.config.ts
import { ErrorHandler, type ApplicationConfig } from '@angular/core';
import { provideBrowserGlobalErrorListeners } from '@angular/platform-browser';
import { provideRouter } from '@angular/router';
import { LiveErrorHandler } from './live-error-handler';
import { routes } from './app.routes';

export const appConfig: ApplicationConfig = {
  providers: [
    provideBrowserGlobalErrorListeners(),
    provideRouter(routes),
    // A factory provider, for the same reason the adapter's is: no decorator
    // metadata, so no @Injectable() and no emitDecoratorMetadata.
    { provide: ErrorHandler, useFactory: () => new LiveErrorHandler() },
  ],
};
```

The component does not change. A `throw` from a template handler, a lifecycle hook or a subscription
still reaches this handler, so the call site looks no different:

```ts
import { logger } from '@codewithrajat/rm-logvault';

public throwInHandler(): void {
  logger.info('[checkout] throwing from an Angular event handler'); // -> rm-logvault-logs
  throw new Error('Thrown from an Angular event handler');          // -> rm-logvault-errors
}
```

Those two statements are one log record and one error record in two different databases — see
[a log line and a throw are two independent records](../basic/README.md#a-log-line-and-a-throw-are-two-independent-records).

**What you take on.** The adapter adds exactly two things beyond `captureError`, and you now own both:

- `source: 'angular'` is your choice. Keep it for a failure Angular routed here; use `'manual'` for one
  you report by hand, because a misleading `source` is a bug in the report rather than a label.
- The provider's `context` is no longer merged into every record, so pass `tags` and `extra` per call.

**What you do not lose.** The guarantees live in `captureError`, not in the adapter: it never throws, it
collapses the same `Error` object arriving through two handlers into one record, and it bounds and
sanitizes whatever you hand it. The `console.error` delegation is the other half, and the class above
reproduces it.

> **Source note.** On 1.0.0 this pattern was also the **workaround**, not just an option: every adapter
> subpath bundle inlined its own copy of the error pipeline, and that copy's tracker could never be
> installed, so `provideTelemetryErrorHandler()` silently discarded everything Angular routed to it —
> no record and no `[Telemetry]` warning, because nothing had failed. Fixed in 1.0.1; see
> [docs/TROUBLESHOOTING.md](../../../docs/TROUBLESHOOTING.md#errors-are-missing-while-logs-are-stored).

## What arrives in a record

| Failure | Record |
| --- | --- |
| Thrown in a template event handler, a lifecycle hook, or a subscription | `source: 'angular'`, merged with the provider's `context` |
| A bootstrap failure | `source: 'manual'` with your own tags |
| An HTTP failure | Only with the `axios`/`fetch` adapters |
| An explicit `logger.error(...)` | Straight to the vault |

`tsc` checks the component **class** but not template expressions — only `ng build` (AOT) does that, so a
mistyped binding surfaces as a build failure rather than a type error.

## Next

- Back to the power surface: [README.md](./README.md).
- The exhaustive option reference: [docs/API.md](../../../docs/API.md#every-option-annotated).
