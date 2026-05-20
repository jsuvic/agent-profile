# Spec: Tabnine Planning Guideline

## Status

Verified on 2026-05-20.

Implemented in `packages/compiler` and covered by golden, content,
banned-topics, post-001 byte-stability, and determinism tests in
`packages/compiler/src/compiler.test.ts`. Doctor no-drift across affected
fixtures is proven by `packages/doctor/src/doctor.test.ts`. Belongs to Phase 18. Provides the Tabnine guideline counterpart to the Phase 17 and Phase 18
Codex/Claude planning skills.

The exact generated guideline wording requires explicit human approval before
implementation because it affects how Tabnine approaches planning before
implementation.

Implementation is blocked by Phase 17 implementation and by
`001-request-to-spec-issues-skill.md`, unless both Phase 18 specs land in one
coordinated change.

## Problem

Phase 17 and Phase 18 add Codex and Claude planning skills, but Tabnine does
not use the same skill surface. Without a Tabnine guideline, Tabnine-enabled
projects would not receive the same default planning workflow:

```text
stakeholder request -> grill -> spec candidate -> vertical TDD-ready issues
```

The Tabnine target needs a segmented guideline that expresses the planning
workflow without pretending Tabnine has Codex/Claude project skills.

## Goal

Generate a deterministic Tabnine guideline file when Tabnine and SDD workflow
are enabled:

| Output path                                   | Template id                                         |
| --------------------------------------------- | --------------------------------------------------- |
| `.tabnine/guidelines/05-planning-workflow.md` | `targets/tabnine-guidelines/05-planning-workflow@1` |

The guideline sits before `10-sdd-workflow.md` because clarification and issue
planning happen before implementation against an approved spec.

## Non-Goals

- generating Tabnine skills or custom subagents
- changing Tabnine MCP configuration
- changing Tabnine IDE settings
- adding planning backend schema
- creating GitHub issues
- adding hosted execution, source upload, telemetry, or remote MCP behavior
- changing runtime permissions or unsafe auto-approval behavior

## Sequencing

This spec shares generated fixtures and lockfiles with
`001-request-to-spec-issues-skill.md`. Implement it after `001` or in the same
coordinated change. Do not run it in parallel with `001` as an independent
fixture rewrite.

The regression baseline is the post-Phase-17 and post-`001` generated state.
The `grill-change` and `request-to-spec-issues` files count as existing
generated outputs when this guideline is added.

## Gate Decision

This phase uses `workflow.sdd: true` and `clients.tabnine.enabled: true` as the
generation gate.

Options considered:

| Option                               | Decision              | Rationale                                                                          |
| ------------------------------------ | --------------------- | ---------------------------------------------------------------------------------- |
| `workflow.sdd: true`                 | accepted for Phase 18 | Planning is part of the SDD path and should be consistent across enabled clients.  |
| new `workflow.planning` block        | deferred              | More precise long term, but requires schema, UI, fixture, and documentation work.  |
| gate on Codex/Claude planning skills | rejected              | Tabnine users should not need another client enabled to receive matching guidance. |

This is an additive behavior change for existing projects that already enable
Tabnine and SDD: their next compile will gain a new project-local guideline
file and matching lockfile entries.

## User Flow

1. A user enables Tabnine and SDD:

   ```yaml
   clients:
     tabnine:
       enabled: true
   workflow:
     sdd: true
   ```

2. `agent-profile compile --dry-run` previews
   `.tabnine/guidelines/05-planning-workflow.md`.
3. `agent-profile compile --write` writes the guideline and lockfile entries.
4. Tabnine reads the project guideline as part of its normal guideline surface.

## Inputs

- validated `AiProfile`
- `clients.tabnine.enabled`
- `workflow.sdd`
- derived `effectivePermissions`
- existing Tabnine guidelines target from `phase-02/001`
- compiler determinism contract from `phase-01/003`
- golden test contract from `phase-01/005`
- approved planning direction from `phase-later/020`
- Phase 17 and Phase 18 Codex/Claude planning wording for conceptual parity

## Outputs

This phase amends the Tabnine guidelines target by adding a conditional output:

| Output path                                   | Template id                                         | Gate                                                     |
| --------------------------------------------- | --------------------------------------------------- | -------------------------------------------------------- |
| `.tabnine/guidelines/05-planning-workflow.md` | `targets/tabnine-guidelines/05-planning-workflow@1` | `clients.tabnine.enabled: true` and `workflow.sdd: true` |

Every fixture with expected Tabnine guidelines and `workflow.sdd: true` must
gain the corresponding `05-planning-workflow.md` expected file and lockfile
entries. At the time of this spec, affected expected fixture trees include:

- `fixtures/code-review-enabled`
- `fixtures/documentation-enabled`
- `fixtures/minimal-valid`
- `fixtures/react-typescript`
- `fixtures/refactoring-enabled`
- `fixtures/subagents-enabled`

## Exact Generated Output

The exact generated Markdown, with LF line endings and exactly one trailing
newline, is:

```markdown
<!-- Generated by Agent Profile Compiler. Do not edit by hand. -->

# Planning Workflow

Use this before implementation when a stakeholder request is rough, ambiguous, or not yet tied to an approved spec.

- Clarify the request one decision at a time before writing or changing specs.
- Provide a recommended answer and short rationale for each open decision.
- Check local specs, ADRs, docs, fixtures, and generated artifacts before asking questions.
- Preserve product intent, non-goals, tradeoffs, durable terms, and hard-to-reverse decisions.
- If no completed clarification exists, complete the grill-style clarification first.
- After clarification, prepare an intent-first spec candidate and vertical TDD-ready issue briefs.
- Include dependencies, expected RED proof, expected GREEN proof, file ownership, contract impact, security impact, and review expectations in each issue brief.
- Do not create GitHub issues, write files, upload source, read secrets, install dependencies, or change runtime permissions unless explicitly requested and allowed.
```

