# Phase 13 Spec Map

## Status

Approved and implemented. Phase 13 is the subagent workflow layer that lands
after Phase 11 subagent generation and after the already verified Phase 12
Flutter/Dart stack detection work.

## Purpose

Phase 11 defines the client-neutral subagent schema and per-client generated
subagent files. Phase 13 builds on that foundation by adding a curated
implementation-review workflow:

- bundled subagent template references
- an implementation worker template
- a spec-compliance reviewer template
- a code-quality reviewer template
- a project-local orchestration skill that tells the parent agent how to run
  the two-stage review flow with fresh context and explicit status reporting

The compiler still only generates files. It does not launch, invoke, monitor,
or evaluate subagents.

## Numbering Note

The repository already marks `docs/specs/phase-later/018-flutter-dart-stack-detection.md`
as the verified Phase 12 change. This phase uses the next available number to
avoid two unrelated "Phase 12" contracts.

## Review Order

1. `001-subagent-template-reference-schema.md`
2. `002-implementation-review-subagent-templates.md`
3. `003-subagent-driven-change-skill.md`

Read `001` first. Specs `002` and `003` depend on the template-reference shape
defined there.

## Dependencies

- Phase 11 subagent schema and target generation are approved and implemented.
- `phase-later/011-skill-bundled-resources.md` is not required for this first
  implementation because the orchestration skill is self-contained.
- Phase 10.5 is recommended first so the testing discipline used by the
  implementation worker has the same RED/GREEN vocabulary as the generated TDD
  skill.

## Out of Scope for Phase 13

- changing Phase 11 generated subagent file formats
- generating Tabnine workflow subagents
- launching, invoking, or testing subagents during compile or doctor
- creating worktrees
- committing, pushing, opening pull requests, or changing branches
- installing dependencies
- generating user, global, managed, admin, or plugin-scoped subagents
- generating MCP server declarations or non-empty subagent `mcpServers`
- adding scripts, dynamic shell context, or tool pre-approval to generated
  skills

## Implementation Gate

Phase 13 implementation is allowed only when:

- all Phase 11 specs are approved and implemented
- `001-subagent-template-reference-schema.md` is approved
- the three template specs are approved with exact prompt bodies
- the orchestration skill output is approved with exact bytes
- schema validation tests cover template-reference success and failure cases
- golden fixtures cover generated Codex and Claude subagent files and the
  orchestration skill
- doctor checks cover template-reference drift and unsafe template expansion

## Verification Gate

Phase 13 verification requires:

- generated template references are deterministic and lockfile-tracked
- `implementer`, `spec-reviewer`, and `code-quality-reviewer` outputs are
  generated only when explicitly referenced
- reviewers are read-only
- the implementation worker is workspace-write only when
  `effectivePermissions` permits workspace writes
- the orchestration skill requires fresh task context instead of relying on
  hidden chat history
- the orchestration skill runs spec review before code-quality review
- status values are exactly `DONE`, `DONE_WITH_CONCERNS`, `BLOCKED`, and
  `NEEDS_CONTEXT`
- generated files contain no secrets, production access, dependency
  auto-install, source upload, unsafe auto-approval, or runtime invocation
  instructions
