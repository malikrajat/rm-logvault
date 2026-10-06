# The React adapter and testing

**Problem it solves:** the adapter has three exports and they are easy to use in the wrong combination —
a boundary instead of root handlers, or root handlers instead of a boundary. And once an integration
exists, you need to test it without a browser database.

## `TelemetryErrorBoundary`

| Prop | Type | Default | Notes |
| --- | --- | --- | --- |
| `children` | `ReactNode` | none | The subtree being protected. |
| `fallback` | `ReactNode \| ((error: Error, reset: () => void) => ReactNode)` | none | What to render after a crash. A **function** receives `reset`. |
| `onError` | `(error: Error, info: ErrorInfo) => void` | none | Called as well as recording — for your own reporting, not instead of it. |
| `context` | `ErrorContext` | none | Merged into the recorded record, same shape as `captureError`'s context. |

```tsx
<TelemetryErrorBoundary
  context={{ tags: { area: 'checkout' } }}
  onError={(error, info) => {
    // Optional: the library has already recorded it; this is for your own side-channel.
  }}
  fallback={(error, reset) => (
    <div role="alert">
      <p>Checkout is broken: {error.message}</p>
      <button onClick={reset} type="button">
        Try again
      </button>
    </div>
  )}
>
  <Checkout />
</TelemetryErrorBoundary>
```

**Prefer the function form.** An element fallback renders correctly but there is no way to obtain
`reset`, so the only recovery left to the user is a full page reload. With a function you get `reset`,
which re-renders the subtree — that is the difference between a visible failure and a usable one.

`onError` is additive. Recording already happened; this is where you would also send the error somewhere
the library does not know about.

## `reactRootErrorHandlers(context?)`

React 19 lets the **root** receive errors, which is why these exist: a render error never reaches
`window.onerror`, because React catches it first. Spread the result into `createRoot`:

```tsx
createRoot(element, {
  ...reactRootErrorHandlers({ tags: { shell: 'app' } }),
});
```

The returned object is React 19's three callbacks, each wired to the vault:

| Callback | React calls it when | In practice |
| --- | --- | --- |
| `onUncaughtError` | An error escapes every boundary. | The page is probably broken. Nothing rendered a fallback, which is itself worth knowing. |
| `onCaughtError` | A boundary handled the error. | Filed for completeness, with the component stack. |
| `onRecoverableError` | React recovered on its own — a hydration mismatch is the classic case. | Easy to miss entirely without this hook, and often the first sign of an SSR/CSR divergence. |

Because it is a spread, you can add your own callbacks beside them:

```tsx
createRoot(element, {
  ...reactRootErrorHandlers(),
  onUncaughtError: (error, info) => {
    // …yours, in addition.
  },
});
```

> **Source note.** Spread **after** your own callbacks if you want the library's version to win, and
> **before** them if you want yours to. Two objects with the same keys is an ordinary JavaScript
> last-wins situation, and the order in this snippet means yours runs instead of the library's for
> `onUncaughtError`, which is rarely what you want. Put `...reactRootErrorHandlers()` last.

## `useErrorCapture(context?)`

```tsx
import { useErrorCapture } from '@codewithrajat/rm-logvault/react';

function Checkout() {
  const capture = useErrorCapture({ tags: { flow: 'checkout' } });

  return (
    <button
      type="button"
      onClick={() => {
        try {
          pay();
        } catch (error) {
          capture(error);
        }
      }}
    >
      Pay
    </button>
  );
}
```

The returned function is `(error: unknown, extra?: ErrorContext) => void` and the two contexts merge
**one level deep**, with `extra` winning:

```ts
capture(error, { extra: { step: 'confirm' } });
// recorded with extra: { step: 'confirm' } — merged in alongside the bound context

capture(error, { tags: { step: 'confirm' } });
// recorded with tags: { step: 'confirm' } — the whole `tags` key was REPLACED
```

> **Source note.** The merge is a shallow spread, `{ ...context, ...extra }`, so `extra` replaces a key
> rather than merging into it. `tags`, `extra`, `source` and `severity` are all whole values: passing
> `tags` in the second argument **replaces** the tags bound at the hook, and it does not merge tag by
> tag. List every tag you want in the call that needs them.

Use it when you have context worth attaching at the point of failure — an order id, a step name — that
the library cannot discover on its own. For a plain throw, the global handler is already doing the job
and you do not need the hook.

### Which one do I use?

| Situation | Use |
| --- | --- |
| You want the app not to white-screen | `TelemetryErrorBoundary` |
| A render error should be recorded even with no boundary in the tree | `reactRootErrorHandlers()` — and in practice, both |
| You are catching an error yourself and want context attached | `useErrorCapture()` |
| You just want an error recorded | Nothing. `window.onerror` handles it. |

## Testing an integration

`createMemoryRepository()` from `@codewithrajat/rm-logvault/testing` is the documented path — it is what
the library's own suite runs on:

```ts
import { afterEach, expect, it } from 'vitest';
import { destroyTelemetry, flushTelemetry, initTelemetry } from '@codewithrajat/rm-logvault';
import { createMemoryRepository } from '@codewithrajat/rm-logvault/testing';

afterEach(() => {
  destroyTelemetry();
});

it('records a render failure', async () => {
  const repository = createMemoryRepository();

  // `shortcut: false` stops the test installing a keydown listener.
  initTelemetry({ appName: 'test-app', repository, shortcut: false });

  render(<TelemetryErrorBoundary fallback={<p>broken</p>}>{<Boom />}</TelemetryErrorBoundary>);
  await flushTelemetry();

  expect(repository.errors.all()).toHaveLength(1);
});
```

Four things make this work:

- **No IndexedDB.** The repository is in memory, so there is no `fake-indexeddb` dependency and no
  partial browser implementation to work around.
- **`shortcut: false`.** Without it, each test installs a `keydown` listener on `document`.
- **`destroyTelemetry()` in `afterEach`.** Initialisation is idempotent, so a second test in the same
  file would otherwise reuse the first test's setup and fail confusingly.
- **`await flushTelemetry()` before asserting.** Writes are batched; the flush is what makes the
  assertion deterministic rather than flaky.

## Related

- [more-advanced](./README.md) — the seams, and which are worth it.
- [basic](../basic/README.md) — the minimal integration this page elaborates on.
- [docs/API.md](../../../docs/API.md#subpath-adapters) — the adapter reference.
