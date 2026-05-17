# Spec: Doctor Security Checks

## Status

Verified

Implemented in `packages/doctor` and verified on 2026-05-02 after final
implementation review.

## Problem

Generated agent artifacts can become unsafe if hand-edited to include literal
tokens, production access, or weak secret-handling posture.

## Goal

Add local doctor checks for generated artifact secret-like values and `.env`
ignore hygiene.

## Non-Goals

- scanning arbitrary source code
- reading `.env` or `.env.*`
- validating every possible secret format
- integrating with external secret scanners
- uploading findings

## User Flow

1. A user runs `agent-profile doctor`.
2. Doctor reads only compiler-declared generated artifact paths.
3. Doctor scans generated artifact bytes for conservative secret-like patterns.
4. Doctor checks `.gitignore` includes `.env` and `.env.*` protection.
5. Doctor reports deterministic findings without printing secret values.

## Inputs

- compiler-declared generated output paths
- generated artifact bytes at those paths
- root `.gitignore`

## Outputs

- `LINT-SEC-*` doctor findings

## Contracts

- Secret scanning is limited to generated artifacts from the current compiler
  output descriptors.
- `.env` and `.env.*` files are never read.
- Findings must not include literal matched values.
- Missing `.gitignore` or missing `.env` ignore patterns are warnings.

## Security Rules

- Do not read `.env` or `.env.*`.
- Do not print secret-like values.
- Do not upload source or generated artifacts.
- Do not mutate `.gitignore`.

## Acceptance Criteria

- generated file containing a secret-like literal produces `LINT-SEC-001`
- `.gitignore` missing `.env` or `.env.*` protection produces `LINT-SEC-002`
- generated config containing a literal env value produces `LINT-SEC-003`
- findings do not echo matched values
- clean generated fixture produces no security warnings

## Tests

- injected `SECRET_TOKEN_VALUE` in a generated artifact produces `LINT-SEC-001`
- `.gitignore` missing `.env.*` produces `LINT-SEC-002`
- JSON env entry with literal token produces `LINT-SEC-003`
- issue messages do not include secret literals

## Forward Reference: Subagent Security Checks

`docs/specs/phase-11/005-doctor-subagent-checks.md` (Draft, not approved)
extends the secret-pattern, source-upload, and unsafe-instruction checks here
to cover generated subagent artifacts under `.claude/agents/`,
`.codex/agents/`, and `.tabnine/agent/agents/`. Subagent security findings
use `LINT-SUBAGENT-002` rather than `LINT-SEC-*` codes so users can
distinguish drift sources. The redaction and only-scan-generated-artifacts
contracts in this spec are unchanged.

## Documentation Updates

- `docs/security/secret-handling.md`
- `docs/security/trust-model.md`

## Final Review Checklist

- only generated artifacts are scanned
- secret files are not read
- secret-like matches are redacted from issue output
- no files are mutated
