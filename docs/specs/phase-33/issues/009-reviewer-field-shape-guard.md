# I9: Guard the reviewer envelope's structured field shapes

## Parent spec or request

`docs/specs/phase-33/001-change-risk-review-assurance.md`

Raised 2026-07-31 from the reviewer's own output on PR #141. This is the third
occurrence of one defect class, which is why it asks for a mechanical guard
rather than another prompt sentence.

## Intent summary

The reviewer prompt names envelope fields without stating the shape of the
structured ones, so a reviewer supplies a plausible scalar and its own
validator rejects the result. Every such rejection costs a transient retry and
produces no review.

## Behavior slice

`validateChangeRiskResultV1` requires four values to be records rather than
scalars: `scope`, each `scope.domains[]` entry, each finding's `location`, and
an evidence reference's `lines`. The emitted prompt states the shape of the
first two — that was fixed after the first occurrence — and still describes
`location` as a bare name in a flat list: "Each finding contains priority,
category, location, unsafeCondition, …".

Observed consequence on PR #141: the reviewer emitted
`"location": "packages/compiler/src/change-risk-promotion.ts:141-158 decideChangeRiskPromotion"`.
Driven through the validator, that envelope is rejected with `malformed
fields`, while the same finding with `{ path, symbol }` is accepted. The review
itself was sound — eight findings, all reproduced — and would have been
discarded as a malformed attempt by a real orchestration.

Occurrence history for this class, all envelope non-conformance caused by an
under-specified field shape:

1. `scope.domains[].state` for `applicability`, and `manifestCovered` for
   `inspectedChangeManifest`. Fixed by naming the exact scope keys.
2. Budget exhaustion returning no envelope at all. Owned by I8.
3. `location` emitted as a string.

Add the guard the promotion table demands at a third occurrence, in preference
to more prose:

- Derive, from the validator itself, the set of envelope fields that must be
  records, and assert the emitted reviewer artifacts state the shape of every
  one. A hand-written list would drift the moment a fifth structured field is
  added; the test must fail when a field becomes structured and the prompt is
  not updated.
- State `location`'s shape (`path`, optional `symbol`, optional `line`) in the
  reviewer projection's result contract, rendered like the scope keys.
- While there: the same sentence currently lists `evidence`, `safePath`, and
  `fingerprint` twice, once from `requiredFindingFields` and again in trailing
  prose. Render each field once.

## Non-goals

- Changing the envelope shape, the validator, or any closed vocabulary.
- Making the validator lenient about a scalar `location`. The contract is
  right; the prompt is what is incomplete.
- Budget exhaustion, owned by I8.
- Behavioural evaluation of reviewer conformance rates, owned by I6.

## Acceptance criteria

- A test derives the structured-field set from the validator's own
  requirements rather than a literal list, and asserts each emitted reviewer
  artifact states that field's shape.
- The test fails when a field is made structured in the validator and the
  prompt is not updated — proven by mutation, not by assertion alone.
- `location`'s shape is stated in the emitted Claude and Codex artifacts.
- No field name appears twice in the finding-fields sentence.
- An envelope carrying the shapes exactly as the prompt states them validates;
  the previously observed scalar `location` still does not.
- Reviewer golden fixtures are updated in the same change.

## Expected RED proof

The shape-coverage test fails against current output, naming `location`.

## Expected GREEN proof

The test passes, both reviewer goldens carry the `location` shape, and the
change-risk policy and compiler suites stay green.

## Seam under test

`validator structured-field requirements -> emitted reviewer prompt`.

## Allowed mock boundary

None. Both sides are real: the validator's requirements and the emitted
artifact bytes. Do not assert against a copy of the field list.

## Test command guidance

Run the change-risk policy tests and the compiler reviewer-emission tests,
then the affected goldens, before the broader compiler suite.

## Likely file ownership

- `packages/compiler/src/change-risk-policy.ts` (reviewer projection result
  contract; possibly a small exported description of structured fields)
- `packages/compiler/src/compiler.ts` (`createChangeRiskReviewer`)
- Reviewer golden fixtures and their tests

## Dependencies

None blocking. `parallel-safe` with I8, which touches the same prompt section;
coordinate the golden regeneration if both land close together.

## Parallelism notes

Shares `createChangeRiskReviewer` and the reviewer goldens with I8. Rebase
rather than editing the same lines concurrently.

## Contract impact

States an existing requirement in the prompt. No change to the envelope, the
validator, or any closed value.

## Security impact

None. No new input is read and no output surface is added.

## Documentation impact

The parent spec's typed reviewer interface should show `location`'s shape
alongside the scope keys it already documents.

## Review expectations

Confirm the structured-field set is derived and not hand-listed, and that the
mutation proof was actually run rather than asserted. Push back if the change
adds prose for `location` alone without the guard that covers the class — that
is what the third occurrence exists to prevent. Check that no prompt sentence
gained a duplicate field name while removing the existing ones.
