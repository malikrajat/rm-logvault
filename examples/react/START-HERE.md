# React: a complete integration, in order

**Start here if you are setting this up for the first time.** This page is a sequence, not a reference:
do step 1, then step 2, then stop. Everything after step 4 is optional and can be added months later
without changing what came before.

No other page is needed to get a working React integration. The other pages in this tier go deeper on
one thing each; this one gets you from nothing to a working setup you can trust.

**What you will learn:**

- The two files you edit, and exactly what goes in each.
- What `<TelemetryErrorBoundary>` renders, and what `fallback` receives.
- Where `initTelemetry` goes, and why that spot and not a component.
- How to add a token, encryption, and the extra report formats **later** — each is a self-contained
  change.

---

## Step 1 — One call, in one file

Put this at the top of your entry file. Nothing else is required.

```ts
// src/telemetry.ts
import { initTelemetry } from '@codewithrajat/rm-logvault';

export const telemetry = initTelemetry({
  appName: 'my-app',
  appVersion: '1.0.0',
});
```

Then import it once, for its side effect, before you render anything:

```tsx
// src/main.tsx
import './telemetry'; // ← must be imported before the first render
import { createRoot } from 'react-dom/client';
import { App } from './App';

createRoot(document.getElementById('root')!).render(<App />);
```

**Why a separate module rather than calling `initTelemetry` inside `App`?** Three reasons, and they are
the ones that catch people out:

1. It runs **once**. A component body runs on every render, and initialisation is idempotent — so a
   second call would return the existing handle and silently ignore the options you passed.
2. It runs **before** anything can fail. Errors thrown during the first render, or by a module that
   `App` imports, are already captured and buffered.
3. It runs **outside React**, so the library never becomes part of your component tree or your
   re-render logic.

That is the whole of step 1. You now have local error and log recording, stored in the browser, with no
network requests and no backend.

## Step 2 — The boundary, and what it renders

`<TelemetryErrorBoundary>` does two things: it records the error, and it decides what the user sees
instead of the crashed subtree. If you give it no `fallback`, a crash renders **nothing** — a blank
screen — so always provide one.

```tsx
// src/main.tsx
import './telemetry';
import { createRoot } from 'react-dom/client';
import { TelemetryErrorBoundary } from '@codewithrajat/rm-logvault/react';
import { App } from './App';

createRoot(document.getElementById('root')!).render(
  <TelemetryErrorBoundary
    fallback={(error, reset) => (
      <div role="alert" style={{ padding: 24, fontFamily: 'system-ui' }}>
        <h1>Something went wrong</h1>
        <p>{error.message}</p>
        <button type="button" onClick={reset}>
          Try again
        </button>
      </div>
    )}
  >
    <App />
  </TelemetryErrorBoundary>,
);
```

`fallback` is a function here, and that matters: it receives the **error** and a **`reset`** function.
`reset` clears the boundary's internal state, so "Try again" re-renders the subtree without a full page
reload. A plain `ReactNode` also works when you do not need the error or the reset:

```tsx
<TelemetryErrorBoundary fallback={<p>Something went wrong.</p>}>
  <App />
</TelemetryErrorBoundary>
```

### Every prop

| Prop | Type | Default | What it does |
| --- | --- | --- | --- |
| `children` | `ReactNode` | — | The subtree to protect. |
| `fallback` | `ReactNode \| (error, reset) => ReactNode` | `null` | What to render after a failure. **Provide one.** The function form gets the error and a `reset`. |
| `onError` | `(error, info) => void` | — | Called after the error is captured, with React's `ErrorInfo` (its `componentStack`). |
| `context` | `ErrorContext` | — | Extra context merged into this boundary's records — e.g. `{ tags: { area: 'checkout' } }`. |

> **Source note.** The error is recorded **before** `onError` runs, and both are contained: a throw from
> your `onError` cannot break rendering, and nothing here can stop the record being written. The
> boundary captures with `source: 'react'` and attaches React's `componentStack`, which is usually the
> single most useful thing in the report.

### Where to put boundaries

One at the root is the minimum. Add more around anything that fails independently, so a crash in one
panel does not blank the whole page:

