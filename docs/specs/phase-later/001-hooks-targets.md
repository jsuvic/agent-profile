# Spec: Hooks Targets

## Status

Draft for a later phase. Not MVP.

## Problem

Some AI coding clients expose hook or automation surfaces, but the supported
events, file formats, execution rules, and safety controls differ per target.

## Goal

Define how Agent Profile Compiler may represent hook intent and generate
project-local hook artifacts for targets that officially support them.

## Non-Goals

- implementing hooks in MVP
- executing hooks
- installing third-party hook dependencies
- generating global/user-level hooks without explicit opt-in

## Inputs

- future `ai-profile.yaml` capability intent
- official target documentation for Codex, Claude, and Tabnine
- target-specific hook specs

## Outputs

- project-local hook artifacts only where supported
- not-supported or not-generated messages for unsupported targets
- doctor findings for unsafe hook definitions

## Contracts

- Hooks require explicit opt-in.
- Project-local output is the default.
- Global/user-level output requires a separate approved spec.
- Doctor must validate hook artifacts before generation is considered safe.
- Generation must define Codex, Claude, and Tabnine behavior separately.
- Unsupported target behavior must not be silently ignored.

## Security Rules

- Do not execute hooks during generation, validation, or doctor checks.
- Do not install dependencies automatically.
- Do not embed secrets or production access.
- Do not generate hooks that silently approve destructive behavior.

## Acceptance Criteria

- target support is documented with confidence labels
- unsupported targets produce clear messages
- generated hooks are project-local unless explicitly opted into otherwise
- doctor validates generated hook artifacts

## Tests

- supported target golden output tests
- unsupported target message tests
- no execution or install regression tests
- doctor unsafe-hook rejection tests

## Documentation Updates

- target docs for Codex, Claude, and Tabnine
- capability matrix

## Final Review Checklist

- no hooks run during compile or doctor
- no automatic dependency installation
- target behavior is independently specified
- unsupported targets are explicit
