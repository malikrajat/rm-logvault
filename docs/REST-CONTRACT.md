# REST contract

The wire format logVault sends to `rest.errorsUrl` and `rest.logsUrl`, and what a server has to do
to accept it correctly.

This document describes the envelope built by `buildRestBody` in `src/sync/restSync.ts` and the
records produced by `src/errors/types.ts` and `src/logger/logger.types.ts`. Status classification,
`Retry-After` parsing and backoff are defined in `src/sync/restSync.ts`, `src/sync/sync.types.ts`
and `src/sync/syncManager.ts`.

> **Source note.** The `TransportResponse` JSDoc and this document agree:
> `createFetchTransport` parses `Retry-After` on **every** response, not only `429` and `503`, and
> `SyncManager` uses the value whenever a run ends in failure, scheduling the next attempt at
> `max(backoffDelay(failures), retryAfterMs)` clamped to `BACKOFF_MAX_MS` (15 minutes). A server can
> therefore send `Retry-After` on any retryable status and have it respected.

---

## 1. Transport

| Property         | Value                                                                                                                                          |
| ---------------- | ---------------------------------------------------------------------------------------------------------------------------------------------- |
| Method           | `POST`                                                                                                                                         |
| `Content-Type`   | `application/json`                                                                                                                             |
| Credentials      | `rest.credentials`, default `'same-origin'`. Never implicitly `'include'`.                                                                     |
| Redirects        | `'follow'`                                                                                                                                     |
| Abort budget     | 10 000 ms (`REQUEST_TIMEOUT_MS`), enforced with `AbortController`                                                                              |
| `keepalive`      | Only on the unload flush (`pagehide` / `visibilitychange â†’ hidden`), and only when the body is under 60 000 characters (`KEEPALIVE_MAX_BYTES`) |
| Headers          | Whatever `rest.getHeaders()` returns, awaited **per request**, merged over `Content-Type`                                                      |
| Endpoints        | One per kind: `rest.errorsUrl` and `rest.logsUrl`. Omit one and that kind stays local forever.                                                 |
| Response reading | **The body is never read.** Only `response.status` and the `Retry-After` header.                                                               |

Endpoint validation happens once, at initialization, through `resolveEndpoint(raw, requireHttps)`:

- Empty or whitespace-only â†’ rejected.
- A forbidden scheme (`javascript:`, `data:`, `vbscript:`, `file:`, `blob:`, `about:`, `chrome:`,
  `chrome-extension:`) â†’ rejected.
- A relative URL is resolved against `window.location.href`. Outside a browser there is no origin,
  so a relative URL is rejected.
- Only `http:` and `https:` survive parsing.
- With `requireHttps: true`, `http:` is rejected unless the hostname is one of `localhost`,
  `127.0.0.1`, `::1`, `[::1]`, `0.0.0.0`.

A rejected endpoint makes that kind local-only rather than throwing. `isSyncConfigured(options)`
answers "did anything survive?" without a request.

---

## 2. JSON Schema (draft 2020-12)

### 2.1 The envelope

