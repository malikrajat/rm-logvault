# Worker failures and dynamic imports in a React app

**Problem it solves:** two failures React cannot see on its own — one because it is an event on an
object React never touches, and one because the only fact that would make it legible exists at your call
site.

A `Worker`'s `error` and `messageerror` events fire on the **`Worker` object**, so React never
dispatches them — they are not render throws, not event-handler throws and not rejections — and
`TelemetryErrorBoundary` and `reactRootErrorHandlers()` are both blind to a worker that died on its
first message. A failed `import()` reaches whichever boundary happens to be mounted, naming a hashed
filename, with nothing that says which screen the user was trying to reach.

Both are call-site problems: React knows where your code is, and only your code knows which worker and
which route. The two functions themselves are written up once in
[the vanilla page](../../vanilla/more-advanced/07-workers-and-dynamic-imports.md).

**What you will learn:**

- Where `attachWorker` belongs: module scope, an effect with a cleanup, or a ref.
- Why an attach inside an effect with no cleanup attaches twice, and what that costs.
- `withChunkCapture` inside `React.lazy`, behind a `useTransition`, and in a route loader.
- How `handled: false` interacts with `TelemetryErrorBoundary`.
- Why `useRef<Worker | null>` is safe to pass to `attachWorker`, and why "safe" is not "useful".
- Testing a worker integration where the DOM implementation has no `Worker`.

## What React already sees, and what it does not

| Failure | Who reports it today | What you add |
| --- | --- | --- |
| A render throw | The boundary that caught it, or `reactRootErrorHandlers()` if none did | Nothing |
| An event-handler throw | React re-reports it; the `window.onerror` handler records it | Nothing |
| An unhandled rejection | The `unhandledrejection` handler | Nothing |
| A worker `error` / `messageerror` | **Nobody** — the event fires on the `Worker` object | `attachWorker` |
| A rejected `import()` you catch | The boundary that received the re-throw | `withChunkCapture` |

Neither fix can be automatic: `initTelemetry` cannot enumerate live `Worker` instances, and patching
the `Worker` constructor would change what your own `instanceof Worker` checks return on every page.

## Where the attach goes: module scope

A worker is a page-level resource — one connection, not one per component — so its home is the module
that owns it, and `attachWorker` goes beside it:

```ts
// src/workers/health.ts
import { attachWorker } from '@codewithrajat/rm-logvault/worker';

const worker = new Worker(new URL('./health.worker.ts', import.meta.url), { type: 'module' });

// One attach, for the lifetime of the page: no effect to double-invoke, no cleanup to
// forget. StrictMode's double-invoke applies to effects, not to module evaluation.
export const healthAttachment = attachWorker(worker, {
  name: 'healthStatus',
  context: { tags: { area: 'shell' } },
});
```

A failure that happens before `initTelemetry` is not lost either: `captureError` buffers up to 50
pre-init errors with the context they arrived with, and replays them once application metadata is
known. Adapters resolve the live tracker through the library's shared state object, so a record from a
worker lands in the same store as one from the root handlers. Neither listener calls `preventDefault()`,
so the browser's own console output is unchanged. In a Vite app, hand the returned attachment to
`import.meta.hot?.dispose(...)` as well: an edit re-evaluates this module, and the old listeners would
otherwise outlive the worker.

## The same worker, owned by an effect

If the worker really is per-mount, the attach belongs in the effect that creates it — and the cleanup
**must** return the detach:

```tsx
import { useEffect, useState } from 'react';
import type { ReactElement } from 'react';
import { attachWorker } from '@codewithrajat/rm-logvault/worker';

/** What `attachWorker` needs, plus what the panel does with the worker. */
export interface WorkerLike {
  addEventListener(type: string, handler: (event: unknown) => void): void;
  removeEventListener(type: string, handler: (event: unknown) => void): void;
  postMessage(message: unknown): void;
}

export function HealthPanel({ worker }: { worker: WorkerLike }): ReactElement {
  const [state, setState] = useState<HealthState>('checking');

  useEffect(() => {
    const detach = attachWorker(worker, { name: 'healthStatus', responseTimeoutMs: 10_000 });
    const settle = detach.expectResponse('health-check');
    const onMessage = (event: MessageEvent<HealthResult>): void => {
      settle();
      setState(event.data.state);
    };

    worker.addEventListener('message', onMessage);
    worker.postMessage({ type: 'check' });

    return () => {
      worker.removeEventListener('message', onMessage);
      detach(); // both listeners, and every pending timer
    };
  }, [worker]);

  return <HealthBadge state={state} />;
}
```

