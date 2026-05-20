# Spec: Request To Spec Issues Skill

## Status

Verified on 2026-05-20.

Implemented in `packages/compiler` and covered by golden, content,
trigger-language, banned-topics, byte-stability, and determinism tests in
`packages/compiler/src/compiler.test.ts`. Doctor no-drift across affected
fixtures is proven by `packages/doctor/src/doctor.test.ts`. Belongs to Phase 18. Depends on Phase 17 `grill-change` implementation.

The exact generated skill wording requires explicit human approval before
implementation because it controls how agents turn product intent into specs
and implementation issues.

## Problem

Phase 17 clarifies a rough stakeholder request, but the repo still needs the
next step: turn the completed grill agreement into an intent-first spec
candidate and vertical TDD-ready issue briefs.

Without a dedicated post-grill synthesis skill, agents can:

- keep asking new questions after direction was already settled
- write specs that preserve engineering mechanics but lose product intent
- split work by files or layers instead of behavior slices
- omit dependency edges, RED/GREEN proof, or review expectations
- create issue plans that cannot be safely parallelized by a team
- write GitHub issues before the project has selected a backend mode

## Goal

Generate a deterministic `request-to-spec-issues` workflow skill for Codex and
Claude when SDD workflow is enabled.

The skill converts a completed `grill-change` agreement record into:

1. an intent-first spec candidate or spec patch with PRD-style product intent
2. vertical TDD-ready issue briefs
3. dependency and parallelism notes
4. human gates and risks

## Non-Goals

- implementing GitHub issue creation
- adding planning backend schema
- writing files automatically
- adding skill `references/`, scripts, assets, plugins, MCP declarations, or
  subagents
- changing `ai-profile.yaml` schema
- changing runtime permissions, approval policy, Codex sandbox mode, Claude
  permission mode, or `bypassPermissions`
- generating Tabnine artifacts
- adding hosted execution, source upload, telemetry, or remote MCP behavior

## Sequencing

Phase 18 implementation is blocked by Phase 17 implementation. The regression
baseline for this spec is the post-Phase-17 generated state, so
`grill-change` is an existing workflow skill and must remain byte-identical
while `request-to-spec-issues` is added.

Within Phase 18, this spec must be implemented before
`002-tabnine-planning-guideline.md` or in the same coordinated change. Both
specs update shared fixtures and lockfiles, so parallel independent
implementation would create the fixture conflict that the planning workflow is
designed to avoid.

## PRD Boundary

This phase does not introduce a separate durable PRD artifact. PRD-style
product context is folded into the intent-first spec through `Intent`,
`Decision Rules`, user flow, non-goals, and acceptance criteria. This avoids a
second markdown plan that can drift away from the approved engineering spec.

## Gate Decision

This phase uses `workflow.sdd: true` as the generation gate instead of adding a
new schema field.

Options considered:

| Option                                       | Decision              | Rationale                                                                                                          |
| -------------------------------------------- | --------------------- | ------------------------------------------------------------------------------------------------------------------ |
| `workflow.sdd: true`                         | accepted for Phase 18 | Post-grill synthesis produces the spec and issue plan for SDD. This keeps the first implementation self-contained. |
| new `workflow.planning` block                | deferred              | More precise long term, but requires schema, UI, fixture, and documentation work.                                  |
| gate on `workflow.subagentDrivenDevelopment` | rejected              | Issue preparation is useful for human teams even when subagents are disabled.                                      |

This is an additive behavior change for existing projects that already enable
SDD with Codex or Claude: their next compile will gain a new project-local
`request-to-spec-issues` skill file and matching lockfile entries.

## User Flow

1. The user completes a `grill-change` session.
2. The agent loads `request-to-spec-issues`.
3. The agent uses the grill agreement record, repo specs, ADRs, docs, fixtures,
   and code context.
4. If no completed grill agreement exists, the agent stops and redirects to
   `grill-change` first.
