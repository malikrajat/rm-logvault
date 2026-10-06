# config — environment variables (Vue 3 / Vite)

**Problem it solves:** you want one build artefact whose behaviour changes per deployment, without
branching in source and without shipping a config endpoint.

**What you will learn:**

- How Vite exposes variables to browser code, and which ones never reach the client.
- Every variable this library reads, with its **unit** and its **default**.
- The prefix rule, and how to pin your own.
- Why an unparseable value is ignored rather than applied.
- `setupTelemetry` and the flat aliases, which shorten the nested options without changing them.

## How Vite exposes variables

Vite replaces `import.meta.env.*` at **build time**, and only exposes variables whose name starts with
`VITE_`. Anything without the prefix stays on the build machine.

| File | Loaded |
| --- | --- |
| `.env` | always |
| `.env.local` | always, and git-ignored by convention |
| `.env.[mode]` (e.g. `.env.production`) | for that mode only |

Two consequences worth internalising:

- **A `VITE_` value is in the bundle.** It is visible to anyone who reads your JavaScript. It is a
  configuration value, never a secret.
- **A non-`VITE_` value is not reachable from the browser at all.** `initTelemetry({ env: true })` reads
  `import.meta.env`, so a variable without the prefix is simply not there.

The library never reads the environment unless you ask it to. That is what keeps it usable in Node, in
SSR, in a Web Worker and in a bare `<script type="module">`:

```ts
import { initTelemetry } from '@codewithrajat/rm-logvault';

initTelemetry({ env: true });        // search VITE_, NEXT_PUBLIC_, REACT_APP_ in order
initTelemetry({ env: 'VITE_' });     // pin one prefix
initTelemetry({ env: ['VITE_', 'PUBLIC_'] }); // several, first non-empty match wins
```

## The short form: `setupTelemetry` and flat aliases

An environment variable and a flat alias answer the same question at different times: the variable sets
a **deployment** default, the alias sets it in **code** for the case that needs it. Both are read, and
code wins.

`setupTelemetry` is a thin front door to `initTelemetry` — it forwards to it unchanged, so the two are
interchangeable, can be mixed, and are idempotent in exactly the same way (a second call returns the
**same handle object** and ignores the new options).

```ts
// src/telemetry.ts
import { setupTelemetry } from '@codewithrajat/rm-logvault';

// Environment first: names, versions, endpoints and levels come from `.env`.
// `env: 'VITE_'` pins the prefix so a stray NEXT_PUBLIC_ cannot be picked up.
export const telemetry = setupTelemetry({
  env: 'VITE_',
  // Code second: the one or two values this particular build must override.
  level: 'info',
  maxErrors: 1000,
});
```

The same flat names work directly on `initTelemetry`, so there is no migration cliff:

```ts
import { initTelemetry } from '@codewithrajat/rm-logvault';

// These two are equivalent.
initTelemetry({
  appName: 'checkout',
  rest: { errorsUrl: '/telemetry', logsUrl: '/telemetry' },
  logs: { level: 'info' },
});
initTelemetry({ appName: 'checkout', url: '/telemetry', level: 'info' });
```

### Precedence runs inside-out

**nested option > flat alias > `env` layer > built-in default.** An invalid or empty nested value is
**ignored and falls through** to the next candidate, exactly as an unparseable variable is:

```ts
import { resolveOptions } from '@codewithrajat/rm-logvault';

// Errors go to /errors, logs to /everything.
initTelemetry({ url: '/everything', rest: { errorsUrl: '/errors' } });

// `'verbose'` is not a level, so it is ignored and the alias wins.
resolveOptions({ level: 'error', logs: { level: 'verbose' } }).logs.level; // 'error'

// An empty nested endpoint falls through to `url`.
resolveOptions({ url: '/collector', rest: { errorsUrl: '' } }).rest.errorsUrl; // '/collector'
```

> **Source note.** `url` feeds **both** `rest.errorsUrl` and `rest.logsUrl`, which is the one-collector
> case. Use `errorUrl` / `logUrl` to split them — those two beat `url` — and be aware that a deployment
> which configures any endpoint resolves `mode` to `'remote'`. Nothing leaves the browser until an
> endpoint exists, but `setupTelemetry({ url })` alone is enough to create one.