React 18 and 19 run every effect twice in development under `StrictMode`: mount, unmount, mount. With
the cleanup returned, the second run re-attaches after the first has detached. **Without a cleanup,
both setups stay** — four listeners where there should be two — because `attachWorker` has no
"already attached" check to make, and keeping a registry would mean patching the `Worker` constructor.
A real `Worker` satisfies `WorkerLike`, so production passes the module singleton from the previous
section and a test passes a fake.

`expectResponse(label)` starts the timer and returns the function to call when the reply arrives, and
`detach()` clears whatever is still pending — which is why the cleanup above needs no separate cancel
call, and why an unmounting panel cannot file a timeout record for a worker that was terminated a
moment later. Without `responseTimeoutMs` the whole thing is a no-op, so `expectResponse()` is safe to
call unconditionally. Always pass the label: without one the message reads "did not respond to
response", which nobody can act on.

> **Source note.** A double attach does not produce a duplicate row: aggregation is by fingerprint and
> applies only to `pending` rows, so the second capture lands on the first one's row with an inflated
> `occurrenceCount`. Which events get that far is worth knowing. An `error` event carrying an `error`
> object hands the *same* object to both handlers, so identity deduplication absorbs the second call,
> while a `messageerror` (which synthesises an `Error` per handler) and an `error` event with no
> `error` property (captured as the `message` string, which has no identity to key on) each produce a
> real second capture and a second rate-limit token.

## Passing a worker through a ref

`useRef<Worker | null>(null)` is a legitimate shape, and `attachWorker` accepts it because its first
parameter is `unknown`:

```ts
const workerRef = useRef<Worker | null>(null);

// Safe, and useless: `null` has no `addEventListener`, so this attachment is inert —
// no listeners, no throw, and `detach()` is a no-op.
attachWorker(workerRef.current, { name: 'search' });
```

That inertness is deliberate, but it is not a design for this case. On the **first render** the ref is
empty, so this attaches to nothing and can never report anything; once the ref has been filled, the same
line attaches another pair of listeners. Attach where you *assign* the ref — the effect above — not
where you read it.

## Dynamic imports: `withChunkCapture` inside `React.lazy`

The library already recognises an *uncaught* dynamic-import failure through `errors.captureChunkErrors`
(default `true`) and Vite's `vite:preloadError` listener. What it cannot know is which screen the user
was trying to reach, because that fact exists only at your call site:

```ts
// src/routes/overview.ts
import { lazy } from 'react';
import { withChunkCapture } from '@codewithrajat/rm-logvault';

// Module scope. A `lazy()` created during render is a new component type on every
// render, which remounts the subtree it loads.
export const Overview = lazy(withChunkCapture('Overview', () => import('./pages/Overview')));
```

The failure is recorded as `source: 'chunk'`, `category: 'chunk'`, `severity: 'fatal'`,
`handled: false`, with `tags.route: 'Overview'` — the screen, not the hashed file. React re-throws the
loader's rejection value, so the boundary receives the **same object** and makes its own `captureError`
call; identity deduplication makes those two calls one record, and the route tag survives because the
first call attached it:

```tsx
<TelemetryErrorBoundary fallback={(error, reset) => <LoadFailed error={error} onRetry={reset} />}>
  <Suspense fallback={<Spinner />}>
    <Overview />
  </Suspense>
</TelemetryErrorBoundary>
```

The boundary has to be **above** the `Suspense`, not inside it. A boundary inside never sees the
rejection, because the lazy component is what threw.

## A loader you call yourself

A route loader, a preload behind a `useTransition`, and a router's own `lazy` route property are the
same call site: you are about to `await` an import, and that is where the label is available.

```ts
// src/routes/order-detail.ts
import { withChunkCapture } from '@codewithrajat/rm-logvault';

export const loadOrderDetail = withChunkCapture('/orders/:id', () => import('./pages/OrderDetail'), {
  // The caller below renders its own retry state, so the failure IS handled here — and
  // the flag can only be set now, before that `catch` runs.
  handled: true,
});
```

