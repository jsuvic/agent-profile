# Spec: Review Pack and codeReview Convergence (WS1)

## Status

Approved. Depends on `002-skills-pack-schema.md`.

## Problem

Code review is documentation-only: `workflow.codeReview` emits the
`CODE_REVIEW_TOPIC` guidance (AGENTS.md section + Tabnine guideline
`60-code-review`), not an invokable skill. The brainstorm requires an umbrella
`review-change` skill that triages correctness, security, readability, tests,
performance-when-relevant, architecture/contract impact, and generated-file
drift, mapped per client.

## Goal

Generate a `review-change` umbrella skill for skill-capable clients (Claude,
Codex) from the existing review guidance content, rebind `workflow.codeReview`
and the `review` pack to it, and keep Tabnine on its `60-code-review` guideline.
Include conditional pointers to specialist reviews only when those specialists
are generated.

## Non-Goals

- Specialist review skills themselves (owned by `004`).
- Per-specialist Tabnine guideline fan-out (locked out: umbrella-only).
- Subagent versions of review.

## User Flow

1. User selects the `review` pack (or sets `workflow.codeReview: true`).
2. Compile generates `.claude/skills/review-change/SKILL.md` and
   `.agents/skills/review-change/SKILL.md`, plus the Tabnine `review-change`
   guideline.
3. If `advanced-review` is also selected, `review-change` body lists pointers to
   the generated specialist skills.

## Inputs

- Resolved skill set from `002`.
- `CODE_REVIEW_TOPIC` content in
  `packages/compiler/src/guidance-content.ts`.

## Outputs

- `review-change` SKILL.md for Claude and Codex (`.agents/skills`).
- Tabnine `review-change` guideline (rebinding the existing `60-code-review`
  content to the `review` pack).

## Contracts

- The `review-change` skill body is derived from `CODE_REVIEW_TOPIC` (Review
  Focus, Severity Labels, Output Format, Review Discipline). One review concept,
  not two.
- On skill-capable clients, `review-change` supersedes the standalone
  `codeReview` guidance topic (no duplicate review instructions).
- `workflow.codeReview: true` continues to satisfy review via the `review` pack
  equivalence from `002`.
- Tabnine gets exactly one review guideline, never per-specialist fan-out.

## Conditional Specialist Pointers

- When `advanced-review` is NOT generated: `review-change` performs inline
  triage of security/readability/tests but names no specialist skill.
- When `advanced-review` IS generated: `review-change` body includes explicit
  pointers ("for a deeper pass, run `security-review` / `readability-review` /
  `test-review` / `architecture-review`") only for specialists actually emitted
  for that target.
- No dangling reference in any pack combination or on any target.

## Security Rules

- Instruction-only skill; no tools, shell, or network.
- No secrets in generated content.

## Acceptance Criteria

- `review` pack (or `codeReview: true`) emits `review-change` for Claude and
  Codex and the Tabnine review guideline.
- `review-change` body content is traceable to `CODE_REVIEW_TOPIC`.
- Specialist pointers appear only when the specialist is generated for that
  target.
- No duplicated review guidance topic alongside the skill on skill-capable
  clients.

## Tests

- Golden fixture: `review` pack on -> `review-change/SKILL.md` present for
  Claude and Codex; Tabnine review guideline present.
- Golden fixture: `advanced-review` off -> `review-change` has no specialist
  pointers; on -> pointers present and match generated specialists.
- Determinism: byte-stable output.

## TDD Strategy

RED: golden fixture expecting `review-change/SKILL.md` and the
no-pointer/with-pointer variants. GREEN: emit from resolved set + conditional
render. Refactor: share pointer rendering with `004`.

## Issue Plan

- I2: `review-change` emission + codeReview convergence. `sequenced` after I1,
  R1; parallel-safe with I3, I4.
- I5: conditional specialist pointers. `sequenced` after I2, I3.

## Documentation Updates

- `docs/targets/` review mapping.
- Note in `phase-10/002-code-review-guidance.md` that the topic now backs the
  `review-change` skill on skill-capable clients.

## Final Review Checklist

- One review concept mapped per client; no duplication.
- No dangling specialist references in any combination.
- Tabnine umbrella-only.
- Deterministic, byte-stable fixtures.
