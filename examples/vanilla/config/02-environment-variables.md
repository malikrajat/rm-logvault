# Environment variables

**Problem it solves:** the same configuration has to differ between local, staging and production, and
you do not want three copies of the options object. The library reads build-time variables — but only
when you ask it to.

## Turning the layer on

```ts
import { initTelemetry } from '@codewithrajat/rm-logvault';

initTelemetry({ env: true }); // ['VITE_', 'NEXT_PUBLIC_', 'REACT_APP_'], in that order
initTelemetry({ env: 'VITE_' }); // one prefix
initTelemetry({ env: ['VITE_', 'PUBLIC_'] }); // several, first non-empty match wins
```

For each name, `import.meta.env` is consulted before `process.env`. **Nothing is read unless you opt in**
— that is what keeps `initTelemetry` usable in Node, in SSR and in a plain `<script type="module">`.

> **Source note.** `fromEnv()` is a reader, not a switch, and spreading it configures nothing. It returns
> a *flat* object (`errorsEnabled`, `logsMaxRecords`, `errorsUrl`, …), while the resolver reads the
> environment only through `options.env`. So `{ ...fromEnv() }` carries just the six fields whose names
> coincide with a top-level option (`appName`, `appVersion`, `buildId`, `environment`, `enabled`,
> `dbPrefix`) and silently drops every nested one. Use `env:` to configure; use `fromEnv()` when you want
> to read the values yourself.
>
> ```ts
> import { fromEnv } from '@codewithrajat/rm-logvault';
>
> const env = fromEnv(); // reading — useful for logging or a custom repository
> env.errorsMaxRecords; // number | undefined
>
> initTelemetry({ env: 'VITE_' }); // configuring — this is the switch
> ```

## The variables

Suffixes are shown with `VITE_` as the prefix. The prefix is yours; the suffix is what the library looks
for, so `NEXT_PUBLIC_ERROR_TRACKING_REST_URL` is the Next.js spelling of the same thing.

**Read the `Default` column as "what you get when the variable is absent."** The environment layer
supplies nothing when a variable is missing, so the option falls through to the same built-in default
you would get by omitting it in code. Adding a line changes exactly that one option; deleting the line
restores exactly the default in the table. That is what makes this layer safe to adopt one variable at
a time, and it is why every row below has a concrete value rather than a vague "sensible default".

The options that have **no** environment variable at all — the shortcut, `mode`, `consent`,
`errors.captureCsp`, `rest.getHeaders` and the callbacks — are listed with their defaults in
[docs/DEFAULTS.md](../../../docs/DEFAULTS.md).

### Identity and lifecycle

| Variable | Option | Values | Default (value when absent) |
| --- | --- | --- | --- |
| `VITE_APP_NAME` | `appName` | string | none — the field is omitted from the record |
| `VITE_APP_VERSION` | `appVersion` | string | none — omitted |
| `VITE_BUILD_ID` | `buildId` | string | none — omitted |
| `VITE_APP_ENV`, `VITE_ENVIRONMENT` | `environment` | string | none — omitted, **not** inferred |
| `VITE_TELEMETRY_ENABLED` | `enabled` | `true`/`false` | `true` — capture is on |
| `VITE_TELEMETRY_DB_PREFIX` | `dbPrefix` | string | `rm-logvault` — databases `rm-logvault-errors` / `-logs` |
| `VITE_TELEMETRY_OPEN_TIMEOUT_MS` | `openTimeoutMs` | milliseconds | `5000` — then storage is `unavailable` and capture continues console-only |

### Errors

| Variable | Option | Unit | Default (value when absent) |
| --- | --- | --- | --- |
| `VITE_ERROR_TRACKING_ENABLED` | `errors.enabled` | `true`/`false` | `true` — errors are captured |
| `VITE_ERROR_TRACKING_RETENTION_DAYS` | `errors.retentionDays` | days; `0` = never delete by age | `7` days |
| `VITE_ERROR_TRACKING_MAX_RECORDS` | `errors.maxRecords` | rows | `500` rows |
| `VITE_ERROR_TRACKING_MAX_PAYLOAD_BYTES` | `errors.maxPayloadBytes` | UTF-8 bytes per record | `16384` bytes |
| `VITE_ERROR_TRACKING_MAX_EVENTS_PER_MINUTE` | `errors.maxEventsPerMinute` | events / 60 s; `0` = unlimited | `120` per minute, page-wide |
| `VITE_ERROR_TRACKING_MAX_REPEATS_PER_MINUTE` | `errors.maxRepeatsPerMinute` | records per fingerprint / 60 s; `0` = off | `12` per fingerprint per minute |

### Logs

| Variable | Option | Unit | Default (value when absent) |
| --- | --- | --- | --- |
| `VITE_LOG_PERSIST_ENABLED` | `logs.enabled` | `true`/`false` | `true` — logs are persisted |
| `VITE_LOG_LEVEL` | `logs.consoleLevel`, then the last fallback for `logs.level` | level | unchanged console; persist stays `warn` |
| `VITE_LOG_PERSIST_LEVEL` | `logs.level` | level; **empty inherits `VITE_LOG_LEVEL`** | `warn` — only `warn` and `error` are stored |
| `VITE_LOG_PERSIST_RETENTION_DAYS` | `logs.retentionDays` | days; `0` = never delete by age | `3` days |
| `VITE_LOG_PERSIST_MAX_RECORDS` | `logs.maxRecords` | rows | `2000` rows |
| `VITE_LOG_PERSIST_MAX_PAYLOAD_BYTES` | `logs.maxPayloadBytes` | UTF-8 bytes per record | `4096` bytes |
| `VITE_LOG_PERSIST_MAX_LOGS_PER_MINUTE` | `logs.maxLogsPerMinute` | logs / 60 s; `0` = unlimited | `600` per minute |
| `VITE_LOG_PERSIST_WRITE_FLUSH_MS` | `logs.writeFlushMs` | milliseconds | `1000` ms — an upper bound, not a poll interval |
| `VITE_LOG_PERSIST_WRITE_BATCH_SIZE` | `logs.writeBatchSize` | entries | `50` entries per write |

