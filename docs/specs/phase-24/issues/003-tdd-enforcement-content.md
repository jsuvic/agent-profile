# I3: TDD enforcement content - anti-patterns, mock boundary, glossary read, escape hatch

## Parent spec or request

`docs/specs/phase-24/001-workflow-upgrade-skills.md`

## Intent summary

The TDD loop enforces pre-decided seams instead of re-deciding them (D5, D6
enforcement side, D7 escape side).

## Behavior slice

Emitted `tdd-change` gains:

- The tautological-test anti-pattern (expected values must come from an
  independent source, never recomputed the way the code computes them).
- Boundary-only mocking: mock only unmanaged external dependencies; prefer
  fake > stub > mock/spy; a spy only where outbound communication is the
  tested contract; never introduce an abstraction that exists only for a
  test.
- A glossary-read rule: test and interface names must match `CONTEXT.md`
  when it exists.
- Seam enforcement plus escape hatch: test only at the brief's declared
  seam; if implementation shows the seam is wrong, report `BLOCKED` with the
  reason - never silently move or redesign the seam.

Existing rules unchanged: RED-for-the-right-reason, the golden-fixture rule,
red -> green -> refactor inside the loop.

## Non-goals

- Grill/synthesis side (I2).
- Implementer agent prompt changes beyond a pointer if required by the
  conditional-pointer rule.

## Acceptance criteria

Spec acceptance criterion 3.

## Expected RED proof

Golden assertion for the new anti-pattern/enforcement text fails against the
current `tdd-change` body.

## Expected GREEN proof

Updated goldens pass; assertions on the preserved rules still pass.

## Seam under test

`compile(profile) -> emitted tdd-change body` via golden fixtures.

## Allowed mock boundary

None.

## Test command guidance

Compiler workspace tests plus the golden suite via `npm run test`.

## Likely file ownership

- `tdd-change` body source in the compiler content modules
- Golden fixtures

## Dependencies

None - `ready`.

## Parallelism notes

Logically parallel-safe with I2; same-file caution. Recommended merge order:
after I2.

## Contract impact

None structural; content only.

## Security impact

None.

## Documentation impact

Phase-24 README.

## Implementation context

Keep refactor inside the loop - explicit grill decision D5; do not adopt the
review-stage-refactor variant from external skill research.

## Review expectations

Verify the preserved rules (RED-for-right-reason, golden-fixture rule) are
still present verbatim in the emitted body.
