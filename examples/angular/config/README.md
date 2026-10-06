# config — Angular (standalone)

**Problem it solves:** the same build has to behave differently in development, staging and production
without editing source — so the integration has to read options from a build-time layer, and you need to
know exactly which value wins when two of them disagree.

**What you will learn:**

- The precedence rule: **nested option > flat alias > environment > built-in default**.
- The options that matter, with their **unit** and their **default**.
- Why an invalid value is ignored rather than applied, and how that lets a value *fall through*.
- Why Angular needs a different answer from Vite or Next.js for build-time values, and what to use.

## The precedence rule

One rule decides every option:

| Layer | Supplied by | Wins over |
| --- | --- | --- |
| **Nested option** | `initTelemetry({ logs: { level: 'info' } })` | everything below |
| **Flat alias** | `initTelemetry({ level: 'info' })`, or `setupTelemetry({ level: 'info' })` | environment and defaults only |
| **Environment** | `initTelemetry({ env: true })`, or `env: 'SOME_PREFIX_'` | defaults only |
| **Built-in default** | `DEFAULT_OPTIONS` | nothing |

```ts
import { initTelemetry } from '@codewithrajat/rm-logvault';

// An explicit option always beats the environment layer.
initTelemetry({
  env: true,
  appName: 'checkout',                 // explicit: wins whatever the environment says
  errors: { maxRecords: 1_000 },       // explicit: wins over the environment
});
```

