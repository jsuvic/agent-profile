# I7: Offline Doctor model policy and explicit recheck

## Parent spec or request

`docs/specs/phase-31.5/001-model-selection-lifecycle.md`

## Intent summary

Make model governance inspectable after setup without confusing a newer
recommendation, an unsupported target surface, and confirmed account
unavailability.

## Behavior slice

`doctor --models` reports profile/lock/catalog/ownership consistency and target
capability status entirely offline. Adding explicit `--probe` reuses the
consented source-free adapter and adds ephemeral availability rows without
writing state.

## Non-goals

- Automatic repair, remapping, provider login, or update installation.
- Warning merely because Tabnine uses an older organization-approved model.
- Claiming runtime enforcement without an inspectable surface.

## Acceptance criteria

- Offline rows distinguish current, supported-legacy, deprecated, retired,
  uncatalogued/private, missing provenance, drifted configuration, advisory,
  unsupported, and unverified.
- A newer preferred model is informational; a deprecated/retired selection is
  actionable according to catalog evidence; confirmed unavailable is separate
  probe evidence.
- Normal Doctor and `doctor --models` start no client/network process.
- `--probe` repeats consent, uses the I4 result set, is read-only, and does not
  alter severity based on ambiguous `unknown` evidence.
- Human and JSON outputs use stable codes and redact raw client output/account
  data.
- Tabnine private/legacy rows explain organization scope without judging model
  quality.

## Expected RED proof

Doctor has no model-policy category or explicit source-free availability
recheck and cannot distinguish catalog age from account availability.

## Expected GREEN proof

Table-driven Doctor/CLI tests cover every offline and probe state, severity,
stable JSON code, no-call path, and zero filesystem mutation.

## Seam under test

`profile + lock + catalog + ownership + optional probe result -> Doctor report`.

## Allowed mock boundary

Probe port and filesystem metadata adapter only. The Doctor classifier remains
real.

## Test command guidance

Run focused Doctor model-policy and CLI JSON tests with network/filesystem
sentinels, then Doctor/CLI/core suites, check, and pack verification.

## Likely file ownership

- Doctor model-policy rules/codes and exports
- CLI doctor flag parsing/presentation/JSON fixtures
- focused Doctor and end-to-end tests

## Dependencies

I4 and I6.

## Parallelism notes

Can begin after stable lock/probe contracts; coordinate shared CLI doctor help
and JSON presentation.

## Contract impact

Adds opt-in Doctor category/flag; default Doctor output stays unchanged unless
the spec explicitly freezes an additive summary.

## Security impact

Offline by default; explicit probe is read-only and source-free; no raw/account
data in findings.

## Documentation impact

Doctor codes, severity meanings, offline/probe distinction, and remediation
guidance.

## Implementation context

Reuse deterministic capability status from I1; Doctor must not recalculate
target support from strings.

## Review expectations

Audit stable codes/status precedence, JSON redaction, no-call/no-write
sentinels, and enterprise Tabnine wording.
