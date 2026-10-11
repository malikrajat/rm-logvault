# Worker failures and dynamic imports in a Next.js app

**Problem it solves:** two client failures produce nothing at all, and in the App Router both of them also
have a server-side trap. A `Worker`'s `error` and `messageerror` events fire on the worker object rather
than on `window`, so nothing `initTelemetry` installs can see them — and `Worker` does not exist in the
server process that renders your client components, so the worker cannot be created where it looks
natural. A rejected `next/dynamic` loader has the same shape of problem: React catches the rejection before
any global handler does, and the module that could have named the screen is evaluated on both sides of the
boundary.

**What you will learn:**

- Why `'use client'` does not make a module body browser-only, and what that means for `new Worker(...)`.
- The two worker forms the bundler understands, the one it does not, and what each costs.
- Where `attachWorker` belongs, and why the detach is not optional under StrictMode.
- `withChunkCapture` inside a `next/dynamic` loader, and the framework rule that decides which file holds it.
- What `handled: false` survives when `app/error.tsx` captures the same error.
- What is inert here (`attachWorker` on a non-worker) and what is not (`new Worker`).

## A `Worker` exists only in the browser

`'use client'` marks a module as belonging to the client bundle. It does **not** stop the server from
evaluating it: the App Router renders client components to produce the first HTML, so their module bodies
run in the server process during that render. The server runtimes Next.js renders in have no `Worker`
global — Node's own worker class lives in `node:worker_threads` and is not the same thing — so this module
body throws `ReferenceError: Worker is not defined` before anything renders.

```ts
// app/health/health-worker.ts — WRONG
'use client';

// Module scope: also evaluated during the server render, where this global does not exist.
const worker = new Worker(new URL('./health.worker.ts', import.meta.url), { type: 'module' });

export function checkHealth(): void {
  worker.postMessage({ type: 'check' });
}
```

The failure shows up at `next build` for a prerendered route, or at request time for a dynamic one, and it
looks like a build or server bug until you recognise the line. The same expression in a module with no
`'use client'` anywhere in its chain has the same problem for a different reason: it is simply server code
then — see [01-framework-adapter.md](./01-framework-adapter.md) for what a server import of this library
does and does not do.

> **Source note.** It is the **argument** that cannot exist on the server; the adapter itself is safe
> everywhere. Importing `@codewithrajat/rm-logvault/worker` does no work at import time, and `attachWorker`
> never throws. Do not read "the adapter is safe on the server" as "the call belongs there" — a record it
> produced in the server process would be buffered there and discarded with it, never reaching the
> browser's store.

## Where the worker file comes from: two forms, one trap

| Form | What the bundler does | What it costs you |
| --- | --- | --- |
| `new Worker(new URL('./health.worker.ts', import.meta.url), { type: 'module' })` | Recognises the literal pattern, compiles the worker as its own entry point and rewrites the URL to the emitted file | A **module** worker: the emitted file is an ES module, so `importScripts` is not available inside it. |
| `new Worker(new URL('./health.worker.ts', import.meta.url))` | The same, as a classic worker | A **classic** worker: `importScripts` is available. The worker's own static imports are bundled either way. |
| `new Worker('/health.worker.js')` | **Nothing.** A string is a URL, not a module specifier, so no chunk is emitted and no transform is applied | You own the file: it lives in `public/`, is never type-checked, and its own imports are resolved by the browser at runtime, so a bare specifier breaks there. |

Two rules follow from the table:

- **The specifier must be a literal.** ``new URL(`./${name}.worker.ts`, import.meta.url)`` and
  `new URL(workerPath, import.meta.url)` are not statically analysable, so no worker chunk is emitted. The
  call itself still runs and still resolves the path against `import.meta.url` — but no file was written
  there, so the worker 404s at runtime with nothing in the build output to explain it.
- **`{ type: 'module' }` is the browser's decision, not the bundler's.** Module workers are not available
  in every runtime a Next.js app still serves, and no build will tell you. If reach matters more than
  ESM inside the worker, use the classic form.

> **Source note.** Next.js's own App Router e2e suite exercises both bundled forms — classic and
> `{ type: 'module' }` — from a `'use client'` page, so neither is a workaround. The `public/` form is the
> one no bundler is involved in at all, which is why it is also the one with no `tsc` coverage.

## Where the attach goes

The worker and its attachment belong in the **same effect**, and that effect is the only place either can
be created. An effect runs in the browser, which is the condition `new Worker` needs, and it runs after
mount, which is when there is a component to report against.

