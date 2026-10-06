# Encrypting stored records

**Problem it solves:** a stored error message can contain a customer name, an account number, or a stack
frame with a value in it. Redaction strips the patterns it knows about *before* a record is written —
but if you want a second line of defence against someone reading the origin's IndexedDB directly, you
need encryption at rest, and you need to know exactly how weak each option is.

**What you will learn:**

- Why Base64 is **encoding, not encryption**, and what it actually buys.
- `createAesGcmEncryptionProvider`, and the `crypto.subtle` fallback you must handle.
- Wrapping an **error** repository and a **log** repository — the wrapper takes one, not the pair, and
  gives your repository's own type back so it drops into `TelemetryRepository` directly.
- Which fields to encrypt, and which encryption would actively break.
- The failed-decrypt behaviour that makes a key rotation survivable.
- Rolling your own provider, including a Route Handler that holds the key server-side.

> **Client-only.** IndexedDB does not exist during SSR, and `crypto.subtle` is unavailable in a
> non-secure context. Every snippet here belongs in a `'use client'` module or the provider effect — see
> [01-framework-adapter.md](./01-framework-adapter.md).

## Read this before choosing a provider

| Provider | What it really is | Protects against |
| --- | --- | --- |
| `createBase64EncryptionProvider()` | `btoa(encodeURIComponent(x))`. **Encoding.** | Someone glancing at a record in DevTools. Nothing else. |
| `createAesGcmEncryptionProvider({ password, salt })` | Real AES-GCM-256 via `crypto.subtle`, key derived with PBKDF2-SHA256 | A database dump — **and only that**, if the password ships in the same bundle. |

The library's default position is that **redaction, not encryption, is the privacy control**. The
sanitizer runs before a record is written, so an unencrypted vault is already scrubbed. Encryption is
defence in depth for read access to the origin's storage.

Be honest about the AES case: a key derived from a passphrase that ships in the same bundle protects the
database *file*, not the data from anyone who can read the page. There is no way around that in a
browser without a server, and pretending otherwise is the actual bug.

> **Source note.** `createBase64EncryptionProvider` is named `base64` rather than `basic` on purpose. It
> provides no confidentiality whatsoever — anyone holding the value can decode it with `atob`.

## Getting a provider, and handling the fallback

```ts
// app/encryption.ts — a client module
'use client';

import {
  createAesGcmEncryptionProvider,
  type EncryptionProvider,
} from '@codewithrajat/rm-logvault/storage';

// Must be the SAME value on every load, or previously stored records cannot be
// decrypted. Persist it somewhere that is not this database — a build-time constant,
// or a value your server hands the client.
const SALT = new Uint8Array([
  18, 52, 86, 120, 144, 171, 205, 239, 18, 52, 86, 120, 144, 171, 205, 239,
]);

export async function createVaultEncryption(): Promise<EncryptionProvider | undefined> {
  return createAesGcmEncryptionProvider({
    password: process.env.NEXT_PUBLIC_VAULT_PASSPHRASE ?? '',
    salt: SALT,
    iterations: 250_000, // the default
  });
}
```

`createAesGcmEncryptionProvider` returns **`undefined`** when `crypto.subtle` is unavailable, which is
any non-secure context — plain `http:`, and some embedded webviews. That is a return value rather than a
throw, so the fallback is explicit. This is also where the assembled repository gets handed over:

```tsx
// app/providers.tsx
'use client';

import { useEffect, type ReactElement, type ReactNode } from 'react';
import { destroyTelemetry, initTelemetry } from '@codewithrajat/rm-logvault';
import { createVaultEncryption } from './encryption';
import { createEncryptedRepository } from './encrypted-repository';

export function Providers({ children }: { readonly children: ReactNode }): ReactElement {
  useEffect(() => {
    let disposed = false;

    void (async () => {
      const provider = await createVaultEncryption();
      if (disposed) return;

      if (provider === undefined) {
        // No crypto.subtle: still record, just without encryption at rest. Redaction
        // is unaffected — it already ran before storage.
        console.warn('[vault] crypto.subtle unavailable; storing unencrypted');
        initTelemetry({ appName: 'checkout' });
        return;
      }

      initTelemetry({
        appName: 'checkout',
        url: '/api/telemetry',
        repository: createEncryptedRepository(provider),
      });
    })();

    return (): void => {
      disposed = true;
      destroyTelemetry();
    };
  }, []);

  return <>{children}</>;
}
```

> **Source note.** `initialize()` is a **required** member of the `repository` contract, not optional —
> it is the readiness gate, and sync never starts before it resolves `true`. Supplying your own pair also
> means the database names and cleanup policies are yours to keep in step with `dbPrefix` and
> `errors.*`; that is why `createEncryptedRepository` above calls `createErrorRepository({ dbName })`
> explicitly instead of relying on the default pair.

> **Source note.** `setupTelemetry` cannot express this one. Its `SimpleTelemetryOptions` is a `Pick` of
> `TelemetryOptions` that deliberately omits `repository` — a repository is a live object, not a
> configuration value, and the flat shape is for the shortest setup rather than the full one. So a
> custom store goes through `initTelemetry`, which is the same function underneath and equally
> idempotent. The two are interchangeable, so mixing them in one app is fine.

