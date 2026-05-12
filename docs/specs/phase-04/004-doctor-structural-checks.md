# Spec: Doctor Structural Checks

## Status

Verified

Implemented in `packages/doctor` and verified on 2026-05-02 after final
implementation review.

## Problem

Doctor must report basic repository structure problems before deeper drift,
security, or permission findings are trusted.

## Goal

Add structural doctor checks for the canonical profile, generated artifacts, and
target output presence.

## Non-Goals

- writing missing files
- repairing generated files
- importing existing agent config
- checking live client runtime state

## User Flow

1. A user runs `agent-profile doctor`.
2. Doctor validates the root profile and compiles expected generated outputs in
   memory.
3. Doctor checks that enabled target artifacts exist at the expected paths.
4. Doctor emits deterministic structural findings.

## Inputs

- root directory
- `ai-profile.yaml`
- current compiler output descriptors
- expected generated output paths

## Outputs

- `DoctorIssue` entries with structural issue codes

## Contracts

- `ai-profile.yaml` must exist at the checked root.
- `ai-profile.yaml` must validate before target-specific checks proceed.
- Enabled targets must have generated artifacts at the compiler-declared paths.
- Structural issues are sorted with the common doctor ordering.
- Messages must not include source file contents.

## Security Rules

- Do not read secret files.
- Do not upload repository content.
- Do not mutate files.
- Do not print file contents.

## Acceptance Criteria

- missing `ai-profile.yaml` produces `LINT-STRUCT-001`
- invalid `ai-profile.yaml` produces `LINT-STRUCT-002`
- missing generated artifact produces `LINT-STRUCT-003`
- generated artifact path checks only use compiler-declared output paths
- issue ordering is deterministic

## Tests

- missing profile produces `LINT-STRUCT-001`
- invalid profile produces `LINT-STRUCT-002`
- missing generated file produces `LINT-STRUCT-003`
- clean generated fixture has no structural errors

## Documentation Updates

- `README.md`
- `docs/security/trust-model.md`

## Final Review Checklist

- structural checks run before deeper claims are trusted
- generated output paths come from the compiler
- no file contents are printed
- no files are mutated
