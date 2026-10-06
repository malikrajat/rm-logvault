# Encrypting stored records in a React app

**Problem it solves:** an error message can contain a customer name, an account number, or a stack trace
with a value in it. Redaction is the library's privacy control and it runs before every write — but if
someone else gets read access to the origin's storage, encryption is the second layer. This page wires it
up at initialisation, which is the only place it can go.

**What you will learn:**

- Choosing between the Base64 provider and AES-GCM, and being honest about what each one buys.
- Wrapping an error repository **and** a log repository, then assembling the object `initTelemetry` wants.
- Which fields to encrypt, and the ones you should think twice about.
- What happens when a field cannot be decrypted.
- Where this belongs in a React app — and why it is not a hook.

## First: Base64 is encoding, not encryption

```ts
import { createBase64EncryptionProvider } from '@codewithrajat/rm-logvault/storage';

const provider = createBase64EncryptionProvider();
```

It is `btoa(encodeURIComponent(value))`. It stops a record being readable at a glance in devtools, and it
provides **no confidentiality whatsoever** — anyone holding the stored value can decode it with `atob`.
The name is `base64` rather than `basic` precisely so that reading it in a config file is a warning. Use it
to stop an incidental screenshot being a data incident. Do not use it to protect a secret.

For real encryption, use AES-GCM through the platform's `crypto.subtle`:

```ts
import { createAesGcmEncryptionProvider } from '@codewithrajat/rm-logvault/storage';

// Your own constant. The library never reads import.meta.env or process.env.
const SALT = new Uint8Array([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16]);

const provider = await createAesGcmEncryptionProvider({
  password: passphrase,
  // The salt MUST be identical on every load, or previously stored records cannot
  // be decrypted. A build-time constant, never something generated at runtime.
  salt: SALT,
});
```

It returns `EncryptionProvider | undefined`, and `undefined` means `crypto.subtle` is **not available** —
which is every non-secure context, including a plain `http:` origin. That is a normal outcome on a local
development server, so handle it rather than assuming it worked:

```ts
// src/telemetry-encryption.ts
import {
  createAesGcmEncryptionProvider,
  createBase64EncryptionProvider,
} from '@codewithrajat/rm-logvault/storage';
import type { EncryptionProvider } from '@codewithrajat/rm-logvault/storage';

export async function createVaultProvider(): Promise<EncryptionProvider> {
  const aes = await createAesGcmEncryptionProvider({ password: passphrase(), salt: SALT });

  if (aes === undefined) {
    // `http://localhost` has no crypto.subtle. In development that is fine —
    // the alternative is refusing to run. NEVER ship this branch to production.
    if (import.meta.env.PROD) {
      throw new Error('AES-GCM is unavailable in a production (non-secure) context');
    }
    return createBase64EncryptionProvider();
  }

  return aes;
}
```

The defaults worth knowing: PBKDF2-SHA256 with **250 000** iterations derives an AES-GCM-256 key, the key
is derived **non-extractable** so a script on the page cannot read it back out, and each value gets a fresh
random 12-byte IV. `deriveAesKey(password, salt, iterations?)` and `createWebCryptoEncryptionProvider(key)`
are exported if you manage keys yourself.

> **Source note.** AES-GCM here is only as strong as where the key lives. A passphrase that ships in the
> same bundle as the code protects the database file, not the data from a determined reader of the page.
> There is no way around that in a browser without a server, and pretending otherwise is the actual bug.
> Redaction remains the primary control; this is defence in depth.

## Wrapping the repositories

`createEncryptingRepository` takes **one** repository, not the `{ errors, logs }` pair — so you wrap each
side and assemble the pair yourself. Both shipped repositories are accepted directly, even though they
differ: errors have `save` and logs have `saveBatch`.

```ts
// src/telemetry-repository.ts
import { createErrorRepository, createLogRepository } from '@codewithrajat/rm-logvault';
import type { StorageResult, TelemetryRepository } from '@codewithrajat/rm-logvault';
import { createEncryptingRepository } from '@codewithrajat/rm-logvault/storage';
import { createVaultProvider } from './telemetry-encryption';

