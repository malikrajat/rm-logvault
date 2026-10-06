# more-advanced — React 19

**Problem it solves:** three things the earlier tiers could not reach — the React adapter used properly
rather than minimally, the seams you replace when IndexedDB plus `fetch` is not your shape, and the
observation surface that turns a recorder into something you can build a product on.

**What you will learn:**

- `TelemetryErrorBoundary` in full: every prop, and why a function `fallback` is worth preferring.
- `reactRootErrorHandlers()` and what each of React 19's three callbacks actually means.
- `useErrorCapture()`: the stable capture function, and how its two context arguments merge.
- Testing an integration against `createMemoryRepository()` instead of a browser database.
- Which of the replaceable seams are worth the trade in a React application, and where each one lives.
- `setupTelemetry()` and the flat aliases, and the inside-out precedence rule that governs them.
- `handle.events` in a `useSyncExternalStore` badge, error context builders, and the sink registry.
- The shipped HTTP client, its auth provider, and the new JSONL / CSV export formats.
- Encrypting stored records, and why that is initialisation wiring rather than a hook.

## The adapter, in one table

Everything below is exported from `@codewithrajat/rm-logvault/react`. Nothing here exists in the core,
because all of it depends on React's own error paths.

| Export | What it is | Read |
| --- | --- | --- |
| `TelemetryErrorBoundary` | A component. Records the error **and** renders a fallback. | [the adapter](./01-the-react-adapter-and-testing.md) |
| `reactRootErrorHandlers(context?)` | React 19's three root error callbacks, wired to `captureError`. | [the adapter](./01-the-react-adapter-and-testing.md) |
| `useErrorCapture(context?)` | A stable `captureError` pre-bound with your context. | [the adapter](./01-the-react-adapter-and-testing.md) |

Which of these to reach for, and how they differ from the core's `captureError` and `withErrorCapture`,
is the subject of [the recipes and choosing between them](./03-recipes-and-deciding.md).

## The seams, for a React app

| Seam | Worth it in React? | Read |
| --- | --- | --- |
| `onInternalError` | Yes, and first. It is how you find out storage never opened. | [seams](./02-repository-transport-and-hooks.md) |
| `beforeCapture` / `beforeStore` | Yes — module-level policy, no component needed. | [seams](./02-repository-transport-and-hooks.md) |
| `rest.transport` | Yes, if your backend is not plain REST. | [seams](./02-repository-transport-and-hooks.md) |
| `repository` | Only for tests (in-memory) or a custom cleanup cadence. | [seams](./02-repository-transport-and-hooks.md) |
| `logSource` | Rarely — you would need a logger you already own. | [transport and logSource](../../vanilla/more-advanced/02-custom-transport-and-log-source.md) |

The depth on each seam is written once, in the vanilla tree, because none of it is React-specific. What
*is* React-specific is where the code goes: options live in the module that calls `initTelemetry`, so a
`beforeCapture` policy belongs there — not inside a component, where it would be re-created on every
render and could never be applied retroactively.

## Watching and teaching, rather than replacing

A second group of seams **observes** the pipeline and **teaches** it about error shapes, without replacing
any part. Observing costs nothing and can never break a capture; replacing is a guarantee you now own.

| Seam | Gives you | Read |
| --- | --- | --- |
| Flat aliases / `setupTelemetry` | The short form of the nested configuration. | [observing and extending](./04-observing-and-extending.md) |
| `handle.events` | Six events, so a badge or your own store can react to a capture. | [observing and extending](./04-observing-and-extending.md) |
| `registerErrorContextBuilder` | Classification for errors the library cannot recognise. | [observing and extending](./04-observing-and-extending.md) |
| `installBuiltinContextBuilders()` | Ready-made `timeout` / `http` / `type-error` classifiers. | [observing and extending](./04-observing-and-extending.md) |
| `getSinkRegistry()` | Listing, looking up and detaching sinks by key. | [observing and extending](./04-observing-and-extending.md) |
| `format: 'jsonl'` or `format: 'csv'` | Machine-readable and spreadsheet exports. | [observing and extending](./04-observing-and-extending.md) |

## Two optional subpaths

Both are separate entry points, so an application that does not import them pays nothing for them.

| Subpath | What it ships | Read |
| --- | --- | --- |
| `@codewithrajat/rm-logvault/http` | A `fetch` HTTP client, its contract, and auth header helpers. | [using the HTTP client](./05-using-the-http-client.md) |
| `@codewithrajat/rm-logvault/storage` | Encryption providers and a repository wrapper. | [encrypting stored records](./06-encrypting-stored-records.md) |

> **Source note.** The `/http` client is the **one** public surface in the package allowed to reject by
> design, because an HTTP client that cannot report a failure is useless. It is walled off from the capture
> path — nothing in the core imports it — so the library's own never-throw guarantee is unaffected.

## See also

- [the recipes and choosing between them](./03-recipes-and-deciding.md) — the decision table for all
  four capture paths, and how to assert each one in a test.
- [observing and extending](./04-observing-and-extending.md) — events, context builders, sinks and export
  formats.
- [using the HTTP client](./05-using-the-http-client.md) and
  [encrypting stored records](./06-encrypting-stored-records.md) — the two new subpaths.
- [config](../config/README.md) — the options these hooks sit alongside, including the flat aliases.
- [../../vanilla/more-advanced/README.md](../../vanilla/more-advanced/README.md) — the seams in depth.
- [docs/ARCHITECTURE.md](../../../docs/ARCHITECTURE.md) — how the pieces fit.
