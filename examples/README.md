# Examples

Implementation guides for `@codewithrajat/rm-logvault`, organised by framework and then by how deep
you want to go.

**These are guides, not applications.** There is nothing to install, build or run: every directory
here contains Markdown, and the code lives in fenced blocks you copy into your own project. That is
deliberate — an example app for each of five frameworks would mean five more toolchains to install,
five more builds to break, and a snippet you still have to find inside it.

**In a hurry, or new to the library?** Read
[React: a complete integration, in order](react/START-HERE.md) even if you do not use React. It is the
one page written as a **sequence** rather than a reference — four steps from nothing to a working setup
with a real fallback UI, then the token, encryption and report-format additions as separate, optional
changes. The tier guides below are references: better once you know what you are looking for.

Each guide quotes real defaults from `src/core/config.ts`. For the exhaustive reference — every
option, its unit, its default and its edge cases — see
[docs/API.md](../docs/API.md#every-option-annotated).

---

## Catalog

| Framework                | Basic                                 | Advanced                              | Configuration                            | More advanced                                    |
| ------------------------ | ------------------------------------- | ------------------------------------- | ---------------------------------------- | ------------------------------------------------ |
| **Vanilla / no framework** | [Start here](vanilla/basic/README.md) | [Uploads](vanilla/advanced/README.md) | [Every option](vanilla/config/README.md) | [Power surface](vanilla/more-advanced/README.md) |
| **React**                | [Start here](react/basic/README.md)   | [Uploads](react/advanced/README.md)   | [Every option](react/config/README.md)   | [Adapters](react/more-advanced/README.md)        |
| **Vue 3**                | [Start here](vue/basic/README.md)     | [Uploads](vue/advanced/README.md)     | [Every option](vue/config/README.md)     | [Plugin](vue/more-advanced/README.md)            |
| **Angular**              | [Start here](angular/basic/README.md) | [Uploads](angular/advanced/README.md) | [Every option](angular/config/README.md) | [ErrorHandler](angular/more-advanced/README.md)  |
| **Next.js (App Router)**  | [Start here](nextjs/basic/README.md)  | [Uploads](nextjs/advanced/README.md)  | [Every option](nextjs/config/README.md)  | [SSR rules](nextjs/more-advanced/README.md)      |

The tiers are ordered by *how much you configure*, which makes them references: each one assumes you
know what you are looking for. If you do not yet, start with the
[React sequence guide](react/START-HERE.md) — the four steps are identical in all five frameworks, and
only *where* the two files live changes, which that framework's `basic` guide covers.

## What each tier covers

| Tier                | Problem it solves                                                            | You will learn                                                                                       |
| ------------------- | ---------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------- |
| **`basic`**         | "Something is throwing in production and I have no idea what."                 | One `initTelemetry()` call, where it belongs in *your* framework, and how to read the status back.    |
| **`advanced`**      | "I want these on my own server, and I do not want the store to grow forever."  | `mode: 'remote'`, separate endpoints for errors and logs, retention and caps, and the export API.     |
| **`config`**        | "Which number do I actually change, and to what?"                             | The options that matter, their units and defaults, the environment variables, and the precedence rule. |
| **`more-advanced`** | "I need to control where records go, or how they are shaped."                  | A custom repository or transport, record hooks, internal-failure reporting, each framework's adapter, the observation surface (events, context builders, named sinks), the HTTP client, and encryption at rest. |

## The recipe pages, in every framework

Each tier's `README.md` is the start of that tier; the pages beside it are where the most common
questions are answered. Four of them exist for **every** framework, with the same content adapted to
that framework's idioms:

| Page | Vanilla | React | Vue 3 | Angular | Next.js |
| --- | --- | --- | --- | --- | --- |
| Capture recipes — the four ways an error gets recorded | [recipes](vanilla/basic/01-capture-recipes.md) | [recipes](react/basic/01-capture-recipes.md) | [recipes](vue/basic/01-capture-recipes.md) | [recipes](angular/basic/01-capture-recipes.md) | [recipes](nextjs/basic/01-capture-recipes.md) |
| What arrives at your collector | [the wire format](vanilla/advanced/02-what-arrives-at-the-collector.md) | [the wire format](react/advanced/02-what-arrives-at-the-collector.md) | [the wire format](vue/advanced/02-what-arrives-at-the-collector.md) | [the wire format](angular/advanced/02-what-arrives-at-the-collector.md) | [the wire format](nextjs/advanced/02-what-arrives-at-the-collector.md) |
| Levels and thresholds — why a log is missing | [levels](vanilla/config/03-levels-and-thresholds.md) | [levels](react/config/03-levels-and-thresholds.md) | [levels](vue/config/03-levels-and-thresholds.md) | [levels](angular/config/03-levels-and-thresholds.md) | [levels](nextjs/config/03-levels-and-thresholds.md) |
| The recipes, the adapter, and choosing | [deciding](vanilla/more-advanced/03-recipes-and-deciding.md) | [deciding](react/more-advanced/03-recipes-and-deciding.md) | [deciding](vue/more-advanced/03-recipes-and-deciding.md) | [deciding](angular/more-advanced/03-recipes-and-deciding.md) | [deciding](nextjs/more-advanced/03-recipes-and-deciding.md) |

One further page is **framework-agnostic**, so it exists once rather than five times: the observation
and extension surface — `handle.events`, `registerErrorContextBuilder`, `getSinkRegistry()` and the flat
configuration aliases — at
[events and context builders](vanilla/more-advanced/04-events-and-context-builders.md). It is worth
reading whichever framework you use, because none of it is framework-specific.

## The new-feature pages, in every framework

Three additions ship on their own subpaths or in the core, and each has a page in **every** framework so
you can see where the code belongs in yours rather than translating a vanilla snippet:

| Page | Vanilla | React | Vue 3 | Angular | Next.js |
| --- | --- | --- | --- | --- | --- |
| Observing and extending — events, context builders, sink registry, flat aliases | [page](vanilla/more-advanced/04-events-and-context-builders.md) | [page](react/more-advanced/04-observing-and-extending.md) | [page](vue/more-advanced/04-observing-and-extending.md) | [page](angular/more-advanced/04-observing-and-extending.md) | [page](nextjs/more-advanced/04-observing-and-extending.md) |
| Calling an API — `@codewithrajat/rm-logvault/http` | [page](vanilla/more-advanced/05-using-the-http-client.md) | [page](react/more-advanced/05-using-the-http-client.md) | [page](vue/more-advanced/05-using-the-http-client.md) | [page](angular/more-advanced/05-using-the-http-client.md) | [page](nextjs/more-advanced/05-using-the-http-client.md) |
| Encrypting stored records — `@codewithrajat/rm-logvault/storage` | [page](vanilla/more-advanced/06-encrypting-stored-records.md) | [page](react/more-advanced/06-encrypting-stored-records.md) | [page](vue/more-advanced/06-encrypting-stored-records.md) | [page](angular/more-advanced/06-encrypting-stored-records.md) | [page](nextjs/more-advanced/06-encrypting-stored-records.md) |

The vanilla pages carry the depth, because none of the behaviour is framework-specific; the other four
show **where the code goes** — a composable, a service, a client module, an initialiser — and which
framework rules apply. Where an addition is client-only (storage encryption needs IndexedDB and
`crypto.subtle`), the Next.js page also covers the server boundary.

## Which should I start with?

- **If you have never used this library:** your framework's `basic` guide. It is under fifty lines.
- **If your app already has an error boundary or handler:** that framework's `more-advanced` guide —
  every adapter **chains** the hook you already have instead of replacing it.
- **If you are choosing configuration values:** your framework's `config` guide, then
  [docs/API.md](../docs/API.md#every-option-annotated) for the rest. If the nested shape is more nesting
  than the fact deserves, read the flat aliases in the `config` guide first.
- **If you are wiring up a backend:** `advanced`. Note that `mode` defaults to `'local'`, so nothing
  leaves the browser until you give it an endpoint — and errors and logs can go to different URLs.
- **If you want to react to a capture, or classify an error the library cannot:** the observation page
  above. `handle.events` and `registerErrorContextBuilder` are the two seams most people want first.
- **If your own API calls should become records:** the HTTP client page. It is a separate import, so it
  costs nothing until you use it.

## Three things worth knowing before you copy anything

1. **Nothing is required.** `initTelemetry()` with no arguments works: it captures locally and makes
   no network requests at all. Every option has a default, and the defaults are documented.
2. **`{ ...fromEnv() }` does not work** — it is a common trap. The environment layer is read only
   through `options.env`, so spreading `fromEnv()` carries just the six top-level identity fields and
   silently drops every nested one. Use `env: true`, `env: 'VITE_'` or `env: ['VITE_', 'PUBLIC_']`.
3. **Initialise once and early.** Calling `initTelemetry()` at the top of your entry module means the
   pre-initialisation buffer never matters, and a second call is a no-op that returns the first
   handle — so keep the pairing `destroyTelemetry()` → `initTelemetry()` in mind if you ever
   re-configure at runtime.
