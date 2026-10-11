# Worker failures and dynamic imports in an Angular app

**Problem it solves:** the two failure paths a report is most likely to be missing are both
Angular-placement problems rather than configuration ones.

A `Worker`'s `error` and `messageerror` events fire on the **`Worker` object**, so nothing
`initTelemetry` installs can see them — and the natural Angular home for the attachment, a field
initialiser on a root service, also runs in Node during prerender or SSR, where `Worker` does not
exist. A lazy route that fails to load has the mirror-image problem: the rejection belongs to the
router, not to your component, so the record either does not exist or arrives naming a hashed chunk
file instead of the screen the user was trying to reach.

**What you will learn:**

- Where the attachment belongs: an `@Injectable({ providedIn: 'root' })` service that owns the `Worker`
  and detaches in `ngOnDestroy`.
- Why a `Worker` must never be constructed in a field initialiser, and the `isPlatformBrowser` guard
  that fixes it.
- `withChunkCapture` inside `loadComponent` and `loadChildren`, so a failed lazy load carries the route
  pattern.
- What `handled: false` does once `provideTelemetryErrorHandler`'s `TelemetryErrorHandler` sees the same
  error — and why the provider's `useFactory` shape is part of that story.
- Why `attachWorker` is safe on a value that may not be a worker at all.

## Where the code goes

The adapter's behaviour — the two events, the three `op` values, the silence timeout, and which fields
are read from a worker event — is framework-agnostic and covered in depth in
[Capturing worker failures and dynamic-import failures](../../vanilla/more-advanced/07-workers-and-dynamic-imports.md).
Angular decides one thing, and it is a lifetime question:

| Piece | Where it goes | Why there |
| --- | --- | --- |
| The attachment | a `start()` method on an `@Injectable({ providedIn: 'root' })` service, behind `isPlatformBrowser` | it is a side effect with a teardown, and the injector owns both |
| The detach | that service's `ngOnDestroy`, or `DestroyRef.onDestroy` | `attachWorker` hands you the function; nothing else will call it |
| `withChunkCapture` | the route definition, around `loadComponent` / `loadChildren` | the route pattern exists only at the declaration |
| `initTelemetry` | `main.ts`, before `bootstrapApplication` | the service and the `/worker` subpath both capture into that installation |