```tsx
<TelemetryErrorBoundary
  fallback={<p>This chart could not be displayed.</p>}
  context={{ tags: { area: 'revenue-chart' } }}
>
  <RevenueChart />
</TelemetryErrorBoundary>
```

Because each boundary carries its own `context`, the `tags.area` in your report tells you *which* part
of the page failed — which is what you need when triaging.

## Step 3 — Catch what a boundary cannot

A boundary only catches errors thrown while React is **rendering**. Three common cases slip past it:

| Case | What catches it |
| --- | --- |
| An event handler (`onClick`, `onSubmit`) | Nothing automatic — wrap it, or use `useErrorCapture` |
| An async call that rejects | Nothing automatic — `await` inside a `try`, see below |
| React 19 root-level failures | `reactRootErrorHandlers()`, see below |

For a handler or an async call, the hook gives you a pre-bound capture function:

```tsx
import { useErrorCapture } from '@codewithrajat/rm-logvault/react';

export function CheckoutButton() {
  const capture = useErrorCapture({ tags: { flow: 'checkout' } });

  return (
    <button
      type="button"
      onClick={async () => {
        try {
          await submitOrder();
        } catch (error) {
          capture(error); // recorded, and the UI keeps working
          showToast('Payment could not be completed.');
        }
      }}
    >
      Pay
    </button>
  );
}
```

If you are on React 19, add the root handlers so anything React swallows at the root is still recorded:

```tsx
// src/main.tsx
import { createRoot } from 'react-dom/client';
import { reactRootErrorHandlers } from '@codewithrajat/rm-logvault/react';

createRoot(document.getElementById('root')!, reactRootErrorHandlers()).render(<App />);
```

An error that reaches **both** the boundary and the root handlers produces **one** record, not two — the
pipeline deduplicates by object identity.

## Step 4 — Confirm it works

Throw something on purpose, then press **Ctrl+Shift+Alt+D**. A file downloads; open it.

```tsx
function Boom(): never {
  throw new Error('test error — delete me');
}
```

The report is a single self-contained HTML file. Nothing was uploaded anywhere, and no server was
involved. If the file has your error in it, the integration is done.

That is the whole required setup: **four steps, two files.**

---

# Optional additions

Each of these is independent. Add one when you have a reason to, and none of them requires changing the
steps above.

## A) Send records to your own server

```ts
// src/telemetry.ts
initTelemetry({
  appName: 'my-app',
  url: '/api/telemetry', // one endpoint for errors and logs
});
```

`url` is shorthand for setting both `rest.errorsUrl` and `rest.logsUrl`. To split them:

```ts
initTelemetry({
  appName: 'my-app',
  errorUrl: '/api/telemetry/errors',
  logUrl: '/api/telemetry/logs',
});
```

> **Source note.** These are flat aliases. **A nested option always beats its alias**, so
> `{ url: '/a', rest: { errorsUrl: '/b' } }` sends errors to `/b` and logs to `/a`. Records are still
> written to IndexedDB first, so an unreachable endpoint loses nothing. Providing a URL is what turns
> on network egress; without one, the library makes no requests at all.

## B) Authentication — passing a token

This is the one people most often get stuck on, so here is the whole thing. You give the library a
**function that returns a token**, not a token. That way a token rotated mid-session is picked up
without re-initialising anything.

```ts
// src/telemetry.ts
import { createAuthHeaderProvider, initTelemetry } from '@codewithrajat/rm-logvault';

const auth = createAuthHeaderProvider({
  // Called per upload request. Return undefined when nobody is signed in.
  getToken: () => sessionStorage.getItem('access_token') ?? undefined,
});

initTelemetry({
  appName: 'my-app',
  url: '/api/telemetry',
  headers: auth.getHeaders, // ← the flat alias for rest.getHeaders
});
```

The result is an `Authorization: Bearer <token>` header on every upload. For a different header — an API
key sent bare, for instance:

```ts
const auth = createAuthHeaderProvider(
  { getToken: () => import.meta.env.VITE_INGEST_KEY },
  { headerName: 'X-API-Key', scheme: '' }, // scheme '' = no "Bearer " prefix
);
```

### With refresh, for a short-lived token

