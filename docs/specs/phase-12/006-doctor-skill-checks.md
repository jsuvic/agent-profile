# Spec: Doctor Skill Checks (WS1)

## Status

Approved. Depends on `002`-`005`. Extends
`phase-04/006-doctor-skill-checks.md`.

## Problem

Pack-driven skill generation introduces two new failure modes: a generated skill
that references another skill which was not generated (dangling reference), and a
generated skill file on disk that no selected pack accounts for (orphan), or a
selected pack whose skill is missing (gap).

## Goal

Add doctor checks that validate the generated skill catalog against the resolved
skill set from `002`, without printing file contents.

## Non-Goals

- Running or invoking any skill.
- Validating skill body prose quality.
- Subagent checks, including reviewer subagents (owned by `008`, which reuses
  `phase-11/005`). This spec covers generated skills only.

## User Flow

`agent-profile doctor` reports dangling references and pack/skill mismatches with
stable finding codes and remediation hints.

## Inputs

- Resolved skill set from `002`.
- Generated skill artifacts on disk.
- Lockfile records.

## Outputs

- Doctor findings with stable codes:
  - `LINT-SKILL-REF-001` - a generated skill references a skill that is not
    generated for that target.
  - `LINT-SKILL-PACK-001` - a generated skill file on disk is not accounted for
    by any selected pack or workflow flag (orphan).
  - `LINT-SKILL-PACK-002` - a selected pack's skill is missing from disk (gap /
    drift).

## Contracts

- Checks compare intent (resolved set) against generated artifacts; they do not
  execute skills.
- Findings never print file contents or secrets.
- Deterministic finding order.

## Security Rules

- No file-content echo, no secret exposure, no execution.

## Acceptance Criteria

- A hand-broken specialist reference in `review-change` produces
  `LINT-SKILL-REF-001`.
- An orphan skill file produces `LINT-SKILL-PACK-001`.
- A missing pack skill produces `LINT-SKILL-PACK-002`.
- Clean generated output produces none of these.

## Tests

- Doctor unit tests for each finding code (broken reference, orphan, gap).
- Clean-tree test asserting no false positives.
- Determinism: stable finding order.

## TDD Strategy

RED: doctor test with a hand-broken reference expecting `LINT-SKILL-REF-001`.
GREEN: add the check and finding code. Repeat for orphan and gap.

## Issue Plan

- I6: doctor skill checks. `sequenced` after I5.

## Documentation Updates

- `phase-04/006-doctor-skill-checks.md` amendment listing the new codes.
- Doctor findings reference in docs.

## Final Review Checklist

- No file contents printed in findings.
- No execution of skills.
- Deterministic finding order.
- No false positives on clean generated output.
