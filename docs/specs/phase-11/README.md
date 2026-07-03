# Phase 11 Spec Map

## Status

Implemented. Lifted from `phase-later/002-subagents-targets.md` on 2026-05-16.
Implementation landed on 2026-05-17 in `dcf18bd` (PR #16); workspace-write
Claude subagent tooling was repaired in `d2a9f79` (PR #22). Phase 13 subagent
template references (PR #17) and the Phase 12 `reviewer-subagents` pack
(PR #49) build on this platform.

## Purpose

Phase 11 covers project-local subagent generation for the three supported
clients:

- Claude project subagents
- Codex project custom agents
- Tabnine CLI project custom subagents

The phase preserves the product principles: local-first output, no source
upload, no secret upload, deterministic generation, lockfile-tracked artifacts,
and safety checks as part of the feature.

## Origin

This phase is the lifted form of the umbrella spec
`docs/specs/phase-later/002-subagents-targets.md`. The umbrella itself
recommended this split. The umbrella is kept as superseded history; all binding
contracts live in the numbered specs below.

## Review Order

1. `001-subagents-schema.md`
2. `002-claude-subagents-target.md`
3. `003-codex-subagents-target.md`
4. `004-tabnine-subagents-target.md`
5. `005-doctor-subagent-checks.md`

Read `001` first. The other four depend on the schema shape and naming rules
defined there.

## Implementation Branch

`jsu/subagents`, per the umbrella recommendation. Implementation must not be
landed on `master` until every spec in this phase is Approved.

## Out of Scope for Phase 11

- launching, invoking, or testing subagents at compile or doctor time
- installing third-party subagent packages, extensions, plugins, MCP servers,
  skills, or dependencies
- generating global/user-level, managed, admin, or plugin subagents
- generating Claude hooks, memory, worktree isolation, background mode, or
  inline MCP servers
- generating Codex CSV fan-out workflows, `danger-full-access`, or
  `approval_policy = "never"`
- generating Tabnine `run_shell_command`, `write_file`, browser-agent settings,
  extension references, or `.tabnine/agent/settings.json`
- generating Cursor, Aider, Copilot, or enterprise subagent surfaces

## Cross-Phase Amendments Required Before Implementation

`001-subagents-schema.md` lists the full set. Summary:

- `phase-01/001-profile-schema-v1.md` must lift
  `capabilities.delegation.subagents` from reserved to live.
- `phase-01/003-compiler-determinism.md` must add the three new target ids to
  `CompilerTargetId`.
- `phase-03/001-codex-config-target.md` must accept the additive `[agents]`
  block from `003-codex-subagents-target.md`.
- `phase-04/001-doctor-lockfile-drift.md` must cover orphan generated subagent
  artifacts.
- `phase-04/003-doctor-permission-mode-checks.md` must validate subagent tool
  and sandbox fields against `effectivePermissions`.
- `phase-04/005-doctor-security-checks.md` must include subagent artifacts in
  secret-pattern, source-upload, and unsafe-instruction checks without
  printing file contents.
- `phase-04/006-doctor-skill-checks.md` must explicitly exclude subagent
  artifacts; `005-doctor-subagent-checks.md` owns those checks.
- `phase-05/005-import-existing-artifacts.md` must keep manually authored
  subagents as manual-review imports.
- `phase-later/008-mcp-server-declaration-schema.md` remains a hard prereq for
  any `mcpServers` reference beyond empty lists.

## Implementation Order Recommendation

1. Land the schema amendment to `phase-01/001`.
2. Land the determinism amendment to `phase-01/003`.
3. Implement `claude-subagents` and `codex-subagents` targets with golden
   fixtures; `tabnine-subagents` follows once the read-only-only constraint is
   accepted by reviewers.
4. Extend `codex-config` to merge the additive `[agents]` block.
5. Add doctor checks in `phase-04` and the new `005-doctor-subagent-checks.md`.
6. Add `fixtures/subagents-enabled/` golden fixtures.
7. Update target documentation in `docs/targets/`.

Each step must be reviewed against the relevant spec before merge.

## Follow-On Phase

Phase 13 builds on this phase after the subagent foundation is verified. It
adds template references, the implementation-review subagent templates, and
the parent `subagent-driven-change` orchestration skill. Phase 11 should stay
focused on the subagent platform layer and should not absorb those workflow
templates.
