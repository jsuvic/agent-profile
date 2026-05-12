# Spec: No Source Upload Contract

## Status

Draft

## Problem

Hosted preset flows can confuse users about whether their repository is being
uploaded.

## Goal

Make the hosted-builder boundary explicit in product copy, CLI behavior, and
tests.

## Contracts

- The hosted builder must not request source files.
- The CLI must not upload source files while resolving preset tokens.
- Token resolution must send only the token or token identifier.
- Product copy must state that repository analysis happens locally.

## Acceptance Criteria

- Network calls made by token resolution are documented and allowlisted.
- Tests verify `init --preset` does not read or upload source content for token
  resolution.
- UI and CLI copy both state "no source upload" near hosted-preset flows.
