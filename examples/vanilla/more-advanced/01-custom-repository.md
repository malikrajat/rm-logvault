# Custom repository

**Problem it solves:** you need records to live somewhere other than IndexedDB — an in-memory store for
tests, or IndexedDB with a cleanup cadence of your own — without giving up the rest of the library.

## The contract is more than a pair of stores

This is the mistake to avoid, and it is a type error rather than a silent one:

```ts
export interface TelemetryRepository {
  readonly errors: ErrorRepository;
  readonly logs: LogRepository;
  initialize(): Promise<StorageResult<void>>; // resolve false-ish only if BOTH are unusable
  close(): void;
}
```

`initialize()` is the **readiness gate**: uploads and the report both wait on it, and it is where the
library learns whether storage works at all. `close()` is teardown. A hand-built object that supplies
only `{ errors, logs }` will not typecheck, and if it did, nothing would ever be written.

> **Source note.** The gate is deliberately "both failed" rather than "either failed". One working store
> is still useful — you can lose the log store and keep capturing errors — so only the both-failed case
> is reported as storage being unavailable.

## Way (a): no storage at all

```ts
import { initTelemetry } from '@codewithrajat/rm-logvault';
import { createMemoryRepository } from '@codewithrajat/rm-logvault/testing';

const repository = createMemoryRepository();

initTelemetry({ appName: 'test-app', repository, shortcut: false });

// then assert, in a unit test:
repository.errors.all(); // ErrorRecord[]
repository.logs.all(); // LogRecord[]
```

This is the documented testing path, and it is worth knowing before you write it yourself: the library's
own test suite runs on it, so it behaves like the real thing — aggregation, statuses, retention — without
IndexedDB, without happy-dom's partial implementation, and without a `fake-indexeddb` dependency.

## Way (b): IndexedDB, with your own cleanup cadence

```ts
import {
  createErrorRepository,
  createLogRepository,
  databaseNames,
  initTelemetry,
} from '@codewithrajat/rm-logvault';

const names = databaseNames('my-vault');

const errors = createErrorRepository({
  dbName: names.errors,
  cleanupPolicy: { retentionDays: 7, maxRecords: 100 },
  cleanupEveryWrites: 5, // default is 25
});

const logs = createLogRepository({
  dbName: names.logs,
  cleanupPolicy: { retentionDays: 3, maxRecords: 2_000 },
  cleanupEveryWrites: 20, // default is 200
});

const repository = {
  errors,
  logs,
  initialize: async () => {
    const errorResult = await errors.initialize();
    const logResult = await logs.initialize();
    // One working store is still useful, so only both-failed is a failure.
    if (!errorResult.ok && !logResult.ok) return errorResult;
    return { ok: true, value: undefined };
  },
  close: () => {
    errors.close();
    logs.close();
  },
};

initTelemetry({ appName: 'my-app', repository });
```

### Why the cadence is the only reason to do this

`cleanupEveryWrites` decides *when* the sweep runs, not *what is kept*. What is kept is `retentionDays`
and `maxRecords`, which are ordinary options in [advanced](../advanced/README.md) and
[retention and payload budgets](../advanced/02-retention-and-payload-budgets.md). The cadence is
amortisation: a sweep costs an index scan, so running one per write would make every capture pay for it.

That is why there is no `cleanupEveryWrites` option: it is a performance knob, and taking this route
makes the database names and the retention policies your responsibility too — the right amount of
friction for something that only changes timing.

## What you become responsible for

| You now own | Normally chosen by |
| --- | --- |
| `dbName` for each store | `dbPrefix`, through `databaseNames(dbPrefix)` |
| `cleanupPolicy` | `errors.retentionDays` / `maxRecords` and the `logs.*` equivalents |
| `openTimeoutMs` | the top-level `openTimeoutMs` option |
| The readiness gate | the library, from the two stores' own `initialize()` calls |

Because the policy in the repository is what actually runs, setting `errors.retentionDays` **and** a
`cleanupPolicy` disagreeing with it is a real hazard: the option would still drive the status reporting
and the documentation, while the repository drives the deletions. Keep them in step, or supply the
repository without a policy and let the options decide.

`createErrorRepository` and `createLogRepository` are public precisely so this composition is possible;
their full option tables are in [docs/API.md](../../../docs/API.md#storage).

## Related

- [more-advanced](./README.md) — the other seams, and the order to read them in.
- [retention and payload budgets](../advanced/02-retention-and-payload-budgets.md) — what the policy
  actually does.
