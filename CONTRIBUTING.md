# Contributing

Thanks for considering a contribution. This document covers the dev setup, the checks, the commit
conventions, the release workflow and the review expectations.

Before you start, two documents are worth ten minutes:

- [AGENTS.md](AGENTS.md) â€” the invariants that must never be broken, whether you are a human or an
  automated agent. Every one of them is enforced by a test, a lint rule or CI, or is explicitly
  called out here.
- [docs/DECISIONS.md](docs/DECISIONS.md) â€” why the code looks the way it does. If you are about to
  change something structural, check whether it was already decided, and read the alternatives that
  were rejected.

---

## Dev setup

**Requirements:** Node.js **>= 22.13** and **pnpm >= 11.5.1**.

The *published package* runs on Node >= 18 â€” that is its `engines.node`, and it is what an SSR
consumer imports. The *toolchain* needs more: pnpm 11 itself declares `engines.node: ">=22.13"`, so
installing, building and testing all happen on Node 22 or newer, and CI runs its matrix on 22 and 24.
The `packageManager` field pins the exact pnpm version and `pnpm/action-setup` in CI reads that field,
so there is one place to bump it and a contributor's install cannot disagree with CI.

```bash
git clone https://github.com/malikrajat/rm-logvault.git
cd logvault
pnpm install
pnpm run verify
```

`pnpm install` is the only setup step. There are no code-generation steps, no native builds, no
required environment variables, and no runtime dependencies to install â€” the package has **zero**.

This repository is a **pnpm workspace**: the library is the root package and every directory under
`examples/` is a member, so a single `pnpm-lock.yaml` at the root covers the library and all five
integration samples. `pnpm-workspace.yaml` also carries the supply-chain settings, and three of them
change what a valid dependency edit looks like:

- **`minimumReleaseAge: 10080`** â€” a version published less than seven days ago is never resolved,
  downloaded or executed. The practical consequence: a `devDependency` range must point at a release
  that is already a week old. Writing `^1.2.3` when `1.2.3` shipped yesterday fails the install with
  `ERR_PNPM_NO_MATURE_MATCHING_VERSION`; the fix is to name the newest mature version, which is the
  entire point of the cooldown. Bumping a dependency therefore means choosing a version that is a week
  old, not the newest one.
- **`blockExoticSubdeps: true`** â€” a transitive dependency must resolve from a registry, never from a
  git URL or a raw tarball.
- **`allowBuilds`** â€” dependency install scripts are denied unless named here. Four are approved:
  `esbuild`, the platform binary that tsup and Vitest build through, plus `lmdb`, `@parcel/watcher`
  and `msgpackr-extract`, the transitive native bindings of the Angular toolchain. That toolchain is
  present only because the root devDependencies include `@angular/core` (to typecheck
  `src/adapters/angular.ts`) â€” **not** because of anything under `examples/`, which is Markdown-only
  and installs nothing. Run `pnpm install` and rule on whatever pnpm reports: it appends a placeholder
  for every blocked package it finds.

CI asserts that all three are still pinned, so weakening one is a build failure rather than a silent
change. See [docs/SECURITY.md](docs/SECURITY.md) for the reasoning.

Framework packages (`react`, `vue`, `@angular/core`, `axios`, `@tanstack/react-query`) are
devDependencies so the adapters can be type-checked and tested. They are declared as _optional_
peerDependencies for consumers and marked `external` in the build, so none of them is ever bundled.

`pnpm run verify` runs the full gate: `biome check`, typecheck, the test suite, build, `publint`,
`attw`, `size-limit` and `knip`. Run it before opening a pull request; CI runs the same steps as
separate jobs, plus the coverage gate in the test job.