```json
{
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "$id": "https://github.com/malikrajat/rm-logvault/schemas/batch.schema.json",
  "title": "logVault batch envelope",
  "type": "object",
  "additionalProperties": false,
  "required": ["schemaVersion", "kind", "sentAt", "app", "records"],
  "properties": {
    "schemaVersion": { "const": 1 },
    "kind": { "enum": ["errors", "logs"] },
    "sentAt": { "type": "integer", "description": "Unix epoch milliseconds at send time." },
    "app": {
      "type": "object",
      "additionalProperties": false,
      "required": ["appName", "appVersion", "buildId", "environment"],
      "properties": {
        "appName": { "type": "string" },
        "appVersion": { "type": "string" },
        "buildId": { "type": "string" },
        "environment": { "type": "string" }
      },
      "description": "Empty strings when the corresponding option was not configured."
    },
    "records": {
      "type": "array",
      "items": {
        "oneOf": [{ "$ref": "#/$defs/errorRecord" }, { "$ref": "#/$defs/logRecord" }]
      }
    }
  },
  "$defs": {
    "uploadStatus": { "enum": ["pending", "uploading", "uploaded", "failed"] },
    "pageInfo": {
      "type": "object",
      "additionalProperties": false,
      "required": ["url", "route", "pageLoadId"],
      "properties": {
        "url": {
          "type": "string",
          "description": "Sanitized: credentials, fragments and non-allow-listed query values removed."
        },
        "route": {
          "type": "string",
          "description": "Path plus allow-listed query values, origin removed. 'unknown' outside a browser."
        },
        "pageLoadId": { "type": "string" }
      }
    },
    "environmentInfo": {
      "type": "object",
      "additionalProperties": false,
      "properties": {
        "appName": { "type": "string" },
        "appVersion": { "type": "string" },
        "buildId": { "type": "string" },
        "environment": { "type": "string" },
        "userAgent": { "type": "string", "maxLength": 500 },
        "platform": { "type": "string" },
        "viewport": { "type": "string", "pattern": "^[0-9]+x[0-9]+$" },
        "online": { "type": "boolean" },
        "visibilityState": { "type": "string" }
      }
    },
    "errorCause": {
      "type": "object",
      "additionalProperties": false,
      "required": ["name", "message"],
      "properties": {
        "name": { "type": "string", "maxLength": 1000 },
        "message": { "type": "string", "maxLength": 1000 },
        "stack": { "type": "string", "maxLength": 8000 }
      }
    },
    "errorLocation": {
      "type": "object",
      "additionalProperties": false,
      "properties": {
        "source": { "type": "string" },
        "line": { "type": "integer" },
        "column": { "type": "integer" }
      }
    },
    "apiErrorContext": {
      "type": "object",
      "additionalProperties": false,
      "required": ["kind"],
      "properties": {
        "kind": { "enum": ["auth", "abort", "timeout", "parse", "http", "network", "unknown"] },
        "method": { "type": "string", "description": "Upper-cased." },
        "url": {
          "type": "string",
          "description": "Sanitized URL. Never a request body or a parameter bag."
        },
        "status": { "type": "integer" },
        "statusText": { "type": "string", "maxLength": 200 },
        "code": {
          "type": "string",
          "description": "Client-side code, e.g. ERR_NETWORK, ECONNABORTED, ERR_CANCELED."
        },
        "timeout": { "type": "integer" },
        "duration": { "type": "integer", "minimum": 0 },
        "requestId": {
          "type": "string",
          "maxLength": 200,
          "description": "First present of x-request-id, x-correlation-id, x-trace-id, traceparent."
        }
      }
    },
    "errorEventInfo": {
      "type": "object",
      "additionalProperties": false,
      "required": ["type"],
      "properties": {
        "type": { "type": "string" },
        "targetTag": { "type": "string" },
        "resourceUrl": { "type": "string" },
        "directive": { "type": "string" },
        "blockedURI": { "type": "string" },
        "crossOrigin": { "type": "string" }
      }
    },
    "errorRecord": {
      "type": "object",
      "additionalProperties": false,
      "required": [
        "schemaVersion",
        "id",
        "fingerprint",
        "uploadStatus",
        "uploadAttempts",
        "source",
        "severity",
        "category",
        "handled",
        "thrownType",
        "name",
        "message",
        "page",
        "environment",
        "timestamp",
        "firstSeen",
        "lastSeen",
        "occurrenceCount"
      ],
      "properties": {
        "schemaVersion": { "const": 1 },
        "id": {
          "type": "string",
          "minLength": 1,
          "description": "Stable across retries. The idempotency key."
        },
        "fingerprint": {
          "type": "string",
          "description": "28 lowercase hex characters, or an 'unfingerprinted-â€¦' token if hashing failed."
        },
        "uploadStatus": { "$ref": "#/$defs/uploadStatus" },
        "uploadAttempts": { "type": "integer", "minimum": 0 },
        "claimedAt": {
          "type": "integer",
          "description": "Epoch ms of the claim that produced this row. Absent while 'pending'."
        },
        "source": {
          "enum": [
            "react",
            "vue",
            "angular",
            "svelte",
            "api",
            "window",
            "unhandledrejection",
            "resource",
            "chunk",
            "csp",
            "event-handler",
            "worker",
            "query",
            "storage",
            "manual"
          ]
        },
        "severity": { "enum": ["fatal", "error", "warning", "info"] },
        "category": {
          "enum": [
            "runtime",
            "chunk",
            "resource",
            "http",
            "network",
            "timeout",
            "abort",
            "parse",
            "auth",
            "security"
          ]
        },
        "handled": {
          "type": "boolean",
          "description": "false for window, unhandledrejection, resource, chunk, csp and worker sources unless overridden."
        },
        "thrownType": {
          "enum": ["error", "string", "number", "boolean", "object", "null", "undefined", "other"]
        },
        "name": { "type": "string", "maxLength": 1000 },
        "message": { "type": "string", "maxLength": 1000 },
        "stack": { "type": "string", "maxLength": 8000 },
        "causes": { "type": "array", "maxItems": 3, "items": { "$ref": "#/$defs/errorCause" } },
        "componentStack": { "type": "string", "maxLength": 4000 },
        "location": { "$ref": "#/$defs/errorLocation" },
        "api": { "$ref": "#/$defs/apiErrorContext" },
        "event": { "$ref": "#/$defs/errorEventInfo" },
        "page": { "$ref": "#/$defs/pageInfo" },
        "environment": { "$ref": "#/$defs/environmentInfo" },
        "tags": {
          "type": "object",
          "maxProperties": 20,
          "propertyNames": { "maxLength": 50 },
          "additionalProperties": { "type": "string", "maxLength": 200 }
        },
        "extra": {
          "type": "object",
          "description": "Deep-sanitized: depth <= 4, 30 keys, 20 array items, 2000 characters per string."
        },
        "timestamp": { "type": "integer" },
        "firstSeen": { "type": "integer" },
        "lastSeen": { "type": "integer" },
        "occurrenceCount": { "type": "integer", "minimum": 1 }
      }
    },
    "logEnvironment": {
      "type": "object",
      "additionalProperties": false,
      "properties": {
        "appName": { "type": "string" },
        "appVersion": { "type": "string" },
        "buildId": { "type": "string" },
        "environment": { "type": "string" }
      },
      "description": "Deliberately narrower than the error environment block: logs are high-volume, so only stable application identity is duplicated onto each row."
    },
    "logRecord": {
      "type": "object",
      "additionalProperties": false,
      "required": [
        "schemaVersion",
        "id",
        "uploadStatus",
        "uploadAttempts",
        "level",
        "message",
        "pageLoadId",
        "environment",
        "timestamp",
        "seq"
      ],
      "properties": {
        "schemaVersion": { "const": 1 },
        "id": { "type": "string", "minLength": 1 },
        "uploadStatus": { "$ref": "#/$defs/uploadStatus" },
        "uploadAttempts": { "type": "integer", "minimum": 0 },
        "claimedAt": { "type": "integer" },
        "level": { "enum": ["trace", "debug", "info", "warn", "error"] },
        "message": { "type": "string", "maxLength": 1000 },
        "data": {
          "type": "array",
          "maxItems": 5,
          "description": "Log arguments, each deep-sanitized. MAX_LOG_ARGS is 5.",
          "items": {}
        },
        "route": {
          "type": "string",
          "maxLength": 300,
          "description": "Omitted when the route is 'unknown'."
        },
        "pageLoadId": {
          "type": "string",
          "description": "Correlates log records with error records from the same page load; the two live in separate databases."
        },
        "environment": { "$ref": "#/$defs/logEnvironment" },
        "timestamp": { "type": "integer" },
        "seq": {
          "type": "integer",
          "description": "Per-page-load monotonic counter giving deterministic ordering within one millisecond."
        }
      }
    }
  }
}
```