> **Source note.** `deriveAesKey(password, salt, iterations)` and
> `createWebCryptoEncryptionProvider(key)` are exported separately. Reach for them when the key comes
> from your own key management rather than a passphrase — `createWebCryptoEncryptionProvider` wraps an
> existing `CryptoKey`, and returns `undefined` on the same `crypto.subtle` check.

## The wrapper takes **one** repository, and gives your type back

This is the detail that trips people up. `createEncryptingRepository` wraps a **single** repository, not
the `{ errors, logs }` pair — so you wrap each one separately and assemble the pair yourself.

The returned type is **your repository's type intersected with the wrapper**
(`T & { inner: T; provider }`), not a narrow substitute. That matters: it means
`createEncryptingRepository(rawErrors, provider, options)` still has `getPending`, `requeueStale`,
`delete`, `updateUploadStatus`, `count`, `cleanup`, `clear`, **`initialize`** and **`close`** — the whole
`ErrorRepository` surface that `initTelemetry` needs. The wrapper forwards every member you hand it and
replaces only the six that carry record values: `getAll`, `get`, `save`, `saveBatch`, `claimPending` and
`getFailed`.

```ts
// app/encrypted-repository.ts — a client module
'use client';

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
  const rawErrors = createErrorRepository({ dbName: 'rm-logvault-errors' });
  const rawLogs = createLogRepository({ dbName: 'rm-logvault-logs' });

  return {
    // Each wrapped repository is still a full ErrorRepository / LogRepository, so it
    // drops straight into the pair. No cast, and no need to keep a second handle.
    errors: createEncryptingRepository(rawErrors, provider, {
      fields: ['message', 'stack', 'causes.message', 'causes.stack', 'api.url'],
      onDecryptFailure: (field, error) => {
        // The field keeps its STORED value, so a rotation shows up as readable
        // ciphertext instead of a silently blank report.
        console.warn(`[vault] could not decrypt ${field}`, error);
      },
    }),
    logs: createEncryptingRepository(rawLogs, provider, {
      fields: ['message', 'data', 'route'],
    }),
    initialize: async (): Promise<StorageResult<void>> => {
      const errorResult = await rawErrors.initialize();
      const logResult = await rawLogs.initialize();
      // Mirror the built-in pair: unusable only if BOTH stores failed.
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

> **Source note.** Two things about that snippet are load-bearing.
>
> **No explicit type argument is needed.** Inference reads `T` straight off the argument you pass, so
> `createEncryptingRepository(rawErrors, provider, options)` works without help. Both shipped factories
> are accepted even though they differ — errors have `save` and logs have `saveBatch`. Only a custom
> backend that exposes **neither** `save` nor `saveBatch` leaves inference nothing to work from, and that
> is the one case that needs the record type named:
> `createEncryptingRepository<ErrorRecord>(myStore, provider, { fields: ['message'] })`.
>
> **`initialize` needs its explicit `Promise<StorageResult<void>>` return annotation.** Without it
> TypeScript cannot unify the `errorResult` early-return branch with the `ok: true` branch, and the
> object stops satisfying `TelemetryRepository`. It is the only annotation this pattern requires.

`EncryptableRepository<T>` is still exported, and it is now the documented **shape** a custom backend
satisfies rather than a constraint on the wrapper — every member is optional, so a backend only has to
provide the record methods it actually implements.

## Which fields to encrypt

`fields` accepts a plain name (`'message'`) or a dotted path for one level of nesting (`'api.url'`). A
path that matches nothing is skipped silently — a record's shape varies by source, and reporting a miss
per record would be noise.

| Field | Encrypt? | Why |
| --- | --- | --- |
| `message`, `stack`, `causes.*` | **Yes** — the usual choice | The likeliest place for PII in a record. |
| `api.url` | **Yes**, if URLs carry identifiers | Path and query are already sanitized, but a path can name an entity. |
| `tags`, `extra` | Sometimes | Free-form, so they can hold anything. |
| `route` | Rarely | A path, and useful for grouping. |
| `fingerprint` | **No** | It is the aggregation key. The library groups on the stored value, so encrypting it defeats the index it exists for. |
| `id`, `uploadStatus`, `timestamp` | **No** | The repository keys and indexes on these. |
| `level`, `severity`, `source` | No | Low-cardinality labels you filter and render on. |

The rule underneath the table: **encrypt what you read back for a human, never what the library groups,
indexes or claims on.**

> **Source note — be accurate about the cost.** Encrypting `message` does **not** break fingerprint
> grouping. The fingerprint is computed from the sanitized message *before* the wrapper runs, is stored
> as its own unencrypted field, and the `[fingerprint, uploadStatus]` index — which is what aggregation
> actually matches on — reads that field. Measured directly: two identical failures from the same call
> site still collapse into **one** row with `occurrenceCount: 2` whether `fields` is `['message']` or
> empty, and the stored message requires decryption to read back.
>
> Encrypting `fingerprint` itself is the case that defeats the index, which is why it is in the never
> column. And because reads decrypt through the same wrapper, grouping and the diagnostics export keep
> working even then — the real cost of encryption is paid by anything reading the database **directly**,
> outside the library.

The honest cost, stated plainly:

- **A direct look at IndexedDB no longer shows you the message.** That is the point — but it also means
  "open DevTools and read the row" stops working for *you*.
- **The bytes are larger.** AES-GCM output is Base64 of IV plus ciphertext, so a long `stack` inflates
  noticeably and counts against `errors.maxPayloadBytes` and your quota.
- **A lost key is a lost message.** There is no recovery path, by design.

## A failed decrypt keeps the stored value

This is the behaviour that makes a key rotation survivable, and it is worth being precise about it.

| Situation | What happens |
| --- | --- |
| `encrypt` throws | The field is written in **plaintext**. Losing the record would be worse than storing it unencrypted. |
| `decrypt` throws | The field **keeps its stored value** — you see ciphertext, not an empty string — and `onDecryptFailure(field, error)` is called. |
| `decrypt` returns an empty string | Treated as a failure, for the same reason: blanking a message is worse than showing it. |

So if you rotate the passphrase or the salt, previously stored records fail to decrypt and become
visibly unreadable rather than silently blank:

```ts
createEncryptingRepository(rawErrors, provider, {
  fields: ['message', 'stack'],
  onDecryptFailure: (field) => {
    // Count these, or surface a banner. A report full of ciphertext means the key
    // changed — which is a far better failure than an empty message column.
    metrics.increment('vault.decrypt_failed', { field });
  },
});
```

> **Source note.** The input record is **never mutated**. For a nested path like `'api.url'` the wrapper
> copies each object along the path before writing, so encrypting a record cannot leak ciphertext into
> the live object graph your application is still holding — and decrypting cannot write plaintext back
> into the repository's own copy.

## Rolling your own provider

The interface is two functions, either of which may be async:

```ts
// app/kms-provider.ts — a client module
'use client';

