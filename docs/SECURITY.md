# Security

A browser library that records errors, ships them to a server and hands out a download is a
security-relevant component. It reads from the page, it writes to disk, it makes network requests,
and it produces a file an end user emails to someone. This document is the honest account of what
protects what, what does not, and how to report a problem.

The library is small on purpose. Almost every security property below comes from a structural
decision — one sanitizer, one egress path, one place that touches `console` — rather than from a
check that could be forgotten.

---

## 1. Scope and threat model

### 1.1 Assets

| Asset                               | Where it lives                                                        | Why an attacker wants it                                                                             |
| ----------------------------------- | --------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------- |
| **PII in log messages and `extra`** | IndexedDB `rm-logvault-logs` / `rm-logvault-errors`                         | Names, e-mails, order ids, free-text the app logged.                                                 |
| **Credentials in URLs and headers** | Error records (`page.url`, `api.url`, `api.requestId`)                | Access tokens appear in query strings and `Authorization` headers far more often than anyone admits. |
| **The diagnostics report**          | A `.html` or `.json` file on disk, and whatever the user does with it | Self-contained, human-readable, and frequently e-mailed to a shared support inbox.                   |
| **The upload endpoint**             | Network                                                               | An exfiltration channel. If it can be pointed somewhere hostile, records leave the device.           |
| **The host page**                   | The DOM                                                               | The report is rendered HTML. A record must never be able to become markup.                           |
| **Storage quota**                   | IndexedDB                                                             | A hostile or buggy log source can fill it and break the application's own persistence.               |

### 1.2 Adversaries

1. **A curious or careless support engineer.** Receives the report. May paste it into a ticket
   tracker, a chat or a shared drive. The privacy banner exists for this adversary, not for an
   attacker.
2. **A shared or public computer.** The vault persists between sessions. `clearTelemetryData()`
   exists for this adversary.
3. **An XSS payload.** Controls record content — a message, a URL, a tag, an `extra` field — and
   tries to turn the diagnostics report into script execution, or to break out of the embedded JSON
   script element.
4. **A hostile or compromised log source.** An application (or a dependency) that logs attacker-
   chosen content, or throws objects designed to break the pipeline: throwing getters, Proxies,
   circular graphs, `AggregateError` bombs, `__proto__` keys.
5. **A network attacker.** Intercepts or rewrites uploads. Mitigated by `requireHttps` and by the
   platform's TLS; not mitigated by anything this library implements.
6. **A supply-chain attacker.** Compromised npm credentials, a typosquatted package name, a
   malicious transitive dependency, or a malicious update. Mitigated by having no dependencies and
   by provenance attestation.

### 1.3 Non-goals

- **Confidentiality of the report at rest.** The report is plain text. If the machine is
  compromised, the report is readable. There is no at-rest encryption (it is on the roadmap as an
  opt-in).
- **Authentication of the client.** A record's `appName` is whatever the application says it is. The
  server must authenticate the caller if it cares.
- **Data-loss prevention.** Anyone with DevTools access can read the databases directly. The
  shortcut is a convenience, not a boundary (see §7).
- **Protecting the application from a malicious library.** The library runs in the page and could do
  anything. What it _does_ do is enumerated below.
- **Symbolication or source-map security.** There are no source maps involved.
- **Cookie, session or authentication security.** The library never touches them.

---

## 2. Redaction design

Redaction is not a filter applied at the end. It is the only path into storage: every record passes
through the sanitizer **before** it is written to IndexedDB, and again **before** it is exported or
uploaded. `src/errors/sanitize.ts` is described in its own JSDoc as the library's security boundary,
and it is.

### 2.1 Three invariants

Under all inputs, including hostile ones:

1. **Never throws.** Any internal exception degrades to `[REDACTED]` for text or `[Unserializable]`
   for values. The library fails closed, not open.
2. **Bounded work.** Input is hard-truncated to `HARD_TEXT_CAP` (20 000 characters) before any
   regular expression runs, and depth/keys/array-length are capped. A 5 MB message cannot hang a tab,
   and no pattern can be driven into catastrophic backtracking.
3. **Bounded, JSON-safe output.** The result of `sanitizeValue` is always structured-cloneable and
   `JSON.stringify`-safe.

### 2.2 What is redacted, and how