### 2.2 Deliberate looseness

A few things the schema does **not** pin down, on purpose:

- `records` is `oneOf` two shapes rather than a discriminated union, because records are `unknown[]`
  on the wire and a server is expected to branch on `kind` from the envelope anyway.
- `extra` and `data` are open. They are bounded by the sanitizer (depth 4, 30 keys, 20 items,
  2000 characters per string, 16 384 / 4096 bytes per record) but their _shape_ is application data.
- Timestamps are plain integers. They come from `Date.now()` on the client, so clock skew is
  possible; treat them as advisory ordering, not as authoritative audit timestamps.
- `uploadStatus` is included and is usually `"uploading"` â€” the row was claimed immediately before
  sending. A server that stores the record verbatim and later re-serves it should be aware of the
  field rather than surprised by it.

---

## 3. Worked request and response

```bash
curl -i -X POST 'https://api.example.com/telemetry/errors' \
  -H 'Content-Type: application/json' \
  -H 'Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.payload.signature' \
  -H 'X-Request-Id: 4f1c9a2e-9a11-4a63-9c1e-7a8f2d5b6e30' \
  --data @- <<'JSON'
{
  "schemaVersion": 1,
  "kind": "errors",
  "sentAt": 1759482901123,
  "app": {
    "appName": "checkout",
    "appVersion": "2.4.1",
    "buildId": "8f3c2ab",
    "environment": "production"
  },
  "records": [
    {
      "schemaVersion": 1,
      "id": "f47ac10b-58cc-4372-a567-0e02b2c3d479",
      "fingerprint": "3f9a1c2b7d4e01f5b6c7d8e9a0b1",
      "uploadStatus": "uploading",
      "uploadAttempts": 1,
      "claimedAt": 1759482901000,
      "source": "window",
      "severity": "error",
      "category": "runtime",
      "handled": false,
      "thrownType": "error",
      "name": "TypeError",
      "message": "Cannot read properties of undefined (reading 'total')",
      "stack": "TypeError: Cannot read properties of undefined (reading 'total')\n    at total (/assets/checkout-8f3c2ab.js:1:48213)\n    at render (/assets/vendor-2b91f0c.js:1:12044)",
      "page": {
        "url": "/checkout?step=[REDACTED]",
        "route": "/checkout?step=[REDACTED]",
        "pageLoadId": "9c1f4e7a-3d21-4c88-b0aa-2f6e5d1c8b47"
      },
      "environment": {
        "appName": "checkout",
        "appVersion": "2.4.1",
        "buildId": "8f3c2ab",
        "environment": "production",
        "userAgent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0.0.0 Safari/537.36",
        "platform": "MacIntel",
        "viewport": "1512x823",
        "online": true,
        "visibilityState": "visible"
      },
      "tags": { "flow": "checkout" },
      "timestamp": 1759482900000,
      "firstSeen": 1759482900000,
      "lastSeen": 1759482901500,
      "occurrenceCount": 3
    }
  ]
}
JSON
```

