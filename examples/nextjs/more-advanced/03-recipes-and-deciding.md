# The recipes, the boundary, and choosing between them

**Problem it solves:** you now have four ways to get a client error recorded, a server render that no
client mechanism can see, and an `error.tsx` that looks like a general-purpose safety net but only covers
one kind of failure. Picking the wrong one produces either a hole in your coverage or a duplicate you did
not expect. This page is the decision, written out once, with the four recipes from
[basic](../basic/01-capture-recipes.md) placed in their real home — plus how to assert it in a test
instead of clicking buttons and squinting at a report.

**What you will learn:**

- The complete integration, in three files.
- A decision table across Next.js's error paths, including the one that is never recorded.
- The server/client boundary: what a server-side `initTelemetry` actually does.
- How to test a client component without claiming you tested a server render.

## The complete setup, once

Every recipe on this page works with exactly this, and nothing else.

`app/providers.tsx` — the only correct place for the call:

```tsx
// app/providers.tsx
'use client';

import { useEffect, type ReactElement, type ReactNode } from 'react';
import { destroyTelemetry, initTelemetry } from '@codewithrajat/rm-logvault';

export function Providers({ children }: { readonly children: ReactNode }): ReactElement {
  useEffect(() => {
    initTelemetry({ appName: 'my-app' }); // an effect only runs in the browser

    return (): void => {
      destroyTelemetry();
    };
  }, []);

  return <>{children}</>;
}
```

`app/layout.tsx` — a **server** component, which is what makes the boundary explicit:

```tsx
// app/layout.tsx
import type { ReactNode } from 'react';
import { Providers } from './providers';

export default function RootLayout({ children }: { readonly children: ReactNode }) {
  return (
    <html lang="en">
      <body>
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
```

`app/ui/telemetry-boundary.tsx` — a client boundary, if you want the fallback as well as the record. The
React adapter works on the client in the usual way:

```tsx
// app/ui/telemetry-boundary.tsx
'use client';

import type { ReactElement, ReactNode } from 'react';
import { TelemetryErrorBoundary } from '@codewithrajat/rm-logvault/react';

export function TelemetryBoundary({ children }: { readonly children: ReactNode }): ReactElement {
  return (
    <TelemetryErrorBoundary
      context={{ tags: { shell: 'app' } }}
      fallback={(error, reset) => (
        <div role="alert">
          <p>Something broke: <code>{error.message}</code></p>
          <button onClick={reset} type="button">Try again</button>
        </div>
      )}
    >
      {children}
    </TelemetryErrorBoundary>
  );
}
```

The props that matter are `children`, `fallback` (a node, or `(error, reset) => node`), `onError?` and
`context?`. A record from this path is captured with `source: 'react'` and the component stack.

## Which one do I use?

| Situation | Use | Why not the others |
| --- | --- | --- |
| A `throw` in a client event handler | **Nothing** | React wraps the listener and re-reports the failure through `reportError()`, so the global handler records it as `source: 'window'`. |
| A rejected promise on the client | **Nothing** | `unhandledrejection` already has it. |
| A client render error inside a boundary you placed | `TelemetryErrorBoundary` | It records with `source: 'react'` and the component stack, renders a fallback, and offers `reset`. |
| A client render error with no boundary above it | `app/error.tsx`, or a boundary of your own | `window.onerror` never sees a render throw — React caught it first. |
| An error thrown during a **server** render | **Not this library.** Next's error overlay in development, your server logs in production | There is no browser, no IndexedDB and no client vault in that process. Central server-side failures belong in your server-side observability stack. |
| Something threw and the automatic record lacks context | `withErrorCapture` (keep the throw) or `useErrorCapture` (stop it) | The automatic record cannot know your order id. |
| You caught a failure and the user is fine | `captureError(error, ctx)` | It reports and returns instead of throwing. |
| You want to report a wrong-but-not-fatal state | `captureError(error, ctx)` | Nothing was thrown to capture. |
| A server component calls `logger.info(…)` | Nothing — it is fine, and it is server-only | It prints on the server; its buffered entry is discarded with that process. |

Note the last rows: `captureError` and `logger.*` are safe to call on the server, but "safe" does not mean
"stored". Anything that needs the vault — the store, the outbox, the report — is client-only.

## The server/client boundary

**Importing is safe. Calling `initTelemetry` is not.** Every browser entry point is guarded and the module
does no work at import time, which is exactly what lets a server component reference `logger` at all.