| Rule                    | Mechanism                                                                                                                                                                                                                                                                     | Example                                                                                       |
| ----------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------- |
| **Sensitive keys**      | `SENSITIVE_KEY_PATTERN` tested against the lowercased key with `[-_\s]` stripped                                                                                                                                                                                              | `access-token`, `accessToken`, `ACCESS TOKEN` → all normalise to `accesstoken` → `[REDACTED]` |
| **JWTs**                | `JWT_PATTERN` = `/\beyJ[\w-]{5,}\.[\w-]{5,}\.[\w-]*/g`                                                                                                                                                                                                                        | `eyJhbGciOi….eyJzdWIi….SflKxwRJ` → `[REDACTED]`                                               |
| **Auth schemes**        | `AUTH_SCHEME_PATTERN` = `/\b(Bearer\|Basic\|Token)\s+[\w.~+/=-]{6,}/gi`, replaced with `'$1 [REDACTED]'`                                                                                                                                                                      | `Authorization: Bearer abc123xyz` → `Authorization: Bearer [REDACTED]`                        |
| **`key=value` secrets** | `KV_SECRET_PATTERNS`, four patterns covering `token`/`access_token`/`refresh_token`/`id_token`, `password`/`pwd`/`secret`/`client_secret`, `api_key`/`api-key`/`apikey`/`session`/`sessionid`, and `phone`/`mobile`/`msisdn`/`telephone`/`email`. The separator is preserved. | `?token=abc&page=2` → `?token=[REDACTED]&page=2`, `phone=+1415…` → `phone=[REDACTED]`         |
| **Long opaque tokens**  | `LONG_SECRET_TEXT_PATTERN` = `/(^\|[^\w-])([\w-]{32,200})(?=[^\w-]\|$)/g`, replaced with `'$1[REDACTED]'` — a 32–200 character `[\w-]` run in free text with no `key=value` context. The 200 upper bound keeps prose and serialised structures from being redacted wholesale. | `sk_live_51H8x…` → `[REDACTED]`                                                               |
| **E-mail addresses**    | `EMAIL_PATTERN` = `/[\w.+-]+@[\w-]+(?:\.[\w-]+)+/g`                                                                                                                                                                                                                           | `dev@example.com` → `[REDACTED]`                                                              |
| **URL credentials**     | The URL is rebuilt as `protocol//host` plus a sanitized path and query, so `user:pass@` is dropped by construction rather than by matching                                                                                                                                    | `https://u:p@api.test/x` → `https://api.test/x`                                               |
| **URL fragments**       | Everything from `#` onwards is discarded                                                                                                                                                                                                                                      | `/orders#access_token=…` → `/orders`                                                          |
| **URL query values**    | Rebuilt key by key: a value survives only if its key is allow-listed **and** not sensitive                                                                                                                                                                                    | `?email=a@b.co` → `?email=[REDACTED]`                                                         |
| **Path segments**       | A segment that decodes to an e-mail, starts with `eyJ`, or matches `LONG_SECRET_PATTERN` (`/^[\w-]{32,}$/`) is replaced                                                                                                                                                       | `/invite/dev@example.com` → `/invite/[REDACTED]`                                              |
| **Non-web schemes**     | Anything that is not `http:` or `https:` collapses to `` `${scheme}[REDACTED]` ``; `data:` becomes `data:[REDACTED]`                                                                                                                                                          | `mailto:dev@example.com` → `mailto:[REDACTED]`                                                |
| **Stack cache busters** | `STACK_QUERY_PATTERN` removes `?t=`/`?v=` before the stack is scrubbed                                                                                                                                                                                                        | `/src/App.tsx?t=1712345:12:3` → `/src/App.tsx:12:3`                                           |

The placeholder is always the literal string `[REDACTED]`, exported as `REDACTED`. Using one fixed
placeholder means redaction is **idempotent**: re-running the sanitizer over an already-redacted
value yields the same output, which is what makes the optional `redactAgain` export pass safe.

**Known limitation.** A bare short secret in prose is not detectable. `sanitizeText('failed with
hunter2')` returns `'failed with hunter2'`: a seven-character word is indistinguishable from
ordinary prose, and no pattern can catch it without redacting the message. The documented mitigation
is `redaction.extraPatterns`. This is asserted by `src/errors/sanitize.test.ts`, so the claim above
is not broader than the implementation.

### 2.3 The sensitive-key pattern

```ts
export const SENSITIVE_KEY_PATTERN =
  /(authorization|cookie|token|password|passwd|pwd|secret|apikey|accesskey|privatekey|credential|session|signature|bearer|otp|^auth$|email|phone)/;
```

Note what it does _not_ do:

- It is **unanchored substring matching**, deliberately. A rule that only matched whole keys would
  miss `x-auth-token`, `userEmailAddress`, `stripe_secret_key` and `refreshTokenExpiry`.
- `^auth$` **is** anchored, so `author` and `authorization` are handled differently: `author` does
  not match, `authorization` matches on the `authorization` alternative. The anchoring avoids
  redacting every field whose name merely starts with "auth".
- It is matched against the **normalised** key (`lowercase`, with `[-_\s]` removed), so case and
  separators cannot be used to evade it.

### 2.4 Key names beat values

In `sanitizeValue`'s walker, the sensitive-key check happens **first**:

```ts
// A sensitive KEY wins over whatever the value happens to be.
if (key !== undefined && isSensitiveKey(key)) return REDACTED;
```

A value under a sensitive key is redacted regardless of its type or content. `{ token: 12345 }` and
`{ token: { nested: 'x' } }` are both `[REDACTED]`, not a partially-walked object that might leak a
field the pattern did not anticipate.

`isSensitiveKey` fails **closed** — if the check itself throws (the only realistic cause being a
caller-supplied `RegExp` with a hostile `test`), it returns `true`:

```ts
} catch {
  // Unknown extension behaviour: fail closed.
  return true;
}
```

### 2.5 Query-parameter allow-list

The default allow-list is:

```ts
export const DEFAULT_ALLOWED_QUERY_PARAMS: readonly string[] = [
  'limit',
  'offset',
  'page',
  'pageSize',
  'size',
  'sort',
  'order',
  'scope',
  'lng',
  'lang',
  'type',
];
```

These are the parameters whose _values_ are low-cardinality, non-identifying, and useful for
reproducing a request. Everything else — including any parameter the application adds later — is
redacted by default, which is the correct bias: a new parameter is unknown, and unknown should mean
redacted.

Two guards apply. A value is truncated to `MAX_ALLOWED_QUERY_VALUE_LENGTH` (100 characters), so an
allow-listed parameter cannot become a smuggling channel. And a key must pass `!isSensitiveKey(key)`
even if it is on the list:

