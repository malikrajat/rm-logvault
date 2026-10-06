# Levels and thresholds — why your logs are not in the report

**Problem it solves:** you wrote `logger.info('[checkout] info probe')` in a client component, saw nothing
happen, and concluded the library is broken. It is not: printing and storing are two separate decisions
with two separate thresholds, and the defaults are quiet on purpose. This page is the smallest
configuration that makes a log line visible in both places.

**What you will learn:**

- The two thresholds, which one controls which destination, and why they are separate.
- The exact options to change, with units and defaults.
- How to capture `console.*` calls the library did not make.
- The rate limits and payload budgets that can silently drop a record once logging is on.

## The two thresholds

There are two independent level settings, and the confusion between them is the single most common
configuration mistake at this tier:

| Setting | Documented default | Effective default | Controls |
| --- | --- | --- | --- |
| `logs.consoleLevel` | none | `'warn'` | What the **logger facade prints** to DevTools |
| `logs.level` | `'warn'` | `'warn'` | What is **persisted** — and therefore in the report and the upload |

Both effective defaults are `'warn'`, so at this tier:

| Call | Printed to DevTools | Persisted |
| --- | --- | --- |
| `logger.debug(…)` | No | No |
| `logger.info(…)` | **No** | **No** |
| `logger.warn(…)` | Yes | Yes |
| `logger.error(…)` | Yes | Yes |
| `captureError(…)` | No | Yes |

`logger.info(…)` is not a broken probe — it is a probe that both thresholds filter out. Two lines fix
that, and you need **both**, because changing one leaves the other destination empty. In Next.js they go
in the provider effect, where the call already is:

```tsx
// app/providers.tsx
'use client';

useEffect(() => {
  initTelemetry({
    appName: 'checkout',
    logs: {
      consoleLevel: 'info', // printed from 'info' up
      level: 'info', // persisted from 'info' up
    },
  });

  return () => destroyTelemetry();
}, []);
```

> **Source note.** `logs.consoleLevel` is documented as having no default, and that is literal: it
> resolves to `undefined` when unset, and `initTelemetry` applies it only when it is defined. So
> initialising telemetry never changes console output on its own — the `'warn'` you observe is the
> logger's internal level, not a policy the library imposed. The distinction matters to a consumer who
> supplied their own `logSource`: they keep whatever verbosity they had.

The levels, lowest to highest, are `'trace' | 'debug' | 'info' | 'warn' | 'error'`. Both `logs.level` and
`logs.consoleLevel` also accept `'off'` — with the synonyms `none` and `silent`, all normalised to
`'off'` — and `'off'` on `logs.level` is how you stop persisting logs without touching `logs.enabled`.

## The recipe this page exists for

The exact shape that makes the probe you were writing actually work. It is a client component like every
other interactive piece in the App Router:

```tsx
// app/log-probe.tsx
'use client';

import type { ReactElement } from 'react';
import { logger } from '@codewithrajat/rm-logvault';

export function LogProbe(): ReactElement {
  return (
    <button
      type="button"
      onClick={() => {
        logger.info('[checkout] info probe'); // printed and persisted, now that both are 'info'
        logger.warn('[checkout] warn probe'); // was already working
      }}
    >
      Log a probe
    </button>
  );
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

Turning logging on raises the volume, and two ceilings then become relevant. Neither is a crash; both are
silent by design, and both are reported through `onInternalError`.

| Limit | Option | Default | Unit |
| --- | --- | --- | --- |
| Error rate | `errors.maxEventsPerMinute` | `120` | errors per 60 s window |
| Log rate | `logs.maxLogsPerMinute` | `600` | logs per 60 s window |
| Error record size | `errors.maxPayloadBytes` | `16384` | UTF-8 bytes per record |
| Log record size | `logs.maxPayloadBytes` | `4096` | UTF-8 bytes per record |
| Log write flush | `logs.writeFlushMs` / `logs.writeBatchSize` | `1000` / `50` | ms / entries |

The rate limits are fixed 60-second windows, and `0` disables one. A loop that logs inside a render is the
classic way to hit `logs.maxLogsPerMinute`, and hitting it looks exactly like "the library stopped
recording" — because for the rest of the window, it did.

Which limit bites first is worth knowing before you raise any of them:

- **The rate limit drops the record entirely.** Nothing is stored, so nothing is in the report.
- **`maxPayloadBytes` reduces the record instead of dropping it.** The record is still there, with fields
  trimmed from the bottom of a documented ladder. A record that looks thinner than you expected is a
  budget being applied, not a bug.

If you are changing these, read
[retention and payload budgets](../../vanilla/advanced/02-retention-and-payload-budgets.md) first — it
explains the ladder and which limit deletes a row before the other.

## Configuring it from the environment instead

These settings have environment variables too, which is usually the right place for per-environment
verbosity. Only `NEXT_PUBLIC_`-prefixed variables reach the client bundle, and the environment layer has
to be applied where the call is — so inside the effect, not at module top level:

```tsx
// app/providers.tsx
'use client';

useEffect(() => {
  initTelemetry({ env: 'NEXT_PUBLIC_' }); // pin the prefix Next.js actually exposes
  return () => destroyTelemetry();
}, []);
```

| Variable | Option | Notes |
| --- | --- | --- |
| `NEXT_PUBLIC_LOG_LEVEL` | `logs.consoleLevel` | The **console** threshold. |
| `NEXT_PUBLIC_LOG_PERSIST_LEVEL` | `logs.level` | An empty value inherits the console level. |
| `NEXT_PUBLIC_ERROR_TRACKING_MAX_PAYLOAD_BYTES` | `errors.maxPayloadBytes` | The error record budget. |
| `NEXT_PUBLIC_LOG_PERSIST_MAX_PAYLOAD_BYTES` | `logs.maxPayloadBytes` | The log record budget. |

`NEXT_PUBLIC_LOG_LEVEL` sets the **console** level; `NEXT_PUBLIC_LOG_PERSIST_LEVEL` sets the **persist**
level, and an empty value there inherits the console one. The full table, the parsing rules and the
precedence order are in [environment variables](./01-environment-variables.md).

## Try it yourself

1. Leave the defaults and call `logger.info('[probe]')`, `logger.warn('[probe]')` and
   `logger.error('[probe]')` from three buttons in a client component.
2. Download the report. Only the `warn` and `error` lines are in it.
3. Add `logs: { consoleLevel: 'info', level: 'info' }` to the provider's `initTelemetry` and repeat. All
   three are now in DevTools and in the report.
4. Add `logs.captureConsole: true` and call `console.error('[probe] from the console')`. It appears as a
   log record — with a message and no stack.

## Related

- [config](./README.md) — every option, with its unit and default.
- [the capture recipes](../basic/01-capture-recipes.md) — the four ways an *error* gets recorded.
- [what arrives at your collector](../advanced/02-what-arrives-at-the-collector.md) — what these log
  records look like once they are uploaded.
- [environment variables](./01-environment-variables.md) — the `NEXT_PUBLIC_` prefix rule, with every
  variable and its unit.
