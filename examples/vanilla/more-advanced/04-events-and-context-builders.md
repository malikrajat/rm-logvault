# Observing and extending — events, context builders, and named sinks

**Problem it solves:** the library is a *recorder*, and a recorder that only writes to disk is hard to
build a product on. Three questions come up immediately once it is in production:

1. "Show me a badge with the error count." — nothing reports that a record was accepted.
2. "Our `code: 'ALARM_NOT_FOUND'` errors are all landing in one bucket." — nothing can classify an error
   shape only *your* application understands.
3. "Another module installed a sink; is it still attached?" — once there are three sinks, "install"
   is not the only operation you need.

Each has a seam here. None of them require replacing anything — the previous page was about *swapping
parts out*; this one is about *watching and teaching*.

**What you will learn:**

- `handle.events` — six events, how to subscribe, and the two things it deliberately does not report.
- `registerErrorContextBuilder` — classifying errors the library cannot recognise, and the merge rule.
- `installBuiltinContextBuilders()` — three ready-made classifiers, and why they do not self-register.
- `getSinkRegistry()` — listing, looking up and detaching sinks by key.
- The flat configuration aliases, for when the nested form is more nesting than the fact deserves.

## 1. The simple front door first

Before any of the seams: the shortest complete configuration.

```ts
import { setupTelemetry } from '@codewithrajat/rm-logvault';

// Local only. No endpoint, so nothing ever leaves the browser.
setupTelemetry({ app: 'checkout', version: '2.4.1' });

// One collector for both kinds, persisted from `info` up, 1000 error rows retained.
setupTelemetry({
  app: 'checkout',
  version: '2.4.1',
  url: '/telemetry',
  level: 'info',
  maxErrors: 1000,
});
```

`setupTelemetry` is not a second configuration system — it forwards to `initTelemetry` unchanged, so the
two are interchangeable and can be mixed in one codebase. Anything it cannot express (a custom
`repository`, a `beforeCapture` hook, an adapter) is still available through `initTelemetry` with the
full option object.

The same flat names work directly on `initTelemetry`, which is what makes the migration gradual:

```ts
import { initTelemetry } from '@codewithrajat/rm-logvault';

// These two are equivalent.
initTelemetry({ appName: 'checkout', rest: { errorsUrl: '/t', logsUrl: '/t' }, logs: { level: 'info' } });
initTelemetry({ appName: 'checkout', url: '/t', level: 'info' });
```

**The precedence rule, and it runs inside-out.** A nested value beats its flat alias, which beats the
environment, which beats the built-in default:

```ts
initTelemetry({
  url: '/everything',              // both kinds go here…
  rest: { errorsUrl: '/errors' },  // …except errors, which go here.
});
// errors → /errors      logs → /everything
```

| Flat alias | Maps to |
| --- | --- |
| `url` | **both** `rest.errorsUrl` and `rest.logsUrl` |
| `errorUrl` / `logUrl` | `rest.errorsUrl` / `rest.logsUrl`, splitting them |
| `headers` | `rest.getHeaders` |
| `level` | `logs.level` — the minimum level **persisted** |
| `consoleLevel` | `logs.consoleLevel` — console verbosity applied at init |
| `captureConsole` | `logs.captureConsole` |
| `maxErrors` / `maxLogs` | `errors.maxRecords` / `logs.maxRecords` |
| `errorRetentionDays` / `logRetentionDays` | `errors.retentionDays` / `logs.retentionDays` |
| `app` / `version` / `build` | `appName` / `appVersion` / `buildId` |

## 2. Events: state flows out

`initTelemetry` returns a handle whose `events` member is an emitter. Six events exist:

| Event | Fires when | Useful fields |
| --- | --- | --- |
| `error:captured` | an error record is accepted | `recordId`, `fingerprint`, `severity`, `source`, `category`, `handled`, `occurrenceCount` |
| `log:written` | a log passes the persist level | `recordId`, `level`, `message` |
| `sync:started` | `syncTelemetry()` begins, per kind | `kind`, `recordCount` |
| `sync:completed` | a kind's upload pass finishes | `kind`, `uploaded`, `retried`, `failed` |
| `sync:failed` | a kind had terminally-failed records | `kind`, `status`, `recordCount` |
| `record:dropped` | the rate limiter discarded captures | `kind`, `reason`, `count` |

```ts
import { initTelemetry } from '@codewithrajat/rm-logvault';

const telemetry = initTelemetry({ appName: 'checkout' });

// A badge, without polling anything.
let count = 0;
const off = telemetry.events.on('error:captured', (event) => {
  count += 1;
  badge.textContent = String(count);
  badge.title = `${event.fingerprint} (${event.severity})`;
});

// Feed your own store. `event.type` narrows, so no cast is needed.
telemetry.events.onAny((event) => {
  switch (event.type) {
    case 'error:captured':
      store.getState().addError(event.recordId, event.severity);
      break;
    case 'sync:completed':
      store.getState().setUploaded(event.kind, event.uploaded);
      break;
    default:
      break;
  }
});

off(); // unsubscribe; safe to call twice
```

Three properties make this safe to hand to application code:

- **A listener can never break a capture.** Every listener gets its own `try`/`catch`, so a throwing
  subscriber cannot stop the error it was notified about from being persisted.
- **An async listener can never produce an unhandled rejection.** A returned promise is observed and a
  failure is routed into `[Telemetry]` diagnostics.
- **A listener that emits is bounded.** Nested events are *queued*, not recursed — otherwise a listener
  on `error:captured` that calls `captureError` would loop forever.

**Two honest limits.**

- These events report `captureError` and `logger` activity plus explicit `syncTelemetry()` runs. The
  automatic background flush is internal and does **not** emit `sync:started` / `sync:completed`, because
  those are framed as "the pass you asked for".
