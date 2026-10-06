# Options cheat-sheet

Two things live here:

1. **The complete `TelemetryOptions` object**, copy-pasteable, with every option and its real
   default inline (§1).
2. **A per-option deep dive** (§4 onwards): what the option means, exactly what it does, what it
   deliberately does *not* do, what each value form means (`true`, `false`, a number, a string, a
   callback), its limits and bounds, when it is read, and the exact signature of anything callable.

Read §2 first — it defines the vocabularly every entry uses, so "invalid input" and "at init" mean
one precise thing throughout.

> **Relationship to [CONFIGURATION.md](CONFIGURATION.md).** That document is authoritative: it owns
> the precedence rule, the invalid-value rules for numbers and levels, the `mode` decision tree, the
> resolved-form interfaces, and the reasoning behind each default. This file is the same surface in
> the shape you actually type, plus the per-option detail. Where the two ever appear to disagree,
> CONFIGURATION.md is right and this file is the bug.

Every default below is quoted from `DEFAULT_OPTIONS` and `resolveOptions` in
`src/core/config.ts`, every limit from `src/errors/constants.ts`,
`src/storage/storage.constants.ts` and `src/sync/sync.types.ts`, and every callback signature from
the `Resolved*` interfaces in the same `config.ts`.

---

## 1. The complete object

