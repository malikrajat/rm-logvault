# Troubleshooting

Twelve symptoms, each with the cause, how to confirm it, and the fix. Every diagnostic below works
from the browser console or from application code — there is no server-side tooling to reach for,
because there is no server.

**Start here.** In the page console:

```js
const { getTelemetryStatus, getState, resolveOptions, isSyncConfigured } = await import('@codewithrajat/rm-logvault');

console.table(getTelemetryStatus());
console.log('options', getState().options);
console.log('sync configured', isSyncConfigured(getState().options ?? resolveOptions()));
```

`getTelemetryStatus()` alone answers several of the twelve symptoms below.

Another quiet-but-useful check: the library reports its own failures through `onInternalError` and
through the console under the reserved `[Telemetry]` prefix, **once per stage per initialization**. If
nothing appears there, the library believes it is working — which means the problem is in
configuration or in expectations, not in a swallowed exception.

> **One exception, fixed in 1.0.1.** That reasoning is only as good as the code doing the reporting,
> and 1.0.0 carried a defect that failed *without failing anything*: every adapter bundle
> (`/angular`, `/react`, `/vue`, `/axios`, `/fetch`, `/react-query`) inlined its own copy of the error
> pipeline, and that copy's tracker could never be installed. Captures routed through
> `provideTelemetryErrorHandler()`, `reactRootErrorHandlers()` and the Vue plugin were buffered into
> an array nothing drained — no write failed, so nothing was reported. If you are on 1.0.0 and errors
> are missing while logs are stored, jump to
> [Errors are missing while logs are stored](#errors-are-missing-while-logs-are-stored).

```ts
initTelemetry({
  appName: 'checkout',
  onInternalError: (stage, error) => {
    // stage is low-cardinality and stable, e.g. 'storage (unavailable)', 'persist', 'flush', 'claim'
    console.error(`[rm-logvault] ${stage}`, error);
  },
});
```

---

### Storage is unavailable

**Symptom.** `getTelemetryStatus().storage` is `'unavailable'`. The diagnostics export returns
`false`. Nothing appears in the `rm-logvault-errors` or `rm-logvault-logs` databases in DevTools. The
console shows a one-off `[Telemetry] storage (unavailable) failed: …` line if you wired up
`onInternalError`.

**Cause.** One of:

1. **Safari private browsing.** Accessing the `indexedDB` property _throws_ rather than returning
   `undefined`. `resolveFactory` catches this and returns `'blocked'`, and the connection is marked
   permanently unavailable.
2. **A sandboxed iframe** without `allow-same-origin`. `open()` throws a `SecurityError`, which sets
   `permanentlyUnavailable`.
3. **Server-side rendering.** There is no `indexedDB` in Node. Nothing is captured and nothing is
   stored, by design.
4. **A third-party-storage-blocking browser setting** (Firefox's "Cookies and Site Data" in strict
   mode, Brave shields, or a `Clear-Site-Data` response).
5. **The `open()` request timed out.** Another tab is holding an upgrade open. The timeout defaults
   to `DEFAULT_OPEN_TIMEOUT_MS` (5000 ms) and is raised with the `openTimeoutMs` option; the failure
   is classified as `'transaction'`.
6. **Both databases failed to open.** Note the threshold: `createIdbRepository.initialize()` returns
   `failure` only when **both** error and log databases fail. One working store is treated as ready.

**Diagnosis.**

```js
// 1. Is IndexedDB even reachable? (Wrap it: in Safari private mode this throws.)
let factory;
try {
  factory = window.indexedDB;
  console.log('indexedDB present:', factory !== undefined && factory !== null);
} catch (error) {
  console.error('indexedDB access threw:', error);
}

// 2. Which databases exist?
const databases = await indexedDB.databases();
console.log(databases.filter((db) => db.name?.startsWith('rm-logvault')));

// 3. What does the library think?
const { getTelemetryStatus, getState } = await import('@codewithrajat/rm-logvault');
console.log(getTelemetryStatus().storage, getState().storageState);
```

`getTelemetryStatus().storage` distinguishes four cases: `'initializing'` (the readiness promise has
not settled yet — IndexedDB opens asynchronously), `'ready'` (usable), `'unavailable'` (tried and
failed), and `'disabled'` (master switch off, so it never tried). A status read immediately after
`initTelemetry()` may be `'initializing'`; `await flushTelemetry()` settles it.

**Fix.** Decide which of these you are in:

- **Expected degradation.** Nothing to fix. Capture, redaction and console output continue; uploads
  never start, and the export returns `false`. Surface it in the UI only if your support flow depends
  on the report:

  ```ts
  import { getTelemetryStatus } from '@codewithrajat/rm-logvault';

  const status = getTelemetryStatus();
  if (status.storage === 'unavailable') {
    showSupportFormInsteadOfReport(); // "please send us a description" fallback
  }
  ```

- **An iframe.** Add `allow-same-origin` to the sandbox attribute. Without it, the frame has an
  opaque origin and IndexedDB is genuinely unavailable — no library can work around that.

- **A previous timed-out open.** Reload the page once the other tab has finished its upgrade. The
  connection re-opens on the next call and re-runs the (idempotent) `upgrade` function.

- **A stale connection after the user cleared site data.** The `db.onclose` handler drops the cached
  handle, and `ensureOpen()` re-opens and re-upgrades on the next call. This self-heals; a reload is
  not required but is the fastest way to see it.

- **You need persistence in an environment without IndexedDB.** Supply a custom repository —
  `createMemoryRepository()` for tests, or your own op-log-backed implementation for OPFS or a
  service worker cache:

  ```ts
  import { initTelemetry } from '@codewithrajat/rm-logvault';
  import { createMemoryRepository } from '@codewithrajat/rm-logvault/testing';

  initTelemetry({ appName: 'kiosk', repository: createMemoryRepository() });
  ```

---

### Nothing is being uploaded

**Symptom.** Records accumulate locally (`getTelemetryStatus().pending.errors` climbs), the network
tab shows no requests to your endpoint, and `syncStatus` stays `'idle'`.

**Cause**, in rough order of likelihood:

1. **`mode` resolved to `'local'`.** Check `getTelemetryStatus().mode` first — it is the single
   fastest diagnosis and it rules everything else out. `'local'` is the **default**, and it means the
   library issues no network requests at all, so a configured URL is simply ignored. Two ways to land
   there:
   - you set `mode: 'local'` explicitly (perhaps in a shared config, or to disable uploads in tests);
   - you passed no `rest.errorsUrl`, `rest.logsUrl` and no `rest.transport`, so there was nothing to
     infer `'remote'` from.

   Fix: pass a URL, or set `mode: 'remote'` deliberately. If you set `mode: 'remote'` and still see
   no traffic, `onInternalError` will have been called once with the stage
   `mode-remote-without-endpoint` — that means the endpoint was present but failed validation, so
   jump to cause 2.
2. **No endpoint was configured.** `rest.enabled` is _derived_: it is `true` only when
   `transport`, `errorsUrl` or `logsUrl` was supplied.
3. **The URL failed validation.** `resolveEndpoint` rejects empty strings, forbidden schemes
   (`javascript:`, `data:`, `blob:`, `file:`, `about:`, `chrome:`, `chrome-extension:`, `vbscript:`)
   and, with `requireHttps: true`, plain `http:` on a non-localhost host.
4. **A relative URL outside a browser.** `/telemetry/errors` needs a `window.location.href` to
   resolve against; in SSR it is unusable and the endpoint is dropped.
5. **Uploads never started.** `syncManager.start()` is gated on the storage readiness promise
   resolving `true`. If storage is `'unavailable'`, sync never starts.
6. **The failure counter is non-zero.** While backing off, `notifyNewRecords()` intentionally refuses
   to pull a run forward. The delay grows as `min(15000 * 2^(failures-1), 900000)` ms.
6. **The browser reports itself offline.** `isOnline()` returns `false`, the run sets status
   `'offline'`, and the summaries come back with `stopped: true`.
7. **Everything is `failed`, not `pending`.** A terminal status five minutes ago marked the batch
   `failed`, which excludes it from automatic retries — see
   [Records are stuck in `failed`](#records-are-stuck-in-failed).
8. **Nothing is eligible.** `errors.enabled` or `logs.enabled` is `false`, so the corresponding
   repository is `null` and `flushBatch` returns immediately.

**Diagnosis.**

```js
const { getTelemetryStatus, getState, resolveOptions, resolveEndpoints, isSyncConfigured } =
  await import('@codewithrajat/rm-logvault');

const options = getState().options ?? resolveOptions();
console.log('sync configured:', isSyncConfigured(options));
console.log('resolved endpoints:', resolveEndpoints(options));
console.log('status:', getTelemetryStatus());
```

`resolveEndpoints` returning `{ errorsUrl: undefined, logsUrl: undefined }` means validation rejected
your URLs. Compare the raw strings in `options.rest.errorsUrl` against the rules above.

Also check `getState().storageState`: if it is not `'ready'`, sync never started at all.

**Fix.**

```ts
import { initTelemetry, syncTelemetry } from '@codewithrajat/rm-logvault';

initTelemetry({
  appName: 'checkout',
  rest: {
    errorsUrl: '/telemetry/errors', // relative is fine in a browser
    logsUrl: '/telemetry/logs',
    // Absolute alternative:
    // errorsUrl: 'https://api.example.com/telemetry/errors',
    intervalMs: 30_000,
    batchSize: 50,
    getHeaders: async () => ({ Authorization: `Bearer ${await getAccessToken()}` }),
  },
});
```

Then force a run and read the summary, which is the fastest possible diagnosis:

```ts
const { syncTelemetry } = await import('@codewithrajat/rm-logvault');
console.log(await syncTelemetry());
// { errors: { claimed: 12, uploaded: 12, retried: 0, failed: 0, stopped: false }, logs: { … } }
```

| Summary shape                             | Meaning                                                                  |
|-------------------------------------------|--------------------------------------------------------------------------|
| `claimed: 0, uploaded: 0`                 | Nothing was eligible. Check `getTelemetryStatus().pending`.              |
| `claimed: 12, uploaded: 12`               | It worked. The network tab should show the requests.                     |
| `claimed: 12, retried: 12, stopped: true` | A retryable failure. Read the console for `[Telemetry] flush failed: …`. |
| `claimed: 12, failed: 12`                 | A terminal status. See the `failed` section.                             |

If `syncTelemetry()` returns all zeros while pending counts are non-zero, `syncManager.isEnabled()` is
`false` — which is the endpoint-validation case.

---

### The shortcut does not fire

**Symptom.** Pressing Ctrl+Shift+Alt+D does nothing. No download, no console error, no `onExported`
call.

**Cause.** The matching rules are strict, and any one of them silences the shortcut:

1. **An extra modifier is held.** Modifier matching is **exact**. `metaKey` defaults to `false`, so
   Ctrl+Shift+Alt+D with Cmd also held does not match.
2. **Focus is in an editable element.** `isEditableTarget()` refuses `<input>`, `<textarea>`,
   `<select>`, `[contenteditable=""]`, `[contenteditable="true"]` and
   `[contenteditable="plaintext-only"]`. This is deliberate: without it, typing "d" in a form would
   trigger a download and `preventDefault()` the keystroke.
3. **`allow()` returned something other than `true`** — or threw. A throwing gate suppresses the
   trigger.
4. **`shortcut: false` was passed.**
5. **A different `key` was configured.** `key: 'd'` matches `KeyboardEvent.code === 'KeyD'`, with
   `event.key.toLowerCase() === 'd'` as a fallback. `'D'` works; `'F5'` does not (only a single letter
   or digit maps to a `code`).
6. **SSR or a worker.** `installShortcut` finds no target and returns a no-op cleanup.
7. **The page has an iframe with focus.** The listener is on _that document_. If focus is inside a
   same-origin iframe, the iframe's own installation must handle it.
8. **The device has no keyboard.** A phone or a tablet never emits `keydown`, so the shortcut cannot
   fire there by construction. This is not a misconfiguration — it is the single most common reason a
   report can be produced on a developer's laptop and not on the customer's device. Wire the export to
   a button instead; see the Fix below.

**Diagnosis.** Watch the real event and compare it to the matcher:

```js
const { matchesShortcut } = await import('@codewithrajat/rm-logvault');

const config = { key: 'd', ctrl: true, shift: true, alt: true, meta: false };

document.addEventListener(
  'keydown',
  (event) => {
    console.log({
      code: event.code,
      key: event.key,
      ctrl: event.ctrlKey,
      shift: event.shiftKey,
      alt: event.altKey,
      meta: event.metaKey,
      target: event.target?.tagName,
      matches: matchesShortcut(event, config),
    });
  },
  true,
);
```

Three outcomes:

- **No log at all** → the keydown never reaches the document. Focus is in an iframe or a shadow root
  with its own retargeting, or the OS/browser is swallowing the combination (some layouts and
  window managers reserve Ctrl+Shift+Alt+letter).
- **A log with `matches: false`** → read the modifier booleans. On macOS, Option is `altKey`; on some
  layouts the physical key under `d` produces a different `key`, which is exactly why `code` is
  checked first. If a modifier is unexpectedly `true`, the OS is injecting it.
- **A log with `matches: true`, but nothing downloads** → the listener fired. Check
  `isExportInFlight()` and look for `[Telemetry] diagnostics-export failed` in the console. A
  concurrent export returns `false` silently by design.

Also confirm the listener is installed at all:

```js
const { globalHandlersAttached } = await import('@codewithrajat/rm-logvault');
console.log('global handlers attached:', globalHandlersAttached());
// (the shortcut has its own listener; this only proves the error handlers are attached)
```

**Fix.**

```ts
import { initTelemetry } from '@codewithrajat/rm-logvault';

initTelemetry({
  appName: 'checkout',
  shortcut: {
    // Pick a combination that is not reserved by the OS.
    key: 'k',
    ctrl: true,
    shift: true,
    alt: false,
    meta: false,
    allow: () => isInternalUser(),
    onExported: (ok) => console.info(ok ? 'report downloaded' : 'report failed'),
  },
});
```

`onExported` is the single most useful debugging aid: it fires with `true` or `false` for every export
that actually ran, including a clipboard write. If it never fires, either the shortcut did not match —
or the export returned early, because a concurrent export was in flight, or there is no browser, or no
repository (`enabled: false`, or before `initTelemetry`). Those three are "this press did nothing"
rather than "the export failed", so they are deliberately silent.

If it fires with `false`, the trigger matched and the export ran, so the failure is in the last step.
On the download path `runExport` returns `false` for exactly three reasons: there is no browser, there
is no repository (`getTelemetryStatus().storage` reads `'unavailable'` or `'disabled'`), or
`downloadText` refused to start a download. That last one is **silent by design** — the four checks at
the top of `downloadText` are feature detection, not failures, so they never reach
`reportInternalFailure` and emit no `[Telemetry]` line even when storage is perfectly healthy. Check
the capability directly rather than the storage state:

```js
console.table({
  Blob: typeof Blob,
  URL: typeof URL,
  'URL.createObjectURL': typeof URL?.createObjectURL,
});
```

A missing `window.Blob`, `window.URL` or `URL.createObjectURL` — a test that deletes one, a hardened
runtime, an unusual embedder — makes every download return `false` with nothing logged.
`exportDiagnosticsReport({ format: 'json', copyToClipboard: true })` bypasses the blob path entirely:
it works as a workaround, and it proves the read-and-render half of the pipeline is healthy.

> **Source note.** Through 1.0.2 this path could never succeed at all, in any browser: `safeGet`
> rejected function targets, so `URL.createObjectURL` always read as `undefined` and every download
> returned `false` regardless of the environment. Fixed in 1.0.3.

If the shortcut is genuinely unsuitable (a kiosk with no keyboard, or a requirement that reports be
produced only by a support tool), disable it and drive the export yourself:

```ts
initTelemetry({ appName: 'kiosk', shortcut: false });

// Wire it to whatever your support flow uses.
document.getElementById('export-diagnostics')?.addEventListener('click', async () => {
  const { exportDiagnosticsReport } = await import('@codewithrajat/rm-logvault');
  await exportDiagnosticsReport({ format: 'json' });
});
```

---

### CORS errors on upload

**Symptom.** The console shows `Access to fetch at 'https://api.example.com/telemetry/errors' from
origin 'https://app.example.com' has been blocked by CORS policy: …`. Records stay `pending`, and
`syncStatus` is `'retry'` with the backoff growing.

**Cause.** A cross-origin `POST` with `Content-Type: application/json` is **not a simple request**, so
the browser sends an `OPTIONS` preflight first. The upload fails if the preflight fails, or if the
actual response is missing the allow headers. Common ways that happens:

1. **The preflight route is not handled.** A framework that only registers `POST /telemetry/errors`
   returns `405` or `404` to `OPTIONS`, and the browser reports a CORS failure. The `POST` is never
   attempted.
2. **`Access-Control-Allow-Origin` is missing or wrong.** A wildcard `*` is illegal if
   `rest.credentials` is `'include'` — the origin must be echoed.
3. **`Authorization` is not in `Access-Control-Allow-Headers`.** Any header added by
   `rest.getHeaders()` must be listed.
4. **The CORS middleware is mounted after the route**, so it never runs for the preflight.
5. **A proxy or gateway strips the headers** on the way back.
6. **`Retry-After` is not exposed.** This does not break the upload, but the client cannot read the
   header without `Access-Control-Expose-Headers: Retry-After`, so it silently falls back to plain
   exponential backoff.

**Diagnosis.** In the network tab, look for the `OPTIONS` request to the same URL:

- No `OPTIONS` at all, and no `POST` → the browser refused before sending. Check for a `mixed content`
  or CSP error in the console instead.
- `OPTIONS` present with a `4xx`/`5xx` → the server is not handling the preflight.
- `OPTIONS` returns `2xx` but the `POST` is blocked → the response headers on the **actual** response
  are missing, or the `POST` uses a header not in `Access-Control-Allow-Headers`.
- Both requests succeeded but records remain `pending` → not CORS. Run `await syncTelemetry()` and
  read the summary.

You can bypass the browser's CORS enforcement with `curl` to prove the endpoint itself is fine:

```bash
curl -i -X POST 'https://api.example.com/telemetry/errors' \
  -H 'Content-Type: application/json' \
  -H 'Origin: https://app.example.com' \
  --data '{"schemaVersion":1,"kind":"errors","sentAt":0,"app":{"appName":"x","appVersion":"","buildId":"","environment":""},"records":[]}'
```

If `curl` succeeds and the browser does not, it is CORS, full stop.

**Fix.** Add the headers to every response, including the preflight:

```http
Access-Control-Allow-Origin: https://app.example.com
Vary: Origin
Access-Control-Allow-Methods: POST, OPTIONS
Access-Control-Allow-Headers: Content-Type, Authorization, X-Request-Id, X-Correlation-Id, X-Trace-Id, Traceparent
Access-Control-Expose-Headers: Retry-After
Access-Control-Max-Age: 600
```

In Express, mount CORS **before** the routes:

```ts
import cors from 'cors';
import express from 'express';

const app = express();

app.use(
  '/telemetry',
  cors({
    origin: ['https://app.example.com'],
    methods: ['POST', 'OPTIONS'],
    allowedHeaders: [
      'Content-Type',
      'Authorization',
      'X-Request-Id',
      'X-Correlation-Id',
      'X-Trace-Id',
      'Traceparent',
    ],
    exposedHeaders: ['Retry-After'],
    maxAge: 600,
  }),
);

app.use('/telemetry', express.json({ limit: '2mb' }));
app.post('/telemetry/errors', handleErrors);
app.post('/telemetry/logs', handleLogs);
```

Note that `cors()` handles the `OPTIONS` preflight itself and short-circuits it, which is what fixes
cause (1). If you cannot change the server, put the endpoint on the same origin — a reverse proxy
path like `/telemetry/*` — and use a relative URL. Same-origin requests have no preflight at all.

Do not work around CORS by setting `rest.credentials: 'include'` or by disabling the browser's
security. Neither fixes anything, and the first makes the server configuration harder.

---

### CSP blocks the upload request

**Symptom.** The console shows
`Refused to connect to 'https://api.example.com/telemetry/errors' because it violates the following
Content Security Policy directive: "connect-src 'self'"` or `"default-src 'self'"`. Records stay
`pending`, and the backoff grows.

**Cause.** `connect-src` does not include the endpoint origin. If no `connect-src` directive is
present at all, the fallback is `default-src`, which is usually `'self'` — so a cross-origin endpoint
is blocked even though nothing mentions `connect-src` in the policy.

This is also a **mixed-content** issue when the page is HTTPS and the endpoint is HTTP: the browser
blocks it regardless of CSP. That is the browser enforcing what `requireHttps` would have enforced
for you — set `rest.requireHttps: true` and you will find out at startup instead of at runtime.

The same class of problem applies to the _report_: it ships its own CSP with `default-src 'none'`, so
a report can never make a network request. That is intentional and not configurable — a report should
be inert.

**Diagnosis.**

```js
// What policy is actually in force? Read it from the header or the meta tag.
console.log(document.querySelector('meta[http-equiv="Content-Security-Policy"]')?.content);

// Reproduce it outside the app: a direct fetch shows the same refusal.
await fetch('https://api.example.com/telemetry/errors', { method: 'POST' }).catch(console.error);
```

If `document.querySelector(...)` is `null`, the policy comes from a response header. Check the
document request's response headers in the network tab.

**Fix.** Add the endpoint origin — the origin only, not the full path — to `connect-src`. A complete,
correct policy for the four places logVault touches:

```http
Content-Security-Policy:
  default-src 'self';
  script-src 'self';
  style-src 'self' 'unsafe-inline';
  img-src 'self' data:;
  connect-src 'self' https://api.example.com;
  frame-ancestors 'none';
  base-uri 'none';
  form-action 'none'
```

The change that matters is `connect-src 'self' https://api.example.com`. Everything else is the rest
of a defensible policy, included so the example is copy-pasteable rather than misleading.

Notes:

- **A relative endpoint needs nothing added.** `/telemetry/errors` is same-origin, which `'self'`
  already covers. This is the simplest fix if you control the deployment.
- **Add every origin you use**, including a staging host if the same build targets both:
  `connect-src 'self' https://api.example.com https://api.staging.example.com`.
- **A wrong path in `connect-src` still works.** CSP matches origins, not paths. `https://api.example.com/telemetry`
  and `https://api.example.com` are equivalent here.
- **`report-uri` / `report-to` is not needed.** logVault reads `securitypolicyviolation` events
  directly from the page, so enabling `errors.captureCsp: true` gives you the violations without a
  reporting endpoint:

  ```ts
  initTelemetry({ appName: 'checkout', errors: { captureCsp: true } });
  ```

  Be careful not to create a loop: a policy that blocks your uploads will now also generate a CSP
  violation record for each attempt. Those records are local, so it is a bounded, self-inflicted
  noise source rather than a storm — but fix the policy.

- **`'unsafe-inline'` in `script-src` on your application is not required by logVault.** The library
  injects no inline script into your page. Only the _exported report_ uses an inline viewer script,
  and it carries its own policy.

---

### Records are stuck in `failed`

**Symptom.** `syncStatus` is `'error'`. Records never upload again. `getTelemetryStatus().pending`
stays flat while `repository.errors.getFailed()` keeps growing. The server sees no retries.

**Cause.** The endpoint returned a status in `TERMINAL_STATUSES`:

```ts
new Set([400, 401, 403, 404, 405, 410, 413, 415, 422]);
```

Those are statuses that will never succeed on retry, so the batch is marked `failed` rather than
`pending`, and `failed` rows are **excluded from automatic retries** by design. The most common
offenders are `401` (an expired token) and `413` (a batch larger than the server allows).

**Diagnosis.**

```js
const { getState, getTelemetryStatus } = await import('@codewithrajat/rm-logvault');

const state = getState();
const failedErrors = await state.repository.errors.getFailed();
const failedLogs = await state.repository.logs.getFailed();

console.log('status:', getTelemetryStatus());
console.log('failed errors:', failedErrors.ok ? failedErrors.value.length : failedErrors.reason);
console.log('sample:', failedErrors.ok ? failedErrors.value.slice(0, 3) : undefined);
```

Each failed record carries `uploadAttempts` and `claimedAt`, so you can see when it was last tried. To
see _why_, capture the status the server returned by wiring `onTerminalFailure`:

```ts
initTelemetry({
  appName: 'checkout',
  rest: {
    errorsUrl: '/telemetry/errors',
    onTerminalFailure: (status, records) => {
      console.warn(`[rm-logvault] terminal ${status} for ${records.length} records`, records);
    },
  },
});
```

That callback is the only place the terminal status is surfaced. Without it, a `401` is silent by
design — the library will not spam a console that nobody is reading.

**Fix.** Fix the cause, then requeue. `retryFailedTelemetry()` moves every `failed` row back to
`pending`, clears the failure counter and the `Retry-After` hint, and schedules a run immediately:

```ts
import { retryFailedTelemetry, syncTelemetry } from '@codewithrajat/rm-logvault';

await refreshSession(); // fix the cause first
const requeued = await retryFailedTelemetry();
const result = await syncTelemetry();
console.log(`requeued ${requeued}`, result);
```

Cause-by-cause:

| Status                | Cause                                                | Fix                                                                                                                                                |
|-----------------------|------------------------------------------------------|----------------------------------------------------------------------------------------------------------------------------------------------------|
| `401`                 | Expired or missing token                             | Refresh, then `retryFailedTelemetry()`. Wire `onTerminalFailure` to do this automatically.                                                         |
| `403`                 | The endpoint rejects this app or origin              | Check the server's authorisation rules for the `appName`.                                                                                          |
| `400` / `422`         | The batch is malformed or fails validation           | Compare against the [JSON Schema](REST-CONTRACT.md#2-json-schema-draft-2020-12). A server that validates strictly will reject an unexpected field. |
| `413`                 | The batch is too large                               | Lower `rest.batchSize` (try 10) and/or `errors.maxPayloadBytes`.                                                                                   |
| `415`                 | The server does not accept `application/json`        | Fix the route.                                                                                                                                     |
| `404` / `405` / `410` | The URL is wrong or the route does not accept `POST` | Check `resolveEndpoints(resolveOptions(options))`.                                                                                                 |
| `Vary` on a proxy     | A gateway rewriting the response                     | Check with `curl` from the same network.                                                                                                           |

A one-off `401` at page load is normal and expected: the session may not be established when the
first flush runs, which is 5 seconds after initialization (`FIRST_FLUSH_DELAY_MS`). Automatic
re-authentication is the fix:

```ts
initTelemetry({
  appName: 'checkout',
  rest: {
    errorsUrl: '/telemetry/errors',
    logsUrl: '/telemetry/logs',
    onTerminalFailure: async (status) => {
      if (status !== 401 && status !== 403) return;
      try {
        await refreshSession();
        await retryFailedTelemetry();
      } catch (error) {
        console.warn('[rm-logvault] re-auth failed; records stay failed', error);
      }
    },
  },
});
```

Note that `retryFailedTelemetry()` returns the number of rows moved. A `0` means there was nothing
failed — check that `getFailed()` agrees before assuming the retry worked.

---

### The report is empty

**Symptom.** `exportDiagnosticsReport()` returns `true` and a file downloads, but it contains zero
errors and zero logs. Or it returns `false` and nothing downloads at all.

**Cause.** These are two different failures.

**A. It returns `false`.** One of the four early exits:

1. `isBrowser()` is `false` — SSR, a worker, or an exotic host.
2. `getState().repository` is `null` — `initTelemetry` was never called, was called with
   `enabled: false`, or was destroyed.
3. `isExportInFlight()` was already `true` — a concurrent export.
4. Anything thrown during the run (reported as `diagnostics-export`).

**B. It returns `true` with an empty report.** The file downloaded, so the plumbing works; there is
simply nothing stored. Causes:

1. **Storage is unavailable**, so every write failed. Records are captured and logged to the console
   but never persisted. Check `getTelemetryStatus().storage`.
2. **`logs.level` is `'warn'`** (the default) and everything you logged was below it. See
   [Logs are missing at info level](#logs-are-missing-at-info-level).
3. **The flush raced the read.** The export flushes first, but the serial queue drains asynchronously;
   a record captured microseconds before the export is usually included, not always.
4. **The rate limiter dropped everything.** `maxEventsPerMinute` (default 120) was exhausted by a
   storm.
5. **`consent()` returned `false`**, so nothing was ever stored.
6. **`beforeCapture` / `beforeStore` returned `null`** for every record.
7. **The databases belong to a different origin or a different `dbPrefix`.** Records written under
   `@codewithrajat/rm-logvault-*` are invisible to an installation using `kiosk-blackbox-*`.

**Diagnosis.**

```js
const { getState, getTelemetryStatus, flushTelemetry } = await import('@codewithrajat/rm-logvault');

console.log('status:', getTelemetryStatus());

const state = getState();
console.log('repository present:', state.repository !== null);

await flushTelemetry(); // make sure the queue is drained before reading

const errors = await state.repository?.errors.getAll();
const logs = await state.repository?.logs.getAll();

console.log('errors:', errors?.ok ? errors.value.length : errors);
console.log('logs:', logs?.ok ? logs.value.length : logs);
console.log('first error:', errors?.ok ? errors.value[0] : undefined);
```

Reading `getAll()` directly bypasses the export entirely and distinguishes "nothing is stored" from
"the export is broken". If `getAll()` returns rows and the report is empty, the bug is in the export;
if `getAll()` is empty, it is capture or storage.

Also confirm you are looking at the right database in DevTools → Application → IndexedDB. Both
`rm-logvault-errors` and `rm-logvault-logs` should be present once `initTelemetry` has run successfully.

**Fix.**

```ts
import { flushTelemetry, getTelemetryStatus, exportDiagnosticsReport } from '@codewithrajat/rm-logvault';

// 1. Guarantee the writes have landed.
await flushTelemetry();

// 2. Confirm there is something to export.
const status = getTelemetryStatus();
if (status.storage === 'unavailable') {
  console.warn('nothing is persisted in this environment');
}

// 3. Export.
const ok = await exportDiagnosticsReport({ format: 'json' });
console.log('exported:', ok, 'errors:', status.pending.errors, 'logs:', status.pending.logs);
```

If nothing is reaching storage, work backwards through the gates in this order, checking each one:

1. `enabled` — `getState().options?.enabled`
2. `errors.enabled` / `logs.enabled`
3. `consent()` — does it return the literal `true`?
4. `getTelemetryStatus().storage` — is it `'ready'`? (`'initializing'` only means the readiness
   promise has not settled; `await flushTelemetry()` first.)
5. `droppedByRateLimit` — is the limiter the culprit?
6. `beforeCapture` / `beforeStore` — do they return `null`?
7. `logs.level` — is the entry above the threshold?

For the console capture case specifically, note that `logs.captureConsole` wraps only
`console.warn` and `console.error`. `console.log` and `console.info` are _not_ captured, even with
the option enabled.

---

### Errors are missing while logs are stored

**Symptom.** Records from `logger.info(...)` or `logger.warn(...)` are sitting in
`rm-logvault-logs`, but an error you actually threw — or a `console.error(...)` — is nowhere to be
found. `rm-logvault-errors` is empty, and the console shows no `[Telemetry]` line.

**Cause.** Four different things. Only the last is a defect.

**A. You are looking in the wrong database.** Errors and logs are two separate IndexedDB databases,
both derived from `dbPrefix` (default `'rm-logvault'`).

| What happened                                                 | Database → store                | Recorded as                 |
|---------------------------------------------------------------|---------------------------------|-----------------------------|
| `throw` in an Angular handler, lifecycle hook or subscription | `rm-logvault-errors` → `errors` | `source: 'angular'`         |
| `throw` during a React render                                 | `rm-logvault-errors` → `errors` | `source: 'react'`           |
| `throw` in a Vue handler or lifecycle hook                    | `rm-logvault-errors` → `errors` | `source: 'vue'`             |
| `logger.warn(...)` / `logger.error(...)`                      | `rm-logvault-logs` → `logs`     | `level: 'warn'` / `'error'` |
| `captureError(err, …)`                                        | `rm-logvault-errors` → `errors` | `source: 'manual'`          |
| `withErrorCapture(fn)`                                        | `rm-logvault-errors` → `errors` | `source: 'event-handler'`   |

A `throw` is **not** a log line and never appears in the logs store. Open
**Application → IndexedDB → `rm-logvault-errors`**.

The destination is chosen by the API you called, **not by the level**. `logger.error(...)` is a
`LogRecord` with `level: 'error'`, so it goes to the logs store and never to the errors store: if you
logged with `logger.error` and then opened `rm-logvault-errors`, it is empty and nothing is wrong.
Only `captureError(...)` and the handler/adapter routes produce `ErrorRecord`s. The two kinds are not
interchangeable — an `ErrorRecord` has a fingerprint, severity and occurrence count that aggregate
across repeats, while a `LogRecord` is one appended row per call.

**B. The `logger.info` you wrote just before the `throw` was filtered on its own.** The persist
threshold `logs.level` defaults to `'warn'`, so that statement is dropped at the sink — see
[Logs are missing at info level](#logs-are-missing-at-info-level). This is worth stating plainly
because the two statements look related and are not: the `throw` does not suppress, replace or
truncate the call before it, and the call before it does not appear on the error record. There is no
breadcrumb buffer. Records are independent, so a missing `info` and a missing error usually have two
unrelated causes.

If you wanted the context to travel *with* the error, pass it explicitly — that is the supported
mechanism:

```ts
captureError(error, {
  source: 'manual',
  tags: { phase: 'checkout' },
  extra: { orderId, step: 'payment' },
});
```

**C. `console.error(...)` is not captured by default.** `logs.captureConsole` is `false`, so the
browser's own method runs and nothing more. Setting it to `true` wraps `console.warn` and
`console.error` only — `console.log` and `console.info` are never captured.

**Values are never the reason.** A missing property, a function, a cycle, a hostile getter or an
oversized object is degraded **in place** and the record is still written — `undefined` becomes
`null`, a function becomes `'[Function]'`. Naming a property that does not exist on `window` cannot
make a record disappear:

```ts
logger.warn('[checkout] missing key', { orderId: window.rajat, nested: { a: [undefined, () => {}] } });
// stored, with data: [{ orderId: null, nested: { a: [null, '[Function]'] } }]
```

So a record that is missing is never explained by the values you passed. The exhaustive list of what
*does* gate a write — a disabled store, `consent()`, the persist level, the rate limiter,
`beforeStore`/`beforeCapture` returning `null`, and the payload budget — is under
[sanitizeValue](API.md#sanitizevalue).

Values are never the reason a record *appears*, either. `undefined` is a value, not a failure, so no
global handler fires for it and nothing is captured automatically — `window.onerror` and
`unhandledrejection` only see uncaught `throw`s and rejected promises. If an absent property is itself
the bug you want in the errors store, say so explicitly:

```ts
if (window.rajat === undefined) {
  captureError(new Error('[checkout] window.rajat is missing'), {
    source: 'manual',
    tags: { phase: 'checkout' },
    extra: { missing: 'rajat' },
  });
}
```

**D. On 1.0.0 only, the adapter bundles were broken.** Each adapter entry inlined its own copy of the
error pipeline, and that copy's tracker could never be installed, so everything routed through
`provideTelemetryErrorHandler()`, `reactRootErrorHandlers()` or the Vue plugin was buffered into an
array nothing drained. It reported nothing, because no operation failed. Fixed in 1.0.1:

- `captureError`, `withErrorCapture`, `logger` and `flushTelemetry` were always imported from the
  **root** entry (`@codewithrajat/rm-logvault`) and always worked.
- Only the subpath entry (`@codewithrajat/rm-logvault/angular`) was affected.

A plain `addEventListener` outside Angular is a different case that is *not* a defect in any version:
Angular's `ErrorHandler` never sees it. Wrap it:

```ts
import { withErrorCapture } from '@codewithrajat/rm-logvault';

button.addEventListener(
  'click',
  withErrorCapture(async () => {
    await submitOrder();
  }),
);
```

**Diagnosis.** Compare the two counters around a capture, reading them synchronously — `onRecord`
increments the in-memory snapshot the instant the pipeline accepts a record, so the delta tells you
whether the capture reached a live tracker at all:

```js
const { getTelemetryStatus, logger, captureError, withErrorCapture } = await import('@codewithrajat/rm-logvault');

const snapshot = () => ({ ...getTelemetryStatus().pending });

const a = snapshot();
logger.warn('[probe] warn');                    // must increment logs
try {
  withErrorCapture(() => { throw new Error('[probe] throw'); });
} catch {
  // expected: withErrorCapture captures and then re-throws the same value
}
captureError(new Error('[probe] direct'), { source: 'manual' });
const b = snapshot();

console.table({ a, b });
```

- `b.logs === a.logs + 1` → the log reached the sink. If it is still absent from the store, the write
  is the problem, not the capture — check `getTelemetryStatus().storage`.
- `b.errors === a.errors + 2` → the pipeline is live and both error paths work.
- `b.errors === a.errors + 2` **plus** a `[Telemetry] error-persist failed: …` line → the tracker
  accepted both records and the **write** was refused. Note that `getTelemetryStatus().storage` still
  reads `'ready'` in this case, because the database opened successfully — the `error-persist` line is
  the only signal that anything went wrong. `quota` means the origin is out of space;
  `serialization` means a value could not be structured-cloned.
- `b.errors === a.errors` → the capture never reached a tracker. On 1.0.0 that is the defect in **D**;
  otherwise the import is resolving to a second copy of the library, and
  `captureError` is buffering into a `preInitErrors` array that this page load never replays.

If those counters are inconclusive, test the store directly. This bypasses the capture pipeline
entirely, so it answers the narrower question — *can anything be written to `errors` at all?*

```js
const { getState, captureError, flushTelemetry } = await import('@codewithrajat/rm-logvault');

const repo = getState().repository;
console.log('errors.initialize():', await repo.errors.initialize()); // { ok: true } or { ok: false, reason }
console.log('errors.count() before:', await repo.errors.count());

captureError(new Error('[probe] direct'), { source: 'manual' });
await flushTelemetry();

console.log('errors.count() after:', await repo.errors.count());
```

- **`initialize()` is not `ok`** → the errors database cannot be opened, and that is the whole problem.
  `'unavailable'` means IndexedDB is missing or blocked for this origin; `'transaction'` usually means a
  **blocked upgrade** — another tab is holding `rm-logvault-errors` open. Close the other tabs, delete
  that database in DevTools → Application → IndexedDB, and reload. The logs database is a separate
  database, so it can keep working throughout, which is exactly the confusing case.
- **`count()` unchanged while the counters above moved** → the tracker accepted the record and the write
  failed. On 1.0.1 and later a `[Telemetry] error-persist failed: …` line says why.
- **`count()` incremented** → the record **is** stored, and you are reading a stale panel, the wrong
  origin, or a different `dbPrefix`.

Error records are **not batched**. `captureError` queues its write immediately; logs are written only
when 50 accumulate or after `logs.writeFlushMs` (1000 ms). `await flushTelemetry()` is still the
deterministic way to know the queue has drained.

**Fix.**

1. Confirm which database you are reading, and re-check it after `await flushTelemetry()` — the
   DevTools IndexedDB panel does **not** live-refresh, so collapse and re-expand the store rather than
   trusting what is already on screen.
2. Raise `logs.level` to `'info'` if you want the preceding call stored too.
3. Set `logs.captureConsole: true` if you want existing `console.error` calls captured.
4. On 1.0.0, upgrade — or keep Angular's `ErrorHandler` chained to the root entry in the meantime:

```ts
import { ErrorHandler } from '@angular/core';
import { captureError } from '@codewithrajat/rm-logvault'; // root entry: this copy is wired up

export class LiveErrorHandler implements ErrorHandler {
  public handleError(error: unknown): void {
    try {
      captureError(error, { source: 'angular', tags: { shell: 'checkout' } });
    } catch {
      // reporting must never break the framework's own handling
    }
    try {
      console.error(error);
    } catch {
      // a hostile console is not our problem
    }
  }
}
```

```ts
providers: [
  provideBrowserGlobalErrorListeners(),
  provideRouter(routes),
  { provide: ErrorHandler, useFactory: () => new LiveErrorHandler() },
]
```

Writing your own handler is a supported pattern beyond this workaround — for per-error context, your own
chaining, or an injected service. The reference version, including what you take on by doing it, is
[Writing your own `ErrorHandler`](API.md#writing-your-own-errorhandler).

---

### Logs are missing at info level

**Symptom.** `logger.info('...')` calls appear in the console but never in the diagnostics report.
`logger.warn` and `logger.error` calls are present.

**Cause.** `logs.level` defaults to `'warn'`, and it is the **persist** level — the minimum level
written to IndexedDB. `info` and below are below the default threshold.

The confusion is understandable, because there are two independent levels and they have the same
default value:

| Setting                | Controls              | Default  |
|------------------------|-----------------------|----------|
| `logs.level` (option)  | What is **persisted** | `'warn'` |
| `logger.setLevel(...)` | What is **printed**   | `'warn'` |

Sinks run **before** the console filter, so lowering the console level does not change what is stored,
and raising it does not either. `logger.setLevel('off')` silences the console while persistence
continues — which is the intended production behaviour, not a bug.

**Diagnosis.**

```js
const { logger, getState } = await import('@codewithrajat/rm-logvault');

console.log('console level:', logger.getConfig());
console.log('persist level:', getState().options?.logs.level);
console.log('logs enabled:', getState().options?.logs.enabled);
```

If `persist level` is `'warn'` and you are calling `logger.info`, that is the whole answer. Also check
`logs.enabled`: `false` removes the tracker sink entirely, so _nothing_ is persisted regardless of
level.

**Fix.**

```ts
import { initTelemetry } from '@codewithrajat/rm-logvault';

initTelemetry({
  appName: 'checkout',
  logs: {
    level: 'info', // persist info and above
    maxRecords: 5000, // raise the cap too — more levels means more rows
    maxLogsPerMinute: 1200, // and raise the rate limit
  },
});
```

Three things to know before lowering the threshold:

1. **A level string is validated and lowercased.** `'info'`, `'INFO'` and `' info '` all work.
   `'verbose'`, `'log'` and `'warning'` are **ignored**, silently, and the previous level is kept. This
   is deliberate: a typo must never be able to turn on verbose persistence. If `getState().options?.logs.level`
   still reads `'warn'` after you set `'verbose'`, that is why.
2. **`'off'`, `'none'` and `'silent'` all normalise to `'off'`**, which disables persistence entirely
   while leaving the console level untouched. That is a useful way to stop log egress without
   silencing your own debugging.
3. **More logs means more storage.** `maxRecords` default is 2000 and `retentionDays` is 3. Lowering
   the persist level to `'info'` or `'debug'` in a busy application can fill that in minutes, after
   which cleanup starts deleting — possibly deleting the error-adjacent context you wanted. Raise the
   cap deliberately, and consider raising `maxLogsPerMinute` alongside it.

If you want the levels separated intentionally — verbose to the console during development, `warn` to
storage in every environment — that is exactly what the two settings are for:

```ts
initTelemetry({ appName: 'checkout', logs: { level: 'warn' } });

if (import.meta.env.DEV) {
  logger.setLevel('trace'); // console only; storage stays at 'warn'
}
```

---

### Duplicate records appear

**Symptom.** The report contains two or more records with the same `fingerprint` and the same
message. Or the server receives the same `id` more than once. Or `occurrenceCount` looks lower than
the number of times the bug happened.

**Cause.** Three different things, and they need different answers.

**A. Same `fingerprint`, different `id`.** This is correct and expected. Error aggregation merges into
a row only while that row is `pending`. An occurrence that arrives while the row is `uploading` (it is
being sent right now) cannot merge into it — mutating a row that is mid-flight would mean either the
uploaded data disagrees with the stored data, or the server sees a count changing on the wire. So a
new `pending` row is created. The report then legitimately shows two records for one bug, with
different `occurrenceCount` values.

**B. The same `id` twice on the server.** This is at-least-once delivery working as designed. The
client deletes a record only after a 2xx. If the response is lost after the server committed — a
connection reset, a proxy timeout, a tab closing mid-flight — the batch returns to `pending` and is
sent again. The server is required to be idempotent on `id`.

**C. Two `initTelemetry` installations.** Not possible within one realm: `initTelemetry` is strictly
idempotent and the shared state lives on `globalThis[Symbol.for('logvault@1')]`, so duplicate bundled
copies merge into one. It _is_ possible across realms — two iframes, a worker, or two tabs — each of
which has its own `globalThis` and its own installation writing to the same databases.

**Diagnosis.**

```js
const { getState } = await import('@codewithrajat/rm-logvault');

const errors = await getState().repository.errors.getAll();
if (errors.ok) {
  const byFingerprint = new Map();
  for (const record of errors.value) {
    const list = byFingerprint.get(record.fingerprint) ?? [];
    list.push({
      id: record.id,
      status: record.uploadStatus,
      count: record.occurrenceCount,
      lastSeen: record.lastSeen,
    });
    byFingerprint.set(record.fingerprint, list);
  }
  for (const [fingerprint, rows] of byFingerprint) {
    if (rows.length > 1) console.log(fingerprint, rows);
  }
}
```

The `status` column is the discriminator:

- Both rows `pending` → aggregation should have merged them. Look for a race: two captures in the
  same synchronous block are queued and merged in order, so this is more likely a `WeakSet` miss on
  two distinct `Error` objects with the same message — which should still merge by fingerprint. Check
  that `fingerprint` is genuinely equal rather than merely similar.
- One `pending`, one `uploading`/`uploaded`/`failed` → case A. Expected.
- The same `id` appearing twice → impossible locally (the key path is `id`), so you are reading two
  realms. Check the tab and iframe count.

**Fix.**

- **Case A: nothing to fix.** It is correct behaviour, documented in
  [D-010](DECISIONS.md#d-010--errorrepositorysave-performs-pending-only-aggregation). If the report
  reads better with one row per fingerprint, group by `fingerprint` when you render it — the
  diagnostics viewer deliberately shows raw records and lets you search.
- **Case B: make the server idempotent on `id`.** The `id` is stable across retries and is never
  regenerated, which is what makes it usable as the key:

  ```sql
  INSERT INTO telemetry_records (id, kind, app_name, environment, payload)
  VALUES ($1, $2, $3, $4, $5)
  ON CONFLICT (id) DO NOTHING;
  ```

  Do **not** key on `fingerprint`. Different records legitimately share one.

  If you want to reduce duplicate sends in the first place, lower `rest.batchSize` (a smaller batch
  is less likely to be in flight when the tab closes) and make sure the server responds fast — the
  per-request abort budget is 10 seconds, and a slow response is the most common cause of a lost
  acknowledgement.

- **Case C: nothing to fix, but be aware.** Two tabs writing to the same databases is by design.
  Claiming is atomic, so no record is uploaded twice from two tabs, but the _report_ from tab A does
  not include tab B's unsent records. `pageLoadId` distinguishes them.
- **If the duplicates are self-inflicted, stop double-capturing.** A common accidental pattern is to
  capture in a `catch` block _and_ let the error propagate to `window.onerror`. The identity
  `WeakSet` handles the same `Error` _object_ reaching both paths, but a handler that constructs
  `new Error('...')` on every call produces a distinct object each time — those do not dedupe by
  identity, only by fingerprint aggregation. Capture and swallow, or let it propagate; not both:

  ```ts
  try {
    await submitOrder();
  } catch (error) {
    captureError(error, { tags: { flow: 'checkout' } });
    showErrorToast(); // handled — do not rethrow
  }
  ```

---

### The bundle got bigger than 37 kB

**Symptom.** `pnpm run size` fails:

```text
  core (ESM, min+gzip)
  Package size limit has exceeded by 1.4 kB
  Size limit:   37 kB
  Size:         37.4 kB
  With all deps: 37.4 kB
```

Or your own bundle grows unexpectedly after adding logVault.

**Cause.**

1. **A source change added weight to the core.** The budget is enforced on `dist/index.js`, minified
   and gzipped. It is a real, hard limit.
2. **An adapter was imported from the main entry instead of a subpath.** `import { attachAxios } from '@codewithrajat/rm-logvault'`
   does not work — the adapter is only at `@codewithrajat/rm-logvault/axios` — but a deep import or a re-export through
   your own barrel file can pull one in.
3. **`@codewithrajat/rm-logvault/testing` shipped to production.** `createMemoryRepository` and `createFakeTransport`
   are real code and they carry the whole repository interface with them.
4. **A consumer lost tree-shaking.** `package.json` declares `"sideEffects": false`, so a bundler
   should shake the unused exports. If your build marks the package as having side effects (a
   misconfigured `optimization.sideEffects`, a CJS interop shim, or a `require` path), you get the
   whole entry point.
5. **The CJS build was bundled instead of the ESM one.** `dist/index.cjs` is the same source, but CJS
   cannot tree-shake at all, so a `require('@codewithrajat/rm-logvault')` consumer gets every export.

**Diagnosis.**

```bash
# 1. What does the package itself cost?
pnpm run size

# 2. What is actually in the core entry, and how big is each part?
pnpm exec tsup --metafile
# or, if you use a bundle analyser:
pnpm dlx source-map-explorer dist/index.js

# 3. Which modules did your build pull in?
#    Webpack:
pnpm exec webpack --profile --json > stats.json   # then inspect the @codewithrajat/rm-logvault modules
#    Vite:
pnpm exec vite build --mode production             # then open the visualiser
pnpm exec vite-bundle-visualizer

# 4. Is the ESM entry being used at all?
node -e "console.log(require.resolve('@codewithrajat/rm-logvault'))"
# In a bundler, check that 'module'/'exports.import' resolved, not 'main'.
```

To isolate your own code from the library's budget, measure the marginal cost:

```bash
# Before
pnpm run size
# Add only the core import to a scratch entry, rebuild, measure again.
```

**Fix.**

**If you are a consumer and your bundle grew:**

```diff
- import { initTelemetry, attachAxios } from '@codewithrajat/rm-logvault';   // attachAxios is not exported here anyway
+ import { initTelemetry } from '@codewithrajat/rm-logvault';
+ import { attachAxios } from '@codewithrajat/rm-logvault/axios';
```

Go through this checklist:

| Change                                                                                                                     | Saves                                                                                           |
|----------------------------------------------------------------------------------------------------------------------------|-------------------------------------------------------------------------------------------------|
| Import adapters from subpaths (`@codewithrajat/rm-logvault/react`, `/vue`, `/angular`, `/axios`, `/fetch`, `/react-query`) | Each adapter is a separate entry point; none is in the core.                                    |
| Keep `@codewithrajat/rm-logvault/testing` out of production code                                                           | The in-memory repository and fake transport are test-only.                                      |
| Import named exports, not the namespace                                                                                    | `import * as logvault from '@codewithrajat/rm-logvault'` defeats tree-shaking in some bundlers. |
| Ensure your bundler resolves `exports.import`                                                                              | `"sideEffects": false` and ESM are both required for shaking.                                   |
| Prefer ESM over `require`                                                                                                  | The CJS entry cannot tree-shake.                                                                |
| Skip the diagnostics export if you do not use it                                                                           | Do not `import { renderDiagnosticsReport }` in app code.                                        |

**If you are contributing and the budget genuinely needs to grow:** that is a decision, not a tweak.
It needs an ADR entry in [DECISIONS.md](DECISIONS.md) and a measurement (`pnpm run size` before and
after, plus a bundle-analysis breakdown of which module grew). [D-013](DECISIONS.md#d-013--the-bundle-budget-is-30-kb-mingzip-not-12-kb)
records why the budget was set at 30 kB and which alternatives were rejected,
[D-018](DECISIONS.md#d-018--the-report-drill-down-and-a-measured-raise-to-32-kb) records the second
measured raise, to 32 kB, with the before and after numbers, and
[D-029](DECISIONS.md#d-029--the-bundle-budget-moves-to-37-kb-for-the-framework-agnostic-layer) records
the third, to 37 kB at a measured 36.55 kB, including the two pieces that were moved behind subpaths
first. The budget exists so that "we added a dependency" cannot happen silently, and raising it
should be a deliberate, reviewed act. The preferred response is almost always to move the code behind
a subpath — which is exactly how every adapter is structured.

Three practical notes:

- **`size-limit` measures min+gzip**, and the core is built **unminified** (`minify: false` in
  `tsup.config.ts`) because consumers minify. The measured 36.55 kB is therefore realistic for a
  production build, not an artefact of measuring raw source.
- **The number is not a marketing claim, it is a CI gate.** `pnpm run verify` runs `size` last, and CI
  runs it in the build job, so an over-budget change fails the build rather than shipping.
- **Framework peers are `external`**, so an adapter never bundles React, Vue, Angular or axios. If
  one of those appears in your logVault-related bundle growth, check your bundler's `external`
  configuration rather than the library's.

---

### Errors before `initTelemetry` are missing

**Symptom.** A fatal error thrown during module evaluation — before the application could call
`initTelemetry` — never appears in the diagnostics report. Or it appears with the wrong `appName`, or
without a `page.url`.

**Cause.** The pre-init path is a bounded buffer, and there are four ways an error does not survive it:

1. **The buffer overflowed.** `PRE_INIT_ERROR_BUFFER_SIZE` is **50** for errors (and 50 for log calls,
   a separate `PRE_INIT_LOG_BUFFER_SIZE`). Once full, **newer** errors are dropped; older entries are
   kept. A module-evaluation storm of more than 50 failures loses the tail.
2. **`initTelemetry({ enabled: false })` was called.** `setCaptureSuppressed(true)` is set immediately,
   so `captureError` returns before touching the buffer _and_ `clearPreInitErrors()` is not the
   mechanism — anything buffered before the disabled init is never replayed.
3. **`destroyTelemetry()` was called** before the harness read the data. It calls
   `clearPreInitErrors()`.
4. **Nothing was buffered because the error never reached `captureError`.** An error thrown during
   module evaluation is only reported at all if a _global_ handler is already installed — which is
   the chicken-and-egg problem the pre-init buffer exists to mitigate. The exception is an error
   thrown inside a `try`/`catch` that calls `captureError` explicitly, or an unhandled rejection
   that fires after `window` exists. A syntax error in a module, or a top-level `throw` in a script
   that runs before any listener exists, is simply not observable.

**Diagnosis.**

```js
// Before initTelemetry, in the console or in a <script> that runs first:
const { captureError, getState } = await import('@codewithrajat/rm-logvault');
console.log('initialized:', getState().initialized); // false
// The pre-init counter is internal; observe the replay indirectly:
```

The cleanest observation is the difference between the buffered count and the stored count, which
requires an internal function that is deliberately not exported. Use `logger` instead — the log
buffer is observable through the same replay:

```js
// Any logger call before init is buffered (up to 50).
logger.warn('[Boot] module evaluation started');
// …after init, this line reappears in the report, attributed to the real appName.
```

To prove the error path works at all, capture explicitly and check that it lands:

```js
import { captureError, flushTelemetry, getState } from '@codewithrajat/rm-logvault';

// Deliberately *before* initTelemetry:
captureError(new Error('boot failure'), { tags: { phase: 'boot' } });

// …then initialise and let the replay happen:
initTelemetry({ appName: 'checkout' });
await flushTelemetry();

const stored = await getState().repository.errors.getAll();
console.log(stored.ok ? stored.value.map((r) => r.message) : stored.reason);
```

**What the buffer actually preserves.** `captureError` before init normalises the error _immediately_
and stores only bounded, sanitized data — `normalizeError(error)` plus the caller's `ctx` and a
timestamp. It never keeps a live reference to the caller's object graph. That is why a pre-init error
ends up with:

- full `message`, `stack`, `thrownType` and `causes`,
- **no `appName`, `appVersion`, `buildId` or `environment`** at capture time,
- **no `page.url` or `route`** in some cases, depending on when the throw happened relative to
  `location` being available.

At replay — after `initTelemetry` installs the tracker — the record is built with the _current_
configuration and the _current_ page and environment blocks. So the app metadata is correct in the
end; the only fields that reflect capture time are `timestamp` and the normalised error itself.

**Fix.**

- **If you are losing boot errors to the cap:** raise the practical bound by reducing what throws. The
  cap is a constant, not an option, precisely because 50 unhandled module-evaluation failures is
  already a broken application — the goal is to see the _first_ one, not all of them.

- **If you need application metadata on the earliest possible error:** install a minimal
  `initTelemetry` as the very first statement of your entry module, then reconfigure once the
  application is ready. Reconfiguration requires a teardown, so the sequence is:

  ```ts
  // src/main.ts — first statements
  import { initTelemetry, destroyTelemetry, flushTelemetry } from '@codewithrajat/rm-logvault';

  initTelemetry({ appName: 'checkout', appVersion: 'unknown', shortcut: false });

  // …after config resolution, before rendering:
  export async function configureTelemetry(resolved: {
    appVersion: string;
    buildId: string;
    environment: string;
  }) {
    await flushTelemetry();
    destroyTelemetry();
    initTelemetry({
      appName: 'checkout',
      appVersion: resolved.appVersion,
      buildId: resolved.buildId,
      environment: resolved.environment,
      rest: { errorsUrl: '/telemetry/errors' },
    });
  }
  ```

  The `flushTelemetry()` before `destroyTelemetry()` matters: destroy defers its own flush, and the
  records captured in the first installation must land before the second one opens the databases.

- **If you want a top-level throw to be visible at all:** wrap your entry point.

  ```ts
  import { captureError, initTelemetry } from '@codewithrajat/rm-logvault';

  initTelemetry({ appName: 'checkout' });

  try {
    startApplication();
  } catch (error) {
    captureError(error, { source: 'manual', severity: 'fatal', tags: { phase: 'boot' } });
    renderFatalErrorScreen(error);
  }
  ```

  `initTelemetry` first, then the `try`, is the ordering that matters: it means the capture goes
  straight into the tracker with full metadata rather than into the buffer.

- **If a pre-init error is missing entirely and none of the above applies:** it never reached
  `captureError`. Check that the throw is inside a `try`/`catch` that reports it, or that it is an
  uncaught error thrown _after_ the global handlers were installed. Browser-level errors thrown
  during script parsing or during the evaluation of a module that fails to load are not observable by
  any in-page library — the only signal is a resource-load failure, which is what
  `errors.captureResources` is for:

  ```ts
  initTelemetry({ appName: 'checkout', errors: { captureResources: true } });
  ```

---

## Still stuck?

Three things that resolve most remaining questions:

**Read the resolved configuration, not your input.**

```js
const { getState } = await import('@codewithrajat/rm-logvault');
console.log(JSON.stringify(getState().options, null, 2));
```

Every default, every derived value (`rest.enabled`, `redacted.allowedQueryParams`), and every ignored
invalid value is visible here. If something you passed is not present, `resolveOptions` discarded it —
see [CONFIGURATION.md](CONFIGURATION.md#9-invalid-value-rules).

**Turn on every internal error.**

```ts
initTelemetry({
  appName: 'checkout',
  onInternalError: (stage, error) => console.error(`[rm-logvault] ${stage}`, error),
});
```

A stage that never appears is a stage that never failed. A stage that appears once with an
unfamiliar reason is usually the answer.

**Read the source.** Every public function's JSDoc states its contract, its failure behaviour and at
least one worked example, and the modules that matter most have long `@remarks` blocks explaining
_why_, not just _what_. Start at `src/index.ts` for the exported surface, then
`src/core/config.ts` and `src/core/init.ts`.

If the answer is not here or in [API.md](API.md), open an issue with the output of the three
diagnostics above — the resolved configuration, the `onInternalError` stages, and
`getTelemetryStatus()`.
