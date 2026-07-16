# I4: Consented source-free model probes

## Parent spec or request

`docs/specs/phase-31.5/001-model-selection-lifecycle.md`

## Intent summary

Provide one bounded client-adapter boundary that can validate selected exact
models without exposing repository content, credentials, account data, or raw
client output.

## Behavior slice

Given explicit consent and a bounded probe plan, run fakeable client commands
from a fresh empty directory using a fixed content-free prompt, normalize each
result to the approved closed set, redact/discard raw output, and return only an
ephemeral report. With no consent, no client process starts.

## Non-goals

- Catalog mutation, config writes, provider APIs, or credential access.
- Interactive picker scraping or arbitrary user prompts.
- Persisting availability, client version, output, or timestamps.

## Acceptance criteria

- Pin a documented non-persistent invocation contract per client or return
  `unsupported-client`/`unverified`; public ambiguity cannot be guessed.
- Before execution, the plan identifies enabled clients, exact candidates,
  maximum calls, and quota/provider contact.
- Calls collapse by distinct exact model, use the highest catalog-supported
  intended effort, test alternatives only after preferred unavailability, and
  stop on auth/provider/temporary-limit states.
- Result precedence and evidence patterns are table-driven for all seven
  statuses; ambiguous output is `unknown`.
- Time, output size, process count, and temporary-directory lifetime are
  bounded.
- Runtime sentinels prove normal/declined/CI paths start no client/network and
  probes cannot read the repository, secret stores, or history.

## Expected RED proof

No process-isolated probe port or normalized model-availability result exists;
current init/upgrade cannot prove that declining starts zero processes.

## Expected GREEN proof

Fake Codex/Claude/Tabnine executables produce every normalized outcome and
sentinels prove consent, source isolation, redaction, bounds, and no persistence.

## Seam under test

`probe request -> normalized ephemeral result`.

## Allowed mock boundary

Only unmanaged client subprocess execution, temporary filesystem, and clock.
Never mock the probe classifier/orchestrator under test.

## Test command guidance

Run focused CLI probe tests with fake executables and sentinels, then CLI/core
workspace suites and network/source/secret safety tests.

## Likely file ownership

- CLI model-probe port, process adapters, classifier, and redaction
- fake client fixtures and security sentinels
- target invocation evidence in research/docs

## Dependencies

I1.

## Parallelism notes

Parallel-safe with I2 and I3 after I1. Owns no wizard/upgrade presentation.

## Contract impact

New explicit read-only external action. Normal commands remain offline.

## Security impact

This is the primary security boundary: no source/history/secret reads, fixed
prompt, empty external cwd, no raw output persistence, and explicit consent.

## Documentation impact

Privacy notice, exact call-bound explanation, client support table, and failure
meaning.

## Implementation context

Official model/API availability does not prove safe CLI invocation. If a client
cannot satisfy the source-free contract, return an honest unsupported/manual
result.

## Review expectations

Use runtime sentinels, not import inspection alone. Audit command arguments,
cwd, environment handling, time/output bounds, redaction, and persistence.
