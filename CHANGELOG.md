# Changelog

## 1.0.0

### Major Changes

- Rename the package to `@codewithrajat/rm-logvault` and cut the first stable release.
  
  **The package name changes.** Every import specifier moves from `logvault` to
  `@codewithrajat/rm-logvault`, subpaths included:
  
  ```diff
  -import { initTelemetry } from 'logvault';
  -import { reactRootErrorHandlers } from 'logvault/react';
  +import { initTelemetry } from '@codewithrajat/rm-logvault';
  +import { reactRootErrorHandlers } from '@codewithrajat/rm-logvault/react';
  ```
  
  **The IndexedDB prefix changes**, which is the one part of this rename that has a data
  consequence. `dbPrefix` now defaults to `'rm-logvault'`, so the databases are
  `rm-logvault-errors` and `rm-logvault-logs` instead of `logvault-errors` and `logvault-logs`. Any
  records already stored under the old prefix are **not migrated and not deleted**: they stay on disk
  under the old names, but the library no longer reads them. If you were running a pre-1.0 build and
  have unsent records you care about, upload or export them before upgrading, or set
  `dbPrefix: 'logvault'` explicitly to keep reading the old databases. New installs are unaffected.
  
  **The console prefix changes** from `[logvault]` to `[rm-logvault]`, which affects log filtering and
  grep patterns that match the old prefix.
  
  **Two internal identifiers deliberately keep the old spelling**: the global-state symbol
  `Symbol.for('logvault@1')` and the `__logvaultState` marker on the state object. They are the
  dual-copy guard, and keeping them means a v0.1-era copy and a v1 copy loaded on the same page still
  resolve to one shared installation instead of installing their handlers twice.
  
  Nothing else about the runtime changes: the public API, the option surface, the record schema
  (`schemaVersion: 1`), the REST contract and the diagnostics report are all unchanged. `engines.node`
  remains `>=18` for consumers.

### Minor Changes

- Add a page-load drill-down to the diagnostics report.
  
  The report was two flat tables: errors by last-seen, logs by time. It carried every field needed to
  answer "what happened during this page load" — errors nest `page.pageLoadId`, logs carry it at the
  top level — but nothing joined them, and table rows were styled as clickable with no handler behind
  them.
  
  The viewer now derives a page-load model from the records already embedded (no payload field was
  added, so the embedded JSON is still `schemaVersion: 1`) and offers three ways in:
  
  - **Page loads** — one row per load with its route, first event, span and error/log counts, ordered
    newest-first. Selecting a row filters both the errors and the logs to that load; selecting it again
    clears the filter.
  - **Grouping** — error rows collapse by fingerprint with occurrences summed, so one failure is one
    row even when a `pending` and a claimed row exist for the same fingerprint.
  - **Drill-down** — selecting an error shows its fields, stack and raw JSON alongside every log from
    the same load, ordered by time, with the entries inside `[firstSeen − 5 s, lastSeen + 5 s]`
    highlighted.
  
  Two documentation defects are corrected in the same change: the README claimed records were "grouped
  by a fingerprint inside the report" when they were not, and `exportDiagnosticsReport` was documented
  as returning `false` when storage is unavailable. It does not: it writes a report with zero records
  and reports `diagnostics-read-errors` through `onInternalError`.
  
  The viewer's source is a string that `tsc` cannot check, so five tests now extract it and execute it
  against happy-dom, and one asserts it contains no backtick (a backtick would terminate the template
  literal it is written inside).
  
  Cost: the core moves from 28.36 kB to 31.01 kB min+gzip, and the `size-limit` regression budget from
  30 kB to 32 kB, measured and recorded in D-018.

### Patch Changes