export async function createEncryptedRepository(): Promise<TelemetryRepository> {
  const provider = await createVaultProvider();

  // The database names `databaseNames(dbPrefix)` would produce. Keeping them in
  // step with `dbPrefix` is what stops you silently starting from an empty vault.
  const rawErrors = createErrorRepository({ dbName: 'rm-logvault-errors' });
  const rawLogs = createLogRepository({ dbName: 'rm-logvault-logs' });

  const errorOptions = {
    fields: ['message', 'stack', 'componentStack', 'api.url'],
    onDecryptFailure: (field: string, error: unknown) => {
      // Called per field. The stored value is LEFT IN PLACE rather than blanked,
      // so a key rotation shows ciphertext instead of an empty report.
      reportDecryptFailure(field, error);
    },
  };

  // You now own the pair, including the readiness gate and the close.
  return {
    errors: createEncryptingRepository(rawErrors, provider, errorOptions),
    logs: createEncryptingRepository(rawLogs, provider, { fields: ['message', 'route'] }),
    initialize: async (): Promise<StorageResult<void>> => {
      const errorResult = await rawErrors.initialize();
      const logResult = await rawLogs.initialize();
      // Unusable only if BOTH failed: one working store is still useful.
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

Then hand it over at initialisation:

```ts
// src/telemetry.ts
import { setupTelemetry } from '@codewithrajat/rm-logvault';
import { createEncryptedRepository } from './telemetry-repository';

// Top-level await is fine in a Vite ESM entry.
const repository = await createEncryptedRepository();

setupTelemetry({
  app: 'checkout',
  url: '/telemetry',
  repository,
});
```

> **Source note.** `initialize` and `close` are required on the object you pass as `repository`, and the
> `Promise<StorageResult<void>>` annotation on `initialize` is **not** optional — without it TypeScript
> cannot unify the `errorResult` branch with the `{ ok: true, value: undefined }` branch. The wrapped
> repositories **do** keep both methods: the wrapper forwards **every** member of the repository you hand
> it and replaces only `getAll`, `get`, `save`, `saveBatch`, `claimPending` and `getFailed`. So
> `createEncryptingRepository(rawErrors, provider, options)` still has `getPending`, `requeueStale`,
> `delete`, `updateUploadStatus`, `count`, `cleanup`, `clear`, `initialize` and `close`, and its type is
> your repository's type intersected with the wrapper — which is what lets the assembled object satisfy
> `TelemetryRepository` directly.
>
> Type inference reads `T` straight off the argument, so neither shipped repository needs an explicit type
> argument. A custom backend that exposes **neither** `save` nor `saveBatch` is the one case where
> inference has nothing to work from, so name the record type:
> `createEncryptingRepository<ErrorRecord>(myCustomStore, provider, { fields: ['message'] })`.

> **Source note.** `fields` accepts a plain name (`'message'`) or a **dotted path** one level deep
> (`'api.url'`). Nested paths are cloned on write, so the record you pass is never mutated — which matters,
> because a by-reference store would otherwise un-encrypt its own vault on the next read.

## Which fields, and which to leave alone

Encryption changes a field's **value**, so encrypt what a human reads back and leave what the machinery
keys on:

| Field | Encrypt? | Why |
| --- | --- | --- |
| `message`, `stack`, `componentStack` | Yes | the most likely place for a name, an id or a token |
| `api.url` | Usually | paths and query strings carry identifiers |
| `tags` values | Sometimes | but they are what you group and filter by |
| `id`, `fingerprint` | **No** | the row key and the grouping key |
| `uploadStatus`, `timestamp`, `occurrenceCount` | **No** | the outbox depends on them |

The outbox is the reason: `pendingCount` and `updateUploadStatus` pass straight through the wrapper
untouched, because they key on `id`, `fingerprint` and `uploadStatus`. Encrypting those would stop records
being claimed for upload at all.

> **Source note.** Aggregation is unaffected — `createErrorRepository.save` merges by `fingerprint`, which
> is computed on the plaintext record before the wrapper encrypts anything, and the merge spreads the
> existing stored row so encrypted fields survive. The real costs of encrypting `message` are that you can
> no longer **search** the vault, and a support engineer reading the report needs the key. Decide that
> deliberately.

Two more practical notes:

- **Derivation is not free.** The wrapper encrypts fields sequentially and awaits each one, so 250 000
  PBKDF2 iterations apply once at key derivation and a fresh AES operation applies per field per record. A
  chatty page with a large `fields` list will feel it.
- **Key rotation is a data-loss decision.** A record encrypted under an old key fails to decrypt, keeps its
  stored value, and calls `onDecryptFailure` — visible and diagnosable rather than silently empty, but
  still unreadable. Plan the rotation before you need it.

## Standalone helpers

If you drive your own repository, the two transforms are exported on their own:

```ts
import { decryptRecordFields, encryptRecordFields } from '@codewithrajat/rm-logvault/storage';

const encrypted = await encryptRecordFields(record, ['message'], provider);
const plaintext = await decryptRecordFields(encrypted, ['message'], provider, (field, error) => {
  reportDecryptFailure(field, error);
});
```

Both return a **copy**; the input is never mutated. A field whose encryption fails is written in
**plaintext** rather than lost — the library prefers a readable record over a missing one and reports the
failure internally.

## Where this goes in a React app

This is **initialisation-time wiring, not a hook.** The provider and the wrapped repositories must exist
before the first capture, and the choice of where records live is fixed once `initTelemetry` returns —
it is idempotent, so a second call installs nothing.

That means:

- Build the provider and the repository in a **module**, not in a component or an effect.
- There is no `useEncryption()`. A hook that returned the provider would hand the key to any component
  that asked for it, for no benefit.
- If you genuinely need to change it at runtime, that is `destroyTelemetry()` followed by a fresh
  `setupTelemetry()` — a deliberate teardown, not a reconfiguration API.

If the passphrase has to come from the user (an unlock screen rather than a build-time constant), the
honest shape is: render an unlock route, store nothing until it resolves, and initialise telemetry after.
Do not start capturing into an unencrypted vault and migrate later — the records written before the unlock
are the ones you would have to explain.

## Related

- [../../vanilla/more-advanced/06-encrypting-stored-records.md](../../vanilla/more-advanced/06-encrypting-stored-records.md)
  — the same feature with no framework framing: the provider comparison, rolling your own, and what each
  failure mode does.
- [observing and extending](./04-observing-and-extending.md) — the sinks and events the wrapped
  repositories sit under.
- [the seams](./02-repository-transport-and-hooks.md) — the full `TelemetryRepository` contract, and why
  `initialize()` and `close()` are required.
- [../../vanilla/more-advanced/01-custom-repository.md](../../vanilla/more-advanced/01-custom-repository.md)
  — the both-failed readiness gate in depth.
- [docs/PRIVACY-GDPR.md](../../../docs/PRIVACY-GDPR.md) — what is stored field by field, and retention.