5. The agent does not re-interview the user unless it finds a contradiction or
   a genuinely missing decision.
6. The agent returns an intent-first spec candidate and vertical issue briefs.
7. The user approves, revises, or asks for local file writes as a separate
   explicit step.

## Inputs

- validated `AiProfile`
- `workflow.sdd`
- `clients.codex.enabled`
- `clients.claude.enabled`
- completed `grill-change` agreement record
- repository specs under `docs/specs/`
- repository instructions from `AGENTS.md`
- existing workflow skills:
  - `sdd-change`
  - `tdd-change`
  - `final-review`
  - `subagent-driven-change`
- existing Codex workflow skill target from `phase-03/004`
- existing Claude workflow skill target from `phase-03/005`
- compiler determinism contract from `phase-01/003`
- golden test contract from `phase-01/005`

## Outputs

This phase amends the existing workflow skill targets by adding
`request-to-spec-issues`.

| Target                   | Output path                                      | Template id                                               |
| ------------------------ | ------------------------------------------------ | --------------------------------------------------------- |
| `codex-workflow-skills`  | `.agents/skills/request-to-spec-issues/SKILL.md` | `targets/codex-workflow-skills/request-to-spec-issues@1`  |
| `claude-workflow-skills` | `.claude/skills/request-to-spec-issues/SKILL.md` | `targets/claude-workflow-skills/request-to-spec-issues@1` |

The generated Markdown for both targets is identical except for output path and
lockfile descriptor.

Every fixture with expected generated Codex or Claude workflow skills and
`workflow.sdd: true` must gain the corresponding `request-to-spec-issues`
expected file and lockfile entries. At the time of this spec, affected expected
fixture trees include:

- `fixtures/code-review-enabled`
- `fixtures/documentation-enabled`
- `fixtures/minimal-valid`
- `fixtures/react-typescript`
- `fixtures/refactoring-enabled`
- `fixtures/subagent-driven-development`
- `fixtures/subagents-enabled`

## Exact Generated Output

The exact generated `SKILL.md` bytes, with LF line endings and exactly one
trailing newline, are:

```markdown
---
name: request-to-spec-issues
description: Use after a grill-change session is complete to turn the agreement record into an intent-first spec candidate and vertical TDD-ready issue briefs.
---

<!-- Generated by Agent Profile Compiler. Do not edit by hand. -->

# Request To Spec Issues

## Purpose

Convert a completed `grill-change` agreement record into an intent-first spec candidate and vertical TDD-ready issue briefs. Preserve product intent and decision rules so implementation choices follow the agreed direction.

## Preconditions

- The grill is complete.
- The user has confirmed the direction is ready for synthesis.
- Relevant local specs, ADRs, docs, fixtures, and code context have been checked.
- If there is no completed grill agreement, stop and run `grill-change` first.

## Synthesis Rules

1. Do not re-interview the user unless the grill record contains a contradiction or a genuinely missing decision.
2. Keep product intent, non-goals, durable terms, and hard-to-reverse decisions above implementation mechanics.
3. Preserve existing spec contracts and safety rules unless the user explicitly approved changing them.
4. Split work into vertical behavior slices, not file layers.
5. Make every issue small enough for a focused RED, GREEN, refactor loop.
6. Mark dependencies and parallel-safe work explicitly.
7. Propose architecture rescue candidates before feature slices when a change would deepen an already fragmented codebase.

## Architecture Rescue Candidates

When architecture rescue is needed, propose candidates before feature issues. Each candidate must include:

- Files or modules involved
- Current friction
- Proposed deeper module or clearer interface
- Expected locality and leverage improvement
- Expected test improvement
- ADR or spec conflicts
- Recommended dependency state: prerequisite, parallel, or later cleanup

## Spec Candidate

Include these sections:

- Status
- Problem
- Goal
- Intent
- Decision Rules
- Non-Goals
- User Flow
- Inputs
- Outputs
- Contracts
- Security Rules
- Acceptance Criteria
- Tests
- TDD Strategy
- Issue Plan
- Documentation Updates
- Final Review Checklist

`TDD Strategy` complements `Tests`; it must not replace the required `Tests`
section from `docs/specs/SPEC_TEMPLATE.md`.

## Issue Brief Format

Each issue brief must include:

- Title
- Parent spec or request
- Intent summary
- Behavior slice
- Non-goals
- Acceptance criteria
- Expected RED proof
- Expected GREEN proof
- Test command guidance
- Likely file ownership
- Dependencies
- Parallelism notes
- Contract impact
- Security impact
- Documentation impact
- Implementation context
- Review expectations

## Dependency States

Use these states:

- `ready`
- `blocked`
- `parallel-safe`
- `sequenced`
- `human-gate`

## Output

Return:

- Spec candidate or spec patch
- Vertical issue briefs
- Dependency map
- Parallelism map
- Human gates
- Recommended next step

## Safety

- Do not upload source code.
- Do not read or print secrets.
- Do not include credentials, environment values, production data, or private endpoints.
- Do not create GitHub issues, labels, projects, or milestones.
- Do not write files unless the user explicitly asks for local file writes after reviewing the synthesis.
- Do not propose `bypassPermissions`, tool pre-approval, dependency auto-installation, hosted execution, or remote MCP behavior.
```

