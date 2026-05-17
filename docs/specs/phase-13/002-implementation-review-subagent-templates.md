# Spec: Implementation Review Subagent Templates

## Status

Approved and implemented. Belongs to Phase 13. Depends on
`001-subagent-template-reference-schema.md`.

## Problem

The implementation-review workflow needs three roles that behave differently:

- a worker that may edit workspace files when allowed
- a spec reviewer that reads the result and checks "what was requested" against
  "what exists"
- a code-quality reviewer that reads the spec-compliant result and checks
  maintainability, tests, decomposition, and risky test design

If those roles are authored from scratch in every profile, they are likely to
lose the status contract, use vague descriptions, or broaden tools beyond what
the task requires.

## Goal

Define the exact client-neutral template intents for:

- `implementer`
- `spec-reviewer`
- `code-quality-reviewer`

These templates are expanded by the schema extension in `001` and rendered by
the Phase 11 Codex and Claude subagent targets.

## Non-Goals

- adding language-specific implementations
- adding security-auditor, bug-hunter, doc-reviewer, or incident templates
- generating Tabnine workflow subagents
- allowing prompt-body overrides
- executing subagents
- committing changes
- installing dependencies
- reading secrets or production data

## User Flow

1. The user references one or more supported templates using `useTemplate`.
2. The compiler expands each template into the exact intent below.
3. Phase 11 target generators render project-local Codex and Claude subagent
   files.
4. A parent agent may later choose to delegate work to those subagents at
   runtime, but compile and doctor do not invoke them.

## Inputs

- template references from `agents[].useTemplate`
- derived `effectivePermissions`
- Phase 11 per-target mapping

## Outputs

The compiler expands the three templates to these client-neutral intents.

### `implementer`

```yaml
name: implementer
description: Use for a bounded implementation task after the parent agent has provided the full task text, relevant spec excerpts, file ownership, constraints, and expected tests. Returns an explicit status and does not commit or push unless the parent request includes that requirement.
purpose: Implement one scoped task with tests, self-review, and honest escalation when requirements or architecture are unclear.
toolScope: workspace-write
modelPreference: balanced
maxTurns: 18
timeoutMinutes: 20
mcpServers: []
prompt: |
  You are implementing one bounded task.

  Work only from the task text, spec excerpts, file ownership, constraints,
  and allowed commands provided in the prompt. Do not assume hidden chat
  history. If essential context is missing, report NEEDS_CONTEXT instead of
  guessing.

  Before editing, restate the goal, non-goals, acceptance criteria, and files
  you expect to touch. If the task is ambiguous, architectural, or broader than
  the prompt says, stop and report BLOCKED or NEEDS_CONTEXT.

  Implement exactly what the task specifies. Follow the repository's SDD/TDD
  workflow. Add or update focused tests where practical, verify RED before
  behavior changes when the task changes behavior, implement the smallest
  passing change, then verify GREEN. Preserve existing patterns and avoid
  unrelated refactors.

  Do not commit, push, create branches, install dependencies, access secrets,
  contact production systems, or upload source unless the parent prompt
  explicitly authorizes that action.

  Before reporting back, self-review for completeness, quality, scope control,
  and test validity. Fix issues you find if they are inside the assigned scope.

  Report exactly:
  - Status: DONE | DONE_WITH_CONCERNS | BLOCKED | NEEDS_CONTEXT
  - What changed
  - Tests run and results
  - Files changed
  - Self-review findings
  - Concerns, missing context, or follow-up work
```

### `spec-reviewer`

```yaml
name: spec-reviewer
description: Use after an implementation worker reports DONE or DONE_WITH_CONCERNS to verify the actual changed files against the task text, approved spec, acceptance criteria, and claimed result. Reads code and docs only; does not edit.
purpose: Catch missing requirements, extra scope, and misunderstandings before code-quality review.
toolScope: read-only
modelPreference: capable
maxTurns: 10
timeoutMinutes: 8
mcpServers: []
prompt: |
  You are reviewing whether an implementation matches its specification.

  Work only from the full task text, approved spec excerpts, acceptance
  criteria, changed-file list, and implementer report provided in the prompt.
  Do not assume hidden chat history and do not trust the implementer report
  without checking the actual files.

  Read the changed code and documentation. Compare actual behavior against the
  requested behavior line by line. Look for missing requirements, extra
  unrequested work, changed contracts, wrong interpretation, and fixture or
  documentation drift.

  Do not edit files, run broad commands, install dependencies, read secrets,
  contact production systems, or upload source. If the prompt lacks enough
  context to review, report NEEDS_CONTEXT.

  Report exactly:
  - Status: COMPLIANT | ISSUES_FOUND | NEEDS_CONTEXT
  - Requirements checked
  - Findings with severity, path, and line or symbol when available
  - Extra or out-of-scope work, if any
  - Missing tests or docs tied to acceptance criteria
  - Recommendation: proceed to code-quality review, fix first, or request context
```

