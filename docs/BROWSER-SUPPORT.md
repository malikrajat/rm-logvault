# Browser support and storage limits

logVault persists to **IndexedDB**, and it talks to that API directly — through `globalThis.indexedDB`,
with no wrapper package, no polyfill and no adapter. `package.json` declares no runtime `dependencies`
at all, and a CI job fails the build if one is ever added.

So the answer to "does it work in every browser?" is **yes, for availability**. Every evergreen engine
ships IndexedDB, and no engine requires a shim. The distinction that actually costs people time is
between *the API existing* and *the browser letting you keep what you wrote*. The second is a browser
policy decision — a quota, an eviction rule, a partitioning rule — and no library can override it.
This document is about the second one.

Nothing here is a logVault limitation. Every item applies equally to any code that calls `indexedDB`,
`localStorage` or the Cache API from a page.

---

## 1. Availability

| Runtime                        | IndexedDB | Notes                                                                          |
| ------------------------------ | --------- | ------------------------------------------------------------------------------ |
| Chromium (Chrome, Edge, Brave) | yes       | Chrome on iOS is WebKit underneath, so §2.1 applies there too                   |
| Firefox                        | yes       | partitioned by top-level site since Firefox 103 — see §2.3                      |
| Safari (macOS, iOS, iPadOS)    | yes       | subject to the seven-day cap in §2.1; on iOS every browser is WebKit            |
| Dedicated and shared worker    | yes       | `IDBFactory` is exposed in worker scopes                                        |
| Node, SSR, a bundler's prerender pass | no | `globalThis.indexedDB` is absent, so storage is skipped and capture continues |

The library never assumes availability. `resolveFactory` in `src/storage/idbCore.ts` reads
`globalThis.indexedDB` defensively: if the property is missing, or is not an object, or `open` is not a
function, storage resolves to `unavailable` and everything else keeps working. If *reading* the property
throws — which is how a browser refuses storage in a context where it has decided not to allow it — the
factory resolves to `blocked` and is treated the same way.

---

## 2. The limits, and what causes each one

### 2.1 Safari deletes script-writable storage after seven days of no interaction

