# config — vanilla TypeScript

**Problem it solves:** you are about to ship this into a real deployment and you need to know what you
can change, what each number means, what it defaults to — and, when a value is set in two places, which
one actually wins.

**What you will learn:**

- The three layers configuration comes from, and the single rule that decides between them.
- What happens to a value that is *invalid*, which is not the same as a value that is absent.
- Where the exhaustive list lives, so you stop guessing at names and defaults.
- How to see what the library actually resolved, rather than what you think you passed.

## Three layers, one rule

```
explicit option   >   environment   >   built-in default
```

Every option resolves by that rule, with no exceptions. Two consequences follow, and both catch people
out:

- An explicit option **always** beats the environment, even when the environment variable was set
  deliberately. That is what lets you ship one build with a `.env` file and override a single value in
  code.
- A default is only used when neither of the other two supplied anything usable — so "I set the
  variable but the default applied" is a solvable question, and the next section is the answer.

### Which switch reads the environment

The environment layer is **opt-in**, and it is read only through `env`:

```ts
import { initTelemetry } from '@codewithrajat/rm-logvault';

initTelemetry({ env: true }); // the three default prefixes
initTelemetry({ env: 'VITE_' }); // one prefix
initTelemetry({ env: ['VITE_', 'PUBLIC_'] }); // several, in order
```

`env` accepts `true` (which means `['VITE_', 'NEXT_PUBLIC_', 'REACT_APP_']`), a single prefix, or a list
of prefixes searched in order. Without it, **nothing is read from the environment at all** — which is
what keeps the library usable in Node, in SSR and in a plain `<script type="module">`, where
`import.meta.env` does not exist.

> **Source note.** `fromEnv()` is a **reader**, not a switch, and spreading it does not configure
> anything. It returns a *flat* object (`errorsEnabled`, `logsMaxRecords`, `errorsUrl`, …), while the
> resolver reads the environment only through `options.env`. So `initTelemetry({ ...fromEnv() })`
> carries just the six fields whose names coincide with a top-level option — `appName`, `appVersion`,
> `buildId`, `environment`, `enabled`, `dbPrefix` — and silently drops every nested one: every URL,
> retention window, cap and level. Use `env:` to configure, and `fromEnv()` when you want to read the
> values yourself.

## Seeing what actually resolved

This is the single most useful habit at this tier. `resolveOptions` is exported, it never throws, and it
applies exactly the same rules the library applies at initialisation:

```ts
import { DEFAULT_OPTIONS, resolveOptions } from '@codewithrajat/rm-logvault';

const resolved = resolveOptions({ env: 'VITE_', errors: { maxRecords: 100 } });

resolved.mode; // 'local' | 'remote'  — derived, not guessed
resolved.errors.maxRecords; // 100     — the explicit option won
resolved.errors.retentionDays; // 7    — nobody set it, so the default
resolved.logs.writeFlushMs; // 1000
resolved.openTimeoutMs; // 5000
```

The returned object is frozen and fully populated: there are no `undefined` gaps to reason about, other
than the identity fields (`appName`, `appVersion`, `buildId`, `environment`), which stay `undefined`
until you supply them. `DEFAULT_OPTIONS` is exported too, so the defaults are readable from code rather
than only from documentation.

A common debugging pattern is to render the resolved object during development. If a value is not what
you expected, one of these is true: you passed it in the wrong group (`errors.maxRecords`, not
`maxRecords`), the name does not exist, the value was invalid, or the environment was never enabled with
`env:`.

## Invalid values are ignored, not applied

A value that cannot be used falls back rather than being coerced. This is deliberate: a silent
coercion in an error-reporting library means you discover the mistake during an incident.

| You pass | Result | Why |
| --- | --- | --- |
| `maxRecords: -5` | the default | Non-positive is not a smaller cap; it is a mistake. |
| `maxRecords: 10.9` | `10` | Integer options are floored. |
| `maxRecords: 0` | the default | "Store nothing" is spelled `enabled: false`. |
| `retentionDays: 0` | `0` — **applied** | Here `0` genuinely means "no age-based deletion". |
| `retentionDays: 0.5` | `0.5` — applied | Twelve hours. Fractions are meaningful for a duration. |
| `logs.level: 'verbose'` | the previous level | Only `trace`, `debug`, `info`, `warn`, `error` and the disable synonyms (`off`, `none`, `silent`) are recognised. |
| `mode: 'sideways'` | inferred | An unrecognised mode is not a mode. |

Which options accept `0` is not uniform, and it is documented per option rather than left to
inference — the rule is "does `0` have a meaning here?". It does for `retentionDays`,
`maxEventsPerMinute` and `maxLogsPerMinute`; it does not for `maxRecords` or `maxPayloadBytes`.

## Where to look for the rest

| You want | Read |
| --- | --- |
| Every option, its unit, its default and its boundaries | [docs/API.md](../../../docs/API.md#every-option-annotated) |
| A scannable list of the options by group | [the option index](./01-options-at-a-glance.md) |
| The environment variables, with units and legacy aliases | [environment variables](./02-environment-variables.md) |
| Copy-pasteable presets for a whole deployment | [docs/CONFIGURATION.md](../../../docs/CONFIGURATION.md) |

## Next

- [Levels and thresholds](./03-levels-and-thresholds.md) — the two level settings, why `logger.info` is
  quiet by default, and the rate limits that can drop a record.
- [The option index](./01-options-at-a-glance.md) — every switch, grouped, with units.
- [Environment variables](./02-environment-variables.md) — the names, the parsing rules, the aliases.
