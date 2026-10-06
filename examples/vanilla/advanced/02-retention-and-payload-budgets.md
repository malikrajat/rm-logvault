# Retention and payload budgets

**Problem it solves:** an error vault that grows without limit is a bug in someone else's browser, and
a single enormous record can blow a storage quota on its own. Two independent limits, and one reduction
ladder, are what keep the store bounded.

## Two limits per store, and whichever is reached first wins

Each store — errors and logs — has its own pair:

| Limit | Unit | Errors default | Logs default | What reaching it does |
| --- | --- | --- | --- | --- |
| `retentionDays` | days | `7` | `3` | Deletes every row older than the window. |
| `maxRecords` | rows | `500` | `2000` | Deletes the **oldest** surplus. |

The sweep always runs age first, then count, so a store that is both old *and* over its cap is trimmed
by both rules in one pass.

```
sweep:
  1. age   — delete where timestamp < now - retentionDays    (skipped entirely if retentionDays is 0)
  2. count — if rows > maxRecords, delete the oldest surplus
```

**`0` means different things in the two limits, deliberately.** `retentionDays: 0` *disables*
age-based deletion — keep everything, capped only by count. `maxRecords: 0` is rejected as a mistake,
because "store nothing" already has a spelling: `errors.enabled: false`. Silently turning retention
into "delete everything" would be the surprising reading.

`retentionDays` accepts a fraction: `0.5` is twelve hours, which is useful for a staging environment.

## When the sweep runs

Not on a timer — on writes, and once at start-up:

| Trigger | Cadence |
| --- | --- |
| Initialisation | Once, as soon as the store opens. |
| Error writes | Every **25** successful writes. |
| Log writes | Every **200** successful writes. |
| Work per sweep | One transaction, deleting the surplus one row at a time. |

This is amortisation, not laziness. A sweep costs an index scan, and running one per write would make
every capture pay for it; running it every N writes — 25 for errors, 200 for logs — means a burst pays
for it in small instalments instead of one long blocking pass.

The practical consequence is worth knowing: **retention is enforced lazily**, on write. An application
that writes rarely can sit over its window between page loads, and the start-up sweep is what bounds
that drift. Tying a schedule to `setInterval` would not help — a background tab's timers are throttled,
and a closed tab has none.

> **Source note.** The cadence is not an option. It decides *when* the sweep runs, not *what is kept* —
> and what is kept is entirely governed by the two limits above. To change the cadence you replace the
> repository, which also makes the database names and policies your responsibility; that path is
> documented in [more-advanced/01-custom-repository.md](../more-advanced/01-custom-repository.md).

## Payload budgets: bytes, not characters

| Option | Unit | Errors default | Logs default |
| --- | --- | --- | --- |
| `maxPayloadBytes` | UTF-8 bytes, **per record** | `16384` | `4096` |

Three things about this number are easy to get wrong:

1. **Bytes, not characters.** `'é'` is 2 bytes; an emoji is 4. A budget of 16 384 holds about 16 384
   ASCII characters and considerably fewer of anything else.
2. **Per record, not per request.** It has nothing to do with `rest.batchSize`. A batch of 50 records
   can legitimately be 800 kB.
3. **It is a budget, not a truncation point.** Exceeding it starts a ladder rather than chopping the
   string at the limit.

### The reduction ladder

An error record that does not fit is reduced in fixed steps until it does:

| Tier | What it does |
| --- | --- |
| 0 | Return it unchanged — it already fits. |
| 1 | Drop `extra` and add the tag `truncated: 'true'`. |
| 2 | Trim `causes` to 300 characters per link, `stack` to 2000, `componentStack` to 1000. |
| 3 | Minimal: `stack` to 500, `message` to 300, `causes` and `componentStack` removed entirely. |
| 4 | Give up. |

Tier 1 is why the tag exists: a record carrying `truncated: 'true'` is telling you the ladder ran, so
"why is this error missing its context?" has an answer visible in the report itself.

A log record climbs a shorter ladder: drop `data`, then shorten `message` to 300 characters, then give
up.

### Tier 4 means "dropped", and you can see it happen

If even the minimal tier does not fit, the record is **not stored**. Storing a truncated-to-useless
record would be worse than storing nothing, because it looks like evidence. The drop is reported rather
than silent:

```ts
initTelemetry({
  onInternalError: (stage, error) => {
    if (stage === 'payload-limit') {
      // A record exceeded its budget at every tier and was dropped.
    }
  },
});
```

`onInternalError` is called **at most once per stage per initialisation**, so a pathological loop that
drops a thousand records produces one notification, not a thousand.

## What happens when the storage quota is full

A write that fails because the origin is out of quota is not simply lost. The library halves the
affected cap, runs a sweep, and retries that same write exactly once. If the app is genuinely out of
room, one retry with half the ceiling usually succeeds; if it does not, the failure is reported through
`onInternalError` with stage `'persist'`.

Sizing the store to stay clear of the quota is the better fix, and the two limits are how you do it.

## Checking it is working

```ts
const current = getTelemetryStatus();
current.storage;   // did IndexedDB open at all?
current.pending;   // written but not yet uploaded
```

Then read the truth from DevTools → **Application** → **IndexedDB** → `rm-logvault-errors`. The
databases are named from `dbPrefix`, so a second application on the same origin should set its own —
see the `dbPrefix` row in [docs/API.md](../../../docs/API.md#top-level).

## A worked example

A checkout application that cares about errors and not much about logs:

```ts
initTelemetry({
  errors: {
    retentionDays: 30, // a month of history is worth keeping
    maxRecords: 200, // but only the 200 most recent
    maxPayloadBytes: 32_768, // stacks here are long; raise the budget
  },
  logs: {
    enabled: true,
    level: 'error', // only errors are persisted, not warns
    retentionDays: 1, // logs are noise after a day
    maxRecords: 500,
    maxPayloadBytes: 2_048, // and should stay small
  },
});
```

## Related

- [advanced](./README.md) — where these options sit in a full configuration.
- [the outbox](./01-the-outbox.md) — what happens to a record that never gets uploaded.
- [docs/API.md](../../../docs/API.md#every-option-annotated) — units, boundaries and invalid values
  for every option.
