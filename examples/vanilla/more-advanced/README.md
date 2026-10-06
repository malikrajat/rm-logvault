# more-advanced — vanilla TypeScript

**Problem it solves:** tiers 1–3 *configure* the library; this tier **replaces parts of it**. Reach
here when "IndexedDB plus `fetch`" is not the shape of your deployment — your backend is not plain REST,
your tests must not touch a database, or you need a policy decision at the last moment before storage.

Nothing on this page is needed to use the library well. That is the honest framing: every seam here
trades a guarantee for control.

**What you will learn:**

- The full `TelemetryRepository` contract — which is **not** just `{ errors, logs }`.
- Two ways to supply one: no storage at all, or IndexedDB with your own cleanup cadence.
- `rest.transport`: replacing the network while keeping the library's retry policy.
- `logSource`: feeding records in from a logger you already own, and its sanitization rule.
- `beforeCapture` / `beforeStore`: inspecting, rewriting or dropping a record at the last moment.
- `onInternalError`: noticing when the library itself is failing, without it reaching users.
- The application-owned half of retry: `online`, `onTerminalFailure`, `retryFailedTelemetry()`.

## The seams

| Seam | Replaces | Read |
| --- | --- | --- |
| `repository` | Where records are stored — IndexedDB itself. | [custom repository](./01-custom-repository.md) |
| `rest.transport` | How uploads are sent. | [transport and logSource](./02-custom-transport-and-log-source.md) |
| `logSource` | Where log records come from. | [transport and logSource](./02-custom-transport-and-log-source.md) |
| `beforeCapture` / `beforeStore` | The final decision to store a record. | [hooks and automation](./03-lifecycle-hooks-and-automation.md) |
| `onInternalError` | How the library's own failures are surfaced. | [hooks and automation](./03-lifecycle-hooks-and-automation.md) |
| `rest.onTerminalFailure` | What happens when a batch can never succeed. | [hooks and automation](./03-lifecycle-hooks-and-automation.md) |

## The order to read them in

1. **`onInternalError`** — ten lines, and it makes every *other* problem visible. Start here even if you
   intend to replace nothing.
2. **`beforeCapture` / `beforeStore`** — application policy with no infrastructure required.
3. **`rest.transport`** — the useful one when your backend is not plain REST.
4. **`logSource`** — only if you already run a logger whose records you want persisted.
5. **`repository`** — the largest change, and the only one that alters where data lives.

## Watching and teaching, rather than replacing

The seams above swap a part out. A second group lets you **observe** the pipeline and **teach** it about
error shapes only your application understands — no part replaced, nothing to take on:

| Seam | Gives you | Read |
| --- | --- | --- |
| `handle.events` | Six events, so a badge or your own store can react to a capture. | [events and context builders](./04-events-and-context-builders.md) |
| `registerErrorContextBuilder` | Classification for errors the library cannot recognise. | [events and context builders](./04-events-and-context-builders.md) |
| `getSinkRegistry()` | Listing, looking up and detaching sinks by key. | [events and context builders](./04-events-and-context-builders.md) |
| Flat aliases / `setupTelemetry` | The short form of the nested configuration. | [events and context builders](./04-events-and-context-builders.md) |

The distinction matters when you are deciding how much to take on: **observing costs nothing and can
never break a capture**, while **replacing is a guarantee you now own**. Prefer the first group unless
the default genuinely does not fit.

## Three more things the library now ships

Neither observation nor replacement — these are additions you reach for on their own:

| Addition | Problem it solves | Read |
| --- | --- | --- |
| `@codewithrajat/rm-logvault/http` | Turning your own API failures into records, with status, method, URL and retry classification done once. | [using the HTTP client](./05-using-the-http-client.md) |
| `@codewithrajat/rm-logvault/storage` | Encrypting chosen record fields at rest, for when a database dump is the threat. | [encrypting stored records](./06-encrypting-stored-records.md) |
| `exportDiagnosticsReport({ format })` | `jsonl` and `csv` alongside `html` and `json`, so a report can go into a pipeline or a spreadsheet. | [the report](../../README.md), [API reference](../../../docs/API.md) |

Both subpaths are separate imports, so an application that uses neither pays nothing for them.

## What each seam costs you

| You replace | You take on |
| --- | --- |
| `repository` | The database names, the retention policies, and the readiness gate. The library stops choosing any of them. |
| `rest.transport` | Sending the request. Not the retry policy — status classification, backoff and `Retry-After` stay the library's. |
| `logSource` | Building and **sanitizing** the records you hand over. |
| `beforeCapture` / `beforeStore` | Not breaking capture. A hook that throws is caught and reported, but the record is then stored unreviewed. |

## See also

- [the recipes and choosing between them](./03-recipes-and-deciding.md) — the browser's error paths side
  by side, and how to assert any of it in a test.
- [events, context builders and named sinks](./04-events-and-context-builders.md) — the observation
  surface, the merge rule, and the flat configuration aliases.
- [using the HTTP client](./05-using-the-http-client.md) — capturing your own API failures.
- [encrypting stored records](./06-encrypting-stored-records.md) — encryption at rest, and its limits.
- [config](../config/README.md) — the options surface these hooks sit alongside.
- [docs/ARCHITECTURE.md](../../../docs/ARCHITECTURE.md) — how the pieces fit, including the outbox.
- [docs/DECISIONS.md](../../../docs/DECISIONS.md) — why the defaults are what they are.
