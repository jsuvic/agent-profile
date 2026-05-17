# Spec: Extended Ecosystem Targets

## Status

Draft for a later phase. Not MVP.

Routed from `docs/research/007-agent-best-practices-review.md`
(Cross-Cutting Surfaces Still Missing — Extended ecosystem targets).

AGENTS.md still says: "Do not add Cursor, Aider, Copilot, or enterprise
features unless a spec explicitly adds them." This spec is the explicit
addition for Cursor, Aider, Cline, Continue, and Roo Code, and remains
deferred behind explicit per-target verification work. Approval of this
spec does not relax the AGENTS.md scope rule; each ecosystem target
requires its own approved per-target spec before generation begins.

## Problem

The MVP first-supported-targets list is Tabnine / Codex / Claude. Real
teams routinely run additional AI coding assistants — Cursor, Aider,
Cline, Continue, Roo Code — each with their own project-local
configuration surface. Without a routing spec, the compiler will keep
emitting only the three MVP targets and the canonical `ai-profile.yaml`
will keep growing client-specific extensions instead of remaining
client-neutral.

## Goal

Define which ecosystem agents are candidate compile targets, what each
exposes as a project-local artifact surface, and the per-target spec
gates required before generation is allowed. This spec is a routing and
research spec; it does not implement any new target.

## Non-Goals

- implementing any ecosystem target in this spec
- changing the canonical profile schema for any ecosystem-specific feature
- generating global/user-level configuration for any target
- shipping per-language style guides (those route through
  `phase-later/012`)
- making MVP target generation depend on any ecosystem target

## Candidate Ecosystem Targets

| Agent | Project-local artifact surface | Capability notes |
| --- | --- | --- |
| Cursor | `.cursor/rules/*.mdc`, `.cursorignore`, project MCP via Cursor settings | Rule files use Markdown with MDC frontmatter for scoping; MCP via Cursor settings |
| Aider | `CONVENTIONS.md` (project), `.aider.conf.yml` (project config), command shortcuts | CONVENTIONS.md sits near `AGENTS.md`; `.aider.conf.yml` carries model + edit-format defaults |
| Cline | `.clinerules/*.md`, MCP marketplace metadata | Rules are scoped per file or per pattern; MCP via Cline marketplace |
| Continue | `config.yaml` (project), model + tool routing block | Single project config file; supports custom slash commands and tools |
| Roo Code | `.roo/<mode>/system-prompt.md` per mode | Per-mode prompt files; modes map to agent personas |

Each row is `unknown` confidence until a per-target spec re-verifies the
exact paths, file formats, frontmatter keys, and runtime semantics
against current official docs.

## Inputs

- existing capability model (ADR 0005)
- existing capability matrix (`docs/research/006-client-capability-matrix.md`)
- official docs for each candidate ecosystem agent, re-verified before
  any per-target implementation spec is approved

## Outputs

- per-target sub-specs in a future phase, one per ecosystem agent
- new rows in the capability matrix for each agent
- explicit `disabled_target` results for any profile that requests an
  ecosystem target before its sub-spec is verified

## Contracts

- This spec adds **no** generation logic on its own. It defines the
  routing only.
- A per-target sub-spec must exist before the compiler emits any
  ecosystem target output.
- Per-target sub-specs must follow the existing target-contract template
  (target id, template id, output path, fixture input, fixture gold,
  determinism contract, security rules, lockfile entry).
- The canonical `ai-profile.yaml` must remain client-neutral. Mapping to
  target-specific artifacts is the per-target adapter's job.
- Each ecosystem target adapter must report unsupported capabilities
  explicitly instead of silently ignoring them.

## Security Rules

- Do not execute, install, or fetch any ecosystem agent runtime during
  compile or doctor.
- Do not write outside the documented project-local paths for each
  target.
- Do not auto-install dependencies, MCP servers, or extensions for any
  ecosystem target.
- Do not embed literal secrets, environment values, or production
  endpoints in any ecosystem artifact.

## Acceptance Criteria

- candidate ecosystem agents are listed with their project-local artifact
  surfaces
- the capability matrix is extended with a row per candidate agent
  (initial confidence `unknown` until verified)
- no compile-time generation is added by this spec
- per-target sub-spec template requirements are documented

## Tests

- capability-matrix extension test (matrix file contains the new rows)
- routing test confirming the compiler emits `disabled_target` for any
  ecosystem target without an approved sub-spec
- absence test confirming MVP target behavior is unchanged

## Documentation Updates

- `docs/research/006-client-capability-matrix.md` — add a row per
  candidate ecosystem agent
- `docs/architecture/decisions/0005-client-capability-model.md` —
  cross-reference this routing spec
- `AGENTS.md` — when each per-target sub-spec is approved, the
  first-supported-targets list and the explicit exclusion sentence must
  be updated together

## Final Review Checklist

- no implementation work is requested in this spec
- AGENTS.md scope rule is preserved until per-target sub-specs are
  approved
- per-target sub-spec template requirements match the existing
  target-contract template
- each candidate agent is listed with `unknown` confidence until
  verified