```ts
import { initTelemetry } from '@codewithrajat/rm-logvault';

initTelemetry({
  // ── identity ────────────────────────────────────────────────────────────────
  // All four default to `undefined`. Nothing is read from the environment
  // unless you opt in with `env` below.
  appName: 'my-app', //         string | undefined
  appVersion: '1.4.2', //       string | undefined
  buildId: 'a1b2c3d', //        string | undefined — commit SHA, CI run id
  environment: 'production', // string | undefined — 'staging', 'development', …

  // ── master switches ─────────────────────────────────────────────────────────
  enabled: true, //             default true. false => every capture is a no-op
  mode: 'local', //             'local' | 'remote'. DERIVED: 'remote' when rest is
  //                            enabled, else 'local'. 'local' => no network at all
  dbPrefix: 'rm-logvault', //   => rm-logvault-errors and rm-logvault-logs
  openTimeoutMs: 5000, //       ms to wait for indexedDB.open() before giving up

  // ── build-time environment layer ────────────────────────────────────────────
  // Opt-in only: the core never reads import.meta.env or process.env by itself.
  env: false, //                boolean | string | readonly string[]
  //                            true         => ['VITE_', 'NEXT_PUBLIC_', 'REACT_APP_']
  //                            'NEXT_PUBLIC_' | ['VITE_', 'MY_'] to pin prefixes
  //                            '' or []     => ignored, i.e. no environment layer

  // ── errors ──────────────────────────────────────────────────────────────────
  errors: {
    enabled: true, //                         false also skips the global handlers
    maxRecords: 500, //                       0 and negatives are ignored
    retentionDays: 7, //                      0 disables the age cutoff
    maxPayloadBytes: 16384, //                record dropped if it will not fit
    maxEventsPerMinute: 120, //               0 disables the rate limit
    allowedQueryParams: undefined, //         see §9 — one knob, two places
    preventDefaultUnhandledRejection: false, // never change host behaviour by default
    captureResources: false, //               failed <script> / <link> / <img> loads
    captureCsp: false, //                     securitypolicyviolation events
    captureChunkErrors: true, //              dynamic-import failure => source 'chunk'
    beforeCapture: undefined, //              (record) => record | null
  },

  // ── logs ────────────────────────────────────────────────────────────────────
  logs: {
    enabled: true,
    level: 'warn', //              PERSIST threshold: trace|debug|info|warn|error|off
    consoleLevel: undefined, //    CONSOLE threshold. NO DEFAULT on purpose — omitting
    //                             it leaves console output exactly as it was
    maxRecords: 2000,
    retentionDays: 3, //           0 disables the age cutoff
    maxPayloadBytes: 4096,
    maxLogsPerMinute: 600, //      0 disables the rate limit
    writeFlushMs: 1000, //         upper bound before a buffered log is written
    writeBatchSize: 50, //         …or this many entries, whichever comes first
    captureConsole: false, //      wraps console.warn and console.error only
    beforeStore: undefined, //     (record) => record | null
  },

  // ── redaction ───────────────────────────────────────────────────────────────
  redaction: {
    extraSensitiveKeys: [], //       (string | RegExp)[] — exact names or patterns
    extraPatterns: [], //            RegExp[] applied after the built-in rules
    allowedQueryParams: undefined, // undefined => DEFAULT_ALLOWED_QUERY_PARAMS
  },

  // ── rest / upload ───────────────────────────────────────────────────────────
  rest: {
    enabled: false, //            DERIVED: true when a URL or a transport is supplied
    errorsUrl: undefined, //      e.g. '/telemetry/errors'
    logsUrl: undefined, //        e.g. '/telemetry/logs'
    intervalMs: 30000, //         delay after a successful run
    batchSize: 50, //             records per request
    credentials: 'same-origin', // 'omit' | 'same-origin' | 'include'
    getHeaders: undefined, //     () => Record<string,string> | Promise<…>
    transport: undefined, //      RemoteTransport { name?, send(request) }
    requireHttps: false, //       reject plain http: except on localhost
    onTerminalFailure: undefined, // (status, records: { id }[]) => void
  },

  // ── diagnostics shortcut ────────────────────────────────────────────────────
  // Omitting `shortcut` INSTALLS Ctrl+Shift+Alt+D. Only `false` disables it.
  shortcut: {
    key: 'd', //                        one letter or digit; matched on event.code
    ctrl: true,
    shift: true,
    alt: true,
    meta: false, //                     matching is EXACT — an extra modifier fails
    target: undefined, //               EventTarget; defaults to document, capture phase
    allow: undefined, //                () => boolean; must return literal true
    filenamePrefix: 'diagnostics-report',
    onExported: undefined, //           (ok: boolean) => void — makes failures visible
  },

  // ── hooks and integration ───────────────────────────────────────────────────
  consent: undefined, //          () => boolean, checked before every capture/upload
  onInternalError: undefined, //  (stage: string, error: unknown) => void
  repository: undefined, //       TelemetryRepository; IndexedDB unless you swap it
  logSource: undefined, //        { addSink(sink): () => void }

  // ── flat aliases ────────────────────────────────────────────────────────────
  // Fourteen shorthands for a nested option above. The NESTED option always wins;
  // the alias wins over the environment, which wins over the built-in default.
  // All fourteen default to `undefined`: no alias carries a default of its own,
  // because the nested option it feeds is the thing that has one. §4a has a full
  // entry per alias, and §3.1.1 has the resolved default for each.
  app: undefined, //                -> appName            (default: none)
  version: undefined, //            -> appVersion         (default: none)
  build: undefined, //              -> buildId            (default: none)
  url: undefined, //                -> rest.errorsUrl AND rest.logsUrl (none)
  errorUrl: undefined, //           -> rest.errorsUrl     (default: none)
  logUrl: undefined, //             -> rest.logsUrl       (default: none)
  headers: undefined, //            -> rest.getHeaders    (default: none)
  level: undefined, //              -> logs.level         (default: 'warn')
  consoleLevel: undefined, //       -> logs.consoleLevel  (default: none)
  captureConsole: undefined, //     -> logs.captureConsole (default: false)
  maxErrors: undefined, //          -> errors.maxRecords  (default: 500)
  maxLogs: undefined, //            -> logs.maxRecords    (default: 2000)
  errorRetentionDays: undefined, // -> errors.retentionDays (default: 7)
  logRetentionDays: undefined, //   -> logs.retentionDays   (default: 3)
});

Top-level keys, for reference: `appName`, `appVersion`, `buildId`, `environment`, `enabled`, `mode`,
`dbPrefix`, `openTimeoutMs`, `env`, `errors`, `logs`, `redaction`, `rest`, `shortcut`, `consent`,
`onInternalError`, `repository`, `logSource` — eighteen options — plus the fourteen flat aliases
`app`, `version`, `build`, `url`, `errorUrl`, `logUrl`, `headers`, `level`, `consoleLevel`,
`captureConsole`, `maxErrors`, `maxLogs`, `errorRetentionDays`, `logRetentionDays`. Thirty-two keys
in total, feeding thirteen distinct nested destinations.

> **Source note.** The aliases resolve to **`undefined`**, not to their nested option's default:
> `maxErrors: undefined` is indistinguishable from omitting `maxErrors`. The resolved value is still
> `errors.maxRecords`'s default of `500`. The parenthesised defaults above are what you observe on
> the resolved configuration, not what the alias itself carries.

---

## 2. How to read an entry

Every option below is described in the same shape. The vocabulary is fixed, so the same five words
always mean the same thing.

### 2.1 The repeated fields

| Field                   | What it answers                                                                                               |
|-------------------------|---------------------------------------------------------------------------------------------------------------|
| **Type**                | The declared TypeScript type. Every optional member is `Maybe<T>`, which is `T \| undefined`.                 |
| **Default**             | What you get when the key is omitted. "None" means the resolved value stays `undefined`.                      |
| **When**                | When the value is read. See the timing vocabulary below.                                                      |
| **What it does**        | The effect, with the limit, count or bound spelled out.                                                       |
| **What it does not do** | The neighbouring behaviour people assume it covers and it does not — the useful half of the entry.            |
| **Values**              | Every accepted form and what each one means, including `true`, `false`, `0` and empty values.                 |
| **Invalid input**       | What happens when the value is the wrong type or out of range. Always "ignored", never "throws".              |
| **Signature**           | For anything callable: the parameter list, the return type, and what each side must honour.                   |

### 2.2 Timing vocabulary used by "When"

| Term            | Meaning                                                                                       |
|-----------------|-----------------------------------------------------------------------------------------------|
| **at init**     | Read once, inside `initTelemetry`. Changing it needs `destroyTelemetry()` then a new init.    |
| **per record**  | Read for every error or log record as it is ingested.                                         |
| **per call**    | Read on every `logger.*` call.                                                                |
| **per persist** | Read each time a buffered batch is written to IndexedDB.                                      |
| **per batch**   | Read for each HTTP request the uploader makes.                                                |
| **per window**  | Read/reset on each fixed 60-second rate-limit window.                                         |
| **per export**  | Read each time a diagnostics report is produced.                                              |
| **always**      | Process-wide for the life of the installation: a global listener or the active sanitizer.     |

### 2.3 What each value *kind* means

This is the table to re-read when the question is "what does it mean if I pass X".

| You pass                                                                                                                   | Resolved meaning                                                                                                                                                                                               |
|----------------------------------------------------------------------------------------------------------------------------|----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------|
| `true`                                                                                                                     | Enable the behaviour. Wherever a default is `true`, this is a no-op.                                                                                                                                           |
| `false`                                                                                                                    | Disable the behaviour — and check the entry for what else is skipped as a consequence (an install step, a listener, a whole pipeline stage).                                                                   |
| `undefined` (or the key omitted)                                                                                           | Take the default. Identical to omitting the key, because every member allows `undefined` explicitly.                                                                                                           |
| A positive number                                                                                                          | Used as given, except that integer options are `Math.floor`ed. `5.9` becomes `5` for `maxRecords`, and stays `5.9` for `retentionDays`.                                                                        |
| `0` on `retentionDays`                                                                                                     | Meaningful: the age cutoff is disabled (the `maxRecords` cap still applies).                                                                                                                                   |
| `0` on `maxEventsPerMinute` / `maxLogsPerMinute`                                                                           | Meaningful: the rate limiter is disabled entirely, so nothing is dropped for volume.                                                                                                                           |
| `0` on `maxRecords` / `maxPayloadBytes` / `intervalMs` / `batchSize` / `openTimeoutMs` / `writeFlushMs` / `writeBatchSize` | **Ignored**, and the default is used instead. Zero is not a "store nothing" request here.                                                                                                                      |
| A negative number, `NaN`, `Infinity`, a numeric string, `null`, `{}`, `[]`, `true`                                         | **Ignored** for every numeric option. The default (or the next layer down the precedence chain) applies.                                                                                                       |
| `''`, `'   '` on a string option                                                                                           | Ignored where the option is a name or a prefix — the default is used. Note this is *not* the same for a URL, which is also ignored, and for `allowedQueryParams`, where `[]` is meaningful.                    |
| A function of the wrong shape                                                                                              | Ignored, and the hook stays `undefined`. The library never calls something you did not supply as a function.                                                                                                   |
| `null` on an object-or-callback option                                                                                     | Ignored for callbacks. For `redaction` arrays, a non-array becomes `[]`.                                                                                                                                       |
| The string `'false'` on a boolean option                                                                                   | **Ignored** — there is no coercion. A boolean option only accepts `true` and `false`. (The env layer parses `'false'`, but by then it is already a boolean.)                                                   |

### 2.4 Two rules that apply to the whole object

**Precedence.** `explicit option > fromEnv layer > built-in default`. Environment values are applied
*under* your explicit options, never over them. Only the options listed in §5.2 can come from the
environment layer at all.

**Invalid input is ignored, never thrown on.** Nothing in this object can make `initTelemetry`
throw: a bad value means "you made a mistake", and the safe reading — the default — applies. That
is why `maxRecords: 0` does not mean "store nothing".

`initTelemetry` is also **idempotent**: a second call returns the existing handle rather than
reconfiguring, so an option you change after the first call has no effect until
`destroyTelemetry()` runs.

---

## 3. Every option at a glance

One row per option: default, the kind of value, whether `0` is honoured, and where it lands.

### 3.1 Top level

| Option            | Type                            | Default               | Zero / empty        | When                               | Lands on                                    |
|-------------------|---------------------------------|-----------------------|---------------------|------------------------------------|---------------------------------------------|
| `appName`         | `string \| undefined`           | none                  | `''` ignored        | per record                         | `environment.appName`, report header        |
| `appVersion`      | `string \| undefined`           | none                  | `''` ignored        | per record                         | `environment.appVersion`, report header     |
| `buildId`         | `string \| undefined`           | none                  | `''` ignored        | per record                         | `environment.buildId`, report header        |
| `environment`     | `string \| undefined`           | none                  | `''` ignored        | per record                         | `environment.environment`, report header    |
| `enabled`         | `boolean \| undefined`          | `true`                | —                   | at init                            | every capture path, storage, listeners      |
| `mode`            | `'local' \| 'remote'`           | inferred              | —                   | at init                            | the uploader's master gate                  |
| `dbPrefix`        | `string \| undefined`           | `'rm-logvault'`       | `''`/`'  '` ignored | at init                            | the two database names                      |
| `openTimeoutMs`   | `number \| undefined`           | `5000`                | `0` ignored         | at init                            | the IndexedDB open budget                   |
| `env`             | `boolean \| string \| string[]` | off (`undefined`)     | `''`/`[]` ignored   | at init                            | the whole env layer                         |
| `consent`         | `() => boolean`                 | none                  | —                   | per record, per persist, per batch | capture, storage, upload                    |
| `onInternalError` | `(stage, error) => void`        | none                  | —                   | always                             | your observer                               |
| `repository`      | `TelemetryRepository`           | IndexedDB pair        | —                   | at init                            | errors + logs stores                        |
| `logSource`       | `ExternalLogSource`             | none                  | —                   | at init                            | an extra sink on your logger                |

### 3.1.1 Flat aliases

The same "at a glance" shape, one row per alias. **Default** is the resolved value you observe when
the alias is omitted *and* nothing else sets the field; **Nested** is the option that beats it; and
the "Zero / empty" column reports the alias-layer behaviour, which is `??` and therefore not the same
as the nested option's validator. Full detail in §4a.

| Alias                | Type                                        | Default (resolved)                         | Zero / empty                                    | When      | Nested option it feeds                  |
|----------------------|---------------------------------------------|--------------------------------------------|-------------------------------------------------|-----------|-----------------------------------------|
| `app`                | `string \| undefined`                       | none                                       | `''` reaches the string validator, then ignored | at init   | `appName` (wins over the alias)         |
| `version`            | `string \| undefined`                       | none                                       | as `app`                                        | at init   | `appVersion`                            |
| `build`              | `string \| undefined`                       | none                                       | as `app`                                        | at init   | `buildId`                               |
| `url`                | `string \| undefined`                       | none                                       | `''` ignored                                    | at init   | `rest.errorsUrl` **and** `rest.logsUrl` |
| `errorUrl`           | `string \| undefined`                       | none                                       | `''` ignored                                    | at init   | `rest.errorsUrl`                        |
| `logUrl`             | `string \| undefined`                       | none                                       | `''` ignored                                    | at init   | `rest.logsUrl`                          |
| `headers`            | `() => Record<string,string> \| Promise<…>` | none                                       | non-function ignored                            | per batch | `rest.getHeaders`                       |
| `level`              | `LogLevelSetting \| undefined`              | `'warn'`                                   | invalid string ignored                          | at init   | `logs.level`                            |
| `consoleLevel`       | `LogLevelSetting \| undefined`              | none — leaves the logger's own level alone | invalid string ignored                          | at init   | `logs.consoleLevel`                     |
| `captureConsole`     | `boolean \| undefined`                      | `false`                                    | non-boolean ignored                             | at init   | `logs.captureConsole`                   |
| `maxErrors`          | `number \| undefined`                       | `500`                                      | `0` ignored                                     | at init   | `errors.maxRecords`                     |
| `maxLogs`            | `number \| undefined`                       | `2000`                                     | `0` ignored                                     | at init   | `logs.maxRecords`                       |
| `errorRetentionDays` | `number \| undefined`                       | `7`                                        | `0` = no cutoff                                 | at init   | `errors.retentionDays`                  |
| `logRetentionDays`   | `number \| undefined`                       | `3`                                        | `0` = no cutoff                                 | at init   | `logs.retentionDays`                    |

Every alias except `headers` is read **at init**, in `resolveOptions`, exactly like the nested option
it feeds — which is why changing one after `initTelemetry` has no effect until `destroyTelemetry()`
and a new init. `headers` resolves a **function reference** at init, and that function is then called
per batch.

### 3.2 `errors.*`

| Option                              | Type                          | Default | Zero             | When           | Lands on                          |
|-------------------------------------|-------------------------------|---------|------------------|----------------|-----------------------------------|
| `enabled`                           | `boolean \| undefined`        | `true`  | —                | at init        | tracker + global handlers         |
| `maxRecords`                        | `number \| undefined`         | `500`   | `0` ignored      | per record     | retention sweep, oldest-first     |
| `retentionDays`                     | `number \| undefined`         | `7`     | `0` = no cutoff  | per record     | retention sweep, age-first        |
| `maxPayloadBytes`                   | `number \| undefined`         | `16384` | `0` ignored      | per record     | reduction ladder, then drop       |
| `maxEventsPerMinute`                | `number \| undefined`         | `120`   | `0` = no limit   | per window     | capture rate limiter              |
| `allowedQueryParams`                | `readonly string[]`           | see §9  | `[]` = keep none | always         | URL query redaction               |
| `preventDefaultUnhandledRejection`  | `boolean \| undefined`        | `false` | —                | always         | `unhandledrejection` events       |
| `captureResources`                  | `boolean \| undefined`        | `false` | —                | always         | capture-phase `error` listener    |
| `captureCsp`                        | `boolean \| undefined`        | `false` | —                | always         | `securitypolicyviolation`         |
| `captureChunkErrors`                | `boolean \| undefined`        | `true`  | —                | per record     | source/severity classification    |
| `beforeCapture`                     | `(record) => record \| null`  | none    | —                | per record     | the record, or nothing            |

### 3.3 `logs.*`

| Option             | Type                         | Default  | Zero            | When        | Lands on                         |
|--------------------|------------------------------|----------|-----------------|-------------|----------------------------------|
| `enabled`          | `boolean \| undefined`       | `true`   | —               | at init     | log sink + log outbox            |
| `level`            | `LogLevelSetting`            | `'warn'` | `'off'` = none  | per call    | what is persisted                |
| `consoleLevel`     | `LogLevelSetting`            | none     | `'off'` = none  | at init     | what is printed                  |
| `maxRecords`       | `number \| undefined`        | `2000`   | `0` ignored     | per persist | retention sweep, oldest-first    |
| `retentionDays`    | `number \| undefined`        | `3`      | `0` = no cutoff | per persist | retention sweep, age-first       |
| `maxPayloadBytes`  | `number \| undefined`        | `4096`   | `0` ignored     | per record  | reduction ladder, then drop      |
| `maxLogsPerMinute` | `number \| undefined`        | `600`    | `0` = no limit  | per window  | persist rate limiter             |
| `writeFlushMs`     | `number \| undefined`        | `1000`   | `0` ignored     | per call    | buffered-write timer             |
| `writeBatchSize`   | `number \| undefined`        | `50`     | `0` ignored     | per call    | buffered-write trigger           |
| `captureConsole`   | `boolean \| undefined`       | `false`  | —               | at init     | `console.warn` / `console.error` |
| `beforeStore`      | `(record) => record \| null` | none     | —               | per record  | the log record, or nothing       |

### 3.4 `redaction.*`, `rest.*`, `shortcut.*`

| Option                                     | Type                                        | Default                            | Zero / empty                 | When         |
|--------------------------------------------|---------------------------------------------|------------------------------------|------------------------------|--------------|
| `redaction.extraSensitiveKeys`             | `readonly (string \| RegExp)[]`             | `[]`                               | non-array → `[]`             | always       |
| `redaction.extraPatterns`                  | `readonly RegExp[]`                         | `[]`                               | non-array → `[]`             | always       |
| `redaction.allowedQueryParams`             | `readonly string[]`                         | built-in list (see §9)             | `[]` = keep no values        | always       |
| `rest.enabled`                             | `boolean \| undefined`                      | derived                            | —                            | at init      |
| `rest.errorsUrl`                           | `string \| undefined`                       | none                               | `''`/`'  '` ignored          | at init      |
| `rest.logsUrl`                             | `string \| undefined`                       | none                               | `''`/`'  '` ignored          | at init      |
| `rest.intervalMs`                          | `number \| undefined`                       | `30000`                            | `0` ignored                  | per flush    |
| `rest.batchSize`                           | `number \| undefined`                       | `50`                               | `0` ignored                  | per batch    |
| `rest.credentials`                         | `RequestCredentials`                        | `'same-origin'`                    | anything else → default      | per batch    |
| `rest.getHeaders`                          | `() => Record<string,string> \| Promise<…>` | none                               | —                            | per batch    |
| `rest.transport`                           | `RemoteTransport`                           | the `fetch` transport              | —                            | per batch    |
| `rest.requireHttps`                        | `boolean \| undefined`                      | `false`                            | —                            | at init      |
| `rest.onTerminalFailure`                   | `(status, records) => void`                 | none                               | —                            | per batch    |
| `shortcut`                                 | `false \| ShortcutOptions`                  | installed with defaults            | `{}` = install with defaults | at init      |
| `shortcut.key`                             | `string \| undefined`                       | `'d'`                              | `''`/`'  '` ignored          | always       |
| `shortcut.ctrl` / `shift` / `alt` / `meta` | `boolean \| undefined`                      | `true` / `true` / `true` / `false` | —                            | always       |
| `shortcut.target`                          | `EventTarget \| undefined`                  | `document`, then the global        | —                            | at init      |
| `shortcut.allow`                           | `() => boolean`                             | none                               | —                            | per keypress |
| `shortcut.filenamePrefix`                  | `string \| undefined`                       | `'diagnostics-report'`             | `''`/`'  '` ignored          | per export   |
| `shortcut.onExported`                      | `(ok: boolean) => void`                     | none                               | —                            | per export   |

### 3.5 Callback signatures

| Option                         | Signature                                                                        |
|--------------------------------|----------------------------------------------------------------------------------|
| `errors.beforeCapture`         | `(record: ErrorRecord) => ErrorRecord \| null`                                   |
| `logs.beforeStore`             | `(record: LogRecord) => LogRecord \| null`                                       |
| `redaction.extraSensitiveKeys` | `readonly (string \| RegExp)[]`                                                  |
| `redaction.extraPatterns`      | `readonly RegExp[]`                                                              |
| `rest.getHeaders`              | `() => Record<string, string> \| Promise<Record<string, string>>`                |
| `headers`                      | the same signature as `rest.getHeaders` — it *is* that option                    |
| `rest.onTerminalFailure`       | `(status: number, records: readonly { id: string }[]) => void`                   |
| `rest.transport`               | `{ name?: string; send(request: TransportRequest): Promise<TransportResponse> }` |
| `shortcut.allow`               | `() => boolean`                                                                  |
| `shortcut.onExported`          | `(ok: boolean) => void`                                                          |
| `consent`                      | `() => boolean`                                                                  |
| `onInternalError`              | `(stage: string, error: unknown) => void`                                        |
| `logSource`                    | `{ addSink(sink: LogSink): () => void }`                                         |
| `repository`                   | `TelemetryRepository` — `{ errors, logs, initialize(), close() }`                |

---

## 4. Top-level options, in detail

### `appName`, `appVersion`, `buildId`, `environment`

- **Type** `string | undefined` (each). **Default** none — `undefined`. **When** per record.
- **What it does.** Stamps your application's identity onto every error record's `environment`
  block and every log record's narrower `environment` block. `appName` is also the value on the
  handle (`initTelemetry(...).appName`), and all four appear in the diagnostics report header and
  in the REST batch envelope's `app` object (`''` when unset).
- **What it does not do.** It does not tag or filter anything, and it is **not** a redaction
  boundary: each value passes through `sanitizer.text(value, 200)` when the block is built, so a
  token accidentally placed in `appVersion` is redacted on the way in, and the stored value is
  truncated to 200 characters. It also does not group records — that is `fingerprint`, which is
  built from the error's own fields.
- **Values.** Any non-empty string. The value is `.trim()`ed, so `'  checkout  '` stores
  `'checkout'`.
- **Invalid input.** A non-string, `''` or a whitespace-only string is ignored: the field stays
  `undefined` and the environment block simply omits it. A number like `42` is ignored, not
  coerced — the field is typed `string`.
- **Why you would set `buildId`.** It is the difference between "this happened in production" and
  "this happened in production *on the deploy whose assets are stale*", which is the question a
  chunk-load failure actually asks.

### `enabled`

- **Type** `boolean | undefined`. **Default** `true`. **When** at init.
- **`true`** — the full pipeline is installed: the sandboxed sanitizer is applied first, then the
  repository, both trackers, the global handlers, the console capture if asked for, the shortcut
  and the uploader.
- **`false`** — a documented no-op installation. `initTelemetry` returns a **disabled handle**
  (`enabled: false`, `storage: 'disabled'`, `flush()` resolves, `sync()` returns empty summaries),
  and installs none of the following: no repository is created at all, no IndexedDB connection is
  opened, no global handler is attached, no shortcut listener exists, and `captureError` returns
  immediately without even buffering. Errors captured before the call are cleared away by
  `destroyTelemetry`'s counterpart path, not stored.
- **What it does not do.** It does not silence the `logger`. Repository-level silence (logs and
  errors) and console silence (`logs.consoleLevel`) are two independent things, and `enabled: false`
  is neither. It also does not stop a *previous* installation — call `destroyTelemetry()` first.
- **Values.** Only the literals `true` and `false`. Any other value (including the string
  `'false'`) is ignored and the default `true` applies.
- **Consequence to plan for.** With `enabled: false`, `exportDiagnosticsReport()` resolves with
  `ok: false` because there is no repository to read from. That is correct, and worth knowing before
  wiring a "download the report" button.

### `mode`

- **Type** `'local' | 'remote' | undefined`. **Default** inferred — `'remote'` when `rest.enabled`
  resolved true, otherwise `'local'`. **When** at init.
- **What it means.** It answers exactly one question: does this installation ever touch the network?
- **`'local'`** — IndexedDB only, and no network request is ever made, even if a URL is configured.
  This is the structural half of the privacy claim: with `mode: 'local'` the uploader is disabled
  before it is created, so there is no code path to egress.
- **`'remote'`** — write to IndexedDB first (always), then upload. It is **not** an alternative to
  local storage, and it is a statement of intent: with no usable endpoint the uploader stays
  disabled and the stage `mode-remote-without-endpoint` is reported **once** through
  `onInternalError`, while records keep accumulating locally instead of being discarded.
- **What it does not do.** It does not enable uploads on its own. The uploader starts only when
  *all three* hold: `mode === 'remote'`, `rest.enabled === true`, and at least one endpoint survived
  `resolveEndpoint` validation. `isSyncConfigured(resolveOptions(options))` is the honest
  pre-flight check for that combination.
- **Values.**

  | What you passed                                        | Resolved `mode` | Network requests      |
  | ------------------------------------------------------ | --------------- | --------------------- |
  | nothing (or only `errors`, `logs`, `redaction`, `shortcut`) | `'local'`   | **none, ever**        |
  | `rest.errorsUrl`, `rest.logsUrl` or `rest.transport`    | `'remote'`      | yes, to those URLs    |
  | `mode: 'local'` **and** a URL                           | `'local'`       | **none** — URL ignored |
  | `mode: 'remote'` and no usable URL                       | `'remote'`      | none — reported once  |

- **Invalid input.** An unrecognised string is ignored and inference decides. Note the inference
  reads the *resolved* `rest.enabled`, not merely the presence of a URL: a deployment that
  configures endpoints and then sets `rest.enabled: false` correctly reports `'local'`.
- **Reading it back.** `getTelemetryStatus().mode` returns the resolved value, and
  `getState().options.mode` is what an `onInternalError` callback sees.

### `dbPrefix`

- **Type** `string | undefined`. **Default** `'rm-logvault'`. **When** at init.
- **What it does.** Produces the two database names through `databaseNames(dbPrefix)`:
  `` `${dbPrefix}-errors` `` and `` `${dbPrefix}-logs` ``.
- **What it does not do.** It does not create a namespace inside one database — there are **two
  separate IndexedDB databases**, one per record kind, each with its own version number and store.
  It also does not affect a custom `repository`, which names its own stores.
- **Values.** Any non-empty string after trimming. `'kiosk-blackbox'` gives
  `kiosk-blackbox-errors` and `kiosk-blackbox-logs`.
- **Invalid input.** `''` or `'  '` falls back to `'rm-logvault'` rather than producing a database
  named `"  -errors"`.
- **Why you would change it.** A separate prefix per environment keeps a staging vault out of a
  developer's production data on the same origin, and a per-app prefix keeps two applications on a
  shared origin from aggregating each other's fingerprints.

### `openTimeoutMs`

- **Type** `number | undefined`. **Default** `5000` (the shared `DEFAULT_OPEN_TIMEOUT_MS`, so the
  storage layer's own fallback cannot drift). **When** at init; measured per open attempt.
- **What it does.** Bounds how long `indexedDB.open()` may take before storage is declared
  unavailable. A cold profile opening a large database is genuinely slow, and an open can hang
  forever when another tab is holding a version upgrade, so this is the switch that turns either
  case into "console-only operation" instead of a page that waits.
- **What it does not do.** It does not retry and does not throw: on expiry the storage state becomes
  `'unavailable'`, capture continues into memory-only paths, and `getTelemetryStatus().storage`
  reports the truth. It does not abort an in-flight transaction either — only the open.
- **Values.** A positive finite number, floored to an integer. There is no documented maximum;
  anything above 60 000 ms is a hang nobody wants to wait out.
- **Invalid input.** `0`, a negative, `NaN`, `Infinity` or a non-number falls back to `5000`.
- **Tuning.** Raise it on a slow device or a large vault where storage is given up too eagerly;
  lower it (for example `250`) in tests that need fast failure.

### `env`

- **Type** `boolean | string | readonly string[] | undefined`. **Default** off. **When** at init.
- **What it does.** Opts in to reading build-time environment variables. `true` uses
  `DEFAULT_ENV_PREFIXES` = `['VITE_', 'NEXT_PUBLIC_', 'REACT_APP_']`; a non-empty string pins that
  one prefix; a non-empty array pins those prefixes in priority order. Within the layer, prefixes
  are tried in order, the **first non-empty match wins**, and for each name `import.meta.env` is
  consulted before `process.env`.
- **What it does not do.** It does not read anything unless asked — the core never touches
  `import.meta.env` or `process.env` on its own, which is what keeps `initTelemetry` usable in
  Node, SSR, a Web Worker and a bare ESM script. It also never overrides an explicit option: the
  environment is applied *under* your options.
- **Values.**

  | Value                                | Effect                                                        |
  | ------------------------------------ | ------------------------------------------------------------- |
  | absent / `false`                     | No environment layer at all.                                   |
  | `true`                               | `['VITE_', 'NEXT_PUBLIC_', 'REACT_APP_']`.                     |
  | `'MY_PREFIX_'` (non-empty string)    | Exactly that prefix.                                            |
  | `['VITE_', 'PUBLIC_']` (non-empty)   | Those prefixes, in order.                                       |
  | `''` or `[]`                         | Ignored — falls back to "no environment layer".                 |

- **Invalid input.** `0`, `null`, `{}` and any other type are ignored, leaving no environment
  layer. Note `env: 0` is **not** the same as `env: false` in the type system, but resolves the
  same way.
- **What actually arrives from the layer — and what does not.** `fromEnv()` returns a **flat**
  `EnvOptions` object whose field names mostly do not match the option tree. `resolveOptions` reads
  the environment only through `options.env`, so only the fields it maps are applied:

  | Applied by `resolveOptions` from the env layer                                                                                                     |
  | -------------------------------------------------------------------------------------------------------------------------------------------------- |
  | `appName`, `appVersion`, `buildId`, `environment`, `enabled`, `dbPrefix`, `openTimeoutMs`                                                            |
  | `errors.enabled`, `errors.maxRecords`, `errors.retentionDays`, `errors.maxPayloadBytes`, `errors.maxEventsPerMinute`                                 |
  | `logs.enabled`, `logs.level` (via `LOG_PERSIST_LEVEL` → `TELEMETRY_PERSIST_LEVEL` → `TELEMETRY_LOG_LEVEL` → `LOG_LEVEL`), `logs.consoleLevel` (via `LOG_LEVEL`), `logs.maxRecords`, `logs.retentionDays`, `logs.maxPayloadBytes`, `logs.maxLogsPerMinute`, `logs.writeFlushMs`, `logs.writeBatchSize` |
  | `rest.enabled`, `rest.errorsUrl`, `rest.logsUrl`, `rest.intervalMs`, `rest.batchSize`                                                               |

  **Never** applied from the environment: `mode`, `redaction.*`, `errors.allowedQueryParams`,
  `errors.captureResources`, `errors.captureCsp`, `errors.captureChunkErrors`,
  `errors.beforeCapture`, `logs.captureConsole`, `logs.beforeStore`, `rest.credentials`,
  `rest.getHeaders`, `rest.transport`, `rest.requireHttps`, `rest.onTerminalFailure`,
  `shortcut.*`, `consent`, `onInternalError`, `repository`, `logSource`. There is no environment
  variable for a callback, and there is deliberately none for `mode`.

- **The `fromEnv()` trap.** `fromEnv()` is **not** a drop-in options object and spreading it is
  **not** equivalent to `env: true`. It returns the flat fields (`errorsEnabled`,
  `logsMaxRecords`, `errorsUrl`, …), while `resolveOptions` only consults `options.env`. A spread
  therefore carries just the fields whose names happen to coincide with a top-level option —
  `appName`, `appVersion`, `buildId`, `environment`, `enabled`, `dbPrefix` — and silently drops
  every nested one, including every URL, retention window, cap and level.

  ```ts
  initTelemetry({ env: true });            // the whole environment, correctly placed
  initTelemetry({ env: 'NEXT_PUBLIC_' });  // one prefix

  const env = fromEnv();                   // you read the values yourself
  initTelemetry({ appName: env.appName, errors: { maxRecords: env.errorsMaxRecords } });
  ```

  `fromEnv`'s boolean parser accepts `true`/`1`/`yes`/`on` and `false`/`0`/`no`/`off`,
  case-insensitively and trimmed; `'maybe'`, `''` and `'2'` are ignored, leaving the field absent.

---

## 4a. Flat aliases, in detail

Fourteen top-level fields are shorthands for a nested option. Read the nested option's own entry for
the full behaviour — validation, limits, timing and every value form are identical, because the alias
is collapsed into the nested field *before* any of that runs.

The resolution rule for all fourteen:

```text
nested option  >  flat alias  >  environment (fromEnv layer)  >  built-in default
```

An alias feeds a field, it does not replace it. There is no alias whose value a nested option cannot
override, and there is no nested option that an alias can override.

### `app`

- **Type** `string | undefined`. **Default** none — the alias resolves to `undefined`. **When** at init.
- **Maps to** `appName`. **Wins over it** nothing: `appName` wins.
- What it does, what it does not do, values and invalid input are exactly
  [`appName`'s](#appname-appversion-buildid-environment) — the alias layer passes the value through
  untouched, and the same `sanitizer.text(value, 200)` and the same empty-string handling apply.
- Why it exists: it reads better in the flat one-liner `setupTelemetry({ app: 'checkout' })`. There is
  no `APP` environment variable; the env layer supplies this field as `appName`.

### `version`

- **Type** `string | undefined`. **Default** none. **When** at init.
- **Maps to** `appVersion`, which wins. Same behaviour as `appName` otherwise — `sanitizer.text` at
  200 characters, and a non-string, `''` or whitespace-only value ignored.
- There is no environment variable for this field at all.

### `build`

- **Type** `string | undefined`. **Default** none. **When** at init.
- **Maps to** `buildId`, which wins. The value to use is a commit SHA, a CI run id, or an asset
  manifest hash — the thing that answers "which deploy produced this".
- There is no environment variable for this field at all.

### `url`

- **Type** `string | undefined`. **Default** none. **When** at init.
- **Maps to** `rest.errorsUrl` **and** `rest.logsUrl`, in that order of resolution: it is the last
  fallback before the environment. **Wins over it** `rest.errorsUrl`, `rest.logsUrl`, `errorUrl` and
  `logUrl` — any of the four, for the kind it targets.
- **What it does.** The single-collector case: one endpoint receives both error batches and log
  batches. Because it feeds both, `{ url: '/telemetry', errorUrl: '/e' }` sends errors to `/e` and
  logs to `/telemetry`.
- **What it does not do.** It does not enable uploads by itself. `rest.enabled` is derived — `true`
  when a transport, an `errorsUrl` or a `logsUrl` is present — and `mode` then follows. So `url`
  alone does flip the installation to `'remote'`; if you want the endpoints configured but the outbox
  closed, set `rest.enabled: false`.
- **Invalid input.** A non-string, `''` or `'  '` is ignored. A URL that fails `resolveEndpoint`
  validation (`requireHttps: true` against a plain `http:` host, say) leaves the installation in
  IndexedDB-only mode with `mode-remote-without-endpoint` reported once.

### `errorUrl`

- **Type** `string | undefined`. **Default** none. **When** at init.
- **Maps to** `rest.errorsUrl`. **Precedence** `rest.errorsUrl` → `errorUrl` → `url` → env.
- Use it when errors and logs go to different collectors. See
  [`rest.errorsUrl`](#resterrorsurl) for the URL rules, which are unchanged.

### `logUrl`

- **Type** `string | undefined`. **Default** none. **When** at init.
- **Maps to** `rest.logsUrl`. **Precedence** `rest.logsUrl` → `logUrl` → `url` → env.
- See [`rest.logsUrl`](#restlogsurl).

### `headers`

- **Type** `() => Record<string, string> | Promise<Record<string, string>> | undefined`.
  **Default** none. **When** the function reference is read at init; the function itself is called
  **per batch**.
- **Maps to** `rest.getHeaders`, which wins when both are supplied. It *is* that option: there is no
  second provider and no merging between the two.
- **What it does.** Supplies headers for every upload request, awaited per request so a rotated token
  is picked up. A throwing provider is a **retryable** sync failure.
- **Invalid input.** A non-function is ignored, leaving `rest.getHeaders` `undefined`.
- `@codewithrajat/rm-logvault/http`'s `createAuthHeaderProvider` returns
  `{ getHeaders, refresh }`, and `getHeaders` is exactly the right shape to pass here.

### `level`

- **Type** `LogLevelSetting | undefined`. **Default** the alias contributes nothing; the resolved
  value is `'warn'` when no layer supplies one. **When** at init.
- **Maps to** `logs.level` — the **persist** threshold, not the console one. **Precedence**
  `logs.level` → `level` → the environment (`LOG_PERSIST_LEVEL`, then the legacy
  `TELEMETRY_LOG_LEVEL`) → `'warn'`.
- **Invalid input.** An unrecognised string is ignored and the **environment** is consulted next, not
  the default — the same fall-through `logs.level` has.
- **What it does not do.** It does not change console output. That is
  [`consoleLevel`](#consolelevel) / `logs.consoleLevel`.

### `consoleLevel`

- **Type** `LogLevelSetting | undefined`. **Default** none — leaving all three layers unset leaves
  the logger's own console level (`'warn'`) alone. **When** at init.
- **Maps to** `logs.consoleLevel`. **Precedence** `logs.consoleLevel` → `consoleLevel` → the
  environment (`LOG_LEVEL`).
- **Wins over the environment entirely** once either option supplied a valid level: the env layer is
  skipped for this field rather than merely ranked below, so an explicit `consoleLevel: 'error'`
  cannot be overridden by `LOG_LEVEL`.
- **Invalid input.** An unrecognised string is ignored, and the environment is then consulted.

### `captureConsole`

- **Type** `boolean | undefined`. **Default** `false`. **When** at init.
- **Maps to** `logs.captureConsole`, which wins. There is no environment variable for it.
- **Values.** Only the literals `true` and `false`; anything else is ignored and the nested option
  (then the default) applies. `'false'` is not `false`.
- It wraps `console.warn` and `console.error` **only**, under `logs.enabled`, and the wrapper is
  removed again by `destroyTelemetry()`.

### `maxErrors`

- **Type** `number | undefined`. **Default** `500` (from the nested option). **When** at init.
- **Maps to** `errors.maxRecords`. **Precedence** `errors.maxRecords` → `maxErrors` →
  `ERROR_TRACKING_MAX_RECORDS` → `500`.
- **Invalid input.** `0`, negatives, `NaN`, `Infinity` and non-numbers are ignored; the value is
  floored to an integer. See [`errors.maxRecords`](#errorsmaxrecords) for the retention sweep and
  which limit deletes a row first.

### `maxLogs`

- **Type** `number | undefined`. **Default** `2000`. **When** at init.
- **Maps to** `logs.maxRecords`. **Precedence** `logs.maxRecords` → `maxLogs` →
  `LOG_PERSIST_MAX_RECORDS` → `2000`.
- Same numeric rules as `maxErrors`. See [`logs.maxRecords`](#logsmaxrecords).

### `errorRetentionDays`

- **Type** `number | undefined`. **Default** `7`. **When** at init.
- **Maps to** `errors.retentionDays`. **Precedence** `errors.retentionDays` → `errorRetentionDays` →
  `ERROR_TRACKING_RETENTION_DAYS` → `7`.
- **`0` is meaningful and honoured**: it disables the age cutoff while `maxRecords` still applies.
  Fractional values work — `0.5` is twelve hours. Negatives, `NaN` and non-numbers are ignored.

### `logRetentionDays`

- **Type** `number | undefined`. **Default** `3`. **When** at init.
- **Maps to** `logs.retentionDays`. **Precedence** `logs.retentionDays` → `logRetentionDays` →
  `LOG_PERSIST_RETENTION_DAYS` → `3`.
- Same semantics as `errorRetentionDays`, including `0` disabling the age cutoff.

### The aliases together

```ts
import { initTelemetry } from '@codewithrajat/rm-logvault';