```ts
const auth = createAuthHeaderProvider({
  getToken: () => tokenStore.access,

  refreshToken: async () => {
    const response = await fetch('/api/auth/refresh', { method: 'POST' });
    if (!response.ok) return undefined;
    const { access } = (await response.json()) as { access: string };
    tokenStore.access = access;
    return access;
  },

  // Optional. Without it the library never refreshes proactively and relies on a 401.
  isTokenExpired: (token) => jwtExpiry(token) < Date.now(),

  // Called ONLY when a token existed and could not be replaced — not when signed out.
  onUnauthorized: () => router.push('/login'),
});
```

| Behaviour | Detail |
| --- | --- |
| Fires when | A token **was** present, was stale, and the refresh failed. Also after a `401` whose refresh failed. |
| Does **not** fire when | There is simply no token. That is the normal signed-out state; firing there would redirect on every request. |
| Concurrency | Ten requests with a stale token cause **one** refresh call, not ten. |
| Failure mode | `getHeaders()` never rejects. If no token can be obtained it returns an empty header bag, so the server's `401` is the single visible failure. |

Your token is never read from anywhere the library chooses, never decoded, and never logged. It is a
value your function returns, attached to a header, and that is all.

## C) Encryption — how reading and writing actually work

The short answer: **you do not encrypt or decrypt anything yourself.** You name the fields, hand over a
provider once, and the wrapper does both directions in place.

```
you call save(record) ──► wrapper ENCRYPTS the named fields ──► IndexedDB stores ciphertext
you call getAll()     ◄── wrapper DECRYPTS the named fields ◄── IndexedDB returns ciphertext
```

So "encrypted before we write, decrypted after we read" is exactly what happens, and **every caller
above the wrapper sees plaintext** — including the diagnostics report. There is no separate
"encrypted export": the HTML report is generated from `getAll()`, which decrypts, so the report is
readable with no key and no extra step. The ciphertext exists only inside IndexedDB.

```ts
// src/telemetry.ts — the whole of it
import {
  createErrorRepository,
  createLogRepository,
  initTelemetry,
} from '@codewithrajat/rm-logvault';
import type { StorageResult, TelemetryHandle } from '@codewithrajat/rm-logvault';
import {
  createAesGcmEncryptionProvider,
  createEncryptingRepository,
} from '@codewithrajat/rm-logvault/storage';

// Must be identical on every load, or existing rows cannot be read. A constant is
// fine; it is not secret, and it is not the key.
const SALT = new Uint8Array([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16]);

/**
 * Deriving the key is async, so build the handle in an async function and await it
 * once before rendering. `telemetry` is a promise here, not a handle.
 */
export const telemetry: Promise<TelemetryHandle> = (async () => {
  const provider = await createAesGcmEncryptionProvider({
    password: import.meta.env.VITE_VAULT_PASSPHRASE,
    salt: SALT,
  });

  // Not a secure context (plain http:) — crypto.subtle is unavailable. Stay local
  // and unencrypted rather than claiming otherwise.
  if (provider === undefined) return initTelemetry({ appName: 'my-app' });

  const rawErrors = createErrorRepository({ dbName: 'my-app-errors' });
  const rawLogs = createLogRepository({ dbName: 'my-app-logs' });
  const options = { fields: ['message', 'componentStack'] };

  return initTelemetry({
    appName: 'my-app',
    repository: {
      errors: createEncryptingRepository(rawErrors, provider, options),
      logs: createEncryptingRepository(rawLogs, provider, options),
      initialize: async (): Promise<StorageResult<void>> => {
        const errors = await rawErrors.initialize();
        const logs = await rawLogs.initialize();
        if (!errors.ok && !logs.ok) return errors;
        return { ok: true, value: undefined };
      },
      close: () => {
        rawErrors.close();
        rawLogs.close();
      },
    },
  });
})();
```

```tsx
// src/main.tsx — await it once, before the first render
import { telemetry } from './telemetry';
import { createRoot } from 'react-dom/client';
import { TelemetryErrorBoundary } from '@codewithrajat/rm-logvault/react';
import { App } from './App';

await telemetry; // the handle; awaiting also guarantees storage is opening

createRoot(document.getElementById('root')!).render(
  <TelemetryErrorBoundary fallback={<p>Something went wrong.</p>}>
    <App />
  </TelemetryErrorBoundary>,
);
```

