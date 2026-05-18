# Phase 15 Spec Map

## Status

Draft. Phase 15 is the friendly no-argument init flow built on top of Phase 14
safe import and ownership.

## Purpose

Users should not need to discover `--import`, `--strategy`, `--write`,
`--update-gitignore`, or target flags before getting a safe setup. Phase 15
makes `agent-profile init` guide users through the same deterministic plan that
Phase 14 defines.

## Review Order

1. `001-friendly-init-wizard.md`

## Dependencies

- Phase 14 ownership and region-aware writes.
- Existing stack detection and import reporting.

## Out of Scope for Phase 15

- local web UI
- AI-assisted merge
- non-local execution
- changing the Phase 14 ownership semantics
