import { R as Result, M as Maybe, T as Timestamp, U as UploadStatus } from './types-vgch86Bo.cjs';
import { C as CleanupPolicy } from './storage.types-BW8tLQEw.cjs';
export { g as StorageFailureReason } from './storage.types-BW8tLQEw.cjs';

/**
 * Encryption adapters for stored records, and a repository wrapper that uses them.
 *
 * @remarks
 * This is **not** a claim that the library encrypts your data. It is a seam, plus
 * two honest built-ins, because the alternative — telling people "your logs are in
 * IndexedDB and that is fine" — ignores that a stored error message can contain a
 * customer name, an account number or a stack trace with a value in it.
 *
 * ### Read this before choosing a provider
 *
 * The library's default position is that redaction, not encryption, is the privacy
 * control: {@link createSanitizer} strips sensitive keys, URL parameters and
 * free-text patterns **before a record is written**, so an unencrypted vault is
 * already scrubbed. Encryption is defence in depth for the case where someone else
 * gets read access to the origin's storage.
 *
 * That framing matters because of what the built-in providers are:
 *
 * - {@link createBase64EncryptionProvider} is **encoding, not encryption.** It
 *   defeats casual inspection of a record in devtools and nothing else. It is
 *   named `base64` rather than `basic` on purpose.
 * - {@link createAesGcmEncryptionProvider} is real AES-GCM-256 through the platform
 *   `crypto.subtle`, and it is only as strong as where you keep the key. A key
 *   derived from a password **stored in the same origin** protects against a
 *   database dump and against nothing else; there is no way around that in a
 *   browser without a server, and pretending otherwise would be the bug.
 *
 * ### What encryption does and does not change
 *
 * - Encrypting a field **changes its value**, so a field used as a grouping key —
 *   `message`, `stack`, `fingerprint` — stops grouping correctly once encrypted.
 *   Encrypt fields you intend to read back for a human, not fields you aggregate on.
 * - The wrapper encrypts on write and decrypts on read, so everything above the
 *   repository keeps working on plaintext, including the diagnostics export.
 * - A field that fails to decrypt is left **untouched** rather than blanked, so a
 *   key rotation produces a readable error instead of silently empty reports.
 *
 * @packageDocumentation
 */

/**
 * A reversible transform for stored field values.
 *
 * @remarks
 * Both members may be synchronous or asynchronous, so the same interface covers
 * `btoa` and `crypto.subtle`. Neither may throw: a provider that fails must return
 * the input unchanged for `encrypt` and signal failure for `decrypt` by throwing,
 * which the wrapper contains.
 */
interface EncryptionProvider {
    /** Translate a plaintext value into its stored form. */
    readonly encrypt: (plaintext: string) => string | Promise<string>;
    /** Translate a stored value back into plaintext. */
    readonly decrypt: (stored: string) => string | Promise<string>;
    /** Identifier used in internal diagnostics. */
    readonly name?: string | undefined;
}
/**
 * The persistence surface the encrypting wrapper understands.
 *
 * @remarks
 * `save` and `saveBatch` are **both** optional, because the two shipped
 * repositories differ: `ErrorRepository` has `save` (pending-only aggregation) and
 * no `saveBatch`, while `LogRepository` has `saveBatch` and no `save`. Requiring
 * either one would make the wrapper unusable with the other — which is exactly the
 * mistake an earlier revision made, and a type error rather than a silent one only
 * because the mismatch was caught while writing the docs.
 *
 * Everything else here is optional so a custom backend only has to provide the
 * record methods it actually implements; the wrapper forwards what is present and
 * omits what is not.
 */