```tsx
// app/health/health-badge.tsx
'use client';

import { useEffect, useState, type ReactElement } from 'react';
import { attachWorker } from '@codewithrajat/rm-logvault/worker';

export function HealthBadge(): ReactElement {
  const [status, setStatus] = useState('starting');

  useEffect(() => {
    // Created here, never at module scope. `app/health/health.worker.ts` is the file
    // the bundler compiles and the URL below is rewritten to point at it.
    const worker = new Worker(new URL('./health.worker.ts', import.meta.url), { type: 'module' });

    const attachment = attachWorker(worker, {
      name: 'healthStatus', // the `worker` tag — without it every worker is 'worker'
      responseTimeoutMs: 10_000,
      context: { tags: { feature: 'health' } },
    });

    // Ask, then start the silence timer. A worker that is alive but wedged produces no
    // event at all, so the timeout is the only signal available for that failure.
    worker.postMessage({ type: 'check' });
    const settle = attachment.expectResponse('health-check');

    const onMessage = (event: MessageEvent<string>): void => {
      settle();
      setStatus(event.data);
    };
    worker.addEventListener('message', onMessage);

    return (): void => {
      worker.removeEventListener('message', onMessage);
      attachment.detach(); // also cancels every pending silence timer
      worker.terminate();
    };
  }, []);

  return <span data-status={status}>{status}</span>;
}
```

**Return the detach.** React StrictMode mounts the effect twice in development, and Fast Refresh re-runs it
after every edit. `attachWorker` is **not** idempotent: each call registers its own pair of listeners, so
without the cleanup one worker's failure is captured twice.

> **Source note.** What the two captures do next depends on the event, and the difference is worth knowing
> before you debug it. For an `error` event the engine supplies the same error object to both listeners,
> and deduplication is by object identity — so the second call **enriches** the record the first one wrote
> rather than adding a row. The synthesised `messageerror` record and the timeout record have no shared
> object to key on, so those two are genuinely reported twice. The detach is what makes it not happen.

Keep the worker handle in a ref, not in state: a `useState` initialiser runs during render, and the first
render happens on the server.

## What is inert, and what is not

| Value passed to `attachWorker` | Result |
| --- | --- |
| A live `Worker`, `SharedWorker`, or any `EventTarget` with `addEventListener` | Two listeners, `error` and `messageerror`. Whichever of the two the target never dispatches simply produces nothing. |
| `null`, `undefined`, a plain object, a value you got from configuration | An inert attachment: no listeners, **no throw**, and a detach that is still safe to call. |
| The same worker, attached twice | Two attachments. This is the StrictMode case the cleanup exists for. |

That inertness is deliberate, so a call can be written unconditionally:

```ts
import { attachWorker } from '@codewithrajat/rm-logvault/worker';

// A ref that is not populated yet, an optional worker: nothing attached, nothing thrown.
const detach = attachWorker(maybeWorker, { name: 'search' });
detach();
```

`expectResponse()` follows the same rule: with no `responseTimeoutMs` on the attachment it returns a no-op
that starts no timer, so it is safe to call on a worker whose timeout is configured per environment.

| Context | A web `Worker` there? |
| --- | --- |
| A client component's effect or event handler | **Yes** — the only place `Worker` exists. |
| A client component's module body | No. The module body is evaluated during the server render too. |
| A Server Component or a Route Handler | No. A different runtime, and nothing captured there is stored. Server-side work is `node:worker_threads`, and its failures belong in your server's observability stack. |

## Dynamic imports: `withChunkCapture` inside the loader

An uncaught dynamic-import failure is already recognised by the global handlers. A failure inside a
`next/dynamic` loader is not, because React catches it at the nearest error boundary first — so the global
handler never sees it, and your call site is the only place that knows which screen the user was trying to
reach. That is the case `withChunkCapture` exists for:

```tsx
// app/orders/orders-panel.tsx
'use client';

import dynamic from 'next/dynamic';
import type { ReactElement } from 'react';
import { withChunkCapture } from '@codewithrajat/rm-logvault';

// `ssr: false` keeps the loader on the client. Without it the loader also runs during the
// server render, where the capture is buffered per runtime and discarded with the process.
const OrdersPanel = dynamic(
  withChunkCapture('OrdersPanel', () => import('./orders-panel-inner')),
  {
    ssr: false,
    loading: (): ReactElement => <p>Loading orders…</p>,
  },
);

export function OrdersRoute(): ReactElement {
  return <OrdersPanel />;
}
```

