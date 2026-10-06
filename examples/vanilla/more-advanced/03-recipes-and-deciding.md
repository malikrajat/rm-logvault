# The recipes, the browser's error paths, and choosing between them

**Problem it solves:** you now have four ways to get an error recorded and seven or eight ways the
browser can hand you one, and picking the wrong path produces either a hole in your coverage or a
duplicate you did not expect. This page is the decision, written out once, with the four recipes from
[basic](../basic/01-capture-recipes.md) finally placed in their real home — plus how to assert any of it
in a test instead of clicking buttons and squinting at a report.

**What you will learn:**

- The complete `main.ts` that makes every recipe work, in one block.
- A decision table: which browser error path is caught automatically, which one needs an option, and
  which one needs you.
- The plain-DOM equivalent of every piece of framework machinery you may have read about.
- Two corrections to what the other pages imply, both of which change what you should write.
- How to assert all of it without a browser database.

## The complete setup, once

Every recipe on this page works with exactly this, and nothing else. It is one module, and the
`initTelemetry` call is its first statement:

```ts
// src/main.ts — the whole integration, in one block
import {
  captureError,
  exportDiagnosticsReport,
  initTelemetry,
  logger,
  withErrorCapture,
} from '@codewithrajat/rm-logvault';

initTelemetry({ appName: 'my-app' }); // top level, before anything else can throw

// Recipe 1 — nothing to do. The global handler is already installed.
document.querySelector('#recipe-1')?.addEventListener('click', () => {
  throw new Error('[checkout] the cart total was missing');
});

// Recipe 2 — a throw you want tagged. The call goes INSIDE the listener.
document.querySelector('#recipe-2')?.addEventListener('click', () => {
  withErrorCapture(
    () => {
      throw new Error('[checkout] order 8123 could not be submitted');
    },
    { tags: { flow: 'checkout', step: 'submit' } },
  );
});

// Recipe 3 — an explicit report for something that was never thrown.
document.querySelector('#recipe-3')?.addEventListener('click', () => {
  logger.info('[checkout] running the explicit-report probe');
  captureError(new Error('[checkout] the totals panel and the cart disagree'), {
    tags: { flow: 'checkout', probe: 'explicit' },
    extra: { cartId: 'c_8123', expected: 42, actual: 41 },
    handled: true,
  });
});

// Recipe 4 — a real TypeError, with no library call in it at all.
document.querySelector('#recipe-4')?.addEventListener('click', () => {
  const totals: { readonly length: number } | undefined = undefined;
  console.log(totals.length); // `totals?.length` would NOT throw
});

// The export button, for phones where the keyboard shortcut does not exist.
document.querySelector('#export')?.addEventListener('click', () => {
  void exportDiagnosticsReport();
});
```

## Which browser path catches what?

This is the table to read before writing a capture site, because four of these eight rows never reach
the library unless you said so:

| Failure | Who notices | What you write | `source` |
| --- | --- | --- | --- |
| A synchronous throw, in a listener or at module top level | `window.onerror` / `ErrorEvent` | **Nothing** — the handler is installed for you | `'window'` |
| The same throw, but you want it tagged | `withErrorCapture`, and then the global path again | `withErrorCapture(handler, ctx)` **inside** the listener | `'event-handler'` |
| A rejected promise with no `.catch` | `unhandledrejection` | **Nothing** | `'unhandledrejection'` |
| A failed `<script>`, `<img>` or `<link>` | resource error handling | `errors.captureResources: true` — **off by default** | `'resource'` |
| A CSP violation | CSP handling | `errors.captureCsp: true` — **off by default** | `'csp'` |
| A dynamic `import()` that fails | chunk error handling | **Nothing** — `errors.captureChunkErrors` defaults to `true` | `'chunk'` |
| Something you already caught, or a wrong-but-not-fatal state | you | `captureError(error, ctx)` | whatever you pass in `ctx.source` |
| A `console.warn` / `console.error` you did not make | console capture | `logs.captureConsole: true`, which also needs `logs.enabled: true` | filed as a **log**, not an error |

The row that surprises people is the first one, in the good way: the two most common failures in a
browser need no code from you at all. The rows that surprise people in the other direction are the
resource and CSP rows — they are the two opt-ins, and nothing appears in the report for them until you
turn them on.

## The plain-DOM equivalent of the framework machinery

If you arrived here from a framework tier, this is the translation table. There is no adapter subpath
for vanilla: nothing to install beyond the one call, and nothing that wraps the DOM for you.