interface EncryptableRepository<T> {
    /** All records, in the repository's natural order. */
    readonly getAll?: (() => Promise<Result<readonly T[], string>>) | undefined;
    /** One record by id. */
    readonly get?: ((id: string) => Promise<Result<Maybe<T>, string>>) | undefined;
    /** Insert or aggregate one record. Errors have this; logs do not. */
    readonly save?: ((record: T) => Promise<Result<void, string>>) | undefined;
    /** Insert many records. Logs have this; errors do not. */
    readonly saveBatch?: ((records: readonly T[]) => Promise<Result<void, string>>) | undefined;
    /** Move up to `limit` pending rows to `uploading`, atomically. */
    readonly claimPending?: ((limit: number, now: Timestamp) => Promise<Result<T[], string>>) | undefined;
    /** Rows stuck in `uploading` past a lease. Takes no records, so it passes through. */
    readonly requeueStale?: ((olderThanMs: number, now: Timestamp) => Promise<Result<number, string>>) | undefined;
    /** Rows in `failed` state. */
    readonly getFailed?: (() => Promise<Result<T[], string>>) | undefined;
    /** Delete rows by id. Takes no records, so it passes through. */
    readonly delete?: ((ids: readonly string[]) => Promise<Result<number, string>>) | undefined;
    /** Count of rows awaiting upload. */
    readonly pendingCount?: (() => Promise<Result<number, string>>) | undefined;
    /** Update the upload status of several rows. Takes no records, so it passes through. */
    readonly updateUploadStatus?: ((ids: readonly string[], status: UploadStatus) => Promise<Result<number, string>>) | undefined;
    /** Total row count. */
    readonly count?: (() => Promise<Result<number, string>>) | undefined;
    /** Apply a retention and overflow policy. */
    readonly cleanup?: ((policy: CleanupPolicy) => Promise<Result<number, string>>) | undefined;
    /** Wipe every row (GDPR erasure). */
    readonly clear?: (() => Promise<Result<number, string>>) | undefined;
    /** Open the backend. Forwarded so the result can be handed to `initTelemetry`. */
    readonly initialize?: (() => Promise<Result<void, string>>) | undefined;
    /** Close the backend. */
    readonly close?: (() => void) | undefined;
}
/**
 * A repository that can be passed to `initTelemetry` and came out of the wrapper.
 *
 * @remarks
 * Intersected with the **input** type rather than being the wrapper's own shape.
 * That is what makes the result usable: `initTelemetry`'s `repository` option wants
 * the full `ErrorRepository` / `LogRepository` surface — `getPending`,
 * `initialize`, `cleanup`, `close` and the rest — and a bare wrapper type fails to
 * satisfy it. `T & …` keeps every member of the repository you passed in, so an
 * `ErrorRepository` in gives an `ErrorRepository` (with encryption) out.
 *
 * `T` is deliberately unconstrained beyond `object`. Constraining it to
 * {@link EncryptableRepository} reads more precisely but defeats inference: the
 * compiler then has to infer `T` from the *shape of `T` itself*, and it fails for
 * both shipped repositories. An unconstrained `T` is inferred directly from the
 * argument, which is what makes `createEncryptingRepository<LogRecord>(...)`
 * unnecessary in the common case.
 */
type EncryptingRepository<T extends object> = T & {
    /** The underlying repository, unwrapped. */
    readonly inner: T;
    /** The provider in force. */
    readonly provider: EncryptionProvider;
};
/** Options for {@link createEncryptingRepository}. */
interface EncryptingRepositoryOptions {
    /**
     * Which fields to encrypt.
     *
     * @remarks
     * Accepts a plain field name, or a dotted path for one level of nesting
     * (`'api.url'`). A path that matches nothing is skipped silently — a record shape
     * varies by source, and reporting a miss per record would be noise.
     */
    readonly fields: readonly string[];
    /**
     * Called when a field cannot be decrypted.
     *
     * @param field - the dotted path that failed
     * @param error - the thrown value
     *
     * @remarks
     * The field is left as its stored value, so the failure is visible in the record
     * rather than hidden by an empty string.
     */
    readonly onDecryptFailure?: ((field: string, error: unknown) => void) | undefined;
}
/**
 * Encrypt one record's configured string fields.
 *
 * @param record - the record to transform. A shallow copy is returned; the input is
 * never mutated.
 * @param fields - dotted field paths
 * @param provider - the transform
 * @returns the transformed copy. **Never throws** — a field whose encryption fails
 * is written in plaintext rather than lost.
 */
declare function encryptRecordFields<T>(record: T, fields: readonly string[], provider: EncryptionProvider): Promise<T>;
/**
 * Decrypt one record's configured string fields.
 *
 * @param record - the record to transform
 * @param fields - dotted field paths
 * @param provider - the transform
 * @param onFailure - called per field that fails; the field keeps its stored value
 * @returns the transformed copy
 */
declare function decryptRecordFields<T>(record: T, fields: readonly string[], provider: EncryptionProvider, onFailure?: (field: string, error: unknown) => void): Promise<T>;
/**
 * Wrap a repository so configured string fields are encrypted at rest.
 *
 * @param inner - the repository to wrap: `createErrorRepository(...)`,
 * `createLogRepository(...)`, or a custom backend
 * @param provider - the transform from {@link createBase64EncryptionProvider} or
 * {@link createAesGcmEncryptionProvider}
 * @param options - which fields to encrypt and how to report a failed decrypt
 * @returns the same repository, with the chosen fields encrypted on write and
 * decrypted on read
 *
 * @remarks
 * Records are transformed; **everything else is forwarded untouched** — `getPending`,
 * `requeueStale`, `delete`, `count`, `cleanup`, `clear`, `initialize`, `close` and the
 * rest — because those operations take no records or key on `id`, `fingerprint` and
 * `uploadStatus`, which encryption would break.
 *
 * The return type is the input type intersected with the wrapper, so an
 * `ErrorRepository` in gives an `ErrorRepository` out and the result is directly
 * usable as `initTelemetry`'s `repository`. `ErrorRepository` and `LogRepository`
 * differ — errors have `save`, logs have `saveBatch` — so supply the type argument
 * when inference cannot see a `save` method:
 *
 * ```ts
 * createEncryptingRepository<LogRecord>(logs, provider, { fields: ['message'] });
 * ```
 *
 * @example
 * ```ts
 * import { createErrorRepository } from '@codewithrajat/rm-logvault';
 * import { createAesGcmEncryptionProvider, createEncryptingRepository } from '@codewithrajat/rm-logvault/storage';
 *
 * const provider = await createAesGcmEncryptionProvider({ password, salt });
 * const errors = createEncryptingRepository(
 *   createErrorRepository({ dbName: 'rm-logvault-errors' }),
 *   provider,
 *   { fields: ['message', 'stack'] },
 * );
 * ```
 */
