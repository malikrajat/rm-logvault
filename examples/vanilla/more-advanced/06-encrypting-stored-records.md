# Encrypting stored records

**Problem it solves:** the library redacts before it writes, so an unencrypted vault is already scrubbed
of tokens, emails, phone numbers and allow-listed URL parameters. What redaction cannot do is protect the
database file itself. If someone gets read access to the origin's IndexedDB — a shared machine, a forensic
image, a browser profile backup — they get every message and stack that survived redaction, because those
are stored as plain text.

`@codewithrajat/rm-logvault/storage` closes that gap, and is deliberately honest about how far it closes
it.

**What you will learn:**

- Why redaction is the privacy control and encryption is only defence in depth.
- The two shipped providers, and which one is **not** encryption.
- Wrapping a repository so chosen fields are encrypted at rest.
- Which fields you should **not** encrypt, and what breaks if you do.
- Wiring the wrapped repositories into `initTelemetry`.
- What happens when a value cannot be decrypted.

## Read this before choosing a provider

| Provider | What it actually does | Protects against |
| --- | --- | --- |
| `createBase64EncryptionProvider()` | Base64-encodes a value. | A screenshot, and a casual look in devtools. **Nothing else** — anyone can `atob` it. |
| `createAesGcmEncryptionProvider({...})` | Real AES-GCM-256, key derived with PBKDF2-SHA256. | A dump of the database, *given* the key is not also in that dump. |

The name `base64` is chosen over the friendlier `basic` precisely so it cannot be mistaken for security.
It is a light obfuscation for a record that would otherwise be readable at a glance.

For AES, understand the boundary: the key is derived from a passphrase that your bundle eventually
contains. That protects the **data at rest** against someone who has the storage but not the code. It does
not protect against someone running your page, because they can run the same derivation. There is no way
around that in a browser without a server holding the key, and claiming otherwise would be the bug.

> **Source note.** `createAesGcmEncryptionProvider` returns `undefined` when `crypto.subtle` is
> unavailable — which is the case in any **non-secure context**, including plain `http:` on a non-localhost
> origin. Always handle the `undefined` branch; do not assume a provider came back.

## Encrypting a repository

`createEncryptingRepository` wraps **one** repository. It takes the `save`/`get`/`getAll`/`claimPending`
shape — the same shape as `createErrorRepository(...)` or `createLogRepository(...)` — not the
`{ errors, logs }` pair.

```ts
import { createErrorRepository, createLogRepository, initTelemetry } from '@codewithrajat/rm-logvault';
import type { StorageResult } from '@codewithrajat/rm-logvault';
import {
  createAesGcmEncryptionProvider,
  createEncryptingRepository,
} from '@codewithrajat/rm-logvault/storage';

// Must be identical on every load, or previously stored rows cannot be read back.
// Keep it out of this database: a build-time constant, or a server-supplied value.
const SALT = new Uint8Array([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16]);

const provider = await createAesGcmEncryptionProvider({
  password: import.meta.env.VITE_VAULT_PASSPHRASE,
  salt: SALT,
  // iterations: 250_000,  // the default
});

if (provider === undefined) {
  // Not a secure context. Fall back to the local-only default rather than
  // silently storing plain text while claiming it is encrypted.
  initTelemetry({ appName: 'checkout' });
} else {
  const rawErrors = createErrorRepository({ dbName: 'rm-logvault-errors' });
  const rawLogs = createLogRepository({ dbName: 'rm-logvault-logs' });
  const options = { fields: ['message'] };

  // You now own the pair, including the readiness gate and the close.
  const repository = {
    errors: createEncryptingRepository(rawErrors, provider, options),
    logs: createEncryptingRepository(rawLogs, provider, options),
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

  initTelemetry({ appName: 'checkout', url: '/telemetry', repository });
}
```

> **Source note.** `initialize` and `close` are required on the object you pass as `repository`, and
> each wrapped repository keeps them — the wrapper forwards **every** member of the repository you hand
> it and replaces only `getAll`, `get`, `save`, `saveBatch`, `claimPending` and `getFailed`. So
> `createEncryptingRepository(rawErrors, provider, options)` still has `getPending`, `requeueStale`,
> `delete`, `cleanup`, `initialize` and `close`, and its type is your repository's type intersected with
> the wrapper — which is what lets the assembled object satisfy `TelemetryRepository` directly.
>
> Both `createErrorRepository` and `createLogRepository` are accepted even though they differ: errors
> have `save` and logs have `saveBatch`. Inference reads the type straight off the argument you pass, so
> neither needs an explicit type argument.

A backend that exposes neither `save` nor `saveBatch` is the one case where inference has nothing to
work from, so name the record type:

```ts
createEncryptingRepository<ErrorRecord>(myCustomStore, provider, { fields: ['message'] });
```

## Which fields to encrypt, and which to leave alone

This is the part that decides whether encryption helps or hurts.