initTelemetry({
  // identity — `app`/`version`/`build` are the flat names for three of the four
  app: 'checkout',
  version: '2.4.1',
  build: 'a1b2c3d',
  environment: 'production',

  // endpoints — `url` for one collector, the split pair for two
  errorUrl: '/telemetry/errors',
  logUrl: '/telemetry/logs',
  headers: async () => ({ Authorization: `Bearer ${await getAccessToken()}` }),

  // levels — persist and console are independent
  level: 'info',
  consoleLevel: 'error',
  captureConsole: false,

  // caps
  maxErrors: 1000,
  maxLogs: 5000,
  errorRetentionDays: 14,
  logRetentionDays: 7,
});
```

Both of these produce the same configuration, and `resolveOptions` proves it:

```ts
resolveOptions({ url: '/telemetry', level: 'info' });
resolveOptions({ rest: { errorsUrl: '/telemetry', logsUrl: '/telemetry' }, logs: { level: 'info' } });
```

---

## 5. Master-switch interaction map

This is the table to consult when an option seems to have no effect, because a second switch is off.

### 5.1 Which stage each switch gates

| Stage                                   | Requires                                                                                            | If unmet                                                                      |
|-----------------------------------------|-----------------------------------------------------------------------------------------------------|-------------------------------------------------------------------------------|
| Error capture at all                    | `enabled !== false` **and** `errors.enabled !== false`                                              | `captureError` returns; nothing buffered, nothing stored                      |
| Error **deduplication**                 | the same `fingerprint` on a row that is still `pending`                                             | a second row for the same bug                                                 |
| Error persistence                       | tracker installed, consent granted, rate limit admits, payload fits                                 | dropped, with one internal report per reason                                  |
| Global handlers (`onerror`, rejections) | `errors.enabled === true` (they are installed only there)                                           | `window.onerror` untouched                                                    |
| Resource / CSP listeners                | `errors.enabled` **and** `captureResources` / `captureCsp`                                          | those events are not observed at all                                          |
| Chunk classification                    | `captureChunkErrors !== false`                                                                      | a chunk failure is reported with the ordinary source                          |
| Log persistence                         | `enabled !== false` **and** `logs.enabled !== false` **and** `meetsLevel(record.level, logs.level)` | the record reaches sinks but not IndexedDB                                    |
| Console capture                         | `logs.enabled` **and** `logs.captureConsole`                                                        | existing `console.*` calls are not ingested (your `logger.*` calls still are) |
| Console output                          | `meetsLevel(level, consoleLevel)`                                                                   | printed nothing, persisted anyway                                             |
| Sanitizer with your redaction options   | `initTelemetry` ran at all                                                                          | the built-in sanitizer stays in force                                         |
| Uploader                                | `mode === 'remote'` **and** `rest.enabled` **and** ≥1 endpoint resolved                             | IndexedDB-only, silently and by design                                        |
| An actual request                       | uploader active **and** `isOnline()` **and** consent granted **and** storage ready                  | the run ends with `stopped: true`, status `idle`/`offline`                    |
| Shortcut                                | `shortcut !== false`                                                                                | no listener is attached                                                       |
| Report export                           | a repository exists (`enabled !== false`) and `isBrowser()`                                         | `{ ok: false, format, bytes: 0 }`                                             |

### 5.2 Options that have no environment variable

`mode`, every `redaction.*` option, `errors.allowedQueryParams`, `errors.captureResources`,
`errors.captureCsp`, `errors.captureChunkErrors`, `errors.beforeCapture`, `logs.captureConsole`,
`logs.beforeStore`, `rest.credentials`, `rest.getHeaders`, `rest.transport`, `rest.requireHttps`,
`rest.onTerminalFailure`, every `shortcut.*` option, `consent`, `onInternalError`, `repository` and
`logSource`. Setting `env: true` cannot change any of them — and because the flat aliases
`captureConsole` and `headers` feed exactly those two fields, they have no environment variable
either. The other twelve aliases feed a field that does have one; see §4a.

---

## 6. `errors` options, in detail

### `errors.enabled`

- **Type** `boolean | undefined`. **Default** `true`. **When** at init.
- **`true`** — the error tracker is installed, the global handlers are attached (this is the **only
  place** `captureResources`, `captureCsp` and `captureChunkErrors` become live), and the uploader
  is given the error repository.
- **`false`** — no error tracker, **no global handler installation at all** (so `window.onerror`
  is never touched, `unhandledrejection` is never listened for, and the resource/CSP listeners are
  never attached), no error repository handed to the uploader, and `captureError` short-circuits.
  The error store is still created inside the shared database layer when a custom repository is
  used, but nothing writes to it from the library.
- **What it does not do.** It does not stop the logger or the shortcut. A report can still be
  downloaded with only logs in it.
- **Values.** Only `true` / `false`; anything else is ignored and `true` applies.

### `errors.maxRecords`

- **Type** `number | undefined`. **Default** `500`. **When** per record, enforced by retention.
- **What it does.** A hard cap on retained error **rows** — aggregated rows, not occurrences. When
  the sweep runs and more than `maxRecords` rows survive the age pass, the oldest surplus is
  deleted, oldest-first by `lastSeen`. The stored integer is floored, so `500.9` means `500`.
- **What it does not do.**
  - It is **not** a hard, immediate ceiling. The sweep runs at initialization and then every
    **25 error writes** (`ERROR_CLEANUP_EVERY_WRITES`), so a burst can temporarily exceed the cap.
    On a quota error the repository additionally halves the cap once and retries the same write, so
    an overflow can also appear mid-flush.
  - It does not remove occurrences. Because a repeated fingerprint merges into one `pending` row
    (`occurrenceCount` increments, `firstSeen`/`lastSeen` widen), one row can represent thousands
    of failures — deleting a row deletes that whole aggregate.
  - It does not cap the *upload* queue: rows already marked `uploading` are skipped by cleanup,
    because mutating a claimed row would break the outbox.
- **Values.** A positive finite number; floored to an integer. There is no documented maximum — the
  only real ceiling is the origin's storage quota.
- **Invalid input.** `0`, negatives, `NaN`, `Infinity`, a numeric string or any non-number are
  ignored, and `500` applies. Zero cannot mean "store nothing", because the surprising outcome of a
  typo would be silently disabling retention.

### `errors.retentionDays`

- **Type** `number | undefined`. **Default** `7`. **When** per record, enforced by retention.
- **What it does.** Deletes error rows whose **`lastSeen`** is older than this many days. This is
  the first pass, before the `maxRecords` overflow pass.
- **What it does not do.** It does not truncate an active aggregate: a bug that fired again
  yesterday keeps the whole row, however old `firstSeen` is. It does not run on a timer, and it
  does not look at `firstSeen` or `timestamp` at all.
- **Values.** A positive number, **not floored** — `0.5` means 12 hours, and the arithmetic is
  `now - retentionDays * 86_400_000`. And `0`, which is the meaningful case:
- **`0` — the age cutoff is disabled entirely.** Nothing is ever deleted for being old; the
  `maxRecords` cap is the only remaining bound. Use it when a device must keep evidence until a
  technician collects it, and always with a deliberate `maxRecords`.
- **Invalid input.** A negative, `NaN`, `Infinity` or a non-number is ignored, and `7` applies.

### `errors.maxPayloadBytes`

- **Type** `number | undefined`. **Default** `16384`. **When** per record, before persistence.
- **What it does.** A UTF-8 byte budget per record, measured on the JSON serialisation. An oversized
  record is reduced through a fixed ladder and re-measured after each tier:

  1. Drop `extra` and tag the record `truncated: 'true'` — **tier 1**.
  2. Trim `causes` to 300 characters, `stack` to 2 000 and `componentStack` to 1 000 — **tier 2**.
  3. Minimal: `stack` to 500, `message` to 300, and `causes`/`componentStack` removed — **tier 3**.
  4. If the minimal tier still does not fit, the record is **dropped** and `payload-limit` is
     reported internally.

- **What it does not do.** It does not raise a warning you can see in the app, and it does not
  truncate to "close enough" — a record that cannot fit at every tier is discarded, on the grounds
  that a meaningless record is worse than no record. It also does not bound the *field* limits the
  sanitizer applies first (`message` 1 000 chars, `stack` 8 000, free text 2 000, `extra` depth 4 /
  30 keys / 20 items); those always run, whatever this is set to.
- **Values.** A positive finite number, floored. `16384` = 16 KiB. Setting it below the tier-3
  floor means records are dropped that a larger budget would have kept.
- **Invalid input.** `0`, negatives and non-numbers are ignored, and `16384` applies.

### `errors.maxEventsPerMinute`

- **Type** `number | undefined`. **Default** `120`. **When** per window — a fixed 60-second window
  (`RATE_LIMIT_WINDOW_MS`).
- **What it does.** Caps how many errors enter the pipeline per window, floored to an integer.
  Excess events are dropped, and when the window rolls a **single** summary line
  (`rate-limit`, `<n> dropped`) is reported rather than one warning per drop.
- **What it does not do.** It does not throttle anything the application does — it only refuses to
  ingest. It does not use a sliding window; the counter resets at the window boundary, so a burst
  straddling a boundary may admit almost twice the limit across two windows.
- **Values.** `0` is meaningful: **the limiter is disabled entirely** and nothing is dropped for
  volume. Any positive finite number is floored.
- **Invalid input.** A negative or non-finite value is ignored, and `120` applies. (Note the
  asymmetry: `0` is honoured here specifically because "no limit" is a documented, meaningful
  request.)
- **Failing open.** If the clock or the limiter itself throws, the limiter admits the event. Losing
  telemetry is treated as worse than a burst.

### `errors.allowedQueryParams`

- **Type** `readonly string[] | undefined`. **Default** see §9. **When** always — the sanitizer is
  built at init from the resolved value.
- **What it does.** Names whose **values** survive URL redaction. Anything not in the list has its
  value replaced with `[REDACTED]`, and an allowed value is itself truncated to 100 characters
  before being kept.
- **What it does not do.** It is not an allow-list of *keys* to keep: the key is always kept, only
  the value is at stake. And it is not a bypass — `isAllowedQueryKey` is
  `allowedQueryParams.has(lower) && !isSensitiveKey(key)`, so allow-listing `session` does not let
  its value through, because `SENSITIVE_KEY_PATTERN` already matches it.
- **Values.** An array of non-empty strings, lowercased for comparison. Setting it here **also**
  sets `redaction.allowedQueryParams`, and vice versa; see §9.
- **Invalid input.** A non-array is treated as `[]` **only for the `errors` group's own field** —
  and that is the trap: `errors.allowedQueryParams: []` means "keep no query values at all", so
  passing something non-array-shaped is not a harmless typo. Entries that are empty strings are
  dropped.

### `errors.preventDefaultUnhandledRejection`

- **Type** `boolean | undefined`. **Default** `false`. **When** always — a property of the
  installed `unhandledrejection` listener.
- **`false` (default)** — the library observes the rejection and changes nothing about the host's
  own handling. The browser still logs it, and the app's own handler still runs.
- **`true`** — `preventDefault()` is called on the event, which suppresses the browser's default
  "Uncaught (in promise)" console report.
- **What it does not do.** It does not swallow the rejection or mark it handled for the
  application's promise chain — `preventDefault()` on the event is all that happens; the promise is
  still rejected. It does not fire rejection handlers you have registered.
- **Values.** Only `true` / `false`; anything else is ignored and `false` applies.
- **The cross-registration edge.** Handler registrations merge, and if **any** live registration
  asked for `true`, `preventDefault()` is called for the shared listener. With two installations on
  one page, one asking for `true` wins. That is the documented consequence of a single merged
  listener, not a bug to work around.
- **Why the default is `false`.** The library must never change host application behaviour. Turning
  this on is a deliberate choice to trade console noise for quiet.

### `errors.captureResources`

- **Type** `boolean | undefined`. **Default** `false`. **When** always — it decides whether a
  capture-phase `error` listener is attached.
- **`true`** — failed `<script>`, `<link>`, `<style>`, `<img>` and other resource loads are
  captured with `source: 'resource'`, `category: 'resource'`, and a `message` of
  `Failed to load <tag>: <url>`. `<script>`, `<link>` and `<style>` are recorded as `error`;
  everything else as `warning`.
- **`false` (default)** — the listener is not attached, so a failed asset load is invisible to the
  library.
- **What it does not do.** It does not capture runtime errors — those come through `window.onerror`
  and are explicitly skipped here (an `ErrorEvent` with a `message` is ignored, which is what stops
  every uncaught error being recorded twice). It does not read the element's contents, only its
  `tagName` and `src`/`href`/`currentSrc`.
- **Values.** Only `true` / `false`; anything else is ignored and `false` applies.
- **Why the default is `false`.** In production, a single blocked analytics pixel can produce a
  steady stream of resource errors. Turn it on deliberately, usually alongside `captureCsp`.

### `errors.captureCsp`

- **Type** `boolean | undefined`. **Default** `false`. **When** always — it decides whether a
  `securitypolicyviolation` listener is attached.
- **`true`** — CSP violations are captured as `source: 'csp'`, `category: 'security'`,
  `severity: 'warning'`, with the effective directive, the source location and — when the blocked
  URI looks like a URL (it contains a `/`) — the blocked URI. A bare token such as `eval` or
  `inline` becomes a `blocked` tag instead.
- **`false` (default)** — violations are not observed.
- **What it does not do.** It does not influence the policy, and it does not make a blocked
  resource load appear — that is `captureResources`. The two are independent listeners.
- **Values.** Only `true` / `false`; anything else is ignored and `false` applies.

### `errors.captureChunkErrors`

- **Type** `boolean | undefined`. **Default** `true` — the only capture flag that defaults on.
  **When** per record, and per event for classification.
- **`true` (default)** — a dynamic-import failure is recognised from its message against
  `CHUNK_ERROR_PATTERN` (`Failed to fetch dynamically imported module`, `Loading chunk N failed`,
  `ChunkLoadError`, `Unable to preload CSS`, `Failed to load module script`, …) and reported as
  `source: 'chunk'`, `category: 'chunk'`, `severity: 'fatal'`. The same classification applies to
  a failed `<script>` load whose URL matches, and Vite's `vite:preloadError` is always dispatched as
  a chunk failure.
- **`false`** — the message is not inspected for chunk shape, so the failure is recorded with
  whatever source the origin implies (`window`, `unhandledrejection`, `resource`) and the ordinary
  `error` severity. Vite's `vite:preloadError` listener is still attached and still reports
  `source: 'chunk'`; this flag governs the *message-based* classification.
- **What it does not do.** It does not retry the import, reload the page or fix a stale deploy. It
  classifies the failure so the report tells you the deploy was stale, which is the point.
- **Values.** Only `true` / `false`; anything else is ignored and `true` applies.

### `errors.beforeCapture`

- **Type** `((record: ErrorRecord) => ErrorRecord | null) | undefined`. **Default** none.
  **When** per record.
- **Signature**

  ```ts
  (record: ErrorRecord) => ErrorRecord | null
  ```

  - **Receives** the fully built record: sanitized, fingerprinted, with `page` and `environment`
    attached.
  - **Returns** the record to store — modified or as-is — or `null` to drop it. Returning
    `undefined` is outside the contract; only `null` is tested for.

- **What it does.** The last chance to inspect, enrich or silence a record before it is measured
  against `maxPayloadBytes` and queued for persistence. The common uses are dropping known noise
  (`if (record.message.includes('ResizeObserver loop')) return null;`) and adding tags.
- **What it does not do.**
  - It does **not** run before redaction or fingerprinting, so the `fingerprint` is already fixed.
    Changing `message` in the hook does not re-group the record, and you cannot un-redact anything.
  - It does **not** affect the console or the `logger` — it is errors only.
  - It is not consulted for a record dropped earlier by `consent`, the rate limiter or
    `errors.enabled`.
- **Sequencing.** `normalizeError` → `buildRecord` (sanitize + fingerprint + page/environment) →
  **`beforeCapture`** → `reduceErrorPayload` → queue → IndexedDB. Returning `null` means the record
  is never stored, never uploaded and not recoverable.
- **A throwing hook is survivable.** The throw is reported through `reportInternalFailure` under
  the stage `beforeCapture`, and **the original record is stored**. The pipeline never loses a
  record to a bad hook.
- **Values.** A function, or omitted. A non-function value is ignored and the hook stays `undefined`
  (the library never calls something you did not supply as a function).

---

## 7. `logs` options, in detail

### `logs.enabled`

- **Type** `boolean | undefined`. **Default** `true`. **When** at init.
- **`false`** — no log tracker, no sink is added to the logger, and the uploader is not given the
  log repository. Nothing is written to the log store by the library.
- **What it does not do.** It does not silence the console — that is `logs.consoleLevel` or
  `logger.setLevel(...)` — and it does not stop `console` capture from being *installed* (the
  install is gated on `logs.enabled && logs.captureConsole`, so with `logs.enabled: false` the
  wrapping is skipped too, but your own `logger.*` calls still print).

### `logs.level`

- **Type** `LogLevelSetting` = `'trace' | 'debug' | 'info' | 'warn' | 'error' | 'off'`.
  **Default** `'warn'`. **When** per call.
- **What it does.** The **persist** threshold: the minimum level written to IndexedDB. A record
  whose level is at or above the threshold is persisted; a lower one is discarded by the tracker.
- **What it does not do.** It **does not control console output** — that is `logs.consoleLevel`, or
  `logger.setLevel(...)` at runtime. Confusing the two is the most common configuration mistake
  here. It also does not filter what reaches other sinks: the logger dispatches to every sink
  *before* the console filter, and the tracker is the sink that applies this level.
- **Values.** Recognised after trimming and lowercasing: `trace`, `debug`, `info`, `warn`, `error`,
  and `off` (also spelled `none` or `silent`, any case). The ladder is
  `trace 10 < debug 20 < info 30 < warn 40 < error 50`; `off` is `Infinity`, so nothing passes.
- **Invalid input.** An unrecognised string (`'verbose'`, `'log'`, `'warning'`, `'OFF '` is fine
  but `'warn '` trims too) is **ignored, keeping the previous value** — and in `resolveOptions` that
  means falling through to the environment chain before the built-in default. A typo can never turn
  on verbose persistence.
- **Resolution order** (the full chain, highest first): `logs.level` option → `LOG_PERSIST_LEVEL` →
  `TELEMETRY_PERSIST_LEVEL` → `TELEMETRY_LOG_LEVEL` → `LOG_LEVEL` → `'warn'`.
- **The `'off'` case.** `level: 'off'` stops log persistence while the logger keeps working and the
  console keeps printing. Use `consoleLevel` for the console half.

### `logs.consoleLevel`

- **Type** `LogLevelSetting | undefined`. **Default** **none** — and that is deliberate.
  **When** at init.
- **What it does.** Applies a console verbosity at initialization by calling `logger.setLevel(...)`
  for you. `'off'` silences the console while persistence keeps working; `'debug'` shows more.
- **What it does not do.** It does not affect what is persisted (that is `logs.level`), and it is
  **only applied when you supply it** — omitting it leaves the console level exactly where it was,
  which is what makes `initTelemetry` safe to call in a library or a test harness. It is also not
  sticky across teardown: `destroyTelemetry()` resets the console level to the factory `'warn'`.
- **Values.** The same recognised set as `logs.level`, including `off`/`none`/`silent`.
- **Invalid input.** An unrecognised string is ignored, and `undefined` is kept — i.e. the logger's
  own level is left alone.
- **Resolution order**: `logs.consoleLevel` option → `LOG_LEVEL` (only through `env`) →
  `undefined`. There is no default.
- **The runtime alternative.** `logger.setLevel('off')` does the same thing at any time. Sinks run
  before the console filter, so `logger.info(...)` is still stored while nothing is printed.

### `logs.maxRecords`

- **Type** `number | undefined`. **Default** `2000`. **When** per persist; enforced by the
  retention sweep, which runs at initialization and then every **200 log writes**
  (`LOG_CLEANUP_EVERY_WRITES`).
- **What it does.** A hard cap on retained log rows, floored to an integer. Oldest surplus first,
  by `timestamp`; the age pass (`retentionDays`) runs before the overflow pass. On a quota error the
  cap is halved once and the same write is retried.
- **What it does not do.** It does not aggregate — every log record is its own row (unlike errors),
  so `2000` really is 2 000 entries. It is not an immediate ceiling, for the same
  sweep-every-200-writes reason.
- **Invalid input.** `0`, negatives, `NaN`, `Infinity` and non-numbers are ignored, and `2000`
  applies.

### `logs.retentionDays`

- **Type** `number | undefined`. **Default** `3`. **When** per persist; enforced by the sweep.
- **What it does.** Deletes log rows whose `timestamp` is older than this many days.
- **Values.** A positive number, not floored (`0.5` = 12 hours). **`0` disables the age cutoff**,
  leaving `maxRecords` as the only bound.
- **Invalid input.** A negative or non-finite value is ignored, and `3` applies.

### `logs.maxPayloadBytes`

- **Type** `number | undefined`. **Default** `4096`. **When** per record, before persistence.
- **What it does.** A UTF-8 byte budget per log record, reduced through its own ladder:
  1. Drop `data` (the captured arguments) — **tier 1**.
  2. Shorten `message` to 300 characters — **tier 2**.
  3. Still too large: the record is **dropped**, and `payload-limit` is reported internally.
- **What it does not do.** It does not merge or split a record, and it does not touch the sanitizer's
  own caps (at most 5 arguments per call, each deep-scrubbed, message 1 000 characters).
- **Values.** A positive finite number, floored. `4096` = 4 KiB.
- **Invalid input.** `0`, negatives and non-numbers are ignored, and `4096` applies.

### `logs.maxLogsPerMinute`

- **Type** `number | undefined`. **Default** `600`. **When** per window (fixed 60 s).
- **What it does.** Caps how many records the log tracker admits per window; excess is dropped, with
  one `rate-limit` summary when the window rolls.
- **What it does not do.** It does not stop the console from printing those records — the console
  writer runs after the sink dispatch and is not flow-controlled by this limiter. It is also not a
  guarantee of ordering: a dropped record is simply gone.
- **Values.** A positive finite number, floored. **`0` disables limiting entirely.**
- **Invalid input.** A negative or non-finite value is ignored, and `600` applies.

### `logs.writeFlushMs`

- **Type** `number | undefined`. **Default** `1000`. **When** per call — a timer is armed on the
  first buffered record.
- **What it does.** The **upper bound** on how long a buffered log may sit in memory before it is
  written to IndexedDB.
- **What it does not do.** It is **not a poll interval** and not a guarantee of a write at that
  moment: a write happens as soon as **either** this elapses **or** `writeBatchSize` entries
  accumulate, whichever comes first, and an unload path flushes earlier still (`pagehide` and
  `visibilitychange → hidden` both flush what is buffered). It also does not survive a hard crash —
  a buffer lost to a killed tab is lost.
- **Values.** A positive finite number of milliseconds, floored to an integer.
- **Invalid input.** `0`, negatives and non-numbers are ignored, and `1000` applies.
- **Tuning.** Lower it if a hard crash loses too much of a burst; raise it to spend fewer IndexedDB
  transactions on a chatty page.

### `logs.writeBatchSize`

- **Type** `number | undefined`. **Default** `50` (`LOG_FLUSH_BATCH_SIZE`, shared with the tracker
  so the two cannot drift). **When** per call.
- **What it does.** The trigger **and** the batch size: reaching this many buffered entries starts a
  write immediately, and one IndexedDB transaction carries up to this many records.
- **What it does not do.** It does not bound memory independently of `writeFlushMs` — the effective
  in-memory ceiling is roughly "this many entries, or `writeFlushMs` of traffic, whichever is
  smaller". It does not affect upload batching (`rest.batchSize` does that).
- **Values.** A positive finite number, floored. Raising it writes more per transaction at the cost
  of holding more records in memory during a burst.
- **Invalid input.** `0`, negatives and non-numbers are ignored, and `50` applies.

### `logs.captureConsole`

- **Type** `boolean | undefined`. **Default** `false`. **When** at init.
- **`true`** — `console.warn` and `console.error` are wrapped, so **existing** call sites in the
  application are ingested into the log pipeline without changing them.
- **`false` (default)** — no wrapping. Your explicit `logger.*` calls are still captured; only
  pre-existing `console.*` calls are missed.
- **What it does not do.**
  - It does **not** wrap `console.log`, `console.info`, `console.debug` or
    `console.trace` — only `warn` and `error`.
  - It does **not** change what the console prints: the original method runs **first**, with the
    original `this`, so DevTools formatting and application behaviour are unchanged.
  - It does not recurse: a message emitted while the library is already ingesting one is dropped by
    a re-entrancy guard. And restore-on-teardown only puts the originals back **if the property is
    still our wrapper** — if application code replaced it afterwards, theirs is left in place.
- **Values.** Only `true` / `false`; anything else is ignored and `false` applies.
- **Interaction.** Gated on `logs.enabled` too: `logs: { enabled: false, captureConsole: true }`
  installs nothing. A captured call enters the pipeline **at the sink**, not through the logger's
  `emit`, so two details follow: `logger.setLevel('off')` cannot suppress it (that setting only
  touches console output), and `logs.level` still filters it — a captured `console.warn` that does
  not pass `level: 'error'` is printed and then discarded rather than persisted.

### `logs.beforeStore`

- **Type** `((record: LogRecord) => LogRecord | null) | undefined`. **Default** none.
  **When** per record.
- **Signature** `(record: LogRecord) => LogRecord | null`.
- **What it does.** The log-side equivalent of `beforeCapture`: inspect, modify or drop a log record
  before it is measured against `maxPayloadBytes` and buffered.
- **What it does not do.** It does not run for records already rejected by `logs.enabled`,
  `meetsLevel(record.level, logs.level)`, the consent gate or the rate limiter — those checks come
  first. It does not affect the console output of the same call.
- **A throwing hook.** Reported via `reportInternalFailure` under the stage `beforeStore`, and the
  **original record is stored**. Returning `null` drops the record silently and permanently.

---

## 8. Redaction options, in detail

These are extensions to the built-in rules, not replacements. Every one of them is applied by the
single sanitizer `initTelemetry` installs, so they cover record building, the logger, URL
classification and a second-pass export — not just the paths that happen to receive the options
object. All three are read **at init** (via the sanitizer) and take effect **always** afterwards.

### `redaction.extraSensitiveKeys`

- **Type** `readonly (string | RegExp)[] | undefined`. **Default** `[]`.
- **What it does.** Marks more key names as sensitive, so the *value* becomes `[REDACTED]` wherever
  the sanitizer walks an object — a sensitive key wins over whatever the value is, including
  before the walker descends.
  - A **string** matches the separator-stripped, lowercased key **exactly**: `'x-tenant-id'`,
    `'X Tenant ID'` and `'xtenantid'` are the same key.
  - A **`RegExp`** is tested against both the raw key and its normalised form.
- **What it does not do.** It does not redact matching *text* inside a message — a string only ever
  matches a key name, never a substring of a value. Use `extraPatterns` for free text. It also does
  not widen the built-in pattern, which already covers `authorization`, `cookie`, `token`,
  `password`, `passwd`, `pwd`, `secret`, `apikey`, `accesskey`, `privatekey`, `credential`,
  `session`, `signature`, `bearer`, `otp`, `^auth$`, `email` and `phone` against the normalised key.
- **Values.** An array of strings and/or `RegExp`s. Entries of any other type are silently
  discarded.
- **Invalid input.** A non-array is treated as `[]`. A `RegExp` that throws when tested is treated
  as a match — the sanitizer **fails closed**, so an exotic pattern redacts rather than leaks.
- **Why the split matters.** Key-name matching is for structured data you control the shape of
  (`extra: { customerId: … }`); `extraPatterns` is for the same identifier appearing in prose. The
  two are complementary, and a GDPR-strict configuration usually sets both.

### `redaction.extraPatterns`

- **Type** `readonly RegExp[] | undefined`. **Default** `[]`.
- **What it does.** Extra free-text patterns, applied **after** the built-in rules so they win.
  Every match is replaced with the literal `[REDACTED]`.
- **What it does not do.**
  - It does not support capture-group substitutions: the replacement is a fixed string, not `$1`.
  - It does not run before the built-in rules, so a value the built-ins already redacted is gone —
    which is the intended precedence (yours wins where they overlap, because they already replaced).
  - It cannot find a bare short secret in prose. `sanitizeText('failed with hunter2')` keeps
    `hunter2`: a seven-character word is indistinguishable from ordinary prose. A known value has to
    be added as a pattern (or the record dropped in `beforeCapture`).
- **Values.** An array of `RegExp` instances only; anything else is discarded. `g` and `y` flags are
  handled — `lastIndex` is reset before and after each use, so a `/g` pattern behaves consistently
  across records.
- **Invalid input.** A non-array is treated as `[]`.
- **What the built-ins already cover**, before yours run: embedded URLs (with credentials, `data:`
  and non-`http(s)` schemes neutralised), JWTs (`eyJ…`), `Bearer`/`Basic`/`Token` schemes,
  `key=value` secrets (`token`, `access_token`, `refresh_token`, `id_token`, `password`, `pwd`,
  `secret`, `client_secret`, `api_key`, `api-key`, `apikey`, `session`, `sessionid`, `phone`,
  `mobile`, `msisdn`, `telephone`, `email`), long opaque tokens with no `key=value` context
  (a 32–200 character `[\w-]` run), and e-mail addresses. A URL path segment that decodes to an
  e-mail, starts with `eyJ`, or matches `/^[\w-]{32,}$/` is replaced wholesale.
- **A real example.**

  ```ts
  initTelemetry({
    appName: 'checkout',
    redaction: {
      extraSensitiveKeys: ['x-tenant-id', /^internal/i],
      extraPatterns: [/\bsk_live_[A-Za-z0-9]{16,}\b/g, /\b\d{16}\b/g],
    },
  });
  ```

### `redaction.allowedQueryParams`

- **Type** `readonly string[] | undefined`. **Default** the built-in list (see §9).
- **What it does.** The same concept as `errors.allowedQueryParams`, on the redaction side. Setting
  it here sets the effective list for **both**, and each falls back to the other.
- **What it does not do.** It does not append to the default list — it **replaces** it. If you want
  the defaults plus your own, repeat them:

  ```ts
  import { DEFAULT_ALLOWED_QUERY_PARAMS } from '@codewithrajat/rm-logvault';

  initTelemetry({
    redaction: { allowedQueryParams: [...DEFAULT_ALLOWED_QUERY_PARAMS, 'locale', 'currency'] },
  });
  ```

- **Values.** An array of non-empty strings. **`[]` is not the same as leaving it unset**: `[]`
  means "keep no query values at all", so *every* query value becomes `[REDACTED]`.
- **Invalid input.** A non-array becomes `[]` here too — which, again, is the meaningful value, so
  check the shape if a URL redaction change surprises you.

---

## 9. `allowedQueryParams` — one knob in two places

Setting it in either `errors` or `redaction` sets the effective list for **both**; each falls back
to the other. The resolution, exactly:

```text
resolved.errors.allowedQueryParams =
    errors.allowedQueryParams                if defined
  ? redaction.allowedQueryParams             if defined → that value
  : []

