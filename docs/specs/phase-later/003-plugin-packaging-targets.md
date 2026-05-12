# Spec: Plugin Packaging Targets

## Status

Draft for a later phase. Not MVP.

## Problem

Some AI coding clients support plugin packaging or extension distribution, but
package structure, install scope, trust model, and publication rules differ per
target.

## Goal

Define how Agent Profile Compiler may represent plugin packaging intent and
generate project-local plugin package artifacts for targets that officially
support them.

## Non-Goals

- implementing plugin packaging in MVP
- installing plugins
- publishing plugins
- generating global/user-level plugin installs without explicit opt-in

## Inputs

- future `ai-profile.yaml` capability intent
- official target documentation for Codex, Claude, and Tabnine
- target-specific plugin packaging specs

## Outputs

- project-local plugin package artifacts only where supported
- not-supported or not-generated messages for unsupported targets
- doctor findings for unsafe plugin package definitions

## Contracts

- Plugin packaging requires explicit opt-in.
- Project-local output is the default.
- Global/user-level output requires a separate approved spec.
- Doctor must validate plugin artifacts before generation is considered safe.
- Generation must define Codex, Claude, and Tabnine behavior separately.
- Unsupported target behavior must not be silently ignored.

## Security Rules

- Do not install or publish plugins during generation, validation, or doctor
  checks.
- Do not install dependencies automatically.
- Do not embed secrets or production access.
- Do not generate packages that imply runtime permissions broader than profile
  safety intent.

## Acceptance Criteria

- target support is documented with confidence labels
- unsupported targets produce clear messages
- generated plugin artifacts are project-local unless explicitly opted into
  otherwise
- doctor validates generated plugin artifacts

## Tests

- supported target golden output tests
- unsupported target message tests
- no install or publish regression tests
- doctor unsafe-plugin rejection tests

## Documentation Updates

- target docs for Codex, Claude, and Tabnine
- capability matrix

## Final Review Checklist

- no plugins install or publish during compile or doctor
- no automatic dependency installation
- target behavior is independently specified
- unsupported targets are explicit