> **Source note.** Calling `initTelemetry` during SSR does **not** simply "do nothing". The
> initialisation proceeds, the IndexedDB open fails against a missing `globalThis.indexedDB`, and that
> installation ends up with `storage: 'unavailable'`. It captures nothing to a store and makes
> `getTelemetryStatus().initialized` return `true` in that process. It never throws and cannot corrupt
> the browser's vault, because the server process and the browser are different module instances. It is
> still wasted, misleading work — which is why the call belongs behind `'use client'` in an effect, and
> not merely by convention.

The pre-initialisation buffer is **per runtime**, and understanding that is what stops the "the server
will send it to the browser later" assumption:

| Fact | Consequence |
| --- | --- |
| Log calls and errors made before `initTelemetry` are buffered and replayed into the store when the first sink is registered. | The mechanism exists for a *client* call made before the provider's effect. |
| The buffer is created per logger instance, in the runtime that created it. | A server-side buffer lives in the server process. |
| There is no hydration or serialisation channel for it. | Nothing it holds can reach the browser's vault. |
| Both buffers hold `50` entries — `PRE_INIT_LOG_BUFFER_SIZE` and `PRE_INIT_ERROR_BUFFER_SIZE`. | Beyond capacity the call is **not** buffered, so it is not replayed — and at the default console level it was not printed either, so it is effectively lost. Keep pre-init log volume low. |

Concretely: a **client** `logger.info(...)` before the provider's effect is buffered and then stored with
its original level and message. A **server** `logger.info(...)` prints on the server only, and its
buffered entry is discarded with that process.

| Safe on the server | Client-only |
| --- | --- |
| Importing any entry point | `initTelemetry`, `destroyTelemetry` |
| `logger.*` (server console only; not stored) | `getTelemetryStatus`, `flushTelemetry` |
| `captureError` (buffered per runtime, not stored) | `syncTelemetry`, `retryFailedTelemetry`, `clearTelemetryData` |
| `resolveOptions`, `DEFAULT_OPTIONS`, the type surface | `exportDiagnosticsReport` (reads IndexedDB, writes a Blob) |
| | `handle.events` subscriptions — there is no browser emitter in the server process |
| | `createFetchHttpClient` (from `/http`) — `fetch` plus `AbortController` |
| | `createEncryptingRepository` (from `/storage`) — needs IndexedDB, and AES needs `crypto.subtle` |
| | Any `repository`, `rest.transport`, `logSource` or hook you build |

A shared component that calls any of the right-hand column needs `'use client'`. A function cannot cross
the boundary either, which is why a `repository`, a transport or a `logSource` has to be constructed on
the client.

## `app/error.tsx` is a client boundary, and nothing more

Next's `app/error.tsx` **is** a client error boundary in the App Router, so it can carry
`TelemetryErrorBoundary` from `@codewithrajat/rm-logvault/react` in the usual way — an `error.tsx` is a
client component. It cannot help with a server-render failure: that failure happens where this library
has no store to write to. The boundary covers *client* render errors; server render errors belong to your
server-side observability stack.

## The two "capture and throw" options

| | `withErrorCapture(handler, ctx)` | `useErrorCapture(ctx)` |
| --- | --- | --- |
| Lives in | The core package | The React adapter, so client-only |
| Re-throws? | **Yes** — same value, so your `catch` still runs | **No** — it swallows |
| Shape | A function you call with a callback | A hook returning `capture(error, extra?)` |
| Best for | Preserving existing error behaviour while adding context | A handler where a re-throw would only add noise |

Neither is a wrapper for the function you hand to `onClick`, and the hook does not re-throw — the record
is the whole story, and nothing propagates to a `catch` above it:

```tsx
// app/checkout/pay-button.tsx
'use client';

import type { ReactElement } from 'react';
import { useErrorCapture } from '@codewithrajat/rm-logvault/react';

export function PayButton(): ReactElement {
  const capture = useErrorCapture({ tags: { flow: 'checkout' } });

  return (
    <button type="button" onClick={() => capture(new Error('[checkout] payment failed'))}>
      Pay
    </button>
  );
}
```