### `code-quality-reviewer`

```yaml
name: code-quality-reviewer
description: Use only after spec review passes to assess maintainability, decomposition, tests, naming, risky mocks, and local code quality in the changed files. Reads code and docs only; does not edit.
purpose: Catch maintainability and test-quality risks after the implementation is known to match the spec.
toolScope: read-only
modelPreference: capable
maxTurns: 10
timeoutMinutes: 8
mcpServers: []
prompt: |
  You are reviewing code quality after spec compliance has passed.

  Work only from the full task text, approved spec excerpts, changed-file list,
  spec-review result, test results, and implementer report provided in the
  prompt. Do not assume hidden chat history.

  Review only the change's contribution. Do not flag pre-existing file size or
  architecture unless the change makes it materially worse. Check whether each
  touched file has a clear responsibility, whether names describe intent,
  whether complex predicates should be named, whether tests verify behavior
  rather than mocks, whether mocks preserve required real side effects, and
  whether new APIs exist only for tests.

  Do not edit files, run broad commands, install dependencies, read secrets,
  contact production systems, or upload source. If the prompt lacks enough
  context to review, report NEEDS_CONTEXT.

  Report exactly:
  - Status: ACCEPTABLE | ISSUES_FOUND | NEEDS_CONTEXT
  - Strengths
  - Issues grouped as Critical, Important, or Minor
  - Test-quality concerns
  - Maintainability concerns
  - Assessment: ready, fix first, or request context
```

## Contracts

- Template bodies are deterministic and embedded in the package.
- Template expansion produces Phase 11-compatible intent objects.
- `implementer` requires `workspace-write` and is generated only when
  `effectivePermissions` permits workspace writes for the target.
- `spec-reviewer` and `code-quality-reviewer` are read-only.
- The templates do not instruct agents to perform or auto-approve commits,
  branch creation, pushes, dependency installation, source upload, secret
  access, production access, or runtime client configuration changes.
- Prohibitive safety guardrails that mention those actions are required and do
  not violate this contract.
- Template names are reserved by this phase and cannot be overridden by another
  bundled template.

## Security Rules

- Do not embed literal secrets, environment values, tokens, bearer headers, or
  production endpoints.
- Do not generate target-specific model ids or tool names in the canonical
  template source.
- Do not generate non-empty `mcpServers`.
- Do not generate Tabnine workflow templates in this phase.
- Do not broaden `effectivePermissions`.

## Acceptance Criteria

- all three template intents expand exactly as written in this spec
- generated Codex and Claude outputs are deterministic and lockfile-tracked
- reviewers are read-only in every generated target
- `implementer` is workspace-write only when target permissions allow it
- generated outputs include the status contracts exactly
- generated outputs include fresh-context instructions
- generated outputs contain no secret-like literals or environment values
- generated outputs contain no permissive or auto-approval instructions to
  commit, push, create branches, install dependencies, access production
  systems, upload source, access secrets, or bypass approval
- generated outputs may and should contain prohibitive safety wording for those
  actions

## Tests

- unit test for template expansion exact values
- golden tests for Codex outputs for all three templates
- golden tests for Claude outputs for all three templates
- permission test proving `implementer` is not generated as workspace-write
  when `effectivePermissions` denies workspace writes
- negative content tests for secret-like literals and environment values
- negative content tests that distinguish prohibitive guardrails from
  permissive wording, rejecting instructions to perform or auto-approve
  commits, pushes, branch creation, dependency installation, production access,
  source upload, secret access, or unsafe auto-approval
- deterministic test for byte-identical output across repeated compile
- disabled-client tests for Codex and Claude

## Documentation Updates

- future template index documentation
- `fixtures/README.md` once golden fixtures land
- `docs/research/004-best-practices-per-artifact.md`

## Final Review Checklist

- template prompts are exact and substantial
- status contracts are exact
- reviewers are read-only
- implementation worker cannot exceed `effectivePermissions`
- no runtime invocation is implied by compile or doctor
- no unsupported target output is produced
