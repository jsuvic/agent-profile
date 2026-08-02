# Proposed patch: resolve f6460ae no-progress guard obligations

Status: proposed only; not applied.

## Stable fingerprint identity

- Scope: historical corpus normalization and its focused validator test.
- Unsafe condition: a synthetic location symbol derived from review wording
  changes the canonical fingerprint when only the wording changes.
- Proposed guard: use a real source symbol when evidence supplies one;
  otherwise omit `location.symbol`, persist a separate stable sanitized defect
  discriminator, and add a wording-only mutation test proving fingerprint
  stability.
- Cluster evidence: `parsing-validation+missing-validation`.

## Cumulative promotion decisions

- Scope: historical promotion summary decision and focused parity coverage.
- Unsafe condition: selecting one highest threshold drops protections earned
  by systemic-P1 and second-occurrence thresholds.
- Proposed guard: compute the cumulative earned-action set from the shared
  policy projection; assert that third occurrence retains applicable earlier
  protections and adds the mechanical-guard obligation.
- Cluster evidence: `contract-completeness+incomplete-propagation`.

Human approval and a separately reviewed implementation change are required
before either proposal may be applied.

## Approval

Both proposals APPROVED 2026-08-02 as a separately reviewed remediation.
Each blocker was independently confirmed against the artifacts rather than
accepted on report.

Blocker 1 is confirmed and is NOT waivable. The synthetic symbols are the
remediation sentence slugified, for example
`review:update-generated-targets-together-with-the-adopted-lock`, and they sit
inside the canonical fingerprint. Rewording a review comment therefore changes
the identity of the defect it describes. This contradicts the I5 acceptance
criterion "Every normalized finding has a stable fingerprint", so it is a
criteria failure and not a quality preference. The proposed guard is accepted
as written, including the wording-only mutation test, which is the only form
of proof that actually demonstrates stability.

Blocker 2 is confirmed. `promotionDecision` in the generator early-returns a
single `[threshold, action]`, while the shared policy in
`packages/compiler/src/change-risk-promotion.ts` computes each obligation
independently and cumulatively (`earnsSecondOccurrenceProtection =
occurrence >= 2`). A third-occurrence category therefore loses the regression
test and scoped rule it had already earned.

The approved remediation goes one step FURTHER than proposed: do not add
parity coverage over the generator's private copy of the threshold table.
DELETE the copy and call the shared policy projection. Parity tests over a
duplicated table institutionalize the duplication and only detect the next
divergence after it ships; the duplication is the defect. If the projection is
not directly callable from a docs generator, that seam is the thing to fix.

Two candidate defects were examined and REJECTED as non-defects. Recording
them so a later session does not re-open them:

- Aggregating promotion occurrence by `category` is CORRECT. ADR 0026 states
  that cluster identity and promotion identity deliberately diverge and that
  the record persists cluster events separately from category counts.
- The absence of derived cluster events in these records is CORRECT. They are
  `legacy-external` reviews predating cluster keys; deriving keys retroactively
  would be exactly the fabricated execution data the brief forbids.

Independently reconciled at approval time: eight records, 126 findings,
23 P1 / 103 P2, and all eight per-PR counts match the approved snapshot
exactly. The corpus data is sound; both blockers are in the derived layer
above it, which is why the snapshot is worth preserving rather than
regenerating from scratch.

I5 stays `in-progress` and uncommitted. The remediation is a fresh reviewed
change against the preserved snapshot, and I5 may only be declared done after
a clean handoff that is not `NO_PROGRESS`.

## Remediation status (2026-08-02)

Blocker 2 is FIXED. `changeRiskEarnedObligations` in
`packages/compiler/src/change-risk-promotion.ts` is now the single threshold
ladder; `evaluateChangeRiskPromotion`, the generator, and the corpus test all
call it, and the summary gained an `Earned obligations` column. Seven
third-occurrence categories now correctly retain the regression test and
scoped rule they had already earned.

Worth recording: the corpus test had ALSO reimplemented the same
single-threshold selection, so it reproduced the defect it existed to catch
and could never have failed on it. This is the concrete case for deleting
duplicated policy rather than adding parity coverage over it.

Blocker 1 is NOT fixed, and implementation showed the approved proposal
cannot be built as written. Measured against the corpus:

- The prose symbols are load-bearing for uniqueness. Omitting
  `location.symbol` as proposed collapses 126 findings onto 44 fingerprints
  (82 collisions), because `deriveChangeRiskFingerprint` also nulls `line` by
  design, so same-category/contract/path/unsafe-condition findings coincide.
- The corpus test asserts both `finding.fingerprint ===
  deriveChangeRiskFingerprint(...)` and 126 DISTINCT fingerprints. Those two
  assertions together are satisfiable only if something finding-specific sits
  in the four canonical fields -- today that is the prose.

So the acceptance criterion's implied per-finding fingerprint uniqueness is in
direct tension with a prose-free fingerprint. This needs an owner decision,
not an implementation choice:

- **Option A -- stable source discriminator in the identity.** Replace the
  prose symbol with a rewording-immune source identity. `sourceThreadOrdinal`
  is present on all 126 findings and unique within every record. Keeps 126
  distinct fingerprints and the existing assertions. Cost: `location.symbol`
  then holds a review-thread ordinal rather than a source symbol, which is
  semantically wrong for a field meaning "symbol at this location".
- **Option B -- structural fingerprint plus a separate finding id.** Let the
  fingerprint be the honest structural identity (44 distinct, stable, no
  prose) and add a distinct `findingId` carrying PR plus thread ordinal for
  per-row identity. Semantically correct, and the 44 are arguably the real
  defect identities. Cost: amends the I5 acceptance criteria and the test's
  126-distinct-fingerprints assertion.

Option B is recommended. The 82 "collisions" are not data loss; they are the
shared fingerprint design doing what ADR 0026 describes, and manufacturing
uniqueness by feeding prose into the identity is precisely the defect blocker
1 names. Option A removes the prose but keeps the shape that invited it.

### Option B selected and implemented (2026-08-02)

Blocker 1 is FIXED. `location.symbol` is null for all 126 findings, the
sanitized wording is retained outside the identity as `defectDiscriminator`,
and per-finding identity is `findingId` (`pr-<n>#thread-<ordinal>`), derived
from review-thread position and therefore immune to rewording. Fingerprints
are recomputed with `deriveChangeRiskFingerprint` itself rather than a
reimplementation: 126 distinct `findingId` over 44 distinct fingerprints.

A wording-only mutation test now proves the property directly -- it asserts no
canonical fingerprint contains `review:`, the sanitized summary, or the safe
path, so no rewording can reach identity.

Implementation surfaced one consequence beyond the stated options, resolved
narrowly rather than by a version bump: `validateReviewLearningRecordV1`
enforced per-record fingerprint uniqueness, which is the SAME conflation of
structural and per-finding identity one layer down. Rather than make
`findingId` required -- which would invalidate every existing v1 record --
identity is now keyed on `findingId` when present and on `fingerprint`
otherwise. For a single reviewed change, fingerprint dedupe remains correct
and unchanged: two reports of one mechanism at one path ARE one finding.
Only a record aggregating several reviewed changes opts in. No schema version
bump; existing records keep their exact meaning.

If the owner would rather have the stricter contract, the alternative is to
make `findingId` required and bump `review-learning/v1` to `v2`, updating the
existing records and fixtures. That was not done unilaterally.