The success response can be as small as a status line:

```http
HTTP/1.1 202 Accepted
Date: Fri, 03 Oct 2026 07:55:01 GMT
Content-Length: 0
```

A throttling response, on the other hand, should say how long to wait:

```http
HTTP/1.1 429 Too Many Requests
Retry-After: 120
Content-Type: application/json

{"error":"rate_limited","retryAfterSeconds":120}
```

logVault will not read that body. It reads `Retry-After: 120`, computes 120 000 ms, clamps it to the
900 000 ms ceiling, takes `max(backoffDelay(failures), 120000)`, returns the batch to `pending`, and
schedules the next run. Since `backoffDelay(1)` is 15 000 ms, the server's 120 s wins.

And a terminal response:

```http
HTTP/1.1 413 Payload Too Large
Content-Type: text/plain

batch exceeds the 256 KiB limit
```

`413` is in `TERMINAL_STATUSES`, so those records are marked `failed` and stop consuming retry
budget. The `onTerminalFailure` callback fires with `(413, [{ id: 'f47ac10b-â€¦' }])`.

### A log batch

```json
{
  "schemaVersion": 1,
  "kind": "logs",
  "sentAt": 1759482960440,
  "app": {
    "appName": "checkout",
    "appVersion": "2.4.1",
    "buildId": "8f3c2ab",
    "environment": "production"
  },
  "records": [
    {
      "schemaVersion": 1,
      "id": "b2c3d4e5-f6a7-4b8c-9d0e-1f2a3b4c5d6e",
      "uploadStatus": "uploading",
      "uploadAttempts": 1,
      "claimedAt": 1759482960000,
      "level": "warn",
      "message": "[Checkout] payment retrying",
      "data": [{ "attempt": 2, "provider": "stripe" }],
      "route": "/checkout",
      "pageLoadId": "9c1f4e7a-3d21-4c88-b0aa-2f6e5d1c8b47",
      "environment": {
        "appName": "checkout",
        "appVersion": "2.4.1",
        "buildId": "8f3c2ab",
        "environment": "production"
      },
      "timestamp": 1759482959120,
      "seq": 42
    }
  ]
}
```

---

## 4. Status handling

`classifyResponse(status)` is three lines:

```ts
if (status >= 200 && status < 300) return 'ok';
if (TERMINAL_STATUSES.has(status)) return 'terminal';
return 'retryable';
```

`TERMINAL_STATUSES` is a closed set:

```ts
new Set([400, 401, 403, 404, 405, 410, 413, 415, 422]);
```