declare function createEncryptingRepository<T extends object>(inner: T, provider: EncryptionProvider, options: EncryptingRepositoryOptions): EncryptingRepository<T>;
/**
 * A Base64 transform.
 *
 * @returns an {@link EncryptionProvider} that is *encoding*, not encryption
 *
 * @remarks
 * It stops a record being readable at a glance in devtools. It provides **no**
 * confidentiality: anyone with the value can decode it with `atob`. Use it to keep
 * an incidental screenshot from being a data incident, not to protect a secret.
 *
 * Falls back to identity when `btoa`/`atob` are absent (Node without a DOM shim),
 * so an SSR import cannot crash the module.
 */
declare function createBase64EncryptionProvider(): EncryptionProvider;
/** Options for {@link createAesGcmEncryptionProvider}. */
interface AesGcmEncryptionProviderOptions {
    /** Passphrase the AES key is derived from. */
    readonly password: string;
    /**
     * PBKDF2 salt, as raw bytes.
     *
     * @remarks
     * Must be the **same value on every load**, or previously stored records cannot be
     * decrypted. Persist it somewhere that is not this database — a build-time
     * constant, or a server-supplied value.
     */
    readonly salt: Uint8Array;
    /** PBKDF2 iteration count. Default `250_000`. */
    readonly iterations?: number | undefined;
}
/**
 * Derive an AES-GCM-256 key from a passphrase.
 *
 * @param password - the passphrase
 * @param salt - PBKDF2 salt
 * @param iterations - PBKDF2 iteration count
 * @returns the derived key, or `undefined` when `crypto.subtle` is unavailable
 *
 * @example
 * ```ts
 * import { deriveAesKey } from '@codewithrajat/rm-logvault/storage';
 *
 * const key = await deriveAesKey('correct horse battery staple', salt);
 * ```
 */
declare function deriveAesKey(password: string, salt: Uint8Array, iterations?: number): Promise<CryptoKey | undefined>;
/**
 * Wrap an existing AES-GCM key as an {@link EncryptionProvider}.
 *
 * @param key - the key, from `deriveAesKey` or your own key management
 * @returns an {@link EncryptionProvider}, or `undefined` when the platform has no
 * `crypto.subtle` (any non-secure context, including plain `http:`)
 *
 * @remarks
 * Output is Base64 of `[12-byte IV][ciphertext]`, using a fresh random IV per value.
 */
declare function createWebCryptoEncryptionProvider(key: CryptoKey): EncryptionProvider | undefined;
/**
 * Derive a key from a passphrase and return an AES-GCM {@link EncryptionProvider}.
 *
 * @param options - passphrase, salt and iteration count
 * @returns the provider, or `undefined` when `crypto.subtle` is unavailable
 *
 * @remarks
 * Read the security note at the top of this module before relying on this. A key
 * derived from a passphrase that ships in the same bundle as the code protects the
 * database file, not the data from a determined reader of the page.
 *
 * @example
 * ```ts
 * import { createAesGcmEncryptionProvider } from '@codewithrajat/rm-logvault/storage';
 *
 * const provider = await createAesGcmEncryptionProvider({
 *   password: import.meta.env.VITE_VAULT_PASSPHRASE,
 *   salt: new Uint8Array([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16]),
 * });
 * if (provider === undefined) {
 *   // Not a secure context — fall back to local-only operation.
 * }
 * ```
 */
declare function createAesGcmEncryptionProvider(options: AesGcmEncryptionProviderOptions): Promise<EncryptionProvider | undefined>;

export { type AesGcmEncryptionProviderOptions, CleanupPolicy, type EncryptableRepository, type EncryptingRepository, type EncryptingRepositoryOptions, type EncryptionProvider, createAesGcmEncryptionProvider, createBase64EncryptionProvider, createEncryptingRepository, createWebCryptoEncryptionProvider, decryptRecordFields, deriveAesKey, encryptRecordFields };
