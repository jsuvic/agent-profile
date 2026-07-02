# Spec: Skills Pack Schema and Skill Resolution (WS1 foundation)

## Status

Approved. Owns the schema-side contract and the skill-resolution
refactor for Phase 12 WS1. `003`-`006` depend on this spec.

## Problem

The compiler binds each generated skill to exactly one `workflow` flag via
`WORKFLOW_SKILLS` in `packages/compiler/src/compiler.ts`. The skill catalog
expansion (WS1) needs a neutral, client-independent way to select groups of
skills (packs), and needs the `codeReview` workflow flag to be equivalent to the
`review` pack. Without a single resolved skill set, pack conditional logic would
be duplicated across every emitter (Claude, Codex, Tabnine, doctor).

## Goal

1. Add a live, neutral `capabilities.skills.packs` intent to `ai-profile.yaml`.
2. Introduce a single `resolveSelectedSkills(profile)` that unions
   workflow-flag skills and pack skills into one deterministic, de-duplicated,
   ordered set consumed by all emitters and doctor.

## Non-Goals

- Emitting any new skill file (owned by `003`, `004`, `005`).
- Doctor checks (owned by `006`).
- Init/wizard changes (owned by `007`).
- Loop (`automation`) skill content - `automation` is a reserved pack id here
  and generates nothing in Phase 12.
- The reviewer subagents capability. This spec owns `capabilities.skills.packs`
  only. Reviewer subagents are a subagent capability under
  `capabilities.delegation.subagents.packs`, owned by `008`; the skill pack ids
  (`base`, `review`, `advanced-review`, `automation`, `mcp-recommendations`) are
  unchanged and never include a subagent pack.

## User Flow

1. A user selects capability packs in `ai-profile.yaml` under
   `capabilities.skills.packs`.
2. `agent-profile compile --dry-run` previews the skills that the resolved set
   produces.
3. `agent-profile compile --write` writes only lockfile-tracked project files.

## Inputs

- Validated `AiProfile` from `phase-01/001-profile-schema-v1.md`.
- Existing `workflow` flags (`sdd`, `tdd`, `finalReview`, `codeReview`,
  `refactoring`, `documentation`, `subagentDrivenDevelopment`).
- Compiler determinism contract `phase-01/003-compiler-determinism.md`.

## Schema Shape

```yaml
capabilities:
  skills:
    packs:
      - base
      - review
      - advanced-review
      - automation
      - mcp-recommendations
```

- `packs` is an optional array of unique pack ids.
- Allowed pack ids: `base`, `review`, `advanced-review`, `automation`,
  `mcp-recommendations`. Unknown ids are rejected with a schema validation
  issue.
- `additionalProperties: false` is preserved on `capabilities`,
  `capabilities.skills`, and each object.

### Pack -> skill mapping (neutral)

- `base` -> `sdd-change`, `tdd-change`, `final-review`
- `review` -> `review-change`
- `advanced-review` -> `security-review`, `readability-review`, `test-review`,
  `architecture-review`
- `automation` -> (none in Phase 12; reserved)
- `mcp-recommendations` -> `mcp-fit-check`

Skill bodies and per-target emission are owned by `003`-`005`. This spec owns
only the mapping table and the resolution contract.

### Workflow-flag <-> pack equivalence

- `workflow.codeReview: true` is equivalent to selecting the `review` pack.
- Existing `workflow.sdd/tdd/finalReview/subagentDrivenDevelopment` flags keep
  emitting their current skills (`grill-change`, `request-to-spec-issues`,
  `sdd-change`, `tdd-change`, `final-review`, `subagent-driven-change`)
  unchanged.

## Skill Resolution Contract

- `resolveSelectedSkills(profile): SkillId[]` returns the union of:
  - skills implied by set `workflow` flags (current behavior), and
  - skills implied by selected `capabilities.skills.packs`.
- The result is de-duplicated and deterministically ordered (stable across
  runs).
- All emitters (`claude-workflow-skills`, `codex-workflow-skills`, Tabnine
  guideline mapping) and doctor read this single set.

## Contracts

- Additive and backward compatible: profiles without `capabilities.skills`
  behave exactly as today.
- A profile that sets both `workflow.codeReview: true` and the `review` pack
  produces `review-change` once (no duplication).
- Deterministic: two renders of the same profile produce byte-identical skill
  selection and output.

## Security Rules

- Skills are instruction-only; the schema grants no tools, shell, or network.
- No secrets in schema or resolved output.

## Acceptance Criteria

- `capabilities.skills.packs` validates; unknown pack ids rejected with a clear
  path/message.
- `resolveSelectedSkills` unions flag skills and pack skills, de-duplicated and
  ordered.
- `renderProfileYaml` serializes `capabilities.skills.packs` deterministically in
  the schema field order.
- Existing fixtures that use `workflow.codeReview` still pass or are updated only
  to reflect the review-pack equivalence.

## Tests

- Core: accept known pack ids; reject `packs: ["bogus"]`; reject duplicates.
- Core: `renderProfileYaml` round-trip is byte-stable.
- Compiler: `resolveSelectedSkills` unit tests for flag-only, pack-only, and
  overlapping (`codeReview` + `review`) inputs.
- Determinism: double-resolution equality.

## TDD Strategy

RED: schema validation test rejecting an unknown pack id, and a
`resolveSelectedSkills` test asserting de-duplication for `codeReview` + `review`.
GREEN: minimal schema + resolution. Refactor: route existing emitters through
`resolveSelectedSkills`.

## Issue Plan

- R1: `resolveSelectedSkills` refactor. `ready`, prerequisite for I2-I6.
- I1: pack schema + types + validation + render. `ready`, blocks I2-I6, I8.

## Documentation Updates

- `phase-01/001-profile-schema-v1.md` amendment (lift `capabilities.skills`).
- Schema reference docs.

## Final Review Checklist

- Additive schema; `additionalProperties: false` preserved.
- No duplicate skills when flag and pack overlap.
- Single resolution path used by all emitters and doctor.
- Deterministic ordering and byte-stable render.
