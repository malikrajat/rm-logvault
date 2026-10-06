# more-advanced — encrypting stored records

**Problem it solves:** IndexedDB is readable by anything running on your origin, and a stored error
message can contain a customer name, an account number, or a stack trace with a value in it. Redaction
already strips the patterns it knows; encryption is the second layer for the ones it does not, and for
read access to the device itself.

**What you will learn:**

- How to read the two shipped providers, and why one of them is named `base64` rather than `basic`.
- Wrapping an error **and** a log repository — they are two separate stores.
- Assembling the `{ errors, logs, initialize, close }` object `initTelemetry` expects.
- Which fields to encrypt, and the specific reason `message` and `stack` are usually the wrong answer.
- What happens when a decrypt fails, and why that behaviour is the safe one.
- Why this is bootstrap-time wiring rather than a runtime toggle.

## Read this before choosing a provider

The library's privacy control is **redaction, not encryption**: sensitive keys, URL parameters and
free-text patterns are stripped before a record is written. Encryption is defence in depth for the case
where someone else gets read access to the origin's storage.

That framing decides which provider you want:

| Provider | Real confidentiality? | Use when |
| --- | --- | --- |
| `createBase64EncryptionProvider()` | **No.** It is encoding. Anyone can decode it with `atob`. | You want to stop a casual glance at DevTools being a data incident. Nothing more. |
| `createAesGcmEncryptionProvider({ password, salt })` | Yes, AES-GCM-256 — **as strong as where the key lives**. | You accept that the key is on the client, and you are protecting a database dump. |

```ts
// ENCODING. Not encryption. The value is reversible with atob().
const provider = createBase64EncryptionProvider();
```

There is no way around the browser's constraint: a key the page can use, an attacker with the page can
use. Encryption protects the **file**, not the **data**, against a reader of the running page. Choosing
`base64` and believing otherwise is the actual bug this section exists to prevent.

## Which fields to encrypt

This is the decision that matters, and it is not "encrypt everything". **Only string values are
encrypted** — a field holding an object or an array is skipped, because the provider's contract is
`string` in and `string` out.

| Field | Type | Encrypt? | Why |
| --- | --- | --- | --- |
| `componentStack` | string | **Yes, usually the best candidate** | Can carry property values from a template binding, and it is not part of the fingerprint. |
| `message` | string | **Careful** | It feeds the fingerprint. See the note below. |
| `stack` | string | **Careful** | Also feeds the fingerprint, and is what makes two failures group. |
| `route` (log) | string | Depends | A path can carry an id, and it is a grouping key too. |
| `extra` | object | **Not encrypted** | An object. The wrapper skips it; encrypt a string path inside it instead, e.g. `extra.sessionId`. |
| `tags` | object | **Not encrypted** | Same — use a dotted path such as `tags.tenant`. |
| `id`, `fingerprint`, `uploadStatus`, `timestamp` | string / number | **No** | These are the keys. `pendingCount` and `updateUploadStatus` read them and would break. |
| `api.url` | string | Sometimes | A path can carry an id; `sanitizer.url` already redacts query values. |

> **Source note.** `message` and `stack` are part of the **fingerprint**, which is what groups repeated
> failures into one row with an `occurrenceCount` rather than appending thousands. Encrypt them and two
> occurrences of the same bug no longer match, so grouping degrades and a search for a known message
> finds nothing — the stored text is ciphertext. Encrypt the fields you read back for a human, not the
> ones the vault aggregates on.

> **Source note.** A log record's only string fields are `message`, `route` and `level`, and `message` is
> its grouping key. In practice that means **encrypting a log store buys little** — the useful fields are
> objects, and the string ones are the ones you search. Encrypt the error store and leave the logs alone,
> unless a specific field justifies it.

## Wrapping one repository at a time

`createEncryptingRepository` takes a **single** repository — not the `{ errors, logs }` pair. So you wrap
each store, then assemble the pair yourself.

