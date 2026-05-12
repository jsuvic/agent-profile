# Spec: Init From Preset Token

## Status

Draft

## Problem

If a hosted builder emits a token, the local CLI needs a safe way to consume it
during bootstrap.

## Goal

Add an init option that merges hosted preset intent with local repository
analysis:

```bash
npx agent-profile init --preset <token>
```

## Non-Goals

- `compile <token>`
- remote compilation
- token-based writes without local review

## Contracts

- The CLI must analyze the repository locally after reading the token.
- Token preferences must not override local safety validation.
- `compile` must continue to consume local `ai-profile.yaml`, not remote token
  state.
- `--preset` must support dry-run by default and `--write` only by explicit
  request.

## Acceptance Criteria

- `init --preset <token> --dry-run` previews the candidate profile.
- `init --preset <token> --write` writes only `ai-profile.yaml`.
- Local stack detection still determines stack fields.
- Tests cover invalid, expired, unsupported, and valid tokens.