| Field | Encrypt? | Why |
| --- | --- | --- |
| `message` | Usually yes | The most likely place for a customer name or an order id. Aggregation is unaffected — the fingerprint is computed at ingestion, from the sanitized text, before any encryption. |
| `stack` | Sometimes | Useful to hide, but it is large, so the cost per record is highest here. |
| A nested field such as `api.url` | Yes | Dotted paths are supported: `fields: ['message', 'api.url']`. |
| `fingerprint` | **Never** | It is the aggregation index key. `save` looks up `[fingerprint, 'uploadStatus']`, so changing it breaks the grouping — see the note below. |
| `id`, `uploadStatus`, `timestamp` | **Never** | Indexed and queried. Wrapping them breaks claiming, counting and cleanup. |
| `level`, `severity`, `source` | No | Low-cardinality labels you filter on; encrypting them makes the report unusable. |

The rule underneath the table: **encrypt what you read back for a human, never what the library groups,
indexes or claims on.** Encryption changes a value, so anything used as a key stops matching.

> **Source note — verified against a real IndexedDB.** `errorRepository.save` finds the row to merge
> into with `IDBIndex.get(IDBKeyRange.only([record.fingerprint, 'uploadStatus']))`. Encrypting
> `fingerprint` therefore changes the key being looked up, and whether identical failures still collapse
> depends on whether your provider is **deterministic** — which is not a property you should have to
> reason about. Measured, for three identical failures:
>
> | Provider | `fields` | Result |
> | --- | --- | --- |
> | Deterministic | `['message']` | 1 row, `occurrenceCount: 3` |
> | Deterministic | `['fingerprint', 'message']` | 1 row, `occurrenceCount: 3` |
> | Non-deterministic — **what AES-GCM is** | `['message']` | 1 row, `occurrenceCount: 3` |
> | Non-deterministic — **what AES-GCM is** | `['fingerprint']` | **3 rows, each `occurrenceCount: 1`** |
>
> `createAesGcmEncryptionProvider` uses a fresh random IV per value, so it is non-deterministic. Encrypt
> `message` and leave `fingerprint` alone.

`pendingCount` and `updateUploadStatus` pass straight through the wrapper untouched, because they key on
`id` and `uploadStatus`. So does cleanup. That is by design, not an omission.

> **Source note — only string values are transformed.** `encryptRecordFields` returns early unless
> `typeof value === 'string'`, so a field holding an object or an array is **silently skipped**. That makes
> `fields: ['extra']` and `fields: ['tags']` no-ops, and it is the reason a log store is a poor candidate:
> a `LogRecord`'s only strings are `message`, `route` and `level`, while its `data` and `environment`
> members are objects. There is no error — the fields are simply written in plaintext, so verify with
> `getAll()` on the unwrapped repository if you need to be sure a field really is encrypted.
>
> Dotted paths reach a string nested one level deep (`'api.url'`, `'api.statusText'`), which is how you
> encrypt part of an object even though you cannot encrypt the object itself.

## What happens when a value cannot be read back

Three cases, and each one is chosen so you lose nothing:

| Case | Result |
| --- | --- |
| `decrypt` throws — wrong key, a value written by a different provider, corruption | The field **keeps its stored value** instead of being blanked, and `onDecryptFailure(field, error)` is called. You see ciphertext in the report, which is a visible bug rather than a silently empty message. |
| `decrypt` returns an empty string | Treated as a failure, same as above. Blanking a message would be worse than showing it. |
| `encrypt` throws | The field is written in **plaintext** rather than being dropped. A record you can read beats a record you lost. |

The wrapper also never mutates the record you hand it. A dotted path such as `'api.url'` writes into a
fresh copy of `api`, so encrypting cannot leak ciphertext into a live object you still hold.

## Rolling your own provider

The interface is two functions, either of which may be async:

```ts
import type { EncryptionProvider } from '@codewithrajat/rm-logvault/storage';

export const provider: EncryptionProvider = {
  name: 'kms-wrapped',
  encrypt: async (plaintext) => wrapWithServerKey(plaintext),
  decrypt: async (stored) => unwrapWithServerKey(stored),
};
```

A provider that delegates to a server is the only variant that raises the bar meaningfully, because the key
never reaches the browser. It also makes the vault unreadable offline, which may be exactly the trade you
want — or exactly the one you do not.

For a key you already manage yourself:

```ts
import { createWebCryptoEncryptionProvider, deriveAesKey } from '@codewithrajat/rm-logvault/storage';

const key = await deriveAesKey(passphrase, salt);
const provider = key === undefined ? undefined : createWebCryptoEncryptionProvider(key);
```

The derived key is **non-extractable**, so a script on the page cannot read it back out of the `CryptoKey`
object.

## Standalone use

If you want the transform without the repository wrapper — a one-off migration, or your own store:

```ts
import { decryptRecordFields, encryptRecordFields } from '@codewithrajat/rm-logvault/storage';

const encrypted = await encryptRecordFields(record, ['message', 'api.url'], provider);
const plain = await decryptRecordFields(encrypted, ['message', 'api.url'], provider);
```

Both return a copy. Neither mutates the input.

## Related

- [custom repository](./01-custom-repository.md) — the full contract this page only assembles.
- [PRIVACY-GDPR.md](../../../docs/PRIVACY-GDPR.md) — retention, consent and erasure, which are the
  controls that matter more than encryption.
- [SECURITY.md](../../../docs/SECURITY.md) — the redaction design, and what is never read in the first
  place.
- [events, context builders and named sinks](./04-events-and-context-builders.md) — observing what got
  stored.
