# The recipes, the adapter, and choosing between them (Angular)

**Problem it solves:** you now have four ways to get an error recorded and one provider that moves
Angular's own `ErrorHandler` into the same pipeline, and picking the wrong one produces either a hole in
your coverage or a duplicate you did not expect. This page is the decision, written out once, with the
four recipes from [basic](../basic/01-capture-recipes.md) placed in their real home — plus how to assert
any of it in a test instead of clicking buttons and squinting at a report.

**What you will learn:**

- The complete `main.ts` that makes every recipe work, in one block.
- A decision table across Angular's error paths: which one is already covered, and by what.
- The one thing `withErrorCapture` does that `captureError` does not — re-throw.
- Two places where the adapter is narrower than its name suggests.

## The complete setup, once

Every recipe on this page works with exactly this, and nothing else:

```ts
// src/main.ts
import { bootstrapApplication } from '@angular/platform-browser';
import { captureError, initTelemetry } from '@codewithrajat/rm-logvault';
import { provideTelemetryErrorHandler } from '@codewithrajat/rm-logvault/angular';
import { AppComponent } from './app/app.component';
import { environment } from './environments/environment';

initTelemetry({ appName: 'my-app', appVersion: environment.appVersion }); // BEFORE bootstrapApplication

bootstrapApplication(AppComponent, {
  providers: [provideTelemetryErrorHandler({ tags: { shell: 'checkout' } })],
}).catch((error: unknown) => {
  // A bootstrap failure happens before any ErrorHandler exists, so this one is reported by hand.
  captureError(error, { source: 'manual', tags: { phase: 'bootstrap' } });
});
```

And the component the decision table refers to:

```ts
// src/app/pay-button.component.ts
import { Component } from '@angular/core';
import { captureError, withErrorCapture } from '@codewithrajat/rm-logvault';

@Component({
  selector: 'app-pay-button',
  template: `
    <button type="button" (click)="pay()">Pay</button>
    <button type="button" (click)="payQuietly()">Pay, quietly</button>
  `,
})
export class PayButtonComponent {
  public pay(): void {
    throw new Error('[checkout] payment failed'); // -> ErrorHandler -> source: 'angular'
  }

  public payQuietly(): void {
    try {
      throw new Error('[checkout] payment failed');
    } catch (error) {
      captureError(error, { source: 'manual', tags: { flow: 'checkout' } }); // recorded, handler ends quietly
    }
  }

  public payWithContext(): void {
    withErrorCapture(() => this.pay(), { tags: { flow: 'checkout', step: 'confirm' } });
  }
}
```

Standalone is the default in Angular 19+, so no component here declares `standalone: true`.

## Which one do I use?

| Situation | Use | Why not the others |
| --- | --- | --- |
| A throw in a template handler, a lifecycle hook or a subscription | **Nothing** | Angular routes it to `ErrorHandler`, and the provider reports it as `source: 'angular'`. |
| A throw outside Angular — a raw `addEventListener`, a timer | **Nothing** | It reaches the library's chained `window.onerror` as `source: 'window'`. |
| A promise rejects | **Nothing** | It is captured as `source: 'unhandledrejection'`. |
| `bootstrapApplication` fails | `captureError` in `.catch(...)`, `source: 'manual'` | No `ErrorHandler` exists that early, so nothing else can see it. |
| You caught a failure and the user is fine | `captureError(error, { handled: true })` | Nothing was thrown to capture, and a re-throw would only add noise. |
| Something threw and the automatic record lacks context | `withErrorCapture` — keep the throw | The automatic record cannot know your order id. |
| Per-error context derived from the error, or a handler that injects a service | Your own `ErrorHandler` | The provider merges one fixed `context`; it cannot inspect the error. |