> **Source note.** `/worker` is a separate entry point that calls the root `captureError`. That works —
> and has worked only since 1.0.1 — because the active tracker lives on
> `globalThis[Symbol.for('logvault@1')]` rather than in module scope, so two entries resolve one
> pipeline. On 1.0.0 an adapter bundle inlined its own copy of that pipeline, whose tracker was never
> installed, and the capture was discarded with no record and no warning:
> [docs/TROUBLESHOOTING.md](../../../docs/TROUBLESHOOTING.md#errors-are-missing-while-logs-are-stored).

## The service that owns the worker

```ts
// src/app/telemetry/health-worker.service.ts
import { isPlatformBrowser } from '@angular/common';
import { inject, Injectable, type OnDestroy, PLATFORM_ID } from '@angular/core';
import { attachWorker, type WorkerAttachment } from '@codewithrajat/rm-logvault/worker';

/** `providedIn: 'root'`: one instance per application, so `ngOnDestroy` runs when the application's
 *  injector is destroyed, not on a route change. Provide it per component for a per-screen worker. */
@Injectable({ providedIn: 'root' })
export class HealthWorkerService implements OnDestroy {
  private readonly platformId = inject(PLATFORM_ID);
  private worker: Worker | undefined;
  private attachment: WorkerAttachment | undefined;

  /** Idempotent, so a template, a guard or a resolver can call it without checking first. */
  public start(): void {
    // Prerender and SSR run this code in Node, where the `Worker` global does not exist.
    if (!isPlatformBrowser(this.platformId)) return;
    if (this.attachment !== undefined) return;

    // The form the Angular CLI bundles as a web worker.
    const worker = new Worker(new URL('./health.worker', import.meta.url), { type: 'module' });

    this.worker = worker;
    this.attachment = attachWorker(worker, {
      name: 'healthStatus', // stamped on every record as tags.worker
      responseTimeoutMs: 10_000, // armed per request with `expectResponse(label)`; unset disables it
      context: { tags: { shell: 'checkout' } },
    });

    worker.postMessage({ type: 'start' });
  }

  public ngOnDestroy(): void {
    // Removes our two listeners and cancels every pending timeout. Safe to call twice.
    this.attachment?.detach();
    this.worker?.terminate(); // `detach()` leaves the worker running; stopping it is our call
    this.worker = undefined;
    this.attachment = undefined;
  }
}
```

The consuming component is unchanged: it calls `start()` from `ngOnInit`, and the silence timeout is
armed per request with `attachment.expectResponse(label)`. Neither needs a platform check of its own,
because `start()` is guarded and idempotent.

## The field initialiser that breaks prerender

This is the version that looks tidiest and fails on the server:

```ts
// WRONG for anything that prerenders or server-renders.
@Injectable({ providedIn: 'root' })
export class BrokenHealthWorkerService {
  private readonly worker = new Worker(new URL('./health.worker', import.meta.url));
  private readonly attachment = attachWorker(this.worker, { name: 'healthStatus' });
}
```

Two things go wrong, and only the first is obvious:

1. **Field initialisers run during construction, and construction happens on the server too.** In
   `ng build` (prerender) or an SSR request, Angular builds the application in Node, which has no
   global `Worker`, so the line throws `ReferenceError: Worker is not defined` — on a path where no
   browser `ErrorHandler` exists to record it.
2. **The initialiser runs whether or not the worker is used.** Any code path that injects the service
   constructs the worker as a side effect of injection, so the failure is not adjacent to the feature
   that needed it.

The guard is a platform check, not a `typeof` check: `isPlatformBrowser(inject(PLATFORM_ID))`.

> **Source note.** The guard belongs at the **creation site**, not merely in `ngOnInit`. Angular runs
> lifecycle hooks during prerender, so moving `new Worker(...)` out of a field initialiser and into a
> hook changes *when* it fails, not *whether*. The library's own `isBrowser()` — exported from the root
> entry, and what its framework-free modules use — tests for `window` and `document` instead.

## Detaching, and what `detach()` does not do

`attachWorker` returns a callable `WorkerAttachment`, so the teardown is one line:

```ts
// src/app/export/export-panel.component.ts — route-scoped, so the attachment dies with the screen.
import { Component, inject } from '@angular/core';
import { CsvWorkerService } from './csv-worker.service';

@Component({
  selector: 'app-export-panel',
  providers: [CsvWorkerService], // no `providedIn`: one instance, destroyed with this component
  template: `<button type="button" (click)="csv.exportCsv()">Export</button>`,
})
export class ExportPanelComponent {
  protected readonly csv = inject(CsvWorkerService);
}
```

`CsvWorkerService` is `HealthWorkerService` above with another name and URL, plus an `exportCsv()`
method that calls `start()` and then `request('export', …)`. For a class that cannot implement
`OnDestroy`, the same teardown works from an injection context — a field initialiser, a constructor, or
a function called from either:

```ts
import { DestroyRef, inject } from '@angular/core';

const attachment = attachWorker(worker, { name: 'export' });
inject(DestroyRef).onDestroy(() => attachment.detach());
```

> **Source note.** `detach()` removes the two listeners and clears every pending timeout. It does
> **not** call `worker.terminate()` — a library that killed your worker on teardown would be changing
> application behaviour, and it cannot know whether the worker is yours alone.

> **Source note.** `destroyTelemetry()` does not detach your worker attachments: they are not in the
> library's cleanup registry, because `attachWorker` hands the teardown back rather than installing one.
> Detach first, then destroy. A capture made after `destroyTelemetry()` goes into the pre-initialisation
> buffer (at most 50 entries) rather than to a record, so a worker error arriving after teardown is
> neither a record nor a warning.

## `withChunkCapture` in the route definition

The library already recognises an **uncaught** dynamic-import failure, through
`errors.captureChunkErrors` (default `true`) and the Vite `vite:preloadError` listener. What it cannot
know is which screen the user was trying to reach — that exists only where the route is declared:

```ts
// src/app/app.routes.ts
import { type Routes } from '@angular/router';
import { withChunkCapture } from '@codewithrajat/rm-logvault';

export const routes: Routes = [
  {
    path: 'orders/:id',
    // The route pattern is the tag: Angular's router knows the URL, but only this call
    // site knows which screen it was loading.
    loadComponent: withChunkCapture('/orders/:id', () =>
      import('./orders/order-detail.component').then((m) => m.OrderDetailComponent),
    ),
  },
  {
    path: 'admin',
    // `loadChildren` takes the same shape, so a failed child bundle is covered too.
    loadChildren: withChunkCapture('/admin', () =>
      import('./admin/admin.routes').then((m) => m.ADMIN_ROUTES),
    ),
  },
];
```

`withChunkCapture` returns a loader with the same signature — `() => Promise<T>` — which is exactly
what `loadComponent` and `loadChildren` accept, so there is no adapter between them. Three properties
matter in that position:

- It is `async`, so it **never throws synchronously**; a loader that throws produces a rejected promise,
  as `import()` does.
- The original rejection value is **re-thrown unchanged**, so whatever the router does next sees exactly
  what `import()` rejected with.
- The failure is captured once, before the re-throw, as `source: 'chunk'`, `category: 'chunk'`,
  `severity: 'fatal'`, `handled: false` and `tags.route: '/orders/:id'`.

Whether a failed `loadComponent` reaches `ErrorHandler`, the router's `NavigationError` stream, or only
the rejected navigation promise is the router's decision, not this library's. The record exists either
way, and it names the route — the part no global handler could have contributed.

## `handled: false`, and the handler that sees the same error

A failed lazy load often reaches two capture paths: your `withChunkCapture` call site, and then
Angular's `ErrorHandler` with **the same `Error` object**. Deduplication is by object identity, so that
is one record, and the second call enriches it rather than writing a second row:

```ts
// From `withChunkCapture`: source 'chunk', category 'chunk', severity 'fatal', handled false,
// tags { route: '/orders/:id' }. Then the same Error object reaches Angular's ErrorHandler:
captureError(error, { source: 'angular', tags: { shell: 'checkout' } });

// One record: source 'chunk', handled false, tags { route: '/orders/:id', shell: 'checkout' }.
```

| What the second capture asks for | What the record does |
| --- | --- |
| `source: 'angular'` | **Ignored.** `withChunkCapture` passed an explicit source, and an explicit source is never overwritten. |
| `tags` from the provider's `context` | Merged. A key present in both resolves to the second call's value. |
| `severity` | Replaced, but only if the second call passes one — `TelemetryErrorHandler` passes whatever the provider's `context` carries and nothing else. |
| `handled` | **Not patchable.** It is not part of `ErrorContextPatch`, so `handled: false` survives and the record stays in the unhandled set your triage filters on. |

The last row is the one worth remembering: a boundary or a handler cannot turn an unhandled chunk
failure into a handled one by also capturing it. `withChunkCapture` passes `handled` explicitly rather
than letting it be derived, so this holds even if you override its `source` — `'chunk'` is in
`UNHANDLED_SOURCES` and would have derived `false`; `'router'` would not.

The provider is `{ provide: ErrorHandler, useFactory: () => new TelemetryErrorHandler(context) }`, and
that `useFactory` shape matters here: a `useClass` provider for a class with constructor parameters
needs Angular DI metadata, which needs `emitDecoratorMetadata` in *your* tsconfig. As it is, the handler
works with decorator metadata off, and is constructible with `new` in a plain Vitest file — see
[the Angular adapter](./01-framework-adapter.md#why-a-factory-and-not-useclass).

## `attachWorker` is inert on a non-worker

`attachWorker(worker, options)` accepts `unknown` and looks only for `addEventListener`. A value
without one is accepted silently and produces an attachment with no listeners, so it can be called
unconditionally — on an optional worker, on a `SharedWorker`, or on a value you are not sure about:

```ts
attachWorker(maybeWorker, { name: 'optional' }); // no listeners, no throw
```

The attachment is still callable and still has `detach()` and `expectResponse()`, so callers need no
null check. That tolerance is also what makes the adapter testable without a browser: anything with
`addEventListener` drives both listeners, so a Vitest run — where `Worker` does not exist, and does not
need to — exercises the real code path:

```ts
import { attachWorker } from '@codewithrajat/rm-logvault/worker';

// happy-dom provides `EventTarget` and `Event`; `Worker` is exactly the global not needed here.
const fake = new EventTarget();
const detach = attachWorker(fake, { name: 'fake' });
fake.dispatchEvent(Object.assign(new Event('error'), { message: 'worker died', lineno: 1 }));
detach(); // the same call the service makes in ngOnDestroy
```

The record that produces is real: `source: 'worker'`, `tags: { worker: 'fake', op: 'fatal' }`,
`severity: 'fatal'`, `handled: false`, and `location` from `lineno`.

## See also

- [Capturing worker failures and dynamic-import failures](../../vanilla/more-advanced/07-workers-and-dynamic-imports.md)
  — the depth: every field, the silence timeout, and the three chunk paths.
- [Duplicates, throttling and testing](./08-dedupe-throttling-and-testing.md) — what a second capture
  does to a record, and how to assert any of this in Vitest.
- [What actually arrives at your collector](../advanced/02-what-arrives-at-the-collector.md) — where
  `source`, `handled` and your tags end up in the uploaded body.
- [docs/API.md](../../../docs/API.md#codewithrajatrm-logvaultworker) — `attachWorker`,
  `AttachWorkerOptions` and `WorkerAttachment`.
