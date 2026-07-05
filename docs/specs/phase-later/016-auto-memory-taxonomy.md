# Spec: Auto-Memory File Taxonomy

## Status

Draft for a later phase. Not MVP.

Routed from `docs/research/007-agent-best-practices-review.md` (dimension 4,
"Memory taxonomy"). Cross-references `phase-later/006-secrets-and-memory-integration.md`,
which covers *references to* external memory backends; this spec covers
*locally generated memory files* with a typed schema.

The document-only memory-guidance slice landed in
`docs/specs/phase-23/001-memory-guidance.md` (`workflow.memoryGuidance`,
WS7-I1). This spec remains the memory-content scaffolding follow-on (WS7c) and
still requires its own approval before any memory file is generated.

## Problem

Several Anthropic surfaces (Cowork mode, Claude Code memory) and several
ecosystem agents (Cursor, Cline) support persistent memory files that survive
across sessions. A coherent taxonomy splits memory into typed files —
`user` (role/preferences), `feedback` (corrections and validated successes),
`project` (initiatives, decisions, deadlines), `reference` (pointers to
external systems) — indexed by a top-level `MEMORY.md`. Without a generated
scaffold, every adopter improvises their own layout and the agents diverge.

This spec defines the file layout and frontmatter schema, the doctor checks,
and the cross-references to `006` so the two memory specs do not collide.

## Goal

Add an optional `memory.taxonomy` block to `ai-profile.yaml` that scaffolds a
typed memory directory (`memory/`) with a `MEMORY.md` index. Generated files
are stubs — Markdown templates with the right frontmatter — that the agent
fills in over time. Doctor lints frontmatter, index integrity, and the
protected-attribute exclusion list.

## Non-Goals

- writing real user data to memory files during compile or doctor (the
  compiler only scaffolds stubs)
- fetching, decrypting, or transmitting any external memory backend (those
  references belong to `006`)
- generating user-level or admin-level memory writes
- generating cloud-hosted memory; the scaffold is repo-local only
- replacing `006`; the two specs coexist

## User Flow

```yaml
# ai-profile.yaml (illustrative)
memory:
  taxonomy:
    enabled: true
    location: memory/      # project-local directory; default `memory/`
    types:
      - user
      - feedback
      - project
      - reference
```

The compiler renders:

- `memory/MEMORY.md` index (empty initial entry list under each type)
- one stub per declared type: `memory/user.md`, `memory/feedback.md`,
  `memory/project.md`, `memory/reference.md`
- frontmatter on each stub: `name`, `description`, `type`

Doctor reports:

- `LINT-MEMORY-001` — `MEMORY.md` references a file that does not exist
- `LINT-MEMORY-002` — a memory file is missing the `type` frontmatter
- `LINT-MEMORY-003` — a memory file contains a literal protected-attribute
  pattern (race, religion, national origin, immigration status, disability,
  medical conditions, government IDs, financial account numbers, home
  addresses, account passwords or secret tokens) — same exclusion list every
  Anthropic surface uses
- `LINT-MEMORY-004` — declared `types` list contains an unknown type
- `LINT-MEMORY-005` — `memory/` directory contains files of types not
  declared in the profile

## Inputs

- `memory.taxonomy` block in `ai-profile.yaml`
- existing safety primitive `effectivePermissions`
- doctor secret-pattern catalogue (extended in this spec for
  protected-attribute scanning)
- cross-reference to `006-secrets-and-memory-integration.md` for memory
  *references* (vector stores, CCE, etc.)

## Outputs

- `memory/MEMORY.md` index
- one Markdown stub per declared type with correct frontmatter
- doctor findings as listed above
- lockfile entries recording each generated memory file path and content hash

## Contracts

- The scaffold is opt-in. Without `memory.taxonomy.enabled: true`, no memory
  files are generated and existing behavior is unchanged.
- Generated stubs contain frontmatter only plus a one-line placeholder
  comment. The compiler never writes user content into a memory file.
- `MEMORY.md` is an *index*, not memory itself; each entry is one line
  under ~150 characters.
- Memory files are project-local. Generation must never write outside the
  declared `location`.
- The compiler must not read memory files at compile time except to verify
  index integrity for doctor.
- This spec coexists with `006`: references and taxonomy live in distinct
  fields and the two must not shadow each other. The compiler must reject
  a profile that declares the same memory name in both `memory.taxonomy`
  and `memory` (the `006` reference block).
- Removing a type removes its file on next compile.

## Security Rules

- Do not write user data, real names, real addresses, or any protected
  attribute into generated stubs.
- Do not embed secrets, environment values, or production endpoints.
- Do not read existing memory files for any purpose other than the doctor
  integrity checks listed above.
- Do not upload memory contents anywhere.
- Doctor must reject memory files containing literal patterns matching
  protected attributes per `LINT-MEMORY-003`.
- The compiler must not propose specific entries to add to memory; that is
  a runtime concern owned by the agent surface, not the compiler.

## Acceptance Criteria

- profiles with `memory.taxonomy.enabled: true` generate the index and the
  declared type stubs
- profiles without the block produce no memory files
- doctor flags each `LINT-MEMORY-*` rule
- naming collisions with `006` are rejected at validate time
- removing a type propagates cleanly on next compile
- generated stubs contain frontmatter and a placeholder comment only

## Tests

- golden test for the four-type minimal scaffold
- absence test
- doctor lint tests for each `LINT-MEMORY-*` rule including the
  protected-attribute scan
- collision test with `006` memory references (same name in both blocks)
- removal-propagation snapshot test
- determinism test

## Documentation Updates

- `docs/profile/schema.md` — add `memory.taxonomy` block, cross-reference
  `006` `memory` block
- `docs/specs/phase-later/006-secrets-and-memory-integration.md` —
  cross-reference this spec so naming and ownership are clear
- `docs/research/004-best-practices-per-artifact.md` — add memory taxonomy
  guidance
- future `docs/security/memory-handling.md` — document the
  protected-attribute exclusion list

## Final Review Checklist

- two memory specs (`006` and this one) explicitly coexist with distinct
  fields and a doctor collision check
- protected-attribute exclusion list matches the standard Anthropic
  taxonomy
- compiler never writes real user data into stubs
- memory files are project-local and lockfile-tracked
- no cloud-hosted memory is generated
