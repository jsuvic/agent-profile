# Spec: Subagents Targets

## Status

Draft for a later phase. Not MVP.

## Problem

Some AI coding clients support delegated subagent definitions, but the format,
scope, permissions, and invocation semantics differ per target.

## Goal

Define how Agent Profile Compiler may represent subagent intent and generate
project-local subagent artifacts for targets that officially support them.

## Non-Goals

- implementing subagents in MVP
- launching or invoking subagents
- installing third-party subagent packages
- generating global/user-level subagents without explicit opt-in

## Inputs

- future `ai-profile.yaml` capability intent
- official target documentation for Codex, Claude, and Tabnine
- target-specific subagent specs

## Outputs

- project-local subagent definitions only where supported
- not-supported or not-generated messages for unsupported targets
- doctor findings for unsafe or overbroad subagent definitions

## Contracts

- Subagents require explicit opt-in.
- Project-local output is the default.
- Global/user-level output requires a separate approved spec.
- Doctor must validate subagent artifacts before generation is considered safe.
- Generation must define Codex, Claude, and Tabnine behavior separately.
- Unsupported target behavior must not be silently ignored.

## Security Rules

- Do not execute or invoke subagents during generation, validation, or doctor
  checks.
- Do not install dependencies automatically.
- Do not embed secrets or production access.
- Do not grant broader permissions than the profile safety intent permits.

## Acceptance Criteria

- target support is documented with confidence labels
- unsupported targets produce clear messages
- generated subagents are project-local unless explicitly opted into otherwise
- doctor validates generated subagent artifacts

## Tests

- supported target golden output tests
- unsupported target message tests
- no execution or install regression tests
- doctor unsafe-subagent rejection tests

## Documentation Updates

- target docs for Codex, Claude, and Tabnine
- capability matrix

## Final Review Checklist

- no subagents run during compile or doctor
- no automatic dependency installation
- target behavior is independently specified
- unsupported targets are explicit
