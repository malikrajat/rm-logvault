# more-advanced — encrypting stored records

**Problem it solves:** a stored error message can contain a customer name, an account number, or a
stack frame with a value in it. Redaction is the library's privacy control and runs before anything is
written — but if someone else gets read access to the origin's storage, you may want a second layer.

**What you will learn:**

- Why the Base64 provider is encoding and **not** encryption.
- AES-GCM-256 through `crypto.subtle`, and the non-secure-context fallback.
- Wrapping an error repository **and** a log repository — they are separate objects.
- Assembling the `{ errors, logs, initialize, close }` object `initTelemetry` expects.
- Which fields to encrypt, and why encrypting `message` or `stack` is a trade, not a free win.
- What happens when a field cannot be decrypted.

## Read this before choosing a provider

Encryption here is **defence in depth, not the privacy control**. The default position is that
redaction does the work: sensitive keys, URL parameters and free-text patterns are stripped **before a
record is written**, so an unencrypted vault is already scrubbed. Encryption protects against read
access to the origin's storage — a database dump, a shared device, a forensic copy — and nothing else.

That framing matters because of what the two shipped providers actually are:

| Provider | What it is | Protects against |
| --- | --- | --- |
| `createBase64EncryptionProvider()` | **Encoding, not encryption.** `btoa(encodeURIComponent(x))`. | Someone glancing at a record in devtools. Nothing else. |
| `createAesGcmEncryptionProvider({ password, salt })` | Real AES-GCM-256 via `crypto.subtle`, PBKDF2-SHA256 key derivation. | A database dump, up to the strength of wherever the key lives. |

> **Source note.** The Base64 provider is named `base64` rather than `basic` on purpose. Anyone with the
> stored value can decode it with `atob`. Do not use it for a secret.

> **Source note.** AES-GCM is only as strong as where you keep the key. A passphrase shipped in the same
> bundle as your code protects the database **file**, not the data from a determined reader of the page.
> There is no way around that in a browser without a server, and pretending otherwise would be the bug.

## The AES provider, and the fallback

```ts
// src/encryption.ts
import {
  createAesGcmEncryptionProvider,
  type EncryptionProvider,
} from '@codewithrajat/rm-logvault/storage';

/**
 * `undefined` means `crypto.subtle` is unavailable — a non-secure context, which
 * includes plain `http:` and some embedded webviews. Handle it rather than
 * assuming encryption happened.
 */
export async function createVaultEncryption(): Promise<EncryptionProvider | undefined> {
  const password = import.meta.env.VITE_VAULT_PASSPHRASE;
  if (typeof password !== 'string' || password.length === 0) return undefined;

  return createAesGcmEncryptionProvider({
    password,
    // Must be the SAME value on every load, or previously stored records cannot be
    // decrypted. Persist it somewhere that is not this database.
    salt: new Uint8Array([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16]),
    iterations: 250_000, // default
  });
}
```

`createAesGcmEncryptionProvider` resolves `undefined` when `crypto.subtle` is missing. That detection is
not a formality: `crypto.subtle` is absent in any non-secure context, so a deployment served over plain
`http:` from a non-localhost host gets `undefined` and must be told what to do.

```ts
// src/main.ts
import { createApp } from 'vue';
import { setupTelemetry } from '@codewithrajat/rm-logvault';
import App from './App.vue';
import { createVaultEncryption } from './encryption';
import { createEncryptedRepository } from './encrypted-repository';

const provider = await createVaultEncryption();

setupTelemetry({
  app: 'checkout',
  version: __APP_VERSION__,
  url: '/telemetry',
  ...(provider !== undefined ? { repository: createEncryptedRepository(provider) } : {}),
});

createApp(App).mount('#app');
```

Without a provider the library falls back to its own unencrypted IndexedDB pair, which is a reasonable
degradation — records are still redacted. Silently using the Base64 provider instead would be worse: it
looks like encryption in the code and is not.

## Wrapping the repositories

`createEncryptingRepository` wraps **one** repository — the `save`/`get`/`getAll` shape of
`createErrorRepository(...)` or `createLogRepository(...)`, not the `{ errors, logs }` pair. So you wrap
each store individually and assemble the pair yourself:

