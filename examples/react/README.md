# react — React 19

Guides for using `@codewithrajat/rm-logvault` in a React 19 application. These are Markdown files
only: the code is in fenced blocks, so there is nothing to install, build or typecheck in this
directory.

React is the one framework here with its own **adapter subpath**, `@codewithrajat/rm-logvault/react`,
because React gives you capture points the global handlers cannot see — render errors, caught by the
root's error callbacks rather than by `window.onerror`.

> **Setting this up for the first time? Read [START-HERE.md](./START-HERE.md).** It is a linear guide —
> four steps, two files — that goes from nothing to a working integration with a real fallback UI, then
> adds a token, encryption and the report formats as separate, optional changes. It is shorter and more
> concrete than the tiers below, which are references rather than walkthroughs.

## The four tiers

| Tier | Problem it solves | What it assumes you already have |
| --- | --- | --- |
| [**START-HERE**](./START-HERE.md) | "I just want it working, and I want to see the fallback UI." | **Nothing. Read this one first.** |
| [basic](./basic/README.md) | Errors and logs recorded from one call — and the answer to *where* that call goes in a React 19 app. | Nothing, though START-HERE is the gentler entry. |
| [advanced](./advanced/README.md) | Records reach a collector, retention is a decision rather than a default, and the report is downloadable without a keyboard. | The basic integration, working. |
| [config](./config/README.md) | The whole switchboard for a React deployment: options, units, defaults, and a build-time environment layer. | A deployment worth configuring. |
| [more-advanced](./more-advanced/README.md) | The adapter in depth — the error boundary, `useErrorCapture`, the testing helper — plus the seams you can replace, observe and extend. | Everything above, and a reason to. |

## Pages in each tier

| Tier | Start here | Then |
| --- | --- | --- |
| [basic](./basic/README.md) | the integration, in one block | [capture recipes](./basic/01-capture-recipes.md) — the four ways an error gets recorded |
| [advanced](./advanced/README.md) | uploads and retention | [what arrives at your collector](./advanced/02-what-arrives-at-the-collector.md), [export and manual sync](./advanced/01-export-and-manual-sync.md) |
| [config](./config/README.md) | the options that matter | [environment variables](./config/01-environment-variables.md), [levels and thresholds](./config/03-levels-and-thresholds.md) |
| [more-advanced](./more-advanced/README.md) | the adapter, indexed | [the adapter and testing](./more-advanced/01-the-react-adapter-and-testing.md), [the seams](./more-advanced/02-repository-transport-and-hooks.md), [the recipes and choosing between them](./more-advanced/03-recipes-and-deciding.md), [observing and extending](./more-advanced/04-observing-and-extending.md), [using the HTTP client](./more-advanced/05-using-the-http-client.md), [encrypting stored records](./more-advanced/06-encrypting-stored-records.md) |

## Read them in this order

0. **[START-HERE](./START-HERE.md)** — the linear setup: `initTelemetry` in one file, the boundary and
   its fallback in another, then the optional additions (token, encryption, report formats) one at a
   time. If you are new to the library, this is the page to read and the tiers below are references.
1. **[basic](./basic/README.md)** — `initTelemetry`, the root error handlers, an error boundary, and
   why the call is *not* in a component. Then
   [capture recipes](./basic/01-capture-recipes.md) to see all four ways an error gets recorded.
2. **[advanced](./advanced/README.md)** — the same structure with uploads turned on, plus the button
   that replaces <kbd>Ctrl</kbd>+<kbd>Shift</kbd>+<kbd>Alt</kbd>+<kbd>D</kbd>. Then
   [what arrives at your collector](./advanced/02-what-arrives-at-the-collector.md) for the request body
   and the three ways to prove a record was delivered.
3. **[config](./config/README.md)** — every option with its unit and default, the environment
   variables (Vite's `VITE_` prefix in this tree), and precedence. Then
   [levels and thresholds](./config/03-levels-and-thresholds.md) if a log line is not appearing where
   you expect it.
4. **[more-advanced](./more-advanced/README.md)** — `TelemetryErrorBoundary`, `reactRootErrorHandlers`,
   `useErrorCapture`, `createMemoryRepository`, and the replaceable parts. Then
   [the recipes and choosing between them](./more-advanced/03-recipes-and-deciding.md) for the decision
   table that puts all of it together.
5. **Beyond the recorder**, in this order:
   [observing and extending](./more-advanced/04-observing-and-extending.md) (events, context builders,
   sinks, export formats) → [using the HTTP client](./more-advanced/05-using-the-http-client.md) →
   [encrypting stored records](./more-advanced/06-encrypting-stored-records.md). The first is needed to
   follow the other two, and all three are optional.

## What is React-specific here, and what is not

Only three things differ from the vanilla tree, and they are all about *placement*:

| Concern | Vanilla | React |
| --- | --- | --- |
| Where `initTelemetry` goes | First line of the entry module | First line of the entry module, before `createRoot` — **not** in a component or an effect |
| Render errors | n/a — a render error is a normal synchronous throw | Caught by React, so the root's error callbacks need `reactRootErrorHandlers()` |
| What the user sees after a crash | Nothing; the page is simply broken | `TelemetryErrorBoundary` renders a fallback and offers `reset()` |

Everything else is the core library, identically. The core concepts — mode, retention, payload
budgets, the environment layer — are explained at length in the vanilla tree; each React tier links to
the matching vanilla page rather than repeating it.

## Conventions used in every guide

- Code blocks are `tsx` when they contain JSX, `ts` otherwise.
- Option tables give the **unit** and the **default**.
- A `> Source note.` block marks a place where the behaviour is narrower than the name suggests.
- Every option mentioned exists in `src/core/config.ts`; the exhaustive reference is
  [docs/API.md](../../docs/API.md#every-option-annotated).
- Import specifiers are the core entry unless the line says otherwise. The two optional subpaths are
  `@codewithrajat/rm-logvault/http` and `@codewithrajat/rm-logvault/storage`, and importing them is always
  a deliberate choice — an application that does not use them pays nothing for them.

## Other frameworks

The same four tiers are written for vanilla TypeScript ([../vanilla/README.md](../vanilla/README.md)),
Vue, Angular and Next.js. The catalog, with what differs between them, is
[examples/README.md](../README.md).
