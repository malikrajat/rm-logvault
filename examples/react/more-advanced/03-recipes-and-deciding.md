# The recipes, the adapter, and choosing between them

**Problem it solves:** you now have four ways to get an error recorded and three adapter exports, and
picking the wrong one produces either a hole in your coverage or a duplicate you did not expect. This
page is the decision, written out once, with the four recipes from
[basic](../basic/01-capture-recipes.md) finally placed in their real home — plus how to assert any of it
in a test instead of clicking buttons and squinting at a report.

**What you will learn:**

- The complete `main.tsx` that makes every recipe work, in one block.
- A decision table: which capture path for which situation, and why.
- The one thing `withErrorCapture` does that the adapter's hook does not — re-throw.
- Two source-level corrections to the adapter page, both of which change what you should write.

## The complete setup, once

Every recipe on this page works with exactly this, and nothing else:

```tsx
// src/main.tsx
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { initTelemetry } from '@codewithrajat/rm-logvault';
import { TelemetryErrorBoundary, reactRootErrorHandlers } from '@codewithrajat/rm-logvault/react';
import { App } from './App';

initTelemetry({ appName: 'my-app' }); // top level, before createRoot

createRoot(document.getElementById('root') as HTMLElement, {
  ...reactRootErrorHandlers({ tags: { shell: 'app' } }),
}).render(
  <StrictMode>
    <TelemetryErrorBoundary
      context={{ tags: { shell: 'app' } }}
      fallback={(error, reset) => (
        <div role="alert">
          <p>Something broke: <code>{error.message}</code></p>
          <button onClick={reset} type="button">Try again</button>
        </div>
      )}
    >
      <App />
    </TelemetryErrorBoundary>
  </StrictMode>,
);
```

## Which one do I use?

| Situation | Use | Why not the others |
| --- | --- | --- |
| You want the app not to white-screen | `TelemetryErrorBoundary` | It is the only one that renders a fallback and offers `reset`. |
| A render error should be recorded with no boundary in the tree | `reactRootErrorHandlers()` | `window.onerror` never sees a render throw — React caught it first. |
| Something threw and you want it recorded | **Nothing** | The global path already has it, with the stack. |
| Something threw and the automatic record lacks context | `withErrorCapture` (keep the throw) or `useErrorCapture` (stop it) | The automatic record cannot know your order id. |
| You caught a failure and the user is fine | `captureError(error, ctx)` | It reports and returns instead of throwing. |
| You want to report a wrong-but-not-fatal state | `captureError(error, ctx)` | Nothing was thrown to capture. |

The first two rows are additive: you want **both** the boundary and the root handlers, because they
cover different failures — a boundary only helps where you placed it, and the root handlers are the only
way to hear about a render error that escaped every boundary.

## The two "capture and throw" options

This is the distinction worth getting right, because both look like the same idea:

| | `withErrorCapture(handler, ctx)` | `useErrorCapture(ctx)` |
| --- | --- | --- |
| Lives in | The core package | The React adapter |
| Re-throws? | **Yes** — same value, so your `catch` still runs | **No** — it swallows |
| Default `source` | `'event-handler'` | Whatever the caller passes |
| Shape | A function you call with a callback | A hook returning `capture(error, extra?)` |
| Best for | Preserving existing error behaviour while adding context | A handler where a re-throw would only add noise |

If you are unsure, prefer `useErrorCapture`. A re-thrown event-handler error surfaces as a console error
on every click, and the record is produced either way:

```tsx
import { useErrorCapture } from '@codewithrajat/rm-logvault/react';

export function PayButton() {
  const capture = useErrorCapture({ tags: { flow: 'checkout' } });

  return (
    <button
      type="button"
      onClick={() => {
        try {
          pay();
        } catch (error) {
          capture(error); // recorded, and the click handler ends quietly
        }
      }}
    >
      Pay
    </button>
  );
}
```

## Correction 1 — `useErrorCapture` merges shallowly, not field by field

The adapter page says the two context arguments "merge, with `extra` winning", and its example implies
tags are combined. The source does a shallow spread — `{ ...context, ...extra }` — so **a key you pass in
`extra` replaces the whole value**, and `tags` is one such key:

```ts
const capture = useErrorCapture({ tags: { flow: 'checkout' } });

capture(error, { tags: { step: 'confirm' } });
// recorded tags: { step: 'confirm' }   ← `flow` is gone: the whole key was replaced

capture(error, { tags: { flow: 'checkout', step: 'confirm' } });
// recorded tags: { flow: 'checkout', step: 'confirm' }   ← list every tag you want
```

