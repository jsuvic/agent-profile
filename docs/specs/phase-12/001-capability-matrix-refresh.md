# Spec: Capability Matrix Refresh (WS0)

## Status

Approved. Owns the WS0 documentation slice of Phase 12.

## Problem

Decisions about which advanced capabilities to generate (skills, hooks,
subagents, MCP, memory, loops) rest on capability claims that are not verified
against current official documentation. ADR 0005 (client-capability-model)
predates the 2026 Codex and Claude surfaces and does not carry per-capability
confidence labels or verification dates.

## Goal

Produce a verified capability matrix and amend ADR 0005 so every downstream
Phase 12 (and later WS3-WS7) decision cites official sources with a confidence
label and a verification date.

## Non-Goals

- Any code, schema, compiler, or doctor change.
- Generating any artifact.
- Deciding WS3-WS7 implementation details (only documenting capability facts).

## User Flow

A contributor reads `docs/research/008-current-agent-capabilities-2026-07.md`
and ADR 0005 to confirm which capabilities each client officially supports
before writing a spec that generates for that capability.

## Inputs

- Official OpenAI Codex, Anthropic Claude Code, and Tabnine documentation and
  changelogs, verified on 2026-07-01.
- Existing ADR 0005.

## Outputs

- `docs/research/008-current-agent-capabilities-2026-07.md`.
- An amendment section in
  `docs/architecture/decisions/0005-client-capability-model.md`.

## Matrix Shape

Rows: project instructions, global/user instructions, memory, skills, MCP
config, runtime permissions/safety modes, hooks, subagents, plugins,
slash/custom commands, loop/batch workflows, admin/team governance,
import/migration.

Columns: Codex support, Claude support, Tabnine support, official source URL,
verification date, confidence level, project-local generation possible?,
global/user generation possible?, recommended compiler action.

Confidence values: `confirmed-official`, `partial-official`, `unknown`,
`not-supported`.

Recommended compiler action values: MVP generate, later generate, document only,
doctor check only, unsupported warning, do not support.

## Contracts

- Every capability claim cites an official documentation or changelog URL and a
  verification date.
- Third-party blogs and videos may appear only as workflow inspiration, never as
  proof of support.
- Tabnine hooks/subagents/plugins parity stays `unknown` or `not-supported`
  unless official docs prove otherwise.

## Security Rules

- No secrets, credentials, private endpoints, or production data in the doc.
- No network calls performed by the compiler as a result of this spec (this is a
  human-authored research doc).

## Acceptance Criteria

- The matrix exists with every cell populated (or explicitly `unknown`).
- Each supported cell carries a source URL and the 2026-07 verification date.
- ADR 0005 has a dated amendment referencing the matrix and confirming
  Codex/Claude hooks and subagents as officially supported and Tabnine as
  guidelines/MCP/governance-gated.

## Tests

- Docs lint / markdown link check where available.
- Manual review that each supported claim resolves to an official URL.

## TDD Strategy

Not applicable (documentation-only). Verification is by review, not by test.

## Issue Plan

- I0 (this spec): matrix doc + ADR amendment. `ready`, `parallel-safe`.

## Documentation Updates

- New `docs/research/008-current-agent-capabilities-2026-07.md`.
- ADR 0005 amendment.

## Final Review Checklist

- Every supported capability cites an official source with a verification date.
- No third-party source used as proof of support.
- Tabnine advanced-capability parity remains gated.
- No secrets or private data in the doc.
