# Research: Plan Update Comparison

## Previous Plan

The previous plan started Phase 1 with:

- `ai-profile.yaml` schema
- core package
- compiler package
- CLI package
- `agent-profile compile --dry-run`
- generated `AGENTS.md`
- golden test for `AGENTS.md`

## Updated Plan

The updated plan adds gates before further Phase 1 implementation:

- `001-profile-schema-v1.md`
- `002-lockfile-v1.md`
- `003-compiler-determinism.md`
- `004-agents-md-target.md`
- `005-golden-test-harness.md`

It also introduces Phase 0.5 research integration and makes `ai-profile.lock`
part of the MVP contract.

## Decision

The existing schema implementation is treated as grandfathered because it was
implemented under an approved spec and reviewed before the plan changed.

No additional Phase 1 implementation should start until the updated Phase 1
specs exist.

## Repo Alignment Rules

- Rename the schema spec to `001-profile-schema-v1.md`.
- Use `0002-risk-modes-and-permission-model.md` for safety intent and runtime
  permission boundaries.
- Use `0003-sdd-artifact-and-knowledge-model.md` for the future repo-local
  knowledge layer.
- Move schema ADR to `0004-ai-profile-schema-v1.md` to avoid ADR number
  collision.
- Add `docs/research/` to convert NotebookLM findings into repo-native rules.