| Status                                                                          | Outcome     | Records             | Notes                                                                                                                 |
| ------------------------------------------------------------------------------- | ----------- | ------------------- | --------------------------------------------------------------------------------------------------------------------- |
| `200` `201` `202` `204`                                                         | `ok`        | **Deleted** locally | The delete happens only after the 2xx. Respond `204` or `202` with an empty body if you have nothing to say.          |
| `400 Bad Request`                                                               | `terminal`  | `failed`            | The batch is malformed. Fix the server or the schema â€” retrying sends the same bytes.                                 |
| `401 Unauthorized`                                                              | `terminal`  | `failed`            | Deliberately terminal so a batch stops consuming retry budget. Call `retryFailedTelemetry()` after re-authenticating. |
| `403 Forbidden`                                                                 | `terminal`  | `failed`            |                                                                                                                       |
| `404 Not Found`                                                                 | `terminal`  | `failed`            | The endpoint is probably wrong. Check `resolveEndpoint`.                                                              |
| `405 Method Not Allowed`                                                        | `terminal`  | `failed`            | The route exists but does not accept `POST`.                                                                          |
| `408 Request Timeout`                                                           | `retryable` | `pending`           | The server-side timeout means try again, not give up.                                                                 |
| `410 Gone`                                                                      | `terminal`  | `failed`            |                                                                                                                       |
| `413 Payload Too Large`                                                         | `terminal`  | `failed`            | Lower `rest.batchSize` or `errors.maxPayloadBytes`; retrying the same batch will fail identically.                    |
| `415 Unsupported Media Type`                                                    | `terminal`  | `failed`            | The server does not accept `application/json`.                                                                        |
| `422 Unprocessable Entity`                                                      | `terminal`  | `failed`            | Validation rejected the batch.                                                                                        |
| `429 Too Many Requests`                                                         | `retryable` | `pending`           | Send `Retry-After` (it is honoured on any retryable status, not only this one).                                       |
| Any `5xx`                                                                       | `retryable` | `pending`           | A server bug is not the client's fault.                                                                               |
| Network error, DNS failure, TLS failure, offline                                | `retryable` | `pending`           | `send()` rejects; the sync manager catches, requeues and backs off.                                                   |
| Timeout / abort after 10 s                                                      | `retryable` | `pending`           | The `AbortController` fires and the transport rejects.                                                                |
| Status `0`                                                                      | `retryable` | `pending`           | "Never reached the server."                                                                                           |
| Anything else (`402`, `406`, `409`, `418`, `451`, `1xx`, `3xx` after redirects) | `retryable` | `pending`           | Only the three rules above are applied.                                                                               |

### Why `401` is terminal

Retrying a `401` forever would burn the entire retry budget on a condition the client cannot fix
without new credentials. Marking the batch `failed` frees the outbox, and `onTerminalFailure` is the
signal:

```ts
initTelemetry({
  appName: 'checkout',
  rest: {
    errorsUrl: '/telemetry/errors',
    onTerminalFailure: async (status, records) => {
      if (status === 401) {
        await refreshSession();
        await retryFailedTelemetry(); // requeues; also clears the backoff
      }
    },
  },
});
```

### Why a throwing `getHeaders` is retryable

`rest.getHeaders()` is awaited per request so tokens can be refreshed. If it throws â€” the refresh
call itself failed, the token store is unavailable â€” the batch goes back to `pending` and the run
stops. That is explicitly **not** terminal, because the header provider is expected to succeed once
the session is restored.

---

## 5. `Retry-After`

```ts
export function parseRetryAfter(value: string | null | undefined): number | undefined {
  if (typeof value !== 'string') return undefined;
  const trimmed = value.trim();
  if (trimmed.length === 0) return undefined;

  // Delta-seconds form.
  if (/^\d+$/.test(trimmed)) {
    const seconds = Number.parseInt(trimmed, 10);
    if (!Number.isFinite(seconds)) return undefined;
    return Math.min(Math.max(seconds * 1_000, 0), BACKOFF_MAX_MS);
  }

  // HTTP-date form.
  const timestamp = Date.parse(trimmed);
  if (!Number.isFinite(timestamp)) return undefined;
  return Math.min(Math.max(timestamp - Date.now(), 0), BACKOFF_MAX_MS);
}
```

| Header value                       | Result                                                    |
| ---------------------------------- | --------------------------------------------------------- |
| `120`                              | `120000`                                                  |
| `0`                                | `0`                                                       |
| `999999`                           | `900000` (clamped to `BACKOFF_MAX_MS`)                    |
| `Wed, 21 Oct 2026 07:28:00 GMT`    | milliseconds until that instant, clamped to `[0, 900000]` |
| A date in the past                 | `0`                                                       |
| `garbage`, ``, or a missing header | `undefined` â€” plain backoff applies                       |

Semantics worth knowing:

1. **Any status can carry it.** The transport parses `Retry-After` regardless of the response status.
   It is only _used_ when the run fails, so sending it on a `200` is harmless.
2. **It never shortens the wait.** `schedule(Math.max(backoffDelay(failures), retryAfterMs))`. A
   server asking for 1 second during a 15-minute backoff still waits 15 minutes.
3. **It never exceeds the ceiling.** 900 000 ms, 15 minutes, is the maximum this library will ever
   wait on its own.
4. **It is per run, not per record kind.** When both an error batch and a log batch fail in the same
   run, the largest hint wins (`hint = Math.max(hint, outcome.retryAfterMs)`).
5. **It does not clear on success alone.** A successful run resets `failures` to 0 and
   `retryAfterMs` to 0, and the steady `rest.intervalMs` resumes.

---

## 6. Server obligations

### 6.1 Accept durably before returning 2xx