> **Source note.** `initTelemetry` is synchronous, but deriving an AES key is not — hence the promise.
> Awaiting it before the first render keeps the ordering guarantee from step 1: nothing can fail before
> the recorder exists. If your build target has no top-level `await`, do the same thing inside an
> `async function bootstrap()` that you call at the end of `main.tsx`, and put the `createRoot` call
> after the `await`.

### Which fields — and the two consequences of `fields`

`fields` is the list of record fields to encrypt. Everything else is stored as normal.

| Field | Encrypt? | Why |
| --- | --- | --- |
| `message` | Yes | The most likely place for a customer name or an order id. |
| `componentStack` | Yes, in React | Usually the richest source of leaked prop values. |
| `stack` | Your call | Worth hiding, but it is the largest field, so the size cost is highest here. |
| `api.url` | Yes | Dotted paths reach a nested string. |
| `fingerprint` | **Never** | It is the aggregation key. Encrypting it breaks grouping — see below. |
| `extra`, `tags` | Not possible | They hold objects, and **only string values are transformed**. A non-string field is skipped silently. |

Two consequences worth knowing before you turn this on:

1. **You can no longer search the vault by message text.** A support engineer reads the report fine,
   because the report decrypts — but querying IndexedDB directly, or grepping a database dump, shows
   ciphertext.
2. **Encrypting `fingerprint` breaks grouping.** `save` finds the row to merge into by looking up
   `[fingerprint, 'uploadStatus']`. AES-GCM uses a fresh random IV, so the same fingerprint encrypts
   differently every time and three occurrences of one bug become three rows with `occurrenceCount: 1`
   each. Measured:

   | Encrypted fields | Rows for three identical errors | `occurrenceCount` |
   | --- | --- | --- |
   | `['message']` | **1** | `3` |
   | `['fingerprint']` | 3 | `1, 1, 1` |

   Encrypting `message` is safe. Encrypting `fingerprint` is not.

> **Source note — what this does and does not protect.** The key is derived from a passphrase your bundle
> contains, so this protects the **stored data** from someone who has the database but not the code. It
> does not protect against someone running your page. Redaction — which happens automatically before
> anything is written — is the privacy control; encryption is defence in depth for storage.

Also worth knowing: the initialisation above uses top-level `await`, which needs a module build target
that supports it (Vite does by default). If yours does not, wrap the whole thing in an `async function`
and call it before rendering.

## D) Report formats — and a copy button for users without dev tools

`exportDiagnosticsReport` downloads an HTML report by default. Three other formats and a clipboard mode
are available:

| `format` | Output | Use it when |
| --- | --- | --- |
| `'html'` (default) | One self-contained HTML file | Sending to a support engineer. |
| `'json'` | One JSON document | Parsing programmatically. Add `pretty: true` to indent it. |
| `'jsonl'` | One JSON object per line | Feeding a log pipeline. |
| `'csv'` | One table, both kinds | Opening in a spreadsheet. |

```tsx
import { exportDiagnosticsReport } from '@codewithrajat/rm-logvault';
import { useState } from 'react';

export function SupportButton() {

  return (
    <button
      type="button"
      disabled={busy}
      onClick={async () => {
        setBusy(true);
        const result = await exportDiagnosticsReport({
          format: 'json',
          pretty: true,
          copyToClipboard: true, // instead of downloading
        });
        setBusy(false);
        alert(result.ok ? 'Copied to the clipboard.' : 'Could not build the report.');
      }}
    >
      Copy diagnostics
    </button>
  );
}
```

> **Source note — a breaking change.** This returns `{ ok, format, bytes }`, not a boolean. An older
> `if (await exportDiagnosticsReport())` still compiles but is now always truthy, because an object is
> always truthy. Use `result.ok`, as above. The shortcut key gives you `'html'` without writing any of
> this.

## E) Watch what is happening, and see the library's own failures

Useful once the integration is live. Subscribe **after** `initTelemetry` has run — a subscription made
before it is a no-op, because there is nothing to subscribe to yet.

