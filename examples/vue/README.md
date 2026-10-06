# vue — Vue 3

Guides for using `@codewithrajat/rm-logvault` in a Vue 3 application. **Every file here is
documentation.** The code lives in fenced blocks, so there is nothing to install, build or typecheck
in this directory.

Vue's framework-specific question is **placement**, and it comes with one constraint that shapes the
adapter: Vue permits exactly one `app.config.errorHandler`. Installing a second one silently discards
the first, so the adapter **chains** the handler you already have instead of replacing it.

## The four tiers

| Tier | Problem it solves | What it assumes you already have |
| --- | --- | --- |
| [basic](./basic/README.md) | You want errors and logs recorded, with one call and no backend. | Nothing. This is the first thing to read. |
| [advanced](./advanced/README.md) | Records should reach a collector, and you need to decide how much is kept. | The basic integration, working. |
| [config](./config/README.md) | The same build has to behave differently per environment, without code changes. | A deployment worth configuring. |
| [more-advanced](./more-advanced/README.md) | "IndexedDB plus `fetch`" is not the shape of your deployment, and you want to replace a part. | Everything above, and a reason to. |

## Pages in each tier

| Tier | Start here | Then |
| --- | --- | --- |
| [basic](./basic/README.md) | the three lines, in order, and why the order matters | [capture recipes](./basic/01-capture-recipes.md) — the four ways an error gets recorded |
| [advanced](./advanced/README.md) | uploads and retention | [what arrives at your collector](./advanced/02-what-arrives-at-the-collector.md) |
| [config](./config/README.md) | the options that matter | [environment variables](./config/01-environment-variables.md), [levels and thresholds](./config/03-levels-and-thresholds.md) |
| [more-advanced](./more-advanced/README.md) | the adapter and the replaceable seams | [the Vue adapter](./more-advanced/01-framework-adapter.md), [observing and extending](./more-advanced/04-observing-and-extending.md), [the HTTP client](./more-advanced/05-using-the-http-client.md), [encrypting stored records](./more-advanced/06-encrypting-stored-records.md), [the recipes and choosing between them](./more-advanced/03-recipes-and-deciding.md) |

## Read them in this order

1. **[basic](./basic/README.md)** — `initTelemetry()` then `createTelemetryVuePlugin()` then `mount()`,
   in that order, and why the order is not cosmetic. Then
   [capture recipes](./basic/01-capture-recipes.md) to see all four ways an error gets recorded.
2. **[advanced](./advanced/README.md)** — uploads, a separate endpoint per kind, retention and payload
   budgets, and a report you can download with a button. Then
   [what arrives at your collector](./advanced/02-what-arrives-at-the-collector.md) for the request body
   and how to prove delivery.
3. **[config](./config/README.md)** — the options that matter with units and defaults, the `VITE_`
   environment layer, and the precedence rule that decides which value wins.
4. **[more-advanced](./more-advanced/README.md)** — the Vue adapter in depth, plus a custom
   `repository`, a custom `rest.transport`, `logSource` and the lifecycle hooks.
5. **Then the three pages that are not about replacing anything** — observing and extending, the
   shipped HTTP client, and encryption at rest. Nothing on them swaps out a part of the library.

## Beyond the four tiers

Three pages in [more-advanced](./more-advanced/README.md) cover features that are not really about
"going deeper" — they are additions you may want on day one:

| Page | Problem it solves | Read it when |
| --- | --- | --- |
| [Observing and extending](./more-advanced/04-observing-and-extending.md) | A recorder that only writes to disk is hard to build a product on. | You want an error badge, your own classification rules, or a shorter configuration. |
| [The shipped HTTP client](./more-advanced/05-using-the-http-client.md) | Every team writes the same interceptor: status, timeout, retryable, token. | You want one HTTP client that reports through the library, with a documented auth seam. |
| [Encrypting stored records](./more-advanced/06-encrypting-stored-records.md) | Redaction runs before writing, but read access to the origin's storage is a different threat. | You want a second layer at rest, and you know what it does and does not buy you. |

## What Vue changes about the integration

- **`initTelemetry` runs once, in `main.ts`, before `mount()`.** A component that throws during the
  initial mount should already be inside the reporting pipeline.
- **The plugin installs the hooks** — `createApp(App).use(createTelemetryVuePlugin())`.
- **A throw inside an event handler, lifecycle hook or render function** reaches
  `app.config.errorHandler` with `source: 'vue'`, and the failing hook is recorded in
  `extra.vueInfo`. Vue's own warnings go through `warnHandler` and are recorded as warnings.
- **A rejected promise is not Vue's** — it arrives through `unhandledrejection`, outside any component.
- **Do not move the call into a component.** It would run per instance, and because `initTelemetry` is
  idempotent the second call returns the *existing* handle and ignores your options.
- **Subscribe to `handle.events` after `initTelemetry` has returned.** Events ride on the live
  installation, so a subscription made before it is a silent no-op — the unsubscribe function comes back
  and the listener is never called. `onMounted` is a safe place; so is the line after the init call.

## Conventions used in every guide

- Code blocks are `ts` for `main.ts` and `vue` for single-file components.
- Option tables give the **unit** and the **default**, because both matter more than the name.
- A `> Source note.` block marks a place where the behaviour is narrower than the name suggests.
- Every option mentioned exists in `src/core/config.ts`; the exhaustive reference — boundaries, invalid
  values, and what happens at them — is [docs/API.md](../../docs/API.md#every-option-annotated).

## Other frameworks

The same four tiers are written for React ([../react/README.md](../react/README.md)), Angular
([../angular/README.md](../angular/README.md)), Next.js ([../nextjs/README.md](../nextjs/README.md))
and plain TypeScript ([../vanilla/README.md](../vanilla/README.md)). The catalog, with what differs
between them, is [examples/README.md](../README.md).
