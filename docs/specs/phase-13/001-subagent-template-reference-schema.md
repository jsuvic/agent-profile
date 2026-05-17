# Spec: Subagent Template Reference Schema

## Status

Approved and implemented. Belongs to Phase 13. Depends on Phase 11.

## Problem

Phase 11 lets a profile author define subagents inline, but every user must
write the same implementation-review roles by hand. That creates predictable
drift: underspecified descriptions, vague prompts, broad tool access, and no
shared status contract.

The project needs a deterministic way to opt into reviewed bundled templates
while preserving the Phase 11 rules: client-neutral profile input,
project-local output only, no secret material, no source upload, no runtime
subagent invocation, and no target-specific fields in `ai-profile.yaml`.

## Goal

Add a template-reference form for `capabilities.delegation.subagents.agents[]`
and a workflow gate for the parent orchestration skill.

The first supported template names are:

- `implementer`
- `spec-reviewer`
- `code-quality-reviewer`

The first supported workflow gate is:

```yaml
workflow:
  subagentDrivenDevelopment: true
```

## Non-Goals

- implementing Phase 11 subagent targets
- adding arbitrary remote template registries
- allowing template body overrides
- adding target-specific model ids or tool names to `ai-profile.yaml`
- generating Tabnine workflow subagents
- executing subagents during compile or doctor
- generating worktrees, commits, pull requests, or dependency installation

## User Flow

```yaml
workflow:
  sdd: true
  tdd: true
  finalReview: true
  subagentDrivenDevelopment: true

capabilities:
  delegation:
    subagents:
      enabled: true
      defaults:
        maxConcurrent: 3
        maxDepth: 1
      agents:
        - useTemplate: implementer
        - useTemplate: spec-reviewer
        - useTemplate: code-quality-reviewer
```

1. The user opts into subagent generation and references one or more bundled
   templates.
2. The compiler expands each template reference into a normal Phase 11
   subagent intent before target rendering.
3. The compiler emits project-local Codex and Claude subagent files for the
   expanded intents.
4. If `workflow.subagentDrivenDevelopment: true`, the compiler emits a
   project-local `subagent-driven-change` skill for supported clients.
5. The compiler never starts the client and never invokes the generated
   subagents.

## Inputs

- Phase 11 validated subagent schema
- `workflow.subagentDrivenDevelopment`
- `capabilities.delegation.subagents.agents[].useTemplate`
- bundled template registry from `002-implementation-review-subagent-templates.md`
- derived `effectivePermissions`
- enabled clients

## Outputs

Schema additions:

| Field | Type | Required | Contract |
| --- | --- | --- | --- |
| `workflow.subagentDrivenDevelopment` | boolean | no | defaults to `false`; when true, emits the parent orchestration skill from `003` |
| `agents[].useTemplate` | string | alternative to inline fields | one of `implementer`, `spec-reviewer`, `code-quality-reviewer` |

Template references are mutually exclusive with these inline fields:

- `name`
- `description`
- `purpose`
- `prompt`
- `toolScope`
- `modelPreference`
- `maxTurns`
- `timeoutMinutes`
- `mcpServers`

Users who need a modified prompt must copy the template into a full inline
agent definition instead of overriding the bundled body.

## Contracts

- Template references are explicit; no subagent is generated unless the
  profile references it or defines it inline.
- `useTemplate` expands to the exact client-neutral intent defined by the
  approved template spec.
- Template expansion happens before Phase 11 per-target rendering and before
  lockfile descriptor generation.
- Expanded template names participate in all Phase 11 duplicate-name and
  built-in collision checks.
- Template references cannot be combined with inline agent fields.
- `workflow.subagentDrivenDevelopment: true` does not imply template
  generation by itself. The compiler must report a deterministic issue if the
  workflow gate is enabled but the three required template references are not
  present.
- The workflow gate is supported only for Codex and Claude in this phase.
- Non-empty `mcpServers` remain blocked until the MCP declaration schema is
  approved and implemented.

## Security Rules

- Do not fetch templates from a network source.
- Do not execute or evaluate template bodies.
- Do not embed secrets, environment values, tokens, bearer headers, or
  production endpoints in expanded templates.
- Do not silently broaden `effectivePermissions`.
- Do not generate Tabnine implementation-worker output in this phase because
  Tabnine subagents remain read-only-only under Phase 11.

## Acceptance Criteria

- schema accepts a profile that references all three supported templates
- schema rejects an unknown `useTemplate` value
- schema rejects a template reference mixed with inline fields
- schema rejects duplicate names after template expansion
- compiler reports a deterministic issue for
  `workflow.subagentDrivenDevelopment: true` without the three required
  template references
- compiler expansion produces the same downstream target inputs every run
- lockfile descriptors are deterministic and include the expanded template
  names
- disabled Codex or Claude clients do not emit that client's workflow skill or
  subagent files

## Tests

- schema validation accepts the example profile in this spec
- schema validation rejects unknown template names
- schema validation rejects mixed `useTemplate` and inline fields
- schema validation rejects duplicate expanded names
- compiler test proves template expansion order is stable:
  `implementer`, `spec-reviewer`, `code-quality-reviewer`
- compiler test proves `workflow.subagentDrivenDevelopment: true` without the
  required templates produces the documented deterministic issue
- absence test proves no template output when templates are not referenced
- disabled-client tests for Codex and Claude
- security test proves expanded templates contain no secret-like values or
  environment values

## Documentation Updates

- amend `docs/specs/phase-11/001-subagents-schema.md` after Phase 11 approval
  to reference this extension
- update `docs/research/004-best-practices-per-artifact.md`
- update future profile schema documentation
- update `fixtures/README.md` once template fixtures land

## Final Review Checklist

- template references stay client-neutral
- template expansion does not bypass Phase 11 validation
- workflow gate cannot silently generate subagents
- unsupported clients are explicit
- no remote template fetch or runtime subagent invocation is introduced