- Initial public API surface: offline-first error tracking, logging and diagnostics export.
- Ship the documentation with the package, and move the toolchain to pnpm.
  
  The published tarball now includes `CHANGELOG.md`, `CONTRIBUTING.md`, `SECURITY.md` and the whole
  `docs/` tree, which it previously did not: `files` listed only `dist`, `README.md`, `LICENSE` and the
  two `llms` files, so a consumer installing the package got the code and nothing that explained it.
  `scripts/copy-extra-files.mjs` runs after `tsup` on every build, stages those files into `dist/`, and
  **fails the build** if any of them is missing or empty, so the allow-list in `files` cannot quietly
  drop a document again.
  
  The repository itself moves from npm to pnpm: `packageManager` pins `pnpm@11.5.1`,
  `pnpm-workspace.yaml` makes the library the root package with `examples/*` as members so one lockfile
  covers all six projects, and `package-lock.json` is replaced by `pnpm-lock.yaml`. There is no change
  to the runtime or the public API.
  
  `pnpm-workspace.yaml` also carries three supply-chain settings that CI now asserts: a
  `minimumReleaseAge` of 10080 minutes (a dependency version published less than seven days ago is
  never installed), `blockExoticSubdeps: true`, and an `allowBuilds` allow-list for dependency install
  scripts. As a consequence, ten `devDependency` ranges were lowered to the newest version that is at
  least a week old — publishing a release with a newer minimum would fail `pnpm install` with
  `ERR_PNPM_NO_MATURE_MATCHING_VERSION`. Contributors need Node >= 22.13 for the toolchain; the
  published package still runs on Node >= 18, which is unchanged.

All notable changes to this project are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and this project
adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

