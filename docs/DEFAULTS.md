# Defaults — what you get when you pass nothing

**Nothing is required.** `initTelemetry()` with no argument is a complete, working configuration:
errors captured, logs persisted, both stored in IndexedDB, nothing uploaded, nothing leaving the
browser.

That is a strong claim, and it is also the reason this page exists. The options reference tells you
what each switch *does*. This page answers the question you actually ask in the middle of an
incident — **"I did not set this. What is it, right now?"** — for every option, and for every
environment variable.

Every table below has the same three columns:

| Column              | The question it answers                                                  |
| ------------------- | ------------------------------------------------------------------------ |
| **Option**          | The name you would write in the options object.                          |
| **If you don't set it** | The value that is in effect when the key is absent.                   |
| **What that means** | The behaviour you actually observe because of that value.                |

A default is a real value that is doing real work, not a placeholder. Where the default is
`undefined`, the column says so and explains what is *not* recorded as a result.

---

## 1. The 60-second version

If you stop reading here, this is every default in one table. The rest of the page explains what
each one means and when to change it.

| Option                        | Default when absent                    |
| ----------------------------- | -------------------------------------- |
| `appName`                     | `undefined` — field omitted            |
| `appVersion`                  | `undefined` — field omitted            |
| `buildId`                     | `undefined` — field omitted            |
| `environment`                 | `undefined` — field omitted            |
| `enabled`                     | `true`                                 |
| `mode`                        | `'local'` (inferred; `'remote'` only when uploads are enabled) |
| `dbPrefix`                    | `'rm-logvault'`                        |
| `openTimeoutMs`               | `5000`                                 |
| `env`                         | `undefined` — **off**, no env read     |
| `errors.enabled`              | `true`                                 |
| `errors.maxRecords`           | `500`                                  |
| `errors.retentionDays`        | `7`                                    |
| `errors.maxPayloadBytes`      | `16384`                                |
| `errors.maxEventsPerMinute`   | `120`                                  |
| `errors.maxRepeatsPerMinute`  | `12`                                   |
| `errors.allowedQueryParams`   | `[]` — the built-in 11 names survive   |
| `errors.preventDefaultUnhandledRejection` | `false`                   |
| `errors.captureResources`     | `false`                                |
| `errors.captureCsp`           | `false`                                |
| `errors.captureChunkErrors`   | `true`                                 |
| `errors.beforeCapture`        | `undefined` — every record is stored   |
| `logs.enabled`                | `true`                                 |
| `logs.level`                  | `'warn'`                               |
| `logs.consoleLevel`           | `undefined` — console level untouched  |
| `logs.maxRecords`             | `2000`                                 |
| `logs.retentionDays`          | `3`                                    |
| `logs.maxPayloadBytes`        | `4096`                                 |
| `logs.maxLogsPerMinute`       | `600`                                  |
| `logs.writeFlushMs`           | `1000`                                 |
| `logs.writeBatchSize`         | `50`                                   |
| `logs.captureConsole`         | `false`                                |
| `logs.beforeStore`            | `undefined` — every log is stored      |
| `redaction.extraSensitiveKeys`| `[]`                                   |
| `redaction.extraPatterns`     | `[]`                                   |
| `redaction.allowedQueryParams`| `undefined` — built-in list applies    |
| `rest.enabled`                | `false` — nothing is uploaded          |
| `rest.errorsUrl`              | `undefined` — no error endpoint        |
| `rest.logsUrl`                | `undefined` — no log endpoint          |
| `rest.intervalMs`             | `30000`                                |
| `rest.batchSize`              | `50`                                   |
| `rest.credentials`            | `'same-origin'`                        |
| `rest.getHeaders`             | `undefined` — no headers sent          |
| `rest.transport`              | `undefined` — built-in `fetch` transport |
| `rest.requireHttps`           | `false`                                |
| `rest.onTerminalFailure`      | `undefined` — no callback              |
| `shortcut`                    | **installed** — `Ctrl+Shift+Alt+D`     |
| `shortcut.key`                | `'d'`                                  |
| `shortcut.ctrl` / `.shift` / `.alt` | `true` / `true` / `true`         |
| `shortcut.meta`               | `false`                                |
| `shortcut.target`             | `document`                             |
| `shortcut.allow`              | `undefined` — no gate, always fires    |
| `shortcut.filenamePrefix`     | `'diagnostics-report'`                 |
| `shortcut.onExported`         | `undefined`                            |
| `consent`                     | `undefined` — no gate, capture allowed |
| `onInternalError`             | `undefined` — internal failures go to the console |
| `repository`                  | `undefined` — built-in IndexedDB       |
| `logSource`                   | `undefined` — no external log source   |

