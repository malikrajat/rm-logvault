# Security Policy

`@codewithrajat/rm-logvault` runs inside other people's applications, on their users' machines, and it reads values
that were never meant to be read — thrown errors, hostile objects, malformed storage rows. A defect
here is a privacy incident in someone else's product, so security reports are treated as the highest
priority in this repository.

This file is the disclosure policy. The engineering detail — threat model, redaction design, the
guarantees and their enforcement — lives in [docs/SECURITY.md](docs/SECURITY.md).

---

## Reporting a vulnerability

**Please do not open a public issue for a security report.**

Use GitHub's private vulnerability reporting:

1. Go to the [Security tab](https://github.com/malikrajat/rm-logvault/security) of this repository.
2. Choose **Report a vulnerability**.
3. Describe the issue and, if you can, include a minimal reproduction.

If you cannot use GitHub, open a **public** issue that contains no details and asks a maintainer to
make private contact. Do not put the vulnerability in the issue body.

### What to include

A useful report contains:

- The affected version, and the commit if you have it.
- The smallest input that demonstrates the problem — ideally a failing test against
  `sanitizeValue`, `sanitizeText`, `sanitizeUrl`, `normalizeError`, `renderDiagnosticsReport` or the
  storage layer.
- The impact in one sentence: what leaks, to whom, and under what conditions.
- Whether the attacker needs to control an input, or merely observe an output.

Reports of the form "this regex can be bypassed with input X" are welcome and are exactly the class
of bug this project cares most about.

### What to expect

| Stage                                               | Target                                  |
| --------------------------------------------------- | --------------------------------------- |
| Acknowledgement of your report                      | within **3 working days**               |
| Initial assessment and severity                     | within **7 working days**               |
| Fix released for a confirmed high or critical issue | within **30 days**                      |
| Public disclosure                                   | coordinated with you, after a fix ships |

We will keep you informed at each stage, credit you in the release notes unless you prefer otherwise,
and tell you plainly if we conclude the report is not a vulnerability and why.

---

## Supported versions

Only the latest published version is supported. Security fixes are released as patch versions on the
`latest` dist-tag, and a fix is never backported to an older minor or an older major.

| Version      | Supported                              |
| ------------ | -------------------------------------- |
| Latest `1.x` | ✅                                     |
| Older `1.x`  | ❌ — fixes are never backported        |
| `< 1.0.0`    | ❌ — pre-1.0 releases are not maintained |

---

## What counts as a vulnerability

Anything that breaks one of the guarantees the library makes. The most important are:

- **Redaction bypass.** A secret reaching `sanitizeValue`, `sanitizeText`, `sanitizeUrl`,
  `sanitizeStack` or `sanitizeErrorRecord` and surviving into a stored record, an uploaded batch or an
  exported report. Include the exact string; the sanitizer is tested against a seeded corpus and a
  bypass of it is a real finding.
- **Report XSS.** Any way to make a generated diagnostics report execute script, load a remote
  resource, or escape the `<script type="application/json" id="diagnostics-data">` element. The
  report is designed to be safe by construction; a counterexample is a serious bug.
- **Reading what must never be read.** Any code path that touches a request or response body,
  cookies, `localStorage`/`sessionStorage`, an auth header value, or a form value. See
  [I-2](AGENTS.md#i-2-never-read-bodies-cookies-localstorage-auth-headers-or-form-values).
- **Data egress outside the configured endpoint.** The REST endpoint (or a custom `transport`) is the
  only permitted network egress. A finding that something else is contacted is a vulnerability.
- **Throwing out of the public API.** Any exported function that can throw, or a returned promise
  that can reject when its signature says otherwise. This is a denial-of-service vector inside the
  host application's error path.
- **Prototype pollution** through `sanitizeValue` or any configuration merge.
- **Regex denial of service** in any sanitizer pattern.
- **Consent or erasure failure.** `consent()` returning `false` failing to stop capture, storage or
  upload; or `clearTelemetryData()` failing to erase what it claims to erase.

## What is not a vulnerability

These are documented, intentional properties. Reporting them is fine, but they will be closed as
working as intended:

- **The export shortcut is obscurity, not access control.** Anyone who knows the key combination can
  produce a report on their own machine. That report contains only data already stored locally, and
  that data is already sanitized. Gate it with `shortcut.allow` if you need more.
- **A bare short secret in prose is not detected.** `sanitizeText('failed with hunter2')` keeps
  `hunter2`. A seven-character word is indistinguishable from ordinary prose, and no pattern can catch
  it without redacting the message. Use `redaction.extraPatterns` if you must catch a known value.
- **Records remain readable in DevTools.** Data is stored in IndexedDB unencrypted by default. At-rest
  encryption is on the roadmap; until it exists, treat the browser profile as trusted.
- **A determined local attacker can read or clear the vault**, or call `initTelemetry` themselves.
  The library defends against disclosure through the report and through the network, not against
  someone with local code execution.
- **Third-party frameworks, bundlers and browsers.** Report those upstream.

---

## Supply-chain posture

For consumers evaluating the dependency:

- **Zero runtime dependencies.** `dependencies` is absent from `package.json`. The supply chain is
  this repository and nothing else.
- **No install scripts.** There is no `preinstall`, `install` or `postinstall` hook, so installing the
  package executes no code.
- **Published with provenance.** `publishConfig.provenance` is `true`, so publishing from CI produces a
  Sigstore-backed attestation linking the tarball to the workflow and commit that built it.
- **`files` allow-list.** Only `dist`, `docs`, `README.md`, `CHANGELOG.md`, `CONTRIBUTING.md`,
  `SECURITY.md`, `LICENSE`, `llms.txt` and `llms-full.txt` are published, and
  `scripts/copy-extra-files.mjs` fails the build if any of them is missing or empty. No sources, no
  tests, no configuration.
- **SBOM.** A CycloneDX SBOM is generated and validated on every run with `pnpm sbom`, and stored
  nowhere: CI deliberately retains no artifacts, so the SBOM is reproducible output rather than a
  file that can go stale.
- **Continuous scanning.** `pnpm audit` and OSV run in CI, and the lockfile is committed.
- **Dependency cooldown.** A version published less than seven days ago is never installed
  (`minimumReleaseAge`), so a compromised release is not merely detectable but unreachable.
- **2FA-enforced publishing**, and framework peers are `optional` — installing `@codewithrajat/rm-logvault` never pulls
  React, Vue, Angular, axios or TanStack Query.

---

## For maintainers

If you are triaging a report, the relevant invariants are collected in
[AGENTS.md](AGENTS.md#1-invariants-that-must-never-be-broken) and the enforcement points are listed in
[docs/SECURITY.md](docs/SECURITY.md). A fix for a redaction or XSS finding **must** add a regression
test to the seeded corpus in `src/errors/sanitize.test.ts` or
`src/export/reportTemplate.test.ts` before it is merged — the corpus is the mechanism that stops the
same class of bug from returning.
