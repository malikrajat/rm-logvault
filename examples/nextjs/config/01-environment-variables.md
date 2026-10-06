# config — environment variables (Next.js App Router)

**Problem it solves:** you want one build whose behaviour changes per deployment, and in Next.js that
means understanding a rule that is stricter than Vite's: only `NEXT_PUBLIC_`-prefixed variables exist in
the browser at all.

**What you will learn:**

- The `NEXT_PUBLIC_` rule, and why a server-only variable is invisible to the client.
- Every variable this library reads, with its **unit** and its **default**.
- Why the environment layer must be applied on the **client** side of the boundary.
- Why an unparseable value is ignored rather than applied.
- The flat aliases and `setupTelemetry` as the short form of the same configuration.

## How Next.js exposes variables

Next.js inlines `process.env.NEXT_PUBLIC_*` into the **client** bundle at build time. Everything else
stays on the server.

| Variable | Available in a client component | Available in a server component |
| --- | --- | --- |
| `NEXT_PUBLIC_APP_NAME` | yes — inlined at build time | yes |
| `APP_NAME` | **no** | yes |

Two consequences:

- **A `NEXT_PUBLIC_` value is in the client bundle.** It is configuration, never a secret.
- **`initTelemetry` runs on the client**, so it can only see `NEXT_PUBLIC_` values. A variable without
  the prefix is not missing by accident — it is unavailable by design, and the option keeps its default.

The library never reads the environment unless you ask it to:

```tsx
// app/providers.tsx
'use client';

import { useEffect, type ReactElement, type ReactNode } from 'react';
import { destroyTelemetry, initTelemetry } from '@codewithrajat/rm-logvault';

export function Providers({ children }: { readonly children: ReactNode }): ReactElement {
  useEffect(() => {
    initTelemetry({ env: 'NEXT_PUBLIC_' }); // pin the prefix Next.js actually exposes

    return (): void => {
      destroyTelemetry();
    };
  }, []);

  return <>{children}</>;
}
```

`env: true` also works — it searches `['VITE_', 'NEXT_PUBLIC_', 'REACT_APP_']` in order — but pinning
`'NEXT_PUBLIC_'` says exactly what you mean. `NEXT_PUBLIC_` is in `DEFAULT_ENV_PREFIXES`, so `env: true`
does reach it; the explicit form is about intent, not reach.

## The short form: flat aliases and `setupTelemetry`

Every nested option below has a flat alias, and `setupTelemetry` accepts the flat set directly. It is the
same configuration — `setupTelemetry` forwards to `initTelemetry` unchanged — so the two are
interchangeable and equally idempotent.

```tsx
// app/providers.tsx — the same setup as above, in one flat line
'use client';

import { useEffect } from 'react';
import { destroyTelemetry, setupTelemetry } from '@codewithrajat/rm-logvault';

useEffect(() => {
  setupTelemetry({
    app: 'checkout',                 // appName
    version: '2.4.1',                // appVersion
    url: '/api/telemetry',           // BOTH rest.errorsUrl and rest.logsUrl
    level: 'info',                   // logs.level — the PERSIST level
    maxErrors: 1_000,                // errors.maxRecords
    env: 'NEXT_PUBLIC_',             // the env layer still applies, underneath
  });
  return () => destroyTelemetry();
}, []);
```

Precedence is **inside-out**: `nested option > flat alias > env > built-in default`. So an explicit
alias beats `NEXT_PUBLIC_*`, and a nested option beats its alias:

```ts
setupTelemetry({
  env: 'NEXT_PUBLIC_',
  url: '/api/telemetry',              // beats NEXT_PUBLIC_ERROR_TRACKING_REST_URL
  rest: { errorsUrl: '/api/errors' }, // beats the flat `url`, for errors only
});
// errors → /api/errors   logs → /api/telemetry
```

The full treatment — `handle.events`, context builders, the sink registry and the export formats — is in
[../more-advanced/04-observing-and-extending.md](../more-advanced/04-observing-and-extending.md).

## Application identity

