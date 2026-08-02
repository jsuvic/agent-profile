# I17: Guard against reimplementing shared logic

## Parent spec or request

`docs/specs/phase-33/001-change-risk-review-assurance.md`

Filed from the I5 remediation (#148) under the WITHIN-CHANGE recurrence rule,
not the promotion threshold.

All four instances occurred inside one reviewed change. The promotion contract
is explicit that "repeated rounds, repeated fingerprints, and unresolved
recurrences within the same change deduplicate to at most one occurrence per
canonical category", and I4 adds that a within-change recurrence "is answered
by I2's guard requirement, not by promotion". This mechanism therefore stands
at ONE promotion occurrence. It is filed because I2's within-change guard
requirement applies, and because the evidence is unusually legible -- four
instances of one mechanism in a single change, each found by review.

## Intent summary

A private reimplementation of logic that already exists as an exported helper
is a recurring defect mechanism in this repository, not an isolated slip. Each
instance shipped a WEAKER copy than the original, and each copy reproduced or
introduced the defect the original did not have.

## Observed instances (one promotion occurrence)

All four occurred inside a single pull request (#148), and each was found by
review rather than by any gate:

1. **Threshold ladder.** `docs/review-learning/generate-historical-corpus.mjs`
   and `packages/compiler/src/historical-review-corpus.test.ts` each kept a
   copy of the promotion threshold selection. Both copies selected a single
   threshold's action and dropped protections earlier thresholds had already
   earned. The test copy reproduced the generator's defect exactly, so it
   asserted the bug and could never have failed on it. Fixed by extracting
   `changeRiskEarnedObligations`.
2. **Promotion aggregation.** The corpus test rebuilt category aggregation
   without applying `isValidatedPromotionOutcome`, so it disagreed with the
   generator about which findings count.
3. **Promotion aggregation, again.** The same test-side aggregation drifted a
   second time in a later round of the same PR.
4. **Calendar-date validation.** The generator validated the observation date
   with a private regex accepting `2026-02-30`, while `isUtcCalendarDate` --
   which round-trips the date and rejects impossible days -- already existed in
   `packages/compiler/src/review-learning-record.ts`.

The shape is consistent: the shared version was present and reachable in every
case, the copy was written anyway, and the copy was wrong.

## Behavior slice

Detect, mechanically, when repository code reimplements logic that an exported
helper already provides, and fail or flag at authoring time rather than at
review time.

Scope the first slice to what is cheaply detectable and has evidence behind it:

- A module-local function whose body duplicates an exported helper's body
  beyond a similarity threshold.
- A local re-derivation of a value the shared policy projections already
  expose (threshold tables, closed vocabularies, date and identity validation).
- Test-side reimplementation of policy that the code under test imports. The
  test copies were the most dangerous instances, because a test that
  reimplements its subject's logic cannot detect that logic being wrong.

Prefer a lint rule or a focused check over prose. A prompt rule has already
been tried implicitly and did not hold across four occurrences in one PR.

## Non-goals

- General duplicate-code detection across the repository.
- Refactoring existing duplication that this guard does not flag.
- Blocking legitimate narrow re-statements where the shared helper is genuinely
  unsuitable; the guard must permit an explicit, justified opt-out.

## Acceptance criteria

- A newly added private function that duplicates an exported helper is
  reported, naming both the copy and the original.
- A test that reimplements policy imported by its subject is reported.
- The four occurrences above are each reproduced as a fixture and detected.
- An explicit opt-out marker suppresses the report and requires a stated
  reason, so the guard cannot be silenced anonymously.
- The guard runs inside an existing gate, so a new copy cannot reach CI green.
- The guard performs no write.

## Expected RED proof

Reintroducing the pre-extraction threshold ladder into the corpus generator
fails the new check and names `changeRiskEarnedObligations` as the original.
That exact state passed every gate before this brief.

## Seam under test

`authored module -> exported shared helpers it should have used`.

## Likely file ownership

- A script or lint rule under `scripts/`, wired into `check`
- Its focused test

## Dependencies

None blocking. Independent of I6.

## Contract impact

Adds a gate. No runtime contract changes.

## Security impact

None directly. Indirectly relevant: occurrence 4 was a weaker copy of a
validator, and weaker copies of validators are how redaction and parsing
guarantees are lost.

## Review expectations

Confirm the guard detects all four recorded occurrences from fixtures rather
than by assertion. Confirm the opt-out requires a reason and is visible in the
diff. Push back if the guard only detects exact textual copies, since three of
the four occurrences were paraphrases rather than copy-paste.
