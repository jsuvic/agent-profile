# Phase 10.5 Spec Map

## Status

Verified. Phase 10.5 is a narrow workflow-skill hardening pass implemented on
2026-05-17 after verified Phase 10 guidance expansion and before Phase 11
subagent generation.

## Purpose

Phase 10.5 strengthens the existing generated `tdd-change` workflow skill
without changing the profile schema, target set, lockfile format, or supported
clients.

The phase exists because the verified MVP TDD skill says tests should lead the
implementation, but it does not require proof that the test failed for the
right reason before code was written, proof that the same test passed after the
minimal implementation, or guardrails against common mock-heavy testing
anti-patterns.

## Review Order

1. `001-tdd-skill-red-green-hardening.md`

## Target Surfaces

The phase amends only the existing project-local workflow skill outputs:

- `.agents/skills/tdd-change/SKILL.md`
- `.claude/skills/tdd-change/SKILL.md`

The existing `sdd-change` and `final-review` workflow skill outputs remain
unchanged.

## Implementation Gate

Phase 10.5 implementation was allowed only when:

- `001-tdd-skill-red-green-hardening.md` was approved for implementation
- `phase-03/004-codex-workflow-skills-target.md` was amended to reference the
  `tdd-change@2` template
- `phase-03/005-claude-workflow-skills-target.md` was amended to reference the
  `tdd-change@2` template
- golden fixtures were updated only for the two `tdd-change` skill files and
  their lockfile descriptors
- existing disabled-workflow tests continued to prove no `tdd-change` file is
  emitted when `workflow.tdd: false`

## Verification Gate

Phase 10.5 verification requires:

- exact golden output for Codex and Claude `tdd-change` skills
- lockfile template ids use `targets/codex-workflow-skills/tdd-change@2` and
  `targets/claude-workflow-skills/tdd-change@2`
- generated skills include RED verification, GREEN verification, and testing
  anti-pattern guidance
- generated skills do not add scripts, references, assets, dynamic shell
  context, tool pre-approval, dependency installation, source upload, secret
  access, or production access
- existing `sdd-change` and `final-review` golden fixtures are byte-identical

## Out of Scope

- changing `ai-profile.yaml` schema
- changing `AGENTS.md`, `CLAUDE.md`, Tabnine guidelines, config files, or MCP
  output
- generating skill `references/` directories
- generating subagents or subagent orchestration
- changing doctor issue codes beyond existing skill hygiene checks
- running tests automatically at compile or doctor time