### REST upload

| Variable | Option | Values | Default (value when absent) |
| --- | --- | --- | --- |
| `VITE_TELEMETRY_REST_ENABLED` | `rest.enabled` | `true`/`false` | `true` when a URL is set — so `false` with no URL, and nothing uploads |
| `VITE_ERROR_TRACKING_REST_URL` | `rest.errorsUrl` | absolute `http(s)` or a path | none — error batches are never sent |
| `VITE_LOG_TRACKING_REST_URL` | `rest.logsUrl` | absolute `http(s)` or a path | none — log batches are never sent |
| `VITE_TELEMETRY_SYNC_INTERVAL_MS` | `rest.intervalMs` | milliseconds | `30000` ms between successful flushes |
| `VITE_TELEMETRY_SYNC_BATCH_SIZE` | `rest.batchSize` | records per request | `50` records per request |

## Parsing rules

The same rules apply to every variable, and they are chosen so that a typo cannot silently change
behaviour:

- **Booleans** accept `true`/`1`/`yes`/`on` and `false`/`0`/`no`/`off`, case-insensitively. Anything else
  is **ignored** — so `VITE_ERROR_TRACKING_ENABLED=maybe` leaves the default (`true`) in place rather
  than quietly disabling capture.
- **Numbers** must be non-negative and finite. Whitespace, an empty string, a non-number and a negative
  value are all ignored. Integers are floored (`10.9` → `10`), **except** `retentionDays`, where a
  fraction is meaningful (`0.5` = twelve hours). `0` is preserved, and each option decides what it means.
- **A variable that is present but empty counts as absent.** That is what makes the documented
  `VITE_LOG_PERSIST_LEVEL=` behaviour work: an empty persist level inherits `VITE_LOG_LEVEL` instead of
  being an invalid value.

An ignored value is not an error and is not reported: it simply falls through to the next layer. When a
setting does not seem to apply, check in this order — is it in the right group, is the name spelled
exactly, is the value parseable, and is `env:` actually set?

## Precedence, one more time

```
explicit option   >   environment   >   built-in default
```

Because the environment layer is applied *under* the options you pass, `appName` in the snippet below
stays `'explicit-name'` even when `VITE_APP_NAME` is set:

```ts
initTelemetry({ env: true, appName: 'explicit-name' });
```

Retention, though, is not passed explicitly, so a variable does win there:

```bash
VITE_ERROR_TRACKING_RETENTION_DAYS=1   # errors.retentionDays becomes 1
```

## A worked `.env`

```bash
# Identity
VITE_APP_NAME=checkout
VITE_APP_VERSION=2.4.1
VITE_APP_ENV=production

# Errors: a month of history, but only 200 rows
VITE_ERROR_TRACKING_ENABLED=true
VITE_ERROR_TRACKING_RETENTION_DAYS=30
VITE_ERROR_TRACKING_MAX_RECORDS=200

# Logs: persist warnings and above, console only errors
VITE_LOG_PERSIST_ENABLED=true
VITE_LOG_PERSIST_LEVEL=warn
VITE_LOG_LEVEL=error

# Uploads: two endpoints, and the outbox does the retrying
VITE_TELEMETRY_REST_ENABLED=true
VITE_ERROR_TRACKING_REST_URL=/api/telemetry/errors
VITE_LOG_TRACKING_REST_URL=/api/telemetry/logs
```

Vite exposes only variables prefixed with `VITE_` to client code, which is why the prefix is part of
every name above. `PUBLIC_` (SvelteKit, Astro) and `NEXT_PUBLIC_` (Next.js) work the same way, and that
is exactly what the `env` option's prefix list is for.

## Legacy aliases

An earlier configuration keeps working. When both a specific name and its alias are set, the **specific**
one wins:

| Alias | Equivalent now | Note |
| --- | --- | --- |
| `VITE_TELEMETRY_ERRORS_ENABLED` | `VITE_ERROR_TRACKING_ENABLED` | |
| `VITE_TELEMETRY_LOGS_ENABLED` | `VITE_LOG_PERSIST_ENABLED` | |
| `VITE_TELEMETRY_PERSIST_LEVEL` | `VITE_LOG_PERSIST_LEVEL` | |
| `VITE_TELEMETRY_LOG_LEVEL` | — | **Persist level only.** It never sets the console level, so an existing deployment's console output does not change. |
| `VITE_TELEMETRY_ERRORS_URL` | `VITE_ERROR_TRACKING_REST_URL` | |
| `VITE_TELEMETRY_LOGS_URL` | `VITE_LOG_TRACKING_REST_URL` | |

## Related

- [config](./README.md) — precedence, invalid values, and how to inspect what resolved.
- [options at a glance](./01-options-at-a-glance.md) — the same settings as options.
- [docs/API.md](../../../docs/API.md#environment) — the authoritative table, including edge cases.
