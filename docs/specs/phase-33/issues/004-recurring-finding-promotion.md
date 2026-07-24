# I4: Promote recurring findings into stronger guards

## Parent spec or request

`docs/specs/phase-33/001-change-risk-review-assurance.md`

## Intent summary

Make validated review misses improve future reviews and eventually become
mechanical prevention instead of permanent prompt folklore.

## Behavior slice

Add generated workflow instructions and regression fixtures for the approved
promotion thresholds: immediate protection for a systemic P1, category record
for a first ordinary P2/P3, scoped rule plus reviewer regression at the second
occurrence, and mechanical guard at the third occurrence where practical.
Promoted rules target a human-owned scoped `## Code Review Rules` surface and
never silently modify a generated region.

## Non-goals

- Promoting formatting or subjective style preferences.
- Automatically accepting a reviewer finding as valid.
- Writing broad repository-wide rules when a narrow path rule suffices.
- Guaranteeing a mechanical guard where no deterministic check is practical.

## Acceptance criteria

- Promotion decisions use validated category recurrence, not raw wording.
- First systemic P1, first ordinary P2/P3, second occurrence, and third
  occurrence produce the exact approved actions.
- A promoted rule states the consequential unsafe condition and safe path or
  counterexample and uses the narrowest applicable scope.
- Generated-region ownership is detected and refused; the workflow proposes a
  manual/scoped patch instead.
- The third-occurrence path requires a test, lint, validator, or shared helper
  when practical and records why none is practical otherwise.

## Expected RED proof

A table-driven promotion test fails because recurrence currently has no
defined action or ownership safeguard.

## Expected GREEN proof

Promotion fixtures pass for every threshold and generated/manual ownership
case; scoped rule goldens remain concise.

## Seam under test

Computation:
`validated finding history + ownership/scope -> promotion action`.

## Allowed mock boundary

Filesystem ownership inspection may use fixture trees. Do not mock promotion
classification or rule rendering.

## Test command guidance

Run focused promotion-policy tests, AGENTS/guidance goldens, then the affected
compiler suite.

## Likely file ownership

- Shared review policy/category source
- Generated workflow and code-review guidance rendering
- AGENTS/guidance ownership fixtures
- Promotion regression fixtures and tests

## Dependencies

`sequenced` after I1 and I3.

## Parallelism notes

Can run in parallel with I5 once I3 fixes the record schema and category
surface.

## Contract impact

Adds a controlled path from review evidence to human-owned scoped instruction
and test surfaces. Generated instruction ownership remains unchanged.

## Security impact

Promotion cannot weaken hard safety denials or grant permissions. Rules must
not copy secrets or private endpoints from findings.

## Documentation impact

Document category recurrence, rule shape, ownership refusal, and the
mechanical-guard fallback.

## Implementation context

Official Codex review guidance favors small, scoped, consequential
`## Code Review Rules` with a safe path or counterexample. Keep formatting and
mechanical style checks in deterministic tooling instead of spending reviewer
context on them.

## Review expectations

Challenge category aliasing, false-positive recurrence, broad rule scope,
generated-region writes, and third occurrences that merely add another prompt
sentence instead of a stronger guard.
