# Phase 10 Spec Map

## Status

Draft. Phase 10 is Tabnine guideline template expansion. Not yet approved.

## Purpose

Phase 10 extends the verified Tabnine guidelines target (`phase-02/001`) with
four additional conditional template outputs. The phase is intentionally
narrow: it adds segmented, short guideline files for stacks and workflows
already representable by `ai-profile.yaml`, without modifying the profile
schema, lockfile, or any other target.

The phase exists because teams adopting `agent-profile` for Tabnine-heavy
repos need React stack coverage and dedicated review, refactoring, and
documentation guidance that the verified phase-02 output does not yet emit.
Each new file follows the same determinism, security, and golden-test
contracts as the existing seven.

## Review Order

1. `001-tabnine-react-stack-guideline.md`
2. `002-tabnine-code-review-guideline.md`
3. `003-tabnine-refactoring-guideline.md`
4. `004-tabnine-documentation-guideline.md`

The React spec ships first because it closes a stack coverage gap. The three
workflow specs ship together because they share the same conditional-render
pattern and security constraints.

## Implementation Gate

Phase 10 implementation must not start until these conditions are true:

- specs `001` through `004` are approved
- the `phase-02/001` Output Contract is amended additively to list the four
  new conditional outputs without changing the existing seven
- new golden fixtures exist for every new conditional output
- the existing `fixtures/minimal-valid/` golden output is verified unchanged

## Verification Gate

Phase 10 verification requires:

- the four new template ids appear in the phase-02 output contract
- new outputs are emitted only when the corresponding profile flag or stack
  hint is present; absence of the flag must produce no output and no warning
- new outputs follow the same byte-level determinism contract as phase-02
- new outputs carry the generated-file header
- new outputs respect `effectivePermissions` for shell, dependency, network,
  secret, and production access
- no schema, lockfile, or other target output changes

## Out of Scope

- adding new profile schema fields
- changing the lockfile contract
- generating Codex or Claude artifacts (separate target specs)
- MCP server declarations (`phase-later/008`)
- SonarQube or any other MCP worked example (`phase-later/009`)
- changes to Tabnine IDE permission handling (remains unverifiable per
  `phase-02/002` and `phase-04/003`)
- "Tabnine skills" or any prompt-template surface Tabnine does not document

## Cross-Phase Contracts

- `phase-02/001` still owns the Tabnine guidelines target contract; phase 10
  amends its Output Contract additively only.
- `phase-04` doctor checks apply unchanged; new conditional outputs must not
  break existing drift, secret, or permission checks.
- `phase-later/008` (MCP server declaration schema) is independent and may
  proceed in parallel without blocking or being blocked by phase 10.
