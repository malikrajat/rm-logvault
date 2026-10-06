# nextjs — Next.js App Router

Guides for using `@codewithrajat/rm-logvault` in a Next.js application that uses the App Router.
**Every file here is documentation.** The code lives in fenced blocks, so there is nothing to install,
build or typecheck in this directory.

Next.js's framework-specific question is the **client/server boundary**. Modules are evaluated on the
server too, where there is no `window`, no `document` and no IndexedDB, so `initTelemetry` cannot sit
at module top level. Importing is always safe; initializing is not.

## The four tiers

| Tier | Problem it solves | What it assumes you already have |
| --- | --- | --- |
| [basic](./basic/README.md) | You want errors and logs recorded, with one call and no backend. | Nothing. This is the first thing to read. |
| [advanced](./advanced/README.md) | Records should reach a collector, and you need to decide how much is kept. | The basic integration, working. |
| [config](./config/README.md) | The same build has to behave differently per environment, without code changes. | A deployment worth configuring, and a `NEXT_PUBLIC_` convention you follow. |
| [more-advanced](./more-advanced/README.md) | You need the SSR boundary's guarantees, or to replace the store or the transport. | Everything above, and a reason to. |

## Pages in each tier

| Tier | Start here | Then |
| --- | --- | --- |
| [basic](./basic/README.md) | the `'use client'` provider and the SSR rule | [capture recipes](./basic/01-capture-recipes.md) — the four ways an error gets recorded on the client |
| [advanced](./advanced/README.md) | uploads, retention and a route handler as the collector | [what arrives at your collector](./advanced/02-what-arrives-at-the-collector.md) |
| [config](./config/README.md) | the options that matter and the `NEXT_PUBLIC_` prefix rule | [environment variables](./config/01-environment-variables.md), [levels and thresholds](./config/03-levels-and-thresholds.md) |
| [more-advanced](./more-advanced/README.md) | the server boundary and the replaceable seams | [the server boundary](./more-advanced/01-framework-adapter.md), [the recipes and choosing between them](./more-advanced/03-recipes-and-deciding.md), [observing and extending](./more-advanced/04-observing-and-extending.md), [the HTTP client](./more-advanced/05-using-the-http-client.md), [encrypting stored records](./more-advanced/06-encrypting-stored-records.md) |

## Read them in this order

1. **[basic](./basic/README.md)** — a `'use client'` provider that calls `initTelemetry` in an effect and
   returns `destroyTelemetry` as its cleanup, plus a server component that logs harmlessly. Then
   [capture recipes](./basic/01-capture-recipes.md) to see all four ways a client error gets recorded.
2. **[advanced](./advanced/README.md)** — uploads, a separate endpoint per kind, retention and payload
   budgets, and a report you can download with a button. Then
   [what arrives at your collector](./advanced/02-what-arrives-at-the-collector.md) for the request body
   and how to prove delivery.
3. **[config](./config/README.md)** — the options that matter with units and defaults, and the
   `NEXT_PUBLIC_` prefix rule that decides which variables reach the browser at all.
4. **[more-advanced](./more-advanced/README.md)** — what a server import really does, plus a custom
   `repository`, a custom `rest.transport`, `logSource` and the hooks. Then the observation surface
   ([events, context builders, sinks and export formats](./more-advanced/04-observing-and-extending.md)),
   the [fetch client with interceptors and auth](./more-advanced/05-using-the-http-client.md), and
   [encryption at rest](./more-advanced/06-encrypting-stored-records.md).

## Which page depending on what you want

| You want to… | Read |
| --- | --- |
| See how many errors were captured, in the UI | [observing and extending](./more-advanced/04-observing-and-extending.md) — `handle.events` |
| Classify `code: 'ALARM_NOT_FOUND'` as a domain error | [observing and extending](./more-advanced/04-observing-and-extending.md) — `registerErrorContextBuilder` |
| Export JSONL for `jq`, or CSV for a spreadsheet | [observing and extending](./more-advanced/04-observing-and-extending.md) — `format: 'jsonl' \| 'csv'` |
| Write one interceptor that captures every API failure | [the HTTP client](./more-advanced/05-using-the-http-client.md) |
| Use one token for both your API calls and telemetry uploads | [the HTTP client](./more-advanced/05-using-the-http-client.md) — `createAuthHeaderProvider` |
| Keep error messages unreadable in IndexedDB | [encrypting stored records](./more-advanced/06-encrypting-stored-records.md) |
| Shorten a nested config without changing behaviour | [observing and extending](./more-advanced/04-observing-and-extending.md) — `setupTelemetry` and the flat aliases |

## What Next.js changes about the integration

- **Importing is safe on the server; initializing is not.** Every browser entry point is guarded, so a
  server import is a no-op that buffers at most one message.
- **The call goes in an effect inside a `'use client'` component.** An effect only runs in the browser,
  which is exactly the condition `initTelemetry` needs.
- **Return the cleanup.** React StrictMode runs effects twice in development and Fast Refresh re-runs
  them; returning `destroyTelemetry` is what stops one installation becoming two. `initTelemetry` is
  idempotent, so a missed cleanup would not duplicate records — it would return the *existing* handle
  and silently ignore your options, which is worse to debug.
- **An error thrown during a server render is not captured.** There is no browser. Next's own error
  overlay and server logs are the right tools there.
- **A `logger.*` call from a server component is not replayed into the browser.** The
  pre-initialisation buffer is created per logger instance, in the runtime that created it, and there is
  no hydration or serialisation channel for it — so a server-side call prints on the server and its
  buffered entry is discarded with that process. The buffer exists for a *client* call made before the
  provider's effect, which is stored with its original level and message.

## Conventions used in every guide

- Code blocks are `tsx` for components and `ts` for everything else.
- Option tables give the **unit** and the **default**, because both matter more than the name.
- A `> Source note.` block marks a place where the behaviour is narrower than the name suggests.
- Every option mentioned exists in `src/core/config.ts`; the exhaustive reference — boundaries, invalid
  values, and what happens at them — is [docs/API.md](../../docs/API.md#every-option-annotated).

## Other frameworks

The same four tiers are written for React ([../react/README.md](../react/README.md)), Vue
([../vue/README.md](../vue/README.md)), Angular ([../angular/README.md](../angular/README.md)) and plain
TypeScript ([../vanilla/README.md](../vanilla/README.md)). The catalog, with what differs between them,
is [examples/README.md](../README.md).