Two defaults surprise people often enough to say them twice:

- **`shortcut` is on by default.** You opted into nothing, and `Ctrl+Shift+Alt+D` already downloads a
  diagnostics report. Disable it with `shortcut: false`.
- **`env` is off by default.** A `.env` file full of `VITE_ERROR_TRACKING_*` variables does
  **nothing** until you pass `env: true`. See §10.

---

## 2. Identity — `appName`, `appVersion`, `buildId`, `environment`

| Option        | If you don't set it | What that means |
| ------------- | ------------------- | --------------- |
| `appName`     | `undefined`         | The `appName` key is **omitted** from the record, not set to `''`. The report shows the record with no application name, and a filter on `App name` will not match it. |
| `appVersion`  | `undefined`         | Omitted the same way. |
| `buildId`     | `undefined`         | Omitted. |
| `environment` | `undefined`         | Omitted. **It is not inferred** — not from `NODE_ENV`, not from `import.meta.env.MODE`, not from `location.hostname`. |

Omitted, rather than empty, is deliberate: an empty string is indistinguishable from a build that
deliberately sent `''`, and a report full of empty columns looks like a bug in the library rather
than an unconfigured field.

The practical consequence: **a report with no `appName` cannot be filtered by app.** IndexedDB is
scoped to an origin, so several applications on one host write to the same two databases, and the
report's *Only this app* button has nothing to narrow on. Setting `appName` is the single
highest-value line in a configuration.

```ts
// src/main.ts
import { initTelemetry } from '@codewithrajat/rm-logvault';

initTelemetry({
  appName: 'checkout', // ← the one field worth always setting
  appVersion: '2.4.1',
  environment: 'production',
});
```

Also available from the environment as `APP_NAME`, `APP_VERSION`, `BUILD_ID` and `APP_ENV` /
`ENVIRONMENT` — but only when `env` is on.

---

## 3. `enabled`, `mode`, `dbPrefix`, `openTimeoutMs`, `env`

### `enabled` — default `true`

The master switch. Absent, capture is on. It gates every stage: `captureError` returns
immediately, `logger` persists nothing, the global handlers are not installed. `enabled: false` is
the runtime kill switch — with `env: true`, `VITE_TELEMETRY_ENABLED=false` does the same thing
without a code change.

### `mode` — default `'local'`

`mode` is **inferred**, not fixed, and it answers "do records leave this browser?":

```
'rest.enabled' is true (a URL or a transport was supplied)  →  'remote'
otherwise                                                   →  'local'
```

With no configuration at all, there is no URL, so `rest.enabled` is `false` and `mode` is `'local'`.
**The library makes zero network requests.** That is the default you get for free, and it is what
makes the library usable with no backend, behind a strict CSP, and in an air-gapped deployment.

Note what `mode` follows: whether uploads are *enabled*, not whether a URL merely exists. A build
that sets `VITE_ERROR_TRACKING_REST_URL` and then `VITE_TELEMETRY_REST_ENABLED=false` correctly
reports `'local'`.

Set it explicitly to be certain — `mode: 'local'` forces uploads off even with a URL configured, and
`mode: 'remote'` with no endpoint stays local and reports `mode-remote-without-endpoint` through
`onInternalError` rather than silently discarding records.

### `dbPrefix` — default `'rm-logvault'`

Produces the two database names `rm-logvault-errors` and `rm-logvault-logs`. Absent, every build of
every app on one origin shares those two databases. Change it when two builds on the same origin
must not mix — the common case is a development build sharing a host with a staging build:

```ts
initTelemetry({ dbPrefix: import.meta.env.DEV ? 'checkout-dev' : 'checkout' });
```

A prefix that cannot be interpolated (a `Symbol`, or an object with a hostile `Symbol.toPrimitive`)
falls back to the default rather than throwing.

### `openTimeoutMs` — default `5000`

How long to wait for the IndexedDB `open()` before declaring storage unavailable. Absent, a hung
open gives up after five seconds and the library continues **console-only**: capture still works,
records are not persisted, and `getTelemetryStatus().storage` is `'unavailable'`.

Five seconds is chosen because a slow open on a cold profile is normal, and an open can hang forever
when another tab holds an upgrade. Raise it on a slow device; lower it in a test that needs a fast
failure.

### `env` — default `undefined` (off)

Absent, **no environment variable is read.** Not one. `import.meta.env` is never touched, which is
what makes the library importable in Node, in SSR, in a Web Worker and in a plain
`<script type="module">`.

