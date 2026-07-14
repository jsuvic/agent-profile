# I3: Permission-only inspection and reconciliation model

## Parent spec or request

`docs/specs/phase-31/001-permission-posture-lifecycle.md`

## Intent summary

Explain actual client behavior from layered permission metadata without reading
unrelated settings or pretending unavailable scopes are safe.

## Behavior slice

Repository permission sources are inspected automatically; consent-gated
user/machine permission fields may be added. The normalized evidence model
computes declared/effective/unknown posture, source precedence, confidence, and
lossless repair/adopt/review/leave options.

## Non-goals

- Writing profile or client settings.
- Reading credentials, environment values, hooks, or arbitrary config.
- Reimplementing a complete client rule engine.

## Acceptance criteria

- Phase-31 acceptance criteria 8-9, limited to inspection/evaluation.
- Permission arrays and scalars follow documented target precedence/merge
  behavior.
- Adoption is absent when behavior is not losslessly representable.
- Unreadable/remote/session sources produce `unknown`, never `aligned`.

## Expected RED proof

Layered Claude fixtures misclassify project/local asks and scalar posture;
consent and forbidden-key sentinels fail; reconciliation options cannot be
derived.

## Expected GREEN proof

All source/precedence/consent/unknown/reconciliation table rows pass with no
forbidden reads and deterministic normalized evidence.

## Seam under test

`inspectPermissionPosture(root, declaredPlan, inspectionConsent) -> PermissionEvidence + ReconciliationOptions`.

## Allowed mock boundary

Temporary filesystem fixtures representing documented config scopes. Do not
mock owned parsers/evaluators; network/client processes must be failing
sentinels, not mocks returning success.

## Test command guidance

Run focused core/doctor inspection tests with sentinels, then full doctor tests,
check, lint, and verify:pack.

## Likely file ownership

- Client permission metadata readers/parsers
- Neutral evidence/reconciliation types and evaluator
- Layered config fixtures and privacy sentinels

## Dependencies

`sequenced` after I1.

## Parallelism notes

Parallel-safe with I2 after I1; coordinate canonical mapping status types.

## Contract impact

Adds a normalized evidence model. Existing doctor output remains unchanged
until I6 adopts the model.

## Security impact

Permission-field allowlist, explicit broader-scope consent, no symlink
following, no secret files/values, no network, no client invocation, and
redacted reports.

## Documentation impact

Inspection scopes, confidence meanings, consent behavior, native verification
instructions.

## Implementation context

Keep filesystem collection thin and the merge/evaluation model pure. Record
source scope/path category without echoing unrelated file contents.

## Review expectations

Require runtime sentinels for forbidden files/keys/process/network access and a
table for every source precedence collision and unrepresentable adoption case.
