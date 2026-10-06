# basic — Next.js App Router

**Problem it solves:** you want a real error and log record kept on the device, from one call, before
anyone has agreed on a collector — and in the App Router the call **cannot** sit at module top level,
because modules are evaluated on the server too, where there is no `window`, no `document` and no
IndexedDB.

**What you will learn:**

- The whole integration: a `'use client'` provider plus a server component that logs harmlessly.
- The SSR rule — **importing is always safe, initializing is not** — and why an effect is the fix.
- Why the cleanup is not optional even though `initTelemetry` is idempotent.
- Where each failure is recorded, including the one it is not.
- How to read `getTelemetryStatus()` and where the records physically are.

## The integration

Two files, because the boundary between server and client **is** the integration.

`app/layout.tsx` — a **server** component:

```tsx
import { logger } from '@codewithrajat/rm-logvault';

// Safe on the server: every browser entry point is guarded, so this is a no-op that
// buffers one message IN THE SERVER PROCESS. It is discarded with that process and
// never reaches the browser's vault — see the table under "The SSR rule".
logger.info('[checkout] layout rendered on the server');

export default function RootLayout({ children }: { readonly children: ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
```

`app/providers.tsx` — a `'use client'` component:

```tsx
'use client';

import { useEffect, type ReactElement, type ReactNode } from 'react';
import { destroyTelemetry, initTelemetry } from '@codewithrajat/rm-logvault';

export function Providers({ children }: { readonly children: ReactNode }): ReactElement {
  useEffect(() => {
    initTelemetry({ appName: 'my-app' });

    return (): void => {
      destroyTelemetry();
    };
  }, []);

  return <>{children}</>;
}
```

Mount it from the server layout — `'use client'` is what makes crossing the boundary explicit:

```tsx
// app/layout.tsx
import { Providers } from './providers';

<body>
  <Providers>{children}</Providers>
</body>;
```

### The SSR rule

**Importing is always safe. Initializing is not.** `initTelemetry` reads `window`, `document` and
IndexedDB, so it must run on the client. An effect only runs in the browser, which is exactly the
condition it needs — that is why the documented pattern is an effect inside a `'use client'` component
rather than a top-level call in the module.

**Return the cleanup.** React StrictMode runs effects twice in development and Fast Refresh re-runs
them. `initTelemetry` is idempotent, so a missed cleanup would not produce duplicate records — it would
return the *existing* handle and silently ignore your options, which is a worse bug to chase. Returning
`destroyTelemetry` is what stops one installation becoming two.

### Where each failure is recorded

| Failure | Path |
| --- | --- |
| Thrown in a client event handler | `window.onerror` |
| Rejected promise on the client | `unhandledrejection` |
| A server component calling `logger.*` | Server console only. Buffered in the server process, discarded with it — there is no channel to the browser's vault (`PRE_INIT_LOG_BUFFER_SIZE` is `50`, and at the default console level such a call is not even printed). |
| An error thrown during a server render | **Not captured.** There is no browser; Next's own error overlay and server logs are the right tools there. |

```tsx
'use client';

import { logger } from '@codewithrajat/rm-logvault';

export function Buttons(): ReactElement {
  return (
    <>
      <button type="button" onClick={() => {
        throw new Error('Synchronous throw from a click handler');
      }}>
        Throw
      </button>

      <button type="button" onClick={() => {
        void Promise.reject(new Error('Rejected promise nobody handled'));
      }}>
        Reject
      </button>

      <button type="button" onClick={() => {
        // Prefer explicit context over one long string: `data` is sanitized before storage.
        logger.error('[checkout] payment failed', { orderId: 'A-1024' });
      }}>
        logger.error()
      </button>
    </>
  );
}
```

### The options this tier uses

| Option | Type | Default | What it means, and when to change it |
| --- | --- | --- | --- |
| `appName` | `string` | none | Stamped onto every record. Set it — a report that cannot say which application produced it is far less useful. There is no default because a guess would be worse than nothing. |

Everything else is defaulted, and the defaults are the interesting part:

| Defaulted behaviour | Value | Why that is the default |
| --- | --- | --- |
| `mode` | `'local'` | Records go to IndexedDB and **nothing is uploaded**, so the library is safe to add before a collector exists. Supplying a `rest.errorsUrl` or `rest.logsUrl` implies `'remote'` — see [advanced](../advanced/README.md). |
| `enabled` | `true` | The master switch. `false` makes every capture call a no-op and installs nothing. |
| `errors.enabled` / `logs.enabled` | `true` / `true` | Both stores are on. You can keep one and drop the other. |
| `errors.retentionDays` / `maxRecords` | `7` days / `500` rows | Whichever limit is reached first deletes a row. |
| `logs.retentionDays` / `maxRecords` | `3` days / `2000` rows | Logs are more voluminous and less precious than errors. |
| `logs.level` | `'warn'` | The **persist** threshold. `logger.info(...)` is dropped here **and** by the console threshold, which also defaults to `'warn'` — so at this tier an `info` line is neither printed nor stored. Raise `logs.consoleLevel` to see it, `logs.level` to keep it. |
| `shortcut` | enabled, <kbd>Ctrl</kbd>+<kbd>Shift</kbd>+<kbd>Alt</kbd>+<kbd>D</kbd> | Downloads a self-contained HTML diagnostics report with no code at all. |

Full reference, including every boundary case:
[docs/API.md](../../../docs/API.md#every-option-annotated).

## Reading the status

```ts
import { getTelemetryStatus } from '@codewithrajat/rm-logvault';

const current = getTelemetryStatus();

current.mode;               // 'local' | 'remote'
current.storage;            // whether IndexedDB actually opened
current.pending.errors;     // records written but not yet uploaded
current.pending.logs;
current.online;
current.droppedByRateLimit;
```

Call it from a client component and render the result — it reports in-memory state and does **not** read
IndexedDB, so polling it is cheap. It must be on the client: on the server it would report the
un-initialized state, not the browser's. When `storage` reports that the database failed to open —
Safari private mode, a blocked origin, a disabled setting — that is the first thing to check;
[docs/BROWSER-SUPPORT.md](../../../docs/BROWSER-SUPPORT.md) explains each cause.

## Where the records actually are

Open DevTools → **Application** → **IndexedDB** → `rm-logvault-errors` (and `rm-logvault-logs`). The
database names come from `dbPrefix`, which defaults to `'rm-logvault'`; the object stores inside are
`errors` and `logs`.

For something you can attach to a ticket, press
<kbd>Ctrl</kbd>+<kbd>Shift</kbd>+<kbd>Alt</kbd>+<kbd>D</kbd> in the browser: one self-contained HTML
file with every stored record and a page-load drill-down. It is a keyboard listener, so it does not
exist on a phone — [advanced](../advanced/README.md) shows the button-based alternative.

## What this tier deliberately does not cover

- **Uploading.** Local-only is the default; [advanced](../advanced/README.md) turns on REST sync.
- **Retention and volume.** The same tier sets those numbers on purpose instead of inheriting them.
- **The `NEXT_PUBLIC_` environment layer, redaction and console capture.** [config](../config/README.md).
- **The server boundary in full — buffered replay, and what a server import really does.**
  [more-advanced](../more-advanced/README.md).

## Next

- The four capture recipes: [capture recipes](./01-capture-recipes.md).
- Ready to upload: [advanced](../advanced/README.md).
- The same tier for another framework: [../../vue/basic/README.md](../../vue/basic/README.md),
  [../../angular/basic/README.md](../../angular/basic/README.md),
  [../../vanilla/basic/README.md](../../vanilla/basic/README.md).