```ts
const isAllowedQueryKey = (key: string): boolean => {
  const lower = key.toLowerCase();
  return allowedQueryParams.has(lower) && !isSensitiveKey(key);
};
```

So allow-listing `session` does not un-redact `session`.

### 2.6 Extending redaction

```ts
import { initTelemetry } from '@codewithrajat/rm-logvault';

initTelemetry({
  appName: 'checkout',
  redaction: {
    extraSensitiveKeys: ['x-tenant-id', /^internal/i],
    extraPatterns: [/\bsk_live_[A-Za-z0-9]{16,}\b/g],
    allowedQueryParams: ['page', 'locale', 'currency'],
  },
});
```

Semantics worth knowing before you rely on this:

- A **string** in `extraSensitiveKeys` matches the normalised key **exactly**. `'tenant'` does not
  match `x-tenant-id`; `'x-tenant-id'` does (both normalise to `xtenantid`).
- A **`RegExp`** in `extraSensitiveKeys` is tested against both the raw key and the normalised form.
- `extraPatterns` are applied to free text **after** the built-in rules, so they win. This is the
  escape hatch for a secret shape the built-ins miss.
- `allowedQueryParams` **replaces** the default list rather than adding to it. To extend, spread
  `DEFAULT_ALLOWED_QUERY_PARAMS` yourself.
- Invalid entries (a number, a string in `extraPatterns`, a function) are silently discarded rather
  than throwing. A mistyped rule degrades to no rule.

### 2.7 Hard limits

A record is not merely redacted; it is bounded. Every number below is in
`src/errors/constants.ts`.

| Constant                                                   | Value               | Purpose                                                               |
| ---------------------------------------------------------- | ------------------- | --------------------------------------------------------------------- |
| `HARD_TEXT_CAP`                                            | `20000`             | Characters any regular expression ever runs against. The ReDoS bound. |
| `MAX_DEPTH`                                                | `4`                 | `sanitizeValue` nesting depth.                                        |
| `MAX_KEYS`                                                 | `30`                | Own enumerable keys copied from a plain object or `Map`.              |
| `MAX_ARRAY_ITEMS`                                          | `20`                | Array and `Set` items; the remainder collapses to `[+N]`.             |
| `MAX_STRING_LENGTH`                                        | `2000`              | Sanitised free-text/string value.                                     |
| `MAX_MESSAGE_LENGTH`                                       | `1000`              | Error message, error name, cause messages.                            |
| `MAX_LOG_MESSAGE_LENGTH`                                   | `1000`              | Log message.                                                          |
| `MAX_STACK_LENGTH`                                         | `8000`              | Error stack, per record.                                              |
| `MAX_COMPONENT_STACK_LENGTH`                               | `4000`              | React/Vue/Angular component stack.                                    |
| `MAX_CAUSE_DEPTH`                                          | `3`                 | `cause` chain links normalised into `causes[]`.                       |
| `MAX_AGGREGATE_ERRORS`                                     | `5`                 | Sub-errors read from an `AggregateError`.                             |
| `MAX_TAGS` / `MAX_TAG_KEY_LENGTH` / `MAX_TAG_VALUE_LENGTH` | `20` / `50` / `200` | Tag bag budget.                                                       |
| `MAX_USER_AGENT_LENGTH`                                    | `500`               | `userAgent` in an environment block.                                  |
| `MAX_LOG_ARGS`                                             | `5`                 | Arguments captured per log call.                                      |
| `MAX_ROUTE_LENGTH`                                         | `300`               | Route string.                                                         |
| `MAX_URL_LENGTH`                                           | `2000`              | Sanitised URL.                                                        |
| `MAX_ALLOWED_QUERY_VALUE_LENGTH`                           | `100`               | Allow-listed query value.                                             |
| `PRE_INIT_ERROR_BUFFER_SIZE`                               | `50`                | Errors buffered before init.                                          |
| `errors.maxPayloadBytes`                                   | `16384`             | UTF-8 byte budget per error record.                                   |
| `logs.maxPayloadBytes`                                     | `4096`              | UTF-8 byte budget per log record.                                     |
| `maxEventsPerMinute` / `maxLogsPerMinute`                  | `120` / `600`       | Fixed-window capture rate limits.                                     |

The limits protect three different things: the regular expressions (ReDoS), the origin's storage
quota (a hostile log source cannot fill it), and the report's usability (a 5 MB message is not
evidence).

`UNHANDLED_SOURCES` is also a correctness constant worth naming here, because it drives the
`handled` flag rather than any limit:

```ts
export const UNHANDLED_SOURCES: ReadonlySet<string> = new Set([
  'window',
  'unhandledrejection',
  'resource',
  'chunk',
  'csp',
  'worker',
]);
```

---

## 3. XSS safety of the report, by construction

The diagnostics report is an HTML file that an end user opens, e-mails, and possibly opens from a
shared drive. It embeds untrusted data — error messages, URLs, tag values, `extra` fields, stack
traces — and it is opened in a browser. It must not be able to execute anything.

Three rules make that true.

### 3.1 Record data is never interpolated into markup

It is written **once**, into a single `<script type="application/json">` element, and read back with
`JSON.parse(document.getElementById('diagnostics-data').textContent)`.

The JSON is escaped by `escapeJsonText`:

```ts
export function escapeJsonText(json: string): string {
  return json
    .replace(/</g, '\\u003c')
    .replace(/>/g, '\\u003e')
    .replace(/&/g, '\\u0026')
    .replace(/\u2028/g, '\\u2028')
    .replace(/\u2029/g, '\\u2029');
}
```

