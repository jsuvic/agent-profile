# I3: Wizard checkbox + docs/ADRs

## Parent spec or request

`docs/specs/phase-25/001-logging-guidance.md`

## Intent summary

The flag is discoverable at init time; the decisions are durably recorded
(L4).

## Behavior slice

Wizard checkbox mapping to `workflow.loggingGuidance` (default off,
following the memoryGuidance pattern from phase-12/007 + phase-23). Phase-25
README finalized; ADR 0007 and ADR 0008 verified against the agreement
record; `CONTEXT.md` terms confirmed.

## Non-goals

Any other wizard change.

## Acceptance criteria

Spec acceptance criterion 5 (wizard part).

## Expected RED proof

A wizard mapping unit test for the new checkbox fails.

## Expected GREEN proof

The mapping test passes; docs and ADRs are present and consistent.

## Seam under test

Wizard answer -> profile mapping (pure function).

## Allowed mock boundary

None.

## Test command guidance

Wizard-focused unit tests via `npm run test`.

## Likely file ownership

- Wizard module and its tests
- `docs/architecture/decisions/0007-logging-guidance-topic.md`
- `docs/architecture/decisions/0008-verbatim-redaction-rule.md`
- Phase-25 docs

## Dependencies

`sequenced` after I1 (the schema key must exist).

## Parallelism notes

Independent of I2.

## Contract impact

None beyond the additive checkbox.

## Security impact

None.

## Documentation impact

Main deliverable of this slice.

## Implementation context

Follow the phase-12/007 wizard extension pattern.

## Review expectations

ADR texts match the agreement record; the wizard default is off.
