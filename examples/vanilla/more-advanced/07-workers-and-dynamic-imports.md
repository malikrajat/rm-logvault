# Capturing worker failures and dynamic-import failures

**Problem it solves:** two failure paths produce **nothing at all**, and both are invisible for a
structural reason rather than a configuration one.

A `Worker`'s `error` and `messageerror` events fire on the **`Worker` object**, not on `window`. Nothing
`initTelemetry` installs can see them — not `onerror`, not `unhandledrejection`, not the resource or CSP
listeners — so a worker that died on its first message becomes a feature that "sometimes does nothing",
with an empty report to explain it.

A failed `import()` is the other one. It throws from inside the bundler's runtime, it arrives at whichever
boundary happens to be mounted, it is reported twice more often than once, and its message names a hashed
filename that means nothing to the person reading the report.

**What you will learn:**

- Why a worker is never instrumented automatically, and what that costs you.
- `attachWorker`: the two events it listens for, the three `op` values, and what each record carries.
- Reporting a worker that is alive but **wedged** — the one case that produces no event at all.
- Exactly which fields are read from a worker event, and which are not.
- `withChunkCapture`: naming the screen, capturing once, and re-throwing unchanged.
- Why `handled: false` is what stops an error boundary writing a second row.
- The three chunk paths, and which one is yours.

## Why a worker is invisible, and stays that way

```ts
// The worker throws. This listener never runs.
window.addEventListener('error', (event) => console.log(event.message)); // never fires
```

The event is dispatched on the `Worker` instance:

```ts
const worker = new Worker('/health.worker.js');
worker.addEventListener('error', (event) => {
  // This is where it goes. `event` is an ErrorEvent.
});
```

There is no way for a library to find that `worker` variable. There is no registry of live `Worker`
instances to scan, and keeping one would mean monkey-patching the `Worker` constructor — which would change
what **your own** `instanceof Worker` checks return, on every page of every application, whether or not it
has a worker. Wrapping `fetch` is defensible because `fetch` is a global function; wrapping `Worker` is a
different kind of change.

So this is explicit, like every adapter in this package:

```ts
import { attachWorker } from '@codewithrajat/rm-logvault/worker';

const worker = new Worker('/health.worker.js', { type: 'module' });
const detach = attachWorker(worker, { name: 'healthStatus' });

// …on teardown. Safe to call twice.
detach();
```

## `attachWorker`

```ts
function attachWorker(worker: unknown, options?: AttachWorkerOptions): WorkerAttachment;
```

| Option | Type | Default | Meaning |
| --- | --- | --- | --- |
| `name` | `string \| undefined` | `'worker'` | Stamped onto every record as the `worker` tag. |
| `responseTimeoutMs` | `number \| undefined` | unset | How long `expectResponse()` waits before reporting the worker as silent. Unset disables it. |
| `context` | `ErrorContext \| undefined` | unset | Merged into every record this attachment produces. |

**Set `name`.** A page with three workers and a report full of `worker: 'worker'` is a page whose report
cannot say which one died. That is the whole value of the tag.

The returned `WorkerAttachment` is **callable**, so the documented one-liner reads as a detach function:

```ts
const detach = attachWorker(worker, { name: 'search' });
detach();                    // the same function as…
detach.detach();             // …this member, if you prefer a named call
detach.expectResponse('x');  // the silence timeout, below
```

`attachWorker` **never throws**, and it is inert on a value with no `addEventListener` — so it is safe to
call unconditionally on something that may not be a worker:

```ts
attachWorker(maybeWorker, { name: 'optional' }); // no throw, no listeners
```

## What each record carries

Every record from this adapter has `source: 'worker'`, `tags.worker: <name>`, and a `tags.op` that says
which of the three failures it was:

| Trigger | `tags.op` | `category` | `severity` | `handled` | What it means |
| --- | --- | --- | --- | --- | --- |
| `error` event | `'fatal'` | `'runtime'` | `'fatal'` | `false` | The worker threw. The feature that owns it is gone, not merely one call failed. |
| `messageerror` event | `'messageerror'` | `'runtime'` | `'error'` | `false` | The worker sent something that could not be structured-cloned. |
| `expectResponse()` timeout | `'timeout'` | `'timeout'` | `'error'` | `false` | The worker never answered. |

`handled: false` is derived, not hard-coded: `'worker'` and `'timeout'` are both members of
`UNHANDLED_SOURCES`, so `buildRecord` sets it for you.

> **Source note.** `messageerror` has **no stack and no error object** — that is the nature of the
> failure. The worker produced a value that could not be deserialised on the receiving side, so there is
> nothing to point at. The library synthesises the message
> `Worker message error: could not be deserialized` and files it under `tags.op: 'messageerror'`, because
> an empty record would be worse. The `error` event never fires for this case, so if you only ever
> listened for `error`, this is the failure you have been missing.

For an `error` event, the worker's own error object is preferred when the engine supplies one. Otherwise
the `ErrorEvent`'s `message` is used, and `filename`, `lineno` and `colno` become the record's `location`
— the same three fields the window handler records.

## A worker that never answers

A worker that is alive but **wedged** produces no event at all. Nothing throws, nothing rejects, no
message arrives. There is no signal — which is exactly why the timeout is opt-in rather than a default:
it is a guess about how long your work should take, and a wrong guess manufactures failures that never
happened.

```ts
const worker = new Worker('/search.worker.js');
const attachment = attachWorker(worker, { name: 'search', responseTimeoutMs: 10_000 });

worker.postMessage({ type: 'query', term });

// Start the clock. The returned function cancels it.
const settle = attachment.expectResponse('query');

worker.addEventListener('message', () => settle());
```