Why this is sufficient, precisely:

- **`<` can no longer appear literally**, so the byte sequence `</script>` cannot occur in the
  document, and the script element cannot be terminated early. This is the whole attack: a message
  containing `</script><img src=x onerror=alert(1)>` would otherwise close the script element and
  start a new one.
- **`\u003c` is a valid JSON escape**, so `JSON.parse` returns the original string unchanged. Nothing
  is lost or mangled.
- **`>` and `&` are escaped too**, as defence in depth against an HTML parser's error-recovery
  behaviour in a context nobody anticipated.
- **`U+2028` and `U+2029` are escaped.** These are valid in JSON strings but were historically
  illegal in JavaScript string literals; escaping them keeps the payload safe if it is ever
  re-parsed as script rather than as JSON.

`encodeJsonForHtml(value)` is the convenience wrapper that serialises and escapes. It catches a
`JSON.stringify` failure and emits the literal `null` rather than a partially built document.

### 3.2 The viewer never uses `innerHTML`

Every value reaches the DOM through `textContent` or `document.createElement`. A message containing
`<img onerror=alert(1)>` is rendered as those literal characters in a table cell. There is no
`innerHTML`, no `insertAdjacentHTML`, no `document.write`, and no `eval` — the last two are also
banned repository-wide by ESLint (`no-eval`, `no-implied-eval`, `no-new-func`, `no-script-url`).

The only values interpolated into markup by string concatenation are:

- The document `<title>`, which is `${escapeHtml(title)}` where `title` is derived from `meta.appName`.
- The severity and level `<option>` lists, built from two hard-coded arrays and passed through
  `escapeHtml` anyway.
- The privacy banner, which is a compile-time constant passed through `escapeHtml`.
- The static skeleton: tables, headers, controls.

Even the "constant" strings are escaped, so a future edit that makes one of them dynamic does not
silently introduce an injection.

### 3.3 Nothing is fetched

The report's `<head>` contains:

```html
<meta
  http-equiv="Content-Security-Policy"
  content="default-src 'none'; style-src 'unsafe-inline'; script-src 'unsafe-inline'; img-src data:"
/>
<meta name="referrer" content="no-referrer" />
<meta name="robots" content="noindex, nofollow" />
```

- `default-src 'none'` blocks `connect-src`, `font-src`, `frame-src`, `media-src`, `object-src` and
  `worker-src`. A report cannot phone home even if something in it tried to.
- `img-src data:` allows only inline data URIs — there are none today; the directive exists so that
  a future icon does not silently become a network request.
- `script-src 'unsafe-inline'` is required because the viewer is an inline script in a
  self-contained file. **This is the one directive that is not a security control**, and it is worth
  being honest about: it means the report's XSS safety rests on §3.1, §3.2 and the escaping of every
  interpolated string, not on CSP. The escaping is the control; the CSP is defence in depth for
  everything that is _not_ scripts.
- `referrer: no-referrer` prevents a leak of the file's location if the report ever contains a link.
- `robots: noindex, nofollow` matters because reports are sometimes served from a web root by
  accident.

### 3.4 The privacy banner

Every report carries it, and it is not removable by configuration:

> This report may contain personal data (page URLs, browser details, application messages). Review
> before sharing.

It is the only mitigation for the adversary the library cannot defend against: the person who
receives the file and forwards it somewhere it should not go.

### 3.5 What a report does not contain

- No cookies, no `localStorage` contents, no `sessionStorage` contents.
- No request or response bodies.
- No form values.
- No `Authorization` header value; only the first present correlation header, from a fixed list of
  four names.
- No images, no fonts, no external stylesheets.

---

## 4. Prototype-pollution safety

`sanitizeValue` walks attacker-influenced data. Two defences apply.

**Keys are skipped, and the output is built with `Object.fromEntries`:**

```ts
const FORBIDDEN_KEYS: ReadonlySet<string> = new Set(['__proto__', 'constructor', 'prototype']);

// …in the walker:
const name = names[index];
if (name === undefined || FORBIDDEN_KEYS.has(name)) continue;
// …
// `Object.fromEntries` defines own data properties, so copying a literal
// `__proto__` key cannot mutate any prototype.
return Object.fromEntries(entries);
```

`Object.fromEntries` uses `CreateDataPropertyOrThrow`, which defines an **own data property**. It
does not go through the `[[Set]]` trap and therefore cannot walk the prototype chain. Even a literal
`__proto__` entry would be created as an ordinary own property. The `FORBIDDEN_KEYS` skip is
belt-and-braces on top, and it additionally drops `constructor` and `prototype`, which are the
building blocks of a pollution chain (`constructor.prototype.x = …`).

**Sensible reads never touch the prototype:** `safeGet` reads an own-or-inherited property inside a
`try`/`catch`, but it is applied to values the caller already handed over, and the walker iterates
`Object.keys`, which returns own enumerable keys only. Inherited properties are therefore never
copied into a record.

**Prototypes are not the only hazard, and the walker handles the rest:** throwing getters (each read
is wrapped, and an unreadable key becomes `[Unserializable]`), Proxies (the whole walk is inside a
`try`/`catch` returning `[Unserializable]`), cycles (`WeakSet` → `[Circular]`), and enormous objects
(depth, key and item caps).

