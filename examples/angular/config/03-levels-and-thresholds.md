# Levels and thresholds — why your logs are not in the report (Angular)

**Problem it solves:** you wrote `logger.info('[checkout] info probe')`, saw nothing happen, and
concluded the library is broken. It is not: printing and storing are two separate decisions with two
separate thresholds, and the defaults are quiet on purpose. This page is the smallest configuration
that makes a log line visible in both places.

**What you will learn:**

- The two thresholds, which one controls which destination, and why they are separate.
- The exact options to change, with units and defaults.
- How to capture `console.*` calls the library did not make.
- The rate limits and payload budgets that can silently drop a record once logging is on.

## The two thresholds

There are two independent level settings, and the confusion between them is the single most common
configuration mistake at this tier:

| Setting | Effective default | Controls | Where |
| --- | --- | --- | --- |
| `logs.consoleLevel` | `'warn'` | What the **logger facade prints** to DevTools | Options |
| `logs.level` | `'warn'` | What is **persisted** — and therefore in the report and the upload | Options |

Both behave as `'warn'` at this tier, so:

| Call | Printed to DevTools | Persisted |
| --- | --- | --- |
| `logger.debug(…)` | No | No |
| `logger.info(…)` | **No** | **No** |
| `logger.warn(…)` | Yes | Yes |
| `logger.error(…)` | Yes | Yes |
| `captureError(…)` | No | Yes |

`logger.info(…)` is not a broken probe — it is a probe that both thresholds filter out. Two lines fix
that, and you need **both**, because changing one leaves the other destination empty:

```ts
// src/main.ts
import { bootstrapApplication } from '@angular/platform-browser';
import { initTelemetry } from '@codewithrajat/rm-logvault';
import { provideTelemetryErrorHandler } from '@codewithrajat/rm-logvault/angular';
import { AppComponent } from './app/app.component';

initTelemetry({
  appName: 'checkout',
  logs: {
    consoleLevel: 'info', // printed from 'info' up
    level: 'info', // persisted from 'info' up
  },
});

bootstrapApplication(AppComponent, { providers: [provideTelemetryErrorHandler()] });
```

> **Source note.** `logs.consoleLevel` is documented with a default of "none", and it resolves to
> `undefined` when you do not set it. `initTelemetry` only applies it when it is defined, so
> initialising telemetry never changes console output on its own — the logger keeps its internal level,
> which is `'warn'`. That distinction matters if you supply your own `logSource`: you keep whatever
> verbosity you had. The effective default is still `'warn'`, which is what every table here reports.

The levels, lowest to highest, are `'trace' | 'debug' | 'info' | 'warn' | 'error'`, plus `'off'` for the
two settings that accept a level. `'none'` and `'silent'` are accepted as synonyms and normalised to
`'off'`; `'off'` on `logs.level` is how you stop persisting logs without touching `logs.enabled`.

## The recipe this page exists for

The exact shape that makes the probe you were writing actually work:

```ts
// src/app/log-probe.component.ts
import { Component } from '@angular/core';
import { logger } from '@codewithrajat/rm-logvault';

@Component({
  selector: 'app-log-probe',
  template: `<button type="button" (click)="probe()">Log a probe</button>`,
})
export class LogProbeComponent {
  public probe(): void {
    logger.info('[checkout] info probe'); // printed and persisted, now that both are 'info'
    logger.warn('[checkout] warn probe'); // was already working
  }
}
```

With `consoleLevel: 'info'` and `level: 'info'`, both lines appear in DevTools, both are stored, and both
show up in the report from <kbd>Ctrl</kbd>+<kbd>Shift</kbd>+<kbd>Alt</kbd>+<kbd>D</kbd>. Change only one
and the difference is visible immediately: `consoleLevel` alone gives you a printed line and an empty
report.

## Capturing `console.*` calls you did not make

`console.error('[checkout] console probe')` is not a `logger` call at all — it is the platform's. The
library can adopt it, but this is **off by default** and it takes two switches, because wrapping
`console` is invasive:

```ts
initTelemetry({
  appName: 'checkout',
  logs: {
    enabled: true, // switch 1: persistence must be on
    captureConsole: true, // switch 2: the opt-in
    level: 'info',
  },
});
```

Both conditions are required by design. With `logs.enabled: false` there is nowhere to put a captured
console call, so `captureConsole: true` does nothing.

What it wraps, and how it behaves:

| Behaviour | Detail |
| --- | --- |
| Levels wrapped | `console.warn` and `console.error` — **not** `console.log` or `console.info`. |
| Order | The original method runs **first**, with the caller's `this`, so DevTools output is unchanged. |
| Recursion | Guarded: a message emitted while already ingesting one is dropped, so it cannot loop. |
| Restore | `destroyTelemetry()` puts the originals back, and only if the property is still its wrapper. |
| Level filtering | A captured `console.warn` still has to pass `logs.level` to be persisted. |

That last row is the one that surprises people: `captureConsole: true` does **not** bypass the persist
threshold. If you want a captured `console.warn` to reach your collector, `logs.level` must be `'warn'`
or lower — which the default already satisfies.

> **Source note.** A captured console call is filed as a **log**, not an error, and it carries no stack.
> It is evidence that something was printed, not a replacement for `captureError`. If a line matters
> enough to page someone, capture it as an error.

## The budgets that can drop a record after you enable logging

Turning logging on raises the volume, and two ceilings then become relevant. Neither is a crash; both
are silent by design, and both are reported through `onInternalError`.

| Limit | Option | Default | Unit |
| --- | --- | --- | --- |
| Error rate | `errors.maxEventsPerMinute` | `120` | errors per fixed 60 s window |
| Log rate | `logs.maxLogsPerMinute` | `600` | logs per fixed 60 s window |
| Error record size | `errors.maxPayloadBytes` | `16384` | UTF-8 bytes per record |
| Log record size | `logs.maxPayloadBytes` | `4096` | UTF-8 bytes per record |
| Log write flush | `logs.writeFlushMs` / `logs.writeBatchSize` | `1000` / `50` | ms / entries |

The rate limits are fixed 60-second windows and `0` disables either one. A method that logs on every
change-detection pass is the classic way to hit `logs.maxLogsPerMinute`, and hitting it looks exactly
like "the library stopped recording" — because for the rest of the window, it did.

Which limit bites first is worth knowing before you raise any of them:

- **The rate limit drops the record entirely.** Nothing is stored, so nothing is in the report.
- **`maxPayloadBytes` reduces the record instead of dropping it.** The record survives, with fields
  trimmed from a documented ladder at the bottom of it. A record that looks thinner than you expected
  is a budget being applied, not a bug.

If you are changing these, read
[retention and payload budgets](../../vanilla/advanced/02-retention-and-payload-budgets.md) first — it
explains the ladder and which limit deletes a row before the other.

## Configuring it from the environment instead

In Angular there is **no environment layer in a browser build** and no `import.meta.env`, so `fromEnv()`
finds nothing and every option falls back to its default — that is
[the config tier's subject](../config/README.md), and its answer is
`src/environments/environment.ts` swapped by `fileReplacements`. Vendored variable names still matter if
you generate a config module at build time, and two of them are easy to mix up:

```bash
# Development: chattier than production, in the console AND in the store
LOG_LEVEL=debug          # -> logs.consoleLevel
LOG_PERSIST_LEVEL=debug  # -> logs.level
```

`LOG_LEVEL` sets the **console** level; `LOG_PERSIST_LEVEL` sets the **persist** level, and an empty
value there inherits the console one. The `VITE_`-style prefixes are irrelevant here — a prefix is a
lookup prefix for `fromEnv()`, not part of the name. The other two names on this page are
`LOG_PERSIST_MAX_PAYLOAD_BYTES` and `ERROR_TRACKING_MAX_PAYLOAD_BYTES`; the full table, with units and
parsing rules, is in [environment variables](../config/01-environment-variables.md).

## Try it yourself

1. Leave the defaults and call `logger.info('[probe]')`, `logger.warn('[probe]')` and
   `logger.error('[probe]')` from three buttons in one component.
2. Download the report. Only the `warn` and `error` lines are in it.
3. Add `logs: { consoleLevel: 'info', level: 'info' }` to `initTelemetry` in `src/main.ts` and repeat.
   All three are now in DevTools and in the report.
4. Add `logs.captureConsole: true` and call `console.error('[probe] from the console')`. It appears as a
   log record — with a message and no stack.

## Related

- [config](./README.md) — every option, with its unit and default.
- [the capture recipes](../basic/01-capture-recipes.md) — the four ways an *error* gets recorded.
- [what arrives at your collector](../advanced/02-what-arrives-at-the-collector.md) — what these log
  records look like once they are uploaded.
