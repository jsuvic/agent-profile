# Spec: Doctor Semantic Warnings

## Status

Verified

Implemented in `packages/doctor` and verified on 2026-05-02 after final
implementation review.

## Problem

Generated agent instructions can become noisy or contradictory after manual
edits. The MVP should detect only obvious semantic problems conservatively.

## Goal

Add warning-only doctor checks for basic redundancy and contradiction markers in
compiler-declared generated artifacts.

## Non-Goals

- natural-language inference
- automatic rewriting
- broad source-code scanning
- blocking builds on ambiguous semantic warnings

## User Flow

1. A user runs `agent-profile doctor`.
2. Doctor scans compiler-declared generated artifact text.
3. Doctor reports obvious repeated boilerplate or direct contradictions.

## Inputs

- generated artifact paths from the current compiler descriptors
- generated artifact bytes

## Outputs

- warning-only `LINT-SEM-*` findings

## Contracts

- Semantic checks are conservative warnings.
- Semantic checks read only compiler-declared generated artifacts.
- Findings must include the file path and actionable guidance.
- Findings must not include file contents.

## Security Rules

- Do not scan arbitrary source files.
- Do not print generated file contents.
- Do not upload artifacts.
- Do not mutate files.

## Acceptance Criteria

- obvious repeated generated warning text produces `LINT-SEM-001`
- obvious contradiction marker produces `LINT-SEM-002`
- clean generated fixture produces no semantic warnings

## Tests

- generated file with repeated "Do not upload source code" lines produces
  `LINT-SEM-001`
- generated file with "ignore AGENTS.md" produces `LINT-SEM-002`
- issue messages do not include generated file contents

## Documentation Updates

- `README.md`

## Final Review Checklist

- warnings are conservative
- no semantic issue is reported from arbitrary source files
- no contents are printed
- no files are mutated
