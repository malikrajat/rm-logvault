# Environment variables in a Vite React app

**Problem it solves:** one build, three environments, and no second copy of the options object. Vite
exposes `VITE_`-prefixed variables from `.env` files to client code; the library can read them, but only
when you turn the layer on.

## The switch

```ts
import { initTelemetry } from '@codewithrajat/rm-logvault';

initTelemetry({ env: true }); // VITE_, NEXT_PUBLIC_, REACT_APP_ — in that order
initTelemetry({ env: 'VITE_' }); // Vite only, which is what a Vite React app wants
```

`env` accepts `true`, one prefix, or a list searched in order (first non-empty match wins). For each
name, `import.meta.env` is consulted before `process.env`.

The React-specific point: **`env: true` also recognises `REACT_APP_` and `NEXT_PUBLIC_`**, which a Vite
app never has. That is harmless, but if you want to be strict about where configuration may come from,
pin the prefix — `env: 'VITE_'` — and a stray `REACT_APP_` variable in the shell cannot influence the
build.

> **Source note.** `fromEnv()` is a reader, not a switch. It returns a *flat* object while the resolver
> reads the environment only through `options.env`, so `{ ...fromEnv() }` carries just the six fields
> whose names coincide with a top-level option and silently drops every nested one. Use `env:` to
> configure.

## The variables this tier uses

Suffixes are shown with `VITE_`, because that is the prefix Vite exposes. The full table, including
every option and the aliases, is
[../../vanilla/config/02-environment-variables.md](../../vanilla/config/02-environment-variables.md);
this is the subset a React application normally touches, plus one thing that is specific to it.

| Variable | Option | Unit / values | Default |
| --- | --- | --- | --- |
| `VITE_APP_NAME` | `appName` | string | none |
| `VITE_APP_VERSION` | `appVersion` | string | none |
| `VITE_BUILD_ID` | `buildId` | string | none |
| `VITE_APP_ENV`, `VITE_ENVIRONMENT` | `environment` | string | none |
| `VITE_TELEMETRY_ENABLED` | `enabled` | `true`/`false` | `true` |
| `VITE_TELEMETRY_DB_PREFIX` | `dbPrefix` | string | `rm-logvault` |
| `VITE_TELEMETRY_REST_ENABLED` | `rest.enabled` | `true`/`false` | `true` when a URL is set |
| `VITE_ERROR_TRACKING_REST_URL` | `rest.errorsUrl` | absolute `http(s)` or a path | none |
| `VITE_LOG_TRACKING_REST_URL` | `rest.logsUrl` | absolute `http(s)` or a path | none |
| `VITE_TELEMETRY_SYNC_INTERVAL_MS` | `rest.intervalMs` | milliseconds | `30000` |
| `VITE_TELEMETRY_SYNC_BATCH_SIZE` | `rest.batchSize` | records per request | `50` |
| `VITE_ERROR_TRACKING_RETENTION_DAYS` | `errors.retentionDays` | days; `0` = no age cutoff | `7` |
| `VITE_ERROR_TRACKING_MAX_RECORDS` | `errors.maxRecords` | rows | `500` |
| `VITE_ERROR_TRACKING_MAX_PAYLOAD_BYTES` | `errors.maxPayloadBytes` | UTF-8 bytes per record | `16384` |
| `VITE_LOG_PERSIST_ENABLED` | `logs.enabled` | `true`/`false` | `true` |
| `VITE_LOG_LEVEL` | `logs.consoleLevel` | level | unchanged |
| `VITE_LOG_PERSIST_LEVEL` | `logs.level` | level; **empty inherits `VITE_LOG_LEVEL`** | `warn` |
| `VITE_LOG_PERSIST_RETENTION_DAYS` | `logs.retentionDays` | days | `3` |
| `VITE_LOG_PERSIST_MAX_RECORDS` | `logs.maxRecords` | rows | `2000` |

**There is no environment variable for `context.tags`.** The adapter's `tags` and `extra` are per-call
options on `reactRootErrorHandlers()` and `TelemetryErrorBoundary`, not part of the environment layer —
which is the right shape, because a tag usually describes the component tree rather than the deployment.
If you want a deployment-wide tag, read a variable yourself and pass it in:

```tsx
import { initTelemetry } from '@codewithrajat/rm-logvault';
import { reactRootErrorHandlers } from '@codewithrajat/rm-logvault/react';

initTelemetry({ env: 'VITE_' });

createRoot(element, {
  ...reactRootErrorHandlers({ tags: { release: import.meta.env['VITE_BUILD_ID'] ?? 'dev' } }),
});
```

## Parsing rules

- **Booleans** accept `true`/`1`/`yes`/`on` and `false`/`0`/`no`/`off`, case-insensitively. Anything else
  is **ignored**, so a typo leaves the default rather than quietly disabling capture.
- **Numbers** must be non-negative and finite; whitespace, an empty string, a non-number and a negative
  value are ignored. Integers are floored, **except** `retentionDays`, where `0.5` means twelve hours.
- **Present but empty counts as absent.** That is what makes `VITE_LOG_PERSIST_LEVEL=` inherit
  `VITE_LOG_LEVEL` instead of failing to parse.

## A worked `.env.development`