## Contracts

- The guideline is generated when `clients.tabnine.enabled: true` and
  `workflow.sdd: true`.
- No new profile schema field is introduced in this phase.
- The guideline is absent when Tabnine is disabled.
- The guideline is absent when `workflow.sdd` is false or omitted.
- The target emits a guideline file only; it does not emit Tabnine skills,
  custom subagents, MCP server entries, IDE settings, labels, projects, or
  GitHub issues.
- Existing post-Phase-17 and post-`001` generated file bytes remain
  byte-identical. Lockfiles change only to add `05-planning-workflow`
  descriptors and file entries.
- Generated output uses UTF-8, LF line endings, no trailing whitespace, and
  exactly one trailing newline.
- Generated output is deterministic across repeated compiles.

## Security Rules

- Do not include literal secrets, secret-like values, tokens, bearer headers,
  environment values, production endpoints, or private credentials.
- Do not instruct source upload, hosted execution, telemetry, dependency
  installation, production access, unsafe auto-approval, GitHub issue creation,
  or remote MCP behavior.
- Do not generate `bypassPermissions` or any Tabnine auto-approval setting as
  an allowed or recommended mode.
- Do not instruct compile or doctor to inspect secrets, execute scripts, call
  network APIs, or invoke AI models.

## Acceptance Criteria

- Tabnine golden output matches the exact Markdown in this spec.
- Lockfile descriptors use
  `targets/tabnine-guidelines/05-planning-workflow@1`.
- The guideline is generated for enabled Tabnine clients when
  `workflow.sdd: true`.
- The guideline is absent when Tabnine is disabled.
- The guideline is absent when `workflow.sdd` is false or omitted.
- Existing post-Phase-17 and post-`001` generated file bytes remain
  byte-identical. Lockfiles change only to add `05-planning-workflow`
  descriptors and file entries.
- Every affected fixture with expected Tabnine guidelines gains the new
  `05-planning-workflow.md` expected file and matching lockfile entries.
- Generated output includes one-decision-at-a-time clarification, recommended
  answer guidance, local-context-first guidance, intent preservation, vertical
  issue expectations, RED/GREEN proof expectations, and safety wording.
- Generated output contains no permissive instructions for source upload,
  secret access, production access, dependency auto-install, hosted execution,
  remote MCP behavior, GitHub issue creation, runtime permission changes, or
  unsafe auto-approval. Prohibitive safety wording for these topics is allowed.

## Tests

- golden test for `.tabnine/guidelines/05-planning-workflow.md`
- fixture regeneration tests for every expected fixture with
  `clients.tabnine.enabled: true` and `workflow.sdd: true`
- lockfile descriptor test for `05-planning-workflow@1`
- lockfile file-entry tests for every affected expected fixture
- doctor no-drift test proving affected regenerated fixtures do not report
  `LINT-LOCK-*` findings
- absence test when Tabnine is disabled
- absence test when `workflow.sdd` is false or omitted
- regression test proving existing post-Phase-17 and post-`001` generated file
  bytes remain byte-identical
- combined Phase 18 regeneration test proving a Codex + Claude + Tabnine + SDD
  fixture has clean lockfile state after both `001-request-to-spec-issues` and
  `002` outputs are present
- content tests for one-decision-at-a-time clarification, recommended answer
  guidance, local-context-first guidance, intent preservation, vertical issue
  expectations, RED/GREEN proof expectations, and safety wording
- negative content tests that distinguish prohibitive safety wording from
  permissive instructions for source upload, secret-like values, environment
  values, production access, dependency installation, hosted execution, remote
  MCP behavior, GitHub issue creation, runtime permission changes, unsafe
  auto-approval, and `bypassPermissions`
- determinism test proving repeated compile produces byte-identical output

## First RED Test

The first focused RED test should update the minimal-valid fixture expectation
for `.tabnine/guidelines/05-planning-workflow.md` and run the narrowest golden
test. It must fail because the compiler does not yet emit the guideline file or
its lockfile descriptor.

## Documentation Updates

- amend `docs/specs/phase-02/001-tabnine-guidelines-target.md`
- update `docs/specs/phase-02/README.md` if it indexes Tabnine guideline
  outputs
- update `docs/specs/phase-later/020-post-grill-planning-workflow.md` if the
  implementation changes the agreed planning direction
- update `docs/development/sdd-workflow.md` after implementation
- update `docs/research/004-best-practices-per-artifact.md` after
  implementation
- update `fixtures/README.md` once golden fixtures land
- update all affected expected fixture lockfiles

## Final Review Checklist

- exact generated Markdown matches this spec
- exact generated Markdown was explicitly approved before implementation
- `workflow.sdd` and enabled Tabnine are the only generation gates
- the additive behavior change for existing Tabnine SDD users is intentional
- no new schema field is introduced
- output path and template id match the contract
- all affected fixture and lockfile updates are accounted for
- existing post-Phase-17 and post-`001` generated file bytes remain unchanged
  except for the new `05-planning-workflow.md` file
- shared fixture and lockfile writes are sequenced with
  `001-request-to-spec-issues-skill.md`
- no Tabnine skill, custom subagent, MCP, IDE setting, GitHub issue, source
  upload, secret access, production access, dependency install, hosted
  execution, remote MCP, unsafe auto-approval, or `bypassPermissions` behavior
  is introduced