resolved.redaction.allowedQueryParams =
    redaction.allowedQueryParams             if defined
  ? errors.allowedQueryParams                if defined → that value
  : undefined
```

If you set neither, `createSanitizer` receives `undefined` and falls back to
`DEFAULT_ALLOWED_QUERY_PARAMS`:

```text
limit, offset, page, pageSize, size, sort, order, scope, lng, lang, type
```

Those keys keep their **values** in a redacted URL; every other value becomes `[REDACTED]`. An
allowed value is itself truncated to 100 characters. And an allow-listed key that also matches the
sensitive-key pattern does **not** keep its value — `isAllowedQueryKey` requires both
"in the list" and "not sensitive".

An empty array is **not** the same as leaving it unset: `[]` means "keep no query values at all".

---

## 10. `rest` options, in detail

Uploads are always a **second** step: records are written to IndexedDB first, so an unreachable
endpoint costs nothing and a `mode: 'local'` installation never egresses at all.

### `rest.enabled`

- **Type** `boolean | undefined`. **Default** **derived**: `true` when a `transport`, `errorsUrl` or
  `logsUrl` is supplied, otherwise `false`. **When** at init.
- **`true`** — the uploader is eligible. It still needs `mode === 'remote'` and at least one
  endpoint that survived `resolveEndpoint` validation before it does anything.
- **`false`** — uploads are off whatever else is configured. This is how you keep URLs in the build
  (so a deployment can turn them on with one flag) while the outbox stays shut, and it is what makes
  the resolved `mode` report `'local'` honestly.
- **What it does not do.** It does not stop records being written locally — nothing does that except
  `errors.enabled` / `logs.enabled`. It also does not stop a custom `transport` from being
  *constructed*; it stops it from ever being called, because the sync manager is disabled wholesale.
- **Values.** Only `true` / `false`; a non-boolean is ignored, and the derivation applies.
- **The two-stage check.** From `syncManager.ts`:

  ```ts
  const enabled =
    config.mode === 'remote' &&
    rest.enabled &&
    (endpoints.errorsUrl !== undefined || endpoints.logsUrl !== undefined);
  ```

  Note that a **custom `transport` alone does not satisfy the second clause**: endpoints are still
  resolved from `errorsUrl`/`logsUrl`. Supply a transport *and* the URL(s) it should be called for.

### `rest.errorsUrl`

- **Type** `string | undefined`. **Default** none. **When** at init, validated once.
- **What it does.** The endpoint error batches are POSTed to. Absolute (`https://…`) or relative to
  the current origin (`/telemetry/errors`, which resolves against `location.href`'s origin).
- **What it does not do.** It does not enable error *capture*, and it does not bypass `requireHttps`
  or the scheme deny-list.
- **Validation, exactly.** `resolveEndpoint` trims the value, rejects anything matching
  `javascript:`, `data:`, `vbscript:`, `file:`, `blob:`, `about:`, `chrome:`,
  `chrome-extension:` and rejects any protocol that is not `http:`/`https:`. A relative URL outside a
  browser has no origin and is therefore unusable. An unusable value resolves to `undefined`, the
  library falls back to IndexedDB-only operation for that kind, and **nothing throws**.
- **Values.** Any non-empty, non-forbidden, `http(s)` absolute or origin-relative URL. `''` and
  `'  '` are ignored.
- **A rejected endpoint is quiet.** With `requireHttps: true` and
  `http://telemetry.internal/errors`, `resolveEndpoint` returns `undefined`, `isEnabled()` is
  `false` and the library runs local-only. If you want a loud build-time failure, assert it:

  ```ts
  import { expect, test } from 'vitest';
  import { resolveOptions, isSyncConfigured } from '@codewithrajat/rm-logvault';

  test('the endpoint is usable', () => {
    expect(isSyncConfigured(resolveOptions({ rest: { errorsUrl: '/telemetry/errors' } }))).toBe(true);
  });
  ```

### `rest.logsUrl`

- Same type, default, validation and caveats as `errorsUrl`, for log batches. The two endpoints are
  independent: one may be configured and the other not, and a run stops per kind — an endpoint that
  has nothing pending does not block the other kind.

### `rest.intervalMs`

- **Type** `number | undefined`. **Default** `30000`. **When** per flush, to schedule the next run.
- **What it does.** The delay after a **successful** flush before the next scheduled attempt.
- **What it does not do.** It is **not a minimum gap** between requests and not the only trigger.
  While failing, it is not used at all: the delay becomes
  `min(15000 * 2^(failures-1), 900000)` ms, raised to `max(that, Retry-After)` when the server sent
  one. A flush is also pulled forward when new records arrive (debounced by 5 s, and never while a
  run is in flight or while backing off), 5 s after the outbox comes back online, and immediately
  on a manual `syncTelemetry()` or `retryFailedTelemetry()`. The first automatic run is 5 s after
  storage becomes ready.
- **Values.** A positive finite number of milliseconds, floored to an integer. The practical range
  is a second (real-time observation in staging) to several minutes (a quiet production page).
  Raising it does not reduce the number of records sent, only how promptly.
- **Invalid input.** `0`, negatives and non-numbers are ignored, and `30000` applies.
- **The related fixed limits**, none of which is configurable: one request may take up to
  `REQUEST_TIMEOUT_MS` = 10 000 ms, one run performs at most `MAX_BATCHES_PER_FLUSH` = 10 batches per
  kind, an abandoned claim is requeued after `CLAIM_LEASE_MS` = 300 000 ms, and the backoff ceiling
  is `BACKOFF_MAX_MS` = 900 000 ms.

### `rest.batchSize`

- **Type** `number | undefined`. **Default** `50`. **When** per batch.
- **What it does.** Records per request: `claimPending(rest.batchSize, …)`. One flush run issues up
  to 10 batches per kind back-to-back while records remain eligible, so the run's ceiling is 500
  records per kind per run at the default.
- **What it does not do.** It does not affect how many records are *retained*, and it does not split
  a record — a single aggregated error row with `occurrenceCount: 40 000` is one record.
- **Values.** A positive finite number, floored. A large value keeps request counts down but risks a
  body that a server, proxy or CDN rejects; combined with `errors.maxPayloadBytes` this is the real
  body-size control.
- **Invalid input.** `0`, negatives and non-numbers are ignored, and `50` applies.
- **The unload path.** A `keepalive` request is only attempted when the serialised body is under
  `KEEPALIVE_MAX_BYTES` = 60 000 bytes; a larger one is sent without `keepalive` at the last reliable
  write moment.

### `rest.credentials`

- **Type** `RequestCredentials` = `'omit' | 'same-origin' | 'include'`. **Default**
  `'same-origin'`. **When** per batch, passed straight to `fetch`.
- **`'omit'`** — never send cookies or client certificates. The right choice for a cross-origin
  telemetry collector you do not want to authenticate with user cookies.
- **`'same-origin'` (default)** — send credentials only to same-origin endpoints.
- **`'include'`** — always send credentials, including cross-origin.
- **What it does not do.** It does not read, log or store cookie *values* — the library never reads
  `document.cookie` or any request/response body. This value is handed to the platform's `fetch`; it
  never passes through the library's own inspection.
- **Values.** Exactly those three strings. Anything else — including `'same-origin '` with a space,
  or `undefined` — falls back to `'same-origin'`. Note the default is never implicitly `'include'`.

### `rest.getHeaders`

- **Type** `(() => Record<string, string> | Promise<Record<string, string>>) | undefined`.
  **Default** none. **When** per batch, before each request.
- **Signature** `() => Record<string, string> | Promise<Record<string, string>>`
  - **Receives** nothing.
  - **Returns** a plain object of header names to values, or a promise of one. A non-object return
    is ignored, leaving no extra headers.
- **What it does.** Supplies per-request headers — most importantly a fresh bearer token — so a
  long-lived page does not upload with an expired one. It is awaited per request, which is what
  makes refreshing the token safe:

  ```ts
  initTelemetry({
    appName: 'checkout',
    rest: {
      errorsUrl: '/telemetry/errors',
      getHeaders: async () => ({ Authorization: `Bearer ${await getAccessToken()}` }),
    },
  });
  ```

- **What it does not do.** It does not let you read the request: headers, body and records are never
  handed back to you. It also does not let you remove `Content-Type` — the transport spreads the
  content type first and your headers after, so returning your own `Content-Type` **wins**. Do not
  do that.
- **A throwing provider is a retryable failure.** The batch is put back to `pending`, the run stops,
  and the stage `headers` is reported internally. It is **not** terminal: nothing is marked
  `failed`, and the next scheduled attempt retries. That is deliberate — a token refresh that fails
  once should not discard the batch.

### `rest.transport`

- **Type** `RemoteTransport | undefined`. **Default** the built-in `fetch` transport
  (`createFetchTransport()`). **When** per batch.
- **Signature**

  ```ts
  {
    name?: string;                                  // for status/diagnostics only
    send(request: TransportRequest): Promise<TransportResponse>;
  }
  ```

  - **Receives** a `TransportRequest`: `url` (absolute, already validated), `headers` (already
    merged with `getHeaders()`), `credentials`, `body` (the fully serialised JSON envelope, already
    sanitized), `timeoutMs` (10 000), `keepalive` (boolean) and `kind` (`'errors' | 'logs'`).
  - **Returns** `{ status: number; retryAfterMs?: number }`. `status` `0` means "never reached the
    server". Throwing means a **retryable** network failure.

- **What it does.** Replaces the network seam — the only place the library egresses. This is how you
  reach an internal bus, OTLP, a Sentry envelope or `sendBeacon` without those becoming
  dependencies, and the only network code in the package that is not the default `fetch` transport.
- **What it does not do.** It never sees raw records — only a serialized body that has already
  passed the sanitizer, which keeps a custom transport from accidentally persisting unsanitized
  data. It also does not change the retry policy: `classifyResponse(status)` still decides
  ok/terminal/retryable, and throwing is still retryable.
- **Values.** An object with a `send` function. Supplying one also derives `rest.enabled: true` and
  therefore `mode: 'remote'` — but see `rest.enabled` above: you still need a configured
  `errorsUrl`/`logsUrl` for the uploader to be active.
- **Status semantics you must honour.** `2xx` → records are deleted from the outbox. A status in
  `TERMINAL_STATUSES` (`400, 401, 403, 404, 405, 410, 413, 415, 422`) → records are marked `failed`
  permanently and `onTerminalFailure` fires. Anything else → records go back to `pending` and the
  run backs off.

### `rest.requireHttps`

- **Type** `boolean | undefined`. **Default** `false`. **When** at init, during endpoint validation.
- **`true`** — a plain `http:` endpoint is rejected, **except** on `localhost`, `127.0.0.1`, `::1`,
  `[::1]` and `0.0.0.0`. Rejection means the endpoint resolves to `undefined`, so that kind stays
  local.
- **`false` (default)** — plain `http:` is accepted anywhere, which is what makes a local collector
  work with no extra configuration.
- **What it does not do.** It does not upgrade, redirect or warn — there is no cleartext request to
  intercept, because the endpoint never becomes a URL. It does not affect `errorsUrl` validation for
  the *scheme* deny-list, which applies either way.
- **Values.** Only `true` / `false`; anything else is ignored and `false` applies.
- **Why you would set it.** `requireHttps: true` in production turns a misconfigured
  `http://telemetry.…` endpoint into a loud, testable failure (`isSyncConfigured` is `false`) instead
  of silently uploading error reports over cleartext.

### `rest.onTerminalFailure`

- **Type** `((status: number, records: readonly { id: string }[]) => void) | undefined`.
  **Default** none. **When** per batch, only for a terminally failed batch.
- **Signature** `(status: number, records: readonly { id: string }[]) => void`
  - **Receives** the HTTP status and the records in that batch — **only their `id`s**, so no record
    content is exposed to the hook.
  - **Returns** nothing. It is fire-and-forget and cannot influence the outcome.
- **What it does.** Makes terminal failure visible and actionable. This is the hook that turns a
  `401` from silent data loss into a re-auth trigger:

  ```ts
  initTelemetry({
    appName: 'checkout',
    rest: {
      errorsUrl: '/telemetry/errors',
      onTerminalFailure: (status) => {
        if (status === 401) void refreshSession();
      },
    },
  });
  ```

- **What it does not do.** It does not retry, requeue or re-send anything — the records are already
  marked `failed`, and they stay that way until you call `retryFailedTelemetry()`, which moves them
  back to `pending` and clears the backoff. Without that call (or a page reload after re-auth, which
  is not the same thing), a terminal batch is effectively discarded.
- **Values.** A function, or omitted. A non-function is ignored and the hook stays `undefined`.
- **When it fires, exactly.** Once per batch that produced a terminal status, after the records were
  marked `failed` in storage, with the status and ids collected. It does not fire on a transport
  throw, on a retryable status, or when the batch was empty.

---

## 11. `shortcut` options, in detail

The shortcut exists so a support engineer can say "press Ctrl+Shift+Alt+D and send me the file"
without shipping a debug menu or a customer-specific build. It is **obscurity, not access control**:
the report contains only data already stored and already sanitized on that machine, and anyone who
knows the shortcut can produce one. Gate it with `allow()` if that is unacceptable.

### `shortcut` itself (the tri-state)

- **Type** `false | ShortcutOptions | undefined`. **Default** **installed** with the defaults below.
- **`undefined`** and **`{}`** both install the shortcut with defaults. Only the literal `false`
  disables it — `shortcut: { enabled: false }` is not a thing, and there is no `enabled` member:

  ```ts
  initTelemetry({ appName: 'test', shortcut: false }); // the ONLY way to disable it
  ```

- **What it does not do.** A disabled shortcut does not disable `exportDiagnosticsReport()` — you
  can always export programmatically. And the listener is only attached when a DOM target exists, so
  in SSR or a worker the shortcut silently does nothing (`installShortcut` returns a no-op cleanup).

### `shortcut.key`

- **Type** `string | undefined`. **Default** `'d'`. **When** always — matched per keypress.
- **What it does.** The physical key to require. A single letter maps to `Key<X>`
  (`'d'` → `'KeyD'`) and a single digit to `Digit<N>` (`'7'` → `'Digit7'`), matched against
  `KeyboardEvent.code` first and `event.key` second.
- **What it does not do.** It does not support `'F5'`, `'Enter'`, `'ArrowUp'`, a modifier-only key
  or a chord. `expectedCode` returns `undefined` for anything that is not a single letter or digit,
  and matching then falls back to `event.key.toLowerCase() === key.toLowerCase()` — which does
  still work for `'Enter'`-style values when the engine populates `key`, but is not a documented
  contract and is unreliable under Alt/AltGr. Stick to a letter or digit.
- **Values.** A single `[a-z]` (any case) or `[0-9]`, trimmed. The value is trimmed before use, so
  `' d '` is `'d'`.
- **Invalid input.** An empty or whitespace-only string falls back to `'d'`, as does a non-string.
- **Why `code` first.** `Alt`+letter mangles `event.key` on AZERTY, Dvorak, AltGr and macOS Option
  layouts, so the physical key is the reliable one.

### `shortcut.ctrl`, `shortcut.shift`, `shortcut.alt`, `shortcut.meta`

- **Type** `boolean | undefined` each. **Defaults** `true`, `true`, `true`, `false`. **When**
  always — compared on every keydown.
- **What they do.** Each one is compared for **exact equality** against the event's modifier flag.
  Ctrl+Shift+Alt+D (Meta: `false`) is the default combination.
- **What they do not do.** There is no "any of these" or "at most these" mode. Matching is exact in
  both directions: setting `ctrl: false` means Ctrl must **not** be held, and pressing
  Ctrl+Shift+Alt+D with an extra Meta held does **not** fire — which is what prevents accidental
  triggers on OS-level shortcuts. If you want Ctrl+K and nothing else, that is
  `{ key: 'k', ctrl: true, shift: false, alt: false, meta: false }`.
- **Values.** Only `true` / `false`; a non-boolean is ignored and the default applies (note the
  defaults differ per modifier).

### `shortcut.target`

- **Type** `EventTarget | undefined`. **Default** `undefined` → `document`, then the global event
  target (`window`, or `self` in a worker). **When** at init.
- **What it does.** The target the **capture-phase** `keydown` listener is attached to. Capture
  phase is deliberate: a `stopPropagation()` anywhere in the page application cannot swallow the
  shortcut.
- **What it does not do.** It does not widen matching. It does not make the listener survive a
  target that refuses `addEventListener` — a throw there returns a no-op cleanup rather than
  breaking initialization.
- **Values.** Any object implementing `EventTarget`. `document` is the practical choice; a specific
  element narrows the shortcut to keypresses whose event path passes through it.
- **Invalid input.** `null`, a non-object, or a target without `addEventListener` yields a no-op
  install (no listener, no error).

### `shortcut.allow`

- **Type** `(() => boolean) | undefined`. **Default** none — the shortcut is ungated. **When** per
  matching keypress, before the export starts.
- **Signature** `() => boolean` — takes no arguments and must return **literal `true`**.
- **What it does.** A gate. It is evaluated **only after** the key and all four modifiers matched
  and the editable-target check passed, so it does not run on every keydown.
- **What it does not do.** A truthy-but-not-`true` return value (`1`, `'yes'`, an object) does
  **not** open the gate: the check is `allow() !== true`. It also does not prevent the report being
  produced by `exportDiagnosticsReport()` directly — gate that yourself if you care.
- **A throwing gate suppresses the trigger.** The throw is swallowed and the shortcut does not fire.
  This is a "fail closed" gate: if you cannot prove the user is allowed, they are not.
- **The typical use** is an internal-users flag:

  ```ts
  shortcut: {
    allow: () => window.sessionStorage.getItem('@codewithrajat/rm-logvault-debug') === '1',
  }
  ```

  ```ts
  shortcut: { allow: () => window.__IS_INTERNAL__ === true }
  ```

- **Values.** A function, or omitted. A non-function is ignored and the shortcut stays ungated.

### `shortcut.filenamePrefix`

- **Type** `string | undefined`. **Default** `'diagnostics-report'`. **When** per export.
- **What it does.** The prefix of the downloaded filename, via
  `diagnosticsFilename(prefix, extension)`: `` `${prefix}-${ISO-stamp-with-:-and-.-replaced-by--}.${extension}` ``,
  for example `admin-report-2026-02-14T09-31-07-123Z.html`. The extension follows the format
  (`.html` or `.json`).
- **What it does not do.** It does not set a directory, a MIME type or the file's contents, and it
  does not sanitize the prefix. Colons and dots in the *timestamp* are replaced because they are
  illegal in Windows filenames; your prefix is used as given, so keep it to filename-safe characters.
- **Precedence.** For an explicit export call, `DiagnosticsExportOptions.filenamePrefix` wins; then
  the shortcut's `filenamePrefix`; then `'diagnostics-report'`.
- **Values.** Any non-empty string after trimming.
- **Invalid input.** `''` or `'  '` falls back to `'diagnostics-report'`.

### `shortcut.onExported`

- **Type** `((ok: boolean) => void) | undefined`. **Default** none. **When** per export.
- **Signature** `(ok: boolean) => void` — `ok` is `true` when a download was initiated or the
  clipboard write succeeded, `false` otherwise. It takes no other arguments and its return value is
  ignored.
- **What it does.** Makes an otherwise invisible failure visible. Without it a blocked download
  looks identical to a successful one, because the export resolves to a value a keystroke handler
  throws away.
- **What it does not do.** It does not tell you *why* it failed — the reason is reported internally
  (`diagnostics-download`, `diagnostics-clipboard`) and is observable through `onInternalError` or
  the console writer. It also does not fire for a rejected concurrent call: the export resolves with
  `ok: false` immediately while another export is in flight, without invoking the hook.
- **Values.** A function, or omitted. A throwing hook is swallowed, so a broken reporter cannot
  break the export.

### Shortcut behaviour worth knowing

- Events targeting an `<input>`, `<textarea>`, `<select>` or a `contenteditable` host are ignored, so
  typing "d" into a form cannot trigger a download, and `preventDefault()` is called **only** on a
  real match.
- `installShortcut`'s cleanup is safe to call twice, and it only removes our own listener.
- The export itself never throws; it resolves with `ok: false` on failure. It flushes buffered
  records first, reads **all** rows regardless of upload status, and marshals them in 500-record
  slices so a 50 000-row vault does not freeze the tab.

---

## 12. Hooks and integration, in detail

### `consent`

- **Type** `(() => boolean) | undefined`. **Default** none — no gate, everything is processed.
  **When** per record, per persist and per batch.
- **Signature** `() => boolean` — no arguments, and the check is `consent() === true`, so a
  truthy-but-not-`true` value does not pass.
- **What it does.** A single gate consulted at **three** points rather than sampled once at init:
  - `errorTracker.ingest` — before a record is built and stored;
  - `logTracker.sink.write` — before a record is buffered; and
  - `syncManager.runFlush` — before **any** upload, so withdrawing consent stops the already-queued
    outbox from draining, not just future captures.
- **What it does not do.**
  - It does not erase anything. Records already stored stay stored until `clearTelemetryData()`.
    Pair a revocation with that call.
  - It does not gate the *console*: a record refused by consent is still printed by the logger if
    the console level admits it.
  - It does not gate pre-init buffering. `captureError` before init pushes into the bounded 50-entry
    pre-init buffer without consulting consent; the gate is applied when that buffer is replayed
    through the tracker at init.
  - It does not gate the export. `exportDiagnosticsReport()` reads whatever is stored, so gate the
    shortcut with `shortcut.allow` as well if a declined user must not be able to produce a file.
- **A throwing gate fails closed**: no capture, no storage, no upload. A gate that cannot prove
  consent is treated as no consent.
- **Values.** A function, or omitted. A non-function is ignored, leaving no gate.
- **Example.**

  ```ts
  initTelemetry({
    consent: () => window.__ANALYTICS_CONSENT__ === true,
    shortcut: { allow: () => window.__ANALYTICS_CONSENT__ === true },
  });
  ```

### `onInternalError`

- **Type** `((stage: string, error: unknown) => void) | undefined`. **Default** none.
  **When** always — whenever the library itself fails.
- **Signature** `(stage: string, error: unknown) => void`
  - **Receives** a short stage label and the thrown value. `error` is `unknown` by design: an
    internal failure can be any value, including `null` or a string.
  - **Returns** nothing. You cannot influence recovery from here.
- **What it does.** Surfaces the library's own failures — a storage open that timed out, a write
  that hit the quota, a `beforeCapture` hook that threw, a consent gate that threw — without them
  ever reaching the application as thrown errors.
- **What it does not do.**
  - It is not a per-event log. **Each stage is reported once per initialization**
    (`reportInternalFailure` / `reportInternalNote` are once-per-stage), which is what keeps a broken
    storage layer from producing one warning per captured error. A second occurrence of the same
    stage in the same session is swallowed.
  - It does not receive the record or the stage's arguments, only the label and the error.
  - It does not replace the console: the same failure is also written through the reserved
    `[Telemetry]` prefix, which is never persisted.
- **Stage labels you may see** (the first token of the string, e.g. `storage (quota)`):
  `init`, `capture`, `capture-api`, `capture-fetch`, `capture-suppression`, `set-tracker`,
  `storage-init`, `storage (<reason>)`, `error-persist`, `persist`, `payload-limit`, `beforeCapture`,
  `beforeStore`, `log-tracker`, `log-source`, `rate-limit`, `claim`, `requeue`, `requeue-stale`,
  `headers`, `flush`, `sync`, `retry-failed`, `retry-failed-read (<kind>)`,
  `retry-failed-write (<kind>)`, `delete-after-upload`, `mark-failed`, `clear`, `destroy`,
  `diagnostics-flush`, `diagnostics-read-errors`, `diagnostics-read-logs`, `diagnostics-download`,
  `diagnostics-clipboard`, `diagnostics-export`, and the note stage
  `mode-remote-without-endpoint`.
- **Values.** A function, or omitted. A non-function is ignored. A throwing callback is swallowed.

### `repository`

- **Type** `TelemetryRepository | undefined`. **Default** `undefined`, which builds the IndexedDB
  pair from `dbPrefix`. **When** at init.
- **Signature** `{ errors: ErrorRepository; logs: LogRepository; initialize(): Promise<StorageResult<void>>; close(): void }`.
  `initialize` returning `{ ok: false }` makes the storage state `'unavailable'`.
- **What it does.** Swaps the backend. `@codewithrajat/rm-logvault/testing` ships
  `createMemoryRepository()` for exactly this.
- **What it does not do.**
  - It does not make `dbPrefix`, `openTimeoutMs`, `errors.maxRecords`, `errors.retentionDays`,
    `logs.maxRecords` or `logs.retentionDays` apply to your store. Those are passed to the
    *library's own* repositories; a custom repository owns its own retention and caps. The options
    are still read, but only your implementation can honour them.
  - It does not change the record shapes or bypass the sanitizer: the tracker still sanitizes and
    reduces before calling `save`/`saveBatch`.
  - It does not keep the IndexedDB databases open — they are never created when you supply one.
- **Values.** An object implementing the `TelemetryRepository` contract. `initialize()` is called
  once, at init; `close()` once, on teardown.
- **When errors or logs are disabled**, the corresponding repository member is still present but the
  library hands `null` to the uploader for that kind, so nothing is queued from it.

### `logSource`

- **Type** `ExternalLogSource | undefined` — `{ addSink(sink: LogSink): () => void }`.
  **Default** none. **When** at init.
- **What it does.** Attaches to an application logger you already have, forwarding its records into
  the same log pipeline. The sink is the same one used for the built-in `logger`, so a record from
  your logger gets the same level check, consent gate, rate limit, `beforeStore`, payload reduction,
  batching and upload.
- **What it does not do.** It does not replace or wrap your logger — it is purely additive. It does
  not intercept `console` (that is `captureConsole`), and it does not apply your logger's own
  filtering: records you pass in are subject to `logs.level` like any other.
- **Teardown.** The `addSink` return value is used as the detach function and is called on
  `destroyTelemetry()`, so the sink stops receiving records. A returned value that is not a function
  is ignored.
- **A throwing `addSink`** is reported (`log-source`) and init continues; the rest of telemetry is
  unaffected.
- **Values.** An object with an `addSink(sink)` method returning a detach function.

### `setupTelemetry` — the flat front door

Not an option; a second entry point. `setupTelemetry(options)` forwards to `initTelemetry` unchanged,
so everything in this document applies to it identically — including idempotence, the invalid-value
rules, and the master-switch map in §5.

```ts
function setupTelemetry(options?: SimpleTelemetryOptions): TelemetryHandle;
```

`SimpleTelemetryOptions` is a `Pick<TelemetryOptions, …>` of seventeen fields, so it cannot drift
from the real options object:

| Flat field        | Nested equivalent                       | Default                                            |
|-------------------|-----------------------------------------|----------------------------------------------------|
| `app`             | `appName`                               | none                                               |
| `version`         | `appVersion`                            | none                                               |
| `build`           | `buildId`                               | none                                               |
| `environment`     | `environment`                           | none                                               |
| `url`             | `rest.errorsUrl` **and** `rest.logsUrl` | none                                               |
| `errorUrl`        | `rest.errorsUrl`                        | none                                               |
| `logUrl`          | `rest.logsUrl`                          | none                                               |
| `headers`         | `rest.getHeaders`                       | none                                               |
| `level`           | `logs.level`                            | `'warn'`                                           |
| `consoleLevel`    | `logs.consoleLevel`                     | none — leaves the logger's own console level alone |
| `captureConsole`  | `logs.captureConsole`                   | `false`                                            |
| `maxErrors`       | `errors.maxRecords`                     | `500`                                              |
| `maxLogs`         | `logs.maxRecords`                       | `2000`                                             |
| `enabled`         | `enabled`                               | `true`                                             |
| `consent`         | `consent`                               | none                                               |
| `onInternalError` | `onInternalError`                       | none                                               |
| `env`             | `env`                                   | off (`undefined`)                                  |

Twelve of the fourteen aliases in §4a are in `SimpleTelemetryOptions`: `app`, `version`, `build`,
`url`, `errorUrl`, `logUrl`, `headers`, `level`, `consoleLevel`, `captureConsole`, `maxErrors` and
`maxLogs`. The two that are not are `errorRetentionDays` and `logRetentionDays` — set retention
through the nested option, or call `initTelemetry` directly, which accepts the whole
`TelemetryOptions` and therefore every alias.

```ts
import { setupTelemetry, initTelemetry } from '@codewithrajat/rm-logvault';

// The one-liner.
setupTelemetry({ app: 'checkout' });

// The same call, when you also need a nested option.
initTelemetry({ app: 'checkout', errors: { retentionDays: 14 } });
```

---

## 13. Exporting a report without the keyboard

The shortcut is one way in; these are the others, and they take the same options as the shortcut's
`exportOptions`.

```ts
import { exportDiagnosticsReport } from '@codewithrajat/rm-logvault';

await exportDiagnosticsReport(); //                  self-contained HTML download (default)
await exportDiagnosticsReport({ format: 'json' }); // the same data as JSON
await exportDiagnosticsReport({ format: 'jsonl' }); // one JSON object per line
await exportDiagnosticsReport({ format: 'csv' }); //   one wide spreadsheet table
await exportDiagnosticsReport({
  format: 'json',
  pretty: true, //                                   indented; 'json' only
  redactAgain: true,
  copyToClipboard: true, //                          bypasses the download path entirely
  onProgress: (processed, total) => console.warn(processed, '/', total),
  onExported: (ok) => console.warn('exported:', ok),
});
```

| `DiagnosticsExportOptions` | Type                                                        | Default                                                |
|----------------------------|-------------------------------------------------------------|--------------------------------------------------------|
| `format`                   | `'html' \| 'json' \| 'jsonl' \| 'csv' \| undefined`         | `'html'`                                               |
| `copyToClipboard`          | `boolean \| undefined`                                      | `false`                                                |
| `pretty`                   | `boolean \| undefined`                                      | `false`                                                |
| `redactAgain`              | `boolean \| undefined`                                      | `false`                                                |
| `filenamePrefix`           | `string \| undefined`                                       | `shortcut.filenamePrefix`, then `'diagnostics-report'` |
| `onProgress`               | `((processed: number, total: number) => void) \| undefined` | `undefined`                                            |
| `onExported`               | `((ok: boolean) => void) \| undefined`                      | `undefined`                                            |

Per option:

- **`format`** — `'html'` produces one self-contained, XSS-safe HTML file with the data embedded as
  escaped JSON. `'json'` produces the same payload as JSON. `'jsonl'` produces one JSON object per
  line (`{"kind":"error",…}` then `{"kind":"log",…}`), for `grep`, `jq` and a log pipeline. `'csv'`
  produces a single wide table with the columns in `DIAGNOSTICS_CSV_COLUMNS`, openable in a
  spreadsheet; cells starting with `=`, `+`, `-`, `@`, a tab or a CR are prefixed with an apostrophe
  so a formula cannot be smuggled in through an error message. Anything unrecognised resolves to
  `'html'`.
- **`copyToClipboard`** — `true` writes the report text to the clipboard **instead of** downloading.
  It is feature-detected, and when the Clipboard API is unavailable the result is `ok: false` rather
  than falling back to a download the user did not ask for. It never touches `URL.createObjectURL`,
  which makes it the fastest way to prove the capture pipeline works when a download does not start.
- **`pretty`** — `true` indents the JSON output. It applies to `'json'` **only**; `'jsonl'`
  deliberately ignores it, because an indented object would break the one-record-per-line contract.
- **`redactAgain`** — `true` re-runs the sanitizer over every record before export. Redaction
  already happened before storage; enable this when the redaction configuration changed after the
  records were written, or when handing a report to a third party and you want a documented second
  pass. It costs a slice-yielded pass over every record.
- **`filenamePrefix`** — resolved in the order `explicit option → shortcut.filenamePrefix →
  'diagnostics-report'`; see `shortcut.filenamePrefix` for the filename shape.
- **`onProgress`** — called once per 500 records (`EXPORT_SLICE_SIZE`) and once at the end, with
  `(processed, total)` counted across the whole payload, so the number never goes backwards when the
  log half starts. A throwing callback is contained.
- **`onExported`** — a per-call hook that overrides the shortcut's `onExported` for that call only.

Guarantees and limits: the export never throws, and it resolves with a
`DiagnosticsExportResult` of `{ ok, format, bytes }` rather than a boolean.

> **Breaking change.** `exportDiagnosticsReport` returned `Promise<boolean>` before the
> framework-agnostic layer; `ok` is that boolean and `bytes` is new. `if (await
> exportDiagnosticsReport())` still compiles and is now always truthy, because an object is always
> truthy — update it to `(await exportDiagnosticsReport()).ok`.

It flushes buffered records first, it reads **all** rows regardless of upload status, it marshals in
500-record slices with a yield between slices, and a concurrent call resolves with `ok: false` while
one is in flight. It resolves `ok: false` outside a browser and when there is no repository
(`enabled: false`).

---

## 14. Presets

### Minimal — local only, no backend

```ts
import { initTelemetry } from '@codewithrajat/rm-logvault';

initTelemetry({ appName: 'my-app' });
```

Everything else defaults: records go to IndexedDB, `window.onerror` and `unhandledrejection` are
captured, `Ctrl+Shift+Alt+D` downloads a report, and no network request is ever made.

### Local development — see everything while you work

```ts
initTelemetry({
  appName: 'my-app',
  environment: 'development',
  logs: { level: 'debug', consoleLevel: 'debug' },
  errors: { captureCsp: true, captureResources: true },
  shortcut: { onExported: (ok) => console.warn('[rm-logvault] report:', ok) },
});
```

`captureCsp` and `captureResources` are the two worth turning on deliberately; both are off by
default because they are noisy in production.

### Production — quiet console, uploads on, longer retention

```ts
initTelemetry({
  appName: 'my-app',
  appVersion: '1.4.2',
  environment: 'production',
  logs: { level: 'warn', consoleLevel: 'off' },
  errors: { maxRecords: 1000, retentionDays: 14 },
  rest: {
    errorsUrl: '/telemetry/errors',
    logsUrl: '/telemetry/logs',
    requireHttps: true,
  },
});
```

`requireHttps: true` rejects a plain `http:` endpoint except on localhost, so a misconfigured
deployment fails loudly instead of uploading over cleartext. Records are always written to IndexedDB
first, so an unreachable endpoint costs nothing.

### Strict privacy — no query values survive, plus a consent gate

```ts
initTelemetry({
  appName: 'my-app',
  mode: 'local',
  redaction: {
    allowedQueryParams: [], // keep no query values at all
    extraSensitiveKeys: ['customerId', /^acct/i],
  },
  consent: () => window.__ANALYTICS_CONSENT__ === true,
});
```

`mode: 'local'` is belt-and-braces: even if a URL is configured later, no upload happens. The consent
gate is re-evaluated before every capture, persist and upload, and a throwing gate fails closed.

### Testing — in-memory repository, no shortcut

```ts
import { createMemoryRepository } from '@codewithrajat/rm-logvault/testing';

initTelemetry({
  appName: 'test',
  shortcut: false,
  repository: createMemoryRepository(),
  logs: { captureConsole: false },
});
```

`shortcut: false` is the only way to disable the shortcut — `undefined` and `{}` both install it.

### Air-gapped — a custom transport instead of `fetch`

```ts
initTelemetry({
  appName: 'my-app',
  rest: {
    transport: {
      name: 'internal-bus',
      send: async (request) => {
        await publishToInternalBus(request.body);
        return { status: 200 };
      },
    },
  },
});
```

Supplying a `transport` also sets `rest.enabled: true` and infers `mode: 'remote'`. The contract is
in [API.md](API.md) and [REST-CONTRACT.md](REST-CONTRACT.md).

---

## 15. Reading the resolved configuration back

```ts
import { resolveOptions, databaseNames, DEFAULT_OPTIONS } from '@codewithrajat/rm-logvault';

const resolved = resolveOptions({
  appName: 'checkout',
  env: true,
  errors: { maxRecords: -5, captureCsp: true },
  logs: { level: 'silent' },
});

resolved.errors.maxRecords; // 500    — the negative value was ignored
resolved.errors.allowedQueryParams; // [] — the errors-side default before the sanitizer's fallback
resolved.logs.level; // 'off'  — 'silent' normalised
resolved.logs.consoleLevel; // undefined — omitted, so the logger keeps its own level
resolved.errors.captureCsp; // true
resolved.rest.enabled; // false — no URL, no transport
resolved.mode; // 'local'  — inferred from rest.enabled
resolved.shortcut; // { key: 'd', ctrl: true, shift: true, alt: true, meta: false, … }

databaseNames(resolved.dbPrefix); // { errors: 'rm-logvault-errors', logs: 'rm-logvault-logs' }
DEFAULT_OPTIONS.errors.maxRecords; // 500
```

`resolved` and each group are `Object.freeze`d, so this is a read-only view. Use it to assert your
configuration in a test, or to feed `isSyncConfigured(resolved)`. Inside an `onInternalError`
callback, `getState().options` is the configuration of the **live** installation (or `null` before
init and after destroy).

Useful companions:

| Function                            | Answers                                                                                |
|-------------------------------------|----------------------------------------------------------------------------------------|
| `resolveOptions(options)`           | What will my options actually resolve to?                                              |
| `isSyncConfigured(resolved)`        | Will the uploader run at all?                                                          |
| `resolveEndpoint(url, requireHttps)`| Is this one URL usable, and as what?                                                   |
| `databaseNames(dbPrefix)`           | Which two databases will be created?                                                   |
| `getTelemetryStatus()`              | `mode`, `storage`, `online`, `pending`, `droppedByRateLimit`, `lastSync`, `syncStatus` |
| `DEFAULT_OPTIONS`                   | The built-in defaults, exported so tests and docs share one source of truth            |

### A source note

Retention prose used to describe the `errors.maxRecords` overflow as "deleted first, in chunks of
200". The implementation deletes **one row at a time** inside the cleanup transaction
(`cleanupStore` → `store.delete(entry.key)` per surplus row); there is no 200-row chunking anywhere
in `src/storage/`. The 200 in storage is `LOG_CLEANUP_EVERY_WRITES`, which is how often *log*
retention runs. [CONFIGURATION.md](CONFIGURATION.md), [API.md](API.md) and
[examples/vanilla/advanced/02-retention-and-payload-budgets.md](../examples/vanilla/advanced/02-retention-and-payload-budgets.md)
were corrected with this change. The behavioural consequence is the useful part, and it is stated
above as: the cap is enforced by a sweep that runs at init and then every 25 error writes, so it is a
bounded-work guard rather than an immediate ceiling.

---

## 16. Where to go next

- [CONFIGURATION.md](CONFIGURATION.md) — the authoritative reference, with the reasoning and the
  invalid-value rules in full.
- [API.md](API.md) — every exported symbol, with signatures and examples.
- [TROUBLESHOOTING.md](TROUBLESHOOTING.md) — when a setting does not do what this page says.
- [PRIVACY-GDPR.md](PRIVACY-GDPR.md) — retention, erasure and the `consent()` gate in depth.