## Contracts

- The skill is generated when `workflow.sdd: true` for enabled Codex and Claude
  clients.
- No new profile schema field is introduced in this phase.
- The skill is absent when `workflow.sdd` is false or omitted.
- The skill is project-local only.
- The skill does not include scripts, references, assets, plugins, dynamic
  shell context, `allowed-tools`, `agents/openai.yaml`, or subagent runtime
  calls.
- The skill does not broaden permissions.
- The skill does not create GitHub issues or repository process artifacts.
- Generated output uses UTF-8, LF line endings, no trailing whitespace, and
  exactly one trailing newline.
- The skill remains below the doctor 300-line warning threshold.
- Generated output is deterministic across repeated compiles.

## Security Rules

- Do not include literal secrets, secret-like values, tokens, bearer headers,
  environment values, production endpoints, or private credentials.
- Do not instruct source upload, hosted execution, telemetry, dependency
  installation, production access, tool pre-approval, unsafe auto-approval, or
  remote MCP behavior.
- Do not generate `bypassPermissions` as an allowed or recommended mode.
- Do not emit Tabnine workflow skills in this spec.
- Do not instruct compile or doctor to inspect secrets, execute scripts, call
  network APIs, or invoke AI models.

## Acceptance Criteria

- Codex golden output matches the exact Markdown in this spec.
- Claude golden output matches the exact Markdown in this spec.
- Lockfile descriptors use
  `targets/codex-workflow-skills/request-to-spec-issues@1` and
  `targets/claude-workflow-skills/request-to-spec-issues@1`.
- The skill is generated for enabled Codex and Claude clients when
  `workflow.sdd: true`.
- The skill is absent when `workflow.sdd` is false or omitted.
- The skill is absent for a disabled Codex or Claude client.
- Existing post-Phase-17 workflow skill file bytes, including `grill-change`,
  remain byte-identical. Lockfiles change only to add
  `request-to-spec-issues` descriptors and file entries.
- Every affected fixture with expected generated workflow skills gains the new
  Codex and/or Claude `request-to-spec-issues` expected files and matching
  lockfile entries.
- Generated descriptions satisfy `LINT-SKILL-002`.
- Generated output includes missing-grill redirection, no-reinterview guidance,
  full `SPEC_TEMPLATE` section coverage, intent-first spec extensions,
  vertical issue brief format, dependency states, architecture rescue candidate
  fields, and safety wording.
- Generated output contains no permissive instructions for scripts,
  references, assets, dynamic shell context, `allowed-tools`,
  `agents/openai.yaml`, source upload, secret access, production access,
  dependency auto-install, hosted execution, remote MCP behavior, GitHub issue
  creation, or permission bypass. Prohibitive safety wording for these topics
  is allowed.