If no reply arrives within `responseTimeoutMs`, one record is captured:

```
source:    'worker'
category:  'timeout'
severity:  'error'
tags:      { worker: 'search', op: 'timeout', workerTimeoutMs: '10000' }
message:   Worker "search" did not respond to query within 10000 ms
```

Three details that matter:

- The **label** (`'query'` above) is what makes the record answerable. Without it the message reads
  "did not respond to response", which is a sentence nobody can act on.
- `expectResponse()` with no `responseTimeoutMs` returns a no-op and starts no timer, so you can call it
  unconditionally and turn the timeout on per environment.
- The cancel function is safe to call more than once, and `detach()` clears every pending timer.

## What is read, and what is not

Worth stating plainly, because a worker is where application payloads live:

| Read | Not read |
| --- | --- |
| `ErrorEvent.message`, `.filename`, `.lineno`, `.colno`, `.error` | Anything you sent with `postMessage` |
| `MessageEvent`'s presence on `messageerror`, and its `.message` when present | The failed value itself — it could not be deserialised, which is the point |
| `worker.addEventListener` / `removeEventListener` | Any other property of the worker |

Nothing in this adapter reads a message payload, a body, a header or storage. It attaches two listeners and
reads a fixed list of fields off the events they receive, which is the same allow-list the window handler
uses.

Neither listener calls `preventDefault()`. A worker error is not something a library may decide to swallow,
and the worker's own default handling is what surfaces the failure in your console during development.
There is deliberately no option to change that — unlike `errors.preventDefaultUnhandledRejection`, which
exists for a real use case (a framework's own rejection tracking), a worker error has none.

## Dynamic imports: `withChunkCapture`

The core already recognises an **uncaught** dynamic-import failure through
`errors.captureChunkErrors` (default `true`) and the Vite `vite:preloadError` listener. What it cannot do is
know *which screen* the user was trying to reach, because that fact exists only at your call site:

```ts
const load = withChunkCapture('Overview', () => import('./pages/Overview'));
```

```ts
function withChunkCapture<T>(
  route: string,
  loader: () => Promise<T>,
  ctx?: ErrorContext,
): () => Promise<T>;
```

The returned loader is an `async` function, so it **never throws synchronously** — even a loader that
throws produces a rejected promise, exactly as `import()` does. A failure is captured once with:

```ts
{
  source: 'chunk',
  category: 'chunk',
  severity: 'fatal',
  handled: false,
  tags: { route: 'Overview' },   // your first argument
}
```

…and then the **original rejection value is re-thrown unchanged**, so your own retry or reload logic sees
exactly what `import()` rejected with:

```ts
try {
  await load();
} catch {
  // Whatever import() rejected with, untouched.
  showReloadPrompt();
}
```

## Why `handled: false` matters more than it looks

A failed chunk load is normally reported **twice**: once by the boundary that received the rejection, and
once by whatever global listener noticed. Both calls pass the same `Error` object, so identity
deduplication makes them one record — and the second call now *enriches* that record rather than being
discarded ([duplicates and floods](./08-dedupe-throttling-and-testing.md)).

Because `withChunkCapture` marks the record `handled: false`, a boundary that also captures it does not
change the verdict to "handled", and the record stays in the unhandled set your triage filters on.

```tsx
// React: the helper goes inside the lazy call, so the route name is part of the record.
const Overview = lazy(withChunkCapture('Overview', () => import('./Overview')));
```

## The three chunk paths, and which is yours

| Your situation | Use | Why |
| --- | --- | --- |
| You do not catch it — it reaches `window` | **Nothing.** `errors.captureChunkErrors` is already `true`. | The global handler recognises the message pattern and files it as `source: 'chunk'`. |
| Vite's preload helper rejects | **Nothing.** The `vite:preloadError` listener is already installed. | Vite dispatches an event the library listens for. |
| **You** catch the rejection — a router loader, `React.lazy`, `defineAsyncComponent`, `next/dynamic` | **`withChunkCapture`** | Only your call site knows the route name, and only here can you attach it before the record is built. |

`withChunkCapture` is deliberately **not** gated on `errors.captureChunkErrors`. That option decides
whether the library's *own* global handlers treat an uncaught dynamic-import failure as a chunk error;
calling this function is an explicit request, and honouring a setting that already defaults to `true` would
only add a way for the call to silently do nothing.

## Every derived field is overridable

`ctx` merges over the defaults, and `ctx.tags` merges with the `route` tag (which wins):

```ts
const load = withChunkCapture(
  '/orders/:id',
  () => import('./pages/OrderDetail'),
  {
    tags: { flow: 'checkout' },   // merged with { route: '/orders/:id' }
    severity: 'error',            // override the default 'fatal'
    handled: true,                // you are handling it here
  },
);
```

An empty `route` becomes `'unknown'` rather than an empty tag.

## See also

- [duplicates and floods](./08-dedupe-throttling-and-testing.md) — what happens when two paths capture the
  same error, and how to test any of this.
- [capture recipes](../basic/01-capture-recipes.md) — the four ways an error gets recorded in the first
  place.
- [the recipes and choosing between them](./03-recipes-and-deciding.md) — every browser error path side by
  side, including the ones a global handler does cover.
- [docs/API.md](../../../docs/API.md#codewithrajatrm-logvaultworker) — the full signature reference for
  `attachWorker`.
- [docs/DECISIONS.md](../../../docs/DECISIONS.md#d-035--the-worker-subpath-and-why-a-worker-is-never-attached-automatically)
  — why this is a subpath, and why nothing is attached for you.