Releases are managed with [changesets](https://github.com/changesets/changesets). The entries below
are generated from changeset files rather than hand-written; see
[CONTRIBUTING.md](CONTRIBUTING.md#changesets) for the workflow. Because the package is pre-1.0, a
releases before 1.0 could carry a breaking change in a minor. From 1.0.0 onwards the usual semver
rule applies: breaking changes require a major. Check the `### Changed` and `### Removed` sections
before upgrading.

## [Unreleased]

### Added

- Nothing yet.

### Changed

- Nothing yet.

### Deprecated

- Nothing yet.

### Removed

- Nothing yet.

### Fixed

- Nothing yet.

### Security

- Nothing yet.

## [0.1.0] - 2026-10-03

The initial public release. Feature-complete for the documented scope: offline-first capture,
redaction by default, optional REST sync, and a self-contained diagnostics report. Zero runtime
dependencies; the core is 28.18 kB min+gzip, against a 30 kB regression budget.

### Added

**Lifecycle and status**

- `initTelemetry(options?)` — one-line bootstrap. Strictly idempotent (a second call returns the
  existing handle and installs nothing), never throws, and configurable for reconfiguration only via
  `destroyTelemetry()`.
- `destroyTelemetry()` — removes every listener and timer synchronously, then flushes and closes both
  databases asynchronously. Idempotent and never throws.
- `flushTelemetry()`, `syncTelemetry()`, `retryFailedTelemetry()`, `clearTelemetryData()`.
- `getTelemetryStatus()` — a synchronous snapshot (`initialized`, `storage`, `online`, `pending`,
  `droppedByRateLimit`, `lastSync`, `syncStatus`).
- `isTelemetryInitialized()`.
- `TelemetryHandle` with `appName`, `pageLoadId`, `enabled`, `storage`, `destroy`, `flush` and `sync`.

**Configuration**

- `TelemetryOptions` with the `errors`, `logs`, `redaction`, `rest` and `shortcut` groups, plus
  `appName`, `appVersion`, `buildId`, `environment`, `enabled`, `dbPrefix`, `env`, `consent`,
  `onInternalError`, `repository` and `logSource`.
- `resolveOptions(options?)` — resolves, validates and freezes a configuration. Explicit option beats
  the environment layer, which beats the built-in default. Non-positive or non-finite numerics and
  unrecognised level strings are ignored rather than applied.
- `DEFAULT_OPTIONS` and `databaseNames(dbPrefix)`.

**Environment adapter**

- `fromEnv(prefix?)` and `DEFAULT_ENV_PREFIXES` (`VITE_`, `NEXT_PUBLIC_`, `REACT_APP_`) covering
  `APP_NAME`, `APP_VERSION`, `BUILD_ID`, `APP_ENV`/`ENVIRONMENT`, `TELEMETRY_ENABLED`,
  `TELEMETRY_DB_PREFIX`, `TELEMETRY_ERRORS_ENABLED`, `TELEMETRY_LOGS_ENABLED`,
  `TELEMETRY_LOG_LEVEL`, `TELEMETRY_PERSIST_LEVEL`, `TELEMETRY_ERRORS_URL`, `TELEMETRY_LOGS_URL` and
  `TELEMETRY_REST_ENABLED`.
- The `env` option, so the core never reads `import.meta.env` or `process.env` unless the caller opts
  in.

**Logging**

- The `logger` facade with `trace`/`debug`/`info`/`warn`/`error`, `addSink`, `setLevel`, `setEnabled`
  and `getConfig`, plus `createLogger()` for an isolated controller.
- A persist level (`logs.level`, default `'warn'`) independent of the console level
  (`logger.setLevel`), with sinks running before the console filter.
- `captureConsole` — opt-in wrapping of `console.warn` and `console.error`, fully restored on
  teardown.
- Pre-init log buffering (50 calls) replayed once the first sink arrives, so records carry real
  application metadata.
- Reserved prefixes (`[ErrorTracking]`, `[LogTracking]`, `[Telemetry]`, `[DiagnosticsExport]`) that
  are never persisted, preventing a storage warning from producing another record.
- Guarded console output through a single writer module, styled in browsers and plain elsewhere.
- `LOG_LEVELS`, `LOG_LEVEL_PRIORITY`, `levelPriority`, `meetsLevel`.

**Error capture**

- `captureError(error, ctx?)` — one ingestion point for every source. Accepts anything (including
  `null`, a `Symbol`, a hostile Proxy and an `AggregateError`), never throws, and cannot recurse.
  Identity-based deduplication via a `WeakSet` so one `Error` reaching several paths produces one
  record.
- Pre-init error buffering (50 errors), normalised and sanitized immediately so no live object graph
  is retained, and replayed with full metadata after initialization.
- `captureApiError(error, startedAt?)` and `captureFetchError(request, failure)` with an allow-list of
  request metadata only.
- `withErrorCapture(handler, ctx?)` — captures and re-throws the original value.
- `markAuthError` / `isAuthError` for the auth failures a status code cannot express.
- Fixed-window rate limiting (120 errors and 600 logs per minute by default) with a single summary
  line rather than one warning per dropped event.

**Normalisation, classification and fingerprinting**

- `normalizeError` — cross-realm-safe structural typing, `cause` chain extraction
  (`MAX_CAUSE_DEPTH` 3), `AggregateError` flattening (5 sub-errors), chunk-error recognition, and a
  hard-coded fallback (`UNNORMALIZABLE`) so it can never throw.
- `sanitizeNormalized` for re-scrubbing an already-normalised value.
- `buildApiErrorContext` and `buildFetchErrorContext` with the documented kind resolution order
  (`auth → abort → timeout → parse → http → network → unknown`), plus `categoryForKind`,
  `severityForKind` and `CORRELATION_HEADERS`.
- `fingerprint` — a 28-hex-character `cyrb53`-based key computed from already-sanitized fields, so a
  secret can never enter an index. `fingerprintParts`, `normalizePathForFingerprint` (numeric, UUID
  and long-hex segments collapse to `:id`), `topStackFrames` and `cyrb53`.

**Sanitisation and redaction**

- `createSanitizer(config?)` / `sanitizeText` / `sanitizeUrl` / `sanitizeStack` / `sanitizeValue` /
  `isSensitiveKey` / `getDefaultSanitizer`.
- Redaction by default: sensitive key names (with `[-_\s]` normalisation), JWTs, `Bearer`/`Basic`/
  `Token` schemes, `key=value` secrets, e-mail addresses, URL credentials, URL fragments, path
  segments that look like identifiers, and every non-allow-listed query value.
- `REDACTED` (`[REDACTED]`), `DEFAULT_ALLOWED_QUERY_PARAMS`, `SENSITIVE_KEY_PATTERN`.
- Bounded work throughout: `HARD_TEXT_CAP` (20 000) before any regex runs, `MAX_DEPTH` 4, `MAX_KEYS`
  30, `MAX_ARRAY_ITEMS` 20, and per-field length caps. Never throws; fails closed.
- Prototype-pollution safety: `__proto__`, `constructor` and `prototype` are skipped and results are
  built with `Object.fromEntries`.
- Extensions via `redaction.extraSensitiveKeys`, `extraPatterns` and `allowedQueryParams`.

**Storage**

- Two IndexedDB databases (`rm-logvault-errors` store `errors`, `rm-logvault-logs` store `logs`) with
  indexes `by_fingerprint_status`, `by_status`, `by_status_timestamp` and `by_timestamp`.
- Pending-only aggregation: repeated occurrences of one fingerprint merge into a single row while it
  is `pending`; a row that is `uploading` is never mutated.
- Atomic multi-tab claiming via a single `readwrite` transaction, plus a 5-minute stale-lease requeue.
- Retention (`retentionDays` 7 for errors and 3 for logs, `maxRecords` 500 and 2000) enforced at
  initialization, every 25/200 writes, and on quota pressure.
- Quota recovery: halve the cap, clean up, retry the same write exactly once.
- A self-healing, never-throwing connection layer that survives a missing IndexedDB, Safari private
  mode, a sandboxed iframe, a 5-second open timeout, a mid-session database deletion and a concurrent
  schema upgrade.
- Structural validation of every row read, with malformed rows deleted rather than returned.
- `createErrorRepository`, `createLogRepository`, `createDbConnection`, `classifyStorageError`,
  `promisifyRequest`, `isErrorRecord`, `isLogRecord`, and the `TelemetryRepository` /
  `ErrorRepository` / `LogRepository` / `Result` contracts for custom backends.

**REST sync**

- `createSyncManager` — claim, send, then delete-or-requeue, with one run at a time and a per-kind
  batch loop.
- `createFetchTransport` — the library's only network egress. Uses the platform `fetch`, never reads
  the response body, and never throws for an HTTP status.
- Status classification: `2xx` accepted, `400/401/403/404/405/410/413/415/422` terminal
  (`uploadStatus: 'failed'`), everything else retryable with exponential backoff
  (`min(15000 · 2^(n-1), 900000)` ms).
- `Retry-After` support in delta-seconds and HTTP-date form, clamped to `[0, 900000]` and never
  shortening the backoff.
- Per-request header provider (`getHeaders`, awaited so tokens can be refreshed), a 10-second abort
  budget, `keepalive` on the unload flush for bodies under 60 kB, and an `online` listener that
  schedules a drain when connectivity returns.
- `onTerminalFailure` so an application can re-authenticate and call `retryFailedTelemetry()`.
- Endpoint validation: forbidden schemes rejected, relative URLs resolved against the origin,
  optional `requireHttps`, and credentials defaulting to `'same-origin'`.
- `isSyncConfigured`, `resolveEndpoint`, `resolveEndpoints`, `classifyResponse`, `buildRestBody`,
  `backoffDelay`, `parseRetryAfter`, `TERMINAL_STATUSES` and the `RemoteTransport` seam for OTLP,
  Sentry envelopes or a custom backend.

**Diagnostics export**

- The hidden **Ctrl+Shift+Alt+D** shortcut, installed in the capture phase on `document`, matched on
  the physical `KeyboardEvent.code`, silent inside editable elements, and gateable with `allow()`.
- `exportDiagnosticsReport(options?)` with `format: 'html' | 'json'`, `copyToClipboard`,
  `redactAgain` and `filenamePrefix`. Flushes first, reads every record regardless of upload status,
  marshals in 500-record slices, rejects concurrent calls, and defers `revokeObjectURL` for Safari.
- A self-contained HTML report: no network, its own `default-src 'none'` policy, a searchable and
  filterable viewer, and a privacy banner. Record data is embedded once as escaped JSON in a
  `<script type="application/json">` element and reaches the DOM only through `textContent`.
- `renderDiagnosticsReport`, `buildReportPayload`, `escapeHtml`, `encodeJsonForHtml`,
  `escapeJsonText`, `REPORT_PRIVACY_BANNER`, `diagnosticsFilename`, `isExportInFlight`,
  `installShortcut`, `installDiagnosticsExportShortcut`, `matchesShortcut`, `expectedCode`,
  `isEditableTarget`.
- Second-pass redaction for export: `sanitizeErrorRecord` and `sanitizeLogRecord`.

**Global handlers**

- A chained `window.onerror` (the previous handler is called and *its* return value is returned, so an
  application's suppression decision stands), an `unhandledrejection` listener, a `vite:preloadError`
  listener, an optional capture-phase resource-error listener and an optional
  `securitypolicyviolation` listener.
- Merged registrations: multiple installs, or two copies of the library, produce one set of DOM
  listeners with independent cleanups.
- Cleanup that restores the previous `onerror` only while it is still ours, and otherwise stays
  installed but inert so an application's chained handler keeps working.
- `globalHandlerCount` and `globalHandlersAttached` for tests and diagnostics.

**Framework and HTTP adapters** (separate subpath entry points, framework peers optional)

- `@codewithrajat/rm-logvault/react` — `TelemetryErrorBoundary`, `reactRootErrorHandlers` (React 19
  `onUncaughtError` / `onCaughtError` / `onRecoverableError`) and `useErrorCapture`.
- `@codewithrajat/rm-logvault/vue` — `createTelemetryVuePlugin` and `attachVueTelemetry`, chaining any pre-existing
  `errorHandler` and `warnHandler` rather than replacing them.
- `@codewithrajat/rm-logvault/angular` — `TelemetryErrorHandler` and `provideTelemetryErrorHandler` using a
  `useFactory` provider so consumers need neither `experimentalDecorators` nor
  `emitDecoratorMetadata`; plus `getPreviousErrorHandler`.
- `@codewithrajat/rm-logvault/axios` — `attachAxios`, a response interceptor that classifies, captures and re-throws the
  original rejection unchanged.
- `@codewithrajat/rm-logvault/fetch` — `instrumentFetch`, an opt-in and fully reversible `fetch` wrapper that reads only
  the rejection reason and the response status, plus `registerTelemetryUrl` to keep the library's own
  uploads out of the capture path.
- `@codewithrajat/rm-logvault/react-query` — `attachQueryClient`, chaining `QueryCache.config.onError` and
  `MutationCache.config.onError` and tagging records with the failing query or mutation key.

**Testing utilities**

- `@codewithrajat/rm-logvault/testing` — `createMemoryRepository(options?)` with `failWith` and `quotaAt` to exercise
  degradation and quota recovery, mirroring the IndexedDB semantics exactly; and
  `createFakeTransport(options?)` with scriptable status, `Retry-After`, simulated network failures,
  and recorded request bodies.

**Project**

- Dual ESM + CJS output with matching `.d.ts` / `.d.cts` for the root and all seven subpaths, plus
  `typesVersions` for older resolution modes.
- `size-limit` budget of 30 kB min+gzip on the core (measured 28.18 kB), enforced in CI and in
  `npm run verify`.
- `publint --strict` and `attw --pack` packaging checks; `npm audit` and an OSV scan; a CycloneDX SBOM
  generated and validated on every CI run; npm provenance on publish.
- Vitest with happy-dom and `@vitest/coverage-v8`, plus property-based tests with `fast-check`;
  coverage thresholds pinned to the measured baseline (74% lines globally, with per-file gates on
  `sanitize`, `normalize`, `fingerprint`, `idbCore`, `syncManager`, `shortcut` and `reportTemplate`).
- **Biome** for formatting and linting in a single pass (`biome.json`), commitlint with a fixed scope
  enum, and knip for dead code and unused exports.
- GitHub Actions CI that stores **no artifacts**: every job either passes or fails, coverage prints
  its table, and the SBOM is validated in-run then discarded.

[Unreleased]: https://github.com/malikrajat/rm-logvault/compare/v0.1.0...HEAD
[0.1.0]: https://github.com/malikrajat/rm-logvault/releases/tag/v0.1.0