## Tests

- golden test for `.agents/skills/request-to-spec-issues/SKILL.md`
- golden test for `.claude/skills/request-to-spec-issues/SKILL.md`
- fixture regeneration tests for every expected fixture with
  `workflow.sdd: true` and enabled Codex and/or Claude workflow skills
- lockfile descriptor test for both `request-to-spec-issues@1` template ids
- lockfile file-entry tests for every affected expected fixture
- doctor no-drift test proving affected regenerated fixtures do not report
  `LINT-LOCK-*` findings
- absence test when `workflow.sdd` is false or omitted
- disabled-client tests for Codex and Claude
- Tabnine absence test proving no `.tabnine` `request-to-spec-issues`
  guideline, skill, or MCP artifact is emitted by this spec
- regression test proving existing post-Phase-17 workflow skill file bytes,
  including `grill-change`, remain byte-identical
- no test in this spec requires `002-tabnine-planning-guideline.md` outputs;
  the combined Phase 18 regeneration proof belongs to `002` or to a same-change
  coordinated rollout
- content tests for missing-grill redirection, no-reinterview guidance, full
  `SPEC_TEMPLATE` section coverage, intent-first spec extensions, vertical
  issue brief format, dependency states, architecture rescue candidate fields,
  and safety wording
- trigger-evaluation fixtures proving the description should trigger after a
  completed grill agreement and should not replace `grill-change` while
  clarification is still in progress
- trigger-evaluation fixture proving a request for spec and issues without a
  completed grill redirects to `grill-change`
- doctor skill-hygiene test proving the description passes trigger-language
  checks
- negative content tests that distinguish prohibitive safety wording from
  permissive instructions for scripts, references, assets, dynamic shell
  context, `allowed-tools`, `agents/openai.yaml`, source upload, secret-like
  values, environment values, production access, dependency installation,
  hosted execution, remote MCP behavior, unsafe auto-approval, GitHub issue
  creation, and `bypassPermissions`
- determinism test proving repeated compile produces byte-identical output

## First RED Test

The first focused RED test should update the minimal-valid fixture expectation
for `.agents/skills/request-to-spec-issues/SKILL.md` and run the narrowest
golden test. It must fail because the compiler does not yet emit the
`request-to-spec-issues` file or its lockfile descriptor.

## Documentation Updates

- amend `docs/specs/phase-03/004-codex-workflow-skills-target.md`
- amend `docs/specs/phase-03/005-claude-workflow-skills-target.md`
- update `docs/specs/phase-03/README.md` if it indexes the workflow skill set
- update `docs/specs/phase-later/020-post-grill-planning-workflow.md` if the
  implementation changes the agreed planning direction
- update `docs/specs/phase-17/001-grill-change-skill.md` if the implemented
  Phase 18 skill changes the forward-reference wording from Phase 17
- update `docs/development/sdd-workflow.md` after implementation
- update `docs/development/ai-agent-usage.md` after implementation
- update `docs/research/004-best-practices-per-artifact.md` after
  implementation
- update `fixtures/README.md` once golden fixtures land
- update all affected expected fixture lockfiles

## Final Review Checklist

- exact generated Markdown matches this spec
- exact generated Markdown was explicitly approved before implementation
- `workflow.sdd` is the only generation gate
- the additive behavior change for existing SDD users is intentional
- no new schema field is introduced
- output paths and template ids match the contract
- all affected fixture and lockfile updates are accounted for
- existing post-Phase-17 workflow skill file bytes remain unchanged except for
  new `request-to-spec-issues` files
- shared fixture and lockfile writes are sequenced with
  `002-tabnine-planning-guideline.md`
- no GitHub issue creation or backend behavior is introduced
- no source upload, secret access, production access, dependency install,
  hosted execution, remote MCP, tool pre-approval, unsafe auto-approval, or
  `bypassPermissions` behavior is introduced