| Framework machinery | Plain-DOM equivalent |
| --- | --- |
| `initTelemetry()` before the root render | The same call, as the first statement of your entry module. |
| Root error handlers handed to the renderer | Nothing to hand over. `window.onerror` and `unhandledrejection` are installed by that one call. |
| An error boundary around the tree | There is no boundary in plain DOM. Catch what you can locally with `captureError`; anything that escapes still reaches `window.onerror`. |
| A hook that returns `capture(error, extra?)` | `try { … } catch (error) { captureError(error, { tags: … }); }` |
| `withErrorCapture` used as an event handler | The same function from the core package — but call it *inside* the listener, never as the listener. |
| A framework adapter subpath | There is none for vanilla. |

The boundary row is the one worth sitting with. A boundary exists because a framework can stop a
failure from taking down the render; plain DOM has no render to save, so the honest equivalent is
"catch it where you can, and let the global handler have the rest".

## The two "capture and throw" options

This is the distinction worth getting right, because both look like the same idea:

| | `withErrorCapture(handler, ctx)` | `try { … } catch { captureError(…) }` |
| --- | --- | --- |
| Lives in | The core package | The core package |
| Re-throws? | **Yes** — the same value, so your outer `catch` still runs | **No** — it swallows |
| Default `source` | `'event-handler'` | None; you pass it in `ctx` |
| Shape | A function you call with a callback | An inline block at the capture site |
| Best for | Preserving existing error behaviour while adding context | A handler where a re-throw would only add noise |

