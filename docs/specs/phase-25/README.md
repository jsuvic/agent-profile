# Phase 25

Logging guidance topic for consuming projects: a `workflow.loggingGuidance`
flag emits a stack-agnostic logging convention (AGENTS.md/CLAUDE.md section,
Tabnine guideline) with a verbatim redaction rule, plus conditional
enforcement lines in the `implementer`, `code-quality-reviewer`, and
`final-review` templates. Document-and-instruction only; no application code
is generated.

## Specs

- `001-logging-guidance.md` - approved 2026-07-06.

## Issues

- `issues/001-schema-and-topic-emission.md` (I1)
- `issues/002-conditional-enforcement-lines.md` (I2)
- `issues/003-wizard-checkbox-and-docs.md` (I3)

Task states are tracked in the root `TASKS.md` ledger.

## Decisions

- ADR 0007: logging guidance as a guidance topic, not a skill.
- ADR 0008: verbatim redaction rule as fixed text.