```ts
initTelemetry({ appName: 'checkout' }); // VITE_ERROR_TRACKING_MAX_RECORDS is IGNORED
initTelemetry({ env: true });           // now it is read
```

`env: true` uses the `VITE_`, `NEXT_PUBLIC_` and `REACT_APP_` prefixes in that order. A string pins
one prefix; an array pins several, searched in order. See §10.

---

## 4. `errors.*`

Errors are their own database (`${dbPrefix}-errors`) with their own budget.

| Option | If you don't set it | What that means |
| ------ | ------------------- | --------------- |
| `enabled` | `true` | Errors are captured and persisted. |
| `maxRecords` | `500` | At most 500 error **rows** are retained. A new row past the cap evicts the oldest. Not 500 events: one fingerprint aggregates onto one `pending` row with a rising `occurrenceCount`, so the row cap is far from the event cap. |
| `retentionDays` | `7` | Rows older than seven days are deleted by the periodic cleanup. `0` means **no age cutoff** — only `maxRecords` applies. |
| `maxPayloadBytes` | `16384` | One error record may be up to 16 KiB of UTF-8 before progressive reduction kicks in: `extra`, then tags, then stack, then message. Nothing is silently dropped without a marker. |
| `maxEventsPerMinute` | `120` | At most 120 admissions per fixed 60-second window, page-wide. Excess is counted, not stored, and surfaced as `droppedByRateLimit` in `getTelemetryStatus()`. |
| `maxRepeatsPerMinute` | `12` | One fingerprint may produce at most 12 records per 60-second window. A refused repeat does **not** spend the global 120 budget — that is the point, so a poll that fails every five seconds cannot starve genuinely new failures. Surfaced as `droppedByRepeat`. `0` disables it. |
| `allowedQueryParams` | `[]` → the **built-in 11 names** survive | With nothing configured, the values of `limit`, `offset`, `page`, `pageSize`, `size`, `sort`, `order`, `scope`, `lng`, `lang` and `type` are kept in a captured URL; every other query value is redacted. Supplying an array **replaces** that list — including `[]`, which redacts every query value. |
| `preventDefaultUnhandledRejection` | `false` | The library observes `unhandledrejection` and calls nothing. Your app's own behaviour is unchanged. |
| `captureResources` | `false` | A failed `<script>`, `<link>` or `<img>` is **not** captured. Turn it on if you ship hashed asset names and want a 404 recorded. |
| `captureCsp` | `false` | `securitypolicyviolation` events are **not** captured. |
| `captureChunkErrors` | `true` | A dynamic-import failure is recorded as `source: 'chunk'` with `fatal` severity, out of the box. This one is on by default because a stale deploy returning a 404 for a renamed chunk is the single most common production failure and it is invisible to `window.onerror`. |
| `beforeCapture` | `undefined` | Every record that survives rate limiting is stored. Nothing is rewritten or dropped. |

The rate limits are worth reading twice, because the defaults are asymmetric on purpose. `120` per
minute page-wide is roughly two per second — generous for a healthy page and a hard stop for a loop.
`12` per fingerprint is a tenth of that budget, so **one** broken failure can never own more than a
tenth of the window. Without the per-fingerprint limit, a single poll failing every five seconds
would spend a tenth of the error budget on a failure that is already in the report.

### `allowedQueryParams` — the one default that is a list

This is the only default in the errors group whose value is not a number, so it is spelled out:

```ts
// Nothing configured: the built-in list applies.
// /orders?page=2&token=abc  →  /orders?page=2&token=[REDACTED]

// Replace it — now ONLY `locale` survives.
initTelemetry({ errors: { allowedQueryParams: ['locale'] } });

// Replace it with nothing — every query value is redacted.
initTelemetry({ errors: { allowedQueryParams: [] } });
```

A key that is also sensitive (`token`, `password`, `authorization`, …) is never allowed through, even
if you list it. Values are capped at 100 characters.

`redaction.allowedQueryParams` is the other spelling of the same switch; when you set either one it
replaces the built-in list, and the errors-namespace value wins if both are present.

---

## 5. `logs.*`

Logs are their own database (`${dbPrefix}-logs`), written by `logger.*`, and batched.

