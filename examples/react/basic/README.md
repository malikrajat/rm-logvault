# basic — React 19

**Problem it solves:** you want errors and logs kept from one call, and you need to know *where* that
call goes in a React application — the window between "React started" and "the library is listening"
is exactly the window in which a first render can fail.

**What you will learn:**

- The whole integration: two imports, one `initTelemetry()` call, one boundary.
- Why the call belongs at module top level and **not** inside a component or an effect.
- The three ways a failure arrives in React, and which one React does *not* catch.
- What `reactRootErrorHandlers()` and `TelemetryErrorBoundary` each do — they are different jobs.
- Why StrictMode's double-invoke is harmless here.

## The integration

Two files' worth of code, and this is the larger of them:

```tsx
// src/main.tsx
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { initTelemetry } from '@codewithrajat/rm-logvault';
import { TelemetryErrorBoundary, reactRootErrorHandlers } from '@codewithrajat/rm-logvault/react';
import { App } from './App';

initTelemetry({ appName: 'my-app' });

createRoot(document.getElementById('root') as HTMLElement, {
  ...reactRootErrorHandlers({ tags: { shell: 'app' } }),
}).render(
  <StrictMode>
    <TelemetryErrorBoundary
      fallback={(error, reset) => (
        <div role="alert">
          <p>
            Something broke: <code>{error.message}</code>
          </p>
          <button onClick={reset} type="button">
            Try again
          </button>
        </div>
      )}
    >
      <App />
    </TelemetryErrorBoundary>
  </StrictMode>,
);
```

### Where the call goes, and why it is not in a component

`initTelemetry` is at **module top level**, before `createRoot`. Consider what happens if you put it
anywhere else:

| Placement | What goes wrong |
| --- | --- |
| Top level of the entry module (this) | Nothing. The handlers are installed before the first render exists. |
| Inside a component body | It runs during the first render — after React has already started. A throw in that same render is missed, and React 19 will call the callbacks you have not attached yet. |
| Inside `useEffect` | Worse: the effect runs **after** the first render commits, so every failure in the first render is lost. |
| After `await`-ing something (a config fetch, a feature flag) | The same window, widened by however long the request takes. |

The one exception in this repository is Next.js, where a module can be evaluated on the server too, so
the call has to be guarded by `'use client'` and moved into an effect with `destroyTelemetry` as its
cleanup. That is a trade-off forced by SSR, not a better answer for a client-only React app.

### The three ways a failure arrives

| Failure | Who catches it | Therefore |
| --- | --- | --- |
| A `throw` in an event handler | **React's dispatch, then the browser.** React 19 wraps the listener and re-reports the failure via `reportError()`, producing the `ErrorEvent` that `window.onerror` observes. | Nothing extra to do — the library's global handler records it. `onUncaughtError` does **not** fire for it. |
| A `throw` during render | React, via the root's error callbacks. | Spread `reactRootErrorHandlers()` into `createRoot`. |
| A rejected promise | `unhandledrejection`. | Nothing extra to do. |

> **Source note.** The first row is a correction to what this table said previously. An event-handler
> throw is not invisible to React 19 — React catches it and re-reports it as a global error event, which
> is why the record's `source` is `'window'` rather than `'react'`. The advice is unchanged; the reason
> is not.

```tsx
createRoot(element, {
  ...reactRootErrorHandlers({ tags: { shell: 'app' } }),
});
```

`reactRootErrorHandlers()` returns React 19's three root callbacks — `onUncaughtError`,
`onCaughtError` and `onRecoverableError` — already wired to `captureError`. Spreading it keeps them
optional, so you can add your own alongside them without losing these.

### A boundary is a separate job from reporting

`TelemetryErrorBoundary` records the error **and** decides what the user sees. That is deliberately two
responsibilities in one component, because a boundary that only records is a boundary that leaves a
blank screen behind:

```tsx
<TelemetryErrorBoundary fallback={(error, reset) => /* … */}>
  <App />
</TelemetryErrorBoundary>
```

Pass a **function** fallback, not an element, and you receive `reset`. That is what makes a real "try
again" possible without a full page reload — React 19 re-renders the subtree when you call it. An
element fallback works too, but you lose `reset`.

### The options this tier uses

| Option | Type | Default | Meaning |
| --- | --- | --- | --- |
| `appName` | `string` | none | Stamped onto every record. Set it, or a report cannot say which application produced it. |
| `context.tags` | `Record<string, string>` | none | Accepted by both `reactRootErrorHandlers()` and `TelemetryErrorBoundary`; merged into every record that adapter produces. `shell: 'app'` here, which is worth having once two apps share one collector. |

Everything else is defaulted, and the defaults that matter are the same ones as the vanilla tier:

| Defaulted behaviour | Value |
| --- | --- |
| `mode` | `'local'` — IndexedDB only, **no network requests at all** |
| `errors.retentionDays` / `maxRecords` | `7` days / `500` rows |
| `logs.retentionDays` / `maxRecords` | `3` days / `2000` rows |
| `logs.level` | `'warn'` — the **persist** threshold |
| `shortcut` | enabled, <kbd>Ctrl</kbd>+<kbd>Shift</kbd>+<kbd>Alt</kbd>+<kbd>D</kbd> |

For what each default means and when to change it, see
[vanilla/basic](../../vanilla/basic/README.md) — the reasoning is framework-independent. The
exhaustive reference is [docs/API.md](../../../docs/API.md#every-option-annotated).

### StrictMode, Fast Refresh and idempotence

`initTelemetry` is idempotent: a second call returns the existing handle and installs nothing new. That
is what makes StrictMode's deliberate double-invoke harmless here — and it is also why there is no
cleanup to write, because the call is not in an effect.

```ts
initTelemetry({ appName: 'a' });
initTelemetry({ appName: 'b' }); // returns the same handle; 'b' is ignored
```

> **Source note.** That idempotence has a consequence worth knowing before you reach for it as a
> configuration mechanism: because the second call is ignored, it is *not* how you change options at
> runtime. To apply different options you must `destroyTelemetry()` first and then re-initialise —
> which is what a settings panel has to do.

### Reading the status from a component

```tsx
const [status, setStatus] = useState(() => getTelemetryStatus());

useEffect(() => {
  const timer = setInterval(() => setStatus(getTelemetryStatus()), 1000);
  return () => clearInterval(timer);
}, []);
```

Polling once a second is cheap because `getTelemetryStatus()` reports in-memory state only and never
reads IndexedDB. Reading the vault costs an IndexedDB round-trip, which is why the status object is
built without one.

### Not covered here

`useErrorCapture()` — the hook for a handler where you already have context worth attaching — is
deliberately left to [the adapter and testing](../more-advanced/01-the-react-adapter-and-testing.md),
where the adapter is the subject.

The four ways to *make* an error happen, side by side and with the buttons to try them, are in
[capture recipes](./01-capture-recipes.md). Read that next; it is where `captureError` and
`withErrorCapture` stop being names and start being choices.

## Next

- The four capture recipes: [capture recipes](./01-capture-recipes.md).
- Uploads and retention: [advanced](../advanced/README.md).
- The same tier with no framework: [../../vanilla/basic/README.md](../../vanilla/basic/README.md).