import type { EncryptionProvider } from '@codewithrajat/rm-logvault/storage';

export const provider: EncryptionProvider = {
  name: 'kms-wrapped',
  encrypt: async (plaintext) => wrapWithServerKey(plaintext),
  decrypt: async (stored) => unwrapWithServerKey(stored),
};
```

A provider that delegates to a server is the only variant that raises the bar meaningfully, because the
key never reaches the browser. It also makes the vault unreadable offline — which may be exactly the
trade you want, or exactly the one you do not.

That variant fits Next.js particularly well, because the obvious place to keep the key is a **Route
Handler** rather than the bundle:

```ts
// app/api/vault/route.ts — a SERVER route handler, not a client module
import { NextResponse } from 'next/server';

// The key lives in a server-only variable, so it is never inlined into the client
// bundle the way a NEXT_PUBLIC_ value is.
const KEY = process.env.VAULT_KEY;

export async function POST(request: Request): Promise<Response> {
  const { op, value } = (await request.json()) as { op: 'enc' | 'dec'; value: string };
  const result = op === 'enc' ? wrap(KEY, value) : unwrap(KEY, value);
  return NextResponse.json({ value: result });
}
```

```ts
// app/kms-provider.ts — client half, calling that route
'use client';

import type { EncryptionProvider } from '@codewithrajat/rm-logvault/storage';

async function call(op: 'enc' | 'dec', value: string): Promise<string> {
  const response = await fetch('/api/vault', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ op, value }),
  });
  if (!response.ok) throw new Error(`vault ${op} failed`);
  return ((await response.json()) as { value: string }).value;
}

export const provider: EncryptionProvider = {
  name: 'kms-wrapped',
  encrypt: (plaintext) => call('enc', plaintext),
  decrypt: (stored) => call('dec', stored),
};
```

> **Source note.** The client module imports **no** telemetry entry point, and the route handler imports
> none either. That is deliberate and it is the rule from
> [01-framework-adapter.md](./01-framework-adapter.md): a Route Handler must not import the telemetry
> entry for browser capture, and it has no IndexedDB to write to. The route does one job — hold the key.

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

Both return a copy and neither mutates the input, so the second line reads back what the first wrote and
`record` is untouched throughout.

## Where this does and does not belong

| Context | Encrypt the vault there? |
| --- | --- |
| A client component, or the provider effect | **Yes** — this is the only place it works. |
| A Server Component | No. There is no IndexedDB and no store. |
| A Route Handler | No. It has its own runtime; the browser's vault is not reachable from it. |
| A server-side store you own | Out of scope — encrypt it with your server's own key management. |

## Related

- The server boundary: [01-framework-adapter.md](./01-framework-adapter.md).
- Replacing the store generally, including `initialize()` and the cleanup cadence: [README.md](./README.md).
- Exporting records once they are decryptable:
  [04-observing-and-extending.md](./04-observing-and-extending.md).
- Every storage export with its signature:
  [docs/API.md](../../../docs/API.md#codewithrajatrm-logvaultstorage).