| Option | If you don't set it | What that means |
| ------ | ------------------- | --------------- |
| `enabled` | `true` | Logs are persisted. The logger facade still prints to the console either way; `enabled: false` only stops persistence. |
| `level` | `'warn'` | Only `warn` and `error` are **persisted**. An `info('user clicked')` is printed to the console if the console level allows it, and stored nowhere. This is the default most often mistaken for "logging is broken". Set `level: 'info'` or `'debug'` to persist more. |
| `consoleLevel` | `undefined` — **no change** | Initialising telemetry does not touch console output. The logger keeps whatever level it already had (`'warn'` until someone calls `logger.setLevel()`). That is deliberate: a library must not change your console on import. Pass `consoleLevel: 'off'` for production or `'debug'` in development to apply one at init. |
| `maxRecords` | `2000` | At most 2000 log rows are retained; the oldest is evicted past the cap. Logs do not aggregate — each call is a row — so this cap is reached much faster than the error cap. |
| `retentionDays` | `3` | Rows older than three days are deleted. `0` means no age cutoff. Logs are shorter-lived than errors by default because they are higher volume and lower value per row. |
| `maxPayloadBytes` | `4096` | 4 KiB per log record before progressive reduction of `args` and then the message. A quarter of the error budget, because a log line that needs 16 KiB is usually a mistake. |
| `maxLogsPerMinute` | `600` | 600 admissions per 60-second window. Five times the error budget, because a chatty page is normal and a log storm is not the same emergency as an error storm. Surfaced as `droppedByRateLimit`. |
| `writeFlushMs` | `1000` | A buffered log sits in memory for at most one second before it is written. This is an **upper bound**, not a poll: a write also happens the moment 50 entries accumulate. |
| `writeBatchSize` | `50` | 50 buffered entries trigger an immediate write, and one IndexedDB transaction carries up to 50 records. |
| `captureConsole` | `false` | `console.warn` and `console.error` calls already in your code are **not** intercepted. The library does not wrap `console` unless asked. |
| `beforeStore` | `undefined` | Every admitted log is stored. |

### Why `level: 'warn'` is the default, and what "missing info logs" means

`warn` is the default for three reasons: it is the level an application already prints in
development, it is low enough to catch the messages that usually accompany a failure, and it is high
enough that a chatty `console.log` page does not fill a 2000-row store in an hour.

The symptom this default causes is specific and worth recognising: **errors appear in the report and
`logger.info(...)` calls do not.** That is not a bug. Persistence starts at `warn`. Fix it with:

```ts
initTelemetry({ logs: { level: 'info' } });   // persist info and above
// or
initTelemetry({ level: 'info' });             // the flat alias, same thing
```

`level` and `consoleLevel` are independent, which is the other half of the design: `level: 'off'`
silences persistence while the console keeps printing, and `consoleLevel: 'off'` silences the console
while persistence continues.

---

## 6. `redaction.*`

| Option | If you don't set it | What that means |
| ------ | ------------------- | --------------- |
| `extraSensitiveKeys` | `[]` | Only the built-in sensitive-key patterns redact. A string entry you add matches the normalised key exactly; a `RegExp` entry is tested against it. |
| `extraPatterns` | `[]` | Only the built-in free-text patterns run (emails, JWTs, bearer tokens, card-shaped digits, private keys, and so on), applied after the built-in passes. |
| `allowedQueryParams` | `undefined` | The built-in 11-name allow-list applies. Supplying an array replaces it. |

There is no "turn redaction off" default and no switch that does it. Redaction is not optional: every
record is sanitized before it is written and again before it is exported. `[]` here means "no
*extra* rules", never "no rules".

---

## 7. `rest.*`

REST is the only network egress in the library, and it is **off** unless you configure it.

| Option | If you don't set it | What that means |
| ------ | ------------------- | --------------- |
| `enabled` | `false` — inferred | Absent, it is `true` only when a `rest.errorsUrl`, `rest.logsUrl` or custom `rest.transport` is supplied. With no endpoint, uploads are off and `mode` is `'local'`. |
| `errorsUrl` | `undefined` | Error batches have nowhere to go and are never sent. Records stay in IndexedDB — which is a complete, valid deployment, not a degraded one. |
| `logsUrl` | `undefined` | Log batches are not sent. |
| `intervalMs` | `30000` | Every 30 seconds the outbox tries a flush. This is the delay between **successful** flushes; failures back off from here rather than retrying at this rate. |
| `batchSize` | `50` | Up to 50 records per request, and one request per store per flush. |
| `credentials` | `'same-origin'` | Cookies are sent to your own origin and never cross-origin. It is never implicitly `'include'` — that would be a privacy decision the library must not make for you. |
| `getHeaders` | `undefined` | No custom headers; the request carries only `Content-Type`. A token therefore needs `getHeaders` or an auth interceptor. |
| `transport` | the built-in `fetch` transport | `fetch` with a timeout and an abort signal. Supplying your own also switches `mode` to `'remote'`. |
| `requireHttps` | `false` | A plain `http:` endpoint is accepted. Set it to `true` to reject one — useful as a guard against shipping a production build pointed at `http://`. |
| `onTerminalFailure` | `undefined` | Nothing is notified when a batch fails permanently — a status that can never succeed on retry: `400`, `401`, `403`, `404`, `405`, `410`, `413`, `415`, `422`. The records are marked `failed` and stay inspectable in the report. |