| Variable | Nested option | Flat alias | Unit | Default |
| --- | --- | --- | --- | --- |
| `NEXT_PUBLIC_APP_NAME` | `appName` | `app` | string | none |
| `NEXT_PUBLIC_APP_VERSION` | `appVersion` | `version` | string | none |
| `NEXT_PUBLIC_BUILD_ID` | `buildId` | `build` | string | none |
| `NEXT_PUBLIC_APP_ENV`, `NEXT_PUBLIC_ENVIRONMENT` | `environment` | `environment` | string | none |
| `NEXT_PUBLIC_TELEMETRY_ENABLED` | `enabled` | `enabled` | boolean | `true` |
| `NEXT_PUBLIC_TELEMETRY_DB_PREFIX` | `dbPrefix` | — | string | `rm-logvault` |
| `NEXT_PUBLIC_TELEMETRY_OPEN_TIMEOUT_MS` | `openTimeoutMs` | — | milliseconds | `5000` |

## Errors — their own IndexedDB store

| Variable | Nested option | Flat alias | Unit | Default |
| --- | --- | --- | --- | --- |
| `NEXT_PUBLIC_ERROR_TRACKING_ENABLED` | `errors.enabled` | — | boolean | `true` |
| `NEXT_PUBLIC_ERROR_TRACKING_RETENTION_DAYS` | `errors.retentionDays` | `errorRetentionDays` | days; `0` = no age deletion | `7` |
| `NEXT_PUBLIC_ERROR_TRACKING_MAX_RECORDS` | `errors.maxRecords` | `maxErrors` | rows | `500` |
| `NEXT_PUBLIC_ERROR_TRACKING_MAX_PAYLOAD_BYTES` | `errors.maxPayloadBytes` | — | UTF-8 bytes per record | `16384` |
| `NEXT_PUBLIC_ERROR_TRACKING_MAX_EVENTS_PER_MINUTE` | `errors.maxEventsPerMinute` | — | events / 60 s; `0` = unlimited | `120` |

## Logs — their own IndexedDB store

| Variable | Nested option | Flat alias | Unit | Default |
| --- | --- | --- | --- | --- |
| `NEXT_PUBLIC_LOG_PERSIST_ENABLED` | `logs.enabled` | — | boolean | `true` |
| `NEXT_PUBLIC_LOG_LEVEL` | `logs.consoleLevel` | `consoleLevel` | level | **unchanged** |
| `NEXT_PUBLIC_LOG_PERSIST_LEVEL` | `logs.level` | `level` | level; empty inherits `LOG_LEVEL` | `warn` |
| `NEXT_PUBLIC_LOG_PERSIST_RETENTION_DAYS` | `logs.retentionDays` | `logRetentionDays` | days; `0` = no age deletion | `3` |
| `NEXT_PUBLIC_LOG_PERSIST_MAX_RECORDS` | `logs.maxRecords` | `maxLogs` | rows | `2000` |
| `NEXT_PUBLIC_LOG_PERSIST_MAX_PAYLOAD_BYTES` | `logs.maxPayloadBytes` | — | UTF-8 bytes per record | `4096` |
| `NEXT_PUBLIC_LOG_PERSIST_MAX_LOGS_PER_MINUTE` | `logs.maxLogsPerMinute` | — | logs / 60 s; `0` = unlimited | `600` |
| `NEXT_PUBLIC_LOG_PERSIST_WRITE_FLUSH_MS` | `logs.writeFlushMs` | — | milliseconds | `1000` |
| `NEXT_PUBLIC_LOG_PERSIST_WRITE_BATCH_SIZE` | `logs.writeBatchSize` | — | entries per write | `50` |

`NEXT_PUBLIC_LOG_LEVEL` sets the **console** level and `NEXT_PUBLIC_LOG_PERSIST_LEVEL` the **persist**
level. An empty variable counts as absent, which is how "empty persist level inherits the console
level" works.

> **Source note.** The flat `level` alias means the **persist** level, matching `logs.level` — not the
> console level. Use `consoleLevel` for `logs.consoleLevel`. Mixing them up is the easiest mistake to
> make here, because `NEXT_PUBLIC_LOG_LEVEL` reads like it should be the generic "log level" and is in
> fact the console one.

## REST upload

| Variable | Nested option | Flat alias | Unit | Default |
| --- | --- | --- | --- | --- |
| `NEXT_PUBLIC_TELEMETRY_REST_ENABLED` | `rest.enabled` | — | boolean | `true` when a URL is set |
| `NEXT_PUBLIC_ERROR_TRACKING_REST_URL` | `rest.errorsUrl` | `errorUrl`, or `url` | absolute `http(s)` or a path | none |
| `NEXT_PUBLIC_LOG_TRACKING_REST_URL` | `rest.logsUrl` | `logUrl`, or `url` | absolute `http(s)` or a path | none |
| `NEXT_PUBLIC_TELEMETRY_SYNC_INTERVAL_MS` | `rest.intervalMs` | — | milliseconds | `30000` |
| `NEXT_PUBLIC_TELEMETRY_SYNC_BATCH_SIZE` | `rest.batchSize` | — | records per request | `50` |

