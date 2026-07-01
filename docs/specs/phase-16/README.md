# Phase 16 Spec Map

## Status

Implemented. Phase 16 is the local UI migration wizard for safe import and
ownership. The migration wizard landed on 2026-05-19 in `da5ca4d` (PR #24),
and the remaining skill/subagent name-collision acceptance criterion landed in
`9698985` (PR #25).

## Purpose

The CLI wizard should solve the common path, but file ownership and region
adoption are easier to review visually. Phase 16 adds a local UI over the same
Phase 14 plan APIs.

## Review Order

1. `001-local-ui-migration-wizard.md`

## Dependencies

- Phase 14 safe import and ownership.
- Phase 15 friendly init flow.
- Existing local UI shell.

## Out of Scope for Phase 16

- AI semantic merge
- changing ownership semantics
- hosted execution
- remote uploads