Absent `errorsUrl` and `logsUrl` is the default and it is not a misconfiguration: **`mode: 'local'`
is a supported end state**, not a stepping stone. Nothing uploads, the shortcut still produces a
complete HTML report, and there is no server to run.

---

## 8. `shortcut`

The shortcut is **installed by default.** This is the one place where "you configured nothing" still
installs a listener, and it is intentional: the report is the point of the library, and a user who
cannot reach it in production has a library that does nothing for them.

| Option | If you don't set it | What that means |
| ------ | ------------------- | --------------- |
| `shortcut` (whole object) | installed | `Ctrl+Shift+Alt+D` downloads a diagnostics report. `shortcut: false` is the only way to remove it. |
| `key` | `'d'` | A single letter maps to the physical `Key<X>`, so the shortcut is keyboard-layout independent. A digit maps to `Digit<N>`. |
| `ctrl` | `true` | Ctrl required. |
| `shift` | `true` | Shift required. |
| `alt` | `true` | Alt required. |
| `meta` | `false` | Meta/Cmd **not** required. Matching is exact, so on macOS `Cmd+Shift+Alt+D` does **not** fire the default. |
| `target` | `document` | The listener is attached to `document` in the capture phase. |
| `allow` | `undefined` | No gate: the shortcut fires for anyone who presses it. Set `allow` to restrict it to internal users. |
| `filenamePrefix` | `'diagnostics-report'` | The download is `diagnostics-report-<timestamp>.html`. |
| `onExported` | `undefined` | Nothing is called with the outcome. |

If you ship this to production without a gate, assume a customer will find the shortcut. That is
usually fine — the report is redacted, and `shortcut.filenamePrefix` plus `shortcut.allow` are enough
to control it. The three-key combination is required by default precisely so a stray press cannot
trigger it.

```ts
initTelemetry({
  shortcut: { allow: () => isInternalUser() }, // gate it
  // or, to remove it entirely:
  // shortcut: false,
});
```

---

## 9. The options with no default, and why

Five options default to `undefined` and mean something by it. They are the ones where a default
would be a *decision the library must not make for you*:

| Option | Default | Why there is no sensible default |
| ------ | ------- | -------------------------------- |
| `logs.consoleLevel` | `undefined` | Any value would change your console output at import time. `undefined` means "leave the level exactly as it is". |
| `consent` | `undefined` | A default gate would be a compliance claim the library is not entitled to make. No gate means capture is allowed. |
| `beforeCapture` / `beforeStore` | `undefined` | A default hook would be a silent filter over data you believe you are storing. |
| `onInternalError` | `undefined` | The library's own failures are reported through `reportInternalFailure` to the console. Absent, they do not escape to your error handler. |
| `rest.getHeaders` / `rest.onTerminalFailure` | `undefined` | A default header provider would have to know your auth. |
| `repository` / `logSource` | `undefined` | Absent, the built-in IndexedDB repository is used and no external logger is attached. |

The general rule: **defaults are chosen so that the library never does something you did not ask
for.** Where the "do nothing" behaviour is safe, it is the default. Where doing nothing would make
the library useless (the shortcut, `captureChunkErrors`), the useful behaviour is the default and
there is a documented switch to turn it off.

---

## 10. Environment variables — what happens if the variable is not set

### First: the variable does nothing unless `env` is on

This is the single most common source of confusion. A `.env` file is inert until the layer is
enabled:

```ts
initTelemetry({ env: true });      // read VITE_ / NEXT_PUBLIC_ / REACT_APP_
initTelemetry({ env: 'VITE_' });   // read VITE_ only
initTelemetry({ appName: 'x' });   // ← env is undefined: NO variable is read
```

So for every variable in the tables below, "if you don't set the variable" and "if you don't enable
`env`" have the same answer: the option keeps its built-in default from §1–§8.

### Second: an unset variable is the same as an absent option

The environment layer only ever *supplies* a value. It never has a default of its own. When a
variable is absent, empty or unparseable, the option it feeds falls through to its built-in default.
That means the two columns below are the same number in every row — which is the property that makes
the layer safe to adopt incrementally.

### Errors