`url` feeds **both** endpoints, which is the one-collector case. `errorUrl` and `logUrl` split them and
win over `url`. A relative URL resolves against your own origin, so the upload goes through a route
handler in the same app — which is where you attach a server-side token.

## A complete `.env.local`

```bash
# Application identity
NEXT_PUBLIC_APP_NAME=checkout
NEXT_PUBLIC_APP_VERSION=2.4.1
NEXT_PUBLIC_APP_ENV=production

# Error tracking (its own IndexedDB store)
NEXT_PUBLIC_ERROR_TRACKING_ENABLED=true
NEXT_PUBLIC_ERROR_TRACKING_RETENTION_DAYS=7
NEXT_PUBLIC_ERROR_TRACKING_MAX_RECORDS=500
NEXT_PUBLIC_ERROR_TRACKING_MAX_PAYLOAD_BYTES=16384

# Log persistence (its own IndexedDB store)
NEXT_PUBLIC_LOG_PERSIST_ENABLED=true
NEXT_PUBLIC_LOG_PERSIST_LEVEL=            # empty inherits NEXT_PUBLIC_LOG_LEVEL
NEXT_PUBLIC_LOG_PERSIST_RETENTION_DAYS=3
NEXT_PUBLIC_LOG_PERSIST_MAX_RECORDS=2000
NEXT_PUBLIC_LOG_PERSIST_MAX_PAYLOAD_BYTES=4096
NEXT_PUBLIC_LOG_LEVEL=warn                # console only

# Uploads: one URL per kind, and IndexedDB stays the offline outbox
NEXT_PUBLIC_TELEMETRY_REST_ENABLED=true
NEXT_PUBLIC_ERROR_TRACKING_REST_URL=/api/telemetry/errors
NEXT_PUBLIC_LOG_TRACKING_REST_URL=/api/telemetry/logs
NEXT_PUBLIC_TELEMETRY_SYNC_INTERVAL_MS=30000
NEXT_PUBLIC_TELEMETRY_SYNC_BATCH_SIZE=50
```

A `NEXT_PUBLIC_` value is **inlined at build time**, so changing it requires a rebuild — it is not read
at runtime. That is also why a value that looks right in `.env.local` can appear stale until you restart
the dev server or rebuild.

## Parsing rules

- **Booleans** accept `true`/`1`/`yes`/`on` and `false`/`0`/`no`/`off`, case-insensitively. Anything
  else is **ignored**, so `NEXT_PUBLIC_ERROR_TRACKING_ENABLED=maybe` leaves the default rather than
  silently disabling capture.
- **Numbers** must be non-negative and finite. Whitespace, an empty value, a non-number and a negative
  value are all ignored. Integers are floored (`10.9` → `10`) except `retentionDays`, where a fraction is
  meaningful (`0.5` = twelve hours). `0` is preserved, and each option decides what it means.
- **Absent, empty or whitespace-only** all mean the same thing: the value is not there, and the default
  applies.

> **Do not spread `fromEnv()` into the options object.** It returns a *flat* object while the environment
> layer is read only through `options.env`, so a spread carries just the six top-level identity fields
> and silently drops every nested one. Use `env: true | 'PREFIX' | ['A_','B_']`, or read `fromEnv()` and
> place the values yourself.

## Legacy names still work

`NEXT_PUBLIC_TELEMETRY_ERRORS_ENABLED`, `NEXT_PUBLIC_TELEMETRY_LOGS_ENABLED`,
`NEXT_PUBLIC_TELEMETRY_PERSIST_LEVEL`, `NEXT_PUBLIC_TELEMETRY_LOG_LEVEL`,
`NEXT_PUBLIC_TELEMETRY_ERRORS_URL` and `NEXT_PUBLIC_TELEMETRY_LOGS_URL` are still read, and the specific
name wins when both are set. `NEXT_PUBLIC_TELEMETRY_LOG_LEVEL` has always meant the **persist** level and
never touched the console.

## Next

- Precedence and the option tables: [README.md](./README.md).
- The same tier for another framework: [../../vue/config/01-environment-variables.md](../../vue/config/01-environment-variables.md),
  [../../angular/config/01-environment-variables.md](../../angular/config/01-environment-variables.md).
