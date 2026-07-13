# Phase 24

Workflow upgrade for the generated SDD/TDD pipeline: persistent task ledger
and issue briefs, `implement-next` dispatcher skill, glossary (`CONTEXT.md`)
and ADR threshold wired into grill -> synthesis, Seam & Interface protocol,
and the `disable-model-invocation` skill invocation policy.

## Specs

- `001-workflow-upgrade-skills.md` - approved 2026-07-05.

## Issues

- `issues/001-skill-invocation-policy.md` (I1)
- `issues/002-grill-synthesis-content.md` (I2)
- `issues/003-tdd-enforcement-content.md` (I3)
- `issues/004-implement-next-skill.md` (I4)
- `issues/005-doctor-informational-notes.md` (I5)
- `issues/006-automatic-post-grill-synthesis.md` (I6)

Task states are tracked in the root `TASKS.md` ledger.

## Doctor Notes For Runtime Artifacts

APC never generates, tracks, or executes against `TASKS.md`, `CONTEXT.md`, or
ADRs (D1). To help without owning them, doctor emits `info`-severity notes only:

- `LINT-LEDGER-001` - a `TASKS.md` ledger row uses a state outside the closed
  set `ready | blocked | sequenced | parallel-safe | human-gate | in-progress | done`.
- `LINT-LEDGER-002` - a `TASKS.md` ledger row does not link to an issue brief.
- `LINT-CONTEXT-001` - `CONTEXT.md` contains non-glossary content (a fenced code
  block or a decision/implementation/architecture heading).

Absence of either file is silent, doctor never parses issue-brief contents, and
these notes never change doctor's status or exit code.

## Capability Evidence

`disable-model-invocation` and subagent-chain support are pinned in
`docs/research/009-disable-model-invocation-support.md`.
