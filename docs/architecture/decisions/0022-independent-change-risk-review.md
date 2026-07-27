# ADR 0022: Independent Full-Change Risk Review

## Status

Accepted 2026-07-24 with phase-33/001.

## Context

Spec review answers whether an implementation matches the approved request,
and code-quality review answers whether that contribution is maintainable.
Neither objective reliably challenges an incomplete spec, an unchanged
consumer, or an integration defect accumulated across implementation cycles.
Broadening both existing reviewers would mix objectives and preserve their
anchoring to implementer context.

## Decision

Add a dedicated `change-risk-reviewer` after spec and code-quality review. Its
initial and final clean-room passes use a fresh reviewer with complete and
lossless access to the accumulated change snapshot (manifest-first, with
instructions and ability to read every component, rather than eager full-diff
injection) and governing rules without implementer claims, prior praise, or
prior finding lists. Remediation passes verify known
fingerprints and independently search the complete updated snapshot for new
findings.

The generated reviewer identifier resolves model policy through the existing
provider-neutral `critical-reviewer` role, preserving mapping-v2, mapping-v3,
target-native effort, and exact per-client overrides without adding a role ID.

## Rationale

An independent objective and fresh context make it possible to challenge both
the implementation and the sufficiency of its spec. Reviewing the whole
change and reachable consumers addresses the repeated gap between bounded
implementation cycles and the integrated pull request.

## Consequences

Positive:

- Compliance, maintainability, and product-risk review have clear ownership.
- Cross-consumer and cross-cycle defects are explicitly in scope.
- Clean-room confirmation reduces anchoring on earlier reviewer conclusions.

Negative:

- The workflow uses more reviewer invocations and context.
- Complete-snapshot preparation must handle both committed and uncommitted
  changes.
- Independent review still improves discovery rather than guaranteeing it.
