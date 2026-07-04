# Phase 20 Spec Map

## Status

Spec 001 approved on 2026-07-04 (fixing the `ASSIST-SEC-001..010` text). The
threat model 002 has its structure and residual-risk acceptance approved the
same day; its final sign-off checklist stays open until the per-tool
read-only flags are pinned at WS3-I3.

Phase 20 is the WS3 slice of the Agent Capability Direction
(`docs/plans/003-ws3-ws7-spec-synthesis.md`): an opt-in `init --assist` where a
user-chosen local AI CLI runs read-only and returns a strict recommendation
object that APC validates, maps into wizard pre-selections, and writes through
the normal diff -> approve -> atomic path.

This is the riskiest surface in the WS3-WS7 set, so one gate survives
approval: the invocation adapters (WS3-I3) may not land, and the mapping
(WS3-I4) may not be reviewed, before the `002` sign-off checklist is complete.
WS3-I1, WS3-I2, and WS3-I5 are cleared for implementation now.

## Review Order

1. `001-init-assist.md`
2. `002-init-assist-threat-model.md`

## Dependencies

All prerequisites have landed:

- Phase 12 `002` (skills-pack schema), `007` (init capability selection),
  `008` (subagent packs) - the mapping targets and the wizard being extended.
- Phase 19 `001` - the shared `McpCandidate` catalog that
  `suggestedMcpCandidates` imports (WS4-I1 was the hard prerequisite for
  WS3-I1).
- Phase 5 diff-before-write and Phase 4 doctor contracts.

## Relationship to phase-later/019

`phase-later/019-ai-assisted-import-merge.md` (draft) generates a copyable
prompt and never invokes a model; Phase 20 invokes a local CLI and ingests its
JSON. They are distinct surfaces; Phase 20 neither implements nor supersedes
019, and 019 remains a phase-later draft.

## Out of Scope for Phase 20

- Acting on any path, command, patch, or file content from the assistant.
- MCP config generation from suggested candidate ids.
- Hosted execution, background execution, or APC-initiated network calls.
- WS5 hooks, WS6 loop skills, WS7 memory (parallel-safe siblings, own phases).
