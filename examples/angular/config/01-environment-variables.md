# config — environment variables (Angular)

**Problem it solves:** you want the library's settings to come from configuration rather than from
source — and in Angular you first have to decide *how* a build-time value reaches the browser, because
there is no built-in environment file for browser code.

**What you will learn:**

- Why `env: true` finds nothing in a stock Angular browser build, and what to do instead.
- Every variable name this library reads, with its **unit** and its **default**.
- The flat aliases and `setupTelemetry` — the short form of the same configuration.
- The prefix rule, and how to pin your own.
- Why an unparseable value is ignored rather than applied.

## Getting build-time values into an Angular bundle

`fromEnv()` reads `import.meta.env` first and `process.env` second, and it never throws when both are
absent. A stock Angular browser build defines neither, so `initTelemetry({ env: true })` resolves
nothing and every option keeps its default.

That leaves two honest options:

**1. Read your environment file and pass explicit options** — the idiomatic Angular path, shown in
[README.md](./README.md).

**2. Generate a module at build time.** A small Node script reads the real environment variables,
writes something like `src/generated/telemetry-env.ts`, and `angular.json` runs it before the build.
The names and units below are then the contract between that script and your code:

```bash
node scripts/generate-telemetry-env.mjs && ng build --configuration production
```

```ts
// generated, then consumed as ordinary explicit options
initTelemetry({
  appName: generated.appName,
  errors: { retentionDays: generated.errorsRetentionDays, maxRecords: generated.errorsMaxRecords },
});
```

If your pipeline *does* define `import.meta.env` (some builders inject it), `env: true` works as it
does in Vite — but do not assume it. Verify before relying on it.

The prefix is yours to choose: `env: true` searches `['VITE_', 'NEXT_PUBLIC_', 'REACT_APP_']`, and
`env: 'APP_'` or `env: ['APP_', 'PUBLIC_']` pins your own. The first non-empty match wins.

## Application identity

| Variable suffix | Option | Unit | Default |
| --- | --- | --- | --- |
| `APP_NAME` | `appName` | string | none |
| `APP_VERSION` | `appVersion` | string | none |
| `BUILD_ID` | `buildId` | string | none |
| `APP_ENV`, `ENVIRONMENT` | `environment` | string | none |
| `TELEMETRY_ENABLED` | `enabled` | boolean | `true` |
| `TELEMETRY_DB_PREFIX` | `dbPrefix` | string | `rm-logvault` |
| `TELEMETRY_OPEN_TIMEOUT_MS` | `openTimeoutMs` | milliseconds | `5000` |

## Errors — their own IndexedDB store

| Variable suffix | Option | Unit | Default |
| --- | --- | --- | --- |
| `ERROR_TRACKING_ENABLED` | `errors.enabled` | boolean | `true` |
| `ERROR_TRACKING_RETENTION_DAYS` | `errors.retentionDays` | days; `0` = no age deletion | `7` |
| `ERROR_TRACKING_MAX_RECORDS` | `errors.maxRecords` | rows | `500` |
| `ERROR_TRACKING_MAX_PAYLOAD_BYTES` | `errors.maxPayloadBytes` | UTF-8 bytes per record | `16384` |
| `ERROR_TRACKING_MAX_EVENTS_PER_MINUTE` | `errors.maxEventsPerMinute` | events / 60 s; `0` = unlimited | `120` |

## Logs — their own IndexedDB store

| Variable suffix | Option | Unit | Default |
| --- | --- | --- | --- |
| `LOG_PERSIST_ENABLED` | `logs.enabled` | boolean | `true` |
| `LOG_LEVEL` | `logs.consoleLevel` | level | **unchanged** |
| `LOG_PERSIST_LEVEL` | `logs.level` | level; empty inherits `LOG_LEVEL` | `warn` |
| `LOG_PERSIST_RETENTION_DAYS` | `logs.retentionDays` | days; `0` = no age deletion | `3` |
| `LOG_PERSIST_MAX_RECORDS` | `logs.maxRecords` | rows | `2000` |
| `LOG_PERSIST_MAX_PAYLOAD_BYTES` | `logs.maxPayloadBytes` | UTF-8 bytes per record | `4096` |
| `LOG_PERSIST_MAX_LOGS_PER_MINUTE` | `logs.maxLogsPerMinute` | logs / 60 s; `0` = unlimited | `600` |
| `LOG_PERSIST_WRITE_FLUSH_MS` | `logs.writeFlushMs` | milliseconds | `1000` |
| `LOG_PERSIST_WRITE_BATCH_SIZE` | `logs.writeBatchSize` | entries per write | `50` |

`LOG_LEVEL` sets the **console** level and `LOG_PERSIST_LEVEL` sets the **persist** level. An empty
variable counts as absent, which is how "empty persist level inherits the console level" works.

## REST upload

