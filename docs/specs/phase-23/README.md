# Phase 23 Spec Map

## Status

Approved on 2026-07-04.

Phase 23 is the WS7 slice of the Agent Capability Direction
(`docs/plans/003-ws3-ws7-spec-synthesis.md`): a document-only memory guidance
topic gated by `workflow.memoryGuidance`, carrying a verbatim
never-store-secrets rule. v1 documents memory; it does not control memory -
no memory content files and no memory behavior settings are generated.

## Review Order

1. `001-memory-guidance.md`

## Dependencies

- The existing guidance-topic pattern (`workflow.codeReview` /
  `workflow.refactoring` / `workflow.documentation` emission in the
  compiler).
- Phase 12 `001` capability matrix for per-client memory-surface claims.
- Lockfile determinism and golden fixture contracts.

## Downstream (each needs its own approved spec)

- WS7b: `capabilities.memory.policy` behavior settings.
- WS7c: project-memory scaffolding (reconcile with
  `phase-later/016-auto-memory-taxonomy.md`).
- `phase-later/006-secrets-and-memory-integration.md` remains the draft for
  secret/env integration.

## Out of Scope for Phase 23

- Generating any memory content file or memory directory.
- Generating or modifying any memory behavior setting.
- Linting user-authored memory files.