The first three rows are all "write nothing", and together they are the majority of your coverage. The
last row is the one escape hatch, and
[the Angular adapter](../more-advanced/01-framework-adapter.md#writing-your-own-errorhandler) has it in
full.

## Capture-and-keep-going versus capture-and-re-throw

This is the distinction worth getting right, because both look like the same idea:

| | `withErrorCapture(handler, ctx)` | `captureError(error, ctx)` |
| --- | --- | --- |
| Re-throws? | **Yes** — the same value, so your `catch` still runs and Angular's `ErrorHandler` still receives it | **No** |
| Default `source` | `'event-handler'` | Whatever the caller passes |
| Shape | A callback, run immediately | The value you already caught |
| Best for | Preserving existing propagation while adding context | A failure you caught, or a state that is wrong |

If you are unsure, use `captureError` for something you already caught and reserve `withErrorCapture`
for the case where the throw has to keep travelling. A re-thrown handler error surfaces as a console
error on every click, because the adapter reports first and then delegates to `console.error` — and the
record is produced either way.

## Correction 1 — `withErrorCapture` is not a decorator

The name reads like a wrapper you attach to a method. It is not. `withErrorCapture(handler, context)`
**runs `handler` immediately**, records a throw or a rejection, and re-throws. There is no decorator
form, and no way to hand it a method reference for later:

```ts
// Wrong: this calls `submit` during change detection and discards the result. It does not wrap
// the method that the (click) binding will call later.

// Right: the callback runs inside the method the template actually calls.
public submit(): void {
  withErrorCapture(() => this.reallySubmit(), { tags: { flow: 'checkout' } });
}
```

For an async handler the returned promise rejects with the **same** error value, not a wrapper, so a
`catch` you already have keeps working unchanged.

## Correction 2 — `getPreviousErrorHandler` will not chain the adapter into itself

`getPreviousErrorHandler(injector)` returns the previous `ErrorHandler`, or `undefined`. It returns
`undefined` in **two** situations, not one:

```ts
import { inject, Injector } from '@angular/core';
import { getPreviousErrorHandler } from '@codewithrajat/rm-logvault/angular';

const previous = getPreviousErrorHandler(inject(Injector));
// undefined when there is no previous handler at all,
// and undefined when the existing handler is already a TelemetryErrorHandler.
```

The second case is deliberate — it is what stops the adapter being chained into itself by accident. The
practical consequence is that `undefined` is **not** proof that Angular's default handler is in place;
if your code needs to know, decide that from the providers you registered rather than from this return
value.

## Testing it without a browser database

`createMemoryRepository()` from `@codewithrajat/rm-logvault/testing` is the documented path, and it is
what makes all of the above assertable. Angular's usual harness is `TestBed`; the test below provides
the handler and routes the component method's throw through it the same way Angular does for a
`(click)` binding:

```ts
import { ErrorHandler } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { afterEach, expect, it } from 'vitest';
import { destroyTelemetry, flushTelemetry, initTelemetry } from '@codewithrajat/rm-logvault';
import { provideTelemetryErrorHandler } from '@codewithrajat/rm-logvault/angular';
import { createMemoryRepository } from '@codewithrajat/rm-logvault/testing';
import { PayButtonComponent } from './pay-button.component';

afterEach(() => {
  destroyTelemetry();
});

it('records a handler throw as an Angular error', async () => {
  const repository = createMemoryRepository();

  // `shortcut: false` stops the test installing a keydown listener on `document`.
  initTelemetry({ appName: 'test-app', repository, shortcut: false });

  TestBed.configureTestingModule({
    providers: [provideTelemetryErrorHandler({ tags: { shell: 'checkout' } })],
  });

  const component = TestBed.createComponent(PayButtonComponent).componentInstance;
  const handler = TestBed.inject(ErrorHandler);

  try {
    component.pay();
  } catch (error) {
    handler.handleError(error); // exactly what Angular does with a handler throw
  }

  await flushTelemetry(); // writes are batched; without this the assertion races

  const [record] = repository.errors.all();
  expect(record?.message).toBe('[checkout] payment failed');
  expect(record?.tags).toEqual({ shell: 'checkout' });
  expect(record?.source).toBe('angular');
});
```

**What this test exercises, and what it does not.** It exercises the provider, `TelemetryErrorHandler`,
`captureError` and the store — the whole path from "Angular has an error in hand" to "a row exists". It
does **not** render the template or dispatch a DOM click: without a real `TestBed` fixture and a click
on the rendered button, a `(click)` binding is not exercised, and this page will not pretend otherwise.
The template is checked by `ng build` (AOT), which is the only thing that validates template
expressions.

The bootstrap-shaped path is worth its own test, because the label is the whole point:

```ts
it('files a hand-reported bootstrap failure as manual', async () => {
  const repository = createMemoryRepository();
  initTelemetry({ appName: 'test-app', repository, shortcut: false });

  captureError(new Error('[checkout] bootstrap failed'), {
    source: 'manual',
    tags: { phase: 'bootstrap' },
  });

  await flushTelemetry();

  expect(repository.errors.all()[0]?.source).toBe('manual');
});
```

Why each line is there:

| Line | Reason |
| --- | --- |
| `createMemoryRepository()` | No IndexedDB, no `fake-indexeddb` dependency, no partial browser implementation. |
| `shortcut: false` | Otherwise every test installs a `keydown` listener on `document`. |
| `destroyTelemetry()` in `afterEach` | Initialisation is idempotent, so a second test would otherwise reuse the first one's setup and fail confusingly. |
| `await flushTelemetry()` | Writes are batched; the flush is what makes the assertion deterministic. |
| `repository.errors.all()` (not `logs`) | A throw is an error record; a `logger.warn` would land in `repository.logs.all()`. |

## A checklist for a new capture site

1. Would the automatic path already catch it? If yes, write nothing — and give it identity through the
   provider's `tags` rather than a call.
2. Is it a bootstrap failure? It needs the `.catch(...)` with `source: 'manual'`, because nothing else
   exists that early.
3. Do you need context the library cannot discover? Add it at the capture site, with `tags` for grouping
   and `extra` for values.
4. Does the error need to keep propagating? `withErrorCapture` re-throws; `captureError` does not.
5. Can you assert it? A memory repository turns "I clicked the button and it looked right" into a test
   that fails when the integration regresses.

## Related

- [the Angular adapter](./01-framework-adapter.md) — the factory provider, the handler contract, and
  writing your own `ErrorHandler`.
- [the capture recipes](../basic/01-capture-recipes.md) — the four recipes these decisions are about.
- [what arrives at your collector](../advanced/02-what-arrives-at-the-collector.md) — where a `source`
  value actually ends up.