```ts
const [, startTransition] = useTransition();

const open = (): void => {
  // The import is what can fail, and it can fail before React has anything to render.
  void loadOrderDetail()
    .then(() => startTransition(() => navigateTo(id))) // your router's navigation
    .catch(() => setFailed(true));                     // the record already exists
};
```

Two rules apply wherever you put it. The label is a **grouping key, not a URL**: `'/orders/:id'` groups
every order screen under one tag, while interpolating the real id gives each navigation its own tag
value that no report can group. And the wrapper is **not gated on `errors.captureChunkErrors`** — that
option decides whether the library's *own* global handlers classify an uncaught failure as
`source: 'chunk'`, so turning it off does not turn this call off.

## `handled: false`, and the error boundary

A worker failure never reaches a boundary at all. It is an event on the `Worker` object, not a throw in
the React tree, so no boundary renders a fallback for it and nothing can mark it handled: the record
stays `handled: false`, because `'worker'` and `'timeout'` are unhandled sources.

A chunk failure can reach both, and the first verdict stands. `withChunkCapture` records
`handled: false`; the boundary's later capture cannot change it, because `handled` is not one of the
fields an enrichment patch carries. The boundary also passes `source: 'react'`, and that is not applied
either — the chunk capture named the source explicitly, and a later call only replaces a source that was
never chosen. So a failed chunk load stays in the unhandled set your triage filters on, even though a
boundary rendered a fallback for it. To say otherwise, say it at the first capture:
`withChunkCapture(route, loader, { handled: true })`.

## Testing it where there is no `Worker`

happy-dom — the environment this repository's own suite runs on — exposes `EventTarget` but **no
`Worker`**, so a component that constructs its own worker cannot be rendered in a unit test. That is
another argument for the prop in `HealthPanel`, because the fake only has to keep a list of listeners
per event type: `attachWorker` reads the two listener members and nothing else, and reads every event
field by name when the test fires one. `test-worker.ts` is that map plus a `fire(type, event)` and a
`count(type)` helper, in about twenty lines.

```tsx
// src/workers/health.test.tsx
import { StrictMode } from 'react';
import { afterEach, expect, it } from 'vitest';
import { render } from '@testing-library/react';
import { destroyTelemetry, flushTelemetry, initTelemetry } from '@codewithrajat/rm-logvault';
import { createMemoryRepository } from '@codewithrajat/rm-logvault/testing';
import { HealthPanel } from './HealthPanel';
import { createFakeWorker } from './test-worker';

afterEach(() => {
  // Initialisation is idempotent, so a second test would reuse this one's otherwise.
  destroyTelemetry();
});

it('attaches once under StrictMode, and files the failure under its worker name', async () => {
  const repository = createMemoryRepository();
  initTelemetry({ appName: 'test-app', repository, shortcut: false });

  const worker = createFakeWorker();
  render(
    <StrictMode>
      <HealthPanel worker={worker} />
    </StrictMode>,
  );

  // The effect ran twice in development; the cleanup keeps this at one listener per
  // event. Without it, both counts are 2 — which is how a double attach is caught.
  expect(worker.count('error')).toBe(1);
  expect(worker.count('messageerror')).toBe(1);

  worker.fire('error', { message: 'health worker blew up' });
  await flushTelemetry();

  const [record] = repository.errors.all();
  expect(record?.source).toBe('worker');
  expect(record?.handled).toBe(false);
  expect(record?.tags).toEqual({ worker: 'healthStatus', op: 'fatal' });
});
```

The fake stands in for the worker, not for the library: `captureError` resolves the live tracker from
the shared state object, so the record reaches the repository you initialised whichever module called
it.

## See also

- [the vanilla page](../../vanilla/more-advanced/07-workers-and-dynamic-imports.md) — `attachWorker`'s
  three `op` values, the field allow-list, and why a worker is never attached for you.
- [duplicates, throttling and testing](./08-dedupe-throttling-and-testing.md) — what a second capture of
  the same `Error` does, and the rest of the test doubles.
- [what actually arrives at your collector](../advanced/02-what-arrives-at-the-collector.md) — the
  `handled`, `severity` and `tags` fields these records carry.
- [docs/API.md](../../../docs/API.md#codewithrajatrm-logvaultworker) — the full `attachWorker` reference.
