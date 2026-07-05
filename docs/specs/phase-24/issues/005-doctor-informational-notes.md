# I5: Informational doctor notes + docs

## Parent spec or request

`docs/specs/phase-24/001-workflow-upgrade-skills.md`

## Intent summary

Doctor helps without owning runtime artifacts (D1).

## Behavior slice

Doctor emits informational (never error-level) notes when `TASKS.md` or
`CONTEXT.md` exist but miss expected structure (unknown ledger state,
missing brief link, non-glossary content markers). Absence of either file is
silent. Phase-24 documentation and research pins are completed.

## Non-goals

- Error-level checks on runtime artifacts.
- Parsing issue brief contents.

## Acceptance criteria

Spec acceptance criterion 6.

## Expected RED proof

A doctor test asserting an informational note for a malformed fixture ledger
fails.

## Expected GREEN proof

The note appears for the malformed case; absence and well-formed cases
produce nothing; exit codes are unaffected in all cases.

## Seam under test

Doctor check function over fixture files -> report entries (output-based).

## Allowed mock boundary

None (fixture files on disk under test control).

## Test command guidance

Doctor-focused tests first, then an `npm run doctor` smoke run.

## Likely file ownership

- Doctor check modules and their tests
- Phase-24 docs, `docs/research/` pins

## Dependencies

`sequenced` after I2 (structure definitions) and I4.

## Parallelism notes

Independent of I3.

## Contract impact

Doctor output additive, informational only; exit codes unchanged.

## Security impact

Doctor reads only; no execution.

## Documentation impact

Main deliverable of this slice.

## Review expectations

Confirm no error-level path exists for runtime artifacts; exit codes
unchanged; notes never fire on absent files.