`source`, `severity` and `extra` behave the same way. This is not a bug in the merge — it is a shallow
spread doing exactly what a shallow spread does — but it is the difference between the tags you think
you have and the tags you actually have, so write the spread explicitly when you want to add to a tag
set rather than replace it.

## Correction 2 — React does see your event-handler throw

The adapter page and [basic](../basic/README.md) both state that an event-handler throw is "not React"
and simply "reaches `window.onerror`". On React 19 that is not accurate. React wraps every listener it
dispatches and re-reports a failure through the platform's `reportError()`, which produces the same
`ErrorEvent` that `window.onerror` observes.

What this changes in practice: **nothing about what you write, and something about what you should
expect.**

| Expectation | Reality |
| --- | --- |
| "The record exists" | True — the global handler sees React's re-report. |
| "`onUncaughtError` fires for an event-handler throw" | **False** — it fires for errors that escape *rendering*, not for dispatch. |
| "The stack will point at my handler" | True, and `source` is `'window'` rather than `'react'`. |
| "A re-thrown handler error is silent" | **False** — React logs it, which is why `useErrorCapture` is often the better choice. |

The practical guidance in both pages survives: you need nothing extra for an event-handler throw. Only
the reason was wrong, and the reason matters here because it is what tells you which of React's four
error paths will label a record `source: 'react'` and which will not.

## Testing it without a browser database

`createMemoryRepository()` from `@codewithrajat/rm-logvault/testing` is the documented path, and it is
what makes all of the above assertable. Four details make the difference between a deterministic test
and a flaky one:

```ts
import { afterEach, expect, it } from 'vitest';
import { destroyTelemetry, flushTelemetry, initTelemetry } from '@codewithrajat/rm-logvault';
import { createMemoryRepository } from '@codewithrajat/rm-logvault/testing';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

afterEach(() => {
  destroyTelemetry();
});

it('records an event-handler throw with its tags', async () => {
  const repository = createMemoryRepository();

  // `shortcut: false` stops the test installing a keydown listener on `document`.
  initTelemetry({ appName: 'test-app', repository, shortcut: false });

  render(<PayButton />);
  await userEvent.click(screen.getByRole('button', { name: 'Pay' }));

  await flushTelemetry(); // writes are batched; without this the assertion races

  const [record] = repository.errors.all();
  expect(record?.message).toBe('[checkout] payment failed');
  expect(record?.tags).toEqual({ flow: 'checkout' });
  expect(record?.source).toBe('event-handler');
});
```

Why each line is there:

| Line | Reason |
| --- | --- |
| `createMemoryRepository()` | No IndexedDB, no `fake-indexeddb` dependency, no partial browser implementation. |
| `shortcut: false` | Otherwise every test installs a `keydown` listener on `document`. |
| `destroyTelemetry()` in `afterEach` | Initialisation is idempotent, so a second test would otherwise reuse the first one's setup and fail confusingly. |
| `await flushTelemetry()` | Writes are batched; the flush is what makes the assertion deterministic. |

The same harness tests the boundary and the render path — render a component that throws, then assert
one record with `source: 'react'`:

```tsx
it('records a render failure through the boundary', async () => {
  const repository = createMemoryRepository();
  initTelemetry({ appName: 'test-app', repository, shortcut: false });

  render(
    <TelemetryErrorBoundary fallback={<p>broken</p>}>
      <Boom />
    </TelemetryErrorBoundary>,
  );
  await flushTelemetry();

  expect(repository.errors.all()).toHaveLength(1);
  expect(repository.errors.all()[0]?.source).toBe('react');
});
```

## A checklist for a new capture site

1. Would the automatic path already catch it? If yes, write nothing — and tag it via the adapter's
   `context` if it needs identifying.
2. Is it a render failure? It needs `reactRootErrorHandlers()` or a boundary, because nothing else sees
   it.
3. Do you need context the library cannot discover? Add it at the capture site, with `tags` for grouping
   and `extra` for values.
4. Does the error need to keep propagating? `withErrorCapture` re-throws; `useErrorCapture` does not.
5. Can you assert it? A memory repository turns "I clicked the button and it looked right" into a test
   that fails when the integration regresses.

## Related

- [the adapter and testing](./01-the-react-adapter-and-testing.md) — the two corrections above, applied.
- [the seams](./02-repository-transport-and-hooks.md) — where each option belongs in a React codebase.
- [the capture recipes](../basic/01-capture-recipes.md) — the four recipes these decisions are about.