WebKit's Intelligent Tracking Prevention [deletes all of a website's script-writable storage after seven
days of Safari use without user interaction on the site](https://webkit.org/blog/10218/full-third-party-cookie-blocking-and-more/).
IndexedDB is named explicitly in that list, alongside `localStorage`, `sessionStorage` and service
worker registrations. Web applications added to the home screen are exempt and keep their own counter.

**What this means for logVault.** On an installed-and-forgotten Safari tab, both databases can be gone
between one visit and the next. The default retention windows (7 days for errors, 3 for logs) are
already inside that ceiling, so in practice the retention policy usually fires first — but the browser's
cap is measured from *last interaction*, not from record age, so it can fire first on a site nobody has
touched for a week. There is no API to opt out of the cap; the exemption is the home screen.

### 2.2 Private and incognito windows

Browsers [apply different quotas in private browsing, and usually delete the stored data when the
session ends](https://developer.mozilla.org/en-US/docs/Web/API/Storage_API/Storage_quotas_and_eviction_criteria#private_browsing).
Some Safari versions additionally refuse storage in a private window outright, throwing on access to the
property or from `open()`.

**What this means for logVault.** Capture, redaction and console output all continue; persistence and
therefore the diagnostics report may not. This is the single most common cause of a report that
downloads but contains nothing — see §5.

### 2.3 Third-party iframes are partitioned, or refused

Firefox has [partitioned IndexedDB by top-level site since Firefox 103](https://developer.mozilla.org/en-US/docs/Web/Privacy/Guides/State_Partitioning),
enabled by default for all users; Chromium and WebKit do the same. An embedded frame therefore gets a
storage bucket keyed to the site embedding it, not the single shared bucket it used to have.

If the frame is in an **opaque origin** — `sandbox` without `allow-same-origin`, or a `data:` / `blob:`
URL — it has no storage bucket at all and the API throws `SecurityError`.

**What this means for logVault.** A widget embedded on three customer sites keeps three separate
vaults, which is correct and intended. A widget inside a fully sandboxed frame keeps none; use the
`Storage Access API` only if you genuinely need unpartitioned state, and expect it to require user
interaction.

### 2.4 Quota and eviction

Storage is **best-effort** by default: it survives until the origin is over quota, the device is short of
space, or the user clears it. Each engine picks its own ceiling — for Firefox, [the smaller of 10% of the
volume or a 10 GiB per-site group limit](https://developer.mozilla.org/en-US/docs/Web/API/Storage_API/Storage_quotas_and_eviction_criteria#firefox);
Chromium and WebKit derive theirs from available disk space.

`navigator.storage.persist()` asks for an exemption from eviction. Chromium and WebKit decide silently
from the user's engagement history; Firefox shows a prompt.

**What this means for logVault.** An error burst on a long-lived tab can fill the quota. That surfaces as
`QuotaExceededError` (or the legacy `NS_ERROR_DOM_QUOTA_REACHED`, or numeric `code === 22`), which the
storage layer classifies as `quota` and reports through `onInternalError` as `storage (quota)`. The
`maxRecords` and `retentionDays` options exist to stay well below the ceiling; consider asking for
persistent storage if the vault is the only copy of anything.

### 2.5 A schema upgrade blocked by another tab

If one tab is mid-upgrade and another tab holds an older connection open, `open()` never fires
`success` or `error`; it fires `blocked`.

**What this means for logVault.** The open is bounded by `openTimeoutMs` (5 000 ms by default, the
value of `DEFAULT_OPEN_TIMEOUT_MS`; raise it on a slow device). On timeout
the attempt is reported as `storage (transaction)` and treated as a failure, and if the browser later
completes the open anyway, that late handle is closed rather than leaked. A `versionchange` event on an
open connection closes it immediately so *our* tab never blocks someone else's upgrade.

### 2.6 Site data cleared underneath a running page

A user can clear site data, or a browser can drop a connection, while the page is still open.

**What this means for logVault.** `onclose` drops the cached connection and the next write reopens and
re-runs the idempotent upgrade, so capture resumes without a reload. A subsequent failure that means
"this connection is gone" (`InvalidStateError`, `DatabaseClosedError`, `AbortError`,
`TransactionInactiveError`) closes the handle and reopens on the following call. A `SecurityError` is
different: it is treated as permanently unavailable so the library stops retrying an open that cannot
succeed.

---

## 3. What the library reports when this happens

Two vocabularies, and they mean different things.

`StorageFailureReason` — why one operation failed:

| Reason          | Raised by                                                                       |
| --------------- | ------------------------------------------------------------------------------- |
| `unavailable`   | no `IDBFactory`, storage blocked, `SecurityError`, an open that threw            |
| `quota`         | `QuotaExceededError`, `NS_ERROR_DOM_QUOTA_REACHED`, or legacy `code === 22`      |
| `serialization` | `DataCloneError` — a record value could not be structured-cloned                 |
| `transaction`   | a transaction aborted or failed, or the open timed out                           |

`StorageState` — the lifecycle state of the layer, read from `getTelemetryStatus().storage`:

| State          | Meaning                                                                            |
| -------------- | ---------------------------------------------------------------------------------- |
| `initializing` | `initTelemetry` has returned; the asynchronous open has not settled yet             |
| `ready`        | the databases are open and usable                                                   |
| `unavailable`  | the open failed, or storage is blocked; capture continues without persistence       |
| `disabled`     | `enabled: false`, so the library is deliberately inert                              |

Every transition into a failure is reported once per stage through `onInternalError`, with the stage
name `storage (<reason>)`, so a broken storage layer does not produce one warning per captured error.

> Source note: `state.repository` is assigned before the asynchronous open settles, so
> `exportDiagnosticsReport` does not fail fast when storage is unavailable. It proceeds, the reads
> return `{ ok: false, reason: 'unavailable' }`, and the report is written with zero records —
> `diagnostics-read-errors` and `diagnostics-read-logs` are reported through `onInternalError`. An
> empty report therefore has two possible meanings, and §5 shows how to tell them apart.

---

## 4. What to do about it

1. **Check the state and say so.** After init, read `getTelemetryStatus().storage`. If it is not
   `ready`, tell the user their diagnostics will not survive a reload — do not let them discover it
   during an incident.
2. **Ask for persistence if the vault matters.** Call `navigator.storage.persist()` from a user
   gesture and store the answer. Chromium and WebKit decide silently; Firefox prompts.
3. **Keep retention inside the shortest window you care about.** The defaults are 7 days for errors and
   3 for logs. In Safari, no retention setting can outlive the seven-day cap in §2.1.
4. **Upload anything you cannot afford to lose.** `mode: 'remote'` with a `rest.errorsUrl` moves the
   durable copy off the device. Local-only is the default precisely so that this is a deliberate choice.
5. **Do not treat the report as a guarantee.** It is the best artefact available *on that device* at
   that moment. If the device refuses storage, there is nothing to report.

---

## 5. Verifying on your own machine

A report that downloads with no records is ambiguous. Resolve the ambiguity before reading anything
into it:

```ts
import { getTelemetryStatus, flushTelemetry } from '@codewithrajat/rm-logvault';

await flushTelemetry();
const status = getTelemetryStatus();
console.log(status.storage, status.pending, status.lastSync);
```

- `storage: 'ready'` with zero records means the library genuinely captured nothing.
- `storage: 'unavailable'` means the browser refused storage; check for `storage (unavailable)` in your
  `onInternalError` hook and re-test outside a private window and outside a sandboxed frame.

In DevTools, the databases are `{dbPrefix}-errors` and `{dbPrefix}-logs` (default prefix `rm-logvault`) under
**Application → IndexedDB** in Chromium, and **Storage → IndexedDB** in Firefox and Safari. The
[README FAQ](../README.md#does-it-work-in-safari-private-mode) and
[TROUBLESHOOTING.md](TROUBLESHOOTING.md) cover the symptom-first path.

---

## 6. What is not claimed

- **Not durable.** Nothing stored by a page is guaranteed to still be there. If you need a guarantee,
  the copy has to leave the device.
- **Not encrypted at rest.** Records are redacted before they are written, not encrypted; anything with
  access to the profile can read the database.
- **Not immune to partitioning.** In a third-party frame the vault is per-embedding-site by design, and
  in an opaque origin there is no vault at all.
- **No polyfill is provided.** A wrapper or polyfill would not change any limit above; it would only add
  a dependency to a package whose zero-dependency posture is a headline property (see
  [DECISIONS.md](DECISIONS.md)).
