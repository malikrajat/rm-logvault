# Configuration

The exhaustive reference for `TelemetryOptions`: every field, every default, the precedence rules,
what happens when a value is invalid, and five copy-pasteable presets.

Defaults are quoted from `DEFAULT_OPTIONS` and `resolveOptions` in `src/core/config.ts`. Where a
default is a literal in `resolveOptions` rather than a member of `DEFAULT_OPTIONS`, that is stated
explicitly.

For the same surface as a single object to copy and edit — every option with its default inline — see
[OPTIONS-CHEATSHEET.md](OPTIONS-CHEATSHEET.md). It defers to this document wherever the two could
differ.

---

## The simplest possible setup

One line is a complete integration. Nested or flat, the two forms are the same configuration:

```ts
import { initTelemetry, setupTelemetry } from '@codewithrajat/rm-logvault';

// The one-line form.
setupTelemetry({ app: 'checkout' });

// The same thing, in the nested form, through initTelemetry.
initTelemetry({ appName: 'checkout' });
```

`setupTelemetry` is a thin, flat front door to `initTelemetry` — not a second configuration system.
It forwards to `initTelemetry` unchanged, so the two are interchangeable, can be mixed in one
codebase, and are idempotent in exactly the same way. See
[§3 `setupTelemetry`](#3-setuptelemetry-and-simpletelemetryoptions).

Adding an endpoint is the other half of "simplest", and the flat aliases from
[§2](#2-flat-aliases) carry it:

```ts
// Nested: three levels to express two facts.
initTelemetry({
  appName: 'checkout',
  rest: { errorsUrl: '/telemetry/errors', logsUrl: '/telemetry/logs' },
  logs: { level: 'info' },
});

// Flat: the same configuration.
initTelemetry({ appName: 'checkout', url: '/telemetry', level: 'info' });
```

`url` feeds **both** `rest.errorsUrl` and `rest.logsUrl`, which is the single-collector case. Nothing
about the nested form changes: every nested option still exists, still means what it always meant,
and still wins over its flat alias.

---

## 1. Precedence

One rule, applied to every option:

```text
explicit option  >  fromEnv layer  >  built-in default
```

The environment layer is opt-in. `initTelemetry` never inspects `import.meta.env` or `process.env`
unless you ask it to:

| `env` value                              | Effect                                                                         |
|------------------------------------------|--------------------------------------------------------------------------------|
| absent / `false` / `0` / `''`            | No environment layer at all. The core stays bundler-agnostic.                  |
| `true`                                   | Reads with `DEFAULT_ENV_PREFIXES` = `['VITE_', 'NEXT_PUBLIC_', 'REACT_APP_']`. |
| `'MY_PREFIX_'` (non-empty string)        | Reads with exactly that prefix.                                                |
| `['VITE_', 'PUBLIC_']` (non-empty array) | Reads with those prefixes, in order.                                           |
| `[]` or `''`                             | Ignored — falls back to "no environment layer".                                |

Within the environment layer, prefixes are tried in order and the **first non-empty match wins**.
For each name, `import.meta.env` is consulted before `process.env`.

```ts
import { initTelemetry, fromEnv } from '@codewithrajat/rm-logvault';

// The environment LAYER. An explicit option still wins over it.
initTelemetry({ env: true, appName: 'checkout' });
initTelemetry({ env: 'NEXT_PUBLIC_' });
initTelemetry({ env: ['VITE_', 'PUBLIC_'] });

// `fromEnv()` returns a flat object, so place the nested values yourself.
const env = fromEnv();
initTelemetry({ appName: env.appName, errors: { maxRecords: env.errorsMaxRecords } });
```

**`fromEnv()` is not a drop-in options object, and spreading it is not equivalent to `env:`.**
It returns the flat `EnvOptions` fields (`errorsEnabled`, `logsMaxRecords`, `errorsUrl`, …), while
`resolveOptions` reads the environment only through `options.env`. A spread therefore carries just the
fields whose names happen to coincide with a top-level option — `appName`, `appVersion`, `buildId`,
`environment`, `enabled`, `dbPrefix` — and silently drops every nested one, including every URL,
retention window, cap and level.

`{ env: true | 'PREFIX' | ['A_', 'B_'] }` is the form that applies the whole environment, and it keeps
an explicit option authoritative. Use `fromEnv()` when you want to read the values yourself, or to
place a few of them by hand as in the last line above.

Two defensive rules apply while resolving:

1. **A non-positive, `NaN`, `Infinity` or non-numeric numeric is ignored**, and the default is used.
   `maxRecords: 0` cannot mean "store nothing"; it means a mistake was made, and silently disabling
   retention would be the surprising outcome. Zero is allowed only where the semantics are
   meaningful and documented (`retentionDays`, `maxEventsPerMinute`, `maxLogsPerMinute`).
2. **An unrecognised log-level string is ignored**, keeping the previous level. A typo must never be
   able to turn on verbose persistence.

---

## 2. Flat aliases

Fourteen top-level fields are shorthands for a nested one, for the common case where the nested
object would hold a single field. They exist because `initTelemetry({ url: '/telemetry', level:
'info' })` is the whole configuration most applications need, and making a reader learn
`rest.errorsUrl` and `logs.level` to get there is a tax on the first five minutes of using the
library.

Nothing here changes the meaning of an existing option. Every alias is an *additional* way to set the
same field; the nested option is still the full-fidelity form, and it always wins.

> **Source note on the count.** `src/core/config.ts` introduces these fields with a comment rather
> than a group of its own, so there is no name to quote back. There are **fourteen** identifiers and
> **thirteen** distinct nested destinations, because the single `url` alias feeds both
> `rest.errorsUrl` and `rest.logsUrl`. The table below lists all fourteen.

### Precedence, inside out

The precedence rule from [§1](#1-precedence) gains one layer, and it sits **inside** the explicit
one:

```text
nested option  >  flat alias  >  environment (fromEnv layer)  >  built-in default
```

So `{ url: '/a', rest: { errorsUrl: '/b' } }` uploads errors to `/b` and logs to `/a`. Both are
explicit options; the nested one is simply the more specific.

The alias pairs themselves resolve with `??`, so only `undefined` falls through:

| You pass                                      | Resolved                                                                                                                                                                                            |
|-----------------------------------------------|-----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------|
| `{ appName: 'a', app: 'b' }`                  | `'a'` — the long name wins                                                                                                                                                                          |
| `{ appName: 'a' }`                            | `'a'`                                                                                                                                                                                               |
| `{ app: 'b' }`                                | `'b'`                                                                                                                                                                                               |
| `{ app: '' }`                                 | `''` — `??` does not skip a falsy value, and the alias layer does **not** trim; the string validators do, and they run afterwards, so `''` is then ignored and the environment and default apply    |
| `{ app: '  ' }`                               | `'  '` at the alias layer, then trimmed to `''` by the string validator, then ignored — the same outcome as above                                                                                   |
| `{ errorUrl: '/e', url: '/shared' }`          | `rest.errorsUrl = '/e'`, `rest.logsUrl = '/shared'`                                                                                                                                                 |

### The aliases, and exactly what each one beats

| Alias                | Nested option                           | Environment variable                                | Who wins                                                                                                                                                                                                                                       |
|----------------------|-----------------------------------------|-----------------------------------------------------|------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------|
| `url`                | `rest.errorsUrl` **and** `rest.logsUrl` | `ERROR_TRACKING_REST_URL` / `LOG_TRACKING_REST_URL` | `rest.errorsUrl` / `rest.logsUrl` → `errorUrl` / `logUrl` → `url` → env. One `url` feeds both kinds, so it is the single-collector case.                                                                                                       |
| `errorUrl`           | `rest.errorsUrl`                        | `ERROR_TRACKING_REST_URL`                           | `rest.errorsUrl` → `errorUrl` → `url` → env                                                                                                                                                                                                    |
| `logUrl`             | `rest.logsUrl`                          | `LOG_TRACKING_REST_URL`                             | `rest.logsUrl` → `logUrl` → `url` → env                                                                                                                                                                                                        |
| `headers`            | `rest.getHeaders`                       | *(none)*                                            | `rest.getHeaders` → `headers`. A non-function value on either is ignored, leaving `undefined`.                                                                                                                                                 |
| `level`              | `logs.level`                            | `LOG_PERSIST_LEVEL`, then `TELEMETRY_LOG_LEVEL`     | `logs.level` → `level` → env. The **persist** threshold. An invalid string is ignored and the next layer is consulted, exactly as for `logs.level`.                                                                                            |
| `consoleLevel`       | `logs.consoleLevel`                     | `LOG_LEVEL`                                         | `logs.consoleLevel` → `consoleLevel` → env. If **either option** supplied a valid level, the environment is skipped entirely for this field. There is still no default, so omitting all three leaves the logger's own console level alone.     |
| `captureConsole`     | `logs.captureConsole`                   | *(none)*                                            | `logs.captureConsole` → `captureConsole` → `false`                                                                                                                                                                                             |
| `maxErrors`          | `errors.maxRecords`                     | `ERROR_TRACKING_MAX_RECORDS`                        | `errors.maxRecords` → `maxErrors` → env → `500`                                                                                                                                                                                                |
| `maxLogs`            | `logs.maxRecords`                       | `LOG_PERSIST_MAX_RECORDS`                           | `logs.maxRecords` → `maxLogs` → env → `2000`                                                                                                                                                                                                   |
| `errorRetentionDays` | `errors.retentionDays`                  | `ERROR_TRACKING_RETENTION_DAYS`                     | `errors.retentionDays` → `errorRetentionDays` → env → `7`                                                                                                                                                                                      |
| `logRetentionDays`   | `logs.retentionDays`                    | `LOG_PERSIST_RETENTION_DAYS`                        | `logs.retentionDays` → `logRetentionDays` → env → `3`                                                                                                                                                                                          |
| `app`                | `appName`                               | `APP_NAME`                                          | `appName` → `app` → env → `undefined`                                                                                                                                                                                                          |
| `version`            | `appVersion`                            | `APP_VERSION`                                       | `appVersion` → `version` → env → `undefined`                                                                                                                                                                                                   |
| `build`              | `buildId`                               | `BUILD_ID`                                          | `buildId` → `build` → env → `undefined`                                                                                                                                                                                                        |

Every name in that column is written without its prefix and is read from
`import.meta.env` before `process.env`. See [§1](#1-precedence) for the prefixes themselves, and
[`fromEnv`](API.md#fromenv) for the full variable list, including the legacy spellings.

> `app`, `version` and `build` exist for [`setupTelemetry`](#3-setuptelemetry-and-simpletelemetryoptions)
> — they are the names that read best in a flat object. The environment still supplies those three
> identity fields under `APP_NAME`, `APP_VERSION` and `BUILD_ID`, which are the names of the nested
> options' variable slots, not of the aliases.

The invalid-value rules are identical through an alias, because an alias is collapsed into the
nested option *before* any validation runs: `maxErrors: 0` is ignored and `500` applies, and
`level: 'verbose'` is ignored and the next layer is consulted. See [§10](#10-invalid-value-rules).

```ts
import { initTelemetry } from '@codewithrajat/rm-logvault';

initTelemetry({
  app: 'checkout',
  version: '2.4.1',
  url: '/telemetry',
  headers: async () => ({ Authorization: `Bearer ${await getToken()}` }),
  level: 'info',
  consoleLevel: 'error',
  maxErrors: 1000,
  maxLogs: 5000,
  errorRetentionDays: 14,
  logRetentionDays: 7,
  captureConsole: false,
});
```

`resolveOptions` freezes the result, so `resolveOptions(options)` is the way to see what an alias
actually resolved to — see [§11](#11-reading-the-resolved-configuration-back).

---

## 3. `setupTelemetry` and `SimpleTelemetryOptions`

```ts
function setupTelemetry(options?: SimpleTelemetryOptions): TelemetryHandle;
```

The flat front door. It forwards to `initTelemetry` **unchanged**, so:

- The two are interchangeable, and can be mixed in one codebase.
- It is idempotent in exactly the same way — a second call returns the existing handle rather than
  reconfiguring, so an option changed after the first call has no effect until `destroyTelemetry()`.
- Anything it cannot express — `errors`, `redaction`, `rest` as a whole, `shortcut`, `mode`,
  `dbPrefix`, `openTimeoutMs`, `repository`, `logSource` — is still available by calling
  `initTelemetry` with the full options.
- It **never throws**. `initTelemetry` is already total; this adds a second guard that reports
  through `reportInternalFailure('setup', …)` and returns a disabled handle.

`SimpleTelemetryOptions` is a `Pick<TelemetryOptions, …>` of seventeen fields rather than a separate
shape, so the simple path and the real one cannot drift:

```ts
type SimpleTelemetryOptions = Pick<
  TelemetryOptions,
  | 'app'
  | 'version'
  | 'build'
  | 'environment'
  | 'url'
  | 'errorUrl'
  | 'logUrl'
  | 'headers'
  | 'level'
  | 'consoleLevel'
  | 'captureConsole'
  | 'maxErrors'
  | 'maxLogs'
  | 'enabled'
  | 'consent'
  | 'onInternalError'
  | 'env'
>;
```

| Alias            | Flat field        | Nested equivalent                       | Default                                      |
|------------------|-------------------|-----------------------------------------|----------------------------------------------|
| `app`            | `app`             | `appName`                               | `undefined`                                  |
| `version`        | `version`         | `appVersion`                            | `undefined`                                  |
| `build`          | `build`           | `buildId`                               | `undefined`                                  |
| —                | `environment`     | `environment` (already flat)            | `undefined`                                  |
| `url`            | `url`             | `rest.errorsUrl` **and** `rest.logsUrl` | `undefined`                                  |
| `errorUrl`       | `errorUrl`        | `rest.errorsUrl`                        | `undefined`                                  |
| `logUrl`         | `logUrl`          | `rest.logsUrl`                          | `undefined`                                  |
| `headers`        | `headers`         | `rest.getHeaders`                       | `undefined`                                  |
| `level`          | `level`           | `logs.level`                            | `'warn'`                                     |
| `consoleLevel`   | `consoleLevel`    | `logs.consoleLevel`                     | none — leaves the logger's own level alone   |
| `captureConsole` | `captureConsole`  | `logs.captureConsole`                   | `false`                                      |
| `maxErrors`      | `maxErrors`       | `errors.maxRecords`                     | `500`                                        |
| `maxLogs`        | `maxLogs`         | `logs.maxRecords`                       | `2000`                                       |
| —                | `enabled`         | `enabled` (already flat)                | `true`                                       |
| —                | `consent`         | `consent` (already flat)                | `undefined`                                  |
| —                | `onInternalError` | `onInternalError` (already flat)        | `undefined`                                  |
| —                | `env`             | `env` (already flat)                    | `undefined` (off)                            |

```ts
import { setupTelemetry } from '@codewithrajat/rm-logvault';

// Local only — no endpoint, nothing ever leaves the browser.
setupTelemetry({ app: 'checkout', version: '2.4.1' });

// One collector for both kinds, persisted from `info` up.
setupTelemetry({
  app: 'checkout',
  url: '/telemetry',
  level: 'info',
  maxErrors: 1000,
});
```

```ts
import { setupTelemetry, logger } from '@codewithrajat/rm-logvault';

// Split collectors, a token that refreshes per request, and a quiet console.
setupTelemetry({
  app: 'checkout',
  version: '2.4.1',
  environment: 'production',
  errorUrl: '/telemetry/errors',
  logUrl: '/telemetry/logs',
  headers: async () => ({ Authorization: `Bearer ${await getAccessToken()}` }),
  level: 'info',
  consoleLevel: 'error',
  maxErrors: 1000,
});
```

---

## 4. `TelemetryOptions` — top level

| Option            | Type                                                     | Default                        | Description                                                                                                                                                                  |
|-------------------|----------------------------------------------------------|--------------------------------|------------------------------------------------------------------------------------------------------------------------------------------------------------------------------|
| `appName`         | `string \| undefined`                                    | `undefined`                    | Application name, stamped onto every record's `environment` block (sanitized, max 200 characters).                                                                           |
| `appVersion`      | `string \| undefined`                                    | `undefined`                    | Application version, stamped onto every record (sanitized, max 200 characters).                                                                                              |
| `buildId`         | `string \| undefined`                                    | `undefined`                    | Build identifier — a commit SHA, CI run id or asset manifest hash — for correlating a report to a deploy.                                                                    |
| `environment`     | `string \| undefined`                                    | `undefined`                    | Deployment environment, e.g. `production`, `staging`.                                                                                                                        |
| `enabled`         | `boolean \| undefined`                                   | `true`                         | Master switch. `false` makes every capture call a no-op and buffers nothing.                                                                                                 |
| `mode`            | `'local' \| 'remote' \| undefined`                       | inferred — see below           | Where records go. `'local'` (the default) means **no network requests at all**. See [D-015](DECISIONS.md).                                                                   |
| `dbPrefix`        | `string \| undefined`                                    | `'rm-logvault'`                | Database name prefix; produces `` `${dbPrefix}-errors` `` and `` `${dbPrefix}-logs` ``.                                                                                      |
| `openTimeoutMs`   | `number \| undefined`                                    | `5000`                         | How long to wait for an IndexedDB `open()` before declaring storage unavailable. A slow cold open is normal; a hung upgrade in another tab is the usual reason this expires. |
| `env`             | `boolean \| string \| readonly string[] \| undefined`    | `undefined` (off)              | Opt in to the build-time environment layer. See [precedence](#1-precedence).                                                                                                 |
| `errors`          | `ErrorsOptions \| undefined`                             | see §5                         | Error-capture configuration.                                                                                                                                                 |
| `logs`            | `LogsOptions \| undefined`                               | see §6                         | Log-capture configuration.                                                                                                                                                   |
| `redaction`       | `RedactionOptions \| undefined`                          | see §7                         | Extensions to the built-in redaction rules.                                                                                                                                  |
| `rest`            | `RestOptions \| undefined`                               | see §8                         | REST upload configuration.                                                                                                                                                   |
| `shortcut`        | `false \| ShortcutOptions \| undefined`                  | enabled, `Ctrl+Shift+Alt+D`    | Diagnostics-export shortcut. `false` disables it entirely; `undefined` and `{}` both enable it with defaults.                                                                |
| `consent`         | `(() => boolean) \| undefined`                           | `undefined`                    | Consent gate, evaluated before every capture, persist and upload. A throwing gate fails closed.                                                                              |
| `onInternalError` | `((stage: string, error: unknown) => void) \| undefined` | `undefined`                    | Observe the library's own failures. Each stage is reported once per initialization.                                                                                          |
| `repository`      | `TelemetryRepository \| undefined`                       | IndexedDB                      | Swap IndexedDB for a custom backend. `@codewithrajat/rm-logvault/testing` ships an in-memory one.                                                                            |
| `logSource`       | `ExternalLogSource \| undefined`                         | `undefined`                    | Attach to an existing application logger that exposes `addSink`.                                                                                                             |

Fourteen further fields — `url`, `errorUrl`, `logUrl`, `headers`, `level`, `consoleLevel`,
`captureConsole`, `maxErrors`, `maxLogs`, `errorRetentionDays`, `logRetentionDays`, `app`, `version`
and `build` — are flat shorthands for a nested option above. They are documented in
[§2](#2-flat-aliases), and each one resolves to exactly the same field its nested form does.

### Type note: `Maybe<T>`

`exactOptionalPropertyTypes` is enabled project-wide, so `{ appName?: string }` would not accept
`{ appName: undefined }`. Every optional member is therefore declared as `Maybe<T>`, which is
`T | undefined`. The tables above write the widened form directly. If your tsconfig has
`exactOptionalPropertyTypes: false`, the types are simply more permissive than required — nothing
breaks.

### Identity fields and sanitization

`appName`, `appVersion`, `buildId` and `environment` pass through `sanitizer.text(value, 200)` when
the environment block is built, so a token accidentally placed in `appVersion` is still redacted on
the way into a record.

### Resolved form

```ts
interface ResolvedTelemetryOptions {
  readonly appName: string | undefined;
  readonly appVersion: string | undefined;
  readonly buildId: string | undefined;
  readonly environment: string | undefined;
  readonly enabled: boolean;
  readonly mode: StorageMode;
  readonly dbPrefix: string;
  readonly errors: ResolvedErrorsOptions;
  readonly logs: ResolvedLogsOptions;
  readonly redaction: ResolvedRedactionOptions;
  readonly rest: ResolvedRestOptions;
  readonly shortcut: false | ResolvedShortcutOptions;
  readonly consent: (() => boolean) | undefined;
  readonly onInternalError: ((stage: string, error: unknown) => void) | undefined;
  readonly repository: TelemetryRepository | undefined;
  readonly logSource: ExternalLogSource | undefined;
}
```

`resolveOptions()` returns this, `Object.freeze`d at the top level and per group. The genuinely
callback-shaped and backend-shaped fields (`consent`, `onInternalError`, `repository`, `logSource`)
stay optional; everything else has a concrete value.

### `mode` — deciding where records go

`mode` answers one question: does this installation ever touch the network? It is the only switch that
does, and it resolves like this:

| What you passed                                              | Resolved `mode` | Network requests              |
|--------------------------------------------------------------|-----------------|-------------------------------|
| nothing (or only `errors`, `logs`, `redaction`, `shortcut`)  | `'local'`       | **none, ever**                |
| `rest.errorsUrl`, `rest.logsUrl` or `rest.transport`         | `'remote'`      | yes, to those URLs            |
| `mode: 'local'` **and** a URL                                | `'local'`       | **none** — the URL is ignored |
| `mode: 'remote'` and no usable URL                           | `'remote'`      | none — see below              |

An explicit `mode` always wins over inference. `'remote'` is a statement of intent, so when there is
no valid endpoint the uploader stays disabled and the stage `mode-remote-without-endpoint` is reported
once through `onInternalError`; records keep accumulating safely in IndexedDB rather than being
discarded. An unrecognised value falls back to inference.

Note that `'remote'` is **not** an alternative to local storage — records are always written to
IndexedDB first, and the upload is a second step that reads from it. See [D-015](DECISIONS.md).

---

## 5. `ErrorsOptions`

| Option                             | Type                                                          | Default                                   | Description                                                                                                                                                                                                                                                                                                               |
|------------------------------------|---------------------------------------------------------------|-------------------------------------------|---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------|
| `enabled`                          | `boolean \| undefined`                                        | `true`                                    | Capture errors at all. `false` also skips installing the global handlers.                                                                                                                                                                                                                                                 |
| `maxRecords`                       | `number \| undefined`                                         | `500`                                     | Hard cap on retained error rows. The oldest surplus is deleted first, by `lastSeen`, one row per delete request inside the cleanup transaction. Enforced by a sweep that runs at initialization and every 25 error writes, so it is a bounded-work guard rather than an immediate ceiling. `0` and negatives are ignored. |
| `retentionDays`                    | `number \| undefined`                                         | `7`                                       | Delete errors whose `lastSeen` is older than this. **`0` disables the age cutoff** while keeping `maxRecords`.                                                                                                                                                                                                            |
| `maxPayloadBytes`                  | `number \| undefined`                                         | `16384`                                   | UTF-8 byte budget per record before progressive reduction. If even the minimal reduction tier does not fit, the record is dropped.                                                                                                                                                                                        |
| `maxEventsPerMinute`               | `number \| undefined`                                         | `120`                                     | Fixed 60-second-window rate limit. **`0` disables limiting entirely.** Excess is dropped and summarised once.                                                                                                                                                                                                             |
| `allowedQueryParams`               | `readonly string[] \| undefined`                              | `[]` (then the redaction default applies) | Query parameter names whose **values** survive URL redaction.                                                                                                                                                                                                                                                             |
| `preventDefaultUnhandledRejection` | `boolean \| undefined`                                        | `false`                                   | Call `preventDefault()` on `unhandledrejection`. Left `false` because the library must never change host application behaviour.                                                                                                                                                                                           |
| `captureResources`                 | `boolean \| undefined`                                        | `false`                                   | Attach a capture-phase listener for failed `<script>`/`<link>`/`<img>` loads.                                                                                                                                                                                                                                             |
| `captureCsp`                       | `boolean \| undefined`                                        | `false`                                   | Listen for `securitypolicyviolation`.                                                                                                                                                                                                                                                                                     |
| `captureChunkErrors`               | `boolean \| undefined`                                        | `true`                                    | Treat dynamic-import failures as `source: 'chunk'` with `fatal` severity.                                                                                                                                                                                                                                                 |
| `beforeCapture`                    | `((record: ErrorRecord) => ErrorRecord \| null) \| undefined` | `undefined`                               | Last chance to inspect, modify or drop a record before storage. Return `null` to drop it. A throwing hook is reported and the original record is stored.                                                                                                                                                                  |

### `allowedQueryParams` interplay

This one has a subtle resolution path, because the same concept exists in two places:

```text
resolved.errors.allowedQueryParams =
    errors.allowedQueryParams            if defined
  ? redaction.allowedQueryParams !== undefined → that value
  : []

resolved.redaction.allowedQueryParams =
    redaction.allowedQueryParams         if defined
  ? errors.allowedQueryParams !== undefined → that value
  : undefined
```

Both groups fall back to each other, deducing that if you set the list in one place you probably
meant it everywhere. Practically:

- Setting only `redaction.allowedQueryParams` sets the effective list for both.
- Setting only `errors.allowedQueryParams` also sets it for both.
- Setting neither leaves `resolved.redaction.allowedQueryParams` as `undefined`, and
  `createSanitizer` then falls back to `DEFAULT_ALLOWED_QUERY_PARAMS`:
  `limit`, `offset`, `page`, `pageSize`, `size`, `sort`, `order`, `scope`, `lng`, `lang`, `type`.
- Setting an empty array `[]` is **not** the same as leaving it unset. `[]` means "keep no query
  values at all", and every value is redacted.

### `beforeCapture` example

```ts
import { initTelemetry } from '@codewithrajat/rm-logvault';
import type { ErrorRecord } from '@codewithrajat/rm-logvault';

initTelemetry({
  appName: 'checkout',
  errors: {
    beforeCapture: (record: ErrorRecord): ErrorRecord | null => {
      // Drop noise.
      if (record.message.includes('ResizeObserver loop')) return null;
      // Enrich.
      return {
        ...record,
        tags: { ...(record.tags ?? {}), release: 'checkout-2.4.1', cohort: cohortId() },
      };
    },
  },
});
```

`beforeCapture` runs **after** redaction and fingerprinting and **before** payload reduction. The
fingerprint is therefore already fixed; changing `message` in the hook does not re-group the record.
Mutation is safe to return unchanged — the record is not reused.

---

## 6. `LogsOptions`

| Option             | Type                                                      | Default     | Description                                                                                                                                                                                                                               |
|--------------------|-----------------------------------------------------------|-------------|-------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------|
| `enabled`          | `boolean \| undefined`                                    | `true`      | Persist logs at all. `false` removes the tracker sink entirely.                                                                                                                                                                           |
| `level`            | `LogLevelSetting \| undefined`                            | `'warn'`    | The **persist** level: the minimum level written to IndexedDB.                                                                                                                                                                            |
| `consoleLevel`     | `LogLevelSetting \| undefined`                            | **none**    | The **console** level, applied at initialisation. There is no default on purpose: omitting it leaves the logger's own level alone, so `initTelemetry` never changes console output by itself. `destroyTelemetry()` resets it to `'warn'`. |
| `maxRecords`       | `number \| undefined`                                     | `2000`      | Hard cap on retained log rows.                                                                                                                                                                                                            |
| `retentionDays`    | `number \| undefined`                                     | `3`         | Delete logs older than this. `0` disables the age cutoff.                                                                                                                                                                                 |
| `maxPayloadBytes`  | `number \| undefined`                                     | `4096`      | UTF-8 byte budget per log record.                                                                                                                                                                                                         |
| `maxLogsPerMinute` | `number \| undefined`                                     | `600`       | Fixed-window rate limit for log persistence. `0` disables limiting.                                                                                                                                                                       |
| `writeFlushMs`     | `number \| undefined`                                     | `1000`      | Upper bound in milliseconds on how long a buffered log sits in memory. A write also happens as soon as `writeBatchSize` entries accumulate, whichever comes first.                                                                        |
| `writeBatchSize`   | `number \| undefined`                                     | `50`        | Buffered entries that trigger an immediate write, and the batch size: one IndexedDB transaction carries up to this many records.                                                                                                          |
| `captureConsole`   | `boolean \| undefined`                                    | `false`     | Wrap `console.warn`/`console.error` so existing calls are captured.                                                                                                                                                                       |
| `beforeStore`      | `((record: LogRecord) => LogRecord \| null) \| undefined` | `undefined` | Last chance to inspect, modify or drop a log record before storage.                                                                                                                                                                       |

### Persist level vs console level

These are two different settings and confusing them is the most common configuration mistake.

| You want to change… | Set…                                                      | Default                                   |
|---------------------|-----------------------------------------------------------|-------------------------------------------|
| What is **stored**  | `logs.level`                                              | `'warn'`                                  |
| What is **printed** | `logs.consoleLevel`, or `logger.setLevel(...)` at runtime | unchanged — the factory value is `'warn'` |

Sinks run before the console filter, so `logger.setLevel('off')` silences output while persistence
keeps working. `initTelemetry` calls `setLevel` **only** when `logs.consoleLevel` was supplied (or
`LOG_LEVEL` was set and read through `env`). With neither, the console level stays wherever you leave
it — `'warn'` from the factory, and reset to `'warn'` by `destroyTelemetry`, which is part of the
teardown contract rather than a surprise.

```ts
import { initTelemetry, logger } from '@codewithrajat/rm-logvault';

initTelemetry({ appName: 'checkout', logs: { level: 'info' } });

logger.setLevel('error'); // console: only errors
logger.info('stored but not printed'); // → IndexedDB
logger.error('stored and printed'); // → both
```

### Valid `logs.level` values

Every string is trimmed and lowercased before validation.

| Input                                                              | Resolved to                          |
|--------------------------------------------------------------------|--------------------------------------|
| `'trace'`, `'debug'`, `'info'`, `'warn'`, `'error'`                | itself                               |
| `'off'`, `'none'`, `'silent'`, `'OFF'`, `' Silent '`               | `'off'`                              |
| `'verbose'`, `'log'`, `'warning'`, `''`, `42`, `null`, `undefined` | ignored — the previous value is kept |

---

## 7. `RedactionOptions`

| Option               | Type                                         | Default           | Description                                                                                                                                                                        |
|----------------------|----------------------------------------------|-------------------|------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------|
| `extraSensitiveKeys` | `readonly (string \| RegExp)[] \| undefined` | `[]`              | Extra sensitive key names or patterns. A string matches the separator-stripped, lowercased key **exactly**; a `RegExp` is tested against both the raw key and its normalised form. |
| `extraPatterns`      | `readonly RegExp[] \| undefined`             | `[]`              | Extra free-text patterns, applied **after** the built-in rules so they win.                                                                                                        |
| `allowedQueryParams` | `readonly string[] \| undefined`             | the built-in list | Query parameter names whose values survive redaction, **replacing** the default list.                                                                                              |

Entries that are not the right type are silently discarded:

- `extraSensitiveKeys` keeps only `string` and `RegExp` entries.
- `extraPatterns` keeps only `RegExp` entries.
- `allowedQueryParams` keeps only non-empty strings.

A non-array value is treated as `[]`.

```ts
import { initTelemetry } from '@codewithrajat/rm-logvault';

initTelemetry({
  appName: 'checkout',
  redaction: {
    extraSensitiveKeys: ['x-tenant-id', 'x-request-signature', /^internal/i],
    extraPatterns: [/\bsk_live_[A-Za-z0-9]{16,}\b/g, /\b\d{16}\b/g],
    allowedQueryParams: ['page', 'locale', 'currency', 'utm_source'],
  },
});
```

A subtle but important interaction: `isAllowedQueryKey` returns `allowedQueryParams.has(lower) &&
!isSensitiveKey(key)`. Allow-listing a name that also matches the sensitive-key pattern (for
example `session`) does **not** let its value through.

Replacing `allowedQueryParams` replaces the whole list. If you want the defaults plus your own,
repeat them:

```ts
import { DEFAULT_ALLOWED_QUERY_PARAMS } from '@codewithrajat/rm-logvault';

initTelemetry({
  appName: 'checkout',
  redaction: { allowedQueryParams: [...DEFAULT_ALLOWED_QUERY_PARAMS, 'locale', 'currency'] },
});
```

### What the built-in rules cover

`extraPatterns` is applied **after** these, so it wins. Free text is scrubbed for embedded URLs,
JWTs, `Bearer`/`Basic`/`Token` schemes, `key=value` secrets (`token`, `access_token`,
`refresh_token`, `id_token`, `password`, `pwd`, `secret`, `client_secret`, `api_key`, `api-key`,
`apikey`, `session`, `sessionid`, `phone`, `mobile`, `msisdn`, `telephone`, `email`), long opaque
tokens with no `key=value` context (`LONG_SECRET_TEXT_PATTERN` — a 32–200 character `[\w-]` run),
and e-mail addresses. A URL path segment that decodes to an e-mail, starts with `eyJ`, or matches
`LONG_SECRET_PATTERN` (`/^[\w-]{32,}$/`) is replaced wholesale.

A bare short secret in prose is not detectable — `sanitizeText('failed with hunter2')` keeps
`hunter2`, because a seven-character word is indistinguishable from ordinary prose — so a known
value has to be added through `extraPatterns`.

---

## 8. `RestOptions`

| Option              | Type                                                                             | Default                                                                                        | Description                                                                                                                                     |
|---------------------|----------------------------------------------------------------------------------|------------------------------------------------------------------------------------------------|-------------------------------------------------------------------------------------------------------------------------------------------------|
| `enabled`           | `boolean \| undefined`                                                           | **derived** — `true` when `transport`, `errorsUrl` or `logsUrl` is supplied, otherwise `false` | Enable uploads. Set `false` explicitly to keep the URLs configured but the outbox closed.                                                       |
| `errorsUrl`         | `string \| undefined`                                                            | `undefined`                                                                                    | Endpoint for error batches. Absolute, or relative to the current origin.                                                                        |
| `logsUrl`           | `string \| undefined`                                                            | `undefined`                                                                                    | Endpoint for log batches.                                                                                                                       |
| `intervalMs`        | `number \| undefined`                                                            | `30000`                                                                                        | Delay between successful flushes. Non-positive values are ignored.                                                                              |
| `batchSize`         | `number \| undefined`                                                            | `50`                                                                                           | Records per request (`claimPending(rest.batchSize, …)`). Non-positive values are ignored.                                                       |
| `credentials`       | `RequestCredentials \| undefined`                                                | `'same-origin'`                                                                                | `fetch` credentials mode. Anything other than `'omit'`, `'same-origin'` or `'include'` falls back to the default. Never implicitly `'include'`. |
| `getHeaders`        | `(() => Record<string, string> \| Promise<Record<string, string>>) \| undefined` | `undefined`                                                                                    | Headers provider, awaited **per request** so tokens can be refreshed. A throwing provider is a **retryable** failure.                           |
| `transport`         | `RemoteTransport \| undefined`                                                   | `createFetchTransport()`                                                                       | Custom transport. Supplying one also activates sync.                                                                                            |
| `requireHttps`      | `boolean \| undefined`                                                           | `false`                                                                                        | Reject plain `http:` endpoints except on localhost.                                                                                             |
| `onTerminalFailure` | `((status: number, records: readonly { id: string }[]) => void) \| undefined`    | `undefined`                                                                                    | Called once per terminally-failed batch.                                                                                                        |

### How `enabled` is derived

```ts
const restEnabledByDefault =
  transport !== undefined || errorsUrl !== undefined || logsUrl !== undefined;

resolved.rest.enabled = pickBool(restIn.enabled, env?.restEnabled, restEnabledByDefault);
```

So configuring a URL turns uploads on; omitting every URL leaves them off; and an explicit
`enabled: false` wins over both. Note the two-stage check: even with `enabled: true`, the sync
manager is only active when at least one endpoint survives `resolveEndpoint` validation:

```ts
const enabled =
  rest.enabled && (endpoints.errorsUrl !== undefined || endpoints.logsUrl !== undefined);
```

### `intervalMs` and backoff

`intervalMs` is the delay after a **successful** run. After a failure the delay is
`min(15000 * 2^(failures-1), 900000)` milliseconds, or `max(that, retryAfter)` when the server sent
a `Retry-After`. The interval is never used as a "minimum gap" between requests; backoff takes over
entirely while failing.

### `getHeaders` example

```ts
import { initTelemetry } from '@codewithrajat/rm-logvault';

initTelemetry({
  appName: 'checkout',
  rest: {
    errorsUrl: '/telemetry/errors',
    logsUrl: '/telemetry/logs',
    getHeaders: async () => ({
      Authorization: `Bearer ${await getAccessToken()}`,
      'X-Request-Id': crypto.randomUUID(),
    }),
  },
});
```

The resolved headers are merged **under** `Content-Type: application/json` — actually under, in the
sense that the transport spreads the request's headers _after_ the content type, so a
`getHeaders()` that returns its own `Content-Type` wins. Do not do that.

### `requireHttps`

```ts
import { initTelemetry } from '@codewithrajat/rm-logvault';

initTelemetry({
  appName: 'checkout',
  rest: { errorsUrl: 'http://telemetry.internal/errors', requireHttps: true },
});
```

`http://telemetry.internal/errors` is rejected (it is not a localhost hostname), so
`resolveEndpoint` returns `undefined`, the sync manager reports `isEnabled() === false`, and the
library operates in IndexedDB-only mode. Nothing throws and nothing is logged to the app; the
internal stage `storage (...)`/`flush` reporting covers genuine failures, and you can check
`isSyncConfigured(resolveOptions(options))` yourself at startup if you want a loud failure.

---

## 9. `ShortcutOptions`

| Option           | Type                                   | Default                                                | Description                                                                                                                    |
|------------------|----------------------------------------|--------------------------------------------------------|--------------------------------------------------------------------------------------------------------------------------------|
| `key`            | `string \| undefined`                  | `'d'`                                                  | Physical key. A single letter maps to `Key<X>`, a digit to `Digit<N>`. An empty or whitespace-only string falls back to `'d'`. |
| `ctrl`           | `boolean \| undefined`                 | `true`                                                 | Require Ctrl.                                                                                                                  |
| `shift`          | `boolean \| undefined`                 | `true`                                                 | Require Shift.                                                                                                                 |
| `alt`            | `boolean \| undefined`                 | `true`                                                 | Require Alt.                                                                                                                   |
| `meta`           | `boolean \| undefined`                 | `false`                                                | Require Meta/Cmd.                                                                                                              |
| `target`         | `EventTarget \| undefined`             | `undefined` → `document`, then the global event target | Event target for the capture-phase listener.                                                                                   |
| `allow`          | `(() => boolean) \| undefined`         | `undefined`                                            | Gate that must return `true` for the shortcut to fire. A throwing gate suppresses the trigger.                                 |
| `filenamePrefix` | `string \| undefined`                  | `'diagnostics-report'`                                 | Downloaded filename prefix. An empty string falls back to the default.                                                         |
| `onExported`     | `((ok: boolean) => void) \| undefined` | `undefined`                                            | Called with the export outcome.                                                                                                |

Matching is **exact**: every one of the four modifiers must equal the configured value. Pressing
Ctrl+Shift+Alt+D with an extra Meta held does not fire, which prevents accidental triggers on
OS-level shortcuts. The key is matched on `KeyboardEvent.code` first and `event.key` second, because
`Alt`+letter mangles `event.key` on AZERTY, Dvorak, AltGr and macOS Option layouts.

The listener is attached in the **capture** phase. Events targeting an `<input>`, `<textarea>`,
`<select>` or `contenteditable` host are ignored, so typing "d" into a form cannot trigger a
download. `preventDefault()` is called only on a real match.

`shortcut: false` disables everything. `shortcut: {}` is the same as omitting it.

```ts
import { initTelemetry } from '@codewithrajat/rm-logvault';

initTelemetry({
  appName: 'admin',
  shortcut: {
    key: 'j',
    ctrl: true,
    shift: true,
    alt: false,
    meta: false,
    allow: () => window.sessionStorage.getItem('@codewithrajat/rm-logvault-debug') === '1',
    filenamePrefix: 'admin-report',
    onExported: (ok) => console.info(ok ? 'report downloaded' : 'report failed'),
  },
});
```

---

## 10. Invalid-value rules

Everything below is implemented in `resolveOptions` and its helpers in `src/core/config.ts`.

### `positiveNumber(input, fallback, { allowZero, integer })`

| Input                           | `allowZero: false` (default) | `allowZero: true` |
|---------------------------------|------------------------------|-------------------|
| `5`                             | `5`                          | `5`               |
| `5.7` with `integer: true`      | `5`                          | `5`               |
| `5.7` without `integer`         | `5.7`                        | `5.7`             |
| `0`                             | **fallback**                 | `0`               |
| `-1`, `-0.5`                    | **fallback**                 | **fallback**      |
| `NaN`, `Infinity`, `-Infinity`  | **fallback**                 | **fallback**      |
| `'50'` (string)                 | **fallback**                 | **fallback**      |
| `null`, `undefined`, `{}`, `[]` | **fallback**                 | **fallback**      |
| `true`                          | **fallback**                 | **fallback**      |

Which options use which mode:

| Option                      | `allowZero` | `integer` |
|-----------------------------|-------------|-----------|
| `errors.maxRecords`         | no          | yes       |
| `errors.retentionDays`      | **yes**     | no        |
| `errors.maxPayloadBytes`    | no          | yes       |
| `errors.maxEventsPerMinute` | **yes**     | yes       |
| `logs.maxRecords`           | no          | yes       |
| `logs.retentionDays`        | **yes**     | no        |
| `logs.maxPayloadBytes`      | no          | yes       |
| `logs.maxLogsPerMinute`     | **yes**     | yes       |
| `rest.intervalMs`           | no          | yes       |
| `rest.batchSize`            | no          | yes       |
| `openTimeoutMs`             | no          | yes       |
| `logs.writeFlushMs`         | no          | yes       |
| `logs.writeBatchSize`       | no          | yes       |

### `nonEmptyString(input, fallback)`

`undefined` for a non-string, an empty string, or a whitespace-only string (trimmed first).
Otherwise the **trimmed** value. Used for `appName`, `appVersion`, `buildId`, `environment`,
`dbPrefix`, `rest.errorsUrl`, `rest.logsUrl`, `shortcut.key` and `shortcut.filenamePrefix`.

Note `'  '` for `dbPrefix` therefore falls back to `'rm-logvault'` rather than producing a database
named `"  -errors"`.

### `regexList` / `keyList` / `stringList`

| Helper       | Keeps                                         | Drops                                |
|--------------|-----------------------------------------------|--------------------------------------|
| `regexList`  | `instanceof RegExp` entries                   | strings, invalid entries, non-arrays |
| `keyList`    | non-empty-index `string` and `RegExp` entries | everything else                      |
| `stringList` | non-empty strings                             | empty strings, numbers, non-arrays   |

A non-array input to any of them yields `[]`, never an error.

### `normalizeLevel`

Trims, lowercases, and validates against the closed set
`{ trace, debug, info, warn, error, off, none, silent }`. `none` and `silent` become `'off'`.
Anything else returns `undefined`, and the caller keeps the previous level.

The resolution order for `logs.level` — the **persist** threshold — is:

```text
logs.level option  →  LOG_PERSIST_LEVEL  →  TELEMETRY_PERSIST_LEVEL  →  TELEMETRY_LOG_LEVEL
                   →  LOG_LEVEL (the documented inheritance)  →  'warn'
```

An invalid `logs.level` **falls through to the env layer**, not straight to the default, and the
legacy `TELEMETRY_LOG_LEVEL` sits ahead of the `LOG_LEVEL` inheritance so an existing deployment
keeps its persist level. Note that `TELEMETRY_LOG_LEVEL` has always meant the persist level: it never
sets the console one.

The console level has its own, shorter chain and **no default at all**:

```text
logs.consoleLevel option  →  LOG_LEVEL  →  undefined  (leave the logger's own level alone)
```

That is deliberate: `initTelemetry` must never change console output unless it was asked to, so
`logger.setLevel(...)` stays the runtime control. `destroyTelemetry()` resets the console level to
the factory `'warn'`, because teardown leaves no trace.

Every other numeric option resolves the same way: **explicit option ?? its environment variable ??
built-in default**, where `??` means an invalid explicit value is ignored and the environment is
consulted next.

### Booleans

Every boolean option uses `??`-style resolution: a non-boolean value is ignored and the fallback is
used. Unlike numbers there is no coercion — the string `'false'` is not `false`. That is why the
`fromEnv` boolean parser exists: it converts the string forms before they become options.

`fromEnv` accepts `true`/`1`/`yes`/`on` and `false`/`0`/`no`/`off`, case-insensitively and trimmed.
`'maybe'`, `''` and `'2'` are ignored, leaving the field absent from the `EnvOptions` object.

### What is _not_ defaulted

The callback and object fields have no meaningful default and stay `undefined` when omitted or of
the wrong type: `consent`, `onInternalError`, `errors.beforeCapture`, `logs.beforeStore`,
`rest.getHeaders`, `rest.onTerminalFailure`, `shortcut.target`, `shortcut.allow`,
`shortcut.onExported`, `repository`, `logSource` and `rest.transport`.

---

## 11. Reading the resolved configuration back

```ts
import { resolveOptions, databaseNames, DEFAULT_OPTIONS } from '@codewithrajat/rm-logvault';

const resolved = resolveOptions({
  appName: 'checkout',
  env: true,
  errors: { maxRecords: -5, captureCsp: true },
  logs: { level: 'silent' },
});

resolved.errors.maxRecords; // 500   — the negative value was ignored
resolved.logs.level; // 'off' — 'silent' normalised
resolved.errors.captureCsp; // true
resolved.rest.enabled; // false — no URL, no transport
resolved.shortcut; // { key: 'd', ctrl: true, shift: true, alt: true, meta: false, … }

databaseNames(resolved.dbPrefix); // { errors: 'rm-logvault-errors', logs: 'rm-logvault-logs' }
DEFAULT_OPTIONS.errors.maxRecords; // 500
```

`resolved` and each group are frozen, so this is a read-only view. `getState().options` returns the
configuration of the _live_ installation (or `null` before init / after destroy), which is the one
you want inside an `onInternalError` callback.

---

## 12. Presets

### Minimal

```ts
import { initTelemetry } from '@codewithrajat/rm-logvault';

initTelemetry({ appName: 'checkout' });
```

Everything else is already sensible: errors and logs captured, persisted to `rm-logvault-errors` and
`rm-logvault-logs`, 7-day and 3-day retention, `warn` persist level, no uploads, shortcut enabled.

### Production

The recommended starting point for a shipped app: identity for correlation, both endpoints, a
slightly higher error cap, chunk and CSP visibility, and a console level that stays quiet.

```ts
import { initTelemetry, logger } from '@codewithrajat/rm-logvault';

initTelemetry({
  appName: 'checkout',
  appVersion: '2.4.1',
  buildId: import.meta.env.VITE_BUILD_ID,
  environment: import.meta.env.MODE,
  dbPrefix: 'rm-logvault',

  errors: {
    enabled: true,
    maxRecords: 1000,
    retentionDays: 14,
    maxEventsPerMinute: 200,
    captureChunkErrors: true,
    captureResources: true,
    captureCsp: true,
  },

  logs: {
    enabled: true,
    level: 'warn',
    maxRecords: 3000,
    retentionDays: 7,
    maxLogsPerMinute: 600,
    captureConsole: false,
  },

  rest: {
    errorsUrl: '/telemetry/errors',
    logsUrl: '/telemetry/logs',
    intervalMs: 30_000,
    batchSize: 50,
    credentials: 'same-origin',
    requireHttps: true,
    getHeaders: async () => ({ Authorization: `Bearer ${await getAccessToken()}` }),
    onTerminalFailure: (status) => {
      if (status === 401) void refreshSession();
    },
  },

  shortcut: { allow: () => isInternalUser() },
});

logger.setLevel('error');
```

What it changes and why: `buildId` and `environment` make a report attributable to a deploy;
`captureChunkErrors` (already on) plus `captureResources` catch stale-tab deploy failures;
`captureCsp` catches policy regressions; `requireHttps: true` fails closed on a misconfigured
`http://` endpoint; `getHeaders` keeps the token fresh; `onTerminalFailure` turns a `401` from a
silent data loss into a re-auth trigger; and `logger.setLevel('error')` keeps the production console
quiet while `logs.level: 'warn'` keeps persistence where you want it.

### Staging with everything on

For exercising every code path on a real deploy. Expect noise.

```ts
import { initTelemetry, logger } from '@codewithrajat/rm-logvault';

initTelemetry({
  appName: 'checkout',
  appVersion: '2.4.1-staging',
  buildId: 'local',
  environment: 'staging',
  dbPrefix: 'rm-logvault-staging',

  errors: {
    enabled: true,
    maxRecords: 5000,
    retentionDays: 30,
    maxPayloadBytes: 32_768,
    maxEventsPerMinute: 600,
    preventDefaultUnhandledRejection: true,
    captureResources: true,
    captureCsp: true,
    captureChunkErrors: true,
    beforeCapture: (record) => {
      // Local debug breadcrumb: keep everything, but tag the harness.
      return { ...record, tags: { ...(record.tags ?? {}), harness: 'staging' } };
    },
  },

  logs: {
    enabled: true,
    level: 'trace',
    maxRecords: 20_000,
    retentionDays: 14,
    maxPayloadBytes: 16_384,
    maxLogsPerMinute: 6000,
    captureConsole: true,
  },

  redaction: {
    extraSensitiveKeys: ['x-debug-tenant'],
  },

  rest: {
    errorsUrl: 'http://localhost:8787/telemetry/errors',
    logsUrl: 'http://localhost:8787/telemetry/logs',
    intervalMs: 5_000,
    batchSize: 20,
    credentials: 'include',
    requireHttps: false,
  },

  shortcut: {
    key: 'd',
    ctrl: true,
    shift: true,
    alt: true,
    filenamePrefix: 'staging-report',
    onExported: (ok) => logger.info('[Staging] report exported', { ok }),
  },

  onInternalError: (stage, error) => {
    logger.error(`[Telemetry] ${stage}`, error);
  },
});

logger.setLevel('trace');
```

What it changes and why: a separate `dbPrefix` keeps staging data out of a developer's production
vault on the same origin; `level: 'trace'` plus `captureConsole: true` means every call site is
persisted; `preventDefaultUnhandledRejection: true` surfaces rejections that a browser would
otherwise swallow into the console; a 5-second interval and batch size 20 make uploads observable in
real time; `onInternalError` promotes the library's own failures to visible log lines;
`requireHttps` stays `false` so a local server works.

### GDPR-strict

Nothing is stored until consent is granted, the allow-list is empty, retention is short, and there
is no network egress at all.

```ts
import { initTelemetry } from '@codewithrajat/rm-logvault';

const CONSENT_KEY = 'telemetry-consent'; // 'granted' | 'denied'

function hasConsent(): boolean {
  try {
    return window.localStorage.getItem(CONSENT_KEY) === 'granted';
  } catch {
    return false; // storage blocked → no consent evidence → no processing
  }
}

initTelemetry({
  appName: 'checkout',
  environment: 'production',

  // Evaluated before every capture, persist and upload. A `false` drops silently.
  consent: hasConsent,

  errors: {
    enabled: true,
    maxRecords: 200,
    retentionDays: 1,
    maxPayloadBytes: 8_192,
    maxEventsPerMinute: 60,
    // Keep no query values at all.
    allowedQueryParams: [],
    captureResources: false,
    captureCsp: false,
  },

  logs: {
    enabled: true,
    level: 'error', // errors only — no informational detail about user behaviour
    maxRecords: 500,
    retentionDays: 1,
    maxPayloadBytes: 2_048,
    maxLogsPerMinute: 120,
    captureConsole: false,
  },

  redaction: {
    extraSensitiveKeys: ['email', 'phone', 'fullname', 'address', 'ip', 'x-user-id'],
    extraPatterns: [
      /\b[A-Z]{2}\d{2}[A-Z0-9]{10,30}\b/g, // IBAN-ish
      /\b(?:\d[ -]*?){13,19}\b/g, // card-ish
    ],
    allowedQueryParams: [],
  },

  // No endpoints: the vault never leaves the device.
  rest: { enabled: false },

  shortcut: { allow: () => hasConsent() },
});
```

What it changes and why: `consent` is the gate, and it is re-evaluated on every capture, every
persist and every flush rather than sampled once, so a revocation stops egress immediately; an empty
`allowedQueryParams` in both places
removes the last value-preserving rule, so _every_ query value becomes `[REDACTED]`; one-day
retention with low caps minimises the stored set; `level: 'error'` avoids persisting a behavioural
trail; `rest.enabled: false` makes the "no egress" claim structural rather than aspirational; extra
patterns cover the identifier shapes a generic key-name match would miss; and the shortcut is gated
on the same consent flag so a report cannot be produced for a user who declined.

Pair this with `clearTelemetryData()` on revocation and `exportDiagnosticsReport({ format: 'json' })`
for access requests. See [PRIVACY-GDPR.md](PRIVACY-GDPR.md).

### Air-gapped / offline-only

Storage-rich, upload-free. For regulated environments, kiosks, or shipping a build with no
`connect-src` at all.

```ts
import { initTelemetry } from '@codewithrajat/rm-logvault';

initTelemetry({
  appName: 'kiosk',
  appVersion: '1.0.0',
  environment: 'air-gapped',
  dbPrefix: 'kiosk-blackbox',

  errors: {
    enabled: true,
    maxRecords: 5_000,
    retentionDays: 30,
    maxPayloadBytes: 32_768,
    maxEventsPerMinute: 300,
    captureResources: true,
    captureCsp: true,
    captureChunkErrors: true,
  },

  logs: {
    enabled: true,
    level: 'info',
    maxRecords: 20_000,
    retentionDays: 30,
    maxPayloadBytes: 8_192,
    maxLogsPerMinute: 1_200,
  },

  // The one line that matters: no endpoints, and uploads explicitly off.
  // `rest.enabled` already defaults to false without a URL or transport,
  // but stating it is what makes the intent auditable.
  rest: { enabled: false },

  shortcut: {
    filenamePrefix: 'kiosk-report',
    onExported: (ok) => console.info('[Kiosk] report', ok ? 'saved' : 'failed'),
  },
});
```

What it changes and why: generous retention and caps, because IndexedDB is the only place the
evidence will ever live and a technician collects it on a visit; `level: 'info'` because there is no
network cost to detail; `captureResources` and `captureCsp` because a kiosk usually runs with a
strict policy and a failed asset load is a hard failure; and `rest.enabled: false` stated
explicitly. `isSyncConfigured(resolveOptions({ rest: { enabled: false } }))` returns `false`, the
sync manager never starts, and the only network egress the library has is therefore never used.

If you also want to be certain at build time, note that `requireHttps` is irrelevant here — there is
no endpoint to validate — so assert it in a test instead:

```ts
import { expect, test } from 'vitest';
import { resolveOptions, isSyncConfigured } from '@codewithrajat/rm-logvault';

test('the kiosk build never uploads', () => {
  expect(isSyncConfigured(resolveOptions({ rest: { enabled: false } }))).toBe(false);
});
```
