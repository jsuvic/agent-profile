# I11: The advertised `location` keys carry unstated validity rules

## Parent spec or request

`docs/specs/phase-33/001-change-risk-review-assurance.md`

Raised 2026-07-31 by the change-risk reviewer's final clean-room confirmation
of the I8/I9 change (`docs/review-learning/896F5F8050686A23.md`, finding 4).

## Intent summary

I9 made the reviewer prompt state the *shape* of every structured envelope
field. For `findings[].location` it now enumerates `path`, `symbol`, and `line`
under "these exact keys" authority, but states none of the constraints the
validator applies to their values, so a reviewer can follow the prompt exactly
and still be rejected.

## Behavior slice

`validateFinding` rejects a finding when:

- `location.line` is present and is not an integer `>= 1`;
- `location.path` contains a `..` segment after separator normalization;
- `location.path` normalizes to zero path components.

The emitted prompt states none of these. The asymmetry is visible within one
section: the sibling locator `findings[].evidence[].lines` keeps its explicit
rule, "`lines` requires `1 <= start <= end`", while `location.line` — newly
advertised by I9 — gets none.

Before I9 the prompt named `location` as an opaque required field and made no
claim about its interior, so there was nothing to be incomplete. Advertising
the interior keys without their constraints is what creates the gap, which
makes this the same silent-rejection class I9 was written to close, one level
down.

## Non-goals

- Changing the validator, making it lenient, or altering the envelope shape.
  The constraints are correct; the prompt is what is incomplete.
- Restating every scalar constraint in the envelope. This is scoped to the
  interior of the locator shapes the prompt now advertises.
- Budget observability, owned by I10.

## Acceptance criteria

- The emitted Claude and Codex artifacts state, for `findings[].location`:
  `line` is an integer `>= 1`, and `path` is a repo-relative path with no `..`
  segment that normalizes to at least one component.
- The statements are projected, not written as renderer prose, and sit
  alongside the existing evidence-locator rules so the two locator shapes are
  documented to the same standard.
- An envelope carrying the values exactly as the prompt states them validates;
  each stated constraint is proven load-bearing against `validateFinding`
  rather than asserted.
- Reviewer goldens updated in the same change.

## Expected RED proof

A test asserting the artifacts state a constraint for every scalar key inside a
projected locator shape fails against current output, naming `location.line`.

## Expected GREEN proof

The test passes, both goldens carry the constraints, and the change-risk policy
and compiler suites stay green.

## Seam under test

`validator value constraints -> emitted reviewer prompt`, the value-level
counterpart of I9's shape-level seam.

## Likely file ownership

- `packages/compiler/src/change-risk-policy.ts` (reviewer projection)
- `packages/compiler/src/compiler.ts` (`createChangeRiskReviewer`)
- Reviewer golden fixtures and their tests

## Dependencies

None blocking. Touches the same prompt section as I8/I9, so rebase rather than
editing concurrently.

## Contract impact

States existing validator requirements in the prompt. No change to the
envelope, the validator, or any closed value.

## Security impact

None. Note the `..` rejection is a path-traversal guard; stating it in the
prompt does not weaken it, and the guard must not be relaxed to match prose.

## Review expectations

Confirm the constraints are projected and derived from the validator rather
than hand-copied, and that the path-traversal rejection is stated without being
loosened. Push back if the fix states the `line` rule alone and leaves the
`path` rules unstated — the gap is the whole locator interior, not one key.
