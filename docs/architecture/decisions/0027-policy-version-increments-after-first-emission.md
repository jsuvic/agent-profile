# ADR 0027: Workflow-Policy Version Increments After First Emission

## Status

Accepted 2026-07-28 with phase-33/002.

## Context

The review policy version contract lists the changes that increment the
workflow-policy version: snapshot completeness, the closed result envelope,
priority/disposition semantics, retry or confirmation limits, escalation
outcomes, high-risk triggers, and promotion thresholds.

Read literally, that rule has no exception for changes made before anything
ships. Phase-33 has now amended the spec twice before first emission. The
2026-07-27 amendment kept `change-risk/v1` on the stated reasoning that no
`change-risk/v1` artifact had been implemented or released. Phase-33/002
changes both the closed result envelope (two new required finding fields) and
escalation outcomes (a new guard-required transition), so it hits the rule
twice - yet still has no emitted artifact and no persisted record to protect.

Applying the rule literally would increment to `change-risk/v2` while `v1`
had zero artifacts and zero records anywhere in the world. It would also
invalidate the constant already exported by the policy source and every test
asserting it, and I3's records would begin at `v2` with no `v1` corpus,
leaving the `change-risk/v1` versus `legacy-external` distinction reading
oddly in perpetuity.

Continuing to rely on unwritten precedent is the alternative failure: it is a
quiet reinterpretation of a stated contract, the same class of unstated
invention this phase's own reviews have flagged elsewhere.

## Decision

The workflow-policy version increments on a contract change only once a
`change-risk/v1` artifact has been emitted or a `review-learning/v1` record
persisted. Amendments made before first emission are absorbed into the current
version.

The precondition is written into the versioning contract rather than left as
habit, because this is the second amendment to depend on it.

Phase-33/002 therefore keeps `change-risk/v1`.

## Consequences

Pre-release contract churn is absorbed, so the version identifier stays
meaningful: it distinguishes semantics that some persisted artifact was
actually produced under.

After first emission the rule tightens to its literal reading, and no further
absorption is available. The first emitted artifact is the point of no return
for `v1` semantics.

The precondition is now testable rather than a judgement call, and the policy
source states it.

Reviewers of future amendments must check emission status before assuming a
version bump is or is not required, which is a small additional step at
amendment time.

## First post-emission increment

On 2026-07-30, Phase 33's first reviewer and orchestration artifacts had been
generated on PR #140. The subsequent ambiguity repair changed the finding
fingerprint wire encoding from delimiter concatenation to a structured JSON
tuple. Because `change-risk/v1` artifacts now existed, the pre-emission
exception no longer applied. The workflow-policy version therefore advances
to `change-risk/v2`; the category taxonomy and learning-record schema remain
independently versioned at `v1`.

## Alternatives Considered

- **Increment to `change-risk/v2`.** Rejected: applies the rule literally and
  without exception, which is the stronger position on principle, but creates
  a phantom version that protects nothing while costing a constant change,
  test churn, and a permanently odd record-provenance story.
- **Keep relying on unwritten precedent.** Rejected: it works, but leaves a
  stated contract quietly reinterpreted twice, which is exactly the failure
  mode this phase exists to catch.
