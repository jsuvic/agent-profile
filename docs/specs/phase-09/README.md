# Phase 9 Spec Map

## Status

Draft. Phase 9 is hosted preset builder exploration.

`000-detailed-implementation.md` has been added because the original Phase 9
drafts define the correct product and security intent, but are not sufficient
on their own for implementation. The synthesis pins the token format,
verification model, CLI merge rules, network boundary, error surface, and test
matrix.

**Phase 9 scope is CLI-only.** Token verification and `init --preset` ship in
this phase. The hosted builder UI and signing endpoint are deferred to a later
phase but their contract is fixed here so the CLI verifier targets a stable
shape. See the `Phase 9 Release Scope` section of
`000-detailed-implementation.md`.

## Purpose

Phase 9 explores an optional hosted UI that produces profile presets without
uploading source code, secrets, or generated artifacts. The hosted component can
help users choose preferences, but local analysis and compilation remain in the
CLI.

## Review Order

1. `000-detailed-implementation.md`
2. `001-hosted-preset-token-model.md`
3. `002-init-from-preset-token.md`
4. `003-no-source-upload-contract.md`
5. `004-preset-expiration-and-integrity.md`

## Implementation Gate

Phase 9 verification (CLI-only slice):

- the implementation follows the detailed token, CLI, and test contracts in
  `000-detailed-implementation.md`
- hosted tokens contain only profile intent and preset preferences
- repository scanning remains local
- the CLI uploads nothing while processing `--preset`
- tokens are integrity-checked and expire
- users can use the CLI without the hosted preset builder
- the bundled public-key registry contains no private key material
- `compile`, `doctor`, and `ui` reject `--preset`

Hosted-builder UI, signing endpoint, and hosted product copy are deferred and
gated separately.
