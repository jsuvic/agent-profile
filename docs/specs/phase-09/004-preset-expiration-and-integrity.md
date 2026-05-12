# Spec: Preset Expiration and Integrity

## Status

Draft

## Problem

Preset tokens should not be mutable forever or silently tampered with.

## Goal

Define integrity and expiration requirements for hosted preset tokens.

## Non-Goals

- user accounts
- long-term hosted profile storage
- revocation dashboards

## Contracts

- Tokens must include a version and expiration.
- Tokens must be signed or otherwise integrity-protected.
- Expired tokens must fail with a clear message.
- The CLI must show the preset summary before write.

## Acceptance Criteria

- Expired tokens fail closed.
- Tampered tokens fail closed.
- The CLI prints a concise preset summary in dry-run output.
- Tests cover expiration, tampering, and supported-token success paths.
