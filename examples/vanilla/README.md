# vanilla — plain TypeScript

Guides for using `@codewithrajat/rm-logvault` with no framework at all: plain TypeScript in a
Vite-style application. **Every file here is documentation.** The code lives in fenced blocks, so there
is nothing to install, build or typecheck in this directory.

The library is framework-agnostic, which makes this the reference tree. The other frameworks change
*where* the call goes and which hooks feed it — not what the library does.

## The four tiers

| Tier | Problem it solves | What it assumes you already have |
| --- | --- | --- |
| [basic](./basic/README.md) | You want errors and logs recorded, with one call and no backend. | Nothing. This is the first thing to read. |
| [advanced](./advanced/README.md) | Records should reach a collector, and you need to decide how much is kept. | The basic integration, working. |
| [config](./config/README.md) | You need the whole switchboard: every option, its unit and its default, plus a build-time environment layer. | A deployment worth configuring. |
| [more-advanced](./more-advanced/README.md) | "IndexedDB plus `fetch`" is not the shape of your deployment, and you want to replace a part. | Everything above, and a reason to. |

## Pages in each tier

| Tier | Start here | Then |
| --- | --- | --- |
| [basic](./basic/README.md) | the one call, and where it goes | [capture recipes](./basic/01-capture-recipes.md) — the four ways an error gets recorded |
| [advanced](./advanced/README.md) | uploads, retention and budgets | [the outbox](./advanced/01-the-outbox.md), [retention and payload budgets](./advanced/02-retention-and-payload-budgets.md), [what arrives at your collector](./advanced/02-what-arrives-at-the-collector.md) |
| [config](./config/README.md) | the full option surface | [options at a glance](./config/01-options-at-a-glance.md), [environment variables](./config/02-environment-variables.md), [levels and thresholds](./config/03-levels-and-thresholds.md) |
| [more-advanced](./more-advanced/README.md) | the replaceable seams, indexed | [custom repository](./more-advanced/01-custom-repository.md), [transport and logSource](./more-advanced/02-custom-transport-and-log-source.md), [hooks and automation](./more-advanced/03-lifecycle-hooks-and-automation.md), [the recipes and choosing between them](./more-advanced/03-recipes-and-deciding.md) |

## Read them in this order

1. **[basic](./basic/README.md)** — one `initTelemetry()` call, three ways a real failure arrives, one
   line of status. Works with no backend and no configuration. Then
   [capture recipes](./basic/01-capture-recipes.md) to see all four ways an error gets recorded.
2. **[advanced](./advanced/README.md)** — uploads, a separate endpoint per kind, retention and payload
   budgets, and a report you can download with a button. Then
   [what arrives at your collector](./advanced/02-what-arrives-at-the-collector.md) for the request body
   and how to prove delivery.
3. **[config](./config/README.md)** — the full option surface with units and defaults, the environment
   variables, and the precedence rule that decides which value wins.
4. **[more-advanced](./more-advanced/README.md)** — a custom `repository`, a custom `rest.transport`,
   `logSource`, the `beforeCapture`/`beforeStore` hooks, and lifecycle automation.

## Conventions used in every guide

- Code blocks are `ts` unless the file is JSX (`tsx`).
- Option tables give the **unit** and the **default**, because both matter more than the name.
- A `> Source note.` block marks a place where the behaviour is narrower than the name suggests.
- Every option mentioned exists in `src/core/config.ts`; the exhaustive reference — boundaries, invalid
  values, and what happens at them — is [docs/API.md](../../docs/API.md#every-option-annotated).

## Other frameworks

The same four tiers are written for React ([../react/README.md](../react/README.md)), Vue, Angular and
Next.js. The catalog, with what differs between them, is [examples/README.md](../README.md).
