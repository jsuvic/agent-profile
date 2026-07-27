# I3: Validate the published spec-review loop

## Parent spec or request

`docs/specs/phase-34/001-bounded-spec-review.md`

## Intent summary

Prove the packed product emits a coherent spec-review loop and that the
reviewer discovers representative spec-defect classes without answer
leakage.

## Behavior slice

Compile and inspect the qualifying workflow through the packed published
seam, verify reviewer/loop/gate artifacts and references, then
forward-evaluate the generated spec reviewer on a small blinded corpus of
historical spec defects — seeded from the phase-33 PR #134 review history —
using fresh reviewers and no expected-finding leakage. Record recovery,
false positives, and variability in an evidence matrix.

## Non-goals

- Turning nondeterministic evaluation into a required network test.
- Expanding the evaluation corpus beyond the seeded defect classes.

## Acceptance criteria

- Packed output matches source-tree goldens for qualifying profiles; no
  dangling references in negative combinations.
- Published artifacts carry the exact `spec-review/v1` closed values.
- The blinded corpus covers every closed spec-risk category with at least
  one representative case; every seeded P1-class defect is recovered in at
  least one of two runs, with misses recorded.
- Recovery and quality thresholds are evaluated independently per generated
  reviewer target: Codex and Claude each get their own runs, and a recovery
  on one target never counts for the other.
- Per-target absolute maximum rates for false positives, malformed
  envelopes, and `NEEDS_CONTEXT` results are pre-registered before any run;
  exceeding a bound fails the criterion unless an explicit recorded spec
  decision accepts it. Recovery achieved by over-reporting is a failure,
  not a pass.
- Evaluation inputs expose no expected findings or prior conclusions.
- Full validation from the parent spec completes or reports exact
  unrelated failures.

## Expected RED proof

A packed-journey assertion fails because published artifacts lack the loop;
a baseline evaluation records currently missed categories.

## Expected GREEN proof

Packed assertions, gate checks, and the evaluation evidence matrix satisfy
the acceptance criteria.

## Seam under test

Published deterministic generator plus a human-reviewed local evaluation
seam: `spec-set fixture -> prioritized spec findings`.

## Allowed mock boundary

Packed filesystem isolation and unmanaged model invocation use the existing
harness. Do not mock compiler output or leak expected findings.

## Likely file ownership

- Published-journey test under `scripts/release/`
- Blinded spec-defect corpus and evidence matrix
- Final fixture/doc corrections for parity

## Dependencies

`sequenced` after I1 and I2; final integration slice.

## Contract impact

Verification only; no new behavior beyond I1-I2.

## Security impact

Evaluation is local and source-free from external services.

## Review expectations

Audit for answer leakage, anchoring, selective reporting, and gate
verification against the actual packed artifacts.
