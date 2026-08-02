# Phase 33

Change-risk review assurance for the generated SDD/TDD workflow: an
independent full-change reviewer, bounded remediation and escalation,
versioned review-learning records, recurring-finding promotion, and a
provider-neutral external-review boundary.

The generated post-implementation pipeline has three independent review
purposes. `spec-conformance-reviewer` checks the complete accumulated change
against authoritative documented intent; `code-quality-reviewer` checks
maintainability; and `change-risk-reviewer` checks product-risk and reachable
consumer gaps. Their results stay separate. I20 does not add a Standards axis;
Phase 34 owns pre-implementation review of whether a specification itself is
well designed.

## Specs

- `001-change-risk-review-assurance.md` - approved 2026-07-24.

## Issues

- `issues/001-change-risk-reviewer.md` (I1)
- `issues/002-bounded-review-remediation.md` (I2)
- `issues/003-review-learning-records.md` (I3)
- `issues/004-recurring-finding-promotion.md` (I4)
- `issues/005-historical-review-backfill.md` (I5)
- `issues/006-published-workflow-validation.md` (I6)
- `issues/007-cluster-key-derivation.md` (I7)
- `issues/008-reviewer-budget-exhaustion.md` (I8)
- `issues/009-reviewer-field-shape-guard.md` (I9)
- `issues/010-reviewer-budget-observability.md` (I10)
- `issues/011-reviewer-locator-value-constraints.md` (I11)
- `issues/012-ledger-write-snapshot-conflict.md` (I12)
- `issues/013-reviewer-field-completeness-guard.md` (I13)
- `issues/014-self-applied-artifact-drift-guard.md` (I14)
- `issues/015-artifact-guard-local-exemption-derivation.md` (I15)
- `issues/016-artifact-guard-mechanism-disclosure.md` (I16)
- `issues/020-spec-conformance-reviewer.md` (I20)

Task states are tracked in the root `TASKS.md` ledger.
