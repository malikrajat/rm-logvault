# @codewithrajat/rm-logvault

<!-- TODO: enable after first publish -->

[![npm version](https://img.shields.io/npm/v/@codewithrajat/rm-logvault.svg?logo=npm)](https://www.npmjs.com/package/@codewithrajat/rm-logvault)
[![bundle size](https://img.shields.io/bundlephobia/minzip/@codewithrajat/rm-logvault)](https://bundlephobia.com/package/@codewithrajat/rm-logvault)
[![types](https://img.shields.io/npm/types/@codewithrajat/rm-logvault.svg)](https://www.npmjs.com/package/@codewithrajat/rm-logvault)
[![license](https://img.shields.io/npm/l/@codewithrajat/rm-logvault.svg)](./LICENSE)
[![provenance](https://img.shields.io/badge/provenance-signed-brightgreen)](https://docs.npmjs.com/generating-provenance-statements)
[![CI](https://img.shields.io/github/actions/workflow/status/malikrajat/rm-logvault/ci.yml?branch=main&label=CI)](https://github.com/malikrajat/rm-logvault/actions/workflows/ci.yml)
![Stability](https://img.shields.io/badge/Stability-production--ready-success)
![Dependencies](https://img.shields.io/badge/Dependencies-zero-success)
![Tree-shaking](https://img.shields.io/badge/tree--shaking-supported-success)
![Side effects](https://img.shields.io/badge/Side%20Effects-none-blue)
![TypeScript](https://img.shields.io/badge/TypeScript-strict-blue)
![SSR](https://img.shields.io/badge/SSR-compatible-success)
![Offline](https://img.shields.io/badge/Offline--first-IndexedDB-blue)
![SemVer](https://img.shields.io/badge/SemVer-compliant-blue)

## See It In Action

<div align="center">

  <img src="https://github.com/malikrajat/rm-logvault/blob/main/assets/demo.gif" alt="rm-logvault: an uncaught error is captured, then exported as one diagnostics report" width="800"/>

</div>

---

<p align="center">
<strong>The offline-first error tracker, logger and diagnostics exporter for the browser. It records every error and log into IndexedDB, redacts secrets before writing anything, and hands you one self-contained HTML report — no server, no account, no dependencies. Framework-agnostic by construction, with optional React, Vue, Angular, axios and TanStack Query adapters.</strong>
</p>

---

## Table of Contents

**Start here**

- [**Interactive Demo**](https://stackblitz.com/edit/stackblitz-starters-p7w7kwau) - The library running live in a browser, no install.
- [**Quick Start**](#quick-start) - Install it, call `initTelemetry`, and what you get.
- [**Installation**](#installation--setup) - npm, pnpm, yarn, bun, or a CDN `<script>`.
- [**Do I need a server?**](#do-i-need-a-server-a-backend-or-an-account) - The short answer, and the mode you get by default.

**Framework guides**

- [**All examples**](examples/README.md) - Real code for every feature, in five frameworks across four tiers.
- [**React**](examples/react/README.md) - [root handlers, error boundary and the adapter](examples/react/more-advanced/01-the-react-adapter-and-testing.md).
- [**Next.js**](examples/nextjs/README.md) - App Router, client components and SSR safety.
- [**Vue**](examples/vue/README.md) - The plugin that chains Vue's `errorHandler`.
- [**Angular**](examples/angular/README.md) - `provideTelemetryErrorHandler()` and the bootstrap setup.
- [**Vanilla / TypeScript**](examples/vanilla/README.md) - No framework, plain ESM, Vite or webpack.

**Documentation**

- [**Usage Guide**](#using-it-day-to-day) - Logging, capture, storage, export and privacy.
- [**Configuration**](#configuration) - Every option, default and environment variable.
- [**Options cheatsheet**](docs/OPTIONS-CHEATSHEET.md) - Every option with its real default inline, and six presets.
- [**API Reference**](docs/API.md) - Every exported symbol, with signatures and examples.
- [**REST Contract**](docs/REST-CONTRACT.md) - The wire format, status codes and server obligations.
- [**Architecture**](docs/ARCHITECTURE.md) - The capture pipeline and the diagnostics-export path.
- [**Security**](docs/SECURITY.md) - Threat model, the redaction design and the egress guarantee.
- [**Privacy & GDPR**](docs/PRIVACY-GDPR.md) - Lawful basis, retention, erasure and the consent gate.
- [**Browser support**](docs/BROWSER-SUPPORT.md) - IndexedDB availability and the limits that bite.
- [**Decisions**](docs/DECISIONS.md) - The ADR log, with the alternatives that were rejected.

**Reference**

- [**Features**](#features) - A detailed look at the design and technical capabilities.
- [**Browser Compatibility**](#browser-compatibility) - Compatibility and platform matrix.
- [**Dependencies**](#dependencies-and-compatibility) - Zero runtime deps, and which subpath needs which peer.
- [**What it does not do**](#what-it-does-not-do) - No server, no alerting, no replay, no source maps.
- [**Troubleshooting**](#troubleshooting) - Symptom-by-symptom diagnosis and fixes.
- [**FAQ**](#faq) - Common questions about setup, privacy, frameworks, bundle size and testing.
- [**Contributing**](#testing-and-contributing) - Development setup, coverage gates and the PR checklist.

---

## Live Demo & Playground

<div align="center">

<table>
  <tr>
    <td align="center" width="50%">
      <a href="https://stackblitz.com/edit/stackblitz-starters-p7w7kwau" target="_blank">
        <img src="https://img.shields.io/badge/StackBlitz_Demo-1976D2?style=for-the-badge&logo=stackblitz&logoColor=white" alt="StackBlitz Demo"/>
      </a>
      <br/><br/>
      <sub><b>Interactive Playground</b></sub><br/>
      <sub>Run it live in your browser — no install</sub>
    </td>
    <td align="center" width="50%">
      <a href="https://github.com/malikrajat/rm-logvault/blob/main/docs/README.md" target="_blank">
        <img src="https://img.shields.io/badge/Documentation_Index-1976D2?style=for-the-badge&logo=readthedocs&logoColor=white" alt="Documentation Index"/>
      </a>
      <br/><br/>
      <sub><b>Documentation Index</b></sub><br/>
      <sub>Every document, with a one-line summary of each</sub>
    </td>
  </tr>
  <tr>
    <td align="center" width="50%">
      <a href="https://github.com/malikrajat/rm-logvault/blob/main/examples/README.md" target="_blank">
        <img src="https://img.shields.io/badge/Code_Examples-181717?style=for-the-badge&logo=github&logoColor=white" alt="GitHub Examples"/>
      </a>
      <br/><br/>
      <sub><b>Complete Examples</b></sub><br/>
      <sub>Copy-paste ready code samples</sub>
    </td>
    <td align="center" width="50%">
      <a href="https://www.npmjs.com/package/@codewithrajat/rm-logvault/" target="_blank">
        <img src="https://img.shields.io/badge/npm_Package-CB3837?style=for-the-badge&logo=npm&logoColor=white" alt="npm Package"/>
      </a>
      <br/><br/>
      <sub><b>npm Registry</b></sub><br/>
      <sub>Install and view package details</sub>
    </td>
  </tr>
  <tr>
    <td align="center" width="50%">
      <a href="https://github.com/malikrajat/rm-logvault" target="_blank">
        <img src="https://img.shields.io/badge/GitHub_Repo-181717?style=for-the-badge&logo=github&logoColor=white" alt="GitHub Repository"/>
      </a>
      <br/><br/>
      <sub><b>Source Code</b></sub><br/>
      <sub>Star, fork, and contribute</sub>
    </td>
    <td align="center" width="50%">
      <a href="https://github.com/malikrajat/rm-logvault/blob/main/docs/ARCHITECTURE.md" target="_blank">
        <img src="https://img.shields.io/badge/Architecture_%26_Decisions-375A7F?style=for-the-badge&logo=readthedocs&logoColor=white" alt="Architecture and Decisions"/>
      </a>
      <br/><br/>
      <sub><b>Architecture &amp; Decisions</b></sub><br/>
      <sub>How it works, and why it is shaped that way</sub>
    </td>
  </tr>
</table>

</div>

---

## Features

RM LogVault is built for developers searching for a browser error tracker, an offline-first logging library, a client-side diagnostics exporter, or an IndexedDB-backed "black box" they can ship without a collector, an account or a runtime dependency.

- **Catches every error your app throws** — even the ones you never wrapped in a `try`/`catch`, and the ones thrown inside a promise nobody awaited.
- **Keeps a copy on the device**, inside the browser's built-in database (IndexedDB — it ships with the browser, you install nothing), so the evidence survives a page reload.
- **Lets you write logs with levels** — `logger.info(...)`, `logger.warn(...)`, `logger.error(...)` — and you decide which of them are worth keeping.
- **Turns all of it into one file** a user can send you: press `Ctrl+Shift+Alt+D` and a self-contained HTML report downloads.
- **Deletes secrets before it writes anything.** Tokens, passwords, e-mail addresses and full query strings are replaced with `[REDACTED]` by default, with no setup.
- **Installs global handlers, and chains yours.** `window.onerror` is captured rather than overwritten, and your handler still runs and still controls whether the default console message is suppressed.
- **Captures promises, workers, chunk loads and CSP violations.** Unhandled rejections, errors in a Worker or `self` scope, failed dynamic imports and stale-deploy `ChunkLoadError`s are on by default; failed `<script>`/`<link>`/`<img>` loads and `securitypolicyviolation` events are one option away.
- **Groups repeats instead of flooding you.** One row per distinct error, with an occurrence counter, so 500 hits of the same bug are one record rather than 500.
- **Bounds itself automatically.** Retention and row caps expire errors after 7 days and logs after 3, and per-record payload budgets trim oversized records instead of refusing them.
- **Rate-limits by default**, at 120 errors and 600 logs per minute, and reports a single summary line when it drops the excess rather than one warning per event.
- **Offline-first, never lossy**: records are written to IndexedDB first and uploaded second, so an endpoint that is down, a user on a plane or a mid-deploy server never loses evidence.
- **Uploads on your terms.** Point `rest.errorsUrl` at your own endpoint and it handles batching, exponential backoff, `Retry-After`, stale-claim recovery and at-least-once delivery keyed on a stable `id`.
- **Extensible redaction.** Add your own sensitive key names and free-text patterns (`sk_live_…`, tenant headers) on top of the built-ins, and allow-list the query values that are safe to keep.
- **Callbacks for your own logic.** `beforeCapture` and `beforeStore` let you inspect, change or drop a record; `onTerminalFailure` tells you a batch was rejected for good so you can re-authenticate and requeue it.
- **Swappable storage and transport.** The repository and the transport are both injectable, so you can store somewhere else, send over your own client, or encrypt records before they land in IndexedDB.
- **`@codewithrajat/rm-logvault/testing` for your test suite** — an in-memory repository that mirrors real IndexedDB semantics and a fake transport that scripts every upload branch, with no browser and no fake IndexedDB.
- **Zero runtime dependencies and tree-shakeable**: framework packages are optional peers, and importing `captureError` alone costs roughly a quarter of the full recorder.
- **Framework-agnostic core**: React, Vue, Angular, axios and TanStack Query adapters are thin, optional subpaths, so a Vue app never ships React code.
- **SSR-safe and microfrontend-safe**: no module-level code touches a browser global, and process-wide state lives on `globalThis` so two bundled copies share one instance instead of double-capturing.
- **Written in TypeScript** with the strictest settings, shipping its own type declarations for every subpath — no `@types` package needed.

## Quick Start

```bash
# in your project folder
npm i @codewithrajat/rm-logvault
```

```ts
// src/main.ts — the first module your app runs
import { initTelemetry } from '@codewithrajat/rm-logvault';

initTelemetry({ appName: 'my-app' });
```

Three lines: an import, a blank line, and one call. `initTelemetry` is the function that starts the
recorder — it is the only piece of jargon on this page you have to type.

### That's it — what you just got

With those three lines, and nothing else configured:

- Every uncaught error, including ones thrown by third-party scripts on your page.
- Every promise rejection that nobody handled.
- Failed dynamic imports and chunk loads (the error you see when a user has a stale tab open during
  a deploy).
- Every `logger.warn(...)` and `logger.error(...)` call, saved to the browser database.
  (`logger.info` and below are printed but not saved — you can change that, see
  [Logging](#logging).)
- A hidden `Ctrl+Shift+Alt+D` shortcut that downloads one HTML report.
- Redaction applied before anything is written to disk.
- **No network requests at all.** Nothing is uploaded anywhere.

### Try it now

Do this once. It takes about thirty seconds and it is the fastest way to trust the thing.

> **In a hurry, or no project to hand?** Open the
> [StackBlitz playground](https://stackblitz.com/edit/stackblitz-starters-p7w7kwau) — the library is
> already installed and initialised there, so you can go straight to step 2.

1. Run your app and open it in a browser. Open DevTools (`F12`, or `Cmd`+`Option`+`I` on macOS) and
   click the **Console** tab.

2. Click once on the page background — **not** inside a text field — then type this and press
   Enter:

   ```js
   // typed into the DevTools console — not a file
   throw new Error('my first logVault record');
   ```

   You will see a red uncaught error. That is expected: the browser still prints it, and a copy is
   now in the database.

3. Press `Ctrl`+`Shift`+`Alt`+`D` (on macOS: `Ctrl`+`Shift`+`Option`+`D`). A file named
   `diagnostics-report-<timestamp>.html` downloads. Open it in any browser and search for
   `my first logVault record`.

If step 3 does nothing: make sure your focus is not inside an input, textarea or `contenteditable`
element (typing "d" in a form field is deliberately ignored), and make sure no extra modifier key is
held down. See [Troubleshooting](#troubleshooting).

To watch the record land in the database instead, see [Where the data lives](#where-the-data-lives).

---

---

## Installation & Setup

For detailed installation instructions, see our [Configuration Guide](./docs/CONFIGURATION.md).

**npm**

```bash
# in your project folder
npm i @codewithrajat/rm-logvault
```

**pnpm**

```bash
# in your project folder
pnpm add @codewithrajat/rm-logvault
```

**yarn**

```bash
# in your project folder
yarn add @codewithrajat/rm-logvault
```

**bun**

```bash
# in your project folder
bun add @codewithrajat/rm-logvault
```

That is the entire install. Nothing else is pulled in, and no install script runs. See
[Dependencies and compatibility](#dependencies-and-compatibility).

### CDN (no bundler, no npm)

```html
<!-- index.html — put this near the end of <body> -->
<script type="module">
  import { initTelemetry, logger } from 'https://esm.sh/@codewithrajat/rm-logvault@1.0.0';

  initTelemetry({ appName: 'marketing-site' });
  logger.warn('[Hero] fallback image used');
</script>
```

Pin the version, as above. An unpinned CDN import resolves to whatever `latest` happens to be at the
moment the page loads, which is a supply-chain risk you do not need.

---

## Usage

For comprehensive usage examples and API documentation, see our [API Reference](./docs/API.md).

### Quick start, per framework

Every snippet below is ten lines or fewer. Copy the one that matches your stack. The comment on the
first line of each says where the file goes.

#### Plain HTML, no bundler

Use this when there is no build step at all.

```html
<!-- index.html — the single page you already have -->
<script type="module">
  import { initTelemetry } from 'https://esm.sh/@codewithrajat/rm-logvault@1.0.0';

  initTelemetry({ appName: 'static-site' });
</script>
```

#### Vite + vanilla TypeScript

```ts
// src/main.ts — the entry file that index.html loads
import { initTelemetry } from '@codewithrajat/rm-logvault';

initTelemetry({ appName: 'my-app' });
```

The same snippet works for webpack, Rollup, Parcel or esbuild projects: it is plain ESM.

#### React 19

React 19 reports errors at the root, so hand it logVault's handlers.

```tsx
// src/main.tsx — the file that calls createRoot
import { createRoot } from 'react-dom/client';
import { initTelemetry } from '@codewithrajat/rm-logvault';
import { reactRootErrorHandlers } from '@codewithrajat/rm-logvault/react';

initTelemetry({ appName: 'my-app' });

createRoot(document.getElementById('root')!, reactRootErrorHandlers()).render(<App />);
```

`reactRootErrorHandlers()` wires up `onUncaughtError`, `onCaughtError` and `onRecoverableError`.

#### React error boundary

A boundary catches render errors in the subtree it wraps — and lets you show a fallback instead of a
blank page.

```tsx
// src/App.tsx — wrap the part of the tree you want to protect
import { TelemetryErrorBoundary } from '@codewithrajat/rm-logvault/react';

export function App() {
  return (
    <TelemetryErrorBoundary fallback={(error, reset) => <button onClick={reset}>Retry</button>}>
      <Checkout />
    </TelemetryErrorBoundary>
  );
}
```

You can use both the root handlers and a boundary. A failure that reaches both still becomes **one**
record, because identical error objects are de-duplicated.

#### Next.js (App Router)

`initTelemetry` touches `window` and `indexedDB`, which only exist in the browser. `'use client'` is
what tells Next.js to run this file in the browser, so the call must live in a client component.

```tsx
// app/providers.tsx — a client component
'use client';

import { useEffect } from 'react';
import { initTelemetry, destroyTelemetry } from '@codewithrajat/rm-logvault';

export function Providers({ children }: { children: React.ReactNode }) {
  useEffect(() => {
    initTelemetry({ appName: 'my-app' });
    return () => destroyTelemetry();
  }, []);
  return children;
}
```

Then render `<Providers>` around your app in `app/layout.tsx`. The `destroyTelemetry()` cleanup stops
React's Strict Mode double-invocation from leaving a second installation behind.

#### Vue 3

```ts
// src/main.ts — the Vue entry file
import { createApp } from 'vue';
import { initTelemetry } from '@codewithrajat/rm-logvault';
import { createTelemetryVuePlugin } from '@codewithrajat/rm-logvault/vue';

initTelemetry({ appName: 'my-app' });

createApp(App).use(createTelemetryVuePlugin()).mount('#app');
```

The plugin chains Vue's `errorHandler` rather than replacing it, so a handler you already installed
still runs.

#### Angular

```ts
// src/main.ts — the file that bootstraps AppComponent
import { bootstrapApplication } from '@angular/platform-browser';
import { initTelemetry } from '@codewithrajat/rm-logvault';
import { provideTelemetryErrorHandler } from '@codewithrajat/rm-logvault/angular';

initTelemetry({ appName: 'my-app' });

bootstrapApplication(AppComponent, { providers: [provideTelemetryErrorHandler()] });
```

#### Svelte

Svelte has no framework-level error hook, so the global handlers do the work and you capture inside
your own error paths. There is no `@codewithrajat/rm-logvault/svelte` subpath.

```ts
// src/main.ts — the Svelte entry file
import { initTelemetry, captureError } from '@codewithrajat/rm-logvault';

initTelemetry({ appName: 'my-app' });

export function loadBoard(): void {
  try {
    boardStore.load();
  } catch (error) {
    captureError(error, { source: 'svelte', tags: { flow: 'board' } });
    throw error; // capture, then let the app behave exactly as before
  }
}
```

#### Node / SSR (any framework)

Importing logVault on the server is safe: no module-level code touches `window`, `document` or
`indexedDB`, and every accessor checks for them when called.

But there is nothing useful to do there. `initTelemetry` on the server installs no listeners and
finds no database, so nothing is persisted. Call it from browser code only — in Next.js, from a
`'use client'` component as shown above.

### Using it day to day

#### Logging

```ts
// anywhere in your app
import { logger } from '@codewithrajat/rm-logvault';

logger.trace('[Checkout] render tick', { ms: 4 });
logger.debug('[Checkout] cart hydrated', { items: 3 });
logger.info('[Checkout] cart loaded', { items: 3 });
logger.warn('[Checkout] payment retrying', { attempt: 2 });
logger.error('[Checkout] payment failed', error);
```

The ladder is `trace < debug < info < warn < error`. Higher wins. Each call takes a message and any
number of extra values, which are stored alongside it (`logger.error(msg, error)` is the common
shape).

##### "I set the level and nothing was saved"

This confuses almost everybody, so here it is plainly. **There are two independent levels.**

| Control                | Sets                                     | Default  | What it affects            |
| ---------------------- | ---------------------------------------- | -------- | -------------------------- |
| `logs.level` (option)  | the **persisted** level                  | `'warn'` | What reaches the database. |
| `logger.setLevel(...)` | the **console** level                    | `'warn'` | What reaches `console.*`.  |

Someone writes this, sees nothing saved, and files a bug:

```ts
// src/main.ts
import { initTelemetry, logger } from '@codewithrajat/rm-logvault';

initTelemetry({ appName: 'my-app' });
logger.setLevel('debug'); // ← this only makes the CONSOLE noisier

logger.info('[Checkout] cart loaded'); // printed to the console, NOT saved
```

`logger.setLevel` controls browser-console verbosity only. To save info-level records, set the option:

```ts
// src/main.ts
import { initTelemetry } from '@codewithrajat/rm-logvault';

initTelemetry({ appName: 'my-app', logs: { level: 'info' } });
```

The two are independent on purpose. Leaving `logger.setLevel('off')` in production silences console
noise while persistence keeps working — exactly what you want where nobody is watching the console:

```ts
// src/main.ts — production setting
import { initTelemetry, logger } from '@codewithrajat/rm-logvault';

initTelemetry({ appName: 'my-app', logs: { level: 'warn' } });

logger.setLevel('off'); // console is silent…
logger.warn('[Checkout] still saved'); // …but the record IS written
```

##### Already have `console.warn` calls?

You do not have to rewrite them. Opt in to wrapping them:

```ts
// src/main.ts
import { initTelemetry } from '@codewithrajat/rm-logvault';

initTelemetry({ appName: 'my-app', logs: { captureConsole: true, level: 'warn' } });
```

Every existing `console.warn(...)` and `console.error(...)` call keeps printing as before and is now
also captured. `destroyTelemetry()` restores the original methods.

##### Sending logs somewhere else as well (sinks)

A "sink" is a function that receives each log record that passes the persist level.

```ts
// src/main.ts
import { logger, type LogRecord } from '@codewithrajat/rm-logvault';

const unsubscribe = logger.addSink({
  name: 'ship-to-my-backend',
  write: (record: LogRecord) => myTransport(record),
});

unsubscribe(); // stop receiving
```

A sink that throws cannot break your app or the other sinks, and a sink that logs cannot recurse into
itself.

#### Capturing an error yourself

Automatic capture covers the uncaught cases. When you catch something and want a record anyway:

```ts
// anywhere in your app
import { captureError } from '@codewithrajat/rm-logvault';

try {
  checkout();
} catch (error) {
  captureError(error, { tags: { flow: 'checkout' }, extra: { cartId } });
  throw error; // re-throw if you still want your normal handling to run
}
```

`captureError` accepts literally anything you can throw — a string, `null`, a hostile object, an
`AggregateError`, an object with a circular `cause` chain. It never throws, so it is safe inside a
`catch` block with no extra guarding.

To wrap a handler so that a throw is captured **and then re-thrown unchanged**:

```ts
// anywhere you add a listener
import { withErrorCapture } from '@codewithrajat/rm-logvault';

button.addEventListener('click', withErrorCapture(async () => {
  await submitOrder();
}));
```

#### What it captures automatically

Every recorded error carries a `source` field saying where it came from. This is that list.

| `source`             | Recorded by                                                     | On by default?                       |
| -------------------- | --------------------------------------------------------------- | ------------------------------------ |
| `window`             | `window.onerror`                                                | yes                                  |
| `unhandledrejection` | The `unhandledrejection` listener                               | yes                                  |
| `chunk`              | Failed dynamic import / `ChunkLoadError` / Vite preload error   | yes                                  |
| `resource`           | A failed `<script>`, `<link>` or `<img>` load                   | no — `errors.captureResources: true` |
| `csp`                | A `securitypolicyviolation` event                               | no — `errors.captureCsp: true`       |
| `worker`             | Errors in a Worker or `self` scope                              | yes (same global handlers)           |
| `api`                | `captureApiError`, `captureFetchError`, the axios/fetch adapters | only if you call them                |
| `event-handler`      | `withErrorCapture`                                              | only if you call it                  |
| `react`              | The React boundary or root handlers                             | only with `@codewithrajat/rm-logvault/react`           |
| `vue`                | The Vue plugin                                                  | only with `@codewithrajat/rm-logvault/vue`             |
| `angular`            | The Angular error handler                                       | only with `@codewithrajat/rm-logvault/angular`         |
| `query`              | The TanStack Query adapter                                      | only with `@codewithrajat/rm-logvault/react-query`     |
| `svelte`             | Your own `captureError` calls                                   | only if you call it                  |
| `storage`            | Reserved for storage-originated failures                        | —                                    |
| `manual`             | `captureError(err)` with no `source` — the default              | only if you call it                  |

An error recorded from a global source — `window`, `unhandledrejection`, `resource`, `chunk`, `csp`
or `worker` — is marked `handled: false`, which is how you tell "the user hit this and nothing caught
it" apart from "the app caught this on purpose".

logVault never replaces a handler you already installed. A `window.onerror` you wrote is chained: it
is called, and its return value is returned, so a decision you made about suppressing the default
console message still stands.

#### Where the data lives

Everything is in two IndexedDB databases — the database built into your browser, which needs no
install and no server.

| Database          | Object store | What is in it                                                          |
| ----------------- | ------------ | ---------------------------------------------------------------------- |
| `rm-logvault-errors` | `errors`     | One row per distinct error. Repeats bump a counter instead of adding rows. |
| `rm-logvault-logs`   | `logs`       | One row per saved log call.                                            |

The `rm-logvault` part comes from the `dbPrefix` option; change it and both names change.

**To look at them in Chrome, Edge or Brave:**

1. Open DevTools (`F12`).
2. Click the **Application** tab. (In Firefox and Safari it is the **Storage** tab.)
3. In the left sidebar, expand **IndexedDB**.
4. You will see `rm-logvault-errors` and `rm-logvault-logs`.
5. Expand one, then expand its object store (`errors` or `logs`).
6. Click any row to inspect the record in the panel on the right.

You can also read them from the console:

```js
// typed into the DevTools console — not a file
const db = await new Promise((r) => { const q = indexedDB.open('rm-logvault-errors'); q.onsuccess = () => r(q.result); });
const all = await new Promise((r) => { const q = db.transaction('errors').objectStore('errors').getAll(); q.onsuccess = () => r(q.result); });
console.table(all.map((e) => ({ source: e.source, name: e.name, message: e.message, count: e.occurrenceCount })));
```

Retention is automatic: errors older than 7 days and logs older than 3 days are deleted, and both
stores have a row cap (500 errors, 2000 logs).

#### Getting a report out of a user

**The shortcut.** `Ctrl+Shift+Alt+D` downloads a single `.html` file. It opens in any browser, with
no network, and contains the app metadata, every stored error with its stack and tags, and every
saved log. Tell the user to press the keys and attach the file. That is the whole support workflow.

The report is a viewer, not a dump. It groups errors by fingerprint, lists every page load with its
route, time span and record counts, and lets you drill in: pick a load to filter both tables down to
it, or select an error to see its stack, the logs recorded in the same load — with the ones inside the
error's own time window highlighted — and a link to every other error from that same load. Errors and
logs are joined on `pageLoadId`, which is what lets the report answer "what happened during this load"
rather than only "what went wrong somewhere".

**What the file contains, precisely.** Both IndexedDB databases in full: every error record and every
log record, **whatever its `uploadStatus`** — `pending`, `uploading`, `uploaded` and `failed` alike, so
nothing stuck in a queue is missing. Records are already redacted; pass `redactAgain: true` for a
documented second pass. The file is named `diagnostics-report-<ISO timestamp>.html` unless you set
`filenamePrefix`.

**Where the shortcut does *not* exist.** It is a keyboard listener, so:

- **A phone or tablet has no keyboard** and never emits `keydown`. The shortcut is not a mobile
  support workflow — call `exportDiagnosticsReport()` from a button instead. This is the usual reason a
  report can be produced on a developer's laptop but not on the customer's device.
- Nothing is installed when there is no `document` (SSR, a prerender pass, a Web Worker), when you pass
  `shortcut: false`, or before `initTelemetry` runs.
- It stays silent while the focus is in an `input`, `textarea`, `select` or `contenteditable` host, and
  modifier matching is **exact**, so an extra key held means no match.

**If the file arrives empty**, read `getTelemetryStatus().storage` before concluding that nothing was
captured: `'ready'` means genuinely no records, `'unavailable'` means the browser refused storage and
the export still wrote a file with zero rows. See
[docs/BROWSER-SUPPORT.md](docs/BROWSER-SUPPORT.md).

For the full gate-by-gate order — and a flowchart of exactly which branch a given keypress takes — see
[ARCHITECTURE.md §12](docs/ARCHITECTURE.md#12-the-diagnostics-export-path).

**Change the keys.** Useful when the default clashes with something, or when you want to gate the
shortcut to internal staff.

```ts
// src/main.ts
import { initTelemetry } from '@codewithrajat/rm-logvault';

initTelemetry({
  appName: 'my-app',
  shortcut: {
    key: 'j',
    ctrl: true,
    shift: true,
    alt: false,
    filenamePrefix: 'bug-report',
    allow: () => window.__IS_INTERNAL__ === true,
  },
});
```

Use `shortcut: false` to disable it entirely. Note that the shortcut is **obscurity, not access
control**: it only exposes data already stored on that machine, and that data is already redacted,
but anyone who knows the keys can produce a report. Gate it with `allow` if that matters.

**Export from code.** For a "Download diagnostics" button, or to hand the data to your own tooling:

```ts
// anywhere in your app
import { exportDiagnosticsReport } from '@codewithrajat/rm-logvault';

await exportDiagnosticsReport(); // self-contained HTML download
await exportDiagnosticsReport({ format: 'json', redactAgain: true }); // machine-readable
```

It reads every record regardless of upload status, so nothing stuck in a queue is missing from the
report. It returns `false` instead of throwing when telemetry is disabled or not initialized, when it
runs outside a browser, when an export is already running, or when the download itself cannot start.
When storage is *unavailable* it still produces the file, with no records in it, and reports
`diagnostics-read-errors` through `onInternalError` — check `getTelemetryStatus().storage` before
concluding that nothing was captured. See [docs/BROWSER-SUPPORT.md](docs/BROWSER-SUPPORT.md#5-verifying-on-your-own-machine).

#### Privacy

Redaction runs **before** a record is written and again before it is exported or uploaded. Plain
version:

**Removed by default, with no configuration:**

- Anything whose *key* looks sensitive: `authorization`, `cookie`, `token`, `password`, `secret`,
  `apiKey`, `session`, `email`, `phone` and similar — in any casing or separator style, so
  `access_token`, `accessToken` and `ACCESS TOKEN` all match.
- JSON Web Tokens, anywhere they appear.
- `Bearer …`, `Basic …` and `Token …` authorization values.
- `key=value` pairs for the obvious names: `token=`, `password=`, `api_key=`, `session=`, `email=`,
  `phone=`, and the rest.
- Long opaque strings that look like credentials (a 32–200 character run of word characters with no
  surrounding context).
- E-mail addresses.
- Credentials embedded in URLs (`https://user:pass@host/…` becomes `https://host/…`).
- URL fragments, and every query-string **value** except an allow-list (`page`, `limit`, `sort`,
  `lang` and a few more).
- Cache-busting query strings inside stack traces, so `/src/App.tsx?t=1712345:12:3` groups with
  `/src/App.tsx:12:3`.

The placeholder is always the literal text `[REDACTED]`.

**Never read, at all:**

- Request and response **bodies**. Not on axios, not on `fetch`, not on your own API calls.
- **Cookies**, `localStorage` and `sessionStorage`.
- **Authorization header values.** Only four *correlation* header names are probed, and only for
  their presence: `x-request-id`, `x-correlation-id`, `x-trace-id`, `traceparent`.
- **Form values.** The only DOM element logVault inspects is the shortcut's key event target, and
  only to decide whether to stay silent.
- Arbitrary headers. Nothing is enumerated; specific names are looked up, nothing more.

**The one honest limitation.** A bare, short secret written in prose is not detectable.
`sanitizeText('failed with hunter2')` returns `'failed with hunter2'` — a seven-character word is
indistinguishable from ordinary English, and no pattern can catch it without redacting your whole
message. If you know the shape of a secret you might log, add a pattern:

```ts
// src/main.ts
import { initTelemetry } from '@codewithrajat/rm-logvault';

initTelemetry({
  appName: 'my-app',
  redaction: {
    extraSensitiveKeys: ['x-tenant-id', /^internal/i],
    extraPatterns: [/sk_live_[A-Za-z0-9]{16,}/g],
    allowedQueryParams: ['page', 'locale', 'currency'],
  },
});
```

Full detail, including the exact patterns and hard limits, is in
[docs/SECURITY.md](docs/SECURITY.md) and [docs/PRIVACY-GDPR.md](docs/PRIVACY-GDPR.md).

---

## Changelog

See [CHANGELOG.md](CHANGELOG.md) for release history and updates.

---

### Latest Release

Check the [releases page](https://github.com/malikrajat/rm-logvault/releases) for the most recent version and updates.

---

## License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

**TL;DR:** You can use this library freely in commercial and personal projects.

### MIT License Summary

**You can:**

- Use commercially
- Modify the code
- Distribute
- Use privately

**You must:**

- Include the license and copyright notice

**You cannot:**

- Hold the author liable

---

## FAQ

### How do I capture unhandled promise rejections?

Nothing to do — they are captured already. `initTelemetry` installs an `unhandledrejection` listener,
and the record carries `source: 'unhandledrejection'` with `handled: false`.

If you also want to suppress the browser's default console message, opt in:

```ts
// src/main.ts
import { initTelemetry } from '@codewithrajat/rm-logvault';

initTelemetry({ appName: 'my-app', errors: { preventDefaultUnhandledRejection: true } });
```

This is `false` by default, because logVault must never change how your application behaves.

### How do I store logs in IndexedDB?

That is the default. `initTelemetry({ appName: 'x' })` saves every log at `warn` or above into the
`logs` object store of the `rm-logvault-logs` database. Lower the threshold and raise the cap like this:

```ts
// src/main.ts
import { initTelemetry } from '@codewithrajat/rm-logvault';

initTelemetry({
  appName: 'my-app',
  logs: { level: 'info', retentionDays: 5, maxRecords: 5000 },
});
```

Writes are batched — one database transaction per 50 entries, with a 1-second timer as the upper
bound on how long a record can sit in memory — and flushed when the page is hidden or unloaded.

### How do I export logs from the browser without a backend?

`exportDiagnosticsReport()` needs no server. The user presses `Ctrl+Shift+Alt+D`, or you call it and
hand the file to support.

```ts
// anywhere in your app
import { exportDiagnosticsReport } from '@codewithrajat/rm-logvault';

const ok = await exportDiagnosticsReport({ format: 'json' });
```

The HTML format is a self-contained viewer with search and level filters. The JSON format is a
`{ schemaVersion, generatedAt, app, page, errors, logs }` document. Both work offline.

### How do I redact tokens from client logs?

They are redacted already, with no configuration: sensitive key names, JWTs in free text,
`Bearer`/`Basic`/`Token` schemes, `key=value` secrets, URL credentials, and every non-allow-listed
query value. For your own shapes:

```ts
// src/main.ts
import { initTelemetry } from '@codewithrajat/rm-logvault';

initTelemetry({
  appName: 'my-app',
  redaction: {
    extraSensitiveKeys: ['x-tenant-id', 'x-api-key', /^internal/i],
    extraPatterns: [/sk_live_[A-Za-z0-9]{16,}/g],
  },
});
```

`allowedQueryParams` works in the other direction: values for those keys survive, everything else
becomes `[REDACTED]`.

### How do I send offline errors when the user comes back online?

Configure an endpoint and let the upload queue handle it. Records go to IndexedDB first and are
uploaded second, so while the user is offline they simply stay `pending`. A browser `online` event
schedules a flush a few seconds later.

```ts
// src/main.ts
import { initTelemetry } from '@codewithrajat/rm-logvault';

initTelemetry({
  appName: 'my-app',
  rest: { errorsUrl: '/api/telemetry/errors', logsUrl: '/api/telemetry/logs' },
});
```

If a tab was closed mid-upload, the abandoned claim is swept back to `pending` after five minutes and
picked up by whichever tab opens next. Nothing is lost.

### How do I capture chunk load errors after a deploy?

`errors.captureChunkErrors` is `true` by default. Dynamic-import failures, `ChunkLoadError`,
`Failed to load module script`, Vite's preload-error event and failed `<script>` loads all become
`source: 'chunk'`, `category: 'chunk'`, `severity: 'fatal'` — which turns "this user had a stale tab
open during a deploy" into a single filter in the report. Add `errors.captureResources: true` to also
catch the resource-load form.

### How do I capture CSP violations?

```ts
// src/main.ts
import { initTelemetry } from '@codewithrajat/rm-logvault';

initTelemetry({ appName: 'my-app', errors: { captureCsp: true } });
```

This adds a `securitypolicyviolation` listener. Records use `source: 'csp'`, severity `warning`, and
carry the directive that fired plus the blocked URI.

Remember that a Content Security Policy (the response header that restricts what a page may load or
connect to) can also block your *uploads* — the endpoint origin must be in `connect-src`. See
[docs/TROUBLESHOOTING.md](docs/TROUBLESHOOTING.md).

### How do I capture axios errors?

```ts
// src/api/client.ts — wherever you create your axios instance
import axios from 'axios';
import { attachAxios } from '@codewithrajat/rm-logvault/axios';

const api = axios.create({ baseURL: '/api' });
const detach = attachAxios(api);
```

The interceptor classifies the failure, captures it, and returns your original rejection
**unchanged**. It reads only method, URL, status, statusText, code, timeout, duration and the first
correlation header — never a request or response body.

If you post telemetry with axios itself, tell the adapter to ignore your own endpoint:

```ts
// src/api/client.ts
import { registerTelemetryUrl } from '@codewithrajat/rm-logvault/fetch';

registerTelemetryUrl('/api/telemetry/errors');
```

### How do I capture React error boundary errors?

Use the boundary, the React 19 root handlers, or both — a failure reaching both is still one record.

```tsx
// src/main.tsx
import { TelemetryErrorBoundary, reactRootErrorHandlers } from '@codewithrajat/rm-logvault/react';

createRoot(container, reactRootErrorHandlers()).render(
  <TelemetryErrorBoundary fallback={<Fallback />}>
    <App />
  </TelemetryErrorBoundary>,
);
```

Records carry `source: 'react'` and the component stack (up to 4000 characters).

### How do I capture errors in an Angular app?

```ts
// src/main.ts
import { provideTelemetryErrorHandler } from '@codewithrajat/rm-logvault/angular';

bootstrapApplication(AppComponent, { providers: [provideTelemetryErrorHandler()] });
```

The handler reports and then delegates to `console.error`, exactly as Angular's default does, so the
framework's own diagnostics are unchanged. The provider uses a factory, so you do not need
`experimentalDecorators` or `emitDecoratorMetadata` in your tsconfig.

### How do I get a bug report from a customer with no dev tools?

Tell them to press `Ctrl+Shift+Alt+D` and attach the downloaded
`diagnostics-report-<timestamp>.html`. It is one file, it opens in any browser, it works with no
network, and it contains the app metadata, every error with its stack and tags, and every saved log
with its level and route.

### Does it slow down my app?

No measurable amount, by design. Capture is synchronous and never waits on the database — persistence
is queued in the background. Log writes are batched. Records are bounded by depth, key, array and
length limits, and a rate limiter drops excess (120 errors and 600 logs per minute by default),
reporting one summary line instead of one warning per dropped event. The expensive work —
sanitising a deep object, trimming an oversized payload, building a report — happens once per record
or on demand, never per render.

### Does it work in Safari private mode?

Yes, with degraded storage. Safari throws when `indexedDB` is even accessed in private mode; logVault
catches that and reports storage as unavailable. Capture, redaction and console output keep working,
`getTelemetryStatus().storage` reports `'unavailable'`, nothing uploads, and
`exportDiagnosticsReport()` returns `false` because there is nothing to read. Nothing is thrown into
your app.

### Does it work with SSR / Next.js?

Importing is safe — no module-level code touches `window` or `indexedDB`, so the package loads in
Node, in an SSR framework and inside a Web Worker. `initTelemetry` on the server installs nothing and
stores nothing. In Next.js, call it from a `'use client'` component's effect, as shown in
[Next.js (App Router)](#nextjs-app-router); that also keeps it out of the server bundle.

### Does it work with Module Federation / microfrontends?

Yes, and it is an explicit design goal. Process-wide state lives on
`globalThis[Symbol.for('logvault@1')]`, so two bundled copies of the library resolve to the *same*
instance and share one set of listeners instead of double-capturing. `initTelemetry` is idempotent —
a second call from HMR, a duplicate bundle or a careless component installs nothing new — and each
remote can call `destroyTelemetry()` in its own teardown without disturbing the host.

### What about GDPR and the right to erasure?

Three primitives cover it. Gate capture with `consent` (re-evaluated before every capture, save and
upload, so withdrawing it stops things immediately), delete on request with `clearTelemetryData()`,
and hand a data subject their data with `exportDiagnosticsReport({ format: 'json' })`:

```ts
// anywhere in your app
import { clearTelemetryData, exportDiagnosticsReport } from '@codewithrajat/rm-logvault';

await exportDiagnosticsReport({ format: 'json' }); // access request
await clearTelemetryData(); // erasure request
```

Retention is bounded by default (7 days for errors, 3 for logs) and uploading is opt-in, so the
default posture is "local evidence" rather than "a data collection". See
[docs/PRIVACY-GDPR.md](docs/PRIVACY-GDPR.md).

### How do I disable it entirely?

Four levels, from a kill switch to a build-time decision:

```ts
// 1. Master switch: every capture becomes a no-op and nothing is buffered.
initTelemetry({ appName: 'my-app', enabled: false });

// 2. Runtime gate, re-evaluated before every capture, save and upload.
initTelemetry({ appName: 'my-app', consent: () => userHasAcceptedTelemetry() });

// 3. Feature switches.
initTelemetry({ appName: 'my-app', errors: { enabled: false }, logs: { enabled: false } });

// 4. Do not call initTelemetry at all, and skip the import.
```

Or from the environment: `VITE_TELEMETRY_ENABLED=false` with `env: true`.

### How do I test my code that uses @codewithrajat/rm-logvault?

Use `@codewithrajat/rm-logvault/testing`. The in-memory repository mirrors the real IndexedDB semantics —
pending-only aggregation, atomic claiming, stale-claim recovery, retention cleanup — so a passing test exercises
real logic rather than a stub, and needs no browser and no fake IndexedDB.

```ts
// src/checkout.test.ts — a unit test
import { initTelemetry, captureError, logger, flushTelemetry, destroyTelemetry } from '@codewithrajat/rm-logvault';
import { createMemoryRepository, createFakeTransport } from '@codewithrajat/rm-logvault/testing';

const repository = createMemoryRepository();
const transport = createFakeTransport({ status: 202 });

initTelemetry({ appName: 'unit-test', repository, shortcut: false, rest: { errorsUrl: '/x', transport } });

captureError(new Error('boom'));
logger.error('[Test] something happened');
await flushTelemetry();

expect(repository.errors.all()).toHaveLength(1);
expect(transport.requests).toHaveLength(1);

destroyTelemetry();
```

`createFakeTransport` can script every upload branch — success, retryable, terminal, `Retry-After`,
transport rejection — and `createMemoryRepository({ failWith: 'unavailable' })` or `{ quotaAt: 10 }`
exercises the degraded-storage and quota-recovery paths.

### Do I need a server, a backend or an account?

**No.** This is the question everybody asks, so here is the whole answer. The default `mode: 'local'`
writes everything to IndexedDB and makes **zero network requests** — no backend, no account, no API
key, no sign-up, nothing to run. You only add a backend if you want the records uploaded somewhere,
and then it is your own endpoint.

The only network call logVault can ever make is a `POST` to an endpoint **you** configure. There is no
built-in collector, no telemetry of its own, no "phone home". If you configure nothing, it sends
nothing.

To upload as well, give it a URL — `mode` is inferred for you, and supplying one switches it to
`'remote'`:

```ts
// src/main.ts
import { initTelemetry } from '@codewithrajat/rm-logvault';

initTelemetry({
  appName: 'my-app',
  rest: { errorsUrl: '/api/telemetry/errors' }, // mode becomes 'remote' automatically
});
```

| `mode`      | What happens                                                       | When to use it                                          |
| ----------- | ------------------------------------------------------------------ | ------------------------------------------------------- |
| `'local'`   | IndexedDB only, no network. **This is the default.**               | No backend, prototypes, offline apps, strict CSP, tests |
| `'remote'`  | IndexedDB first, then uploads to your endpoints with retry/backoff | You have an endpoint                                    |
| *(omitted)* | `'remote'` if you configured a URL, otherwise `'local'`            | The common case                                         |

An explicit `mode` always wins over the inference, so this forces uploads off even if a URL is
configured somewhere in your config:

```ts
// src/main.ts
import { initTelemetry } from '@codewithrajat/rm-logvault';

initTelemetry({ appName: 'my-app', mode: 'local' });
```

**In `'remote'` mode, records still go to IndexedDB first.** Always. The upload is a second step that
reads from the database. So if your endpoint is down, if the user is on a plane, if your server is
mid-deploy — nothing is lost. Records sit there marked `pending` and are uploaded when the endpoint
starts answering again.

> **One thing to know:** setting `mode: 'remote'` without configuring a valid endpoint does not
> upload anything. There is no destination, so the uploader stays off and records simply accumulate
> locally. logVault does not leave you guessing: it reports the stage
> `mode-remote-without-endpoint` to your `onInternalError` callback once, so a typo in a URL shows up
> immediately instead of as an empty dashboard. If you meant to upload, set `rest.errorsUrl` (or
> `rest.logsUrl`) as well.

### How big is the bundle, and is it tree-shakeable?

"Tree-shaking" means your bundler drops the code you never import. Yes, logVault is tree-shakeable:
because the package is published with `sideEffects: false`, importing one function costs only that
function's transitive closure, and a type-only import ships nothing at all. Reaching for
`captureError` alone is roughly a quarter of the full recorder.

The published build is unminified (your bundler minifies). These numbers are measured with esbuild,
minified and gzipped, by `scripts/measure-size.mjs`:

| What you import                  | min+gzip   |
| -------------------------------- | ---------- |
| types only                       | 0.06 kB    |
| `logger` only                    | 5.76 kB    |
| `sanitizeValue` only             | 5.77 kB    |
| `captureError` only              | 7.10 kB    |
| `exportDiagnosticsReport` only   | 14.91 kB   |
| `@codewithrajat/rm-logvault/testing`               | 1.14 kB    |
| `@codewithrajat/rm-logvault/http`                  | 7.49 kB    |
| `@codewithrajat/rm-logvault/storage`               | 6.09 kB    |
| `@codewithrajat/rm-logvault/react`                 | 6.89 kB    |
| `@codewithrajat/rm-logvault/axios`                 | 7.69 kB    |
| `@codewithrajat/rm-logvault/fetch`                 | 8.15 kB    |
| `initTelemetry` (the full recorder) | 31.72 kB |
| `initTelemetry` + `logger`       | 31.74 kB   |
| `events` + context builders      | 33.10 kB   |
| whole barrel, `dist/index.js`    | 36.55 kB   |

Framework adapters are separate subpaths and **no framework is ever bundled** — React, Vue, Angular,
axios and TanStack Query all stay external, provided by your app. `http` and `storage` are subpaths
with no peer at all. The regression budget is 37 kB, enforced in CI, so an accidentally-bundled
dependency fails the build.

Reproduce the table with `pnpm run size:consumers` (after `pnpm run build`). The whole-barrel figure
comes from `pnpm run size`, which is the CI gate.

### Is it really dependency-free?

Yes. `package.json` has no `dependencies` field at all, so installing logVault installs exactly one
package and runs no install script. The framework packages are optional peers, pulled in only if you
import the matching adapter subpath.

---

## Browser Compatibility

### Supported Browsers

| Browser          | Version | Support Level | Notes                                                        |
| ---------------- | ------- | ------------- | ------------------------------------------------------------ |
| Chrome           | Evergreen (last 2) | Full Support | Recommended browser                              |
| Edge             | Evergreen (last 2) | Full Support | Chromium-based                                   |
| Firefox          | Evergreen (last 2) | Full Support | Works perfectly                                  |
| Safari           | Evergreen (last 2) | Full Support | macOS and iOS                                    |
| Chrome for Android | Evergreen (last 2) | Full Support | Mobile support                                |
| Samsung Internet | Evergreen (last 2) | Full Support | Mobile support                                 |

Evergreen Chrome, Edge, Firefox and Safari (last 2 versions). IndexedDB is used directly, through
`globalThis.indexedDB`, with no wrapper and nothing to polyfill.

### Storage Availability

Availability is not durability. The limits that actually bite are Safari's seven-day cap on
script-writable storage, private windows, third-party partitioning and opaque origins, quota and
eviction, and a blocked upgrade. Each one is documented with what it does to your data in
[docs/BROWSER-SUPPORT.md](docs/BROWSER-SUPPORT.md).

### Server-Side Rendering

Server-side rendering is safe: no module-level code touches a browser global, and every accessor
checks first. `initTelemetry` on the server installs no listeners and finds no database, so nothing
is persisted — call it from browser code only.

### Not Supported

- Server-side persistence — `initTelemetry` on the server installs nothing and stores nothing.
- Environments without IndexedDB and without a custom `repository` — capture, redaction and console
  output keep working, but `getTelemetryStatus().storage` reports `'unavailable'` and nothing is
  persisted.
- The `Ctrl+Shift+Alt+D` shortcut on phones and tablets — there is no keyboard, so call
  `exportDiagnosticsReport()` from a button instead.

---

## Configuration

`initTelemetry({ ... })` takes one object. Every field is optional and every field has a safe
default, so `initTelemetry({ appName: 'my-app' })` is a complete configuration.

Two rules apply everywhere:

- **Precedence:** explicit option > environment layer (`fromEnv`) > built-in default.
- **A bad value is ignored, not obeyed.** A non-positive, `NaN` or `Infinity` number falls back to
  the default, and an unrecognised level string is ignored. A typo can never turn on verbose
  persistence.

### Top level

| Option            | Type                                                       | Default                     | What it does                                                                                       |
| ----------------- | ---------------------------------------------------------- | --------------------------- | -------------------------------------------------------------------------------------------------- |
| `appName`         | `string \| undefined`                                      | `undefined`                 | Your app's name. Stamped onto every record.                                                        |
| `appVersion`      | `string \| undefined`                                      | `undefined`                 | Your app's version. Stamped onto every record.                                                     |
| `buildId`         | `string \| undefined`                                      | `undefined`                 | Build identifier (a commit SHA, a CI run id) so a report points at a deploy.                       |
| `environment`     | `string \| undefined`                                      | `undefined`                 | Deployment environment, e.g. `production`.                                                         |
| `enabled`         | `boolean \| undefined`                                     | `true`                      | Master switch. `false` makes every capture a no-op and buffers nothing.                            |
| `mode`            | `'local' \| 'remote' \| undefined`                         | inferred — see below        | Where records go. See [Do I need a server?](#do-i-need-a-server-a-backend-or-an-account).                                  |
| `dbPrefix`        | `string \| undefined`                                      | `'rm-logvault'`                | Database name prefix; produces `rm-logvault-errors` and `rm-logvault-logs`.                              |
| `openTimeoutMs`   | `number \| undefined`                                      | `5000`                      | How long to wait for an IndexedDB `open()` before declaring storage unavailable.                          |
| `env`             | `boolean \| string \| string[] \| undefined`               | `undefined` (off)           | Opt in to reading build-time env vars. `true` uses `VITE_` / `NEXT_PUBLIC_` / `REACT_APP_`.        |
| `errors`          | `ErrorsOptions \| undefined`                               | see below                   | Error-capture configuration.                                                                       |
| `logs`            | `LogsOptions \| undefined`                                 | see below                   | Log-capture configuration.                                                                         |
| `redaction`       | `RedactionOptions \| undefined`                            | see below                   | Extensions to the built-in redaction rules.                                                        |
| `rest`            | `RestOptions \| undefined`                                 | see below                   | Upload configuration.                                                                              |
| `shortcut`        | `false \| ShortcutOptions \| undefined`                    | enabled, `Ctrl+Shift+Alt+D` | The diagnostics-export shortcut. `false` disables it.                                              |
| `consent`         | `() => boolean \| undefined`                               | `undefined`                 | Gate evaluated before every capture, save and upload. A throwing gate fails closed (stores nothing). |
| `onInternalError` | `(stage: string, error: unknown) => void \| undefined`     | `undefined`                 | Observe logVault's own failures. Each stage is reported at most once per initialization.           |
| `repository`      | `TelemetryRepository \| undefined`                         | IndexedDB                   | Swap IndexedDB for a custom backend. `@codewithrajat/rm-logvault/testing` ships an in-memory one.                    |
| `logSource`       | `ExternalLogSource \| undefined`                           | `undefined`                 | Attach to an existing application logger that exposes `addSink`.                                   |

`mode` inference: `'remote'` when uploads are actually enabled — that is, when `rest.enabled` is true,
which itself defaults to true when you supply `rest.errorsUrl`, `rest.logsUrl` or a custom
`rest.transport`. Configuring endpoints and then switching them off with `rest.enabled: false` reports
`'local'`, because that is what is happening. An explicit `mode` always wins over the inference.

### `errors.*`

| Option                             | Type                                                        | Default                                        | What it does                                                                                    |
| ---------------------------------- | ----------------------------------------------------------- | ---------------------------------------------- | ----------------------------------------------------------------------------------------------- |
| `enabled`                          | `boolean \| undefined`                                      | `true`                                         | Capture errors at all.                                                                          |
| `maxRecords`                       | `number \| undefined`                                       | `500`                                          | Hard cap on retained error rows; the oldest overflow goes first.                                |
| `retentionDays`                    | `number \| undefined`                                       | `7`                                            | Delete errors older than this. `0` disables the age cutoff.                                     |
| `maxPayloadBytes`                  | `number \| undefined`                                       | `16384`                                        | Byte budget per record before logVault progressively trims it.                                  |
| `maxEventsPerMinute`               | `number \| undefined`                                       | `120`                                          | Rate limit. Excess is dropped and summarised in one line when the window rolls.                 |
| `allowedQueryParams`               | `string[] \| undefined`                                     | `[]` (falls back to the redaction default)     | Query parameter names whose **values** survive redaction. Same list as `redaction.allowedQueryParams`. |
| `preventDefaultUnhandledRejection` | `boolean \| undefined`                                      | `false`                                        | Call `preventDefault()` on `unhandledrejection`. Left `false` so logVault never changes your app's visible behaviour. |
| `captureResources`                 | `boolean \| undefined`                                      | `false`                                        | Also capture failed `<script>`, `<link>` and `<img>` loads.                                     |
| `captureCsp`                       | `boolean \| undefined`                                      | `false`                                        | Also listen for `securitypolicyviolation` events.                                               |
| `captureChunkErrors`               | `boolean \| undefined`                                      | `true`                                         | Classify dynamic-import failures as `source: 'chunk'`, severity `fatal`.                        |
| `beforeCapture`                    | `(record: ErrorRecord) => ErrorRecord \| null \| undefined` | `undefined`                                    | Last chance to inspect, change or drop a record before it is saved. Return `null` to drop it.    |

### `logs.*`

| Option             | Type                                                    | Default     | What it does                                                                                    |
| ------------------ | ------------------------------------------------------- | ----------- | ----------------------------------------------------------------------------------------------- |
| `enabled`          | `boolean \| undefined`                                  | `true`      | Save logs at all.                                                                               |
| `level`            | `LogLevelSetting \| undefined`                          | `'warn'`    | The **persisted** level — the minimum level written to the database. Independent of the console level. |
| `consoleLevel`     | `LogLevelSetting \| undefined`                          | **none**    | The **console** level, applied at init. Omitting it leaves the logger's own level alone, so initialising telemetry never changes console output by itself. |
| `maxRecords`       | `number \| undefined`                                   | `2000`      | Hard cap on retained log rows.                                                                  |
| `retentionDays`    | `number \| undefined`                                   | `3`         | Delete logs older than this. `0` disables the age cutoff.                                       |
| `maxPayloadBytes`  | `number \| undefined`                                   | `4096`      | Byte budget per log record.                                                                     |
| `maxLogsPerMinute` | `number \| undefined`                                   | `600`       | Rate limit for log persistence.                                                                 |
| `writeFlushMs`     | `number \| undefined`                                   | `1000`      | Upper bound in ms on how long a buffered log waits before being written.                        |
| `writeBatchSize`   | `number \| undefined`                                   | `50`        | Buffered entries that trigger an immediate write; also the transaction batch size.               |
| `captureConsole`   | `boolean \| undefined`                                  | `false`     | Wrap `console.warn` and `console.error` so existing calls are captured too.                     |
| `beforeStore`      | `(record: LogRecord) => LogRecord \| null \| undefined` | `undefined` | Last chance to inspect, change or drop a log record before it is saved.                         |

### `redaction.*`

| Option               | Type                                | Default           | What it does                                                                                                       |
| -------------------- | ----------------------------------- | ----------------- | ------------------------------------------------------------------------------------------------------------------ |
| `extraSensitiveKeys` | `(string \| RegExp)[] \| undefined` | `[]`              | Extra sensitive key names or patterns. A string matches the key exactly, after lowercasing and stripping `-`, `_` and spaces. |
| `extraPatterns`      | `RegExp[] \| undefined`             | `[]`              | Extra free-text patterns, applied **after** the built-in rules so they win.                                         |
| `allowedQueryParams` | `string[] \| undefined`             | the built-in list | Query parameter names whose values survive redaction. Replaces the default list entirely.                           |

The built-in allow-list is `limit`, `offset`, `page`, `pageSize`, `size`, `sort`, `order`, `scope`,
`lng`, `lang`, `type`. Only values survive, capped at 100 characters, and a key that is also
sensitive is never allowed through.

### `rest.*`

| Option              | Type                                                                         | Default                                                            | What it does                                                                                                     |
| ------------------- | ---------------------------------------------------------------------------- | ------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------- |
| `enabled`           | `boolean \| undefined`                                                       | `true` when a URL or a `transport` is supplied, else `false`        | Uploads on or off.                                                                                               |
| `errorsUrl`         | `string \| undefined`                                                        | `undefined`                                                        | Endpoint for error batches. Absolute, or relative to the current origin.                                          |
| `logsUrl`           | `string \| undefined`                                                        | `undefined`                                                        | Endpoint for log batches.                                                                                        |
| `intervalMs`        | `number \| undefined`                                                        | `30000`                                                            | Delay between successful flushes.                                                                                |
| `batchSize`         | `number \| undefined`                                                        | `50`                                                               | Records per request.                                                                                             |
| `credentials`       | `RequestCredentials \| undefined`                                            | `'same-origin'`                                                    | The `fetch` credentials mode. Never implicitly `'include'`.                                                       |
| `getHeaders`        | `() => Record<string, string> \| Promise<Record<string, string>> \| undefined` | `undefined`                                                        | Header provider, awaited per request so a token can be refreshed. A throwing provider is a **retryable** failure. |
| `transport`         | `RemoteTransport \| undefined`                                               | the built-in `fetch` transport                                     | Custom transport. Supplying one also switches `mode` to `'remote'`.                                               |
| `requireHttps`      | `boolean \| undefined`                                                       | `false`                                                            | Reject plain `http:` endpoints except on localhost.                                                              |
| `onTerminalFailure` | `(status: number, records: { id: string }[]) => void \| undefined`           | `undefined`                                                        | Called once per permanently-failed batch, so your app can re-authenticate and retry.                              |

### `shortcut`

| Option           | Type                                 | Default                | What it does                                                                                   |
| ---------------- | ------------------------------------ | ---------------------- | ---------------------------------------------------------------------------------------------- |
| `key`            | `string \| undefined`                | `'d'`                  | The key. A single letter maps to `Key<X>`, a digit to `Digit<N>`.                              |
| `ctrl`           | `boolean \| undefined`               | `true`                 | Require Ctrl.                                                                                  |
| `shift`          | `boolean \| undefined`               | `true`                 | Require Shift.                                                                                 |
| `alt`            | `boolean \| undefined`               | `true`                 | Require Alt.                                                                                   |
| `meta`           | `boolean \| undefined`               | `false`                | Require Meta/Cmd. Matching is exact: an extra modifier means no match.                          |
| `target`         | `EventTarget \| undefined`           | `document`             | Where the listener is attached.                                                                |
| `allow`          | `() => boolean \| undefined`         | `undefined`            | Gate that must return `true` for the shortcut to fire. A throwing gate suppresses the trigger.  |
| `filenamePrefix` | `string \| undefined`                | `'diagnostics-report'` | Downloaded filename prefix.                                                                    |
| `onExported`     | `(ok: boolean) => void \| undefined` | `undefined`            | Called with the export outcome.                                                                |

### Environment variables

Opt in with `env: true`, or pass `fromEnv('VITE_')` yourself. Variables are read from
`import.meta.env` first, then `process.env`, trying `VITE_`, `NEXT_PUBLIC_` and `REACT_APP_` in
order. The first non-empty match wins.

| Variable suffix                        | Maps to                     | Unit / values                          | Default   |
| -------------------------------------- | --------------------------- | -------------------------------------- | --------- |
| `APP_NAME`                             | `appName`                   | string                                 | none      |
| `APP_VERSION`                          | `appVersion`                | string                                 | none      |
| `BUILD_ID`                             | `buildId`                   | string                                 | none      |
| `APP_ENV` / `ENVIRONMENT`              | `environment`               | string                                 | none      |
| `TELEMETRY_ENABLED`                    | `enabled`                   | `true`/`false`                         | `true`    |
| `TELEMETRY_DB_PREFIX`                  | `dbPrefix`                  | string                                 | `rm-logvault` |
| `TELEMETRY_OPEN_TIMEOUT_MS`            | `openTimeoutMs`             | milliseconds to wait for an IndexedDB open | `5000` |
| `ERROR_TRACKING_ENABLED`               | `errors.enabled`            | `true`/`false`                         | `true`    |
| `ERROR_TRACKING_RETENTION_DAYS`        | `errors.retentionDays`      | days; `0` = no age cutoff              | `7`       |
| `ERROR_TRACKING_MAX_RECORDS`           | `errors.maxRecords`         | rows                                   | `500`     |
| `ERROR_TRACKING_MAX_PAYLOAD_BYTES`     | `errors.maxPayloadBytes`    | UTF-8 bytes per record                 | `16384`   |
| `ERROR_TRACKING_MAX_EVENTS_PER_MINUTE` | `errors.maxEventsPerMinute` | events / 60 s; `0` = unlimited         | `120`     |
| `LOG_PERSIST_ENABLED`                  | `logs.enabled`              | `true`/`false`                         | `true`    |
| `LOG_LEVEL`                            | `logs.consoleLevel`         | level — console only                   | unchanged |
| `LOG_PERSIST_LEVEL`                    | `logs.level`                | level; empty inherits `LOG_LEVEL`      | `warn`    |
| `LOG_PERSIST_RETENTION_DAYS`           | `logs.retentionDays`        | days; `0` = no age cutoff              | `3`       |
| `LOG_PERSIST_MAX_RECORDS`              | `logs.maxRecords`           | rows                                   | `2000`    |
| `LOG_PERSIST_MAX_PAYLOAD_BYTES`        | `logs.maxPayloadBytes`      | UTF-8 bytes per record                 | `4096`    |
| `LOG_PERSIST_MAX_LOGS_PER_MINUTE`      | `logs.maxLogsPerMinute`     | logs / 60 s; `0` = unlimited           | `600`     |
| `LOG_PERSIST_WRITE_FLUSH_MS`           | `logs.writeFlushMs`         | milliseconds; upper bound on a buffered log | `1000` |
| `LOG_PERSIST_WRITE_BATCH_SIZE`         | `logs.writeBatchSize`       | entries that trigger a write           | `50`      |
| `TELEMETRY_REST_ENABLED`               | `rest.enabled`              | `true`/`false`                         | `true` with a URL |
| `ERROR_TRACKING_REST_URL`              | `rest.errorsUrl`            | absolute `http(s)` or a path           | none      |
| `LOG_TRACKING_REST_URL`                | `rest.logsUrl`              | absolute `http(s)` or a path           | none      |
| `TELEMETRY_SYNC_INTERVAL_MS`           | `rest.intervalMs`           | milliseconds                           | `30000`   |
| `TELEMETRY_SYNC_BATCH_SIZE`            | `rest.batchSize`            | records per request                    | `50`      |

So the full spellings include `VITE_APP_NAME`, `NEXT_PUBLIC_ERROR_TRACKING_REST_URL` and
`REACT_APP_LOG_PERSIST_MAX_RECORDS`. Booleans accept `true`/`1`/`yes`/`on` and `false`/`0`/`no`/`off`,
case-insensitively; anything else is ignored, and so is an unparseable or negative number — a typo
falls back to the default rather than silently changing behaviour. **The core never reads
`import.meta.env` unless you opt in** — that is what keeps it usable in Node, in SSR and in a plain
`<script type="module">`.

Older names (`TELEMETRY_ERRORS_ENABLED`, `TELEMETRY_LOGS_ENABLED`, `TELEMETRY_PERSIST_LEVEL`,
`TELEMETRY_LOG_LEVEL`, `TELEMETRY_ERRORS_URL`, `TELEMETRY_LOGS_URL`) are still read, and the specific
names above win when both are set. `TELEMETRY_LOG_LEVEL` has always meant the **persist** level and
never touched the console, so an existing deployment's console output does not change. Every option,
unit and edge case is spelled out in
[docs/API.md](docs/API.md#every-option-annotated).

```ts
// src/main.ts
import { initTelemetry } from '@codewithrajat/rm-logvault';

// The environment layer. An explicit option still wins over it.
initTelemetry({ env: true }); // VITE_ / NEXT_PUBLIC_ / REACT_APP_
initTelemetry({ env: 'NEXT_PUBLIC_' }); // one prefix
initTelemetry({ env: ['VITE_', 'PUBLIC_'] }); // several, in order
```

**Do not spread `fromEnv()` into the options object.** It returns a *flat* object
(`errorsEnabled`, `logsMaxRecords`, `errorsUrl`, …) while the environment layer is read only through
`options.env`, so a spread carries just the six top-level identity fields and silently drops every
nested one. Use `env:` for the environment, or `fromEnv()` when you want to read the values and place
them yourself:

The exhaustive reference, with copy-pasteable presets, is
[docs/CONFIGURATION.md](docs/CONFIGURATION.md).

---

## Sending data to your own API

You configure the URL. logVault does the rest: batches, retries, backoff, and never losing a record.

```ts
// src/main.ts
import { initTelemetry } from '@codewithrajat/rm-logvault';

initTelemetry({
  appName: 'my-app',
  appVersion: '2.4.1',
  environment: 'production',
  rest: {
    errorsUrl: '/api/telemetry/errors',
    logsUrl: '/api/telemetry/logs',
    batchSize: 50,
    intervalMs: 30_000,
    getHeaders: async () => ({ Authorization: `Bearer ${await getToken()}` }),
    onTerminalFailure: (status) => {
      if (status === 401) void refreshSession().then(() => retryFailedTelemetry());
    },
  },
});
```

### What arrives

One `POST` per record kind, per batch, with `Content-Type: application/json`. The envelope is small
and stable:

```jsonc
// the request body logVault sends — you do not write this file
{
  "schemaVersion": 1,
  "kind": "errors", // or "logs"
  "sentAt": 1759482901123,
  "app": {
    "appName": "my-app",
    "appVersion": "2.4.1",
    "buildId": "8f3c2ab",
    "environment": "production"
  },
  "records": [
    {
      "id": "f47ac10b-58cc-4372-a567-0e02b2c3d479",
      "source": "window",
      "severity": "error",
      "name": "TypeError",
      "message": "Cannot read properties of undefined (reading 'total')",
      "stack": "TypeError: …\n    at total (/assets/checkout-8f3c2ab.js:1:48213)",
      "occurrenceCount": 3,
      "firstSeen": 1759482900000,
      "lastSeen": 1759482901500,
      "tags": { "flow": "checkout" }
    }
  ]
}
```

Your response only needs a status code. **The body is never read** — not on success, not on failure.

### Status-code handling

| Status                                                        | Outcome     | What logVault does                                                                                |
| ------------------------------------------------------------- | ----------- | ------------------------------------------------------------------------------------------------- |
| `200`–`299`                                                   | `ok`        | Records are deleted locally, then the next batch is claimed.                                       |
| `400`, `401`, `403`, `404`, `405`, `410`, `413`, `415`, `422` | `terminal`  | Records are marked `failed` and stop being retried automatically. `onTerminalFailure` is called.    |
| `408`, `429`, every `5xx`                                     | `retryable` | Records go back to `pending`, the run stops, and the next attempt is scheduled with backoff.       |
| Network error, timeout, abort, or a throwing transport        | `retryable` | Same as above.                                                                                     |
| `0` (the request never landed)                                | `retryable` | Treated as retryable.                                                                              |

The terminal set is closed: `400, 401, 403, 404, 405, 410, 413, 415, 422`. Everything else is
retried — including statuses you might not expect, such as `402`, `406`, `409` and `418`.

### Backoff and `Retry-After`

After a failure the next attempt waits `min(15000 × 2^(failures-1), 900000)` ms: 15 s, 30 s, 60 s, …
up to 15 minutes. On success the counter resets and the steady `rest.intervalMs` (30 s by default)
resumes. A `Retry-After` header is honoured in both forms (`120`, or an HTTP date), clamped to
15 minutes, and combined as `max(backoff, retryAfter)` — so your server can slow the client down but
never speed it up.

### Duplicates and idempotency

logVault deletes a record **only after** your server answers with a 2xx. If the response is lost
after your side committed — a dropped connection, a proxy timeout, the user closing the tab — the
record is sent again. Delivery is therefore **at least once**, and duplicate `id`s are normal.

The `id` is generated once and never changes across retries, so key on it and make the repeat a
no-op:

```sql
-- run once on your server, as part of your schema
INSERT INTO telemetry_records (id, kind, payload) VALUES ($1, $2, $3)
ON CONFLICT (id) DO NOTHING;
```

### After a re-authentication (the 401 case)

A `401` marks the batch `failed` permanently. That is right for a malformed request and wrong for an
expired token — otherwise one stale session silently discards everything captured while it was
stale. After refreshing credentials, put them back in the queue:

```ts
// anywhere you handle authentication
import { retryFailedTelemetry, syncTelemetry } from '@codewithrajat/rm-logvault';

await refreshSession();
const requeued = await retryFailedTelemetry(); // 'failed' → 'pending', backoff cleared
await syncTelemetry(); // upload right now instead of waiting
```

The full wire contract, including a JSON Schema and example server handlers, is in
[docs/REST-CONTRACT.md](docs/REST-CONTRACT.md).

---

## Dependencies and compatibility

**Zero runtime dependencies.** `package.json` has no `dependencies` field at all. Nothing is
installed beyond the package itself, and no install script runs.

**Framework packages are optional peers.** `react`, `vue`, `@angular/core`, `axios` and
`@tanstack/react-query` are declared as peer dependencies, every one marked optional, and each is
required only if you import the matching adapter subpath. Installing `@codewithrajat/rm-logvault` never pulls any of
them in.

| Subpath                | Needs                          |
| ---------------------- | ------------------------------ |
| `@codewithrajat/rm-logvault`             | nothing                        |
| `@codewithrajat/rm-logvault/react`       | `react >= 17`                  |
| `@codewithrajat/rm-logvault/vue`         | `vue >= 3`                     |
| `@codewithrajat/rm-logvault/angular`     | `@angular/core >= 15`          |
| `@codewithrajat/rm-logvault/axios`       | `axios >= 1`                   |
| `@codewithrajat/rm-logvault/fetch`       | nothing                        |
| `@codewithrajat/rm-logvault/react-query` | `@tanstack/react-query >= 4`   |
| `@codewithrajat/rm-logvault/http`        | nothing                        |
| `@codewithrajat/rm-logvault/storage`     | nothing                        |
| `@codewithrajat/rm-logvault/testing`     | nothing                        |

**Framework-agnostic by construction.** The core contains no framework code; the adapters are thin,
optional, separate entry points that exist precisely so a Vue app never ships React code.

**Browser support.** Evergreen Chrome, Edge, Firefox and Safari (last 2 versions). IndexedDB is used
directly, through `globalThis.indexedDB`, with no wrapper and nothing to polyfill — but availability
is not durability, and the limits that actually bite (Safari's seven-day cap on script-writable
storage, private windows, third-party partitioning and opaque origins, quota and eviction, a blocked
upgrade) are documented with what each one does to your data in
[docs/BROWSER-SUPPORT.md](docs/BROWSER-SUPPORT.md). Server-side rendering is safe: no module-level
code touches a browser global, and every accessor checks first.

**TypeScript.** Written in TypeScript with the strictest settings, and ships its own type
declarations for every subpath. No `@types` package needed.

---

## Troubleshooting

| Symptom                                       | Likely cause                                                                                                        | Fix                                                                                                                             |
| --------------------------------------------- | ------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------- |
| The report is empty                           | Nothing was captured yet, storage is unavailable, or the export raced a pending write                                | Call `await flushTelemetry()` first, then check `getTelemetryStatus().pending`                                                   |
| Storage reports `unavailable`                 | Safari private mode, a sandboxed iframe, IndexedDB turned off, or server-side rendering                               | Check `getTelemetryStatus().storage`; `onInternalError` will have reported a `storage (unavailable)` stage                       |
| Info-level logs are missing                   | `logs.level` defaults to `'warn'`                                                                                    | Set `logs: { level: 'info' }` — `logger.setLevel` does **not** affect what is saved                                             |
| Nothing is uploaded                           | No endpoint configured, `rest.enabled` resolved to `false`, or the URL failed validation                             | Confirm `rest.errorsUrl` is set and valid, and that `getTelemetryStatus().mode` is `'remote'`                                   |
| The shortcut does nothing                     | Focus is inside an input/textarea/`contenteditable`, `allow()` returned false, an extra modifier is held, or `shortcut: false` | Click the page background first, then check the modifiers and your `allow` gate                                                 |
| CORS errors on upload                         | The endpoint does not allow your origin, or does not answer the `OPTIONS` preflight                                  | Check the failing request in the Network tab; the server needs `Access-Control-Allow-Origin` and `Access-Control-Allow-Headers` |
| CSP blocks the upload                         | `connect-src` does not include the endpoint origin                                                                    | Add the origin to `connect-src` — a missing directive falls back to `default-src`                                                |
| Records are stuck in `failed`                 | A terminal status (`400`, `401`, `403`, `404`, `405`, `410`, `413`, `415`, `422`) marked the whole batch              | Inspect `onTerminalFailure`'s arguments, fix the cause, then call `retryFailedTelemetry()`                                      |
| The same error appears twice                  | At-least-once delivery after a lost 2xx, or two separate copies of the library in different module realms             | Key your server on the record `id`; check for a duplicate bundled copy                                                          |
| Errors thrown before `initTelemetry` are missing | The 50-entry pre-init buffer overflowed, or `enabled: false` suppressed them                                        | Call `initTelemetry` as early as you can; the buffer keeps the oldest 50 and drops the newest overflow                          |
| The bundle is over 37 kB                      | An adapter was imported into the main entry, or the whole package was imported for one helper                        | Import `@codewithrajat/rm-logvault/react` and friends as subpaths; run `pnpm run size`                                                             |
| A record contains `[REDACTED]` where you wanted data | A key name matched the sensitive-key pattern, or a query-string value is not allow-listed                            | Rename the field so it no longer looks sensitive, or add the parameter name to `redaction.allowedQueryParams`                   |

Fuller symptom-by-symptom entries live in [docs/TROUBLESHOOTING.md](docs/TROUBLESHOOTING.md).

---

## Statistics

[![npm downloads](https://img.shields.io/npm/dt/@codewithrajat/rm-logvault.svg)](https://www.npmjs.com/package/@codewithrajat/rm-logvault)
[![npm version](https://img.shields.io/npm/v/@codewithrajat/rm-logvault.svg)](https://www.npmjs.com/package/@codewithrajat/rm-logvault)
[![GitHub issues](https://img.shields.io/github/issues/malikrajat/rm-logvault.svg)](https://github.com/malikrajat/rm-logvault/issues)
[![GitHub stars](https://img.shields.io/github/stars/malikrajat/rm-logvault.svg?style=social)](https://github.com/malikrajat/rm-logvault/stargazers)
[![License](https://img.shields.io/badge/license-MIT-blue.svg)](https://github.com/malikrajat/rm-logvault/blob/main/LICENSE)

---

## Support This Project

If **@codewithrajat/rm-logvault** has helped you build better applications, please consider:

If this library has saved you development time and helped keep your error handling under control, **please consider giving it a star!**

**Why star this repo?**

- Help other developers discover this zero-dependency, offline-first solution
- Support continued development and improvements
- Show appreciation for free, quality tools
- Boost visibility in the web development community
- Supports ongoing development and maintenance
- Encourages more open-source contributions
- Helps other developers find quality tools

### **Want More Quality Libraries?**

This is just one of several useful libraries I've created. **[Explore my other Angular & web development libraries](https://github.com/malikrajat?tab=repositories)** that might solve your next challenge:

- **Utility libraries** for common development tasks
- **UI components** for better user experiences
- **Performance tools** for optimization
- **Mobile-friendly solutions** for responsive apps

**Found them helpful?** A star on each repo you find useful helps tremendously! It takes just one click but means the world to open-source maintainers.

[![GitHub](https://img.shields.io/badge/View_All_Repositories-181717?logo=github)](https://github.com/malikrajat?tab=repositories)
[![GitHub followers](https://img.shields.io/github/followers/malikrajat?style=social)](https://github.com/malikrajat)
[![GitHub stars](https://img.shields.io/github/stars/malikrajat/rm-logvault?style=social)](https://github.com/malikrajat/rm-logvault/stargazers)

---

## Support and Community

### Getting Help

Need assistance? We're here to help!

| Support Channel   | Link                                                                                                          | Best For           |
| ----------------- | ------------------------------------------------------------------------------------------------------------- | ------------------ |
| Bug Reports       | [Report Bug](https://github.com/malikrajat/rm-logvault/issues/new?template=bug_report.md)                          | Technical issues   |
| Feature Requests  | [Request Feature](https://github.com/malikrajat/rm-logvault/issues/new?template=feature_request.md)                | New features       |
| Discussions       | [Join Discussion](https://github.com/malikrajat/rm-logvault/discussions)                                          | General questions  |
| Email             | [mr.rajatmalik@gmail.com](mailto:mr.rajatmalik@gmail.com?subject=rm-logvault%20Support)                        | Direct support     |

### Documentation

- [GitHub Repository](https://github.com/malikrajat/rm-logvault)
- [npm Package](https://www.npmjs.com/package/@codewithrajat/rm-logvault)
- [Changelog](https://github.com/malikrajat/rm-logvault/blob/main/CHANGELOG.md)
- [docs/README.md](docs/README.md) — index of every document, with a one-line summary of each.
- [examples/README.md](examples/README.md) — runnable code for every feature, in each of five frameworks — vanilla, React, Vue, Angular and Next.js — organised into `basic`, `advanced`, `config` and `more-advanced` tiers.
- [React: a complete integration, in order](examples/react/START-HERE.md) — **New to the library? Start here.** A linear walkthrough — four steps, two files — from nothing to a working React setup with a real fallback UI.
- [docs/API.md](docs/API.md) — every exported symbol, with signatures and examples.
- [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) — the capture pipeline, the diagnostics-export path, sequence diagrams and the load-bearing mechanisms.
- [docs/CONFIGURATION.md](docs/CONFIGURATION.md) — the exhaustive option reference, precedence and presets.
- [docs/OPTIONS-CHEATSHEET.md](docs/OPTIONS-CHEATSHEET.md) — the complete options object, every default inline, a deep dive per option and six presets.
- [docs/REST-CONTRACT.md](docs/REST-CONTRACT.md) — the wire format, JSON Schema, status codes and server obligations.
- [docs/SECURITY.md](docs/SECURITY.md) — threat model, redaction design, XSS safety and disclosure policy.
- [docs/PRIVACY-GDPR.md](docs/PRIVACY-GDPR.md) — lawful basis, retention, erasure and the consent gate.
- [docs/BROWSER-SUPPORT.md](docs/BROWSER-SUPPORT.md) — IndexedDB availability, and the browser storage limits that bite.
- [docs/TROUBLESHOOTING.md](docs/TROUBLESHOOTING.md) — symptom-by-symptom diagnosis and fixes.
- [docs/DECISIONS.md](docs/DECISIONS.md) — the architecture decision log, with alternatives considered.

### Community

- Star the repository to show support
- Watch for updates and new releases
- Share your use cases and feedback
- Contribute code or documentation

### Stay Updated

- Follow the project on [GitHub](https://github.com/malikrajat/rm-logvault)
- Star the repository for updates
- Watch for new releases

---

## What it does not do

Saying this plainly is more useful than a long feature list.

- **No server, no account, no dashboard.** There is no logVault service. You run your own endpoint or
  you run nothing.
- **No alerting.** No thresholds, no notifications, no on-call integration.
- **No session replay.** logVault does not record DOM changes or user interactions. That is a
  different product with a different risk profile.
- **No source maps.** You get the stack the browser gave you, with function names and file paths as
  they appear in the built bundle. Symbolication needs an upload step and a server; logVault has
  neither.
- **No error grouping UI.** Records are grouped by fingerprint *inside the downloaded report*, and the
  report drills down from a page load to an error to the logs around it, but there is no hosted
  interface for triaging them. The file is the interface.
- **No at-rest encryption.** Records in IndexedDB are redacted, not encrypted.

If you need replay, symbolication or alert rules, a hosted platform is the right tool. logVault is
for keeping the evidence on the device, under your own control, at zero cost and zero dependencies.

---

## Testing and Contributing

Bug reports, adapter proposals and documentation fixes are welcome. Start with
[CONTRIBUTING.md](CONTRIBUTING.md) for the development setup, the script list, the commit scopes, the
coverage gates and the pull-request checklist.

```bash
# in a clone of the repository
pnpm install
pnpm run verify
```

### Security

Please do not open a public issue for a vulnerability. Use GitHub's private advisory flow at
<https://github.com/malikrajat/rm-logvault/security/advisories/new>, or read
[SECURITY.md](SECURITY.md) for the policy.

The threat model, the redaction design, the argument for the report's XSS safety, the network-egress
guarantee and the fail-closed policy are documented in [docs/SECURITY.md](docs/SECURITY.md).

---

## Acknowledgments

This library was created to provide a modern, dependency-free, privacy-first way to keep browser
errors and logs on the user's own device. Special thanks to the web development community for their
feedback and contributions.

Special thanks to:

- **Browser vendors** - For IndexedDB, and for the platform APIs that make this possible
- **Contributors** - Thank you for making this library better
- **Community** - For feedback, bug reports, and feature requests

---

## Other Libraries

### Monitoring & Diagnostics

| Library | Description | Link |
| --- | --- | --- |
| **@codewithrajat/rm-logvault** | Offline-first browser error tracking, logging and one-file diagnostics export. Redacts PII before writing, stores in IndexedDB, uploads only to your own endpoint. **Zero dependencies, tree-shakeable, framework-agnostic** — React, Vue, Angular, axios and TanStack Query adapters included. | [![GitHub](https://img.shields.io/badge/GitHub-Repository-blue?logo=github)](https://github.com/malikrajat/rm-logvault) [![npm](https://img.shields.io/npm/v/@codewithrajat/rm-logvault.svg)](https://www.npmjs.com/package/@codewithrajat/rm-logvault) |

---

### UI Components

| Library                           | Description                                                              | npm Link                                                                                                        |
| --------------------------------- | ------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------- |
| **rm-range-slider**               | Lightweight two-thumb range slider with tooltips and color customization | [![npm](https://img.shields.io/npm/v/rm-range-slider.svg)](https://www.npmjs.com/package/rm-range-slider)       |
| **rm-ng-range-slider**            | Angular-specific version of the dual range slider                        | [![npm](https://img.shields.io/npm/v/rm-ng-range-slider.svg)](https://www.npmjs.com/package/rm-ng-range-slider) |
| **rm-carousel**                   | Simple, responsive carousel component                                    | [![npm](https://img.shields.io/npm/v/rm-carousel.svg)](https://www.npmjs.com/package/rm-carousel)               |
| **rm-image-slider**               | Minimal image slider with smooth transitions                             | [![npm](https://img.shields.io/npm/v/rm-image-slider.svg)](https://www.npmjs.com/package/rm-image-slider)       |
| **rm-ng-star-rating**             | Configurable Angular star rating component with readonly mode            | [![npm](https://img.shields.io/npm/v/rm-ng-star-rating.svg)](https://www.npmjs.com/package/rm-ng-star-rating)   |
| **@codewithrajat/rm-ng-typeahead** | Angular autocomplete/typeahead component with search suggestions and keyboard navigation | [![GitHub](https://img.shields.io/badge/GitHub-Repository-blue?logo=github)](https://github.com/malikrajat/rm-ng-typeahead) |
| **@codewithrajat/rm-ng-editor**                  | Rich text editor component for Angular applications with customizable toolbar support | [![GitHub](https://img.shields.io/badge/GitHub-Repository-blue?logo=github)](https://github.com/malikrajat/rm-ng-editor) |

---

### PDF & Export Libraries

| Library                                | Description                                                  | npm Link                                                                                                                                        |
| -------------------------------------- | ------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------- |
| **rm-ng-export-to-csv**                | Export JSON data to CSV with zero dependencies               | [![npm](https://img.shields.io/npm/v/rm-ng-export-to-csv.svg)](https://www.npmjs.com/package/rm-ng-export-to-csv)                               |
| **@codewithrajat/rm-ng-pdf-export**    | Image-based PDF export tool for Angular applications         | [![npm](https://img.shields.io/npm/v/@codewithrajat/rm-ng-pdf-export.svg)](https://www.npmjs.com/package/@codewithrajat/rm-ng-pdf-export)       |
| **@codewithrajat/rm-ng-structure-pdf** | Generate structured PDFs for reports, invoices, or documents | [![npm](https://img.shields.io/npm/v/@codewithrajat/rm-ng-structure-pdf.svg)](https://www.npmjs.com/package/@codewithrajat/rm-ng-structure-pdf) |
| **@codewithrajat/rm-ng-pdf-viewer** | Angular PDF viewer component with zoom, navigation, and document rendering support | [![GitHub](https://img.shields.io/badge/GitHub-Repository-blue?logo=github)](https://github.com/malikrajat/rm-ng-pdf-viewer) |

---

### Chrome Extension

| Library | Description | Link                                                                                                                                    |
|----------|-------------|-----------------------------------------------------------------------------------------------------------------------------------------|
| **quickocr** | Chrome extension that extracts text from images using OCR technology | [![GitHub](https://img.shields.io/badge/GitHub-Repository-blue?logo=github)](https://github.com/malikrajat/quickocr/releases)                                     |
| **readLoude** | Chrome extension that read you web page loude e.g article etc. | [![GitHub](https://img.shields.io/badge/GitHub-Repository-blue?logo=github)](https://github.com/malikrajat/readLoude/releases)                            |
| **ai-assistant-reply** | AI Chrome extension to auto generate reply on linked in posts. | [![GitHub](https://img.shields.io/badge/GitHub-Repository-blue?logo=github)](https://github.com/malikrajat/ai-assistant-reply/releases) |

---

### VS Code Extension

| Library | Description | Link                                                                                                                                      |
|----------|-------------|-------------------------------------------------------------------------------------------------------------------------------------------|
| **dead-css-cleaner** | VS Code extension for identifying and cleaning unused CSS styles | [![GitHub](https://img.shields.io/badge/GitHub-Repository-blue?logo=github)](https://github.com/malikrajat/dead-css-cleaner/releases)      |
| **file-coverage-insight** | VS Code extension for auto generated component file coverage automatelly on open. | [![GitHub](https://img.shields.io/badge/GitHub-Repository-blue?logo=github)](https://github.com/malikrajat/file-coverage-insight/releases) |

---

### Desktop Applications - All Plateform

| Library | Description | Link                                                                                                                           |
|----------|-------------|--------------------------------------------------------------------------------------------------------------------------------|
| **deepwork** | Cross-platform productivity application for focus sessions and deep work tracking | [![GitHub](https://img.shields.io/badge/GitHub-Repository-blue?logo=github)](https://github.com/malikrajat/deepwork/releases)          |
| **JsSandbox** | Cross-platform JavaScript playground and code execution environment | [![GitHub](https://img.shields.io/badge/GitHub-Repository-blue?logo=github)](https://github.com/malikrajat/JsSandbox/releases) |

---

### Device Detection

| Library                        | Description                                             | npm Link                                                                                                                        |
| ------------------------------ | ------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------- |
| **rm-ng-device-detection**     | Detect device type, OS, and browser in Angular          | [![npm](https://img.shields.io/npm/v/rm-ng-device-detection.svg)](https://www.npmjs.com/package/rm-ng-device-detection)         |

---

### Notifications

| Library           | Description                                       | npm Link                                                                                              |
| ----------------- | ------------------------------------------------- | ----------------------------------------------------------------------------------------------------- |
| **rm-pushnotify** | Lightweight push-style toast notification utility | [![npm](https://img.shields.io/npm/v/rm-pushnotify.svg)](https://www.npmjs.com/package/rm-pushnotify) |
| **@codewithrajat/rm-toast-notification** | Cross-platform toast and desktop notification library for web, Angular, and desktop applications | [![GitHub](https://img.shields.io/badge/GitHub-Repository-blue?logo=github)](https://github.com/malikrajat/rm-toast-notification) |

---

### Layout & Dynamic Rendering

| Library | Description | Link |
|----------|-------------|------|
| **rm-ng-dynamic-layout** | Dynamic layout rendering engine for Angular applications using JSON-driven UI configuration | [![GitHub](https://img.shields.io/badge/GitHub-Repository-blue?logo=github)](https://github.com/malikrajat/rm-ng-dynamic-layout) |

---

### Developer Tools & Extensions

| Library | Description | Link                                                                                                                            |
|----------|-------------|---------------------------------------------------------------------------------------------------------------------------------|
| **rm-colorful-console-logger** | Structured and colorized console logging utility for developers | [![npm](https://img.shields.io/npm/v/rm-colorful-console-logger.svg)](https://www.npmjs.com/package/rm-colorful-console-logger) |

---

### Meta & Personal Branding

| Library         | Description                                                      | npm Link                                                                                          |
| --------------- | ---------------------------------------------------------------- | ------------------------------------------------------------------------------------------------- |
| **about-rajat** | Developer portfolio package for branding and quick personal info | [![npm](https://img.shields.io/npm/v/about-rajat.svg)](https://www.npmjs.com/package/about-rajat) |

---

### All Packages

Browse all my packages:

- [npm: @codewithrajat](https://www.npmjs.com/~codewithrajat)
- [npm: rajatmalik](https://www.npmjs.com/~rajatmalik)
- [GitHub: @malikrajat](https://github.com/malikrajat?tab=repositories)

---

## Author

**Rajat Malik**

Full-Stack Developer and Frontend Architect at Siemens with 14+ years building scalable enterprise platforms, specializing in micro-frontends, AI-native development, React, and Angular.
Author of 10+ open-source libraries and 100+ technical articles, driving innovation through developer-friendly tools, performance optimization, and AI-assisted workflows.

### GET IN TOUCH

- Portfolio:  [rajatmalik.dev](https://rajatmalik.dev)
- Email:      [mr.rajatmalik@gmail.com](mailto:mr.rajatmalik@gmail.com)
- LinkedIn:   [errajatmalik](https://linkedin.com/in/errajatmalik)
- GitHub:     [@malikrajat](https://github.com/malikrajat)
- npm:        [rajatmalik](https://www.npmjs.com/~rajatmalik)

### SOCIAL PRESENCE

- Threads:    [rajatmalik](https://www.threads.net/@er.rajatmalik)
- Twitter/X:  [rajatmalik](https://x.com/er_rajatmalik)
- BlueSky:    [rajatmalik](http://devrajat.bsky.social)

### CONTENT & WRITING

- Medium:    [rajatmalik](https://medium.com/@codewithrajat)
- Dev.to:    [rajatmalik](https://dev.to/codewithrajat)
- Substack:  [rajatmalik](https://codewithrajat.substack.com)
- Hashnode:  [rajatmalik](https://hashnode.com/@codeswithrajat)

---

<p align="center">
  <p align="center">Made with care and love by <a href="https://rajatmalik.dev">Rajat Malik</a> for the developer community</p>
</p>

<p align="center">
  <a href="https://github.com/malikrajat/rm-logvault/stargazers">Star on GitHub</a> •
  <a href="https://www.npmjs.com/package/@codewithrajat/rm-logvault">View on npm</a> •
  <a href="https://github.com/malikrajat/rm-logvault/issues">Report Issue</a>
</p>

<p align="center">
  Made with dedication by <a href="https://rajatmalik.dev">Rajat Malik</a>
</p>
