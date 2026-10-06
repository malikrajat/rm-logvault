# The outbox — what happens between capture and upload

**Problem it solves:** "it uploads" is not a specification. You need to know what happens when the
network is down, when the collector returns a 500, when the collector returns a 401, and when a tab is
closed mid-request — because those are the cases that decide whether a record survives.

## The shape: IndexedDB first, always

```
capture -> sanitize -> IndexedDB (uploadStatus: 'pending')
                            |
                            |  claim a batch
                            v
                        'uploading' --2xx--> 'uploaded'
                            |
                            +--retryable--> back to 'pending', with backoff
                            +--terminal----> 'failed'
```

Every record is written to IndexedDB **before** any network call. There is no in-memory-only path, so
closing the tab, losing the network or crashing the process cannot lose a record that was already
captured. The upload is then a separate, resumable step over what is already on disk.

`mode: 'local'` (the default) stops the diagram after the first line: nothing is claimed and nothing is
sent.

## Batching

| Option | Unit | Default | What it controls |
| --- | --- | --- | --- |
| `rest.batchSize` | records per request | `50` | How many records one `POST` body carries. |
| `rest.intervalMs` | milliseconds | `30000` | The floor between flush runs **after a success**. |

`intervalMs` is not a poll interval. It is the minimum wait after a *successful* run; a failure takes a
different path entirely (below). Raising it reduces request volume; lowering it makes records appear
sooner in a low-traffic app.

`batchSize` is the more interesting dial. A larger batch means fewer requests and less overhead, but a
terminal status then condemns more records at once, and one oversized payload can be rejected for the
whole batch. `20`–`50` is the useful range for most applications.

## Retry: backoff, and what a server can ask for

A retryable failure (network error, timeout, `5xx`, `429`) returns the claimed records to `pending` and
the next attempt waits:

```
15 s  ->  30 s  ->  60 s  ->  …  capped at 15 minutes
```

…**or** the server's `Retry-After`, whichever is **longer**. A collector that is asking you to slow down
is obeyed rather than second-guessed. The delay is a floor, not a schedule: `syncTelemetry()` and an
`online` event can both bring the next attempt forward.

Claiming a batch is a **lease**, not a lock. A batch claimed by a tab that then died is re-queued once
the 5-minute lease expires, instead of sitting in `uploading` forever.

## Terminal versus retryable

The distinction is the one that matters, because getting it wrong either loses data or hammers a
collector. The library classifies by status:

| Response | Classification | What the library does |
| --- | --- | --- |
| `2xx` | success | Marks the batch `uploaded`. |
| `400`, `401`, `403`, `404`, `405`, `410`, `413`, `415`, `422` | **terminal** | Marks the batch `failed` and leaves it alone. |
| Anything else — including `408`, `425`, `429` and every `5xx` | **retryable** | Back to `pending`, with backoff / `Retry-After`. |

In other words the terminal set is a short, explicit list of statuses that retrying cannot fix. A
terminal failure tells you something is wrong with the request or the credentials, so the library stops
and hands you the batch:

```ts
initTelemetry({
  rest: {
    errorsUrl: '/telemetry/errors',
    onTerminalFailure: (status, records) => {
      // A 4xx that retrying will not fix. Re-authenticate, then:
      void retryFailedTelemetry();
    },
  },
});
```

`retryFailedTelemetry()` returns terminally-failed records to `pending`. The intended shape is
"refresh the token, then re-arm", which is why the hook exists rather than an automatic retry after a
401 that would loop forever.

## Numbers worth knowing

These are fixed, not options — they are here so the behaviour is predictable rather than mysterious:

| Constant | Value | What it bounds |
| --- | --- | --- |
| Backoff base | `15 000 ms` | The first retry delay; doubles per consecutive failure. |
| Backoff ceiling | `900 000 ms` (15 min) | The longest automatic wait, `Retry-After` aside. |
| Claim lease | `300 000 ms` (5 min) | How long an abandoned `uploading` claim is respected before re-queueing. |
| First automatic flush | `5 000 ms` | How soon after initialisation the first upload is attempted. |
| Request timeout | `10 000 ms` | Per-request abort budget. |
| Batches per flush run | `10` | One run uploads at most this many batches, so a large backlog drains over several runs rather than in one burst. |
| `keepalive` body ceiling | `60 000` bytes | Bodies below this may use `keepalive` during an unload flush. |

## The three calls that drive it

These are worth keeping straight, because two of them sound interchangeable and are not:

| Call | What it does | Touches the network? |
| --- | --- | --- |
| `flushTelemetry()` | Drains in-memory writes down to IndexedDB. | **No.** |
| `syncTelemetry()` | Claims a batch and uploads it now. | Yes. |
| `retryFailedTelemetry()` | Returns `failed` records to `pending`. | No — it only re-arms them. |

That distinction matters in a `visibilitychange` or `pagehide` handler: `flushTelemetry()` is the safe
one there, because it completes locally. Uploading during unload is what `keepalive` requests are for,
and the default transport handles that; calling `syncTelemetry()` in an unload handler is not the same
thing and can simply be cancelled by the browser.

## Watching it

The useful experiment is a failure, not a success:

1. Trigger a few errors with the collector **up**, and confirm they arrive.
2. Stop the collector. Trigger more errors.
3. Look at DevTools → **Application** → **IndexedDB** → `rm-logvault-errors`. The rows are there with
   `uploadStatus: 'pending'`.
4. Start the collector again. The queue drains on the next attempt, without any code from you.

## Related

- [advanced](./README.md) — the options that turn this on.
- [retention and payload budgets](./02-retention-and-payload-budgets.md) — what eventually deletes a
  record that never made it out.
- [docs/API.md](../../../docs/API.md#rest--uploads-one-endpoint-per-kind) — the `rest.*` reference.