> **Source note.** `useErrorCapture` merges its two arguments with a shallow spread —
> `{ ...context, ...extra }` — so a key passed in `extra` (for example `tags`) **replaces** the bound one
> rather than merging with it, and `source`, `severity` and `extra` behave the same way. Write the whole
> value out when you want to add to a tag set rather than replace it:
>
> ```ts
> const capture = useErrorCapture({ tags: { flow: 'checkout' } });
>
> capture(error, { tags: { step: 'confirm' } });
> // recorded tags: { step: 'confirm' }   ← `flow` is gone
>
> capture(error, { tags: { flow: 'checkout', step: 'confirm' } });
> // recorded tags: { flow: 'checkout', step: 'confirm' }
> ```

## Testing it without a browser database

`createMemoryRepository()` from `@codewithrajat/rm-logvault/testing` is the documented path, and a client
component under test is just a client component, so `@testing-library/react` works:

```tsx
// app/checkout/pay-button.test.tsx
import { afterEach, expect, it } from 'vitest';
import { destroyTelemetry, flushTelemetry, initTelemetry } from '@codewithrajat/rm-logvault';
import { createMemoryRepository } from '@codewithrajat/rm-logvault/testing';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { PayButton } from './pay-button';

afterEach(() => {
  destroyTelemetry();
});

it('records a failure captured with the hook, keeping its bound tags', async () => {
  const repository = createMemoryRepository();

  // `shortcut: false` stops the test installing a keydown listener on `document`.
  initTelemetry({ appName: 'test-app', repository, shortcut: false });

  render(<PayButton />);
  await userEvent.click(screen.getByRole('button', { name: 'Pay' }));

  await flushTelemetry(); // writes are batched; without this the assertion races

  const [record] = repository.errors.all();
  expect(record?.message).toBe('[checkout] payment failed');
  expect(record?.tags).toEqual({ flow: 'checkout' });
});
```

Why each line is there:

| Line | Reason |
| --- | --- |
| `createMemoryRepository()` | No IndexedDB, no `fake-indexeddb` dependency, no partial browser implementation. |
| `shortcut: false` | Otherwise every test installs a `keydown` listener on `document`. |
| `destroyTelemetry()` in `afterEach` | Initialisation is idempotent, so a second test would otherwise reuse the first one's setup and fail confusingly. |
| `await flushTelemetry()` | Writes are batched; the flush is what makes the assertion deterministic. |

Two more async details: `flushTelemetry()` returns a promise and never rejects, so always `await` it
before asserting. `exportDiagnosticsReport()` also returns a promise — `void` it in a click handler, or
`await` it inside an `async` function; it flushes first and never throws or rejects, and it resolves with
`{ ok, format, bytes }` rather than a boolean.

Be honest about the scope. `'use client'` has no meaning outside the Next build, so the test renders the
component as a plain React component — what the directive compiles to, but not the directive itself. And
a server component cannot be rendered by Testing Library *as* a server component, so the test cannot tell
you that the provider actually mounts in `app/layout.tsx`; only running the app checks that wiring. Say
which one the test covers, and do not claim a server render was tested.

## A checklist for a new capture site

1. Would the automatic path already catch it? Then write nothing.
2. A client render failure needs a boundary; `window.onerror` never sees one.
3. A server render failure is not recorded here — send it to your server-side observability stack.
4. Add the context the library cannot discover, with `tags` for grouping and `extra` for values.
5. Keep propagating? `withErrorCapture` re-throws; `useErrorCapture` does not.
6. Assert it with a memory repository, so the integration cannot regress unnoticed.

## Try it yourself

1. Mount `Providers` from `app/providers.tsx` in `app/layout.tsx`, then confirm the vault fills: click a
   recipe button and press <kbd>Ctrl</kbd>+<kbd>Shift</kbd>+<kbd>Alt</kbd>+<kbd>D</kbd>.
2. Throw during a **server** render and confirm nothing appears in the report — then find it in your
   terminal, which is where it actually is.
3. Delete the provider from the layout and run the test above. It still passes, which is exactly the
   honest limit of what a client-component test covers.

## Related

- [the capture recipes](../basic/01-capture-recipes.md) — the four recipes these decisions are about.
- [the server boundary](./01-framework-adapter.md) — the SSR note above, in full.
- [observing and extending](./04-observing-and-extending.md) — the events these paths emit, and the
  JSONL/CSV formats.
- [environment variables](../config/01-environment-variables.md) — the `NEXT_PUBLIC_` rule, with units and
  defaults.
- [docs/API.md](../../../docs/API.md) — every option annotated, and the exact signatures.
