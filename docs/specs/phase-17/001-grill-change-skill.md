# Spec: Grill Change Skill

## Status

Draft. Belongs to Phase 17. Implements the first vertical slice from
`docs/specs/phase-later/020-post-grill-planning-workflow.md`.

The exact generated skill wording requires explicit human approval before
implementation because trigger wording affects runtime behavior.

## Problem

Agent Profile Compiler requires SDD, TDD, and final review, but it does not yet
generate a skill for clarifying stakeholder requests before a spec is written.
That creates a gap between "user has a rough request" and "agent writes an
approved engineering spec."

Without a dedicated clarification skill, agents can:

- ask broad multi-part questions
- skip recommended directions
- ask the user for facts already present in local specs, ADRs, docs, fixtures,
  or code
- turn vague terms into implementation work too early
- create specs or issues without a compact agreement record
- leave product intent weaker than engineering mechanics

## Goal

Generate a deterministic `grill-change` workflow skill for Codex and Claude
when SDD workflow is enabled.

The skill must adapt the operating pattern from Matt Pocock's public
`grill-me` and `grill-with-docs` skills to Agent Profile Compiler:

- one focused question at a time
- recommended answer with rationale
- local context before user questions
- terminology challenge
- contradiction detection
- durable terminology and hard-to-reverse decision capture
- explicit agreement record
- no implementation planning during the grill

## Non-Goals

- generating `request-to-spec-issues`
- creating or updating GitHub issues
- adding planning backend schema
- adding skill `references/`, scripts, assets, plugins, MCP declarations, or
  subagents
- changing `ai-profile.yaml` schema
- changing runtime permissions, approval policy, Codex sandbox mode, Claude
  permission mode, or `bypassPermissions`
- editing source files during compile or doctor
- generating Tabnine skills
- adding hosted execution, source upload, telemetry, or remote MCP behavior

## Gate Decision

This phase uses `workflow.sdd: true` as the generation gate instead of adding a
new schema field.

Options considered:

| Option                                                | Decision              | Rationale                                                                                                          |
| ----------------------------------------------------- | --------------------- | ------------------------------------------------------------------------------------------------------------------ |
| `workflow.sdd: true`                                  | accepted for Phase 17 | A grill is part of the SDD path from rough request to approved spec. This avoids schema churn for the first slice. |
| new `workflow.grillChange` flag                       | deferred              | More precise long term, but requires schema, fixtures, docs, and UI work before the skill can ship.                |
| `workflow.sdd: true` and `workflow.finalReview: true` | rejected              | Final review is not a prerequisite for pre-spec clarification.                                                     |

This is an additive behavior change for existing projects that already enable
SDD with Codex or Claude: their next compile will gain a new project-local
`grill-change` skill file and matching lockfile entries.

## User Flow

1. A user enables SDD with Codex and/or Claude:

   ```yaml
   workflow:
     sdd: true
   ```

2. `agent-profile compile --dry-run` previews the generated `grill-change`
   skill for enabled supported clients.
3. `agent-profile compile --write` writes project-local skill files and
   lockfile descriptors.
4. At runtime, the agent loads `grill-change` before writing or updating a spec
   for a stakeholder request.
5. The agent asks one question at a time and waits for the user's answer.
6. When the user confirms the grill is complete, the agent returns an agreement
   record that can be passed to the Phase 18 `request-to-spec-issues` workflow
   once implemented.

## Inputs

- validated `AiProfile`
- `workflow.sdd`
- `clients.codex.enabled`
- `clients.claude.enabled`
- derived `effectivePermissions`
- existing Codex workflow skill target from `phase-03/004`
- existing Claude workflow skill target from `phase-03/005`
- compiler determinism contract from `phase-01/003`
- golden test contract from `phase-01/005`
- doctor skill checks from `phase-04/006`
- approved planning direction from `phase-later/020`

## Outputs

