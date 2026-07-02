# Spec: Advanced Review Pack - Specialist Reviews (WS1)

## Status

Approved. Depends on `002-skills-pack-schema.md` and coordinates with
`003-review-pack.md`.

## Problem

The umbrella `review-change` only triages security/readability/tests. Deep,
explicit specialist reviews are needed for cases where the diff touches
sensitive areas or the user asks for a focused pass.

## Goal

Generate four specialist review skills from neutral reviewer definitions for
skill-capable clients (Claude, Codex), gated by the `advanced-review` pack.

## Non-Goals

- Generating reviewer subagent definition files. Those are owned by `008` in
  this same phase; this spec owns the skill render of the shared neutral
  reviewer definitions.
- Per-specialist Tabnine IDE guideline files (locked out).
- Changing the umbrella review skill (owned by `003`).

## Reviewer Definitions (neutral, define-once)

Each specialist is defined once as a neutral reviewer definition (name,
description, focus, output discipline) and rendered as a skill now:

- `security-review` - exploit paths, secret exposure, unsafe permissions,
  injection, authz/authn, supply-chain, data leakage.
- `readability-review` - naming, decomposition, control flow, duplication,
  comments, error-handling clarity, unnecessary abstraction.
- `test-review` - missing cases, regression coverage, flaky patterns, fixture
  quality, edge cases, behavior-vs-implementation testing.
- `architecture-review` - module boundaries, dependency direction, contracts,
  migration risk, fit to product architecture.

The neutral definitions are the single source rendered into two Phase 12
surfaces: the specialist skills here, and the Claude/Codex reviewer subagent
definition files in `008` (opt-in via the `reviewer-subagents` subagent pack).

## User Flow

1. User selects the `advanced-review` pack.
2. Compile generates the four specialist `SKILL.md` files for Claude
   (`.claude/skills`) and Codex (`.agents/skills`).
3. `review-change` (from `003`) gains pointers to the generated specialists.

## Inputs

- Resolved skill set from `002`.
- Neutral reviewer definitions (new module).

## Outputs

- `security-review`, `readability-review`, `test-review`, `architecture-review`
  SKILL.md files for Claude and Codex.
- No Tabnine IDE guideline files for specialists in this slice.

## Contracts

- Skills are instruction-only; no tools, shell, or network.
- Descriptions match the grill catalog wording.
- Rendered only on skill-capable targets covered by the current target specs.
- The compiler creates no dangling reference from any target to a specialist not
  generated for that target.

## Security Rules

- No secrets, no source upload, no execution.
- `security-review` guidance describes review focus only; it does not instruct
  running scanners or installing tools.

## Acceptance Criteria

- `advanced-review` on -> all four specialists emitted for Claude and Codex.
- `advanced-review` off -> none emitted, and `review-change` has no specialist
  pointers.
- No Tabnine specialist guideline files created.
- Deterministic, byte-stable output.

## Tests

- Golden fixture `advanced-review-enabled`: four specialist skills present for
  Claude and Codex; none for Tabnine.
- Cross-check with `003`: pointers in `review-change` match the emitted set.
- Determinism: byte-stable.

## TDD Strategy

RED: golden fixtures for each specialist under `advanced-review-enabled`. GREEN:
render neutral definitions to skills via the resolved set. Refactor: extract the
neutral definition module so `008` renders the same definitions into reviewer
subagent files.

## Issue Plan

- I3: specialist skill emission. `sequenced` after I1, R1; parallel-safe with
  I2, I4.

## Documentation Updates

- `docs/targets/` specialist skill mapping.
- Note the neutral-definition module as the shared source for the
  `reviewer-subagents` pack in `008`.

## Final Review Checklist

- Define-once neutral definitions; this spec renders the skill surface, `008`
  renders the reviewer subagent surface from the same source.
- Skill-capable targets only; no Tabnine specialist fan-out.
- No dangling references.
- Deterministic fixtures; skills grant no tools.