```tsx
import { telemetry } from './telemetry';

// In the module next to initTelemetry, or in an effect in your root component.
telemetry.events.on('error:captured', (event) => {
  console.log('captured', event.fingerprint, event.severity, event.source);
});

telemetry.events.on('error:captured', (event) => {
  // Or feed your own store — Zustand, Redux, a signal, whatever you use.
  errorStore.getState().add(event.recordId, event.severity);
});
```

And to find out when the *library* is failing — storage never opened, a record dropped for exceeding
its budget — rather than your application:

```ts
initTelemetry({
  appName: 'my-app',
  onInternalError: (stage, error) => {
    console.warn('[telemetry]', stage, error);
  },
});
```

This is the highest-value ten lines in the whole setup: without it, a degraded vault looks like a
working one.

---

## All the options, grouped

Everything is optional; the defaults are safe. This is the same list as
[the config tier](./config/README.md), narrowed to the options a React app reaches for.

```ts
initTelemetry({
  // Identity — stamped onto every record
  appName: 'my-app',
  appVersion: '1.0.0',
  buildId: import.meta.env.VITE_BUILD_ID,
  environment: import.meta.env.MODE,

  // Where records go
  url: '/api/telemetry', //                  both kinds
  errorUrl: '/api/telemetry/errors', //      …or split them
  logUrl: '/api/telemetry/logs',
  headers: auth.getHeaders, //               auth token, awaited per request

  // Levels
  level: 'warn', //        minimum level PERSISTED (default 'warn')
  consoleLevel: 'off', //   console verbosity APPLIED at init (default: unchanged)
  captureConsole: false, // wrap console.warn/error so existing calls are captured

  // Retention
  maxErrors: 500, //        default 500
  maxLogs: 2000, //         default 2000
  errorRetentionDays: 7, // default 7
  logRetentionDays: 3, //   default 3

  // Error capture
  errors: {
    captureCsp: true, //            record securitypolicyviolation
    captureResources: true, //      record failed <img>/<script>/<link> loads
    preventDefaultUnhandledRejection: false,
  },

  // Escape hatches
  enabled: true, //                       master switch
  consent: () => cookieConsent.analytics, // gate before every capture
  onInternalError: (stage, error) => console.warn(stage, error),
  repository: encryptedRepository, //      see section C
  env: true, //                           also read VITE_* variables
});
```

## Where each feature lives, and when you need it

| Feature | Import from | Reach for it when | In this page |
| --- | --- | --- | --- |
| `initTelemetry`, `setupTelemetry` | `@codewithrajat/rm-logvault` | Always — this is the setup | step 1, E |
| `TelemetryErrorBoundary` | `…/react` | Always — it is your fallback UI | step 2 |
| `useErrorCapture`, `reactRootErrorHandlers` | `…/react` | Handlers and async calls, React 19 roots | step 3 |
| Events | core, via `telemetry.events` | A badge, or feeding your own store | E |
| Context builders | `@codewithrajat/rm-logvault` | Classifying error shapes only your app knows | [E and beyond](./more-advanced/04-observing-and-extending.md) |
| HTTP client | `@codewithrajat/rm-logvault/http` | Your own API calls should become records | [the HTTP client](./more-advanced/05-using-the-http-client.md) |
| Auth header provider | `@codewithrajat/rm-logvault/http` | Uploads need a token | B |
| Encryption | `@codewithrajat/rm-logvault/storage` | A database dump is a threat you must answer | C |
| Export formats | core | JSONL, CSV, or a clipboard button | D |
| Sink registry | core, via `getSinkRegistry()` | Three or more sinks, and you need to list them | [observing and extending](./more-advanced/04-observing-and-extending.md) |

## Related

- [the adapter in depth](./more-advanced/01-the-react-adapter-and-testing.md) — the boundary's behaviour
  and testing it.
- [observing and extending](./more-advanced/04-observing-and-extending.md) — events, context builders,
  sink registry.
- [the HTTP client](./more-advanced/05-using-the-http-client.md) — when your own API calls should be
  records too.
- [encrypting stored records](./more-advanced/06-encrypting-stored-records.md) — the full encryption page.
- [config](./config/README.md) — every option, its unit and its default.
- [capture recipes](./basic/01-capture-recipes.md) — the four ways an error gets recorded.