A flat alias that has no environment equivalent (`headers`, `captureConsole`) is simply a code-only
shortcut. A nested option with no alias (a dash in the tables above) is reachable only by its full name.

## Application identity

| Variable | Option | Unit | Default | Flat alias |
| --- | --- | --- | --- | --- |
| `VITE_APP_NAME` | `appName` | string | none | `app` |
| `VITE_APP_VERSION` | `appVersion` | string | none | `version` |
| `VITE_BUILD_ID` | `buildId` | string | none | `build` |
| `VITE_APP_ENV`, `VITE_ENVIRONMENT` | `environment` | string | none | — |
| `VITE_TELEMETRY_ENABLED` | `enabled` | boolean | `true` | — |
| `VITE_TELEMETRY_DB_PREFIX` | `dbPrefix` | string | `rm-logvault` | — |
| `VITE_TELEMETRY_OPEN_TIMEOUT_MS` | `openTimeoutMs` | milliseconds | `5000` | — |

## Errors — their own IndexedDB store

| Variable | Option | Unit | Default | Flat alias |
| --- | --- | --- | --- | --- |
| `VITE_ERROR_TRACKING_ENABLED` | `errors.enabled` | boolean | `true` | — |
| `VITE_ERROR_TRACKING_RETENTION_DAYS` | `errors.retentionDays` | days; `0` = no age deletion | `7` | `errorRetentionDays` |
| `VITE_ERROR_TRACKING_MAX_RECORDS` | `errors.maxRecords` | rows | `500` | `maxErrors` |
| `VITE_ERROR_TRACKING_MAX_PAYLOAD_BYTES` | `errors.maxPayloadBytes` | UTF-8 bytes per record | `16384` | — |
| `VITE_ERROR_TRACKING_MAX_EVENTS_PER_MINUTE` | `errors.maxEventsPerMinute` | events / 60 s; `0` = unlimited | `120` | — |

## Logs — their own IndexedDB store

| Variable | Option | Unit | Default | Flat alias |
| --- | --- | --- | --- | --- |
| `VITE_LOG_PERSIST_ENABLED` | `logs.enabled` | boolean | `true` | — |
| `VITE_LOG_LEVEL` | `logs.consoleLevel` | level | **unchanged** | `consoleLevel` |
| `VITE_LOG_PERSIST_LEVEL` | `logs.level` | level; empty inherits `VITE_LOG_LEVEL` | `warn` | `level` |
| `VITE_LOG_PERSIST_RETENTION_DAYS` | `logs.retentionDays` | days; `0` = no age deletion | `3` | `logRetentionDays` |
| `VITE_LOG_PERSIST_MAX_RECORDS` | `logs.maxRecords` | rows | `2000` | `maxLogs` |
| `VITE_LOG_PERSIST_MAX_PAYLOAD_BYTES` | `logs.maxPayloadBytes` | UTF-8 bytes per record | `4096` | — |
| `VITE_LOG_PERSIST_MAX_LOGS_PER_MINUTE` | `logs.maxLogsPerMinute` | logs / 60 s; `0` = unlimited | `600` | — |
| `VITE_LOG_PERSIST_WRITE_FLUSH_MS` | `logs.writeFlushMs` | milliseconds | `1000` | — |
| `VITE_LOG_PERSIST_WRITE_BATCH_SIZE` | `logs.writeBatchSize` | entries per write | `50` | — |

`VITE_LOG_LEVEL` sets the **console** level and `VITE_LOG_PERSIST_LEVEL` sets the **persist** level.
They are different questions, and leaving the persist one empty is how you say "inherit the console
level": an empty variable counts as absent. The flat aliases keep that distinction: `level` is the
**persist** level and `consoleLevel` is the console one.

## REST upload