- `handle.events` is the same object across a `destroyTelemetry()` → `initTelemetry()` cycle, so a
  reference you captured once keeps working. Listeners themselves are cleared on teardown.

## 3. Context builders: teaching the library your error shapes

The library classifies what it produces — HTTP failures, chunk-load errors, CSP violations. It cannot
know that `code === 'ALARM_NOT_FOUND'` is a domain error, and it should not learn your vocabulary to
find out.

```ts
import { registerErrorContextBuilder } from '@codewithrajat/rm-logvault';

const off = registerErrorContextBuilder({
  name: 'alarms',
  canHandle: (error) => {
    const code = (error as { code?: unknown } | null)?.code;
    return typeof code === 'string' && code.startsWith('ALARM_');
  },
  build: (error) => ({
    source: 'api',
    category: 'runtime',
    severity: 'warning',
    tags: { domain: 'alarms', code: String((error as { code?: unknown }).code) },
  }),
});

off(); // unregister; only removes this exact registration
```

The registry resolves in **registration order** and the first match wins, so register specific
classifiers before general ones.

### The merge rule is the important part

**Your explicit call-site fields always beat a builder's.** A registration cannot silently relabel an
integration you already described correctly:

```ts
captureError(err, { source: 'react' });
// A builder returning `{ source: 'api' }` does not win. `source` stays 'react'.
```

`tags` and `extra` are the exception, and they **merge key-by-key** with the caller winning on a
conflict. That is deliberate: those two are additive by nature, and letting either side discard the
other would lose information with no warning.

```ts
// builder contributes { domain: 'alarms' }, call site contributes { flow: 'checkout' }
captureError(err, { tags: { flow: 'checkout' } });
// record.tags === { domain: 'alarms', flow: 'checkout' }
```

Two more things worth knowing:

- The registry is **process-wide and survives `destroyTelemetry`**. A builder describes your
  application, not an installation, so an HMR reload or a microfrontend remount must not lose it.
- A throwing `canHandle` counts as "no match" and a throwing `build` falls through to the next builder.
  A third-party classifier cannot swallow a capture.

## 4. The built-in builders, and why they do not self-register

```ts
import { installBuiltinContextBuilders } from '@codewithrajat/rm-logvault';

const off = installBuiltinContextBuilders(); // timeout → http → type-error
```

That registers three classifiers:

| Builder | Matches | Contributes |
| --- | --- | --- |
| `timeoutErrorContextBuilder` | `code: 'ETIMEDOUT' \| 'ECONNABORTED'`, or a timeout-shaped message | `category: 'timeout'`, `severity: 'warning'` |
| `httpErrorContextBuilder` | a `response` object with a numeric `status`, or a numeric `status` / `statusCode` | `category`, `severity`, `api`, tags `method` / `status` / `kind` |
| `typeErrorContextBuilder` | a `TypeError`, including cross-realm ones | `category: 'runtime'`, `severity: 'error'` |

Order matters: `timeout` is first because a timed-out axios request can also look like an HTTP failure,
and "timeout" is the more useful label. `type-error` is last so it cannot shadow either.

**Nothing here registers itself.** Importing the module has no effect until you call
`installBuiltinContextBuilders()`. That is the point: upgrading the library must never change how your
existing application classifies its errors as a side effect. The individual builders are exported, so
you can register one and not the others, or interleave your own domain classifiers before them.

## 5. Named sinks

`logger.addSink(sink)` is still *the* way to install a sink — it is what drives pre-init replay and the
re-entrancy guard. The registry is what sits behind it, so you can answer "what is attached?":

```ts
import { getSinkRegistry, logger } from '@codewithrajat/rm-logvault';

logger.addSink({ name: 'overlay', write: (record) => render(record) });
logger.addSink({ name: 'remote', write: (record) => queue(record) });

getSinkRegistry().keys();
// ['@codewithrajat/rm-logvault-indexeddb#1', 'overlay#2', 'remote#3']

// Detach the overlay later, from anywhere in the app.
for (const entry of getSinkRegistry().list()) {
  if (entry.name === 'overlay') getSinkRegistry().unregister(entry.key);
}
```

The key is `` `${sink.name ?? 'sink'}#${n}` ``. The sequence suffix is what keeps two sinks that declare
the same `name` from replacing each other. Registering an existing key replaces that sink and returns a
fresh unsubscribe function; calling an older unsubscribe function afterwards is safe and does not remove
the replacement.

## Which of these do you actually need?

| If you want to… | Use | Cost |
| --- | --- | --- |
| Show a count or feed your own store | `handle.events` | Tiny. One listener per concern. |
| Classify errors only your app understands | `registerErrorContextBuilder` | Tiny, and it applies to captures your code never sees — global handlers, third-party adapters. |
| Stop repeating the nested config | flat aliases / `setupTelemetry` | Nothing. It is the same options object. |
| Find or remove a sink | `getSinkRegistry()` | Nothing; it is a `Map` you never read. |

## See also

- [hooks and automation](./03-lifecycle-hooks-and-automation.md) — `beforeCapture`, `beforeStore` and
  `onInternalError`, which *intercept* a record rather than observe it.
- [custom transport](./02-custom-transport-and-log-source.md) — replacing the network while keeping the
  retry policy.
- [config](../config/README.md) — the full options surface the flat aliases are shorthand for.
- [docs/API.md](../../../docs/API.md) — every new symbol with its signature.
- [docs/ARCHITECTURE.md](../../../docs/ARCHITECTURE.md#76-the-observation-and-extension-surface) — why
  the merge rule and the re-entrancy bound are shaped the way they are.