This phase amends the existing workflow skill targets by adding
`grill-change`.

| Target                   | Output path                            | Template id                                     |
| ------------------------ | -------------------------------------- | ----------------------------------------------- |
| `codex-workflow-skills`  | `.agents/skills/grill-change/SKILL.md` | `targets/codex-workflow-skills/grill-change@1`  |
| `claude-workflow-skills` | `.claude/skills/grill-change/SKILL.md` | `targets/claude-workflow-skills/grill-change@1` |

The generated Markdown for both targets is identical except for output path and
lockfile descriptor.

`grill-change` intentionally ships before the follow-up synthesis consumer.
The generated body therefore refers to a generic "follow-up synthesis workflow"
instead of requiring a generated `request-to-spec-issues` skill to already
exist.

Every fixture with expected generated Codex or Claude workflow skills and
`workflow.sdd: true` must gain the corresponding `grill-change` expected file
and lockfile entries. At the time of this spec, affected expected fixture trees
include:

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
name: grill-change
description: Use when a stakeholder request is rough, ambiguous, or underspecified and needs clarification before planning, writing a spec, or creating issues.
---

<!-- Generated by Agent Profile Compiler. Do not edit by hand. -->

# Grill Change

## Purpose

Clarify a stakeholder request before any spec, issue plan, or implementation work starts. The output is an agreement record for a follow-up synthesis workflow; it is not an implementation plan.

## Operating Rules

1. Ask one focused question, then wait for the user's answer.
2. Include a recommended answer with the question and explain why that answer is safest for the project.
3. Inspect relevant local specs, ADRs, docs, fixtures, and code before asking questions that local context can answer.
4. Challenge vague terms, overloaded words, and claims that conflict with repository evidence.
5. Prefer concrete examples, edge cases, and tradeoff choices over broad brainstorming.
6. Keep implementation details provisional until the product intent and non-goals are settled.
7. Capture durable terms and hard-to-reverse decisions in the agreement record when they crystallize.
8. Do not create issue lists, edit files, or start implementation during the grill.

## Question Format

Use this shape for each question:

Question: `<one decision or missing fact>`
Recommended answer: `<the default direction you would choose>`
Why: `<short reason based on product intent, safety, contracts, or repo evidence>`

## Decision Checks

Before ending the grill, confirm:

- the problem in the stakeholder's terms
- the desired outcome
- explicit non-goals
- product intent and why the change matters
- tradeoff direction for ambiguous implementation choices
- user-visible behavior changes
- compatibility and migration expectations
- durable terminology and hard-to-reverse decisions
- safety and privacy constraints
- unresolved unknowns, if any

## Output

When the user agrees the grill is complete, return:

- Problem
- Intent
- Non-goals
- Decisions made
- Durable terms and hard-to-reverse decisions
- Decision rules for implementation tradeoffs
- Open questions or risks
- Confirmation that post-grill synthesis can run next

## Safety

- Do not upload source code.
- Do not read or print secrets.
- Do not ask for credentials, environment values, production data, or private endpoints.
- Do not propose `bypassPermissions`, tool pre-approval, dependency auto-installation, hosted execution, or remote MCP behavior.
- Do not write files, create issues, commit changes, or run implementation commands during the grill.
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
- The skill does not create specs, issues, plans, branches, commits, or pull
  requests.
- The exact generated skill text is original project wording that adapts the
  upstream operating pattern without vendoring upstream text. If a future
  change vendors upstream text, it must preserve the required license notice.
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
- Do not emit Tabnine workflow skills in this phase.
- Do not instruct compile or doctor to inspect secrets, execute scripts, call
  network APIs, or invoke AI models.

## Acceptance Criteria

- Codex golden output matches the exact Markdown in this spec.
- Claude golden output matches the exact Markdown in this spec.
- Lockfile descriptors use `targets/codex-workflow-skills/grill-change@1` and
  `targets/claude-workflow-skills/grill-change@1`.