| Variable | Option | Unit | Default | Flat alias |
| --- | --- | --- | --- | --- |
| `VITE_TELEMETRY_REST_ENABLED` | `rest.enabled` | boolean | `true` when a URL is set | — |
| `VITE_ERROR_TRACKING_REST_URL` | `rest.errorsUrl` | absolute `http(s)` or a path | none | `errorUrl` (or `url`) |
| `VITE_LOG_TRACKING_REST_URL` | `rest.logsUrl` | absolute `http(s)` or a path | none | `logUrl` (or `url`) |
| `VITE_TELEMETRY_SYNC_INTERVAL_MS` | `rest.intervalMs` | milliseconds | `30000` | — |
| `VITE_TELEMETRY_SYNC_BATCH_SIZE` | `rest.batchSize` | records per request | `50` | — |

A dash means the option has no flat alias: the nested name is the only way to write it. The alias layer
never removes a name — it adds a shorter one beside it.

## A complete `.env`

```bash
# Application identity
VITE_APP_NAME=checkout
VITE_APP_VERSION=2.4.1
VITE_APP_ENV=production

# Error tracking (its own IndexedDB store)
VITE_ERROR_TRACKING_ENABLED=true
VITE_ERROR_TRACKING_RETENTION_DAYS=7
VITE_ERROR_TRACKING_MAX_RECORDS=500
VITE_ERROR_TRACKING_MAX_PAYLOAD_BYTES=16384

# Log persistence (its own IndexedDB store)
VITE_LOG_PERSIST_ENABLED=true
VITE_LOG_PERSIST_LEVEL=            # empty inherits VITE_LOG_LEVEL
VITE_LOG_PERSIST_RETENTION_DAYS=3
VITE_LOG_PERSIST_MAX_RECORDS=2000
VITE_LOG_PERSIST_MAX_PAYLOAD_BYTES=4096
VITE_LOG_LEVEL=warn                # console only

# Uploads: one URL per kind, and IndexedDB stays the offline outbox
VITE_TELEMETRY_REST_ENABLED=true
VITE_ERROR_TRACKING_REST_URL=/api/telemetry/errors
VITE_LOG_TRACKING_REST_URL=/api/telemetry/logs
VITE_TELEMETRY_SYNC_INTERVAL_MS=30000
VITE_TELEMETRY_SYNC_BATCH_SIZE=50
```

## Parsing rules

- **Booleans** accept `true`/`1`/`yes`/`on` and `false`/`0`/`no`/`off`, case-insensitively. Anything
  else is **ignored**, so `VITE_ERROR_TRACKING_ENABLED=maybe` leaves the default in place rather than
  silently disabling capture.
- **Numbers** must be non-negative and finite. Whitespace, an empty string, a non-number and a negative
  value are all ignored. Integers are floored (`10.9` → `10`) except `retentionDays`, where a fraction
  is meaningful (`0.5` = twelve hours). `0` is preserved, and each option decides what it means —
  "no age cutoff" for retention, "unlimited" for the rate limits, "a mistake" for `maxRecords`.
- **Absent, empty or whitespace-only** all mean the same thing: the variable is not there, and the
  default applies.

> **Do not spread `fromEnv()` into the options object.** It returns a *flat* object while the
> environment layer is read only through `options.env`, so a spread carries just the six top-level
> identity fields and silently drops every nested one. Use `env: true | 'PREFIX' | ['A_','B_']`, or read
> `fromEnv()` and place the values yourself.

## Legacy names still work

`VITE_TELEMETRY_ERRORS_ENABLED`, `VITE_TELEMETRY_LOGS_ENABLED`, `VITE_TELEMETRY_PERSIST_LEVEL`,
`VITE_TELEMETRY_LOG_LEVEL`, `VITE_TELEMETRY_ERRORS_URL` and `VITE_TELEMETRY_LOGS_URL` are still read,
and the specific name above wins when both are set. `VITE_TELEMETRY_LOG_LEVEL` has always meant the
**persist** level and never touched the console, so an existing deployment's console output does not
change.

## Next

- The alias table in full, plus events, context builders and the export formats:
  [../more-advanced/04-observing-and-extending.md](../more-advanced/04-observing-and-extending.md).
- The same tier for another framework: [../../angular/config/01-environment-variables.md](../../angular/config/01-environment-variables.md),
  [../../nextjs/config/01-environment-variables.md](../../nextjs/config/01-environment-variables.md).
- Precedence and the option tables: [README.md](./README.md).
