# Changelog

## 1.0.1

### Patch Changes

- Correct the documentation where it did not match the source, and state the dedupe rule explicitly.
  
  Four claims were wrong or missing, and each one had already cost somebody time.
  
  ## `logger.error(msg, error)` has never captured an error
  
  Integration notes elsewhere describe `logger.error('[Checkout] failed', error)` as auto-capturing an
  `Error` and only missing strings and numbers. It captures **nothing**, at any level, for any argument
  type. `logger` writes to the `${dbPrefix}-logs` store and only to that store; `captureError` is the
  single ingestion point for the `${dbPrefix}-errors` store, and it always has been.
  
  This is now stated in three places rather than left to be inferred: the `captureError` section of
  `docs/API.md` (with a `Source note:` naming the contradiction), the `logger` section of `README.md`,
  and a "What it does not do" entry. `captureError` accepts any type and normalises internally, so
  `String(error)` and `JSON.stringify(error)` are never needed at a call site; `toError` is there for the
  cases that genuinely need an `Error` object back.
  
  ## The dedupe-by-identity rule is documented
  
  Deduplication is by object identity, and a second `captureError` call for the same `Error` is not a
  second occurrence. That was true but undocumented, which is how it came to be reported as a bug. It is
  now spelled out in `docs/API.md`, `docs/ARCHITECTURE.md` and `docs/TROUBLESHOOTING.md`, including the
  three limits: only objects and functions are tracked by identity, enrichment applies only while the row
  is `pending`, and a custom `ErrorRepository` without `mergeContext` loses the enrichment.
  
  ## Worker errors are not wired, and the docs now say so
  
  Nothing attaches to a `Worker` automatically, because a worker's `error` and `messageerror` events fire
  on the `Worker` object rather than on `window`. `docs/API.md` gains a full `/worker` section, `README.md`
  gains a FAQ answer, and `docs/TROUBLESHOOTING.md` gains a symptom entry that names the browser-console
  signal to look for. The list of installed global handlers is unchanged and correct: window errors,
  unhandled rejections, chunk loads, resources (opt-in), CSP (opt-in), and the framework and HTTP
  adapters — no worker.
  
  ## Two smaller corrections
  
  - `llms.txt` claimed the published tarball carries a **provenance attestation**. It does not, and has
    not since D-032 removed `publishConfig.provenance`; the file now says so and points at
    `dist.integrity` for verification. `llms-full.txt` carried the same stale `publishConfig` line.
  - `docs/TROUBLESHOOTING.md`'s quoted `size-limit` failure output was arithmetically impossible after
    the budget moved — it showed a size below the limit it claimed to exceed.
