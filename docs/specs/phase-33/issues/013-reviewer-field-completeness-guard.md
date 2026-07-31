# I13: Guard field-list completeness, not only field shape

## Parent spec or request

`docs/specs/phase-33/001-change-risk-review-assurance.md`

Raised 2026-07-31 from the I8/I9 change
(`docs/review-learning/896F5F8050686A23.md`, coverage note).

## Intent summary

I9's derived guard proves every structured envelope field has its *shape*
stated. It proves nothing about whether the prompt's field *lists* are
complete. A completeness error slipped through I9 and was caught by a human.

## Behavior slice

While implementing I9 the finding sentence was rewritten to "Each finding
contains **exactly** `priority`, … `fingerprint`", and the `findings[]` shape
entry rendered under "objects with these **exact** keys". Both omitted
`disposition`, which `validateFinding` requires on every P3 and forbids on
P1/P2. A reviewer following that wording literally omits `disposition` on a P3
and produces the malformed envelope I9 exists to prevent.

Every I9 guard passed while that text was live. The shape guard checks that
each derived structured path has a projected shape; it never asks whether a
projected key set accounts for every field the validator can require. The word
"exactly" made an absolute claim about a conditionally-required field, and
nothing mechanical was watching.

This matters beyond the one fix: I9's justification was to guard the class
rather than the instance, and the class is larger than the brief described. The
completeness half is currently unguarded, and I6 must not credit I9 with
covering it.

Extend the guard using the same derive-from-the-validator technique:

- Derive, from the validator, the set of finding fields that are required
  under *some* priority — including conditionally required ones such as
  `disposition` — by constructing a valid envelope per priority and removing
  each key in turn to see which removals are rejected.
- Assert every such field is named in the emitted artifacts, and that any
  sentence claiming an exhaustive field set accounts for the conditional ones.
- The test must fail if a new conditionally-required field is added to the
  validator and the prompt is not updated. Prove it by mutation, not assertion.

## Non-goals

- Changing the validator, the envelope, or any closed vocabulary.
- Re-stating value constraints for locator interiors; that is I11.
- A general schema-to-prose generator. Scope this to the finding field list and
  the projected shape key sets.

## Acceptance criteria

- The conditionally-required field set is derived from validator behaviour, not
  hand-listed.
- Every derived field is asserted present in both emitted reviewer artifacts.
- Mutation proof: adding a conditionally-required field to the validator
  without updating the prompt fails the test.
- No prompt sentence claims an exhaustive field set that the derivation
  contradicts.
- Reviewer goldens updated in the same change.

## Expected RED proof

Restoring the "contains exactly \<ten fields\>" wording, with `disposition`
omitted, fails the new completeness test. That wording passed every I9 guard,
which is the point.

## Seam under test

`validator field requiredness -> emitted reviewer prompt`, the completeness
counterpart of I9's shape seam.

## Likely file ownership

- `packages/compiler/src/change-risk-policy.ts`
- `packages/compiler/src/compiler.ts` (`createChangeRiskReviewer`)
- Reviewer golden fixtures and their tests

## Dependencies

Builds on I9, which is done. Touches the same prompt section as I10 and I11;
rebase rather than editing concurrently.

## Contract impact

None to the envelope. Adds a derived assertion over existing requirements.

## Security impact

None.

## Review expectations

Confirm the conditional set is derived and not hand-listed, and that the
mutation proof was run rather than asserted. Push back if the change only adds
an assertion for `disposition` — the instance is already fixed; this brief
exists for the class.