logVault **deletes the local rows as soon as it sees a 2xx**. There is no follow-up confirmation,
no receipt endpoint and no local copy afterwards. If the server responds `202 Accepted` and then
loses the data â€” an in-memory queue that is dropped on restart, an un-awaited write, a rollback
after the response was flushed â€” that data is gone from both sides.

The 2xx must therefore mean _"durably accepted"_, not _"received"_:

```text
correct:   receive â†’ validate â†’ write to durable storage â†’ commit â†’ respond 202
incorrect: receive â†’ validate â†’ respond 202 â†’ enqueue asynchronously
```

If the write fails, respond `5xx` and logVault will retry with backoff. A `5xx` costs one retry; a
false `202` costs the record.

### 6.2 Tolerate duplicate `id`s

Delivery is **at least once**, by construction:

1. `claimPending` marks rows `uploading`.
2. The request is sent.
3. The server commits.
4. The response is lost â€” connection reset, proxy timeout, a `pagehide` racing the socket, the user
   closing the tab.
5. The transport rejects or the status is unreadable, so the rows go back to `pending`.
6. The next run sends them again.

Every one of those steps is a normal outcome, not an edge case, so the server must treat a repeated
`id` as the same record.

### 6.3 Be idempotent on `id`

The `id` is generated at ingestion by `newId()`, is part of the persisted row, and is **never
regenerated across retries**. It is stable for the lifetime of the record. That makes it the
natural idempotency key.

Recommended: a unique constraint (or a unique index) on `id` per record kind, with a
conflict-ignore or upsert write:

```sql
CREATE TABLE telemetry_records (
  id           TEXT PRIMARY KEY,
  kind         TEXT NOT NULL CHECK (kind IN ('errors', 'logs')),
  app_name     TEXT NOT NULL,
  environment  TEXT NOT NULL,
  received_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  payload      JSONB NOT NULL
);
```

```sql
INSERT INTO telemetry_records (id, kind, app_name, environment, payload)
VALUES ($1, $2, $3, $4, $5)
ON CONFLICT (id) DO NOTHING;
```

An alternative worth considering: `ON CONFLICT (id) DO UPDATE` when the incoming
`occurrenceCount` is higher. An error record that was retried after further aggregation merges
locally can legitimately carry a larger count than the copy the server already has â€” but note that
aggregation only ever touches `pending` rows, so a row that has been claimed for upload is frozen.
Two deliveries of the same `id` therefore carry identical payloads in practice, and `DO NOTHING` is
sufficient.

Do **not** use `fingerprint` as the idempotency key. Different records can share a fingerprint â€”
that is the point of a fingerprint â€” and error aggregation is a client concern.

### 6.4 Respond quickly

The per-request abort budget is 10 seconds. A server that holds the connection open without
responding (a synchronous fan-out to five downstream services, a lock held during a long
transaction) will be aborted, the records will be requeued, and the same batch will be retried.
Accept and acknowledge fast; do the fan-out after the commit.

### 6.5 CORS

The library posts from the page origin, so a cross-origin endpoint needs:

```http
Access-Control-Allow-Origin: https://app.example.com
Vary: Origin
Access-Control-Allow-Methods: POST, OPTIONS
Access-Control-Allow-Headers: Content-Type, Authorization, X-Request-Id, X-Correlation-Id, X-Trace-Id, Traceparent
Access-Control-Max-Age: 600
```

Notes:

- `Content-Type: application/json` makes the request non-simple, so the preflight `OPTIONS` is
  mandatory. If the route returns `405` to `OPTIONS`, the browser reports a CORS failure and no
  `POST` is ever attempted.
- If you use `rest.getHeaders()` to add `Authorization`, it must be in
  `Access-Control-Allow-Headers`.
- `rest.credentials` defaults to `'same-origin'`, which means no cookies go cross-origin and
  `Access-Control-Allow-Origin` does **not** need `Access-Control-Allow-Credentials` unless you
  explicitly set `credentials: 'include'`. If you do, `*` is illegal â€” the origin must be echoed.
- Exposing `Retry-After` requires `Access-Control-Expose-Headers: Retry-After`. Without it the
  header is invisible to JavaScript and the client falls back to plain exponential backoff, which
  still works but ignores your hint.

---

## 7. Minimal server implementations

Both examples parse the envelope, validate it, write it durably with an idempotent upsert, and only
then respond â€” the order matters.

### Express

