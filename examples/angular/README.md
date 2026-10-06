# angular — Angular (standalone)

Guides for using `@codewithrajat/rm-logvault` in an Angular application that bootstraps through
`bootstrapApplication`. **Every file here is documentation.** The code lives in fenced blocks, so
there is nothing to install, build or typecheck in this directory.

Angular's framework-specific question is **placement plus one provider**: `initTelemetry` before
`bootstrapApplication`, and a single entry in the `providers` array that redirects Angular's own
`ErrorHandler` into the same pipeline. That provider is a **factory**, which is what lets the adapter
work without `emitDecoratorMetadata` — see [more-advanced](./more-advanced/README.md).

## The four tiers

| Tier | Problem it solves | What it assumes you already have |
| --- | --- | --- |
| [basic](./basic/README.md) | You want errors and logs recorded, with one call and no backend. | Nothing. This is the first thing to read. |
| [advanced](./advanced/README.md) | Records should reach a collector, and you need to decide how much is kept. | The basic integration, working. |
| [config](./config/README.md) | The same build has to behave differently per environment, without code changes. | A deployment worth configuring, and a build that can substitute values. |
| [more-advanced](./more-advanced/README.md) | You need the adapter's guarantees, a replacement store or transport, or your own `ErrorHandler`. | Everything above, and a reason to. |

## Pages in each tier

| Tier | Start here | Then |
| --- | --- | --- |
| [basic](./basic/README.md) | the integration, and the bootstrap failure no `ErrorHandler` can cover | [capture recipes](./basic/01-capture-recipes.md) — the four ways an error gets recorded |
| [advanced](./advanced/README.md) | uploads and retention | [what arrives at your collector](./advanced/02-what-arrives-at-the-collector.md) |
| [config](./config/README.md) | the options that matter, and `fileReplacements` | [environment variables](./config/01-environment-variables.md), [levels and thresholds](./config/03-levels-and-thresholds.md) |
| [more-advanced](./more-advanced/README.md) | the adapter and the replaceable seams | [the Angular adapter](./more-advanced/01-framework-adapter.md), [the recipes and choosing between them](./more-advanced/03-recipes-and-deciding.md) |

## Pages added for the observation and extension surface

Three pages in [more-advanced](./more-advanced/README.md) cover the framework-agnostic layer. They are
worth reading in this framework even though none of them is Angular-specific, because each one has an
Angular-shaped answer — a provider, an injectable service, or an injection token:

| Page | What it gives you |
| --- | --- |
| [observing and extending](./more-advanced/04-observing-and-extending.md) | `setupTelemetry` and the flat aliases, `handle.events` as an injectable service holding signals, error context builders, the sink registry, and the four export formats. |
| [using the HTTP client](./more-advanced/05-using-the-http-client.md) | The library's own `fetch` client with `onError` wired to `captureError`, its interceptors, and one auth provider feeding both it and the telemetry upload. |
| [encrypting stored records](./more-advanced/06-encrypting-stored-records.md) | AES-GCM encryption at rest, which fields are worth encrypting, and assembling the `{ errors, logs, initialize, close }` repository by hand. |

## Read them in this order

1. **[basic](./basic/README.md)** — `initTelemetry()` then `provideTelemetryErrorHandler()` in
   `bootstrapApplication`, plus the bootstrap-failure case that no `ErrorHandler` can cover. Then
   [capture recipes](./basic/01-capture-recipes.md) to see all four ways an error gets recorded.
2. **[advanced](./advanced/README.md)** — uploads, a separate endpoint per kind, retention and payload
   budgets, and a report you can download with a button. Then
   [what arrives at your collector](./advanced/02-what-arrives-at-the-collector.md) for the request body
   and how to prove delivery.
3. **[config](./config/README.md)** — the options that matter with units and defaults, and how values
   reach a browser bundle in Angular, which has no built-in environment file.
4. **[more-advanced](./more-advanced/README.md)** — the factory-provider reasoning in full, writing your
   own `ErrorHandler`, plus a custom `repository`, a custom `rest.transport`, `logSource` and the
   lifecycle hooks. Its three newer pages cover the observation surface:
   [observing and extending](./more-advanced/04-observing-and-extending.md),
   [using the HTTP client](./more-advanced/05-using-the-http-client.md) and
   [encrypting stored records](./more-advanced/06-encrypting-stored-records.md).

## What Angular changes about the integration

- **`initTelemetry` runs before `bootstrapApplication`.** The provider needs a live pipeline to report
  into, and a component that throws while bootstrapping should already be covered.
- **One provider entry replaces Angular's `ErrorHandler`** — but in the *chaining* sense: the adapter
  reports first and then calls `console.error` exactly as the default implementation does, so your
  console output is unchanged.
- **A bootstrap failure is reported by hand.** It happens before any `ErrorHandler` exists, which is
  why the `bootstrapApplication(...).catch(...)` in [basic](./basic/README.md) calls `captureError`.
- **`tsc` does not check Angular template expressions.** Only `ng build` (AOT) does, so a template that
  fails to compile is a build failure, not a type error.
- **No `@angular/forms` anywhere in these guides.** The snippets use plain `(click)` bindings.

## Conventions used in every guide

- Code blocks are `ts` for `main.ts` and component classes, `html` for templates.
- Option tables give the **unit** and the **default**, because both matter more than the name.
- A `> Source note.` block marks a place where the behaviour is narrower than the name suggests.
- Every option mentioned exists in `src/core/config.ts`; the exhaustive reference — boundaries, invalid
  values, and what happens at them — is [docs/API.md](../../docs/API.md#every-option-annotated).

## Other frameworks

The same four tiers are written for React ([../react/README.md](../react/README.md)), Vue
([../vue/README.md](../vue/README.md)), Next.js ([../nextjs/README.md](../nextjs/README.md)) and plain
TypeScript ([../vanilla/README.md](../vanilla/README.md)). The catalog, with what differs between them,
is [examples/README.md](../README.md).
