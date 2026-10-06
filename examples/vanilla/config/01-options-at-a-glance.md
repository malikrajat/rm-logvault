# Options at a glance

Every option, grouped, with its **unit** and **default**. This page is an index: for what each one means
at its boundaries, and what happens on an invalid value, read
[docs/API.md](../../../docs/API.md#every-option-annotated).

Nothing here is required. `initTelemetry()` with no arguments is a valid, fully-working call.

## Top level

| Option | Type / unit | Default | One line |
| --- | --- | --- | --- |
| `enabled` | `boolean` | `true` | Master switch. `false` installs nothing and captures nothing. |
| `mode` | `'local' \| 'remote'` | **derived** | Device-only or device-plus-upload. |
| `dbPrefix` | `string` | `'rm-logvault'` | Database names become `${dbPrefix}-errors` / `-logs`. |
| `openTimeoutMs` | milliseconds | `5000` | Deadline on one IndexedDB `open()` before storage is declared unavailable. |
| `appName` | `string` | none | Stamped onto every record. |
| `appVersion` | `string` | none | As above. |
| `buildId` | `string` | none | As above — which deploy produced this. |
| `environment` | `string` | none | As above (`'production'`, `'staging'`, …). |
| `repository` | `TelemetryRepository` | none | Replace IndexedDB wholesale. |
| `logSource` | `ExternalLogSource` | none | Attach to a logger that already exposes `addSink`. |
| `env` | `true \| string \| string[]` | none | Opt in to the environment layer. |
| `shortcut` | `false \| ShortcutOptions` | enabled | The diagnostics-export shortcut. |

## `errors.*` — the error store

| Option | Type / unit | Default | One line |
| --- | --- | --- | --- |
| `enabled` | `boolean` | `true` | Capture errors at all. |
| `maxRecords` | rows | `500` | Count cap; oldest surplus deleted. `0` is rejected. |
| `retentionDays` | days | `7` | Age cap. **`0` disables it.** Fractions allowed. |
| `maxPayloadBytes` | UTF-8 bytes per record | `16384` | Per-record budget; starts the reduction ladder. |
| `maxEventsPerMinute` | events / 60 s | `120` | Rate limit. `0` disables it. |
| `preventDefaultUnhandledRejection` | `boolean` | `false` | `true` silences the browser's own console error for unhandled rejections. |
| `captureResources` | `boolean` | `false` | Also record `<img>`/`<script>`/`<link>` load failures. |
| `captureCsp` | `boolean` | `false` | Also record `securitypolicyviolation`. |
| `captureChunkErrors` | `boolean` | `true` | Recognise dynamic-import / chunk load failures. |
| `allowedQueryParams` | `readonly string[]` | `[]` | Query parameters whose **values** survive redaction. |
| `beforeCapture` | `(record) => ErrorRecord \| null` | none | Inspect, rewrite or drop before storage. |

## `logs.*` — the log store

| Option | Type / unit | Default | One line |
| --- | --- | --- | --- |
| `enabled` | `boolean` | `true` | Persist logs at all. |
| `level` | level | `'warn'` | The **persist** threshold. |
| `consoleLevel` | level | **none** | The **console** threshold, applied at initialisation. No default on purpose. |
| `maxRecords` | rows | `2000` | Count cap. |
| `retentionDays` | days | `3` | Age cap. `0` disables it. |
| `maxPayloadBytes` | UTF-8 bytes per record | `4096` | Per-record budget. |
| `maxLogsPerMinute` | logs / 60 s | `600` | Rate limit. `0` disables it. |
| `writeFlushMs` | milliseconds | `1000` | Upper bound on how long a buffered log waits before being written. |
| `writeBatchSize` | entries | `50` | Buffered entries that trigger an immediate write. |
| `captureConsole` | `boolean` | `false` | Wrap `console.warn` / `console.error`. |
| `beforeStore` | `(record) => LogRecord \| null` | none | The log equivalent of `beforeCapture`. |

`level` and `consoleLevel` are independent, and confusing them is the most common configuration mistake:
production usually wants persistence at `'warn'` and the console at `'off'`. `logger.setLevel(...)` stays
the runtime control, and `destroyTelemetry()` resets the console level to the factory `'warn'`.

## `redaction.*` — the security boundary

| Option | Type / unit | Default | One line |
| --- | --- | --- | --- |
| `extraSensitiveKeys` | `readonly (string \| RegExp)[]` | `[]` | Additional key names treated as sensitive. |
| `extraPatterns` | `readonly RegExp[]` | `[]` | Additional free-text patterns, applied **after** the built-in rules. |
| `allowedQueryParams` | `readonly string[]` | `[]` | Replaces the default allow-list. The only option here that *relaxes* a rule. |

## `rest.*` — uploads

| Option | Type / unit | Default | One line |
| --- | --- | --- | --- |
| `errorsUrl` | absolute `http(s)` or a path | none | Where error batches are posted. |
| `logsUrl` | absolute `http(s)` or a path | none | Where log batches are posted. |
| `enabled` | `boolean` | `true` when a URL or transport exists | Switch uploads off while keeping the URLs. |
| `intervalMs` | milliseconds | `30000` | Floor between flush runs after a success. |
| `batchSize` | records per request | `50` | Records in one `POST` body. |
| `credentials` | `'omit' \| 'same-origin' \| 'include'` | `'same-origin'` | `fetch` credentials mode. `'include'` is never implied. |
| `getHeaders` | `() => Record<string,string> \| Promise<…>` | none | Awaited per request. Throwing is **retryable**. |
| `transport` | `RemoteTransport` | none | Replace `fetch`. Supplying one also activates sync. |
| `requireHttps` | `boolean` | `false` | Reject plain `http:` except on localhost. |
| `onTerminalFailure` | `(status, records) => void` | none | Once per terminally-failed batch. |

## `shortcut` — the diagnostics export

| Option | Type / unit | Default | One line |
| --- | --- | --- | --- |
| `key` | `string` | `'d'` | A single letter or digit, matched on the physical key. |
| `ctrl` / `shift` / `alt` / `meta` | `boolean` | `true` / `true` / `true` / `false` | Required modifiers. Matching is **exact**. |
| `target` | `EventTarget` | `document` | Where the listener is attached, in the capture phase. |
| `allow` | `() => boolean` | none | Gate; must return exactly `true`. |
| `filenamePrefix` | `string` | `'diagnostics-report'` | File is `${prefix}-${ISO timestamp}.html`. |
| `onExported` | `(ok: boolean) => void` | none | After an export that ran — **not** when it returned early. |

## Related

- [config](./README.md) — the precedence rule and what happens to invalid values.
- [environment variables](./02-environment-variables.md) — the same options as variables.