- The skill is generated for enabled Codex and Claude clients when
  `workflow.sdd: true`.
- The skill is absent when `workflow.sdd` is false or omitted.
- The skill is absent for a disabled Codex or Claude client.
- Existing `sdd-change`, `tdd-change`, `final-review`, and
  `subagent-driven-change` skill file bytes remain byte-identical. Lockfiles
  change only to add `grill-change` descriptors and file entries.
- Every affected fixture with expected generated workflow skills gains the new
  Codex and/or Claude `grill-change` expected files and matching lockfile
  entries.
- Generated descriptions satisfy `LINT-SKILL-002`.
- Generated output includes one-question-at-a-time guidance, recommended
  answer guidance, local-context-first guidance, terminology challenge,
  contradiction detection, durable-term capture, hard-to-reverse decision
  capture, and agreement-record output.
- Generated output contains no permissive instructions for scripts,
  references, assets, dynamic shell context, `allowed-tools`,
  `agents/openai.yaml`, source upload, secret access, production access,
  dependency auto-install, hosted execution, remote MCP behavior, or
  permission bypass. Prohibitive safety wording for these topics is allowed.

## Tests

- golden test for `.agents/skills/grill-change/SKILL.md`
- golden test for `.claude/skills/grill-change/SKILL.md`
- fixture regeneration tests for every expected fixture with
  `workflow.sdd: true` and enabled Codex and/or Claude workflow skills
- lockfile descriptor test for both `grill-change@1` template ids
- lockfile file-entry tests for every affected expected fixture
- doctor no-drift test proving affected regenerated fixtures do not report
  `LINT-LOCK-*` findings
- absence test when `workflow.sdd` is false or omitted
- disabled-client tests for Codex and Claude
- Tabnine absence test proving no `.tabnine` `grill-change` guideline, skill,
  or MCP artifact is emitted
- regression test proving existing `sdd-change`, `tdd-change`, `final-review`,
  and `subagent-driven-change` skill file bytes remain byte-identical
- content tests for one-question-at-a-time guidance, recommended answer
  guidance, local-context-first guidance, terminology challenge, contradiction
  detection, durable-term capture, hard-to-reverse decision capture, and
  agreement-record output
- trigger-evaluation fixtures proving the description should trigger for rough,
  ambiguous, or underspecified stakeholder requests before planning, and should
  not replace `sdd-change` when an approved spec is already ready for
  implementation
- doctor skill-hygiene test proving the description passes trigger-language
  checks
- negative content tests that distinguish prohibitive safety wording from
  permissive instructions for scripts, references, assets, dynamic shell
  context, `allowed-tools`, `agents/openai.yaml`, source upload, secret-like
  values, environment values, production access, dependency installation,
  hosted execution, remote MCP behavior, unsafe auto-approval, and
  `bypassPermissions`
- determinism test proving repeated compile produces byte-identical output

## First RED Test

The first focused RED test should update the minimal-valid fixture expectation
for `.agents/skills/grill-change/SKILL.md` and run the narrowest golden test.
It must fail because the compiler does not yet emit the `grill-change` file or
its lockfile descriptor.

## Documentation Updates

- amend `docs/specs/phase-03/004-codex-workflow-skills-target.md` to include
  `grill-change`
- amend `docs/specs/phase-03/005-claude-workflow-skills-target.md` to include
  `grill-change`
- update `docs/specs/phase-03/README.md` if it indexes the workflow skill set
- update `docs/specs/phase-later/020-post-grill-planning-workflow.md` if the
  implementation changes the agreed planning direction
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
- existing workflow skill file bytes remain unchanged except for new
  `grill-change` files
- generated output adapts the approved grill behavior without vendoring
  upstream text verbatim
- no source upload, secret access, production access, dependency install,
  hosted execution, remote MCP, tool pre-approval, unsafe auto-approval, or
  `bypassPermissions` behavior is introduced