CI runs on a push to `main`, on a pull request whose base branch is `main`, and on a push to a
release tag â€” `v*` or `@codewithrajat/rm-logvault@*`. That is the whole list: a push to a feature
branch runs nothing until its pull request against `main` is opened. A tag is **verified** and never
published from, because publishing stays on the changesets flow below. See
[D-024](docs/DECISIONS.md#d-024--ci-and-the-release-pipeline-run-on-main-only) and
[D-025](docs/DECISIONS.md#d-025--ci-verifies-release-tags-and-publishing-stays-on-main-only).

Formatting and linting are both **Biome** now â€” one Rust tool, one `biome.json`, no Prettier config
and no `eslint-config-prettier` shim to keep two tools agreeing. Biome is fast, and its formatting
output is within a rounding error of the previous Prettier configuration, but it does **not** yet do
type-aware linting: the `no-unsafe-*` family and `no-floating-promises` are no longer lint-enforced.
`pnpm run typecheck` is the type-safety gate instead, backed by the test suite and `knip`. See
[D-016](docs/DECISIONS.md#d-016--biome-replaces-eslint-and-prettier).

---

## pnpm scripts

Every script, copied from `package.json`:

| Script             | Command                                                                                                                                | What it does                                                                                                                                                                                                               |
| ------------------ | -------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `build`            | `tsup && node scripts/copy-extra-files.mjs`                                                                                            | Builds dual ESM (`.js`) + CJS (`.cjs`) with `.d.ts` / `.d.cts`, sourcemaps, no minification, framework peers external. Eight entry points: `index`, `react`, `vue`, `angular`, `axios`, `fetch`, `react-query`, `testing`. Then stages the non-code files into `dist/` and fails the build if any is missing. |
| `dev`              | `tsup --watch`                                                                                                                         | The same build in watch mode. Useful while iterating on a module in isolation.                                                                                                                                             |
| `typecheck`        | `tsc --noEmit`                                                                                                                         | Full-program type check under the strictest settings (`strict`, `noUncheckedIndexedAccess`, `exactOptionalPropertyTypes`), including the config files. With type-aware linting gone, this is the type-safety gate.         |
| `test`             | `vitest run`                                                                                                                           | Runs the test suite once. happy-dom environment, `src/**/*.test.ts(x)` and `test/**/*.test.ts`.                                                                                                                            |
| `test:watch`       | `vitest`                                                                                                                               | The same suite in watch mode.                                                                                                                                                                                              |
| `test:coverage`    | `vitest run --coverage`                                                                                                                | Tests with V8 coverage and the configured thresholds. This is what CI runs.                                                                                                                                                |
| `test:e2e`         | `playwright test`                                                                                                                      | Playwright browser specs in `e2e/`. Requires a browser download (`pnpm exec playwright install`), so it is optional locally and runs as its own CI job.                                                                          |
| `check`            | `biome check .`                                                                                                                        | The whole Biome pass: formatting, linting and import sorting, in one command. `verify` runs it first.                                                                                                                      |
| `check:fix`        | `biome check . --write`                                                                                                                | The same pass, writing every safe fix. This is the one to run before committing.                                                                                                                                           |
| `lint`             | `biome lint .`                                                                                                                         | The linter alone, when you do not want formatting noise in the diff. Biome does no type-aware linting yet; see the rules below.                                                                                            |
| `lint:fix`         | `biome lint . --write`                                                                                                                 | Lint-only autofixes. Biome cannot fix every rule it reports.                                                                                                                                                               |
| `format`           | `biome format . --write`                                                                                                               | Formats the repository: 2-space indent, 100 columns, LF, single quotes, semicolons, trailing commas.                                                                                                                       |
| `format:check`     | `biome format .`                                                                                                                       | Verifies formatting without writing anything.                                                                                                                                                                              |
| `knip`             | `knip`                                                                                                                                 | Finds unused files, exports and dependencies. Entry points are `src/index.ts`, `src/adapters/*.ts` and `src/testing/index.ts`.                                                                                             |
| `size`             | `size-limit`                                                                                                                           | Enforces the **37 kB min+gzip** regression budget on `dist/index.js` (measured 36.55 kB).                                                                                                                                  |
| `size:consumers`   | `node scripts/measure-size.mjs`                                                                                                        | Measures what each subpath costs in a consumer bundle, proving tree-shaking still works.                                                                                                                                   |
| `publint`          | `publint --strict`                                                                                                                     | Validates the published package layout, including the `exports` map and `files`.                                                                                                                                           |
| `attw`             | `attw --pack .`                                                                                                                        | Are-the-types-wrong: verifies that the ESM and CJS type resolutions both resolve correctly.                                                                                                                                |
| `commitlint`       | `commitlint --edit`                                                                                                                    | Lints a commit message (`--edit` reads the one being written).                                                                                                                                                             |
| `verify`           | `pnpm run check && pnpm run typecheck && pnpm run test && pnpm run build && pnpm run publint && pnpm run attw && pnpm run size && pnpm run knip` | The full pre-pull-request gate, in dependency order. CI runs the same steps as separate jobs.                                                                                                                              |
| `changeset`        | `changeset`                                                                                                                            | Interactively records a changeset for the current change. Run this before opening a PR.                                                                                                                                    |
| `version-packages` | `changeset version`                                                                                                                    | Consumes the changesets: bumps the version and regenerates `CHANGELOG.md`. Used by the release workflow.                                                                                                                   |
| `release`          | `pnpm run build && changeset publish`                                                                                                   | Builds and publishes to npm, then tags. Used by the release workflow.                                                                                                                                                      |
| `prepublishOnly`   | `pnpm run verify`                                                                                                                       | A safety net for a manual `pnpm publish`. It never runs on a consumer's machine.                                                                                                                                            |

### Repository layout beyond `src/`

| Path                 | Contents                                                                                                                                                                                                               |
| -------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `pnpm-workspace.yaml`| The workspace root marker (`packages: .` â€” the library is the only member) and the supply-chain settings: `minimumReleaseAge`, `blockExoticSubdeps` and `allowBuilds`.                                              |
| `scripts/`           | `copy-extra-files.mjs` (build-time staging and completeness check for the published tarball) and `measure-size.mjs` (per-subpath consumer cost).                                                                        |
| `e2e/`               | Browser end-to-end specs, driven by `playwright.config.ts`.                                                                                                                                                            |
| `examples/`          | Runnable integrations arranged by difficulty: `01-basic` (vanilla, react, vue, nextjs, angular), `02-advanced` (vanilla, react), `03-more-advanced` (vanilla), `04-further` (vanilla) and `playground`. Each variant has its own `package.json`, `tsconfig.json` and `GUIDE.md`, and all are excluded from `tsconfig.json` and from the knip project globs. |
| `.changeset/`        | Changeset files plus the changesets configuration.                                                                                                                                                                     |
| `.github/workflows/` | `ci.yml` (lint, test matrix, build + packaging, browser E2E, supply chain) and `release.yml`.                                                                                                                          |
| `test/`              | Shared test helpers, included in the Vitest glob.                                                                                                                                                                      |

CI additionally runs a browser E2E job (Playwright, Chromium/Firefox/WebKit) and a supply-chain job
(`pnpm audit`, the OSV scanner, and a CycloneDX SBOM that is generated and validated in-run but
**not** uploaded). The pipeline stores **no artifacts** at all â€” every job either passes or fails.
The specs live in `e2e/`, driven by `playwright.config.ts` and run via `pnpm run test:e2e`. The
browser download makes that script optional locally.

---

## Conventional commits

Commits follow [Conventional Commits](https://www.conventionalcommits.org/) and are linted by
`commitlint` with `@commitlint/config-conventional` plus two project rules:

- **`scope-enum`** â€” the scope is required to be one of a closed list.
- **`subject-case`** â€” the subject must be sentence case or lower case.
- `body-max-line-length` is disabled, so conventional-commit footers (`BREAKING CHANGE:`, `Refs:`)
  do not need wrapping.

### Scopes

| Scope      | Use it for                                                                                                                                                 |
| ---------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `core`     | `src/core/*` â€” config resolution, initialization, state, environment access, ids, page context, the internal reporter, the serial queue, the rate limiter. |
| `logger`   | `src/logger/*` â€” the facade, level ladder, sinks, pre-init buffering, console capture and the console writer.                                              |
| `errors`   | `src/errors/*` â€” capture, normalisation, sanitization, fingerprinting, API classification, payload budgeting, constants.                                   |
| `handlers` | `src/handlers/*` â€” the global DOM event handlers.                                                                                                          |
| `storage`  | `src/storage/*` â€” IndexedDB connections, both repositories, validation, cleanup.                                                                           |
| `sync`     | `src/sync/*` â€” the outbox, the REST contract, the transports, backoff.                                                                                     |
| `export`   | `src/export/*` â€” the shortcut, the report template, the export pipeline, second-pass redaction.                                                            |
| `adapters` | `src/adapters/*` â€” React, Vue, Angular, axios, fetch, TanStack Query.                                                                                      |
| `testing`  | `src/testing/*` â€” the in-memory repository and the fake transport.                                                                                         |
| `docs`     | `README.md`, `docs/**`, `llms.txt`, `llms-full.txt`, `AGENTS.md`, `CONTRIBUTING.md`, `CHANGELOG.md`.                                                       |
| `ci`       | `.github/workflows/**`.                                                                                                                                    |
| `build`    | `tsup.config.ts`, `tsconfig.json`, `vitest.config.ts`, `biome.json`, `playwright.config.ts`, `commitlint.config.js`.                                       |
| `deps`     | Dependency additions, removals and upgrades.                                                                                                               |
| `release`  | Version bumps and release-process changes.                                                                                                                 |

### Examples

```text
feat(errors): add chunk-error classification for Vite preload failures
```

```text
fix(storage): requeue claims abandoned by a closed tab
```

```text
perf(export): marshal records in 500-row slices with a yield
```

```text
docs(sync): document the Retry-After clamping behaviour
```

```text
refactor(core): extract the cleanup registry from state
```

```text
test(sanitize): cover prototype-pollution keys at depth
```

```text
chore(deps): bump vitest to 5.0.4
```

```text
ci(build): run attw on the packed tarball
```

```text
feat(adapters)!: rename attachQueryClient options

BREAKING CHANGE: `attachQueryClient(client, { keys: true })` is replaced by
`attachQueryClient(client, { captureKeys: true })`. The old option was ignored.
```

Conventional-commit types in use: `feat`, `fix`, `perf`, `refactor`, `docs`, `test`, `build`, `ci`,
`chore`, `revert`. A `feat` is a minor bump, a `fix` a patch, and a `!` or a `BREAKING CHANGE:`
footer is a major bump. Because the package is pre-1.0, a breaking change may ship as a minor â€” say
so explicitly in the changeset.

---

## Changesets

Releases are managed by [changesets](https://github.com/changesets/changesets). Do not edit
`CHANGELOG.md` by hand and do not bump `version` in `package.json` yourself; the release workflow
does both.

### Recording a change

Every pull request that changes the published package needs a changeset:

```bash
pnpm exec changeset
```

The prompt asks three things:

1. **Which packages changed.** There is one: `@codewithrajat/rm-logvault`.
2. **The bump type.** Choose honestly:
   - **`patch`** â€” a bug fix, a documentation fix that ships in the tarball, an internal refactor with
     no behaviour change, a dependency bump in a devDependency.
   - **`minor`** â€” a new option, a new export, a new adapter, or (pre-1.0) a breaking change.
   - **`major`** â€” reserved. Do not choose it before 1.0. The one thing that _is_ major-worthy is a
     change to `ERRORS_DB_VERSION` or `LOGS_DB_VERSION`, because it changes the on-disk format a
     previously installed version already wrote. If you are doing that, say so loudly in the changeset
     body and in the PR description.
3. **A summary.** Write it in the imperative and in the past tense, as a changelog entry. It will be
   published verbatim. Mention the _effect_ on a consumer, not the mechanism.

```markdown
---
'@codewithrajat/rm-logvault': minor
---

Add `errors.captureCsp` to record Content-Security-Policy violations as
`source: 'csp'` records with `category: 'security'` and `warning` severity.
```

### What CI checks

The release workflow fails a pull request that changes `src/**` or `package.json` without a changeset
file. Documentation-only changes â€” `docs/**`, `README.md`, `llms.txt`, `llms-full.txt`,
`CONTRIBUTING.md`, `AGENTS.md` â€” do not need one, unless the file is in the published `files`
allow-list (`README.md`, `LICENSE`, `llms.txt`, `llms-full.txt`), in which case a `patch` is
appropriate.

### How a release happens

1. Changesets accumulate on `main` as `.changeset/*.md` files.
2. The changesets bot opens (or updates) a **"Version Packages"** pull request. It runs
   `changeset version`, which consumes the changeset files, applies the highest bump of each type,
   updates `package.json`, and regenerates `CHANGELOG.md`.
3. Review that pull request like any other. Check the changelog reads well â€” it is the artefact
   consumers see.
4. Merging it triggers the release workflow, which runs `pnpm run build && changeset publish`. The
   package is published with `provenance: true`, so the tarball carries a Sigstore attestation tying
   it to that workflow run and commit.
5. `changeset publish` creates the git tag and the GitHub release. The tag is pushed with the
   action's `GITHUB_TOKEN`, which GitHub does not treat as a new workflow run, so the release does
   not start a second CI run â€” see
   [D-025](docs/DECISIONS.md#d-025--ci-verifies-release-tags-and-publishing-stays-on-main-only).

`baseBranch` is `main`, `access` is `public`, and prereleases use the template
`{tag}-{datetime}-{commit}`.

---

## Coverage gates

Coverage is enforced by Vitest's `coverage.thresholds`, using the V8 provider. A pull request that
drops below a threshold fails CI.

The originally specified targets were 90% globally and 95% for the seven critical files. The
**measured baseline is lower**, so the thresholds are pinned to it and act as a **regression guard**:
they fail when coverage drops, which is the property that actually protects the project. The
shortfall, its cause and the plan to close it are recorded in
[D-014](docs/DECISIONS.md#d-014--coverage-thresholds-are-pinned-to-the-measured-baseline). The
global figure is pulled down almost entirely by `src/adapters/*`, which sits at 0% because
exercising it requires framework renderers. Five new modules (`src/adapters/http.ts`,
`src/adapters/httpFetch.ts`, `src/adapters/auth.ts`, `src/adapters/descriptors.ts` and
`src/storage/encryption.ts`) ship without tests for now, which is what moved the global figures to
65/57/61/63; a second, smaller adjustment followed the correctness fixes that layer needed, which add
guarded branches by definition. The seven per-file gates below were not touched either time. That
lowering, and the tests it is owed, are recorded in
[D-030](docs/DECISIONS.md#d-030--global-coverage-thresholds-move-to-the-measured-baseline-while-the-new-modules-are-untested).

| Scope                          | Lines | Branches | Functions | Statements |
| ------------------------------ | ----- | -------- | --------- | ---------- |
| **Global**                     | 65%   | 57%      | 61%       | 63%        |
| `src/errors/sanitize.ts`       | 92%   | 85%      | 93%       | 90%        |
| `src/errors/normalize.ts`      | 87%   | 77%      | 92%       | 87%        |
| `src/errors/fingerprint.ts`    | 95%   | 82%      | 99%       | 95%        |
| `src/storage/idbCore.ts`       | 77%   | 66%      | 74%       | 74%        |
| `src/sync/syncManager.ts`      | 87%   | 72%      | 78%       | 81%        |
| `src/export/shortcut.ts`       | 92%   | 80%      | 74%       | 88%        |
| `src/export/reportTemplate.ts` | 85%   | 70%      | 80%       | 80%        |

The seven gated files are the ones where a subtle mistake is a security or data-loss bug: the
sanitizer, the normaliser, the fingerprint, the IndexedDB connection wrapper, the outbox, the
keyboard matcher and the report renderer. Everything else is held to the global floor.

**Raising a threshold is always welcome and never needs an ADR.** Lowering one does.

Excluded from the denominator entirely: `**/*.test.ts(x)`, `**/*.types.ts`, `**/*.constants.ts`,
`src/testing/**` and `src/index.ts`.

```bash
pnpm run test:coverage
# HTML report:
open coverage/index.html
```

Notes for writing tests that count:

- The test environment is **happy-dom**, with `globals: true` and `restoreMocks`, `clearMocks` and
  `unstubGlobals` all enabled. `vitest.setup.ts` is loaded before every file.
- Tests run in `forks`, so a test that leaves global state behind cannot leak into another file â€”
  but clean up anyway, with `destroyTelemetry()` in an `afterEach`.
- Use `@codewithrajat/rm-logvault/testing` rather than mocking the library: `createMemoryRepository()` mirrors the
  IndexedDB semantics (pending-only aggregation, atomic claiming, stale-lease requeue, retention), so
  a test that passes is exercising real logic.
- Use `createFakeTransport()` for every outbox branch: success, retryable, terminal, `Retry-After`,
  and a thrown transport failure.
- `fake-indexeddb` is available for tests that must go through `createDbConnection` itself.
- `fast-check` is available and is used for property-based tests of the sanitizer and the normaliser.
  Any invariant stated in `docs/SECURITY.md` or `docs/ARCHITECTURE.md` is a good candidate for a
  property.

---

## Pull request checklist

Copy this into the PR description and tick it honestly. An unticked box with an explanation is fine;
an unticked box that nobody noticed is not.

```markdown
### What

<!-- One paragraph. What changed, and what a consumer will observe. -->

### Why

<!-- The problem, or a link to the issue. -->

### Checklist

- [ ] `pnpm run verify` passes locally (Biome check, typecheck, tests, build, publint, attw, size, knip).
- [ ] A changeset is included (`pnpm exec changeset`), or the change is documentation-only and the paths prove it.
- [ ] New public API is exported from `src/index.ts` (or the relevant subpath) and documented in `docs/API.md`.
- [ ] New or changed options are in the `docs/CONFIGURATION.md` table with their real default, and the default is in `DEFAULT_OPTIONS` rather than inline.
- [ ] The public boundary still never throws. Any new fallible path returns a `Result` or is wrapped.
- [ ] Every new captured value goes through the sanitizer before storage and before export.
- [ ] No new runtime dependency. (If you think one is needed, open an issue first.)
- [ ] No new `any`, and no new type-aware-lint escape: the `no-unsafe-*` rules no longer exist, so `pnpm run typecheck` has to be green.
- [ ] `pnpm run size` still passes â€” the core is within the 37 kB min+gzip regression budget.
- [ ] Adapter changes are in the adapter's subpath, not the core entry.
- [ ] Tests cover the new behaviour, including the failure path, and the coverage thresholds still pass.
- [ ] Documentation is updated: `README.md` for anything user-facing, `docs/ARCHITECTURE.md` for anything structural, `docs/DECISIONS.md` if a decision was made.
- [ ] If a database version or an on-disk format changed, this is called out as breaking and the version was bumped additively.
- [ ] No `TODO`, no `console.log`, no commented-out code, and no `any`.

### Notes for the reviewer

<!-- Anything you are unsure about, anything you deliberately did not do, and why. -->
```

### What a reviewer will look for

1. **The invariants in [AGENTS.md](AGENTS.md).** They are not style preferences.
2. **Honest defaults.** A new option should default to the least invasive behaviour.
3. **Failure behaviour.** Every new branch needs an answer to "what happens when this throws?"
4. **The size budget.** A new feature in the core entry point has to earn its bytes, or move to a
   subpath.
5. **Tests that would fail if the change were reverted.** A test that passes both before and after is
   not a test.
6. **Docs that match the code.** A table row with a wrong default is worse than a missing row.

---

## Code style

Formatting and linting are both Biome's job, configured by `biome.json`. Do not argue with it; run
`pnpm run check:fix`, and do not add a `// biome-ignore` without a reason in a comment.

```json
{
  "formatter": {
    "enabled": true,
    "indentStyle": "space",
    "indentWidth": 2,
    "lineWidth": 100,
    "lineEnding": "lf"
  },
  "javascript": {
    "formatter": {
      "quoteStyle": "single",
      "jsxQuoteStyle": "double",
      "semicolons": "always",
      "trailingCommas": "all",
      "arrowParentheses": "always",
      "bracketSpacing": true
    }
  }
}
```

JSON files are formatted at a two-space indent too, and imports are sorted by the `organizeImports`
assist (enabled in `biome.json`). Markdown is **not** formatted by any tool, so keep prose lines near
100 characters wide by hand.

### TypeScript rules

- **`any` is an error** (`suspicious.noExplicitAny`), and so is casting through `unknown` to escape a
  type error. There is one honest gap: Biome does not do type-aware linting, so the rules that caught
  an `any` being *laundered* â€” `no-unsafe-assignment`, `no-unsafe-member-access`, `no-unsafe-call`,
  `no-unsafe-return`, `no-unsafe-argument` â€” plus `no-floating-promises` are no longer enforced by
  the linter. Use `unknown` and narrow; `pnpm run typecheck` under `strict`,
  `noUncheckedIndexedAccess` and `exactOptionalPropertyTypes` is what catches the rest. See
  [D-016](docs/DECISIONS.md#d-016--biome-replaces-eslint-and-prettier).
- **`import type` for type-only imports** (`style.useImportType`, which is a *warning*, so it will
  not fail `pnpm run check`). `verbatimModuleSyntax` is enabled, so a value import of a type will not
  compile anyway â€” that is the real enforcement.
- **`.js` extensions on relative imports.** The package is ESM (`"type": "module"`) and resolved with
  `moduleResolution: "Bundler"`, but the emitted output must be valid Node ESM, so the source writes
  `./foo.js` for `./foo.ts`. This is not a typo.
- **Explicit return types on exported functions.** Inference is fine internally; the public surface
  is a contract and the declaration files should not change because a helper's return type drifted.
- **`readonly` everywhere it is true.** This is now a review requirement rather than a lint rule â€”
  ESLint's `prefer-readonly` has no Biome equivalent â€” but the records and options interfaces are
  pervasively readonly, including `readonly T[]` for arrays.
- **`Maybe<T>` for optional members.** See [D-002](docs/DECISIONS.md#d-002--exactoptionalpropertytypes-with-maybet-widening).
- **`node:` protocol for builtins** (`import { readFile } from 'node:fs/promises'`).
- **No non-null assertions.** `style.noNonNullAssertion` is an **error** in `biome.json`, so `!` now
  fails `pnpm run check` â€” a change from the ESLint setup, where the equivalent was a warning. Write a
  guard. Tests, `src/testing/**`, `scripts/**` and `*.config.ts` are exempt by override.
- **`_`-prefixed parameters for intentionally unused arguments.** Biome's
  `noUnusedFunctionParameters` and `noUnusedVariables` both exempt an underscore prefix; the old
  ESLint `argsIgnorePattern: '^_'` setting is gone, but the convention is unchanged.
- **Prefer `Reflect.get` / `Reflect.apply` / `Reflect.set`** when touching a host global or a
  consumer-supplied object. It is how the library reads `window`, `console`, `crypto`, `indexedDB`
  and axios internals without triggering hostile getters.

### Security-related lint rules

These are errors, not warnings, and a suppression needs a comment explaining why:

| Rule                       | Reason                                                                                                                                                 |
| -------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `suspicious.noConsole`     | `console.*` is allowed only in `src/logger/consoleWriter.ts` and `src/adapters/angular.ts`, which preserves Angular's own console output. Events go through `logger`, which cannot recurse and cannot be re-captured. |
| `security.noGlobalEval`    | No dynamic code. Biome's recommended preset turns this on at error severity.                                                                           |
| `nursery.noImpliedEval`    | No `setTimeout('â€¦')`, no `new Function`. Recommended at error severity, so it runs under `preset: "recommended"`.                                      |
| `security.noScriptUrl`     | No `javascript:` URLs anywhere â€” including, deliberately, as an endpoint value.                                                                        |

### Writing style

- **Comments explain why.** The code says what. A comment that restates the line is noise; a comment
  that records the constraint, the hazard or the rejected alternative is the reason the file is
  readable in two years.
- **JSDoc on every export**, with `@param`, `@returns` when it is not obvious, and at least one
  `@example` that actually compiles. The examples in `src/` are the ones reused in `README.md` and
  `docs/API.md`, so they are load-bearing.
- **No abbreviations in public names.** `fingerprint`, not `fp`; `componentStack`, not `cStack`.
- **`unknown`, not `object`,** for a value of unknown shape. `object` invites unsafe member access.
- **One concern per module.** If a file needs "and" to describe it, it is two files.
- **Guard clauses over nesting.** The library's hot paths are a sequence of early returns, and that
  is deliberate: it mirrors the gate order documented in
  [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md#2-the-capture-pipeline).

---

## Adding things

### Adding an adapter

1. **Create `src/adapters/<name>.ts`.** The core must not import it, and it must not import
   framework code at module scope beyond types where possible.
2. **Route every capture through `captureError`** with a distinct `source`. If the framework is not
   already in the `ErrorSource` union, that is a type change with a corresponding entry in
   `docs/DECISIONS.md` â€” see [D-004](docs/DECISIONS.md#d-004--errorsource-gains-vue-angular-and-svelte)
   for the reasoning template.
3. **Never replace a framework hook.** Chain it: capture the previous handler, call it afterwards, and
   let its exceptions be its own problem. Every existing adapter does this, and the Vue adapter's
   JSDoc explains why (Vue allows exactly one `errorHandler`, and silently discarding someone else's
   is a classic way to break their monitoring).
4. **Return a detach function** from anything that installs. `initTelemetry` needs it for the
   `logSource` path, and users need it for their own teardown.
5. **Wrap every callback.** A consumer callback that throws must not break the framework, and the
   framework's internals must not throw into the consumer.
6. **Add the entry to `tsup.config.ts`** (`entry` and `external`), to the `exports` map, to
   `typesVersions`, and to `files` if it needs new artefacts.
7. **Treat the framework as an optional peer.** Add it to `peerDependencies`,
   `peerDependenciesMeta` (with `optional: true`) and `devDependencies`, and add it to `knip`'s
   `ignoreDependencies`.
8. **Document it**: a quick start in `README.md` (ten lines or fewer), a section in `docs/API.md`, a
   row in the subpath-exports table, and an entry in the relevant FAQ heading if one exists.
9. **Test it**, including the chaining case and the case where the framework hook throws.

### Adding a transport

1. **Implement `RemoteTransport`** â€” a `name` and a `send(request): Promise<TransportResponse>`.
2. **Never read more than you need.** The request carries an already-serialised, already-sanitized
   `body`. Do not deserialise it to "fix it up"; that is a security boundary, not a convenience.
3. **Throw to signal a retryable failure.** Return a `TransportResponse` â€” including for a `500`. An
   HTTP error is not a transport error.
4. **Parse `Retry-After` with `parseRetryAfter`** if your transport sees the header. It handles both
   the delta-seconds and HTTP-date forms and clamps to the ceiling.
5. **Guard every global.** `fetch`, `navigator.sendBeacon` and `CompressionStream` may all be absent.
   Feature-detect per call, not at module scope.
6. **Add it to `src/sync/`** if it is generic, or ship it as a separate package if it depends on a
   heavy SDK. A transport is the seam that keeps OTLP and Sentry envelopes from becoming hard
   dependencies â€” do not break that.

### Adding a document

1. **Put it in `docs/`** unless it is one of the root-level convention files (`README.md`,
   `CHANGELOG.md`, `CONTRIBUTING.md`, `AGENTS.md`, `llms.txt`, `llms-full.txt`, `SECURITY.md`).
2. **Add a row to `docs/README.md`** with a one-line description.
3. **Add it to `llms.txt`** under `## Docs`, with a short description and an absolute GitHub URL.
4. **Add the facts to `llms-full.txt`** if it is API, option, constant or wire-format material rather
   than prose.
5. **Link it from `README.md`** â€” the `## Documentation` table at the bottom is the index.
6. **Verify every claim against the source.** A table row with a wrong default is worse than a
   missing row, because it is trusted. Quote the values rather than recalling them, and cite the file
   they came from when a reader might reasonably doubt it.

### Adding a decision

If you make a structural choice with real alternatives, add an entry to `docs/DECISIONS.md` rather
than a comment. Use the existing format â€” `Status`, `Context`, `Decision`, `Alternatives considered`,
`Consequences` â€” and be specific about the alternative you rejected and why. The rejected options are
usually the most valuable part of an ADR, because they are what stops the same debate from happening
twice.

If the decision is a breaking change to the persisted format or the public API, also add a
`BREAKING CHANGE:` footer to the commit and mention it in the changeset.

---

## Reporting bugs and requesting features

- **A bug** â€” open an issue with the version, the environment (browser, bundler, SSR or not), the
  resolved configuration (`getState().options`), the `onInternalError` output, and
  `getTelemetryStatus()`. That set of five resolves most reports without a round trip.
- **A security issue** â€” do **not** open a public issue. Use the private advisory flow described in
  [SECURITY.md](docs/SECURITY.md#11-disclosure-policy).
- **A feature** â€” open an issue describing the problem before the solution. Several plausible
  features are explicitly and permanently out of scope (session replay, source maps, a server,
  alerting); check [README.md](README.md#roadmap--not-in-scope) first.
- **A new runtime dependency** â€” open an issue rather than a pull request. Zero dependencies is a
  headline property of the package, and a dependency needs a stronger argument than convenience.

## License

By contributing you agree that your contributions are licensed under the [MIT License](LICENSE), and
you confirm that you have the right to submit them.
