# Phase 9 Spec Map

## Status

Draft. Phase 9 is hosted preset builder exploration.

## Purpose

Phase 9 explores an optional hosted UI that produces profile presets without
uploading source code, secrets, or generated artifacts. The hosted component can
help users choose preferences, but local analysis and compilation remain in the
CLI.

## Review Order

1. `001-hosted-preset-token-model.md`
2. `002-init-from-preset-token.md`
3. `003-no-source-upload-contract.md`
4. `004-preset-expiration-and-integrity.md`

## Implementation Gate

Phase 9 verification:

- hosted tokens contain only profile intent and preset preferences
- repository scanning remains local
- secrets and source code are never uploaded
- tokens are integrity-checked and expire
- users can use the CLI without the hosted preset builder
