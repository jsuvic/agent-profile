# Spec: MCP Recommendations Pack - mcp-fit-check Skill (WS1)

## Status

Approved. Depends on `002-skills-pack-schema.md`.

## Problem

When a project uses a framework, runtime, or SDK newer than the AI client's
likely knowledge, current documentation via MCP can help. Users need a safe,
advisory skill that recommends this without any installation, configuration, or
network behavior.

## Goal

Generate an `mcp-fit-check` skill, gated by the `mcp-recommendations` pack, that
guides the agent to recommend (never install or configure) MCP/docs/search
integrations.

## Non-Goals

- The WS4 static recommendation scan (`doctor --mcp-suggestions`) - later slice.
- Generating MCP configuration, server commands, install commands, env var
  names, tokens, or arbitrary MCP ids.
- A `mcp-config` pack (may exist in a later slice).

## User Flow

1. User selects the `mcp-recommendations` pack.
2. Compile generates `mcp-fit-check` SKILL.md for Claude and Codex.
3. The agent uses it to recommend MCP/docs candidates, explaining why and the
   risk, and always deferring install/config to the user.

## Inputs

- Resolved skill set from `002`.

## Outputs

- `mcp-fit-check` SKILL.md for Claude (`.claude/skills`) and Codex
  (`.agents/skills`).

## Contracts

- Advisory, instruction-only. The skill body must not instruct installation,
  configuration, network calls, token handling, or arbitrary MCP naming.
- Recommendation wording is honest: "this dependency may be newer than the
  client's knowledge; current docs may help" - never "the model does not know
  X".
- Pack id is `mcp-recommendations`; the skill recommends only, generating no MCP
  config.

## Security Rules

- No secrets, no network, no execution, no install.
- No literal MCP server commands or tokens in generated content.

## Acceptance Criteria

- `mcp-recommendations` on -> `mcp-fit-check` emitted for Claude and Codex.
- Skill body contains no install/config/network/token instructions.
- Deterministic, byte-stable output.

## Tests

- Golden fixture: `mcp-recommendations` on -> `mcp-fit-check/SKILL.md` present.
- Content assertion: body contains no forbidden verbs (install, configure,
  token, server command).
- Determinism: byte-stable.

## TDD Strategy

RED: golden fixture expecting `mcp-fit-check/SKILL.md` and a content test
asserting absence of install/config instructions. GREEN: emit from resolved set.

## Issue Plan

- I4: `mcp-fit-check` emission. `sequenced` after I1, R1; parallel-safe with I2,
  I3.

## Documentation Updates

- `docs/targets/` mapping.
- Cross-reference the WS4 contract in
  `docs/plans/001-agent-capability-direction.md`.

## Final Review Checklist

- Advisory-only; no install/config/network/token content.
- Honest staleness wording.
- Deterministic fixtures; skill grants no tools.
