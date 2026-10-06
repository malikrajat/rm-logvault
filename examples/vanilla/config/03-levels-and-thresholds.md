# Levels and thresholds — why your logs are not in the report

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

| Setting | Default | Controls | Where |
| --- | --- | --- | --- |
| `logs.consoleLevel` | `'warn'` | What the **logger facade prints** to DevTools | Options |
| `logs.level` | `'warn'` | What is **persisted** — and therefore in the report and the upload | Options |

Both effective defaults are `'warn'`, so at this tier:

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
initTelemetry({
  appName: 'checkout',
  logs: {
    consoleLevel: 'info', // printed from 'info' up
    level: 'info', // persisted from 'info' up
  },
});
```

> **Source note.** `logs.consoleLevel` is documented with a default of `"none"`, but omitting it leaves
> the logger's internal level, which is `'warn'` — so the effective default is the `'warn'` every table
> on this page reports. The mechanism matters: the option resolves to `undefined` when unset, and
> `initTelemetry` applies it only when it is defined. Initialising telemetry therefore never changes
> your console output on its own, and a consumer who supplied their own `logSource` keeps whatever
> verbosity they already had.

The levels, lowest to highest, are `'trace' | 'debug' | 'info' | 'warn' | 'error'`. Both settings also
accept `'off'` — spelled `none` or `silent`, which are normalised to `'off'` — and `'off'` on
`logs.level` is how you stop persisting logs entirely without touching `logs.enabled`.

## The recipe this page exists for

The exact shape that makes the probe you were writing actually work. It is one button and one
listener, and there is still no framework in sight:

```html
<!-- index.html -->
<button type="button" id="probe">Log a probe</button>
```

```ts
import { logger } from '@codewithrajat/rm-logvault';

document.querySelector('#probe')?.addEventListener('click', () => {
  logger.info('[checkout] info probe'); // printed and persisted, now that both are 'info'
  logger.warn('[checkout] warn probe'); // was already working
});
```

With `consoleLevel: 'info'` and `level: 'info'`, both lines appear in DevTools, both are stored, and
both show up in the report from <kbd>Ctrl</kbd>+<kbd>Shift</kbd>+<kbd>Alt</kbd>+<kbd>D</kbd>. Change only
one and the difference is visible immediately: `consoleLevel` alone gives you a printed line and an
empty report.

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
| Error rate | `errors.maxEventsPerMinute` | `120` | errors per 60 s window |
| Log rate | `logs.maxLogsPerMinute` | `600` | logs per 60 s window |
| Error record size | `errors.maxPayloadBytes` | `16384` | UTF-8 bytes per record |
| Log record size | `logs.maxPayloadBytes` | `4096` | UTF-8 bytes per record |
| Log write flush | `logs.writeFlushMs` / `logs.writeBatchSize` | `1000` / `50` | ms / entries |

The rate limits are fixed 60-second windows, and `0` disables either one. A loop that logs on every
animation frame is the classic way to hit `logs.maxLogsPerMinute`, and hitting it looks exactly like
"the library stopped recording" — because for the rest of the window, it did.

Which limit bites first is worth knowing before you raise any of them:

- **The rate limit drops the record entirely.** Nothing is stored, so nothing is in the report.
- **`maxPayloadBytes` reduces the record instead of dropping it.** The record survives, with fields
  trimmed from the bottom of a documented ladder. A record that looks thinner than you expected is a
  budget being applied, not a bug.

If you are changing these, read
[retention and payload budgets](../advanced/02-retention-and-payload-budgets.md) first — it explains the
ladder and which limit deletes a row before the other.

## Configuring it from the environment instead

Every setting on this page has an environment variable, which is usually the right place for
per-environment verbosity:

| Variable | Option | Notes |
| --- | --- | --- |
| `VITE_LOG_LEVEL` | `logs.consoleLevel` | The console threshold. |
| `VITE_LOG_PERSIST_LEVEL` | `logs.level` | The persist threshold; an **empty** value inherits `VITE_LOG_LEVEL`. |
| `VITE_LOG_PERSIST_MAX_PAYLOAD_BYTES` | `logs.maxPayloadBytes` | Per record, in bytes. |
| `VITE_ERROR_TRACKING_MAX_PAYLOAD_BYTES` | `errors.maxPayloadBytes` | Per record, in bytes. |

```bash
# Development: chattier than production, in the console AND in the store
VITE_LOG_LEVEL=debug          # -> logs.consoleLevel
VITE_LOG_PERSIST_LEVEL=debug  # -> logs.level
```

Nothing is read unless you opt in with `initTelemetry({ env: true })` (which tries the prefixes
`'VITE_'`, `'NEXT_PUBLIC_'` and `'REACT_APP_'`, in that order) or pin one with `env: 'VITE_'`. The full
table, the parsing rules and the precedence order are in
[environment variables](./02-environment-variables.md).

## Try it yourself

1. Leave the defaults and wire three buttons to `logger.info('[probe]')`, `logger.warn('[probe]')` and
   `logger.error('[probe]')`.
2. Download the report. Only the `warn` and `error` lines are in it.
3. Add `logs: { consoleLevel: 'info', level: 'info' }` and repeat. All three are now in DevTools and in
   the report.
4. Add `logs.captureConsole: true` and call `console.error('[probe] from the console')`. It appears as a
   log record — with a message and no stack.

## Related

- [config](./README.md) — every option, with its unit and default.
- [options at a glance](./01-options-at-a-glance.md) — the same surface as one table.
- [the capture recipes](../basic/01-capture-recipes.md) — the four ways an *error* gets recorded.
- [what arrives at your collector](../advanced/02-what-arrives-at-the-collector.md) — what these log
  records look like once they are uploaded.
