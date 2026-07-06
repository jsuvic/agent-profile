# I2: Conditional enforcement lines

## Parent spec or request

`docs/specs/phase-25/001-logging-guidance.md`

## Intent summary

The convention is enforced at every implementation and review pass (L3).

## Behavior slice

Flag-conditional lines emitted in:

- `implementer`: follow the project logging convention (AGENTS.md section);
  leftover debug output before `DONE` -> report `DONE_WITH_CONCERNS`.
- `code-quality-reviewer`: check for stray print/console output in
  production code, new error paths without a stable event code, and logs
  violating the redaction rule.
- `final-review`: one checklist item (debug output removed, new error paths
  coded).

Lines are emitted only when `workflow.loggingGuidance` is on and the
referencing artifact is emitted for that target.

## Non-goals

- `spec-reviewer` and `tdd-change` (must stay byte-identical).
- Any hook or lint mechanism.

## Acceptance criteria

Spec acceptance criteria 3, 4.

## Expected RED proof

A golden assertion for the flag-on implementer line fails; byte-identity
tests for the untouched surfaces are set up and passing before the change.

## Expected GREEN proof

Conditional lines present/absent per combination; the conditional-pointer
sweep test is green; untouched surfaces remain byte-identical.

## Seam under test

`compile(profile) -> emitted agent/skill bodies` via golden fixtures.

## Allowed mock boundary

None.

## Test command guidance

Compiler workspace tests plus the golden suite via `npm run test`.

## Likely file ownership

- Agent/skill body content modules in the compiler
- Golden fixtures

## Dependencies

`sequenced` after I1 (references the topic).

## Parallelism notes

Must not merge before I1.

## Contract impact

`DONE_WITH_CONCERNS` semantics extended by one documented trigger.

## Security impact

The reviewer line must reference the redaction rule, not restate a variant
of it (single source of truth).

## Documentation impact

Phase-25 README.

## Implementation context

Conditional emission per phase-12/003; reuse the phase-24 conditional
emission approach.

## Review expectations

Adversarial sweep across pack/target combinations; no dangling reference;
untouched surfaces byte-compared.