| Variable (add your prefix) | Feeds | If the variable is not set | Default you get |
| --------------------------- | ----- | -------------------------- | --------------- |
| `ERROR_TRACKING_ENABLED` | `errors.enabled` | falls through | `true` — errors are captured |
| `ERROR_TRACKING_RETENTION_DAYS` | `errors.retentionDays` | falls through | `7` days |
| `ERROR_TRACKING_MAX_RECORDS` | `errors.maxRecords` | falls through | `500` rows |
| `ERROR_TRACKING_MAX_PAYLOAD_BYTES` | `errors.maxPayloadBytes` | falls through | `16384` bytes |
| `ERROR_TRACKING_MAX_EVENTS_PER_MINUTE` | `errors.maxEventsPerMinute` | falls through | `120` per 60 s |
| `ERROR_TRACKING_MAX_REPEATS_PER_MINUTE` | `errors.maxRepeatsPerMinute` | falls through | `12` per fingerprint per 60 s |

### Logs

| Variable (add your prefix) | Feeds | If the variable is not set | Default you get |
| -------------------------- | ----- | -------------------------- | --------------- |
| `LOG_PERSIST_ENABLED` | `logs.enabled` | falls through | `true` — logs are persisted |
| `LOG_PERSIST_LEVEL` | `logs.level` | falls through to `LOG_LEVEL`, then to `'warn'` | `'warn'` |
| `LOG_LEVEL` | `logs.consoleLevel`, and the last fallback for `logs.level` | falls through | **no change** to the console; `logs.level` stays `'warn'` |
| `LOG_PERSIST_RETENTION_DAYS` | `logs.retentionDays` | falls through | `3` days |
| `LOG_PERSIST_MAX_RECORDS` | `logs.maxRecords` | falls through | `2000` rows |
| `LOG_PERSIST_MAX_PAYLOAD_BYTES` | `logs.maxPayloadBytes` | falls through | `4096` bytes |
| `LOG_PERSIST_MAX_LOGS_PER_MINUTE` | `logs.maxLogsPerMinute` | falls through | `600` per 60 s |
| `LOG_PERSIST_WRITE_FLUSH_MS` | `logs.writeFlushMs` | falls through | `1000` ms |
| `LOG_PERSIST_WRITE_BATCH_SIZE` | `logs.writeBatchSize` | falls through | `50` entries |

`LOG_PERSIST_LEVEL` has one special case that is easier to see than to describe: **an empty value is
not a mistake, it is an instruction.**

```bash
LOG_PERSIST_LEVEL=          # empty → inherit LOG_LEVEL
LOG_LEVEL=info              # → logs.level = 'info', logs.consoleLevel = 'info'
LOG_PERSIST_LEVEL=error     # → logs.level = 'error', console stays at 'info'
```

That is why `VITE_LOG_PERSIST_LEVEL=` appears in a `.env` with nothing after the `=`: it says "use
whatever `LOG_LEVEL` says" instead of pinning a level.

`LOG_LEVEL` is a **shared** default, not a console-only one. It is a candidate in both chains:

```text
logs.consoleLevel:  logs.consoleLevel  →  consoleLevel  →  LOG_LEVEL  →  (no default: unchanged)
logs.level:         logs.level  →  level  →  LOG_PERSIST_LEVEL  →  TELEMETRY_LOG_LEVEL  →  LOG_LEVEL  →  'warn'
```

So a build that sets only `LOG_LEVEL=debug` prints **and** persists debug lines, and a build that sets
only `LOG_LEVEL=error` persists at `error` rather than at the `'warn'` default. That is why the table
above says "falls through" for `LOG_LEVEL`: if you do not set it, nothing changes about the console,
and persistence stays on its own default.

### REST

| Variable (add your prefix) | Feeds | If the variable is not set | Default you get |
| -------------------------- | ----- | -------------------------- | --------------- |
| `TELEMETRY_REST_ENABLED` | `rest.enabled` | falls through | `false` — nothing uploads |
| `ERROR_TRACKING_REST_URL` | `rest.errorsUrl` | falls through | `undefined` — no error endpoint |
| `LOG_TRACKING_REST_URL` | `rest.logsUrl` | falls through | `undefined` — no log endpoint |
| `TELEMETRY_SYNC_INTERVAL_MS` | `rest.intervalMs` | falls through | `30000` ms between flushes |
| `TELEMETRY_SYNC_BATCH_SIZE` | `rest.batchSize` | falls through | `50` records per request |

Note the ordering trap: **a URL alone does not upload if `TELEMETRY_REST_ENABLED=false`.** The
default for `rest.enabled` is "true when a URL is supplied", but an explicit `false` wins over that
inference — and `parseBool` accepts `false`, so the variable is honoured.

### Identity and top level