```ts
// src/app/telemetry/encrypted-repository.ts
import {
  createErrorRepository,
  createLogRepository,
  type StorageResult,
  type TelemetryRepository,
} from '@codewithrajat/rm-logvault';
import {
  createAesGcmEncryptionProvider,
  createEncryptingRepository,
} from '@codewithrajat/rm-logvault/storage';

/**
 * Field names to encrypt. Only STRING values are encrypted — a field holding an
 * object is skipped — so these are strings, or dotted paths to a string.
 *
 * `message` and `stack` are deliberately absent: they feed the fingerprint, so
 * encrypting them costs you grouping and search.
 */
const ERROR_FIELDS = ['componentStack', 'extra.sessionId', 'tags.tenant'];
const LOG_FIELDS = ['route'];

export async function createEncryptedRepository(options: {
  readonly password: string;
  readonly salt: Uint8Array; // 16 bytes, from your build or your server — NOT this database
  readonly dbPrefix?: string;
}): Promise<TelemetryRepository | undefined> {
  const provider = await createAesGcmEncryptionProvider({
    password: options.password,
    salt: options.salt,
    // iterations: 250_000,  // the default
  });

  // `undefined` means crypto.subtle is unavailable — a non-secure context, or an old
  // engine. Return undefined so the caller can fall back, rather than storing plain
  // text while claiming it is encrypted.
  if (provider === undefined) return undefined;

  const prefix = options.dbPrefix ?? 'rm-logvault';
  const rawErrors = createErrorRepository({ dbName: `${prefix}-errors` });
  const rawLogs = createLogRepository({ dbName: `${prefix}-logs` });

  const errorOptions = {
    fields: ERROR_FIELDS,
    onDecryptFailure: (field: string, error: unknown): void => {
      // A field that cannot be read back keeps its ciphertext; say so loudly.
      console.warn(`[telemetry] could not decrypt ${field}`, error);
    },
  };

  return {
    // Each wrapper is the repository you passed IN, intersected with `{ inner, provider }`,
    // so these are directly assignable to `TelemetryRepository.errors` / `.logs`.
    errors: createEncryptingRepository(rawErrors, provider, errorOptions),
    logs: createEncryptingRepository(rawLogs, provider, { fields: LOG_FIELDS }),

    // The readiness gate. Sync never starts before this resolves `true`.
    // The explicit return annotation is load-bearing: without it TypeScript cannot
    // unify the two branches into `StorageResult<void>`.
    initialize: async (): Promise<StorageResult<void>> => {
      const errorResult = await rawErrors.initialize();
      const logResult = await rawLogs.initialize();
      // Only unusable when BOTH failed: one working store is still useful.
      if (!errorResult.ok && !logResult.ok) return errorResult;
      return { ok: true, value: undefined };
    },
    close: (): void => {
      rawErrors.close();
      rawLogs.close();
    },
  };
}
```

Note that `initialize` and `close` are called on the **raw** handles, not on the wrappers. Both work —
the wrapper forwards every member — but the raw handle is what actually owns the connection, and reading
it that way makes the ownership obvious.

## The four members `initTelemetry` needs

`repository` is not `{ errors, logs }` alone — `initialize()` and `close()` are **required**:

```ts
interface TelemetryRepository {
  readonly errors: ErrorRepository;
  readonly logs: LogRepository;
  initialize(): Promise<StorageResult<void>>;
  close(): void;
}
```

| Member | Contract |
| --- | --- |
| `errors` / `logs` | The two stores. Wrapping them changes what is at rest, not their behaviour. |
| `initialize()` | The readiness gate. Uploads never begin before it resolves `true`. |
| `close()` | Called on `destroyTelemetry()`. Must be safe to call twice. |

`createEncryptingRepository(inner, provider, options)` returns `T & { inner: T; provider: EncryptionProvider }`
— the type of the repository you passed in, intersected with the wrapper. It **forwards every member** of
that repository and replaces only `getAll`, `get`, `save`, `saveBatch`, `claimPending` and `getFailed`. So
a wrapped error repository still has `getPending`, `requeueStale`, `delete`, `updateUploadStatus`, `count`,
`cleanup`, `clear`, **`initialize`** and **`close`**.

> **Source note.** Both `createErrorRepository` and `createLogRepository` are accepted, even though they
> differ — errors have `save` and no `saveBatch`; logs have `saveBatch` and no `save`. Type inference reads
> `T` straight off the argument, so **neither needs an explicit type argument**. A custom backend exposing
> neither `save` nor `saveBatch` is the one case where inference has nothing to work from, and there you
> name the record type: `createEncryptingRepository<ErrorRecord>(store, provider, { fields: [...] })`.

> **Source note.** `EncryptableRepository<T>` is still the documented shape a custom backend satisfies —
> every member is optional on it. The *parameter* is deliberately wider (`T extends object`) so that the
> two shipped repositories, which have different method sets, both infer correctly.

