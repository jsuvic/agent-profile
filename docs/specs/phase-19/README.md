# Phase 19 Spec Map

## Status

Implemented on 2026-07-03 (approved the same day). Spec 001 is implemented
in `packages/doctor` and `apps/cli`; final verification review pending.

Phase 19 is the WS4 slice of the Agent Capability
Direction (`docs/plans/003-ws3-ws7-spec-synthesis.md`): a fully static, offline
MCP recommendation scan surfaced through `agent-profile doctor
--mcp-suggestions`. It ships the curated candidate catalog and pinned knowledge
baseline that the later WS3 `init --assist` slice reuses.

Exact generated wording and the informational doctor output must be explicitly
approved before implementation, because this slice introduces a new doctor
severity and a shipped baseline table whose honesty (as-of date, fail-closed on
unknown input) is a product safety claim.

## Purpose

Phase 12's `mcp-fit-check` skill (`phase-12/005`) gives the agent advisory
instructions but performs no analysis of the actual project. Phase 19 adds the
static, offline scan that the Phase 12 spec explicitly deferred to WS4: it reads
declared dependencies, compares them against a pinned known-as-of baseline, and
emits informational recommendations pointing at curated MCP candidate ids.

Phase 19 writes nothing, calls no network, and cannot flip the doctor exit code.

## Review Order

1. `001-mcp-recommendation-scan.md`

## Dependencies

- Phase 4 `doctor` command and issue envelope (`phase-04/002`).
- Phase 12 skills-pack schema patterns (`phase-12/002`) and the `mcp-fit-check`
  advisory skill (`phase-12/005`), whose WS4 deferral this phase discharges.
- Existing golden fixture and lockfile determinism contracts.

## Downstream

- WS3 `init --assist` (`suggestedMcpCandidates` enum imports the catalog module
  defined here). WS4-I1 is a hard prerequisite for WS3-I1.

## Implementation Gate

Phase 19 implementation is allowed only when:

- the `McpCandidate` catalog and `KnowledgeBaseline` table shapes are approved as
  the shared module WS3 will import
- the new non-gating doctor severity and its status/exit mapping are approved
- the two informational issue codes and their redaction rules are approved
- the offline network-sentinel test approach is accepted as the no-network proof
- the v1 ecosystem scope (npm only, see spec) is accepted

## Out of Scope for Phase 19

- Generating any MCP configuration, server command, install command, env var
  name, token, URL, or arbitrary MCP id.
- Any network, registry, package-doc, or model-knowledge probe.
- Writing or repairing files; changing client runtime settings.
- The WS3 `init --assist` invocation, validator, or mapping.