```ts
// server/telemetry.ts
import express, { type Request, type Response } from 'express';
import { Pool } from 'pg';

const pool = new Pool({ connectionString: process.env.DATABASE_URL });
const app = express();

// The batch can be large; give the JSON parser room, but cap it.
app.use('/telemetry', express.json({ limit: '2mb' }));

interface BatchBody {
  schemaVersion: number;
  kind: 'errors' | 'logs';
  sentAt: number;
  app: { appName: string; appVersion: string; buildId: string; environment: string };
  records: { id: string; [key: string]: unknown }[];
}

function isBatchBody(value: unknown): value is BatchBody {
  if (value === null || typeof value !== 'object') return false;
  const body = value as Partial<BatchBody>;
  if (body.schemaVersion !== 1) return false;
  if (body.kind !== 'errors' && body.kind !== 'logs') return false;
  if (!Array.isArray(body.records)) return false;
  if (body.app === null || typeof body.app !== 'object') return false;
  return body.records.every(
    (record) => record !== null && typeof record === 'object' && typeof record.id === 'string',
  );
}

async function accept(kind: 'errors' | 'logs', body: BatchBody): Promise<void> {
  if (body.records.length === 0) return;
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    for (const record of body.records) {
      await client.query(
        `INSERT INTO telemetry_records (id, kind, app_name, environment, payload)
         VALUES ($1, $2, $3, $4, $5)
         ON CONFLICT (id) DO NOTHING`,
        [record.id, kind, body.app.appName, body.app.environment, JSON.stringify(record)],
      );
    }
    // Commit before responding: a 2xx means the data is durable.
    await client.query('COMMIT');
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

async function handler(kind: 'errors' | 'logs', req: Request, res: Response): Promise<void> {
  const body: unknown = req.body;

  if (!isBatchBody(body)) {
    // 422 is terminal in logVault: the batch stops consuming retry budget.
    res.status(422).json({ error: 'invalid_batch' });
    return;
  }

  if (kind === 'errors' && body.kind !== 'errors') {
    res.status(400).json({ error: 'kind_mismatch' });
    return;
  }

  try {
    await accept(kind, body);
  } catch (error) {
    // 5xx is retryable: the client backs off and sends the batch again.
    req.log?.error?.(error);
    res.status(503).json({ error: 'storage_unavailable' });
    return;
  }

  res.status(202).json({ accepted: body.records.length });
}

app.post('/telemetry/errors', (req, res) => void handler('errors', req, res));
app.post('/telemetry/logs', (req, res) => void handler('logs', req, res));

// Optional: a simple token-bucket throttle that speaks Retry-After.
app.use('/telemetry', (req, res, next) => {
  const retryAfterSeconds = currentThrottleDelaySeconds(req);
  if (retryAfterSeconds > 0) {
    res.setHeader('Retry-After', String(retryAfterSeconds));
    res.status(429).json({ error: 'rate_limited' });
    return;
  }
  next();
});

export { app };
```

Two details in that example are load-bearing. The commit happens **before** the response, so a
`202` cannot be a lie. And the preflight is handled by `express.json()` plus CORS middleware placed
before the routes (not shown, to keep the example focused) â€” without it the browser never sends the
`POST`.

### Fastify