A **flat alias** is a shorthand for one nested option — `level` is `logs.level`, `url` feeds both
`rest.errorsUrl` and `rest.logsUrl` — so it sits above the environment but below the nested form. The
rule runs inside-out, which is what makes the two forms safe to mix. The full mapping is in
[environment variables](./01-environment-variables.md#the-flat-aliases--the-short-form-of-the-same-options).

`env: true` uses the default prefixes `['VITE_', 'NEXT_PUBLIC_', 'REACT_APP_']`. Pass a string or an
array to pin your own — `env: 'APP_'` or `env: ['APP_', 'PUBLIC_']`. The first non-empty match wins.

> **Do not spread `fromEnv()` into the options object.** It returns a *flat* object
> (`errorsEnabled`, `logsMaxRecords`, `errorsUrl`, …) while the environment layer is read only through
> `options.env`. A spread therefore carries just the six top-level identity fields — `appName`,
> `appVersion`, `buildId`, `environment`, `enabled`, `dbPrefix` — and silently drops every nested one.
> Use `env:` to apply the whole environment, or `fromEnv()` when you want to read and place values:
>
> ```ts
> import { fromEnv, initTelemetry } from '@codewithrajat/rm-logvault';
>
> const env = fromEnv('APP_');
> initTelemetry({ appName: env.appName, errors: { maxRecords: env.errorsMaxRecords } });
> ```

## Invalid values are ignored, not applied

A typo must never be able to change behaviour into something worse:

- A non-numeric, `NaN`, `Infinity` or negative numeric is **ignored** and the default is used.
- `maxRecords: 0` is treated as a **mistake**, not as "store nothing" — silently disabling retention is
  the surprising outcome. Store nothing with `errors.enabled: false` instead.
- `0` **is** meaningful for `retentionDays` (no age-based deletion) and for the two rate limits
  (unlimited).
- An unrecognised log level is ignored, keeping the previous level. Valid strings are `trace`, `debug`,
  `info`, `warn`, `error`, and the disable synonyms `off`, `none`, `silent` (all normalised to `'off'`).

## The options that matter

**Top level**

| Option | Type | Unit | Default | What it decides |
| --- | --- | --- | --- | --- |
| `appName` | `string` | — | none | Stamped onto every record. No default, because a guess is worse than nothing. |
| `appVersion` / `buildId` / `environment` | `string` | — | none | Identity, carried into every record and upload. |
| `enabled` | `boolean` | — | `true` | Master switch. `false` captures and installs nothing. |
| `mode` | `'local' \| 'remote'` | — | derived | `'remote'` when uploads are enabled, otherwise `'local'`. An explicit value always wins. |
| `dbPrefix` | `string` | — | `'rm-logvault'` | Database names become `${dbPrefix}-errors` and `${dbPrefix}-logs`. Changing it points at a **different** database; rows are not migrated. |
| `openTimeoutMs` | `number` | milliseconds | `5000` | How long to wait for an IndexedDB open before declaring storage unavailable. Raise it on a slow device or when another tab holds an upgrade open. Minimum `1`. |
| `rest` | `RestOptions` | — | see below | Upload configuration. |

**`errors.*` and `logs.*`** — two independent stores

| Option | Unit | Default | What it decides |
| --- | --- | --- | --- |
| `errors.enabled` | boolean | `true` | Capture errors at all. |
| `errors.retentionDays` | days | `7` | Age limit; `0` disables it. |
| `errors.maxRecords` | rows | `500` | Count cap; `0` is rejected. |
| `errors.maxPayloadBytes` | UTF-8 bytes | `16384` | Per-record budget before the reduction ladder. |
| `errors.maxEventsPerMinute` | events / 60 s | `120` | Rate limit; `0` disables it. |
| `errors.captureCsp` | boolean | `false` | Listen for `securitypolicyviolation`. |
| `errors.captureResources` | boolean | `false` | Capture-phase listener for failed `<script>`/`<link>`/`<img>` loads. |
| `errors.captureChunkErrors` | boolean | `true` | Treat dynamic-import failures as `source: 'chunk'`. |
| `logs.enabled` | boolean | `true` | Persist logs at all. |
| `logs.level` | level | `'warn'` | The **persist** threshold. |
| `logs.consoleLevel` | level | **none** | The **console** threshold. No default, so init never changes console output on its own. |
| `logs.retentionDays` | days | `3` | Age limit; `0` disables it. |
| `logs.maxRecords` | rows | `2000` | Count cap. |
| `logs.maxPayloadBytes` | UTF-8 bytes | `4096` | Per-record budget. |
| `logs.maxLogsPerMinute` | logs / 60 s | `600` | Rate limit; `0` disables it. |
| `logs.writeFlushMs` | milliseconds | `1000` | How long a buffered log may sit in memory before it is written. A **durability** window: a crash inside it loses that log. |
| `logs.writeBatchSize` | entries | `50` | The buffered count that triggers an immediate write. |
| `logs.captureConsole` | boolean | `false` | Wrap `console.warn`/`console.error` so existing calls are captured. Changes a global. |

**`rest.*`** — uploads

| Option | Unit | Default | What it decides |
| --- | --- | --- | --- |
| `rest.errorsUrl` / `rest.logsUrl` | — | none | One endpoint per kind. Supplying either implies `mode: 'remote'`. |
| `rest.enabled` | boolean | `true` when a URL or transport exists | Turn uploads off while leaving the URLs configured. |
| `rest.intervalMs` | milliseconds | `30000` | Delay between flush runs after a success. |
| `rest.batchSize` | records | `50` | Records per request. |
| `rest.credentials` | `'omit' \| 'same-origin' \| 'include'` | `'same-origin'` | `fetch` credentials mode. `'include'` is never implied. |
| `rest.requireHttps` | boolean | `false` | Reject plain `http:` endpoints except on localhost. |

Every remaining option — redaction extensions, the shortcut, `beforeCapture`/`beforeStore`, `consent`,
`onInternalError` — is documented with its boundaries in
[docs/API.md](../../../docs/API.md#every-option-annotated).

## Build-time values in Angular

Angular has **no built-in environment file for the browser bundle**, and no `import.meta.env`.

> **Source note.** `fromEnv()` reads `import.meta.env` first and `process.env` second. A stock Angular
> browser build populates neither, so `initTelemetry({ env: true })` finds nothing and every option
> falls back to its default — silently. This is not a bug in the environment layer; it is what "there is
> no environment layer here" looks like.

The idiomatic Angular answer is its own build-time substitution, and either shape is fine:

```ts
// src/environments/environment.ts  (swapped per configuration by fileReplacements)
export const environment = {
  appVersion: '2.4.1',
  environment: 'development',
  errorsRetentionDays: 7,
  errorsMaxRecords: 500,
  logsPersistLevel: 'info' as const,
  errorsUrl: '/api/telemetry/errors',
  logsUrl: '/api/telemetry/logs',
};
```

```ts
// src/main.ts
import { initTelemetry } from '@codewithrajat/rm-logvault';
import { provideTelemetryErrorHandler } from '@codewithrajat/rm-logvault/angular';
import { environment } from './environments/environment';
import { AppComponent } from './app/app.component';

initTelemetry({
  appName: 'checkout',
  appVersion: environment.appVersion,
  environment: environment.environment,
  errors: {
    retentionDays: environment.errorsRetentionDays,
    maxRecords: environment.errorsMaxRecords,
  },
  logs: { level: environment.logsPersistLevel },
  rest: { errorsUrl: environment.errorsUrl, logsUrl: environment.logsUrl },
});

bootstrapApplication(AppComponent, { providers: [provideTelemetryErrorHandler()] });
```

`angular.json` swaps the file per configuration:

```json
"configurations": {
  "production": {
    "fileReplacements": [
      { "replace": "src/environments/environment.ts", "with": "src/environments/environment.production.ts" }
    ]
  }
}
```

If you would rather keep the environment-variable spelling, generate a small module at build time and
read it the same way — but the values still arrive as explicit options, because that is the only path
that exists in an Angular bundle. Variable names, units and defaults, should you want that generation
step, are in [01-environment-variables.md](./01-environment-variables.md).

## What this tier deliberately does not cover

- **Replacing the store or the transport, and the factory-provider reasoning.**
  [more-advanced](../more-advanced/README.md).

## Next

- [Levels and thresholds](./03-levels-and-thresholds.md) — the two level settings, why `logger.info` is
  quiet by default, and the rate limits that can drop a record.
- The variable names and units, if you generate them at build time:
  [01-environment-variables.md](./01-environment-variables.md).
- Everything at once: [docs/API.md](../../../docs/API.md#every-option-annotated).