`withChunkCapture` returns a loader with the same signature — `() => Promise<T>` — so it drops straight
into `dynamic`'s first argument, and the inner module keeps the `default` export `next/dynamic` requires.
A failure is captured once as `source: 'chunk'`, `category: 'chunk'`, `severity: 'fatal'`,
`handled: false`, with `tags.route` set to your first argument, and then **the original rejection is
re-thrown unchanged**, so `next/dynamic` sees exactly what `import()` rejected with.

| Loader | Where the loader is evaluated | What `withChunkCapture` does there |
| --- | --- | --- |
| `{ ssr: false }` | The client only | One call to `captureError`, in the browser, which is the record you will read. |
| `{ ssr: true }` (the default) | The server render **and** the client | Two calls: the server one is buffered per runtime and never reaches the browser's store; the client one is the record. Neither capture throws. |

**`ssr: false` is valid only in a client component.** Passing it from a Server Component fails with
`` `ssr: false` is not allowed with `next/dynamic` in Server Components `` — so the file that holds the
dynamic import needs `'use client'`, which is also the file whose module body must not construct a worker.

### `handled: false`, and what `app/error.tsx` can change

When the boundary that catches a chunk failure also calls `captureError`, the second call is not a second
row. Deduplication is by object identity, and the repeat call **enriches** the record the first one wrote:

| Field on the record | What a capture from `app/error.tsx` does |
| --- | --- |
| `tags`, `extra` | Merged. A tag key present in both resolves to the second call's value. |
| `severity` | Replaced. |
| `source` | Replaced **only if the first capture passed no explicit source**. `withChunkCapture` always passes one, so `'chunk'` stays. |
| `handled` | **Not patchable.** `ErrorContextPatch` carries `source`, `severity`, `tags` and `extra` only, so the record keeps `handled: false`. |
| `message`, `stack`, `category`, `page`, `environment` | Not patchable. They describe the occurrence, and the first capture recorded it. |

So the boundary can add what only the boundary knows — Next's `digest`, which is the hash that ties a
client error to the matching server log line — without flipping the verdict:

```tsx
// app/error.tsx — a client boundary, and it has to capture for itself
'use client';

import { useEffect, type ReactElement } from 'react';
import { captureError } from '@codewithrajat/rm-logvault';

export default function RouteError({
  error,
  reset,
}: {
  readonly error: Error & { readonly digest?: string };
  readonly reset: () => void;
}): ReactElement {
  useEffect(() => {
    // In an effect, not in the render body: a capture in render runs on every render.
    captureError(error, {
      tags: { boundary: 'app/error.tsx', digest: error.digest ?? 'none' },
    });
  }, [error]);

  return (
    <div role="alert">
      <p>
        Something broke: <code>{error.message}</code>
      </p>
      <button type="button" onClick={reset}>
        Try again
      </button>
    </div>
  );
}
```

> **Source note.** StrictMode runs that effect twice in development, so the same error is captured twice.
> That is two calls and **one** record — the object is the same one both times — which is the enrichment
> rule behaving exactly as intended. A boundary that instead wrapped the error in a new `Error` would
> produce a second record whose fingerprint differs, because identity is the whole mechanism.

`app/global-error.tsx` is the same boundary one level up: it replaces the root layout when *that* throws, it
is a client component too, and it receives the same `error` and `reset`. The capture rule does not change —
it has to call `captureError` itself — but be honest about what that call can achieve:

> **Source note.** The provider that calls `initTelemetry` lives *in* the root layout, so a failure reaching
> `app/global-error.tsx` means telemetry was never initialised in that page load. A capture with no tracker
> is buffered per runtime — up to `PRE_INIT_ERROR_BUFFER_SIZE` (`50`) — and replayed only when telemetry
> initialises, which in that render it does not. Render the fallback, and send the failure to your server's
> observability stack.

## See also

- [Capturing worker failures and dynamic-import failures](../../vanilla/more-advanced/07-workers-and-dynamic-imports.md)
  — the full `attachWorker` surface: every recorded field, the three `op` values, and what is read from a
  worker event and what is not.
- [Duplicates, throttling and testing](./08-dedupe-throttling-and-testing.md) — what the second capture of
  an error actually does, and how to assert any of this in Vitest.
- [What arrives at your collector](../advanced/02-what-arrives-at-the-collector.md) — the request body a
  `source: 'chunk'` or `source: 'worker'` record turns into.
- [docs/API.md](../../../docs/API.md#codewithrajatrm-logvaultworker) — `attachWorker`, `WorkerAttachment`
  and `expectResponse` with their exact signatures.