```bash
# Identity, so a local report is distinguishable from production
VITE_APP_NAME=checkout
VITE_APP_ENV=development
VITE_TELEMETRY_DB_PREFIX=checkout-dev

# No collector in development: keep everything local and quiet
VITE_TELEMETRY_REST_ENABLED=false

# More history locally, and a chattier console than production
VITE_ERROR_TRACKING_RETENTION_DAYS=14
VITE_LOG_PERSIST_LEVEL=debug
VITE_LOG_LEVEL=debug
```

Two things this demonstrates:

- `VITE_TELEMETRY_REST_ENABLED=false` with no URL keeps the whole thing local. Note that `mode` reports
  `'local'` as a result — it follows whether uploads are enabled, not whether a URL happens to exist.
- `VITE_TELEMETRY_DB_PREFIX=checkout-dev` gives the development build its own databases, so local
  experiments never mix with a staging build on the same origin. This is the one variable worth setting
  routinely in development.

## Precedence

```
explicit option   >   environment   >   built-in default
```

The environment layer is applied **under** the options you pass, so this pins `appName` regardless of
what the shell says:

```ts
initTelemetry({ env: 'VITE_', appName: 'explicit-name' });
```

…while anything you do not pass explicitly is still free to come from the environment. That is the
behaviour that makes a single build configurable per environment without a code change.

## The short form: flat aliases and `setupTelemetry`

The table above maps environment variables onto **nested** options. The same options also have **flat
aliases**, so a one-collector deployment does not have to spell out `rest.errorsUrl` and `rest.logsUrl` to
say one thing:

```ts
// src/telemetry.ts
import { setupTelemetry } from '@codewithrajat/rm-logvault';

// Flat: identity, one endpoint for both kinds, and the persist level.
setupTelemetry({
  app: import.meta.env['VITE_APP_NAME'], // → appName
  url: '/telemetry', // → rest.errorsUrl AND rest.logsUrl
  level: 'info', // → logs.level (the PERSIST level)
});
```

That is equivalent to the nested form below, which is what a large deployment tends to grow into:

```ts
initTelemetry({
  appName: import.meta.env['VITE_APP_NAME'],
  rest: { errorsUrl: '/telemetry', logsUrl: '/telemetry' },
  logs: { level: 'info' },
});
```

`setupTelemetry` is not a second configuration system — it forwards to `initTelemetry` unchanged, and it
is idempotent in exactly the same way (a second call returns the same handle object and installs nothing).
The two are interchangeable, so you can migrate one option at a time. The full alias table, the events and
the context builders are in
[observing and extending](../more-advanced/04-observing-and-extending.md).

### Which environment variable corresponds to which alias

The environment layer feeds the **nested** option, and a flat alias is just another candidate for the same
slot — sitting **above** the environment. So for an endpoint there are three names in play, in this order:

| Environment variable | Nested option | Flat alias | Loses to |
| --- | --- | --- | --- |
| `VITE_ERROR_TRACKING_REST_URL` | `rest.errorsUrl` | `errorUrl`, then `url` | both aliases, and `rest.errorsUrl` |
| `VITE_LOG_TRACKING_REST_URL` | `rest.logsUrl` | `logUrl`, then `url` | both aliases, and `rest.logsUrl` |

### The precedence rule runs inside-out

Once aliases exist there are two layers of explicitness, and the rule is:

```
nested option   >   flat alias   >   environment   >   built-in default
```

A nested value beats its own flat alias, which is what lets you set one collector and then override just
errors in code:

```ts
initTelemetry({
  env: 'VITE_',
  url: '/everything', // both kinds go here…
  rest: { errorsUrl: '/errors' }, // …except errors, which go here.
});
// errors → /errors
// logs   → /everything — the flat alias beats VITE_LOG_TRACKING_REST_URL
```

An invalid or empty nested value **falls through to the next candidate** rather than winning, so
`{ level: 'error', logs: { level: 'verbose' } }` resolves to `'error'`. That matters here because an
unparseable environment variable is also ignored — a typo in `VITE_LOG_PERSIST_LEVEL` leaves the default
in place instead of stopping the chain.

> **Source note.** Because a flat alias outranks the environment, `initTelemetry({ env: 'VITE_', url: '/x' })`
> overrides **both** endpoint variables in one line. That is usually what you want in a test or a local
> override, and occasionally a surprise in a staging build where the variables were meant to win.

> **Source note.** `env` is read at initialisation, so the environment layer and the aliases resolve in
> the same pass. Changing a variable requires a rebuild — there is no runtime re-read, and a second
> `initTelemetry` call installs nothing. For a value that must change at runtime, pass it as an option and
> call `destroyTelemetry()` before re-initialising.

## Legacy aliases

`VITE_TELEMETRY_ERRORS_URL`, `VITE_TELEMETRY_LOGS_URL`, `VITE_TELEMETRY_ERRORS_ENABLED`,
`VITE_TELEMETRY_LOGS_ENABLED`, `VITE_TELEMETRY_PERSIST_LEVEL` and `VITE_TELEMETRY_LOG_LEVEL` are still
read, and the newer name wins when both are present. `VITE_TELEMETRY_LOG_LEVEL` means the **persist**
level only — it never changes console output. The full alias table is in
[the vanilla page](../../vanilla/config/02-environment-variables.md#legacy-aliases).

## Related

- [config](./README.md) — precedence, the options that matter, and invalid values.
- [observing and extending](../more-advanced/04-observing-and-extending.md) — the flat aliases in full,
  `setupTelemetry`, the events they feed, and the export formats.
- [docs/API.md](../../../docs/API.md#environment) — the authoritative variable table.