| Variable suffix | Option | Unit | Default |
| --- | --- | --- | --- |
| `TELEMETRY_REST_ENABLED` | `rest.enabled` | boolean | `true` when a URL is set |
| `ERROR_TRACKING_REST_URL` | `rest.errorsUrl` | absolute `http(s)` or a path | none |
| `LOG_TRACKING_REST_URL` | `rest.logsUrl` | absolute `http(s)` or a path | none |
| `TELEMETRY_SYNC_INTERVAL_MS` | `rest.intervalMs` | milliseconds | `30000` |
| `TELEMETRY_SYNC_BATCH_SIZE` | `rest.batchSize` | records per request | `50` |

## The flat aliases — the short form of the same options

Every option in the tables above also has a **flat alias**, and `setupTelemetry` takes them directly. The
aliases are not a second configuration system: they resolve into exactly the same nested options, and the
two forms can be mixed in one codebase.

```ts
import { setupTelemetry } from '@codewithrajat/rm-logvault';

setupTelemetry({
  app: 'checkout',
  version: generated.appVersion,
  environment: generated.environment,
  url: '/api/telemetry',   // BOTH rest.errorsUrl and rest.logsUrl
  level: 'info',           // the PERSIST level — logs.level
  maxErrors: 1000,
});
```

| Env var suffix | Flat alias | Nested option | Default |
| --- | --- | --- | --- |
| `APP_NAME` | `app` | `appName` | none |
| `APP_VERSION` | `version` | `appVersion` | none |
| `BUILD_ID` | `build` | `buildId` | none |
| `APP_ENV`, `ENVIRONMENT` | `environment` | `environment` | none |
| `ERROR_TRACKING_REST_URL` | `errorUrl` | `rest.errorsUrl` | none |
| `LOG_TRACKING_REST_URL` | `logUrl` | `rest.logsUrl` | none |
| — (no variable) | `url` | `rest.errorsUrl` **and** `rest.logsUrl` | none |
| — (no variable) | `headers` | `rest.getHeaders` | none |
| `LOG_PERSIST_LEVEL` | `level` | `logs.level` | `warn` |
| `LOG_LEVEL` | `consoleLevel` | `logs.consoleLevel` | **none** (console untouched) |
| — (no variable) | `captureConsole` | `logs.captureConsole` | `false` |
| `ERROR_TRACKING_MAX_RECORDS` | `maxErrors` | `errors.maxRecords` | `500` |
| `LOG_PERSIST_MAX_RECORDS` | `maxLogs` | `logs.maxRecords` | `2000` |
| `ERROR_TRACKING_RETENTION_DAYS` | `errorRetentionDays` | `errors.retentionDays` | `7` |
| `LOG_PERSIST_RETENTION_DAYS` | `logRetentionDays` | `logs.retentionDays` | `3` |

Precedence is unchanged and runs **inside-out**: **nested option > flat alias > environment > built-in
default.** The alias is just a shorter way to write the second rung, so it sits above the environment
layer, not below it.

```ts
setupTelemetry({
  url: '/api/telemetry',             // both kinds go here…
  rest: { errorsUrl: '/api/errors' }, // …except errors, which go here.
});
// errors -> /api/errors      logs -> /api/telemetry
```

An invalid or empty value **falls through** to the next candidate rather than winning by being present,
so a typo in a nested value does not shadow the alias you set:

```ts
setupTelemetry({ level: 'error', logs: { level: 'verbose' as never } });
// logs.level === 'error'
```

> **Source note.** The flat aliases and `setupTelemetry` are **additive** — every nested option still
> means exactly what it did, and `initTelemetry({ appName: 'x' })` is unchanged. That is what lets you
> adopt them one call site at a time. The observation surface that goes with them — events, context
> builders and the sink registry — is in
> [04-observing-and-extending.md](../more-advanced/04-observing-and-extending.md).

## Parsing rules

- **Booleans** accept `true`/`1`/`yes`/`on` and `false`/`0`/`no`/`off`, case-insensitively. Anything
  else is **ignored**, so `ERROR_TRACKING_ENABLED=maybe` leaves the default rather than silently
  disabling capture.
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

`TELEMETRY_ERRORS_ENABLED`, `TELEMETRY_LOGS_ENABLED`, `TELEMETRY_PERSIST_LEVEL`,
`TELEMETRY_LOG_LEVEL`, `TELEMETRY_ERRORS_URL` and `TELEMETRY_LOGS_URL` are still read, and the specific
name wins when both are set. `TELEMETRY_LOG_LEVEL` has always meant the **persist** level and never
touched the console.

## Next

- Precedence and the option tables: [README.md](./README.md).
- The flat aliases in a real bootstrap, plus events, context builders and the report formats:
  [04-observing-and-extending.md](../more-advanced/04-observing-and-extending.md).
- The same tier for another framework: [../../vue/config/01-environment-variables.md](../../vue/config/01-environment-variables.md),
  [../../nextjs/config/01-environment-variables.md](../../nextjs/config/01-environment-variables.md).
