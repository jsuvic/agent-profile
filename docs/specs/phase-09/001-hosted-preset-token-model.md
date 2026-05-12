# Spec: Hosted Preset Token Model

## Status

Draft

## Problem

A hosted builder can help users choose targets, safety posture, and workflow
preferences, but it must not receive repository source code or secrets.

## Goal

Define a token that represents profile intent only.

## Non-Goals

- hosted repository scanning
- hosted compilation
- storing secrets
- account-bound profiles

## Contracts

- Tokens may include target preferences, safety mode, workflow choices, and UI
  preset metadata.
- Tokens must not include source files, generated artifacts, credentials,
  `.env` values, or local absolute paths.
- Tokens must be optional; local CLI flows must work without them.

## Acceptance Criteria

- The token schema is documented and versioned.
- Token payload examples contain no source code or secrets.
- Invalid or unsupported token versions fail closed.