If you are unsure, prefer the `try`/`catch`. A re-thrown listener error surfaces as a console error on
every click, and the record is produced either way. The snippet is in
[the capture recipes](../basic/01-capture-recipes.md#why-two-captures-are-one-record).

## Correction 1 — `addEventListener('click', withErrorCapture(fn))` is not a wrapper

`withErrorCapture(handler, ctx)` runs `handler` **immediately**, records anything it throws, and then
re-throws it. It does not return a function for someone else to call later. So this is wrong:

```ts
// WRONG: `submit` runs at wiring time — before anyone has clicked the button.
document.querySelector('#submit')?.addEventListener('click', withErrorCapture(submit));
```

What you get is a record produced during start-up, an exception thrown out of the `addEventListener`
call itself, and a listener that was never registered. Write the wrapper inside the handler instead:

```ts
document.querySelector('#submit')?.addEventListener('click', () => {
  withErrorCapture(submit, { tags: { flow: 'checkout' } });
});
```

This is not a quirk of the vanilla tier — it is what "runs the handler immediately" means. It is just
much easier to hit here, because `addEventListener` and `withErrorCapture` are both plain functions,
and nothing in the type system complains about passing one to the other.

> **Source note.** For an `async` handler the returned promise rejects with the **same** error value,
> not a wrapper. That is why recipe 2's async shape is a `void … .catch(…)` and not a `try`/`catch`
> around an `await`: the original error is what arrives.

## Correction 2 — a resource error is off by default, and its record is thin

`errors.captureResources` and `errors.captureCsp` both default to `false`, so a broken image, a blocked
script or a policy violation is invisible until you opt in:

```ts
initTelemetry({
  appName: 'my-app',
  errors: {
    captureResources: true, // a failed <script>, <img> or <link>
    captureCsp: true, // a Content-Security-Policy violation
    // captureChunkErrors stays at its default of `true`
  },
});
```

Turning it on does not buy you a stack, and it is not a substitute for a boundary-equivalent catch:

> **Source note.** For a cross-origin script without CORS the browser exposes only `"Script error."`
> and a null error. The library reports the location and tags it `crossOrigin: 'true'` rather than
> inventing a stack. So a resource record can be honest and still nearly empty — the browser withheld
> the detail, and no amount of configuration gets it back.

## Testing it without a browser database

`createMemoryRepository()` from `@codewithrajat/rm-logvault/testing` is the documented path, and it is
what makes all of the above assertable. `happy-dom` or `jsdom` is the usual environment for a vanilla
test. Four details make the difference between a deterministic test and a flaky one:

```ts
import { afterEach, expect, it } from 'vitest';
import {
  captureError,
  destroyTelemetry,
  flushTelemetry,
  initTelemetry,
  withErrorCapture,
} from '@codewithrajat/rm-logvault';
import { createMemoryRepository } from '@codewithrajat/rm-logvault/testing';

afterEach(() => {
  destroyTelemetry();
});

it('runs a wired listener and records what it captures', async () => {
  const repository = createMemoryRepository();

  // `shortcut: false` stops the test installing a keydown listener on `document`.
  initTelemetry({ appName: 'test-app', repository, shortcut: false });

  document.body.innerHTML = '<button type="button" id="pay">Pay</button>';

  document.querySelector('#pay')?.addEventListener('click', () => {
    captureError(new Error('[checkout] payment failed'), { tags: { flow: 'checkout' } });
  });

  document.querySelector('#pay')?.dispatchEvent(new Event('click'));

  await flushTelemetry(); // writes are batched; without this the assertion races

  const [record] = repository.errors.all();
  expect(record?.message).toBe('[checkout] payment failed');
  expect(record?.tags).toEqual({ flow: 'checkout' });
});
```

A plain `dispatchEvent(new Event('click'))` on a wired button is enough to exercise an
`addEventListener` handler, unlike a framework template binding — the handler runs synchronously, and
there is no rendering step in between. That is also what makes the second test work, which asserts the
one label the core sets for you:

```ts
it('records a tagged handler throw and still re-throws it', async () => {
  const repository = createMemoryRepository();
  initTelemetry({ appName: 'test-app', repository, shortcut: false });

  document.body.innerHTML = '<button type="button" id="submit">Submit</button>';

  document.querySelector('#submit')?.addEventListener('click', () => {
    try {
      withErrorCapture(
        () => {
          throw new Error('[checkout] order 8123 could not be submitted');
        },
        { tags: { flow: 'checkout' } },
      );
    } catch {
      // The same error value comes back; containing it keeps the dispatcher quiet.
    }
  });

  document.querySelector('#submit')?.dispatchEvent(new Event('click'));
  await flushTelemetry();

  const [record] = repository.errors.all();
  expect(record?.source).toBe('event-handler');
  expect(record?.tags).toEqual({ flow: 'checkout' });
});
```

Why each piece is there:

| Piece | Reason |
| --- | --- |
| `createMemoryRepository()` | No IndexedDB, no `fake-indexeddb` dependency, no partial browser implementation. |
| `shortcut: false` | Otherwise every test installs a `keydown` listener on `document`. |
| `destroyTelemetry()` in `afterEach` | Initialisation is idempotent, so a second test would reuse the first one's setup. A second `initTelemetry()` returns the existing handle and **ignores its options**. |
| `await flushTelemetry()` | Writes are batched; the flush is what makes the assertion deterministic. It never rejects and touches no network. |

**What `dispatchEvent` proves, and what it does not.** It proves that your listener and the library
agree: the handler ran, the record was created with the fields you expect, and the flush delivered it
to the repository. It proves nothing about a bundler. It never loads your `index.html`, never resolves
an import, and never runs a build — so a passing test is not evidence that the entry module your users
download actually calls `initTelemetry`. That signature is a visual check, or an end-to-end test.

## A checklist for a new capture site

1. Would the automatic path already catch it? If yes, write nothing — see the first three rows of the
   decision table.
2. Is it a promise nobody caught? It is on `unhandledrejection` already. Do not add a `.catch` that
   swallows it silently.
3. Is it platform code printing with `console.warn` or `console.error`? It needs
   `logs.captureConsole: true` **and** `logs.enabled: true`, and it will arrive as a log with no stack.
4. Do you need context the library cannot discover? Add it at the capture site, with `tags` for
   grouping and `extra` for values.
5. Does the error need to keep propagating? `withErrorCapture` re-throws; a manual `try`/`catch` with
   `captureError` does not.
6. Can you assert it? A memory repository turns "I clicked the button and it looked right" into a test
   that fails when the integration regresses.

## Try it yourself

1. Copy the complete setup into `src/main.ts` and trigger each button.
2. Press <kbd>Ctrl</kbd>+<kbd>Shift</kbd>+<kbd>Alt</kbd>+<kbd>D</kbd>. Recipes 1, 2 and 4 are there;
   recipe 3 is there too, because `captureError` is explicit about it.
3. Add a broken `<img src="/does-not-exist.png">` and confirm nothing is recorded. Add
   `errors: { captureResources: true }` and repeat: now there is a `'resource'` record with a location
   and no stack.
4. Replicate the first test above and watch it fail when you rename `#pay` — which is the whole point
   of asserting the wiring rather than clicking it.

## Related

- [more-advanced](./README.md) — the seams this tier is about.
- [custom repository](./01-custom-repository.md) — where the records go when IndexedDB is not the answer.
- [custom transport and log source](./02-custom-transport-and-log-source.md) — replacing the upload
  without losing the retry policy.
- [lifecycle hooks and automation](./03-lifecycle-hooks-and-automation.md) — application policy at the
  last moment before storage.
- [the capture recipes](../basic/01-capture-recipes.md) — the four recipes these decisions are about.
- [the levels page](../config/03-levels-and-thresholds.md) — the two thresholds behind the console row.
- [docs/API.md](../../../docs/API.md) — exact signatures for everything named above.
