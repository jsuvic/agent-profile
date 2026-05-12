# Phase 1 Spec Map

## Status

Verified map.

## Purpose

This map keeps the Phase 1 specs consistent before additional Phase 1
implementation begins.

The schema, lockfile, compiler determinism, AGENTS.md target, and golden test
harness slices are implemented and verified as of 2026-05-02.

## Review Order

1. `001-profile-schema-v1.md`
2. `002-lockfile-v1.md`
3. `003-compiler-determinism.md`
4. `004-agents-md-target.md`
5. `005-golden-test-harness.md`

## Cross-Spec Contracts

- `001-profile-schema-v1.md` defines the only profile input fields Phase 1
  targets may read.
- `002-lockfile-v1.md` consumes profile hashes, template hashes, and output
  hashes. It must match the bytes produced by `003-compiler-determinism.md`.
- `003-compiler-determinism.md` defines generated file descriptors consumed by
  lockfile generation and golden tests.
- `004-agents-md-target.md` is the first target-specific user-facing output and
  must use only validated profile data.
- `005-golden-test-harness.md` verifies byte-for-byte generated outputs from
  target specs.

## Implementation Gate

Before marking any Phase 1 implementation slice `Verified`:

- read the relevant approved spec
- keep implementation within the approved scope
- add the required tests and fixtures
- run final implementation review before marking a spec verified