```ts
// server/telemetry-fastify.ts
import Fastify from 'fastify';
import { Pool } from 'pg';

const pool = new Pool({ connectionString: process.env.DATABASE_URL });
const app = Fastify({ logger: true, bodyLimit: 2 * 1024 * 1024 });

interface BatchBody {
  schemaVersion: number;
  kind: 'errors' | 'logs';
  sentAt: number;
  app: { appName: string; appVersion: string; buildId: string; environment: string };
  records: { id: string; [key: string]: unknown }[];
}

const recordSchema = {
  type: 'object',
  required: ['id'],
  properties: { id: { type: 'string', minLength: 1 } },
  additionalProperties: true,
} as const;

const batchSchema = {
  type: 'object',
  required: ['schemaVersion', 'kind', 'sentAt', 'app', 'records'],
  additionalProperties: false,
  properties: {
    schemaVersion: { const: 1 },
    kind: { enum: ['errors', 'logs'] },
    sentAt: { type: 'integer' },
    app: {
      type: 'object',
      required: ['appName', 'appVersion', 'buildId', 'environment'],
      properties: {
        appName: { type: 'string' },
        appVersion: { type: 'string' },
        buildId: { type: 'string' },
        environment: { type: 'string' },
      },
      additionalProperties: false,
    },
    records: { type: 'array', items: recordSchema },
  },
} as const;

async function handle(
  this: unknown,
  kind: 'errors' | 'logs',
  request: { body: BatchBody; log: { error: (error: unknown) => void } },
  reply: {
    code: (status: number) => { send: (payload: unknown) => unknown };
    header: (k: string, v: string) => unknown;
  },
) {
  const body = request.body;

  if (kind === 'errors' && body.kind !== 'errors') {
    return reply.code(400).send({ error: 'kind_mismatch' });
  }

  if (body.records.length === 0) return reply.code(202).send({ accepted: 0 });

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    for (const record of body.records) {
      await client.query(
        `INSERT INTO telemetry_records (id, kind, app_name, environment, payload)
         VALUES ($1, $2, $3, $4, $5)
         ON CONFLICT (id) DO NOTHING`,
        [record.id, kind, body.app.appName, body.app.environment, JSON.stringify(record)],
      );
    }
    await client.query('COMMIT');
  } catch (error) {
    await client.query('ROLLBACK');
    request.log.error(error);
    return reply.code(503).send({ error: 'storage_unavailable' });
  } finally {
    client.release();
  }

  return reply.code(202).send({ accepted: body.records.length });
}

// Fastify's schema validation returns 400 by default, which is terminal in logVault.
// That is correct here: a batch that fails validation is malformed, not transient.
app.post('/telemetry/errors', { schema: { body: batchSchema } }, function (request, reply) {
  return handle.call(this, 'errors', request as never, reply as never);
});

app.post('/telemetry/logs', { schema: { body: batchSchema } }, function (request, reply) {
  return handle.call(this, 'logs', request as never, reply as never);
});

// A Retry-After on the throttle response is respected and clamped to 15 minutes.
app.addHook('onRequest', async (request, reply) => {
  const retryAfterSeconds = await currentThrottleDelaySeconds(request);
  if (retryAfterSeconds > 0) {
    await reply
      .header('Retry-After', String(retryAfterSeconds))
      .code(429)
      .send({ error: 'rate_limited' });
  }
});

export { app };
```

Fastify's default `400` for a schema violation is exactly the outcome logVault wants: it is in
`TERMINAL_STATUSES`, so the records are marked `failed` and stop being resent. Contrast that with
the Express example, which deliberately uses `422` for the same purpose â€” both are terminal, and
either is fine.

---

## 8. Reference client behaviour

For a server engineer debugging an integration, this is what the client does with every response:

```text
POST /telemetry/errors
  â”‚
  â”œâ”€ transport threw (network, abort, timeout, no fetch)
  â”‚     â†’ requeue ids to 'pending'
  â”‚     â†’ failures += 1
  â”‚     â†’ schedule(max(backoffDelay(failures), retryAfterMs))
  â”‚
  â””â”€ transport resolved with a status
        â”œâ”€ 2xx  â†’ delete ids
        â”‚         failures = 0, lastSync = now, schedule(rest.intervalMs)
        â”‚
        â”œâ”€ 400|401|403|404|405|410|413|415|422
        â”‚     â†’ mark ids 'failed'
        â”‚     â†’ rest.onTerminalFailure(status, ids)
        â”‚     â†’ failures += 1, status = 'error'
        â”‚     â†’ schedule(backoffDelay(failures))
        â”‚
        â””â”€ anything else
              â†’ requeue ids to 'pending'
              â†’ failures += 1, status = 'retry'
              â†’ schedule(max(backoffDelay(failures), retryAfterMs))
```

At most 10 batches are attempted per run (`MAX_BATCHES_PER_FLUSH`) and both kinds are interleaved,
one batch of each per loop iteration. A run stops as soon as a failure occurs, a kind has nothing
left to claim, or the browser reports itself offline.

---

## 9. Contract summary

| Guarantee                          | Value                                                                        |
| ---------------------------------- | ---------------------------------------------------------------------------- |
| Delivery semantics                 | At least once                                                                |
| Idempotency key                    | Record `id`                                                                  |
| Duplicate tolerance required       | Yes â€” assume it                                                              |
| Durable accept before 2xx required | Yes â€” the client deletes on 2xx                                              |
| Response body read                 | Never                                                                        |
| Success statuses                   | Any `2xx`                                                                    |
| Terminal statuses                  | `400, 401, 403, 404, 405, 410, 413, 415, 422`                                |
| Retryable statuses                 | Everything else non-2xx, plus network errors and timeouts                    |
| Backoff                            | `min(15000 * 2^(failures-1), 900000)` ms                                     |
| `Retry-After`                      | Honoured on any status, clamped to `[0, 900000]`, never shortens the backoff |
| Request timeout                    | 10 000 ms per request                                                        |
| Max batch size                     | `rest.batchSize`, default 50 records                                         |
| Max batches per run                | 10                                                                           |
| Steady interval after success      | `rest.intervalMs`, default 30 000 ms                                         |
| Record byte budget                 | 16 384 bytes per error, 4096 per log (before sending)                        |
