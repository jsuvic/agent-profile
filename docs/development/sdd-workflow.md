# SDD Workflow

Agent Profile Compiler uses specification-driven development with TDD where
practical. The workflow exists to keep generated outputs deterministic, protect
safety contracts, and prevent uncontrolled architecture drift.

## Core Rule

No meaningful implementation work starts without a written spec.

Specs live under `docs/specs/` and must use the shared template in
`docs/specs/SPEC_TEMPLATE.md`.

## Spec Statuses

- `Draft`: Proposed but not ready for implementation.
- `Approved`: Reviewed and ready for implementation.
- `Implemented`: Code exists and local checks have run.
- `Verified`: Acceptance criteria, tests, docs, and contract checks are complete.

Only approved specs should be implemented.

## Required Loop

1. Write or update the spec.
2. Review the problem, goal, non-goals, contracts, and security rules.
3. Define acceptance criteria and tests.
4. Add failing tests or golden fixtures where practical.
5. Implement the smallest change that satisfies the spec.
6. Run tests and golden tests.
7. Run `agent-profile doctor` or equivalent checks once available.
8. Update docs called out by the spec.
9. Review the implementation against the spec.
10. Mark the spec `Verified` only after all acceptance criteria pass.

## Planning Flow Before Implementation

When a stakeholder request is rough, ambiguous, or not yet tied to an
approved spec, run the planning flow before step 1 of the required loop:

```text
stakeholder request
  -> grill-change
  -> request-to-spec-issues
  -> vertical TDD-ready issues
  -> tdd-change / subagent-driven-change
```

- `grill-change` clarifies one decision at a time, provides a recommended
  answer per question, and ends with an explicit agreement record. It does
  not produce specs or implementation plans.
- `request-to-spec-issues` runs only after the grill is complete. It turns
  the agreement record into an intent-first spec candidate and vertical
  TDD-ready issue briefs without re-interviewing the user unless a
  contradiction or genuinely missing decision is found.
- Tabnine projects receive the same workflow through the
  `.tabnine/guidelines/05-planning-workflow.md` guideline rather than as a
  project skill, because Tabnine consumes guidelines instead of skills.

Skip the planning flow when the request is already tied to an approved spec
and the next step is implementation; in that case begin at step 1 of the
required loop.

## Contract Rules

- `ai-profile.yaml` schema changes require a versioning decision.
- Generated files must be deterministic for the same input.
- Golden fixture changes require an intentional review and changelog note once
  a changelog exists.
- CLI commands must remain scriptable in CI.
- Init and compile must not execute shell commands, install dependencies, or
  modify `.gitignore` without explicit user intent.

## Test Expectations

Choose test depth based on risk:

- Schema changes require validation tests.
- Compiler changes require golden tests.
- CLI behavior changes require command-level tests.
- Doctor checks require positive and negative fixtures.
- Security-sensitive behavior requires explicit regression tests.

## Completion Checklist

- Spec status is accurate.
- Tests were added or a test gap is documented.
- Generated output changes are deterministic.
- Security rules were reviewed.
- Documentation updates are complete.
- Remaining risks are documented before handoff.

Release and distribution work must also follow
`docs/development/release-and-provenance.md`.
