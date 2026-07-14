# I6: Doctor posture severity and ownership-aware validation

## Parent spec or request

`docs/specs/phase-31/001-permission-posture-lifecycle.md`

## Intent summary

Make Doctor distinguish safety failures from usability limitations so users can
trust errors without being punished for intentional aligned local activation.

## Behavior slice

Doctor consumes declared posture, generated ownership, effective evidence, and
mapping status to emit the binding Phase-31 issue/severity matrix and an
overall summary that never calls unknown state aligned.

## Non-goals

- Mutating settings.
- Enforcing client runtime policy.
- Complete enterprise/remote policy integration.

## Acceptance criteria

- Phase-31 acceptance criterion 11.
- Every `LINT-PERM-003` through `008` row has table-driven code, severity,
  expected/actual, redaction, and guidance assertions.
- A dangerous Claude value supplied by `.claude/settings.local.json` retains
  risk-based error severity, names that exact source, explains the effective
  behavior, and states that it does not configure Codex or Tabnine.
- Intentional local activation within declared posture passes.
- Legacy Autonomous remains governed by its old sandbox rule and gets an
  informational migration offer only.

## Expected RED proof

Current Doctor can blame generated `.claude/settings.json` for a merged value
that actually comes from `.claude/settings.local.json`, flags trusted local as
dangerous drift, treats stricter/looser states too similarly, and lacks
activation/mapping rows.

## Expected GREEN proof

The full severity/ownership/status matrix passes, local-source attribution and
cross-client guidance are exact, output order is deterministic, and unknown
state blocks an aligned summary without causing unsupported-client noise to
become a safety error.

## Seam under test

`evaluatePermissionDoctorIssues(plan, evidence, ownership, mapping) -> ordered findings + summary`.

## Allowed mock boundary

None for the evaluator. Higher-level integration may use temporary config
fixtures; do not mock owned readers or mappings.

## Test command guidance

Run focused doctor permission tables and integration fixtures, then full doctor,
CLI tests, check, lint, verify:pack, and package dry-run.

## Likely file ownership

- Doctor posture evaluator and issue envelope
- Target-specific doctor adapters/readback
- Doctor CLI/UI presentation and fixtures
- Phase-04 spec amendment and remediation docs

## Dependencies

`sequenced` after I1-I3.

## Parallelism notes

Can proceed in parallel with I4 after canonical evidence/mapping inputs settle;
coordinate I5 post-activation readback.

## Contract impact

Changes permission finding severity intentionally: looser-than-declared becomes
an error, unknown becomes a warning, stricter/incomplete becomes a warning, and
documented limitation becomes info.

## Security impact

No mutation, no secret values, no unsafe reads, no runtime-enforcement claim,
and hard-denial failures remain errors.

## Documentation impact

Doctor issue table, CLI remediation, security/trust model, migration notes.

## Implementation context

Preserve deterministic issue ordering and existing redaction. Reuse ownership
metadata rather than treating all local differences as generated drift.

## Review expectations

Require a spec-to-test matrix for every code/severity row, runtime sentinels for
secret/non-generated reads, and explicit proof that unknown cannot summarize as
safe/aligned.