## Wiring it at bootstrap

The provider is read once, at initialisation, so this is bootstrap-time work. It is async, which is why
the factory cannot simply return a value.

```ts
// src/main.ts
import { bootstrapApplication } from '@angular/platform-browser';
import { captureError, setupTelemetry } from '@codewithrajat/rm-logvault';
import { provideTelemetryErrorHandler } from '@codewithrajat/rm-logvault/angular';
import { AppComponent } from './app/app.component';
import { createEncryptedRepository } from './app/telemetry/encrypted-repository';
import { environment } from './environments/environment';

async function start(): Promise<void> {
  const repository = await createEncryptedRepository({
    password: environment.vaultPassphrase,
    salt: environment.vaultSalt, // Uint8Array, stable across loads
  });

  setupTelemetry({
    app: 'checkout',
    version: environment.appVersion,
    url: environment.telemetryUrl,
    // Omit `repository` when undefined, so the built-in pair is used instead.
    ...(repository !== undefined ? { repository } : {}),
  });

  await bootstrapApplication(AppComponent, {
    providers: [provideTelemetryErrorHandler()],
  });
}

start().catch((error: unknown) => {
  // A bootstrap failure happens before any ErrorHandler exists.
  captureError(error, { source: 'manual', tags: { phase: 'bootstrap' } });
});
```

> **Source note.** `salt` must be the **same value on every load** or previously stored records cannot
> be decrypted. Persist it somewhere that is not this database — a build-time constant, or a
> server-supplied value. Changing it is equivalent to discarding the vault.

> **Source note.** `createAesGcmEncryptionProvider` returns `Promise<EncryptionProvider | undefined>`,
> and `undefined` means `crypto.subtle` is unavailable. That happens in any non-secure context,
> including plain `http:`. The conditional spread above is what turns that into **unencrypted local
> storage** rather than a failed bootstrap — a deliberate choice, and worth logging so the fallback is
> visible rather than silent.

## When a decrypt fails

Three cases, and each one is chosen so you lose nothing:

| Case | Result |
| --- | --- |
| `decrypt` throws — wrong key, a value written by a different provider, corruption | The field **keeps its stored value** instead of being blanked, and `onDecryptFailure(field, error)` is called. You see ciphertext in the report, which is a visible bug rather than a silently empty message. |
| `decrypt` returns an empty string | Treated as a failure, same as above. |
| `encrypt` throws | The field is written in **plaintext** rather than being dropped. A record you can read beats a record you lost. |

```ts
const rawErrors = createErrorRepository({ dbName: 'rm-logvault-errors' });

const errors = createEncryptingRepository(rawErrors, provider, {
  fields: ['componentStack'],
  onDecryptFailure: (field, error) => reportToYourOwnTelemetry(field, error),
});

// A record written under an old key reads back with `componentStack` still
// ciphertext, rather than with `componentStack: ''`.
```

The same principle applies in the other direction: a field whose **encryption** fails is written in
**plaintext** rather than dropped, so a broken provider never silently loses a record.

> **Source note.** `save`/`saveBatch` encrypt; `get`/`getAll`/`claimPending`/`getFailed` decrypt;
> `pendingCount` and `updateUploadStatus` pass straight through. The last two are deliberate — they key
> on `id`, `fingerprint` and `uploadStatus`, which encryption would break.

> **Source note.** The input record is never mutated. A dotted path such as `'api.url'` writes into a
> fresh copy of the nested object, so the record your repository handed out keeps its original values.

## What this does not change

- **The diagnostics export still contains plaintext.** The wrapper decrypts on read, so everything above
  the repository — including the report and the upload — works on the original values. That is the point,
  and it means the report is as sensitive as it ever was.
- **Redaction still runs first.** Fields are sanitized before they reach the repository, so encryption
  protects the residual, not a substitute for `redaction.*`.
- **The upload path is unaffected.** `RemoteTransport` receives an already-sanitized, already-serialised
  body built from decrypted records.

## Related

- [Observing and extending](./04-observing-and-extending.md) — the report formats that read these records
  back.
- [Replacing the store](./README.md#replacing-the-store) — the `TelemetryRepository` contract in full.
- [Privacy and GDPR](../../../docs/PRIVACY-GDPR.md) — retention, erasure and the `consent` gate.
