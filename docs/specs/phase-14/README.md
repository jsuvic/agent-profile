# Phase 14 Spec Map

## Status

Approved. Phase 14 is the safe import, ownership, and region-aware merge layer
for repositories that already have agent instruction files or skills.

Phase 27/001 fixes import-report conformance to Phase 14's lockfile-first ownership proof order.

Implementation landed in commits 196b2ac, cf25c09, bfe25f9, and 6317757 on the
`codex/phase-14-safe-import-ownership` branch. The Implementation Gate items
below were satisfied before merge; the Verification Gate items are exercised
by tests in `packages/compiler/src/phase14.test.ts`,
`packages/doctor/src/phase14.test.ts`, and `apps/cli/src/phase14.test.ts`.

## Purpose

Earlier phases can generate deterministic project-local artifacts, but real
repositories often already contain `AGENTS.md`, `CLAUDE.md`, client config, MCP
configuration, or custom skills. Blind replacement is unsafe and unfriendly.

Phase 14 defines deterministic ownership and merge behavior so users can adopt
Agent Profile Compiler without losing existing instructions.

## Review Order

1. `001-safe-import-ownership-and-regions.md`
2. `002-lockfile-v2.md`

## Dependencies

- Phase 1 lockfile and compiler determinism.
- Phase 5 `init --import`.
- Phase 8 local write safety.
- Phase 11 and Phase 13 generated subagent and workflow skill outputs.

## Out of Scope for Phase 14

- AI-assisted semantic merge.
- Local UI migration wizard.
- Remote template registries.
- Importing MCP server declarations into `ai-profile.yaml`.
- Running or invoking generated skills or subagents.
- Committing, branching, pushing, or opening pull requests.

## Implementation Gate

Phase 14 implementation is allowed only when:

- the ownership model is approved
- exact region markers are approved
- lockfile v2 schema is approved
- CLI import reports are approved with stable examples
- write-plan behavior for every ownership state is approved
- doctor drift semantics are approved

## Verification Gate

Phase 14 verification requires:

- existing manual `AGENTS.md` and `CLAUDE.md` content is preserved byte-for-byte
  inside manual regions during region adoption
- generated regions update deterministically across repeated compile runs
- manual region edits do not fail doctor
- generated region edits do fail doctor
- foreign skills are never overwritten by default
- explicit force/replace behavior remains reviewable and path-scoped
- `.gitignore` recommendations are deterministic and non-mutating unless the
  user explicitly requests a write