**Why ordinary objects rather than null-prototype objects** is decision
[D-012](DECISIONS.md#d-012--sanitizevalue-returns-ordinary-objects-via-objectfromentries). The short
version: null-prototype objects break `spread`, deep-equality assertions and `instanceof`, and
`Object.fromEntries` is already immune to the attack the null prototype would defend against.

**One nuance worth stating.** `redactRecords.ts` builds its intermediate tag bag with
`Object.create(null)`. That object never escapes the function — it is used only to detect an empty
result before reassigning onto the record — so it is not part of the consumer-facing contract.

---

## 5. ReDoS safety

Catastrophic backtracking requires a pattern with nested, ambiguous quantifiers, applied to a long
input. The library removes the second half of that condition globally:

**Every regex runs against text that has already been hard-truncated to `HARD_TEXT_CAP` (20 000
characters).**

```ts
const scrub = (input: string, maxLength: number): string => {
  // Bound the work before any regex runs.
  let text = input.length > HARD_TEXT_CAP ? input.slice(0, HARD_TEXT_CAP) : input;
  // …
};
```

The same bound is applied inside `sanitizer.stack` before the cache-buster pattern runs. Since all
regex execution in the library goes through `scrub` (or through the already-bounded stack path), no
built-in pattern can be fed an input large enough to matter, regardless of the pattern's quality.

Beyond the bound, the built-in patterns are linear by construction:

- `SENSITIVE_KEY_PATTERN` is a single flat alternation of literal words. No nested quantifiers, no
  backreferences.
- `JWT_PATTERN`, `AUTH_SCHEME_PATTERN`, `EMAIL_PATTERN` and `KV_SECRET_PATTERNS` are simple
  character-class runs. The `KV_SECRET_PATTERNS` guards use a negated character class
  (`[^\s&"',;]+`) rather than a lazy quantifier, which is the linear formulation of "everything up to
  the next separator".
- The path and identifier patterns (`DIGITS_ONLY_PATTERN`, `UUID_PATTERN`, `LONG_HEX_PATTERN`,
  `LONG_SECRET_PATTERN`) are anchored with `^…$` and match fixed shapes or single character classes.
  `LONG_SECRET_TEXT_PATTERN` is bounded instead: a fixed-width `[\w-]{32,200}` run with a captured
  leading separator and a trailing lookahead, which is linear over the already-truncated input.
- `CHUNK_ERROR_PATTERN` is an alternation of literal phrases with `i` — no quantifiers over groups.
- All `/g` patterns are executed through `replaceAll` or `testRe` helpers, which reset `lastIndex`
  before and after. That is a correctness measure (a stale `lastIndex` produces silently skipped
  matches) rather than a security one, but it is the same class of bug.

**Caller-supplied patterns are the caller's responsibility.** `redaction.extraPatterns` and a
`RegExp` in `redaction.extraSensitiveKeys` are executed against the same 20 000-character-bounded
text, which caps the blast radius, but a pathological pattern can still be slow within that budget —
or can throw. A throwing `test` fails **closed** (the key is treated as sensitive), and a throwing
`replace` degrades the whole text to `[REDACTED]`, because `scrub`'s caller catches. Neither can
break the application, but both can degrade output.

Recommendation: do not accept `extraPatterns` from configuration files, query strings or any other
untrusted input. They are a build-time constant, like a regex in application source.

---

## 6. Network egress: the only requests are the configured ones

### 6.1 The single egress point

`createFetchTransport` in `src/sync/remoteTransport.ts` is the only code in the package that performs
network I/O. Its JSDoc states the guarantee: _"This is the library's **only** network egress."_

There are exactly three ways a request is made:

1. The default `fetch` transport, `POST`ing to `rest.errorsUrl` or `rest.logsUrl`.
2. A consumer-supplied `RemoteTransport`, which is by definition the consumer's code.
3. The `@codewithrajat/rm-logvault/fetch` adapter, which only _wraps_ the application's existing `fetch` calls; it never
   initiates one.

There are no CDN imports, no `new Image()`, no `<link rel=preload>`, no font fetches, no
analytics beacons, no `navigator.sendBeacon` (it is on the roadmap, not in 0.1.0), no WebSocket, no
`EventSource`, no service worker registration, and no `import()` of a remote module. A Content
Security Policy of `connect-src 'self'` is sufficient for a same-origin endpoint, and
`default-src 'none'` blocks everything else.

### 6.2 Endpoint validation as an allow-list

`resolveEndpoint(raw, requireHttps)` runs once per endpoint, at initialization, and rejects anything
that is not a web URL:

```ts
/** Schemes that must never be accepted as a telemetry endpoint. */
const FORBIDDEN_SCHEMES = /^(javascript|data|vbscript|file|blob|about|chrome|chrome-extension):/i;

/** Hostnames for which plain `http:` is tolerated even under `requireHttps`. */
const LOCAL_HOSTNAMES: ReadonlySet<string> = new Set([
  'localhost',
  '127.0.0.1',
  '::1',
  '[::1]',
  '0.0.0.0',
]);
```

| Input                                                      | Result                                           | Why it matters                                                  |
| ---------------------------------------------------------- | ------------------------------------------------ | --------------------------------------------------------------- |
| `javascript:alert(1)`                                      | rejected                                         | Blocks the "endpoint is a script URL" class of attack outright. |
| `data:text/html,…`                                         | rejected                                         |                                                                 |
| `blob:`, `file:`, `about:`, `chrome:`, `chrome-extension:` | rejected                                         | Blocks extension- and filesystem-origin exfiltration.           |
| `//evil.test/x` (protocol-relative)                        | resolved against the page origin, then validated | Cannot be used to switch origins without an explicit scheme.    |
| `/telemetry/errors`                                        | resolved against `window.location.href`          | Same-origin by construction.                                    |
| `http://api.test/x` with `requireHttps: true`              | rejected                                         |                                                                 |
| `http://localhost:3000/x` with `requireHttps: true`        | accepted                                         | Development.                                                    |
| A relative URL outside a browser                           | rejected                                         | No `location.href` to resolve against; this is the SSR case.    |

A rejected endpoint makes that record kind local-only. It does not throw and it does not fall back to
some other URL. `isSyncConfigured(resolveOptions(options))` tells you at startup whether anything
survived.

### 6.3 Credentials are never implicitly sent

`rest.credentials` defaults to `'same-origin'`. It is never `'include'` unless the application
explicitly sets it, and the option resolver validates the value against the closed union
`{'omit', 'same-origin', 'include'}`, falling back to `'same-origin'` for anything else:

```ts
credentials:
  restIn.credentials === 'omit' ||
  restIn.credentials === 'same-origin' ||
  restIn.credentials === 'include'
    ? restIn.credentials
    : DEFAULT_OPTIONS.rest.credentials,
```

Consequences: no cookies are attached to a cross-origin request by default, and the server does not
need `Access-Control-Allow-Credentials` for the default configuration. If an application sets
`'include'`, it should also set `requireHttps: true` — the library does not force that pairing, but
it is the right one.

### 6.4 Headers come only from the allow-listed provider

`TransportRequest.headers` is exactly what `rest.getHeaders()` returned, awaited per request. The
transport adds `Content-Type: application/json` and passes the rest through. It never enumerates
`document.cookie`, never reads a `<meta>` tag, and never consults a `<link rel=csrf>` — the
application supplies its own CSRF token through `getHeaders` if it needs one.

A `getHeaders()` that throws is treated as a **retryable** failure: the batch returns to `pending`,
the run stops, and the backoff applies. It is explicitly not terminal, because a failed token refresh
is transient.

### 6.5 The fetch adapter closes the loop

`@codewithrajat/rm-logvault/fetch` wraps `globalThis.fetch` and must not capture its own uploads, or a failing upload
would produce an error that schedules another upload. It skips a URL when:

```ts
function isTelemetryUrl(url: string): boolean {
  const normalized = absolutize(url) ?? url;
  if (skippedUrls.has(normalized)) return true;

  const options = getState().options;
  if (options === null) return false;
  const { errorsUrl, logsUrl } = resolveEndpoints(options);
  return (
    (errorsUrl !== undefined && absolutize(errorsUrl) === normalized) ||
    (logsUrl !== undefined && absolutize(logsUrl) === normalized)
  );
}
```

`registerTelemetryUrl(url)` exists for a custom transport that posts somewhere else. Without it, a
custom transport's failures can be captured as application errors.

---

## 7. The shortcut is obscurity, not access control

The Ctrl+Shift+Alt+D download is documented this way in the source, and it is worth repeating here
verbatim: _"It is obscurity, not access control. The report contains only data already stored locally
on that machine, and that data is already sanitized. Anyone who knows the shortcut can produce a
report; if that is unacceptable, gate it with `allow()`."_

What the shortcut actually enforces:

| Property                     | Implementation                                                                                                                                             |
| ---------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Does not fire while typing   | `isEditableTarget()` refuses `<input>`, `<textarea>`, `<select>`, `[contenteditable=""]`, `[contenteditable="true"]`, `[contenteditable="plaintext-only"]` |
| Modifier matching is exact   | An extra Meta held means no match                                                                                                                          |
| Capture phase, on `document` | `stopPropagation()` in application code cannot swallow it                                                                                                  |
| Optional gate                | `shortcut.allow()` is evaluated on every match; a throwing gate suppresses the trigger                                                                     |
| One export at a time         | `isExportInFlight()` guard                                                                                                                                 |

What it does not enforce: anything resembling authentication. Any user with keyboard access to the
page can produce a report. If that is unacceptable — for example on a shared kiosk handling health
data — the answer is `allow: () => false` for ordinary users, or `shortcut: false` and a
support-only build. Do not treat the obscurity of the key combination as a security control in a
threat model.

Note also that the report is generated from data **already on the device**. Gating the shortcut does
not protect the data; it only controls one convenient way of extracting it. Protecting the data means
`clearTelemetryData()`, shorter retention, or not capturing it in the first place.

---

## 8. Supply-chain posture

| Control                  | Status                                                                                                                                                                                                                                                                                       |
| ------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Runtime dependencies** | **Zero.** `dependencies` is absent from `package.json`. `peerDependencies` are all optional framework peers, none of which is imported by the core entry point.                                                                                                                              |
| **Install scripts**      | **None.** There is no `preinstall`, `install` or `postinstall` script. The only lifecycle script is `prepublishOnly`, which runs `verify` on the maintainer's machine and never on a consumer's.                                                                                             |
| **Provenance**           | `publishConfig.provenance: true`. Every published tarball carries a Sigstore-backed attestation linking it to the workflow and commit that built it.                                                                                                                                         |
| **CI supply-chain job**  | `.github/workflows/ci.yml` runs `pnpm audit --audit-level=high` (fail-closed), the Google OSV scanner against `pnpm-lock.yaml`, asserts that the pnpm resolve settings (a 10080-minute `minimumReleaseAge`, `blockExoticSubdeps`, and the `allowBuilds` list) are still pinned, and generates and validates a CycloneDX SBOM with `pnpm sbom` — in-run, storing nothing. |
| **Dependency cooldown**  | `pnpm-workspace.yaml` sets `minimumReleaseAge: 10080`, so a version published less than seven days ago is never resolved, downloaded or executed. A compromised release is normally pulled from the registry within hours, which makes the cooldown the cheapest control in this table: it costs nothing at runtime and cannot be bypassed by a typo in a version range. |
| **Publish integrity**    | `publint --strict` and `attw --pack .` both run in CI and in `prepublishOnly` via `verify`, so a broken `exports` map cannot ship.                                                                                                                                                           |
| **Size budget**          | `size-limit` enforces a 37 kB min+gzip regression budget on the core, against a measured 36.55 kB. A budget is a supply-chain control: it makes a silently bundled dependency a build failure.                                                                                               |
| **Reference the SBOM**   | `pnpm sbom --sbom-format cyclonedx` reproduces the SBOM locally. With zero runtime dependencies it is short, which is the point.                                                                                                                                                              |
| **Lockfile**             | `pnpm-lock.yaml` is committed and CI uses `pnpm install --frozen-lockfile`, so a build uses exactly the reviewed tree.                                                                                                                                                                                            |
| **2FA**                  | Recommended for the npm account and **required** for anyone who can publish. Publishing is done from CI with an npm automation token scoped to the package.                                                                                                                                  |
| **Verifying a release**  | `pnpm view @codewithrajat/rm-logvault dist.integrity dist.attestations` for the hash and provenance; `pnpm pack --dry-run` from a checkout to see exactly what would ship. `files` is an allow-list (`dist`, `docs`, `README.md`, `CHANGELOG.md`, `CONTRIBUTING.md`, `SECURITY.md`, `LICENSE`, `llms.txt`, `llms-full.txt`), and `scripts/copy-extra-files.mjs` fails the build if any of those files is missing or empty, so nothing else can be published by accident and nothing required can be dropped silently. |

### Reviewing this package in five minutes

```bash
# 1. What is actually in the tarball?
pnpm pack --dry-run

# 2. Are there dependencies at all?
pnpm view @codewithrajat/rm-logvault dependencies peerDependencies

# 3. Is this tarball what the repository built?
pnpm view @codewithrajat/rm-logvault dist.integrity dist.attestations

# 4. Does the source claiming zero egress actually make requests?
#    There is exactly one fetch call in the package:
grep -rn "fetch(" src/ --include=*.ts | grep -v test
```

---

## 9. Fail-closed and fail-open policy

The library applies one policy consistently: **fail closed on safety, fail open on availability.**

### 9.1 Fails closed (safety)

| Condition                                                | Behaviour                                                                                                                                         |
| -------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------- |
| The sanitizer cannot process a value                     | `[REDACTED]` for text, `[Unserializable]` for values. Never the raw input.                                                                        |
| `isSensitiveKey` throws                                  | Returns `true` — the key is treated as sensitive.                                                                                                 |
| Caller-supplied `extraPatterns` throws inside `replace`  | The whole text becomes `[REDACTED]`.                                                                                                              |
| `consent()` throws                                       | Returns `false` — nothing is captured, stored or uploaded.                                                                                        |
| Tag sanitization throws                                  | The tag bag is dropped entirely (`undefined`), not partially stored.                                                                              |
| `extra` sanitization throws                              | `extra` is dropped.                                                                                                                               |
| A record cannot be fitted to its byte budget at any tier | The record is dropped and `reportInternalFailure('payload-limit', …)` fires. Storing a truncated-to-useless record is worse than storing nothing. |
| An endpoint fails validation                             | That kind is local-only. No fallback URL.                                                                                                         |
| A URL is unparseable                                     | Only the part before the query or fragment survives.                                                                                              |

### 9.2 Fails open (availability)

| Condition                                | Behaviour                                                                                                                       |
| ---------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------- |
| The rate limiter's `allow()` throws      | Returns `true`. Losing telemetry is worse than a burst.                                                                         |
| IndexedDB is unavailable                 | Capture, redaction and console output continue; uploads never start; the export returns `false`. The application is unaffected. |
| A storage write fails                    | The record is dropped, the serial queue stays usable, and the failure is reported once per stage.                               |
| A transport request fails                | The batch returns to `pending` and the backoff applies.                                                                         |
| A sink throws                            | Swallowed. It cannot break the caller or the other sinks.                                                                       |
| A subscriber throws                      | Swallowed. Observers must not break ingestion.                                                                                  |
| A teardown function throws               | Swallowed; the remaining teardowns still run.                                                                                   |
| Anything at all in the public API throws | Caught, reported internally, and either swallowed or turned into a benign return value. Nothing propagates to the application.  |
| `getTelemetryStatus()` throws            | Returns a conservative fallback rather than propagating.                                                                        |

### 9.3 The one honest nuance

`sanitizeErrorRecord` and `sanitizeLogRecord` — the optional `redactAgain` second pass used by the
export — **return the record unchanged** if sanitizing throws:

```ts
} catch {
  return record;
}
```

That looks like failing open, and in a narrow sense it is. It is defensible because the record was
already sanitized **before it was written to storage**: the second pass exists to apply _newer_
redaction configuration, not to be the only line of defence. Dropping the record instead would make a
bug in a caller-supplied extra pattern silently delete the evidence the export exists to deliver,
which is a worse outcome than exporting a record redacted under the previous rules.

Two mitigations make the nuance small. The default configuration has no caller-supplied patterns at
all, so the path is unreachable without opting in. And the export is a local, user-initiated action
whose output the privacy banner already labels as potentially containing personal data.

If your threat model cannot tolerate it, do not use `redactAgain`; sanitize before storage instead,
by ensuring `initTelemetry` is called with the final configuration.

---

## 10. OWASP-aligned checklist

| Risk                                    | Status             | Control                                                                                                                                                      |
| --------------------------------------- | ------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| **A03 Injection (XSS)**                 | Mitigated          | §3. JSON escaped for the script element; the viewer uses `textContent` only; no `innerHTML`, `eval`, `new Function` or `javascript:` URLs (ESLint-enforced). |
| **A03 Injection (prototype pollution)** | Mitigated          | §4. `FORBIDDEN_KEYS` plus `Object.fromEntries`.                                                                                                              |
| **A04 Insecure design**                 | Addressed          | Never-throw public boundary; single egress point; fail-closed sanitizer; bounded everything.                                                                 |
| **A05 Security misconfiguration**       | Addressed          | Rejected URL schemes; `requireHttps`; credentials default `'same-origin'`; the report ships its own restrictive CSP.                                         |
| **A06 Vulnerable components**           | Minimised          | Zero runtime dependencies; `pnpm audit` and OSV in CI; SBOM artefact.                                                                                         |
| **A08 Software and data integrity**     | Addressed          | npm provenance; committed lockfile; `pnpm install --frozen-lockfile`; allow-listed `files`.                                                                                          |
| **A09 Logging and monitoring failures** | Inverted           | This _is_ the logging library. Its own failures are observable through `onInternalError` and the `[Telemetry]` console prefix, reported once per stage.      |
| **A01 Broken access control**           | Partial, by design | §7. The shortcut is obscurity. `allow()` is the gate.                                                                                                        |
| **A02 Cryptographic failures**          | Out of scope       | No cryptography is implemented. TLS is the platform's. `crypto` is used only for random ids.                                                                 |
| **Sensitive data exposure**             | Mitigated          | §2. Redaction before storage and before export.                                                                                                              |
| **ReDoS**                               | Mitigated          | §5. `HARD_TEXT_CAP` plus linear patterns.                                                                                                                    |

---

## 11. Disclosure policy

### Reporting a vulnerability

**Please do not open a public issue.** Use one of:

1. **GitHub private advisory** (preferred):
   <https://github.com/malikrajat/rm-logvault/security/advisories/new>
2. **Email:** `security@rm-logvault.dev`

> **Note:** `security@rm-logvault.dev` is a **placeholder** address used throughout this documentation.
> Before relying on it, replace it with the address actually published in the repository's
> `SECURITY.md` and in the pnpm package metadata. Until then, the GitHub private advisory flow is the
> only channel guaranteed to reach a maintainer.

Please include: the version, a description of the impact, a minimal reproduction (a code snippet, a
record shape, or an input to the sanitizer is usually enough), and whether you intend to publish.

### What to expect

| Stage                                                                    | Target                                               |
| ------------------------------------------------------------------------ | ---------------------------------------------------- |
| Acknowledgement of your report                                           | 3 working days                                       |
| Initial assessment (severity, affected versions, whether it is in scope) | 10 working days                                      |
| Fix or documented mitigation for a confirmed High/Critical issue         | 30 days                                              |
| Fix for a confirmed Low/Medium issue                                     | Next scheduled release                               |
| Coordinated public disclosure                                            | **90 days** after the report, or sooner by agreement |

We will credit you in the release notes and in the advisory unless you ask us not to.

### In scope

- A record containing data that should have been redacted (a bypass of §2).
- A path from record content to script execution or DOM injection in the diagnostics report (§3).
- A prototype-pollution vector (§4).
- A regular-expression denial of service reachable from untrusted input (§5).
- A network request to anywhere other than the configured endpoint, or a way to make the endpoint
  validation accept a dangerous scheme (§6).
- A way to read data the library promises never to read — request/response bodies, cookies,
  `localStorage`, `sessionStorage`, auth headers, form values.
- A way to escape the fail-closed policy in §9.1.
- A package-publishing or provenance weakness (§8).

### Out of scope

- **The shortcut being discoverable.** It is documented as obscurity (§7).
- **The report containing personal data.** It is redacted, not anonymous, and the banner says so.
- **A malicious application.** The library runs in your page; what _it_ does is enumerated here.
- **A malicious `extraPatterns` or `extraSensitiveKeys` value.** Caller-supplied regular expressions
  are the caller's responsibility (§5).
- **The absence of at-rest encryption.** Documented as a non-goal and on the roadmap.
- **A fully compromised device.** The databases are readable in DevTools by design.
- **Dependency vulnerabilities.** There are no runtime dependencies. A devDependency issue is
  welcome as a normal issue, not an advisory.

### Supported versions

| Version      | Supported                                |
| ------------ | ---------------------------------------- |
| Latest `1.x` | Yes — current release line               |
| Older `1.x`  | No — fixes are never backported          |
| `< 1.0.0`    | No — pre-1.0 releases are not maintained |

Fixes land on the latest published version and ship as a patch on the `latest` dist-tag. There are no
long-term-support branches and no backports, so upgrading to the latest version is the supported path;
a security fix is never withheld from the current line.

### Severity guidance for maintainers

`SECURITY.md` is the authoritative policy; the short version is that the following are treated as
**Critical** and released out of band: any XSS in the report, any prototype-pollution vector, any
redaction bypass that leaks a credential, and any unconfigured network egress.
