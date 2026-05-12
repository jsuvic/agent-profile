# Spec: Doctor Lockfile Drift Checks

## Status

Verified

Implemented in `packages/doctor` and verified on 2026-05-02 after final
implementation review.

## Problem

`ai-profile.lock` records the profile, template, and generated output hashes
used for deterministic generation. Once files are written to a repository, users
need a local check that detects drift without uploading source or reading secret
files.

## Goal

Implement doctor checks that validate `ai-profile.lock` and compare it with the
current profile, compiler templates, and generated project files.

## Non-Goals

- writing or repairing generated files
- modifying `ai-profile.lock`
- signing lockfiles
- reading non-generated source files
- reading ignored secret files
- implementing permission-mode checks

## User Flow

1. A user runs `agent-profile doctor`.
2. Doctor reads the repository-local `ai-profile.yaml`.
3. Doctor validates and reads `ai-profile.lock`.
4. Doctor compiles expected generated outputs in memory.
5. Doctor compares lockfile entries, generated output bytes, and current files.
6. Doctor reports deterministic findings and exits non-zero when errors exist.

## Inputs

- root directory
- `ai-profile.yaml`
- `ai-profile.lock`
- generated files listed by the current compiler target set
- compiler template descriptors

## Outputs

- doctor report entries
- CI-friendly exit status
- optional JSON report from the CLI

## Contracts

- The lockfile path is exactly `ai-profile.lock`.
- Plan rules `LINT-STRUCT-004`, `LINT-DET-001`, and `LINT-DET-002` are enforced
  through this lockfile drift spec for MVP. Missing or changed generated files
  are reported as `LINT-LOCK-006` and `LINT-LOCK-007`; deterministic compiler
  byte stability is covered by Phase 1 compiler and golden tests.
- Doctor must use `validateLockfileText` from `packages/compiler`.
- Doctor must compare profile SHA-256 against exact `ai-profile.yaml` bytes.
- Doctor must compare current template descriptors by `id`, `target`,
  `version`, and `sha256`.
- Doctor must compare lockfile outputs against current generated descriptors by
  `path`, `target`, `templateId`, and `sha256`.
- Doctor must compare current on-disk generated files with the lockfile output
  hashes.
- Lockfile drift issue ordering is deterministic by severity, path, code, then
  message.
- Findings must not include source contents, secret values, or environment
  values.

## Security Rules

- Do not upload profile, lockfile, config, or source contents.
- Do not read secret files.
- Do not read `.env` or `.env.*`.
- Do not execute shell commands.
- Do not install dependencies.
- Do not mutate files.
- Do not print generated file contents in findings.

## Acceptance Criteria

- Missing `ai-profile.lock` produces a deterministic error.
- Invalid lockfile JSON or schema produces deterministic errors.
- Profile hash drift is detected.
- Template hash drift is detected.
- Output metadata drift is detected.
- Missing generated files are detected.
- Changed generated file bytes are detected.
- Extra generated files are reported when they are expected by current compile
  output but absent from the lockfile.
- No source or secret file contents appear in issues.

## Tests

- missing lockfile produces `LINT-LOCK-001`
- invalid lockfile produces `LINT-LOCK-002`
- changed profile bytes produce `LINT-LOCK-003`
- changed template hash produces `LINT-LOCK-004`
- changed output metadata produces `LINT-LOCK-005`
- missing generated file produces `LINT-LOCK-006`
- changed generated file bytes produce `LINT-LOCK-007`
- issue ordering is deterministic
- issue messages do not include file contents

## Documentation Updates

- `README.md`
- future doctor command documentation

## Final Review Checklist

- lockfile validation uses the compiler lockfile contract
- generated outputs are compared by hash, not source text in messages
- no secret files are read
- no files are mutated
- CLI exits non-zero on errors
