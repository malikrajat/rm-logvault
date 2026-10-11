# Duplicates, throttling and testing in a Next.js app

**Problem it solves:** `app/error.tsx` reads like the one place errors are handled, and it is not: it is a
client boundary that records nothing unless it calls `captureError` itself — a `logger.error(...)` line is
a *log* record, and the error store stays empty. Below it, a client-side poll (a health check on an
interval, a refetch loop) throws a **fresh** `Error` on every tick, so identity deduplication never fires
and `errors.maxRepeatsPerMinute` is all that bounds the noise. And the `catch` that has to hand an `Error`
to the boundary above it is where `String(error)` and `JSON.stringify(error)` get written.

**What you will learn:**

- Why `logger.error(...)` never captures, and what a boundary or a `catch` has to call instead.
- What a second capture of the **same** error object changes — and what it cannot change.
- `toError` at a rejected fetch site, and the identity rule that makes re-throwing it safe.
- `errors.maxRepeatsPerMinute` for a client-side poll, and why a **server**-side poll is out of scope here.
- Testing all of it with `createCaptureErrorMock`, `createLoggerMock` and `createMemoryRepository`.

## `logger.error(...)` is a record, and not the record you want

Components import from one client module — a file that re-exports what they need from the package, so there
is a single place to change and a single thing to replace in a test ([Testing it in Vitest](#testing-it-in-vitest)):

```ts
// app/orders/refresh.ts — a client module
'use client';

import { logger } from '@/lib/telemetry';

export async function refreshOrders(): Promise<void> {
  try {
    const response = await fetch('/api/orders');
    if (!response.ok) throw new Error(`orders request failed (${response.status})`);
  } catch (error) {
    logger.error('[orders] refresh failed', error); // a log record; the error store is untouched
  }
}
```

Swap in `captureError(error, { tags: { flow: 'orders-refresh' } })` and the same throw becomes an error
record: a fingerprint, a severity, an occurrence count, and a place in the unhandled set triage filters on.

> **Source note.** Nothing in the log pipeline reaches the error pipeline — `src/logger/` does not import
> `captureError` anywhere. `logger.error(...)` **is** persisted (`logs.level` defaults to `'warn'`, and
> `error` is above it), so the call is not wasted, only filed elsewhere. A `LogRecord` has no fingerprint
> and no occurrence count, so it cannot be grouped or aggregated, and nothing promotes it to an
> "unhandled failure" later.

## One error, two paths: what the second capture changes

An async client failure has two honest narrators in the App Router: the `catch` that fetched the data knows
the endpoint, and `app/error.tsx` knows the digest Next attaches. Capturing from both is not a duplicate —
provided the **same object** travels between them:

```tsx
// app/orders/orders-table.tsx
'use client';

import { useEffect, useState, type ReactElement } from 'react';
import { captureError } from '@/lib/telemetry';

export function OrdersTable(): ReactElement {
  const [failure, setFailure] = useState<Error | null>(null);

  useEffect(() => {
    void fetch('/api/orders')
      .then((response) => {
        if (!response.ok) throw new Error(`orders request failed (${response.status})`);
      })
      .catch((error: unknown) => {
        // The catch knows the endpoint; the boundary will know the digest. Both capture
        // this same object, so they are one record rather than two.
        const thrown = error instanceof Error ? error : new Error('orders request failed');
        captureError(thrown, { tags: { endpoint: '/api/orders' } });
        setFailure(thrown);
      });
  }, []);

  if (failure !== null) throw failure; // throwing during render is what reaches app/error.tsx

  return <table />;
}
```

`app/error.tsx` then captures that same object, and the second call **enriches** the record the first one
wrote instead of adding a row:

| Field | What the boundary's capture does |
| --- | --- |
| `tags`, `extra` | Merged; a key present in both resolves to the **second** call's value. |
| `severity` | Replaced. |
| `source` | Replaced **only if the first capture passed no explicit source** — a `catch` that passes none leaves the default `'manual'` correctable, while a deliberate `{ source: 'api' }` is never overwritten. |
| `handled` | **Not patchable.** `ErrorContextPatch` carries `source`, `severity`, `tags` and `extra` only. |
| `message`, `stack`, `category`, `page`, `environment` | Not patchable — they describe the occurrence, and the first capture recorded it. |

So the fetch site contributes the endpoint, the boundary contributes the digest, and neither can flip
`handled`. `occurrenceCount` stays `1` throughout, because nothing was reported twice.

> **Source note.** Two limits decide whether the second call does anything at all. The object must be the
> **same** one: a `catch` that writes `new Error(error.message)` produces a second record with a different
> fingerprint, and no part of this rule can help. And the enrichment applies only while the row is still
> `pending` — a row already claimed for upload belongs to an in-flight request and is never rewritten. A
> repository written before `mergeContext` existed loses the enrichment silently rather than duplicating.

## `toError` at a rejected fetch site

A Route Handler's error envelope is application data, not an `Error` — the server decides its shape, and it
arrives as `{ code: 'ORDERS_UNAVAILABLE' }`, as a string, or as an HTML error page. The two obvious
conversions are both wrong: `new Error(String(value))` gives `[object Object]`, and
`new Error(JSON.stringify(value))` throws on a cyclic object, turning "report this" into a second failure.

```ts
// app/orders/fetch-orders.ts — a client module
'use client';

import { captureError, toError } from '@/lib/telemetry';

export async function fetchOrders(): Promise<readonly { id: string }[]> {
  try {
    const response = await fetch('/api/orders');

    if (!response.ok) {
      // Unknown shape, and not worth a cast: `toError` reads it through the normaliser,
      // which is bounded, already redacted, and safe for a cyclic or hostile object.
      const envelope: unknown = await response.json().catch(() => null);
      throw toError(envelope);
    }

    return (await response.json()) as readonly { id: string }[];
  } catch (error) {
    const failure = toError(error);
    captureError(failure, { source: 'api', tags: { endpoint: '/api/orders' } });
    throw failure; // the same object, so a boundary above enriches rather than duplicates
  }
}
```

That last line is safe for a reason worth knowing: `toError` returns a same-realm `Error` **unchanged** —
the same object, the same stack — and only builds a new one for a value that is not an `Error`, attaching
the original as `cause`. So `throw toError(error)` cannot double-count anything in a `catch`: the value
that reaches the boundary is the value the boundary would have seen anyway.

> **Source note.** `redirect()` and `notFound()` work by throwing a value Next recognises, so a `catch` on
> a path that may redirect must re-throw what it caught. `toError` does not interfere with that — an
> `Error` in, the same `Error` out — but a `catch` that captures and then *swallows* breaks navigation, and
> that was already true before this library was involved. `toError` is also usable in a Route Handler's own
> `catch`, to shape a response envelope. Nothing is recorded there, for the reason in the next section.

## The throttle, and the poll that needs it

The option belongs in the provider effect — the same effect that calls `initTelemetry`, because the tracker
is per installation:

```tsx
// app/providers.tsx — inside the effect that already calls initTelemetry
useEffect(() => {
  initTelemetry({
    appName: 'checkout',
    errors: {
      // Records ONE failure may produce per 60-second window, checked before the global
      // limiter. `0` turns per-fingerprint throttling off entirely.
      maxRepeatsPerMinute: 12, // the default
    },
  });
  return (): void => destroyTelemetry();
}, []);
```

The poll this exists for has one property that matters: it throws a **new** `Error` every tick.

```ts
// app/health/health-poll.ts — started by a client hook's effect, cleaned up by it
import { captureError } from '@/lib/telemetry';

export function startHealthPoll(intervalMs: number): () => void {
  return window.setInterval(() => {
    void fetch('/api/health')
      .then((response) => {
        if (!response.ok) throw new Error(`health check failed (${response.status})`);
      })
      .catch((error: unknown) => {
        // A new object every tick, so identity dedupe never fires. Same message, same throw
        // site — which is what the repeat throttle keys on.
        captureError(error, { tags: { poll: 'health' } });
      });
  }, intervalMs);
}
```

Three facts about how that behaves, because none of them is obvious:

- **The throttle's key is not the fingerprint.** It is the failure as the *throw site* sees it — source,
  error name, message, and the top stack frame. That is deliberately coarse enough to catch a poll, and a
  refused repeat costs **no** global budget, so the genuinely new failures still get through. Admitted
  repeats aggregate onto the one pending row for their fingerprint, so twelve admitted ticks are one row
  with `occurrenceCount: 12`, not twelve rows.
- **A message that varies per tick defeats it.** `` new Error(`health check failed (${status})`) `` has a
  different key on every response code, so nothing is throttled and only `errors.maxEventsPerMinute`
  remains. Keep the message stable and put the varying part where it belongs:
  `captureError(new Error('health check failed'), { extra: { status } })` — neither the repeat key nor the
  fingerprint hashes `tags` or `extra`.
- **The two drop counters mean opposite things.** `getTelemetryStatus().droppedByRateLimit` counts records
  genuinely missing because the page produced too much; `droppedByRepeat` counts repeats of a failure that
  is *already in the report*, refused so the budget went to new failures instead. Read them in a client
  component: on the server they report that process's un-initialized state. There is an env name for the
  option too — `ERROR_TRACKING_MAX_REPEATS_PER_MINUTE`, read under the `NEXT_PUBLIC_` prefix, because only
  `NEXT_PUBLIC_*` variables reach a client bundle — and an explicit option beats it.

### Why a server-side poll is out of scope

**This library is browser-only and IndexedDB-backed, so a poll in the server process has nowhere to write.**
In a Route Handler, `initTelemetry` ends up with `storage: 'unavailable'` and stores nothing, and a
`captureError` before it is buffered per runtime and discarded with the process — it never reaches the
browser. A server-side health check is a real requirement and a different tool: a scheduled job plus your
server's own observability. What this library contributes is the client's half, with `error.digest` from
`app/error.tsx` as the key that matches the failure to the server's log line.

## Testing it in Vitest

The library's own suite runs on Vitest with `happy-dom`, and that is enough here: a client component, an
effect and the store are all in-process, and a memory repository replaces IndexedDB. Set
`test: { environment: 'happy-dom' }` in `vitest.config.ts`, and alias any import path your components use
(`@/*`) in `resolve.alias`, or a mocked specifier will not resolve to the file the component imports.

The double replaces that client module, once, for every component in the file that imports it. A `vi.mock`
registration is per test file, so a file that does not import the double still gets the real library:

```ts
// test/telemetry-double.ts
import { vi } from 'vitest';
import { toError } from '@codewithrajat/rm-logvault';
import { createCaptureErrorMock, createLoggerMock } from '@codewithrajat/rm-logvault/testing';

export const telemetry = createCaptureErrorMock();
export const logging = createLoggerMock();

// The client module your components import, replaced once. Both doubles expose reset(), so
// a module-scoped pair cannot leak assertions between files. `toError` is passed through
// unchanged: it holds no state, so there is nothing about it to record.
vi.mock('@/lib/telemetry', () => ({
  captureError: telemetry.captureError,
  logger: logging.logger,
  toError,
}));
```

```ts
// app/orders/refresh.test.ts
import { afterEach, expect, it, vi } from 'vitest';
import { logging, telemetry } from '@/test/telemetry-double';
import { refreshOrders } from './refresh';

afterEach(() => {
  vi.unstubAllGlobals();
  telemetry.reset();
  logging.reset();
});

it('captures the failure instead of only logging it', async () => {
  vi.stubGlobal('fetch', () => Promise.resolve(new Response(null, { status: 503 })));
  await refreshOrders();

  expect(telemetry.count()).toBe(1);
  expect(telemetry.last()?.ctx?.tags?.['flow']).toBe('orders-refresh');
  expect(logging.messages()).toEqual([]);
});
```

A mocked `captureError` cannot show you the two rules this page is about, because whether a second call
enriches is decided inside the library. Those assertions need the real pipeline, imported from the package
rather than the double:

```ts
// app/orders/dedupe.test.ts
import { afterEach, expect, it } from 'vitest';
import {
  captureError,
  destroyTelemetry,
  flushTelemetry,
  getTelemetryStatus,
  initTelemetry,
} from '@codewithrajat/rm-logvault';
import { createMemoryRepository } from '@codewithrajat/rm-logvault/testing';

afterEach(() => {
  destroyTelemetry();
});

it('enriches one record when the boundary captures the same error', async () => {
  const repository = createMemoryRepository();
  initTelemetry({ appName: 'test-app', repository, shortcut: false });

  const error = new Error('orders request failed (503)');
  captureError(error, { tags: { endpoint: '/api/orders' } }); // the fetch catch
  captureError(error, { tags: { boundary: 'app/error.tsx' } }); // the boundary
  await flushTelemetry();

  const records = repository.errors.all();
  expect(records).toHaveLength(1);
  expect(records[0]?.occurrenceCount).toBe(1);
  expect(records[0]?.tags).toEqual({ endpoint: '/api/orders', boundary: 'app/error.tsx' });
});

it('throttles a repeating poll past its per-fingerprint cap', async () => {
  const repository = createMemoryRepository();
  // 12 is the default; `0` would disable the throttle, and every tick would then compete
  // for the global budget instead.
  initTelemetry({ appName: 'test-app', repository, shortcut: false });

  // Fifteen ticks, a new Error each time, all created on the same line: identity dedupe
  // cannot help, which is the case the repeat throttle exists for.
  for (let tick = 0; tick < 15; tick += 1) {
    captureError(new Error('health check failed (503)'), { tags: { poll: 'health' } });
  }
  await flushTelemetry();

  expect(getTelemetryStatus().droppedByRepeat).toBe(3); // 15 ticks - the 12-record cap
  const records = repository.errors.all();
  expect(records).toHaveLength(1);
  expect(records[0]?.occurrenceCount).toBe(12);
});
```

Both repository assertions depend on `await flushTelemetry()`: writes are batched, and an assertion without
it races the queue. Be honest about the scope of a test like this — `'use client'` has no meaning outside
the Next build, so what renders is a plain React component, and a client-component test cannot confirm that
the provider is mounted in `app/layout.tsx`. Only running the app checks that wiring.

## See also

- [Duplicates, floods and non-`Error` throws](../../vanilla/more-advanced/08-dedupe-throttling-and-testing.md)
  — the full enrichment table, the three limits of the rule, the throttle arithmetic, and the `toError`
  input/output table.
- [Worker failures and dynamic imports](./07-workers-and-dynamic-imports.md) — the other page in this tier,
  and where `handled: false` comes from.
- [What arrives at your collector](../advanced/02-what-arrives-at-the-collector.md) — the request body an
  enriched record turns into once it is uploaded.
- [docs/API.md](../../../docs/API.md#captureerror) — the `captureError` contract, plus `toError` and
  `applyErrorContextPatch` with their exact signatures.
