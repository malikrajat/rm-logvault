# Privacy and GDPR

What logVault stores, on what basis you may store it, how long it lives, how a consent decision is
evaluated, and how to satisfy an access or erasure request.

This is engineering documentation, not legal advice. It describes precisely what the software does so
that a controller or DPO can map it onto their own obligations.

> **Source note.** The `consent` option's JSDoc says it is "evaluated before every capture, persist
> and upload", and the implementation matches: `createErrorTracker.ingest` checks it before an error
> is stored, `LogTracker.sink.write` before a log is stored, and `SyncManager.runFlush` before any
> network egress. Section [4](#4-the-consent-gate) lists the exact points.

> **No egress by default.** `TelemetryOptions.mode` defaults to `'local'`, which means the library
> issues **no network requests whatsoever** — a configured endpoint is ignored, not merely unused.
> `SyncManager` computes `enabled = mode === 'remote' && rest.enabled && (endpoint present)`, so in
> local mode the uploader object is constructed but can never send. The only way data leaves the
> device is an explicit `rest.errorsUrl`, `rest.logsUrl` or `rest.transport`, which infers
> `'remote'`. See [D-015](DECISIONS.md).

---

## 1. Lawful basis

The library is a data-processing component, not a legal basis. Which basis applies depends on what
you capture, why, and who decided. The three realistic patterns:

### 1.1 Consent — Art. 6(1)(a)

**When to use it.** You capture error and log data for general product improvement, you cannot
articulate a strict operational necessity, or your jurisdiction or policy requires opt-in for
client-side telemetry.

**What it requires of you.** A freely given, specific, informed and unambiguous indication.
Pre-ticked boxes are not consent. Withdrawal must be as easy as giving it — which for this library
means calling `clearTelemetryData()` and having `consent()` return `false` from that moment on.

**How the library supports it.** `TelemetryOptions.consent` is a gate re-evaluated on every capture,
every persist attempt and every flush run. See §4. It is a hook, not a consent manager: it does not
store the decision, does not display a banner, and does not record a timestamp. That is deliberate —
consent UX is application-specific and jurisdiction-specific, and a telemetry library has no business
inventing one.

### 1.2 Legitimate interests — Art. 6(1)(f)

**When to use it.** Strictly operational diagnostics needed to keep the service working and secure:
a fatal error that breaks checkout for some users, a chunk-load failure after a deploy, a CSP
violation that indicates an attempted injection. This is the black-box-recorder use case, and it is
the basis that fits logVault best.

**What it requires of you.** A legitimate interest assessment (LIA), a balancing test against the
data subject's rights and reasonable expectations, and a _minimal_ processing footprint. The
library's defaults are chosen to make that argument defensible: redaction before storage, short
retention, bounded payloads, no uploads until you configure an endpoint, and no behavioural trail by
default (`logs.level` is `'warn'`, not `'debug'`).

**Watch for.** Legitimate interests does not survive a capture configuration that records everything
a user does. If you set `logs.level: 'trace'` and `captureConsole: true`, you are building a
behavioural record, and you should be on consent instead — or you should be able to show why the
detail is necessary.

### 1.3 Contract necessity — Art. 6(1)(b)

**When to use it.** The telemetry is genuinely part of delivering the contracted service: a
support-included B2B product where the diagnostics report _is_ the support mechanism, or a device
whose SLAs depend on remote diagnosis.

**Watch for.** "We use it to improve the product" is not contract necessity. Be honest with yourself
about the difference; a court or a supervisory authority will be.

### 1.4 Mixed bases in one deployment

Realistically, one deployment uses several. The clean pattern is to scope by data category and by
configuration rather than by hope:

| Processing                                                | Basis                         | Configuration                                      |
| --------------------------------------------------------- | ----------------------------- | -------------------------------------------------- |
| Fatal errors, chunk-load failures, CSP violations         | Legitimate interests          | Always on                                          |
| HTTP failures on authenticated endpoints (URLs, statuses) | Legitimate interests          | `rest.errorsUrl` only if you can defend the egress |
| `warn`-level application logs                             | Legitimate interests, minimal | `logs.level: 'warn'` (default)                     |
| `info`/`debug` logs, console capture                      | Consent                       | `logs.level: 'info'`, `captureConsole: true`       |
| Upload to a third-party host                              | Contract or consent           | `rest.*`                                           |

If you cannot cleanly separate the tiers, do not capture the lower tiers.

---

## 2. Data categories stored

Everything below is a persisted field. The "could contain personal data" column is the honest
assessment; the mitigation column names the mechanism that applies, all of which are on by default
unless marked otherwise.

### 2.1 Error records (`ErrorRecord`, store `errors` in `rm-logvault-errors`)

| Field                                                                                   | Example / source                                                     | Could contain personal data                                                                   | Mitigation                                                                                                                                                          |
| --------------------------------------------------------------------------------------- | -------------------------------------------------------------------- | --------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `name`, `message`                                                                       | `TypeError`, `Cannot read properties of undefined (reading 'total')` | Yes — messages routinely interpolate names, e-mails and ids                                   | `sanitizer.text(…, MAX_MESSAGE_LENGTH = 1000)`; JWT, auth-scheme, `key=value`, and e-mail patterns scrubbed; truncated                                              |
| `stack`                                                                                 | `at total (/assets/checkout-8f3c2ab.js:1:48213)`                     | Rarely — but a `?token=` in an inline script URL would leak                                   | `sanitizer.stack(…, 8000)`; cache busters stripped; URL rules applied to embedded URLs                                                                              |
| `causes[].name`, `causes[].message`, `causes[].stack`                                   | Nested `cause` chain                                                 | Same as above                                                                                 | Same sanitizer, `MAX_CAUSE_DEPTH = 3`                                                                                                                               |
| `componentStack`                                                                        | React component tree                                                 | Rarely — component names are code identifiers                                                 | `sanitizer.stack(…, 4000)`                                                                                                                                          |
| `page.url`                                                                              | `/checkout?step=[REDACTED]`                                          | **Yes** — paths contain user ids, e-mails, order numbers                                      | `sanitizer.url`; credentials dropped, fragment dropped, path segments matching e-mail/`eyJ`/long-secret become `[REDACTED]`, non-allow-listed query values redacted |
| `page.route`                                                                            | `/checkout`                                                          | Yes, as above                                                                                 | Derived from the sanitized URL with the origin stripped                                                                                                             |
| `page.pageLoadId`                                                                       | A UUID                                                               | No — random                                                                                   | `newId()`                                                                                                                                                           |
| `environment.userAgent`                                                                 | `Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) …`                  | Weakly — a device/browser fingerprint component                                               | `sanitizer.text(…, 500)`; truncated, not hashed                                                                                                                     |
| `environment.platform`                                                                  | `MacIntel`                                                           | Weakly, as above                                                                              | `sanitizer.text(…, 200)`                                                                                                                                            |
| `environment.viewport`                                                                  | `1512x823`                                                           | Weakly — a fingerprint component in combination                                               | Not redacted; a plain `"WxH"` string                                                                                                                                |
| `environment.visibilityState`, `environment.online`                                     | `visible`, `true`                                                    | No                                                                                            | —                                                                                                                                                                   |
| `environment.appName` / `appVersion` / `buildId` / `environment`                        | Your values                                                          | No, unless you put one there                                                                  | `sanitizer.text(…, 200)`                                                                                                                                            |
| `api.url`                                                                               | `/api/orders?token=[REDACTED]`                                       | **Yes**                                                                                       | `sanitizer.url`; allow-listed query values only                                                                                                                     |
| `api.status`, `api.statusText`, `api.code`, `api.method`, `api.timeout`, `api.duration` | `500`, `GET`                                                         | No                                                                                            | Bounded; `statusText` at 200 characters                                                                                                                             |
| `api.requestId`                                                                         | `4f1c9a2e-…`                                                         | Potentially — a server-side trace id can be joined to server logs that **do** identify a user | Only from four correlation header names; `sanitizer.text(…, 200)`                                                                                                   |
| `event.type`, `targetTag`, `resourceUrl`, `directive`, `blockedURI`, `crossOrigin`      | `securitypolicyviolation`, `script`                                  | Rarely — a blocked URI can be a URL                                                           | `sanitizer.url` / `sanitizer.text`                                                                                                                                  |
| `tags`                                                                                  | `{ flow: 'checkout' }`                                               | **Whatever you put there** — this is the most common accidental PII channel                   | `MAX_TAGS = 20`, key 50, value 200; each passed through `sanitizer.text`. Redaction by key name does **not** apply to tag values you construct                      |
| `extra`                                                                                 | `{ cartId }`                                                         | **Whatever you put there**                                                                    | `sanitizer.value` deep walk: sensitive keys, depth 4, 30 keys, 20 items, 2000 characters                                                                            |
| `location.source`, `location.line`, `location.column`                                   | `/assets/app.js`, `12`, `3`                                          | No                                                                                            | `sanitizer.text(…, 1000)` on `source`                                                                                                                               |
| `timestamp`, `firstSeen`, `lastSeen`, `occurrenceCount`                                 | Numbers                                                              | No                                                                                            | —                                                                                                                                                                   |
| `id`, `fingerprint`, `uploadStatus`, `uploadAttempts`, `claimedAt`, `schemaVersion`     | Machinery                                                            | No                                                                                            | `fingerprint` is computed from **already-sanitized** fields, so a secret can never enter an index key                                                               |

### 2.2 Log records (`LogRecord`, store `logs` in `rm-logvault-logs`)

| Field                                                            | Could contain personal data                                                            | Mitigation                                                                                                                           |
| ---------------------------------------------------------------- | -------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------ |
| `message`                                                        | **Yes** — the single highest-risk field, because it is free text written by developers | `sanitizer.text(…, MAX_LOG_MESSAGE_LENGTH = 1000)` with the full pattern set                                                         |
| `data`                                                           | **Yes**                                                                                | `MAX_LOG_ARGS = 5` arguments, each `sanitizer.value`-walked                                                                          |
| `route`                                                          | Yes                                                                                    | `sanitizer.text(…, 300)`                                                                                                             |
| `level`, `timestamp`, `seq`, `id`, `pageLoadId`                  | No                                                                                     | `pageLoadId` is the correlation key to error records; it is random, and it is the only join the library performs                     |
| `environment.appName` / `appVersion` / `buildId` / `environment` | No                                                                                     | Deliberately narrower than the error environment block — no `userAgent`, no `platform`, no `viewport` — because logs are high-volume |

### 2.3 What is never stored

- Request and response bodies, request parameters, axios `data`.
- Cookies and `document.cookie`.
- `localStorage` / `sessionStorage` contents.
- Auth header values. Only four correlation header names are ever probed.
- Form values. The only DOM element the library inspects at all is the shortcut's event target, and
  only to decide whether to _stop_.
- IP addresses, geolocation, screen dimensions beyond `innerWidth`x`innerHeight`, installed fonts,
  canvas or WebGL fingerprints, hardware concurrency, or any actively-probed fingerprinting signal.
- Any user identifier you did not explicitly put in `tags` or `extra`.

---

## 3. Retention

### 3.1 Defaults

| Data          | Age cutoff                      | Row cap                            | Configurable via                            |
| ------------- | ------------------------------- | ---------------------------------- | ------------------------------------------- |
| Error records | **7 days** (`retentionDays: 7`) | **500** rows (`maxRecords: 500`)   | `errors.retentionDays`, `errors.maxRecords` |
| Log records   | **3 days** (`retentionDays: 3`) | **2000** rows (`maxRecords: 2000`) | `logs.retentionDays`, `logs.maxRecords`     |

Logs are deliberately shorter-lived and more numerous than errors: a log row is high-volume detail,
an error row is evidence that aggregates by `fingerprint`, so 500 rows can represent a very large
number of occurrences.

### 3.2 How retention is enforced

The policy is a `CleanupPolicy`, implemented identically by both repositories:

```ts
interface CleanupPolicy {
  /** Delete records older than this many days. */
  readonly retentionDays: number;
  /** Hard cap on retained rows; oldest overflow is deleted first. */
  readonly maxRecords: number;
}
```

Enforcement points:

1. **On `initialize()`** — a cleanup pass runs when the database opens, so a vault that has been
   sitting idle for a month is pruned the moment the app starts.
2. **Every N successful writes** — 25 writes for errors
   (`ERROR_CLEANUP_EVERY_WRITES = 25`), 200 for logs (`LOG_CLEANUP_EVERY_WRITES = 200`).
3. **On quota pressure** — a `quota` write failure triggers a cleanup with a _halved_ cap before the
   write is retried exactly once.
4. **In bounded cursor passes** — age and overflow are pruned in separate `readwrite` transactions, and
   any malformed row is deleted in the same pass, so a large prune does not block the main thread.

The timestamp used for age is `lastSeen` for errors (so a bug that is still happening is not deleted
out from under you) and `timestamp` for logs.

### 3.3 Changing retention

```ts
import { initTelemetry } from '@codewithrajat/rm-logvault';

initTelemetry({
  appName: 'checkout',
  errors: { retentionDays: 14, maxRecords: 1000 },
  logs: { retentionDays: 7, maxRecords: 5000 },
});
```

Two behaviours to know before you tune these:

- **`retentionDays: 0` disables the age cutoff**, leaving only `maxRecords`. It does **not** mean
  "delete everything immediately". If you want nothing retained, use `enabled: false` or
  `consent: () => false`.
- **`maxRecords: 0` is ignored** and the default applies. The resolver treats a non-positive row cap
  as a mistake, because silently disabling retention would be the surprising outcome. There is no way
  to configure "store nothing but keep the code path".

For a stricter posture than the defaults allow, combine short retention with tight caps and a
post-minimising `beforeCapture` hook:

```ts
import { initTelemetry } from '@codewithrajat/rm-logvault';

initTelemetry({
  appName: 'checkout',
  errors: {
    retentionDays: 1,
    maxRecords: 200,
    maxPayloadBytes: 8_192,
    // Keep only what is needed to identify the failure.
    beforeCapture: (record) => ({
      ...record,
      extra: undefined,
      tags: undefined,
      environment: {
        ...record.environment,
        userAgent: undefined,
        platform: undefined,
        viewport: undefined,
      },
    }),
  },
  logs: { retentionDays: 1, maxRecords: 500, level: 'error' },
});
```

The cleanup pass deletes rows; it does not vacuum the underlying storage. IndexedDB space is reclaimed
by the browser asynchronously. If you need the space back immediately, `clearTelemetryData()` clears
the stores outright.

---

## 4. The `consent` gate

### 4.1 Declaration

```ts
readonly consent?: Maybe<() => boolean>;
```

A zero-argument function returning a boolean. Returning `true` allows processing; returning `false`
drops silently, without storing anything.

### 4.2 Exactly when it is evaluated

| Path                                         | Evaluated? | Where in the order                                                                                                                                                                             |
| -------------------------------------------- | ---------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Error capture**                            | **Yes**    | In `createErrorTracker.ingest`, after the identity (`WeakSet`) and re-entrancy guards, and **before** the rate limiter, `beforeCapture`, payload reduction and the storage write.              |
| **Error persistence in the pre-init buffer** | **No**     | Before `initTelemetry`, no tracker exists and therefore no gate is known. Errors thrown during module evaluation are buffered and replayed at init, where the gate then applies during replay. |
| **Log persistence**                          | **Yes**    | In `LogTracker.sink.write`, after the persist-level check, before `beforeStore`, payload reduction and the batch push.                                                                         |
| **Log console output**                       | **No**     | The console level is independent of persistence by design; a `logger.info(...)` call still prints. Nothing is _stored_ when the gate is closed.                                                |
| **Upload**                                   | **Yes**    | In `SyncManager.runFlush`, at the top of the run and **before** any claim, endpoint resolution or transport call. A refusal returns `stopped: true` and makes no request.                      |

The implementation is uniform and fails closed in all three places that use it:

```ts
const consentGranted = (): boolean => {
  const consent = config.consent;
  if (consent === undefined) return true;
  try {
    return consent() === true;
  } catch {
    // A throwing consent gate fails closed: do not store.
    return false;
  }
};
```

Note the strictness: only the literal boolean `true` allows processing. A gate returning a truthy
string, a `1`, or a Promise resolves to "denied". `LogTracker` and `SyncManager` carry the same
`consentGranted` function; the sync manager's `catch` comment reads "do not upload".

### 4.3 Withdrawal stops egress immediately

Consent is re-evaluated at the top of **every** flush run, before any network egress:

```ts
// Consent is checked before every upload, not only before storage.
if (!consentGranted()) {
  currentStatus = 'idle';
  // …both summaries return `stopped: true`, and no request is made
}
```

Withdrawing consent therefore stops uploads immediately for records that are already queued, not only
for future captures. Records written while consent was granted stay in the vault as `pending` — never
marked `failed` — and remain there until either consent returns (the next flush drains them) or
`clearTelemetryData()` erases them. A gate that throws fails closed: the run stops and no request is
made.

**Withdrawing consent.** Clear first, then destroy: `clearTelemetryData()` returns `false` when no
repository is active, and destroying first would leave the rows behind.

```ts
import { clearTelemetryData, destroyTelemetry } from '@codewithrajat/rm-logvault';

export async function withdrawConsent(): Promise<void> {
  await clearTelemetryData();
  destroyTelemetry();
}
```

If your basis for the local record differs from your basis for the upload — diagnostics on legitimate
interests, upload on consent, say — `rest.transport` still gives you an independent egress gate, but
it is no longer needed for consent:

```ts
import { initTelemetry, createFetchTransport, type RemoteTransport } from '@codewithrajat/rm-logvault';

const inner = createFetchTransport();
let allowed = true;

const gated: RemoteTransport = {
  name: 'consent-gated-fetch',
  send(request) {
    if (!allowed) {
      // Report a retryable failure so the records stay 'pending' locally
      // and are never delivered. They are not marked 'failed'.
      throw new Error('upload suppressed: consent withdrawn');
    }
    return inner.send(request);
  },
};

initTelemetry({
  appName: 'checkout',
  consent: () => allowed,
  rest: { errorsUrl: '/telemetry/errors', logsUrl: '/telemetry/logs', transport: gated },
});

export function setConsent(value: boolean): void {
  allowed = value;
}
```

Because a rejecting transport is a **retryable** failure, the batches stay `pending` and are never
marked `failed`, so re-granting consent drains the backlog naturally. If the backlog itself is the
problem, `clearTelemetryData()` it.

**Not storing before consent is settled.** The cleanest answer for many deployments:

```ts
import { initTelemetry } from '@codewithrajat/rm-logvault';

// Nothing is initialised, and nothing is buffered into a tracker, until consent exists.
if (readConsent() === 'granted') {
  initTelemetry({ appName: 'checkout', rest: { errorsUrl: '/telemetry/errors' } });
}
```

Pre-init errors thrown before this point are buffered (up to `PRE_INIT_ERROR_BUFFER_SIZE = 50`) and
would be replayed if you later initialise. Call `destroyTelemetry()` on a denial — or simply never
initialise — to drop them; `clearTelemetryData()` also clears the pre-init buffer.

### 4.4 Flipping the gate to `true` later

Nothing is captured retroactively. Turning the gate on does not re-read anything, does not replay a
buffer that was already dropped (a denied capture returns before the buffer is touched), and does not
backfill records. It takes effect from the next capture call onward, which is the correct and
expected semantics for consent.

---

## 5. Erasure: `clearTelemetryData()`

```ts
import { clearTelemetryData } from '@codewithrajat/rm-logvault';

const cleared: boolean = await clearTelemetryData();
```

### 5.1 What it does

- Calls `repository.errors.clear()` and `repository.logs.clear()`, which run `store.clear()` inside a
  `readwrite` transaction on each object store. Every error row and every log row is deleted.
- Clears the pre-init error buffer (`clearPreInitErrors()`).
- Refreshes the pending-count snapshot.
- Returns `true` only when **both** clears succeeded; `false` if either failed, or if no repository is
  active.

It is the GDPR "right to erasure" primitive, and it is explicitly documented as clearing the vault
rather than the configuration: **capture continues afterwards**. If you want capture to stop, you
must also stop it (see §4.3).

### 5.2 What it does not do

- It does **not** delete the databases themselves. The `errors` and `logs` object stores are emptied;
  `rm-logvault-errors` and `rm-logvault-logs` remain, with their schema, so capture can continue without a
  re-upgrade. (The `DbConnection` type does expose `deleteDatabase()`, which removes the whole
  database including its schema; `clearTelemetryData()` deliberately does not use it.)
- It does **not** recall records already uploaded. If `rest.errorsUrl` was configured and a flush
  succeeded, those records are on your server and must be deleted there. This is the single most
  important operational caveat: the client-side primitive is necessary but not sufficient for
  erasure once egress is enabled.
- It does **not** touch the browser's HTTP cache, a service worker cache, or anything else on the
  origin.
- It does **not** delete a diagnostics report the user already downloaded. If reports are your
  support mechanism, your erasure procedure must cover the tickets they were attached to.

### 5.3 A complete erasure routine

```ts
import {
  clearTelemetryData,
  destroyTelemetry,
  getTelemetryStatus,
  initTelemetry,
  logger,
} from '@codewithrajat/rm-logvault';

export async function eraseSubjectData(options: { stopCapture?: boolean } = {}): Promise<void> {
  // 1. Stop new data arriving while we work.
  if (options.stopCapture !== false) destroyTelemetry();

  // 2. Clear locally. Requires an active installation, so re-init if we just destroyed.
  if (options.stopCapture !== false) {
    initTelemetry({
      appName: 'checkout',
      enabled: true,
      shortcut: false,
      rest: { enabled: false },
    });
  }
  await clearTelemetryData();

  // 3. Verify.
  const status = getTelemetryStatus();
  if (status.pending.errors !== 0 || status.pending.logs !== 0) {
    logger.error('[Privacy] erasure incomplete', status);
    throw new Error('erasure incomplete');
  }

  // 4. Server side: delete the uploaded copies by appName + the subject key you stored.
  await fetch('/api/privacy/erase', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ appName: 'checkout', subjectKey: currentSubjectKey() }),
  });

  // 5. Only now re-enable capture, if the user has not withdrawn consent.
  if (options.stopCapture !== false && consentIsGranted()) {
    destroyTelemetry();
    initTelemetry({
      appName: 'checkout',
      consent: consentIsGranted,
      rest: { errorsUrl: '/telemetry/errors' },
    });
  }
}
```

Two details that make this honest rather than decorative:

- Step 2 must happen after step 1's `destroyTelemetry()`, because `clearTelemetryData()` returns
  `false` with no active repository. Re-initialising with `rest.enabled: false` guarantees nothing
  escapes between the clear and the re-enable.
- Step 3 verifies rather than assumes. A clear that partially failed returns `false`, and a routine
  that ignores the return value is not an erasure.

`flushTelemetry()` is worth calling before the clear if you want to be certain that a record written
a millisecond ago was actually written — though clearing an empty store and clearing a full one have
the same effect, so it is only relevant for the verification step.

### 5.4 `clearTelemetryData()` on a schedule

Some deployments clear on every page load or every session boundary, treating the vault as
session-scoped evidence:

```ts
import { clearTelemetryData, initTelemetry, flushTelemetry } from '@codewithrajat/rm-logvault';

initTelemetry({ appName: 'checkout' });

window.addEventListener('pagehide', () => {
  void (async () => {
    await flushTelemetry();
    // …the application decides, e.g. on a shared terminal:
    if (isSharedTerminal()) await clearTelemetryData();
  })();
});
```

A stricter alternative is a short `retentionDays` plus `maxRecords`, which achieves the same outcome
without a lifecycle hook. The hook is preferable when the requirement is "nothing survives the
session" rather than "nothing survives a day".

---

## 6. Data-subject access

`exportDiagnosticsReport({ format: 'json' })` produces a machine-readable document containing
everything the library holds about the device:

```json
{
  "schemaVersion": 1,
  "generatedAt": "2026-10-03T07:55:01.123Z",
  "app": {
    "appName": "checkout",
    "appVersion": "2.4.1",
    "buildId": "8f3c2ab",
    "environment": "production"
  },
  "page": { "url": "/checkout", "userAgent": "Mozilla/5.0 …", "online": true },
  "errors": [/* every ErrorRecord, regardless of uploadStatus */],
  "logs": [/* every LogRecord */]
}
```

Properties that make it usable as a subject-access artefact:

- **Complete for this device.** It reads `getAll()` on both repositories, so records in `pending`,
  `uploading`, `uploaded` and `failed` are all included. Nothing is filtered by upload state, and
  nothing is sampled.
- **Fresh.** It flushes buffered records first, so a log written a millisecond ago is in the
  document.
- **Redacted.** Records were sanitized before storage. The optional `redactAgain: true` re-runs the
  sanitizer with the _current_ configuration, which is what you want if the rules were tightened
  since the records were written.
- **Not the whole picture.** It contains only what this browser on this device stored. Records
  already uploaded live on your server and must be exported from there. Tell the data subject which
  is which.

```ts
import { exportDiagnosticsReport } from '@codewithrajat/rm-logvault';

// Production access request: re-redact under the current rules, deliver as JSON.
await exportDiagnosticsReport({
  format: 'json',
  redactAgain: true,
  filenamePrefix: 'subject-access-request',
});
```

Handling notes:

- The document is redacted, not anonymised. It can still contain the `pageLoadId` (a random
  correlator), the user agent, and whatever the application put in `tags` and `extra`. That is
  usually acceptable in a subject-access response — it _is_ the subject's data — but it is not
  suitable for public release.
- If you deliver the HTML format instead, the viewer is self-contained and needs no network. Either
  format works; JSON is better for a data portability request (Art. 20), HTML is better for a human.
- The export is initiated by application code, not by the data subject, so the delivery channel and
  any identity verification are yours to define. The library deliberately has no remote-triggerable
  export.

### Access requests that include uploaded data

The library cannot query your server. The join key it does provide is `pageLoadId`, which appears on
both error records and log records from the same page load, and `api.requestId`, which lets you
correlate a client record with a server-side request. If your server stores a subject identifier
alongside the records it receives — which it should, because the client cannot be trusted to assert
one — you can answer access and erasure requests server-side and use the client export only for the
device-local remainder.

---

## 7. DPA / records-of-processing checklist

Work through this before enabling uploads in a production deployment. Each line is something a
supervisory authority may ask for and something the library either provides or makes explicit.

### Describe the processing

- [ ] **Purpose** is written down, in one sentence per processing activity (e.g. "diagnose
      production failures reported by users" and "detect deploy-induced chunk-load regressions").
- [ ] **Categories of data subjects** are named (customers, internal staff, both).
- [ ] **Categories of personal data** are enumerated from §2, not assumed to be "logs".
- [ ] **Lawful basis** is chosen per category from §1, and the choice is recorded.
- [ ] **Legitimate interests assessment** exists if Art. 6(1)(f) is relied on: the interest, the
      necessity, and the balancing test against the data subject's rights and expectations.

### Minimise

- [ ] `logs.level` is the highest threshold that still gives you the evidence you need. Default
      `'warn'`; `'info'` and `'debug'` are a deliberate decision, not a default.
- [ ] `logs.captureConsole` is `false` unless you have a specific reason.
- [ ] `errors.captureResources` and `errors.captureCsp` are enabled only if you will act on them.
- [ ] `redaction.allowedQueryParams` contains only parameters you have reviewed. The default list is
      a starting point, not a guarantee.
- [ ] `redaction.extraSensitiveKeys` and `extraPatterns` cover the identifiers your application
      actually uses (tenant ids, account numbers, national identifiers, internal user references).
- [ ] `beforeCapture` / `beforeStore` hooks strip anything you know is unnecessary.
- [ ] No code path puts a subject identifier, name, e-mail or address into `tags` or `extra`. These
      are the fields redaction cannot help with, because the key names are yours.
- [ ] `appName`, `appVersion` and `buildId` do not contain personal data. They are strings you
      control; a build system that injects a username is a leak.
- [ ] Error messages are reviewed for interpolation of personal data. This is the most common
      accidental channel and the least amenable to automatic redaction.

### Bound retention

- [ ] `errors.retentionDays` and `logs.retentionDays` are set to the shortest period that satisfies
      the purpose, and the value is documented.
- [ ] `errors.maxRecords` and `logs.maxRecords` are set so a noisy bug cannot extend the effective
      retention of older records.
- [ ] A `clearTelemetryData()` path exists in the application for shared or public terminals.
- [ ] Server-side retention for uploaded records is defined. **The client's retention settings do not
      apply to data you have already received.** This is the most commonly missed item.

### Secure

- [ ] `rest.errorsUrl` and `rest.logsUrl` use HTTPS in every environment except local development,
      and `rest.requireHttps: true` enforces it where the environment is not trustworthy.
- [ ] `rest.credentials` is `'same-origin'` or `'omit'` unless there is a specific reason for
      `'include'`.
- [ ] Server-side access to the uploaded records is role-restricted. The records are redacted, not
      anonymous.
- [ ] `onTerminalFailure` is wired up so a `401` triggers re-authentication rather than silent data
      loss (a data-minimisation issue in the other direction: losing consent records is also a
      problem).
- [ ] Transport is not intercepted by a shared proxy that logs bodies.

### Record the processors

- [ ] The hosting provider that receives the uploads is identified and named in the privacy notice.
- [ ] A Data Processing Agreement (Art. 28) is in place with that provider.
- [ ] **Sub-processors** of that provider are listed.
- [ ] If the endpoint is outside the EEA (or outside your jurisdiction), the **transfer mechanism** is
      documented: an adequacy decision, Standard Contractual Clauses, or the UK IDTA/Addendum.
- [ ] `SECURITY.md` (or your own equivalent) is linked from the privacy notice, since it documents
      the technical and organisational measures.

### Document and decide

- [ ] A **DPIA** decision is recorded (Art. 35). Even when a full DPIA is not required, recording the
      reasoning is cheap and valuable. Systematic monitoring plus a vulnerable data subject
      population usually triggers one.
- [ ] The **privacy notice** has an entry describing this processing: what is collected, why, on what
      basis, for how long, and who receives it.
- [ ] The **erasure request procedure** is written down and covers all four places data can live:
      the local vault, the server, downloaded reports, and backups.
- [ ] The **access request procedure** names the export mechanism and who is allowed to run it.
- [ ] A **consent withdrawal** procedure exists if consent is the basis, including the §4.3 ordering.
- [ ] The **records of processing** (Art. 30) entry is updated.

### Verify

- [ ] A test asserts that a record containing a token-shaped string is redacted end to end. See
      [TROUBLESHOOTING.md](TROUBLESHOOTING.md#logs-are-missing-at-info-level) for how records are
      inspected in tests.
- [ ] A test asserts that `clearTelemetryData()` leaves zero rows.
- [ ] A test asserts that the consent gate blocks capture when it returns `false` and when it throws.
- [ ] `isSyncConfigured(resolveOptions(options))` is asserted `false` for any build that must not
      upload.

---

## 8. A consent banner example

A complete, framework-agnostic implementation. It stores the decision, initialises telemetry only
when allowed, re-evaluates the gate on every capture, and offers a withdrawal path that actually
stops the processing.

### `consent.ts`

```ts
// consent.ts — the decision store and the telemetry wiring.
import { destroyTelemetry, clearTelemetryData, initTelemetry } from '@codewithrajat/rm-logvault';

const STORAGE_KEY = '@codewithrajat/rm-logvault-consent';
const STORAGE_VERSION = '1';

export type ConsentDecision = 'granted' | 'denied' | 'unset';

interface StoredConsent {
  readonly version: string;
  readonly decision: Exclude<ConsentDecision, 'unset'>;
  readonly decidedAt: string;
}

/** Read the stored decision. Never throws: a blocked localStorage means "unset". */
export function readConsent(): ConsentDecision {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (raw === null) return 'unset';
    const parsed = JSON.parse(raw) as Partial<StoredConsent>;
    if (parsed.version !== STORAGE_VERSION) return 'unset';
    return parsed.decision === 'granted' || parsed.decision === 'denied'
      ? parsed.decision
      : 'unset';
  } catch {
    // Storage blocked (private mode, third-party cookie blocking) → no consent evidence.
    return 'unset';
  }
}

/**
 * Whether telemetry is currently permitted.
 *
 * This is the function handed to `initTelemetry({ consent })`, so it is evaluated
 * before every error capture and every log persist.
 */
export function hasConsent(): boolean {
  return readConsent() === 'granted';
}

function writeConsent(decision: Exclude<ConsentDecision, 'unset'>): void {
  try {
    const value: StoredConsent = {
      version: STORAGE_VERSION,
      decision,
      decidedAt: new Date().toISOString(),
    };
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(value));
  } catch {
    // Storage blocked: the decision is session-only. Acceptable, and better than throwing.
  }
}

/**
 * Start telemetry. Idempotent — `initTelemetry` returns the existing handle on a second call.
 *
 * Consent is passed as a *gate*, not sampled once, so a later withdrawal takes effect
 * on the next capture without re-initialising.
 */
export function startTelemetry(): void {
  initTelemetry({
    appName: 'checkout',
    appVersion: import.meta.env.VITE_APP_VERSION,
    buildId: import.meta.env.VITE_BUILD_ID,
    environment: import.meta.env.MODE,

    // Re-evaluated on every capture and every persist. Fails closed if it throws.
    consent: hasConsent,

    errors: { maxRecords: 500, retentionDays: 7 },
    logs: { level: 'warn', maxRecords: 2000, retentionDays: 3 },

    rest: { errorsUrl: '/telemetry/errors', logsUrl: '/telemetry/logs' },

    // No report for a user who has not agreed to the processing.
    shortcut: { allow: hasConsent, filenamePrefix: 'checkout-report' },
  });
}

export function grantConsent(): void {
  writeConsent('granted');
  startTelemetry();
}

/**
 * Withdraw consent.
 *
 * Order matters: clear while an installation is still active, then destroy. If the
 * library is already initialised, records captured before the withdrawal are still
 * `pending` and would be uploaded by the next flush, so clearing first is what makes
 * the withdrawal effective rather than nominal.
 */
export async function denyConsent(): Promise<void> {
  writeConsent('denied');
  await clearTelemetryData();
  destroyTelemetry();
}
```

### `consent-banner.html`

```html
<div id="consent-banner" role="dialog" aria-modal="false" aria-labelledby="consent-heading" hidden>
  <h2 id="consent-heading">Help us fix problems faster</h2>
  <p>
    We would like to record errors and warnings from this app on your device, and send them to our
    team when something breaks. The data is redacted before it is stored: passwords, tokens, e-mail
    addresses and URL parameters are removed automatically. Nothing is shared with anyone else, and
    it is deleted after 7 days. You can change your mind at any time.
    <a href="/privacy" target="_blank" rel="noopener noreferrer">Read the full notice</a>.
  </p>
  <button type="button" id="consent-accept">Allow</button>
  <button type="button" id="consent-decline">No thanks</button>
  <button type="button" id="consent-withdraw" hidden>Turn off diagnostics</button>
</div>
```

### `consent-banner.ts`

```ts
import { readConsent, grantConsent, denyConsent, startTelemetry } from './consent';

const banner = document.getElementById('consent-banner');
const accept = document.getElementById('consent-accept');
const decline = document.getElementById('consent-decline');
const withdraw = document.getElementById('consent-withdraw');

function render(decision: 'granted' | 'denied' | 'unset'): void {
  if (banner === null || accept === null || decline === null || withdraw === null) return;

  const showBanner = decision === 'unset';
  banner.hidden = !showBanner;

  // Withdrawal must be as easy as consent, so the control stays reachable.
  withdraw.hidden = decision !== 'granted';
  accept.hidden = !showBanner;
  decline.hidden = !showBanner;
}

accept?.addEventListener('click', () => {
  grantConsent();
  render('granted');
});

decline?.addEventListener('click', () => {
  void denyConsent().then(() => {
    render('denied');
  });
});

withdraw?.addEventListener('click', () => {
  void denyConsent().then(() => {
    render('denied');
  });
});

// Boot: start capture only once the user has already agreed.
const decision = readConsent();
if (decision === 'granted') startTelemetry();
render(decision);
```

### Notes on this example

- **Nothing is captured before a decision exists.** `startTelemetry()` is not called until
  `readConsent()` returns `'granted'`, so there is no pre-consent buffer to reason about. If you must
  initialise early for operational errors (fatal chunk-load failures, for instance), keep those on a
  legitimate-interest basis and use a separate, minimal configuration.
- **The gate is a function, not a boolean.** `consent: hasConsent` means a withdrawal takes effect on
  the very next capture, without a re-initialisation. A sampled boolean would not.
- **The shortcut is gated too.** `shortcut: { allow: hasConsent }` means a user who declined cannot
  produce a report. Without it, the report would still exist — the shortcut is obscurity, not access
  control (§7 of [SECURITY.md](SECURITY.md)).
- **Withdrawal calls `clearTelemetryData()` then `destroyTelemetry()`, in that order.** See §4.3 and
  §5.3 for why the ordering is not cosmetic.
- **`readConsent()` treats a blocked `localStorage` as "unset".** Failing closed on a storage read is
  the right default: no evidence of consent means no processing.
- **The banner text names the retention period.** If you change `retentionDays`, change the text. A
  notice that disagrees with the implementation is worse than no notice.

---

## 9. What logVault does not do

An explicit list, because "we do not track you" is a claim that deserves specifics.

- **No cross-site tracking.** Records are written to the origin's own IndexedDB. There is no
  third-party cookie, no `<iframe>`, no postMessage to another origin, and no shared identifier
  across origins. `pageLoadId` is random and is regenerated on every page load.
- **No fingerprinting beyond what the browser already sends.** The library records
  `navigator.userAgent`, `navigator.platform` (falling back to `userAgentData.platform`) and
  `innerWidth`x`innerHeight`. It does not probe canvas, WebGL, audio, fonts, `hardwareConcurrency`,
  `deviceMemory`, timezone, language, battery, media devices, or any other active fingerprinting
  signal. If you consider the user agent itself to be a fingerprint, redact it —
  `beforeCapture` can drop `environment.userAgent`.
- **No third-party calls.** The only network egress is `rest.errorsUrl` and `rest.logsUrl`, through
  the configured transport, as asserted in [SECURITY.md](SECURITY.md#6-network-egress-the-only-requests-are-the-configured-ones).
  There is no analytics SDK, no CDN import, no telemetry-of-telemetry.
- **No cookies.** Not read, not set, not enumerated. `document.cookie` does not appear in the
  codebase.
- **No `localStorage` or `sessionStorage` reads.** The library never touches either. (The consent
  example in §8 uses `localStorage` — that is _your_ code deciding to persist _your_ consent
  decision, which is exactly the right place for it.)
- **No session replay.** No DOM snapshots, no mutation observer, no input recording, no
  screenshots, no rrweb. It is on the permanent out-of-scope list.
- **No server, no dashboards, no alerting.** There is no destination you have not configured.
- **No behavioural trail by default.** `logs.level` is `'warn'`, so informational logs — the ones
  that would show what a user was doing — are not persisted unless you explicitly lower the
  threshold.
- **No user identification.** There is no `setUser`, no distinct id, no session id beyond the
  per-page-load random correlator. If you want to associate records with an account, you must put
  that identifier in `tags` yourself, and at that point it is your decision and your responsibility —
  including telling the data subject about it.

---

## 10. Quick reference

| Question                                  | Answer                                                                                                                                                                                                                            |
| ----------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Where is data stored?                     | IndexedDB databases `rm-logvault-errors` and `rm-logvault-logs`, on the user's device.                                                                                                                                                  |
| Where is data sent?                       | Nowhere, unless you configure `rest.errorsUrl` / `rest.logsUrl`.                                                                                                                                                                  |
| How long is it kept by default?           | 7 days for errors, 3 days for logs, capped at 500 and 2000 rows.                                                                                                                                                                  |
| Is it redacted?                           | Yes, before storage and again before export. Tokens, JWTs, auth schemes, `key=value` secrets (including `phone`/`email`), long opaque tokens in free text, e-mails, URL credentials, fragments and non-allow-listed query values. |
| Is it anonymous?                          | No. Redacted. Page URLs, user agents and application messages can still be personal data.                                                                                                                                         |
| How do I stop capture?                    | `enabled: false`, `consent: () => false`, `destroyTelemetry()`, or do not call `initTelemetry`.                                                                                                                                   |
| How do I delete everything?               | `await clearTelemetryData()` — and delete the server-side copies yourself.                                                                                                                                                        |
| How do I answer an access request?        | `exportDiagnosticsReport({ format: 'json', redactAgain: true })`, plus a server-side query.                                                                                                                                       |
| Does withdrawing consent stop uploads?    | Yes. `consent()` is re-evaluated before every flush, so the queued records stop being uploaded immediately. See §4.3.                                                                                                             |
| Is the diagnostics report safe to e-mail? | It is XSS-safe and redacted, and it carries a privacy banner. Review it before forwarding to a wider audience.                                                                                                                    |