- Make the whole configuration surface reachable from the environment, add an init-time console level,
  and stop `mode` from reporting an intent the library is not acting on.
  
  > **Source note:** this was filed as a `minor` and is released as a `patch`. Nothing in it changes a
  > default, removes an option, or makes an existing configuration behave differently — it adds
  > environment variables, adds `logs.consoleLevel` (which has no default), corrects the `mode` *report*
  > to match the upload behaviour that was already in force, turns three internals into options, and
  > converts `examples/` to Markdown. `mode` is reported differently in one staging configuration; no
  > record, upload or stored value changes. That is a patch by the project's own rule, and 1.0.1 is the
  > release it ships in.
  
  **Every numeric option now has an environment variable.** Previously only the enable flags, the
  persist level and the two URLs could be set from the environment; retention, record caps, payload
  budgets, the rate limits, the sync interval and the batch size were options-only. They all read from
  the environment now, under the names you would expect:
  
  ```bash
  ERROR_TRACKING_ENABLED / ERROR_TRACKING_RETENTION_DAYS / ERROR_TRACKING_MAX_RECORDS
  ERROR_TRACKING_MAX_PAYLOAD_BYTES / ERROR_TRACKING_MAX_EVENTS_PER_MINUTE
  LOG_PERSIST_ENABLED / LOG_LEVEL / LOG_PERSIST_LEVEL / LOG_PERSIST_RETENTION_DAYS
  LOG_PERSIST_MAX_RECORDS / LOG_PERSIST_MAX_PAYLOAD_BYTES / LOG_PERSIST_MAX_LOGS_PER_MINUTE
  TELEMETRY_REST_ENABLED / ERROR_TRACKING_REST_URL / LOG_TRACKING_REST_URL
  TELEMETRY_SYNC_INTERVAL_MS / TELEMETRY_SYNC_BATCH_SIZE
  ```
  
  The older `TELEMETRY_ERRORS_ENABLED`, `TELEMETRY_LOGS_ENABLED`, `TELEMETRY_PERSIST_LEVEL`,
  `TELEMETRY_LOG_LEVEL`, `TELEMETRY_ERRORS_URL` and `TELEMETRY_LOGS_URL` are still read, and the
  specific name wins when both are set. `TELEMETRY_LOG_LEVEL` keeps its old meaning — the **persist**
  level — so no existing deployment's console output changes. An unparseable value is ignored and the
  default applies, exactly as an invalid option is.
  
  **`logs.consoleLevel` is new.** There was no way to set the console level at initialisation: only
  `logger.setLevel()` at runtime. It has **no default on purpose**, so initialising telemetry still
  never changes console output unless asked. `LOG_LEVEL` maps to it, and an empty `LOG_PERSIST_LEVEL`
  now inherits it, which is what makes "empty means inherit `VITE_LOG_LEVEL`" true.
  
  **`mode` now follows whether uploads are enabled, not whether a URL exists.** A configuration with
  endpoints filled in and `rest.enabled: false` — a very common staging setup — used to report
  `mode: 'remote'` while uploading nothing, and to emit a `mode-remote-without-endpoint` note claiming
  no endpoint was configured. It now reports `'local'` and stays silent, because the endpoint exists and
  was deliberately switched off. Upload behaviour is unchanged in every case: the sync manager has
  always required `mode`, `rest.enabled` **and** a resolvable endpoint.
  
  Also: `docs/API.md` gains an annotated reference for every option — what it means, its unit, its
  default, whether it is optional, and what happens at the boundaries — with the full environment
  mapping including legacy aliases.
  
  `examples/` is now a **Markdown-only guide tree** instead of five runnable applications: one directory
  per framework (`vanilla`, `react`, `vue`, `angular`, `nextjs`), each tiered
  `basic → advanced → config → more-advanced`, with the code in fenced blocks and a catalog at
  `examples/README.md`. Nothing under `examples/` is a package any more — no `package.json`, no build
  config, no `node_modules` — so it is no longer a pnpm workspace member, the `Examples build` CI job is
  gone, and `knip.ignoreWorkspaces` with it. The guides ship in the published tarball alongside `docs/`.
  
  **Three more internals are now options**, because each one changes observable behaviour rather than
  just speed:
  
  - `openTimeoutMs` (default `5000`, `TELEMETRY_OPEN_TIMEOUT_MS`) — how long to wait for an IndexedDB
    open before declaring storage unavailable. A slow device, a cold cache or another tab holding an
    upgrade open can exceed five seconds, and the consequence is that the library stops recording.
  - `logs.writeFlushMs` (default `1000`, `LOG_PERSIST_WRITE_FLUSH_MS`) — a **durability** window: a
    buffered log is written at most this long after the first buffered entry, so a tab crash inside that
    window loses it. Lower it to trade throughput for durability.
  - `logs.writeBatchSize` (default `50`, `LOG_PERSIST_WRITE_BATCH_SIZE`) — the buffered count that
    triggers an immediate write. The other half of the same trade.
  
  `DEFAULT_OPTIONS` references the existing constants (`LOG_FLUSH_INTERVAL_MS`, `LOG_FLUSH_BATCH_SIZE`,
  `DEFAULT_OPEN_TIMEOUT_MS`) rather than repeating literals, so a default and its documented constant
  cannot drift apart. Three internals were deliberately **left** internal, and
  [D-022](https://github.com/malikrajat/rm-logvault/blob/main/docs/DECISIONS.md) records why: the pre-init
  buffer size cannot be applied in time to matter, the cleanup cadence only changes speed, and the
  console-argument cap is a privacy-relevant guard whose widening belongs in `extra`/`tags`.
- Stop discarding the context on a duplicate capture, and add `'router'` and `'timeout'` to `ErrorSource`.
  
  ## Deduplication now enriches the record instead of throwing the second call away
  
  `captureError` deduplicates by object identity, and it used to be lossy in the worst possible
  direction. The *first* path an `Error` travelled won, and every later call was dropped whole — and the
  first path is usually the one that knows least, because `window.onerror` fires before any application
  code sees the error:
  
  ```ts
  // window.onerror wins the race and files the record as `source: 'manual'`, no tags.
  window.addEventListener('error', () => captureError(err));
  
  // The route loader that produced it knows where it came from. All of it was discarded.
  captureError(err, { source: 'router', tags: { route: '/orders/:id' } });
  ```
  
  The record was still written, which made this worse than a drop: the report showed the failure with
  the wrong origin and none of the context that would have identified it, and nothing anywhere said a
  second, better-informed capture had been thrown away.
  
  A repeat capture now applies an `ErrorContextPatch` to the record the first one produced:
  
  - `severity`, `tags` and `extra` are **merged**. A tag key present in both resolves to the second
    call's value — the later caller has more information.
  - `source` replaces the record's source **only when the first capture had no explicit source.** A
    global handler's `'manual'` default is correctable; a deliberate `{ source: 'vue' }` is never
    overwritten by a later guess.
  - A `source` change **also recomputes the fingerprint**, because `source` is the first hashed part in
    `fingerprintParts` and `save` aggregates on the fingerprint. `applyErrorContextPatch` owns both
    together, so no caller can update one without the other.
  - `occurrenceCount` stays at `1` and **no rate-limit token is spent**. This is enrichment, not a second
    occurrence — the double counting the identity check exists to prevent.
  - Enrichment is applied only while the row is still `pending`. A row claimed for upload belongs to an
    in-flight request and is never modified, the same rule that governs aggregation in `save`.
  
  `ErrorContextPatch` and `applyErrorContextPatch` are exported. `ErrorRepository` gains an **optional**
  `mergeContext(id, patch)`:
  
  ```ts
  mergeContext?(id: string, patch: ErrorContextPatch): Promise<StorageResult<ErrorRecord | undefined>>;
  ```
  
  Optional is a compatibility decision, not an oversight: `ErrorRepository` is a public interface that
  consumers implement, and a required member would break every one of them at compile time for a
  refinement. A custom backend written before this release keeps working and silently loses the
  enrichment — no fallback writes a second record, because a second record for one occurrence is the bug
  this replaces. `applyErrorContextPatch` is exported so an implementation does not have to reimplement
  fingerprint reconstruction. Both shipped repositories implement it, read-modify-write inside one
  `readwrite` transaction so two tabs cannot lose each other's tags.
  
  ## `ErrorSource` gains `'router'` and `'timeout'`
  
  `'router'` was rejected by the type, so a route-loader failure had to be filed as `'chunk'` —
  indistinguishable in a report from a genuine dynamic-import failure. `'timeout'` had no honest source
  at all. Both are now members, and both are additions for the same reason `'vue'`, `'angular'` and
  `'svelte'` were: a misleading `source` is a bug, not a cosmetic problem.
  
  `'timeout'` is also added to `UNHANDLED_SOURCES`, so a synthesised timeout defaults to
  `handled: false`. `'router'` is deliberately not: the caller that caught the failure decided how to
  handle it, so `handled` stays `true` unless the caller says otherwise.
  
  Nothing about the runtime changes for an existing integration: no record field was added or removed,
  `schemaVersion` stays `1`, and the wire format is unchanged. See `docs/DECISIONS.md` (D-033).
- Add per-fingerprint throttling, so one failing poll cannot exhaust the error budget.
  
  `errors.maxEventsPerMinute` (default `120`) is a global fixed window. It answers "how many errors may
  this page produce per minute" and it does that well. It does not answer "may *this* error be produced
  again", and that is the question a failing poll asks.
  
  A health-check worker polled every five seconds produces **twelve records a minute for one bug** — a
  tenth of the default budget spent on a failure that is already in the report — so eight more distinct
  failing queries exhaust the budget, and the records that get dropped are the **new** ones, because the
  poll is guaranteed to be there first. The report then shows one failure twelve times and none of the
  eight that followed it.
  
  ## `errors.maxRepeatsPerMinute`
  
  New option, default **`12`**, env `ERROR_TRACKING_MAX_REPEATS_PER_MINUTE`. It caps how many records one
  fingerprint may produce per 60-second window. `0` disables it and restores the previous behaviour
  exactly.
  
  The check runs **before** the global limiter, and that ordering is the entire mechanism:
  
  ```ts
  if (repeats.blocked(key)) return null;   // over its own cap: costs nothing at all
  if (!limiter.allow()) return null;       // global backstop
  repeats.record(key);
  ```
  
  A refused repeat must not reach the global limiter, because charging it a token is precisely what
  starves everything else. `createRepeatLimiter` therefore exposes **two** calls rather than one:
  `blocked(key)` registers nothing, and `record(key)` runs only after the global limiter has also
  admitted the event — so a saturated global window cannot silently consume every per-key slot.
  
  The key is deliberately **not** the real fingerprint. That one hashes the route, the API context, the
  component stack and the source, all of which are only known after a record is built — and the throttle
  has to be consulted before the global limiter to be worth anything. The cheap key is
  `source ⟂ name ⟂ message ⟂ first stack frame`, which is the identity of the failure as the throw site
  sees it.
  
  ## What you can observe
  
  - **`getTelemetryStatus().droppedByRepeat`** — new field, counting errors refused by this throttle in
    the current window. Deliberately separate from `droppedByRateLimit`, because the two mean opposite
    things to whoever reads the number: a rate-limit drop is a page producing too much and records
    genuinely missing, while a repeat drop is a failure already in the report whose budget went to new
    failures instead.
  - **`record:dropped`** gains the reason **`'repeat-limit'`**, as its own event rather than being folded
    into the error count, so a consumer alerting on that event can tell the two apart.
  - `createRepeatLimiter`, `RepeatLimiter` and `REPEAT_LIMITER_MAX_KEYS` are exported from the core.
  
  ## Boundaries
  
  - Records that *are* admitted still aggregate onto the one `pending` row for their fingerprint, so
    twelve admitted repeats are one row with `occurrenceCount: 12` — aggregation is unchanged.
  - The counter map is capped at `REPEAT_LIMITER_MAX_KEYS` (500) keys per window, and an untracked key
    past the cap is **admitted** rather than refused. Failing open keeps a genuinely new failure
    reportable; the global limiter is still the bound on the total.
  - The throttle fires one `[Telemetry] repeat-limit: …` note per rolled window, not one per refused
    key, which is the same once-per-window reporting the global limiter uses.
  
  See `docs/DECISIONS.md` (D-034) for the alternatives, including why the global limit is not simply
  lowered or raised.
- Read static members from function targets in `safeGet`, which restores the diagnostics download.
  
  `downloadText` reaches `URL.createObjectURL` through `safeGet`, and `URL` is a constructor — `typeof
  URL === 'function'`. `safeGet` rejected every non-object target, so the lookup could never succeed:
  
  ```ts
  // src/export/diagnosticsExport.ts
  const urlObject = safeGet(win, 'URL') ?? safeGet(globalThis, 'URL'); // the URL constructor
  const createObjectURL = safeGet(urlObject, 'createObjectURL');       // undefined, always
  if (typeof createObjectURL !== 'function') return false;             // so: always false
  ```
  
  The consequence was that **no diagnostics report could ever be downloaded**, by any route — not
  the `Ctrl+Shift+Alt+D` shortcut, not `exportDiagnosticsReport()`, for either the HTML or the JSON
  format. The blob URL was never created, the anchor was never clicked, and the file never appeared.
  
  It was silent by construction. The four `return false` statements in `downloadText` are
  feature-detection bail-outs rather than failures, so they never reach `reportInternalFailure`:
  no `[Telemetry]` line, no `onInternalError`, nothing in `getTelemetryStatus().storage`, and no
  storage or network involvement at all. The only visible signal was `false` from
  `shortcut.onExported` or from the `exportDiagnosticsReport()` return value, which the shortcut
  discarded.
  
  `safeGet` is the right place to fix it rather than `downloadText`: a function is an ordinary object
  with properties, reading one was always safe under the surrounding `try`/`catch`, and the guard was
  written to reject *primitives*. Narrowing it to objects alone quietly broke every static-member
  lookup.
  
  ```ts
  // src/core/env.ts, before
  if (target === null || typeof target !== 'object') return undefined;
  
  // after
  if (target === null || (typeof target !== 'object' && typeof target !== 'function')) {
    return undefined;
  }
  ```
  
  `safeGet` is a public export, so this widens documented behaviour. The blast radius was checked
  against all 89 call sites, and the full suite passes: the widening only affects a target that is a
  function, where a property read is now performed instead of being skipped. Returning `undefined` for
  `null`, `undefined`, strings, numbers and booleans is unchanged, and a throwing getter is still
  swallowed.
  
  Two regression tests cover it. `src/core/env.test.ts` pins the primitive itself —
  `safeGet(URL, 'createObjectURL')` must be a function. `src/export/diagnosticsExport.test.ts` is new
  and asserts the end-to-end contract that was missing from the unit suite entirely:
  `exportDiagnosticsReport()` resolves `true` and an anchor with a `blob:` href is clicked. The
  Playwright E2E spec already covered this path, so a run of `pnpm run test:e2e` would have caught it.
- Report an error record whose write failed, instead of discarding the result.
  
  `captureError` queued its persistence and threw the `StorageResult` away:
  
  ```ts
  // src/errors/captureError.ts, before
  void queue.push(() => repository.save(fitted));
  ```
  
  The log tracker right next to it inspects the identical result and reports a failure. So a log lost to
  a quota, serialization or transaction error produced a `[Telemetry] persist failed: …` line, while an
  **error** record lost to exactly the same cause produced nothing at all — no console line, no
  `onInternalError`, and `getTelemetryStatus().storage` still reading `'ready'`, because the store had
  opened successfully. That made a failed error write indistinguishable from a capture that never
  happened, which is the hardest version of "my errors are missing" to diagnose.
  
  A failed error write now reports under its own stage:
  
  ```
  [Telemetry] error-persist failed: quota
  ```
  
  The stage is deliberately not `'persist'`. `reportInternalFailure` emits each stage **once per
  initialization**, so sharing the name would mean that whichever of the two failed first would suppress
  the other's report — and a silently broken error store is exactly what this exposes.
  
  `captureError` remains synchronous and still cannot throw: the promise is not awaited, `queue.push`
  never rejects, and `reportInternalFailure` is fully guarded, so the added continuation cannot reject.
  
  One behaviour to be aware of: `getTelemetryStatus().pending.errors` is incremented by `onRecord` when
  the pipeline *accepts* a record, so it counts a record whose write subsequently fails until the next
  flush or sync refreshes the snapshot from storage. That was already true for logs.
- Restore the `files` allow-list, so the published package carries its type declarations again.
  
  `package.json` declared `exports`, `main`, `types` and `typesVersions` for all ten entry points and no
  `files` field. `files` is an allow-list; with it absent npm falls back to `.npmignore`, which ignores
  `*.ts` in every directory — `dist/index.d.ts` included. **Every `.d.ts` and `.d.cts` was therefore
  stripped from the packed tarball**, so every import of the package from a TypeScript application failed:
  
  ```
  Cannot find module '@codewithrajat/rm-logvault' or its corresponding type declarations.
  Cannot find module '@codewithrajat/rm-logvault/angular' or its corresponding type declarations.
  ```
  
  The tarball held the JavaScript for all ten entry points and the types for none of them. `files` now
  lists `dist`, `docs`, `examples`, `README.md`, `CHANGELOG.md`, `CONTRIBUTING.md`, `SECURITY.md`,
  `LICENSE`, `llms.txt` and `llms-full.txt`. That also stops `AGENTS.md` — a repository document — from
  being published, and restores `docs/` and `examples/` to the tarball, which is what D-023 intended.
  
  Three related corrections ship with it:
  
  - `.npmignore`'s `*.ts` / `*.tsx` rules are anchored to the repository root (`/*.ts`). A bare `*.ts`
    matches `dist/index.d.ts`, so the file kept as a safety net was able to take the declarations with
    it. The `docs/`, `examples/` and `llms*` rules that contradicted that file's own header are gone.
  - `scripts/copy-extra-files.mjs` no longer stages a copy of `package.json`, `README.md`, `docs/` and
    `examples/` into `dist/`. That copy is what made the build directory look like an installable
    package, and packing from inside it produced a tarball whose root held `index.js` while the manifest
    still pointed at `./dist/index.js` — a package where **nothing** resolved, JavaScript included.
    Nothing is staged into `dist/` any more.
  - The renamed `scripts/verify-package-files.mjs` runs on every build. It verifies that each
    allow-listed path exists and is non-empty, then runs `pnpm pack --dry-run` and fails if the tarball
    is missing a path that `main`, `module`, `types`, `exports` or `typesVersions` promises, carries no
    `.d.ts` or `.d.cts`, contains anything outside the allow-list, or if an allow-listed entry
    contributed nothing. It also fails on an `.npmignore` or `.gitignore` found *inside* an allow-listed
    directory: npm applies those rules to the directory it packs and `files` does not override them, so
    a `dist/.npmignore` left behind by the old staging step kept stripping the declarations from the
    tarball even after the allow-list was restored. `pnpm run check:package` runs the gate on its own,
    and `-- --list` prints every packed path.
  
  The failure this replaces was silent from the repository and invisible to `publint`, `attw` and
  `pnpm pack --dry-run` as CI used it, which is why the check now asserts rather than prints.
- Fix errors captured through an adapter being silently discarded.
  
  Every adapter subpath (`/angular`, `/react`, `/vue`, `/axios`, `/fetch`, `/react-query`) is built as
  its own bundle with the core **inlined** — `splitting: false`, and only the framework peers are
  `external`. Each copy therefore had its own module-scoped `activeTracker`, `preInitErrors` and
  `suppressed`, while only `initTelemetry`, in the root entry, can install a tracker. Rollup proved the
  adapter copy's dispatch unreachable and compiled the body away:
  
  ```js
  // dist/angular.js, before
  if (activeTracker !== null) ;   // body removed: provably always null
  if (preInitErrors.length >= PRE_INIT_ERROR_BUFFER_SIZE) return;
  preInitErrors.push({ normalized: normalizeError(error), … });
  ```
  
  So `provideTelemetryErrorHandler()` — and the React and Vue adapters, which funnel into their own
  inlined `captureError` — buffered every error into an array nothing ever drains, because
  `flushPreInitErrors` is called only by `initTelemetry`, in the other bundle. Nothing was reported
  either, because no operation had failed. The signature was an app whose `logger.*` calls persisted
  normally while every thrown error vanished: `rm-logvault-errors` empty, no `[Telemetry]` line in the
  console, and `getTelemetryStatus().storage` still reporting `'ready'`.
  
  The error pipeline's process-wide state now lives on the shared
  `globalThis[Symbol.for('logvault@1')]` state object, so any copy of the library resolves the one live
  tracker. `getState()` backfills those members when it adopts a state object written by an older build
  — necessary, not merely defensive, because the property is installed non-configurable and two versions
  can be loaded in one page.
  
  No public API changes: the state object and `BufferedError` are internal, and `src/index.ts` does not
  re-export the latter. The core grows from 31.77 kB to 31.91 kB min+gzip, still inside the 32 kB budget.
  
  Two boundaries worth knowing:
  
  - The **logger facade** is still module-scoped, so two copies of the *root* entry each keep their own
    `logger` and sink list. No shipped subpath exports `logger`, so an adapter can never reach the wrong
    one. See [D-026](https://github.com/malikrajat/rm-logvault/blob/main/docs/DECISIONS.md).
  - The adapters still have no test that asserts a record reaches a repository — `coverage/lcov.info`
    records `FNDA:0` for `provideTelemetryErrorHandler` and `reactRootErrorHandlers`. This release adds
    duplicate-copy regression tests for the pipeline itself, but per-adapter coverage remains a gap.
- Add `createCaptureErrorMock` and `createLoggerMock` to `@codewithrajat/rm-logvault/testing`.
  
  Almost every test suite that uses this library contains the same hand-rolled mock, and almost every
  hand-rolled version gets one of these wrong:
  
  ```ts
  // Wrong: the mock is module-scoped, so the second test file that imports it appends to records
  // the first one asserted on.
  export const captured: unknown[] = [];
  vi.mock('shared/telemetry', () => ({
    captureError: (error: unknown) => captured.push(error),
  }));
  
  // Wrong: the shape is a bare `vi.fn()`, so a test that needs `ctx.tags` has to reach into
  // `mock.calls[0][1]` and cast.
  vi.mock('shared/telemetry', () => ({ captureError: vi.fn() }));
  ```
  
  Both factories hand back a **recording** double with a typed inspection API and an explicit
  `reset()`, so a suite states what it is asserting on instead of unpacking a call tuple.
  
  ```ts
  import { vi } from 'vitest';
  import { createCaptureErrorMock, createLoggerMock } from '@codewithrajat/rm-logvault/testing';
  
  export const telemetry = createCaptureErrorMock();
  export const logging = createLoggerMock();
  
  vi.mock('shared/telemetry', () => ({
    captureError: telemetry.captureError,
    logger: logging.logger,
  }));
  ```
  
  ## `createCaptureErrorMock()`
  
  `{ captureError, calls, last(), count(), messages(), withSource(source), reset() }`.
  
  - `calls` is a live array of `{ error, ctx, message }`, in order. `error` is **exactly** the value
    passed, so an identity assertion works.
  - `message` is derived through the library's own `normalizeError`, which cannot throw — so recording a
    hostile value and then reading `messages()` is safe.
  - `withSource(source)` filters by `ctx.source`, which is the assertion most suites actually want.
  
  ## `createLoggerMock(options?)`
  
  `{ logger, calls, atLevel(level), atLeast(level), last(), messages(), sinks, reset() }`.
  
  Unlike a bare spy it implements the **whole** `Logger` contract — `trace`/`debug`/`info`/`warn`/
  `error`, `addSink`, `setLevel`, `setEnabled`, `getConfig` — so it can be substituted anywhere the real
  facade is accepted, including through `initTelemetry({ logSource })`. `atLeast` uses
  `LOG_LEVEL_PRIORITY`, the library's own level ladder, so a test asserting "warn or above" cannot drift
  from the real filter. `options.level` defaults to `'warn'` and `options.enabled` to `true`, matching
  the real facade, and `reset()` restores both.
  
  Neither reaches library state: importing the `/testing` subpath installs nothing, starts nothing and
  opens no database. The subpath measures **4.68 kB min+gzip**, and it is still not something to ship to
  production.
- Add `toError` and `withChunkCapture`, so two gaps on the error path stop being hand-rolled.
  
  ## `toError(value: unknown): Error`
  
  `throw` accepts anything, and callers who need an `Error` wrote the same three lines by hand — every
  version of them wrong somewhere:
  
  ```ts
  // A lint error (`no-base-to-string`), and `[object Object]` for a plain object.
  throw new Error(String(error));
  
  // Throws `TypeError: Converting circular structure to JSON` for a cyclic object, which turns
  // "report this failure" into a second, worse failure.
  throw new Error(JSON.stringify(error));
  ```
  
  `normalizeError` already solved all of it internally, but returns a record shape rather than an
  `Error`. `toError` is the thin bridge:
  
  - A same-realm `Error`, **or** an Error-like object from another realm — `instanceof` cannot see an
    iframe's, a worker's or a `vm` context's `Error` — is returned **unchanged**, so `throw toError(x)`
    preserves value identity and the original stack.
  - Anything else produces a new `Error` whose `message` came out of `normalizeError` (bounded by
    `MAX_MESSAGE_LENGTH`, already redacted) and whose `cause` is the original value.
  - **Never throws, and never calls `JSON.stringify` on raw input.** A cyclic object, a `Proxy` whose
    every getter raises, a `Symbol`, a `BigInt`, `null` and `undefined` are all handled.
  
  `cause` is attached with `Object.defineProperty` rather than the `Error` options bag, which is an
  ES2022 feature while the build targets ES2020. A runtime that refuses the definition still gets a
  usable `Error`; only the link is lost.
  
  ## `withChunkCapture(route, loader, ctx?)`
  
  A failed dynamic `import()` is the most confusing failure a single-page application produces: it is
  thrown from inside the bundler's runtime, it arrives at whichever boundary happens to be mounted, it is
  nearly always reported twice, and its message names a hashed filename nobody can read.
  
  ```tsx
  import { lazy } from 'react';
  import { withChunkCapture } from '@codewithrajat/rm-logvault';
  
  const Overview = lazy(withChunkCapture('Overview', () => import('./Overview')));
  ```
  
  The returned loader is an `async` function, so it **never throws synchronously** — a loader that throws
  still produces a rejected promise, exactly as `import()` does. A failure is captured once with
  `source: 'chunk'`, `category: 'chunk'`, `severity: 'fatal'`, `handled: false` and a `route` tag, then
  **re-thrown unchanged**, so your own retry or reload logic sees exactly what `import()` rejected with.
  
  `handled: false` is what makes the boundary's own `captureError` call agree with it: the same `Error`
  object reaching both paths is one record, not two.
  
  Each derived field is overridable through `ctx`, and `ctx.tags` are merged with the `route` tag (which
  wins). An empty `route` becomes `'unknown'`. `Source note:` the helper is deliberately **not** gated on
  `errors.captureChunkErrors` — that option decides only whether the library's *own* global handlers
  treat an uncaught dynamic-import failure as a chunk error, and calling this function is an explicit
  request.
  
  Both ship in the **core** entry point rather than a subpath: they are small, and both exist to be
  adjacent to `captureError` at the call site. See `docs/DECISIONS.md` (D-036) for the packaging
  alternatives that were rejected and why the budget moved with them (D-037).
- Add `@codewithrajat/rm-logvault/worker`, so a `Worker`'s failures can finally be captured.
  
  `'worker'` has been a member of `ErrorSource` — and of `UNHANDLED_SOURCES` — since 0.1.0, and nothing
  in the library ever produced it. A worker's `error` and `messageerror` events fire on the **`Worker`
  object**, not on `window`, so `initTelemetry` cannot see them: every application that owns a worker
  hand-wrote the same two listeners, and the ones that did not got a feature that "sometimes does
  nothing" with nothing in the report to explain it.
  
  ```ts
  import { attachWorker } from '@codewithrajat/rm-logvault/worker';
  
  const worker = new Worker('/health.worker.js', { type: 'module' });
  const detach = attachWorker(worker, { name: 'healthStatus', responseTimeoutMs: 10_000 });
  ```
  
  - **`error`** — `source: 'worker'`, `tags.op: 'fatal'`, `category: 'runtime'`, `severity: 'fatal'`,
    `handled: false`. The worker's own error object is preferred when the engine supplies one;
    otherwise the `ErrorEvent`'s `message` is used, with `filename`/`lineno`/`colno` recorded as the
    record's `location`. That is the same field allow-list the window handler reads.
  - **`messageerror`** — a *deserialisation* failure: the worker sent something that could not be
    structured-cloned. There is no error object, no stack, and the `error` event never fires for it, so
    the message is synthesised and tagged `tags.op: 'messageerror'`.
  - **`expectResponse(label?)`** with `responseTimeoutMs` — the only signal available for a worker that
    is alive but wedged, because it produces no event at all. Reports `tags.op: 'timeout'`,
    `category: 'timeout'`, `severity: 'error'`.
  
  Every record is tagged `worker: <name>`, and `options.name` defaults to `'worker'` — set it, because a
  page with three workers and a report full of `worker: 'worker'` is a page whose report cannot say which
  one died.
  
  `attachWorker` returns a **callable** attachment, so `const detach = attachWorker(w)` then `detach()`
  works; it also exposes the same function as `.detach()` and carries `.expectResponse()`. It **never
  throws**, is inert on a target with no `addEventListener` (so it can be called unconditionally on a
  value that may not be a worker), and detaching is idempotent and only removes our own listeners.
  
  A worker is deliberately **never attached automatically.** There is no registry of live `Worker`
  instances to scan, and keeping one would mean monkey-patching the `Worker` constructor — a far more
  invasive change than wrapping `fetch`, because it would alter what a consumer's own
  `instanceof Worker` checks return, on every page, whether or not it has a worker. Neither listener
  calls `preventDefault()`, and unlike `errors.preventDefaultUnhandledRejection` there is no option to:
  that option exists for a real use case (a framework's own rejection tracking) and a worker error has
  none.
  
  The adapter is a subpath, so a consumer with no worker pays nothing for it: it measures **7.35 kB
  min+gzip**. It inlines its own copy of the core pipeline like every other adapter, and resolves the
  one live tracker through the shared state object, so a record captured through it lands in the same
  store as one captured from the root entry. See `docs/DECISIONS.md` (D-035).

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

Releases are managed with [changesets](https://github.com/changesets/changesets). **Every section from
1.0.0 onwards is generated, not hand-written:** `pnpm exec changeset` records a change as a file under
`.changeset/`, and `pnpm exec changeset version` consumes every pending file into the next section
below and bumps `version` in `package.json` to match. See
[CONTRIBUTING.md](CONTRIBUTING.md#changesets) for the workflow. Because the package was pre-1.0, a
release before 1.0 could carry a breaking change in a minor; from 1.0.0 onwards the usual semver rule
applies, so a breaking change requires a major.

The **0.1.0** section at the bottom is the one exception. It predates the changeset workflow and is
written by hand in Keep-a-Changelog's `Added` / `Changed` / `Fixed` form, so it is the only section
with those headings — read its `### Changed` and `### Removed` lists before upgrading from 0.1.0.

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

[0.1.0]: https://github.com/malikrajat/rm-logvault/releases/tag/v0.1.0