| Variable (add your prefix) | Feeds | If the variable is not set | Default you get |
| -------------------------- | ----- | -------------------------- | --------------- |
| `APP_NAME` | `appName` | falls through | `undefined` — field omitted |
| `APP_VERSION` | `appVersion` | falls through | `undefined` — field omitted |
| `BUILD_ID` | `buildId` | falls through | `undefined` — field omitted |
| `APP_ENV`, `ENVIRONMENT` | `environment` | falls through | `undefined` — field omitted |
| `TELEMETRY_ENABLED` | `enabled` | falls through | `true` |
| `TELEMETRY_DB_PREFIX` | `dbPrefix` | falls through | `'rm-logvault'` |
| `TELEMETRY_OPEN_TIMEOUT_MS` | `openTimeoutMs` | falls through | `5000` ms |

There is no variable for `mode`, `errors.allowedQueryParams`, the shortcut, `consent`, `onInternalError`
or any callback — those stay code-only. See
[OPTIONS-CHEATSHEET.md §5.2](OPTIONS-CHEATSHEET.md#52-options-that-have-no-environment-variable).

### An invalid value is the same as an unset one

Every variable is parsed defensively, and an unparseable value is **ignored**, so the option falls
through to the default instead of changing behaviour:

| Input | Result | Why |
| ----- | ------ | --- |
| `ERROR_TRACKING_ENABLED=maybe` | ignored → `true` | not a recognised boolean |
| `ERROR_TRACKING_MAX_RECORDS=` (empty) | ignored → `500` | empty counts as absent |
| `ERROR_TRACKING_MAX_RECORDS=lots` | ignored → `500` | not a number |
| `TELEMETRY_SYNC_BATCH_SIZE=-5` | ignored → `50` | negative numbers are rejected |
| `LOG_PERSIST_MAX_RECORDS=10.9` | `10` | integer options are floored |
| `ERROR_TRACKING_RETENTION_DAYS=0.5` | `0.5` — twelve hours | `retentionDays` is **not** floored, so a fraction is meaningful |
| `LOG_PERSIST_ENABLED=0` | `false` | `0` is a recognised boolean |
| `LOG_PERSIST_LEVEL=verbose` | ignored → `'warn'` | not a recognised level |
| `LOG_PERSIST_LEVEL=` (empty) | ignored → inherits `LOG_LEVEL` | present-but-empty counts as absent |

`0` is meaningful where a limit can sensibly be disabled — `retentionDays`, `maxEventsPerMinute`,
`maxRepeatsPerMinute`, `maxLogsPerMinute` — and rejected as a mistake where it cannot
(`maxRecords`, `maxPayloadBytes`: "store nothing" is never what a typo meant).

```bash
# .env.production — a complete environment-driven configuration
VITE_APP_NAME=checkout
VITE_APP_ENV=production

VITE_ERROR_TRACKING_ENABLED=true
VITE_ERROR_TRACKING_RETENTION_DAYS=7
VITE_ERROR_TRACKING_MAX_RECORDS=500
VITE_ERROR_TRACKING_MAX_PAYLOAD_BYTES=16384

# An empty value means "inherit VITE_LOG_LEVEL" rather than "pin a level"
VITE_LOG_PERSIST_ENABLED=true
VITE_LOG_PERSIST_LEVEL=
VITE_LOG_PERSIST_RETENTION_DAYS=3
VITE_LOG_PERSIST_MAX_RECORDS=2000
VITE_LOG_PERSIST_MAX_PAYLOAD_BYTES=4096

# Both are needed: the flag AND a URL
VITE_TELEMETRY_REST_ENABLED=true
VITE_ERROR_TRACKING_REST_URL=/api/telemetry/errors
VITE_LOG_TRACKING_REST_URL=/api/telemetry/logs
VITE_TELEMETRY_SYNC_INTERVAL_MS=30000
VITE_TELEMETRY_SYNC_BATCH_SIZE=50
```

```ts
// src/main.ts — one line turns the whole file on
initTelemetry({ env: 'VITE_' });
```

---

## 11. Precedence, and what "explicit" means

Defaults are the bottom of a three-level chain:

```
explicit option   >   environment adapter (env / fromEnv)   >   built-in default
```

Once the flat aliases exist there are two levels of explicitness at the top:

```
nested option   >   flat alias   >   environment   >   built-in default
```

So a value from the environment **loses** to anything you pass in code, and a nested option beats
its own flat alias. The full walkthrough, including the endpoint's four candidates
(`rest.errorsUrl` → `errorUrl` → `url` → env), is in
[CONFIGURATION.md §1](CONFIGURATION.md#1-precedence).

The rule that matters here: **you never have to unset a default.** There is no "opt out of the
default" step. Passing nothing is what selects it, and passing anything valid replaces it.

---

## 12. Reading the defaults back at runtime

Three ways to confirm rather than trust this page.

### `resolveOptions({})` — the fully-resolved object

`resolveOptions` is exported, never throws, and returns a frozen object with **no `undefined` gaps**
for every option that has a default. This is the authoritative answer for what your process is
actually running:

```ts
import { resolveOptions } from '@codewithrajat/rm-logvault';

const resolved = resolveOptions({ appName: 'checkout' });
resolved.errors.maxRecords; // 500
resolved.logs.level; // 'warn'
resolved.logs.consoleLevel; // undefined — "leave the console alone"
resolved.mode; // 'local' — no endpoint was configured
resolved.shortcut; // an object: the shortcut is installed
resolved.rest.enabled; // false
```

Because it is the same function `initTelemetry` calls, a value here is the value in force. Note that
`resolveOptions` honours `options.env` exactly as `initTelemetry` does, so
`resolveOptions({ env: 'VITE_' })` shows you what your environment *actually* contributes — which is
the fastest way to debug a variable that you believe is set.

### `DEFAULT_OPTIONS` — the literal table

`DEFAULT_OPTIONS` is the exported constant that `resolveOptions` reads its fallbacks from, so
documentation and tests share one source of truth:

```ts
import { DEFAULT_OPTIONS } from '@codewithrajat/rm-logvault';

DEFAULT_OPTIONS.errors.maxRecords;            // 500
DEFAULT_OPTIONS.errors.retentionDays;         // 7
DEFAULT_OPTIONS.errors.maxPayloadBytes;       // 16384
DEFAULT_OPTIONS.logs.level;                   // 'warn'
DEFAULT_OPTIONS.logs.consoleLevel;            // undefined
DEFAULT_OPTIONS.logs.maxRecords;              // 2000
DEFAULT_OPTIONS.rest.intervalMs;              // 30000
DEFAULT_OPTIONS.rest.batchSize;               // 50
DEFAULT_OPTIONS.rest.credentials;             // 'same-origin'
DEFAULT_OPTIONS.dbPrefix;                     // 'rm-logvault'
```

`DEFAULT_OPTIONS` does not cover the shortcut or the endpoint URLs, because those are resolved
contextually; use `resolveOptions` for the complete picture.

### `getTelemetryStatus()` — what is happening now

The resolved options say what was configured; the status says what is actually going on. Absent
configuration, this is what a healthy page reports:

```ts
import { getTelemetryStatus } from '@codewithrajat/rm-logvault';

getTelemetryStatus();
// {
//   initialized: true,
//   mode: 'local',            // nothing is uploaded
//   storage: 'ready',         // IndexedDB opened
//   online: true,
//   pending: { errors: 0, logs: 0 },
//   droppedByRateLimit: 0,
//   droppedByRepeat: 0,
//   lastSync: undefined,      // never synced, because there is nowhere to sync to
//   syncStatus: 'idle'
// }
```

`droppedByRateLimit` and `droppedByRepeat` are the two counters to read when a record you expected is
missing: the first means the page is producing more than 120 errors (or 600 logs) a minute, the
second means that particular failure is already in the report and the budget went to new ones.

---

## 13. Related

- [README.md](../README.md) — the entry point: the quick start, the per-framework setup, the full
  `TelemetryOptions` tables this page annotates, the FAQ and the troubleshooting table. Its
  `## Configuration` section is the same defaults in option-table form.
- [docs/README.md](README.md) — the index of every document in this folder, with a one-line summary of
  each.
- [CONFIGURATION.md](CONFIGURATION.md) — the exhaustive option reference, precedence, the
  invalid-value rules and the presets. §13 is the environment-variable reference.
- [OPTIONS-CHEATSHEET.md](OPTIONS-CHEATSHEET.md) — one entry per option: what it means, what it does
  and does not do, what `true` / `false` / `0` / an invalid value resolves to.
- [PRIVACY-GDPR.md](PRIVACY-GDPR.md) — the retention defaults (7 days for errors, 3 for logs) as a
  compliance question, and how to change them.
- [TROUBLESHOOTING.md](TROUBLESHOOTING.md) — the symptoms these defaults cause: missing info-level
  logs, nothing uploading, the shortcut not firing, and records in both databases.
- [examples/vanilla/config/02-environment-variables.md](../examples/vanilla/config/02-environment-variables.md)
  — the environment layer with per-variable examples in a plain Vite app.
- [examples/vanilla/config/01-options-at-a-glance.md](../examples/vanilla/config/01-options-at-a-glance.md)
  — the same defaults with the option that overrides each one.