```ts
// src/encrypted-repository.ts
import {
  createErrorRepository,
  createLogRepository,
  type StorageResult,
  type TelemetryRepository,
} from '@codewithrajat/rm-logvault';
import {
  createEncryptingRepository,
  type EncryptionProvider,
} from '@codewithrajat/rm-logvault/storage';

export function createEncryptedRepository(provider: EncryptionProvider): TelemetryRepository {
  const rawErrors = createErrorRepository({
    dbName: 'checkout-errors',
    // Automatic retention is OFF unless you pass a policy. The built-in pair
    // derives these from `errors.retentionDays` and `errors.maxRecords`; a
    // hand-assembled repository has to say so itself.
    cleanupPolicy: { retentionDays: 7, maxRecords: 500 },
  });

  const rawLogs = createLogRepository({
    dbName: 'checkout-logs',
    cleanupPolicy: { retentionDays: 3, maxRecords: 2000 },
  });

  // `message` and `stack` are the fields most likely to carry a customer value.
  // `api.url` is a dotted path; nesting is supported one level deep.
  const errorOptions = {
    fields: ['message', 'stack', 'componentStack', 'api.url'],
    onDecryptFailure: (field: string, error: unknown) => {
      // Fired per field. The stored value is kept, so this is a diagnosis hook,
      // not a data-loss handler.
      console.warn(`[vault] could not decrypt ${field}`, error);
    },
  };

  return {
    // The wrapper forwards every member of the repository you hand it and
    // replaces only the ones that carry records, so these are full
    // `ErrorRepository` / `LogRepository` values — including `initialize` and
    // `close` — and are directly assignable here.
    errors: createEncryptingRepository(rawErrors, provider, errorOptions),
    logs: createEncryptingRepository(rawLogs, provider, { fields: ['message'] }),

    // The one thing still yours to write: the readiness gate. The annotation is
    // required, or TypeScript cannot unify the two branches.
    initialize: async (): Promise<StorageResult<void>> => {
      const errorResult = await rawErrors.initialize();
      const logResult = await rawLogs.initialize();
      // Mirror the built-in pair: one working store is still useful, so only a
      // total failure is reported as unusable.
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

Because the wrapper **forwards** what it does not transform, the wrapped values keep `getPending`,
`requeueStale`, `delete`, `updateUploadStatus`, `count`, `cleanup`, `clear`, `initialize` and `close` —
only `getAll`, `get`, `save`, `saveBatch`, `claimPending` and `getFailed` are replaced with a
decrypting/encrypting version. That is also why the return type is your repository's type intersected
with `{ inner, provider }`: an `ErrorRepository` in gives an `ErrorRepository` out, so the assembled
object satisfies `TelemetryRepository` with no casts.

> **Source note.** The two shipped factories differ — errors have `save` and no `saveBatch`; logs have
> `saveBatch` and no `save` — and **both are accepted**. Type inference reads the record type straight off
> the argument, so neither needs an explicit type argument. A custom backend that exposes neither `save`
> nor `saveBatch` is the one case where inference has nothing to work from:
>
> ```ts
> createEncryptingRepository<ErrorRecord>(myCustomStore, provider, { fields: ['message'] });
> ```
>
> `EncryptableRepository<T>` is still exported: it is the documented shape a custom backend satisfies,
> with every member optional, so you only provide the record methods you actually implement.

`TelemetryRepository` is four members, and `initialize()` and `close()` are **required**:

```ts
interface TelemetryRepository {
  readonly errors: ErrorRepository;
  readonly logs: LogRepository;
  initialize(): Promise<StorageResult<void>>;
  close(): void;
}
```

## Which fields to encrypt

| Field | Encrypt? | Consequence |
| --- | --- | --- |
| `message` | Usually | Ciphertext at rest. `'json'`/`'csv'` exports still decrypt on read. The field is no longer readable in devtools. |
| `stack` | Often | The largest field, and the most likely to contain a value in a frame. Costs the most bytes. |
| `componentStack` | Often | Same reasoning; Vue's own trace and your component names. |
| `api.url` | Sometimes | A dotted path. Query-string values are already redacted by the sanitizer before storage. |
| `name`, `severity`, `category`, `source` | No | Low-cardinality classification. Encrypting them destroys their usefulness for grouping. |
| `fingerprint` | **Never** | It is the aggregation index key. See below. |
| `id`, `uploadStatus`, `timestamp`, `occurrenceCount` | **Never** | Encrypting these breaks the outbox: claiming, counting and ordering all key on them. |

> **Source note — `message` is safe to encrypt, `fingerprint` is not.** Verified against a real
> IndexedDB:
>
> | Provider | `fields` | Rows for three identical failures |
> | --- | --- | --- |
> | Deterministic | `['message']` | **1** row, `occurrenceCount: 3` |
> | Deterministic | `['fingerprint', 'message']` | **1** row — aggregation still works |
> | Non-deterministic (what AES-GCM is) | `['message']` | **1** row, `occurrenceCount: 3` |
> | Non-deterministic (what AES-GCM is) | `['fingerprint']` | **3** rows, each `occurrenceCount: 1` |
>
> `errorRepository.save` looks up the `[fingerprint, 'uploadStatus']` **index** and merges into the
> match. Encrypting `fingerprint` therefore changes the key it looks up, and whether the rows still
> collapse depends entirely on whether your provider is deterministic — which is a property you should
> not have to think about. `createAesGcmEncryptionProvider` is **not** deterministic: it uses a fresh
> random IV per value, so three identical failures become three rows and the `occurrenceCount` a report
> shows stops meaning anything.
>
> Aggregation is unaffected by encrypting `message`, because the fingerprint is computed at
> **ingestion** from the sanitized text, before any encryption happens.

What you lose by encrypting `message` is anything that reads the **stored** text: you can no longer
search the vault for a message, group by a `stack` prefix in devtools, or read a record by eye. The
diagnostics export decrypts on read, so a report still shows plaintext — which is the point, and also
means the report is only as protected as the machine that produced it.

The wrapper encrypts on write and decrypts on read, so everything above the repository sees plaintext,
including the export. `pendingCount`, `updateUploadStatus` and cleanup are forwarded untouched: they key
on `id` and `uploadStatus`, which encryption would break.

## When a field cannot be decrypted

A wrong passphrase, a rotated key, or a record written by a different provider produces a decryption
failure. The behaviour is deliberately conservative:

| Situation | What happens |
| --- | --- |
| A field fails to **decrypt** | The field **keeps its stored value** rather than being blanked, and `onDecryptFailure(field, error)` is called. |
| A field fails to **encrypt** | The field is written in **plaintext** rather than being lost. |
| The input record | Is **never mutated**. Each object along a written path is copied first, so a dotted path cannot leak ciphertext into your live object. |

> **Source note.** Keeping the stored value on a failed decrypt is why a key rotation produces a
> readable error instead of silently empty reports. A blanked `message` looks like a record that was
> captured with no content, which is indistinguishable from data loss.

That also means a wrong passphrase does not throw — you get records whose `message` is a Base64 blob of
IV-plus-ciphertext, plus one `[Telemetry] decrypt:<field> failed` line per field. Check `onDecryptFailure`
if you want to escalate it.

## Framework notes for Vue

- **Encryption does not change where you initialise.** It is still `setupTelemetry` /
  `initTelemetry` in `main.ts`, before `mount()`. Only `repository` changes.
- **`createVaultEncryption()` is async** — PBKDF2 over 250 000 iterations is deliberately slow. Await it
  before `mount()`, or the first errors a component throws would reach an unencrypted store.
- **Do not put the passphrase in a `ref`.** A `VITE_` value is in the bundle and visible to anyone who
  reads your JavaScript; a `ref` additionally puts it in Vue devtools.
- **Replacing `repository` requires `destroyTelemetry()` first**, because `initTelemetry` is idempotent
  and a second call ignores new options. Same rule as any other reconfiguration.
- **The Vue adapter is unaffected.** `createTelemetryVuePlugin` installs hooks; it does not care which
  repository is in force.

## Related

- The observation surface, including the export formats that decrypt on read:
  [04-observing-and-extending.md](./04-observing-and-extending.md).
- The HTTP client that ships alongside this subpath:
  [05-using-the-http-client.md](./05-using-the-http-client.md).
- Replacing the store, the transport and the logger:
  [README.md](./README.md).
- The privacy design encryption sits behind:
  [docs/PRIVACY-GDPR.md](../../../docs/PRIVACY-GDPR.md).
