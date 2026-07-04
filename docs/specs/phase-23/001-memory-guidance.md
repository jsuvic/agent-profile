# Spec: Memory Guidance - document-only slice (WS7)

## Status

Approved on 2026-07-04. Synthesized from the WS7 candidate in
`docs/plans/003-ws3-ws7-spec-synthesis.md`.

v1 documents memory; it does not control memory. The later slices recorded in
the candidate (WS7b behavior settings, WS7c project-memory scaffolding, which
aligns with `phase-later/016-auto-memory-taxonomy.md`) each require their own
approved spec.

## Problem

Memory is stateful and easy to get wrong: secrets or volatile context can leak
into generated, committed memory files, and memory settings alter runtime
behavior with target-specific precedence. Generating memory content or
settings before the guidance exists inverts the risk order.

## Goal

Generate a memory guidance topic - documentation of how memory works per
client and what must never be stored in it - gated by a new additive
`workflow.memoryGuidance` boolean, following the existing guidance-topic
pattern (`workflow.codeReview` et al.). No memory content files and no memory
behavior settings are generated.

## Non-Goals (v1)

- Generating `MEMORY.md`, remembered facts, project/user/global memory files,
  or custom memory directories (`phase-later/016` territory, WS7c).
- Generating memory behavior settings - not even `disable` (WS7b).
- Modifying client settings files for memory in any way.
- Verifying or linting existing memory files a user may already have.

## User Flow

1. User sets `workflow.memoryGuidance: true` (or checks the corresponding
   wizard option).
2. Compile emits the memory guidance topic: an AGENTS.md section (inherited
   by CLAUDE.md via the normal import) and a Tabnine guideline, following the
   same emission pattern as the other guidance topics.
3. Doctor treats the artifacts like any other generated documentation
   (lockfile-tracked, drift-checked); no memory-specific runtime checks.

## Schema

- `workflow.memoryGuidance` : optional boolean, additive, default absent/off.
  `additionalProperties: false` preserved.
- No `capabilities.memory` block in this slice; reserving the name for WS7b
  (`capabilities.memory.policy`) is recorded here but not added to the schema.

## Content Contract (binding)

The generated guidance topic contains:

1. Per-client memory documentation: where each enabled client persists
   instructions/memory (e.g. CLAUDE.md and Claude memory surfaces, AGENTS.md
   for Codex, Tabnine guidelines), and that precedence is target-specific.
   Every per-client statement must be verifiable against the capability
   matrix at implementation time; unverified surfaces are described as
   unverified rather than asserted.
2. The verbatim secret rule, exactly this text:

   > Never store secrets, tokens, credentials, private keys, production
   > access, personal/customer data, or one-time debugging context in memory.

3. Volatility guidance: memory is for durable decisions and conventions, not
   session-specific state; wrong memories should be deleted, not corrected
   around.

The verbatim rule text is fixed by this approval; changing it is a spec
change.

## Contracts (binding)

- Document-only: compile output differs from baseline only by the guidance
  section/guideline artifacts; no memory content file, no memory directory,
  no settings key is created or modified.
- The verbatim secret rule appears in every emitted rendering of the topic
  (AGENTS.md section and Tabnine guideline).
- `workflow.memoryGuidance` absent or `false` -> byte-identical baseline
  output.
- Deterministic, lockfile-tracked, byte-stable.

## Security Rules

- No secrets read or printed.
- No client settings mutation; no memory file generation.
- Guidance content contains no example secrets, real tokens, or real
  credentials (illustrations use placeholders that fail secret-pattern
  scanners' shape checks, e.g. `<token>`).

## Acceptance Criteria

- `workflow.memoryGuidance: true` emits the guidance topic for enabled
  clients with the verbatim secret rule present in each rendering.
- No memory content files or behavior settings are generated (output-set
  sentinel: the compile artifact list gains only the guidance artifacts).
- Flag off/absent -> baseline byte-identical.
- Emitted content is deterministic and byte-stable.

## Tests

- Golden fixtures: flag on for Claude+Codex+Tabnine (AGENTS.md section +
  Tabnine guideline), byte-stable; flag off -> baseline byte-identical.
- Verbatim-rule test: exact rule string asserted present in every emitted
  rendering (a normalized-whitespace comparison guards against silent
  rewording).
- Output-set sentinel: artifact list with flag on equals baseline plus the
  guidance artifacts only; no `MEMORY.md`, `memory/`, or settings-file change.
- Schema: unknown value types rejected; `additionalProperties` preserved.

## TDD Strategy

RED: golden fixture expecting the AGENTS.md section and the verbatim-rule
assertion fail before the flag and content exist. GREEN: add the schema flag,
the guidance content module, and the emission wiring (WS7-I1).

## Issue Plan

- WS7-I1: `workflow.memoryGuidance` flag + guidance topic content + emission +
  tests. `ready`, `parallel-safe` (single issue; the slice is intentionally
  small).

## Later (recorded, not this slice)

- WS7b: `capabilities.memory.policy` with `inherit` (default) and `disable`
  first; `enable` opt-in later; `contentGeneration: never` long-term.
- WS7c: project-memory scaffolding, opt-in, no secrets, no global writes,
  doctor checks - to be reconciled with `phase-later/016-auto-memory-taxonomy.md`
  when specced.
- Global/user memory writes require their own approved spec.

## Cross-Phase Amendments (owned here)

- `phase-01/001-profile-schema-v1.md`: additive `workflow.memoryGuidance`
  boolean (the `workflow` object is `additionalProperties: false`, so the
  JSON schema gains the key here).

## Documentation Updates

- README/CLI docs: the `workflow.memoryGuidance` flag.
- `phase-later/006-secrets-and-memory-integration.md` and
  `phase-later/016-auto-memory-taxonomy.md`: note that the document-only
  slice landed here and both drafts remain the executing/scaffolding
  follow-ons.

## Final Review Checklist

- Nothing stateful generated; documentation only.
- Verbatim secret rule present in every rendering, byte-exact.
- Per-client claims verified or explicitly marked unverified.
- Baseline unchanged without the flag; deterministic fixtures.
