# config — React 19

**Problem it solves:** the React-specific parts of a deployment are few but easy to get wrong — where
the options live, which of them the adapter adds, and how a Vite environment file interacts with code
you have already written.

**What you will learn:**

- The precedence rule, and why an explicit option always beats the environment.
- The options that actually matter in a React app, with units and defaults.
- The two options the React adapter adds, which have no core equivalent.
- What happens to an invalid value, and how to see what the library really resolved.
- How to read a Vite `.env` file from the library, and the one trap in doing so.

## Three layers, one rule

```
explicit option   >   environment   >   built-in default
```

The rule is the same for every option, in every framework. What is React-specific is only *where* the
explicit options come from — a component's props, a config module, a feature-flag fetch — and how the
environment layer is enabled:

```ts
import { initTelemetry } from '@codewithrajat/rm-logvault';

// In a Vite app the prefix is VITE_, and Vite exposes only VITE_-prefixed
// variables to client code at all.
initTelemetry({ env: true }); // ['VITE_', 'NEXT_PUBLIC_', 'REACT_APP_']
initTelemetry({ env: 'VITE_' });
initTelemetry({ env: ['VITE_', 'PUBLIC_'] });
```

> **Source note.** `fromEnv()` is a reader, not a switch. It returns a *flat* object
> (`errorsEnabled`, `logsMaxRecords`, `errorsUrl`, …) while the resolver reads the environment only
> through `options.env`, so `{ ...fromEnv() }` carries just the six fields whose names coincide with a
> top-level option (`appName`, `appVersion`, `buildId`, `environment`, `enabled`, `dbPrefix`) and
> silently drops every nested one. Configure with `env:`; use `fromEnv()` only when you want to read the
> values yourself.

## The options that matter in a React app

Grouped, with units and defaults. The exhaustive list — every option, every boundary — is
[docs/API.md](../../../docs/API.md#every-option-annotated), and a scannable full index is in the vanilla
tree: [../../vanilla/config/01-options-at-a-glance.md](../../vanilla/config/01-options-at-a-glance.md).

### The ones you will actually set

| Option | Type / unit | Default | Why a React app sets it |
| --- | --- | --- | --- |
| `appName` | `string` | none | Identity on every record. There is no default because a guess would be worse. |
| `appVersion`, `buildId`, `environment` | `string` | none | Which deploy produced this. `buildId` is the fastest way to answer that. |
| `mode` | `'local' \| 'remote'` | derived | Device-only or device-plus-upload. Inferred from whether uploads are enabled. |
| `rest.errorsUrl` / `logsUrl` | absolute `http(s)` or a path | none | Two endpoints, so errors and logs can go to different collectors. |
| `rest.batchSize` | records per request | `50` | Request size, and the blast radius of a terminal failure. |
| `rest.intervalMs` | milliseconds | `30000` | Floor between flushes after a success. |
| `errors.retentionDays` / `maxRecords` / `maxPayloadBytes` | days / rows / UTF-8 bytes | `7` / `500` / `16384` | How much error history survives. |
| `logs.enabled` / `level` | boolean / level | `true` / `'warn'` | Whether logs are persisted, and from which level. |
| `logs.consoleLevel` | level | **none** | Console verbosity applied at init. No default, so it never changes console output unless asked. |
| `shortcut` | `false \| ShortcutOptions` | enabled | `false` removes the keyboard shortcut — see the React alternative in [advanced](../advanced/01-export-and-manual-sync.md). |
| `env` | `true \| string \| string[]` | none | Opts in to the environment layer above. |

### What the React adapter adds

These have no core equivalent, because they only make sense once React's own error paths exist:

| Option | Type / unit | Default | Where it goes |
| --- | --- | --- | --- |
| `context.tags` | `Record<string, string>` | none | Passed to `reactRootErrorHandlers({ tags })` and to `<TelemetryErrorBoundary context={{ tags }}>`. Merged into every record that adapter produces. |
| `context.extra` | `Record<string, unknown>` | none | Accepted by both helpers; sanitized, then attached to the record. Use it for something you want to see beside the stack, not for anything sensitive. |

Tagging at the adapter is worth doing the moment two applications share one collector, because
otherwise the only way to tell them apart is `appName` on every row.

### Rarely worth changing

`errors.maxEventsPerMinute` (`120`), `logs.maxLogsPerMinute` (`600`), `logs.writeFlushMs` (`1000`),
`logs.writeBatchSize` (`50`), `openTimeoutMs` (`5000`), `rest.credentials` (`'same-origin'`),
`redaction.*`. Their defaults are chosen deliberately; the reasons are in
[../../vanilla/config/01-options-at-a-glance.md](../../vanilla/config/01-options-at-a-glance.md) and in
[docs/API.md](../../../docs/API.md#every-option-annotated).

## Invalid values are ignored, not applied

A value that cannot be used falls back rather than being coerced, because a silent coercion in an
error-reporting library means the mistake surfaces during an incident:

| You pass | Result |
| --- | --- |
| `errors.maxRecords: -5` | the default |
| `errors.maxRecords: 10.9` | `10` — integers are floored |
| `errors.maxRecords: 0` | the default — "store nothing" is `errors.enabled: false` |
| `errors.retentionDays: 0` | `0`, **applied** — here it means "never delete by age" |
| `logs.level: 'verbose'` | the previous level — only the documented level names are recognised |
| `mode: 'sideways'` | inferred |

Which options accept `0` depends on whether `0` has a meaning for that option, and it is documented per
option rather than left to inference.

## Seeing what actually resolved

`resolveOptions` is exported, never throws, and applies exactly the rules initialisation applies. In a
React app this is the fastest way to answer "did my options get through?":

```ts
import { resolveOptions } from '@codewithrajat/rm-logvault';

const resolved = resolveOptions({ env: 'VITE_', errors: { maxRecords: 100 } });

resolved.mode; // 'local' | 'remote' — derived, not guessed
resolved.errors.maxRecords; // 100 — the explicit option won
resolved.logs.writeFlushMs; // 1000
```

A practical trick while developing: render the resolved object behind a debug flag. It turns "the
library ignored my setting" into a visible answer, and the usual causes are visible at a glance — the
option is in the wrong group (`errors.maxRecords`, not `maxRecords`), the name is misspelled, the value
is invalid, or `env:` was never set.

## Next

- [Environment variables in a Vite React app](./01-environment-variables.md).
- [Levels and thresholds](./03-levels-and-thresholds.md) — the two level settings, why `logger.info` is
  quiet by default, and the rate limits that can drop a record.
- [more-advanced](../more-advanced/README.md) — the adapter in depth, and the replaceable parts.
