# Phase 12 Spec Map

## Status

Approved. Synthesized from `docs/plans/002-ws0-ws2-spec-synthesis.md` and the
grill agreement record for `docs/plans/001-agent-capability-direction.md` on
2026-07-01. Approved for implementation; implementation is handed to Codex. The
cross-phase amendments below must land as part of the work.

## Purpose

Phase 12 is the first slice of the Agent Capability Direction (WS0 + WS1 + WS2):

- WS0 - a verified 2026-07 capability matrix and ADR 0005 amendment.
- WS1 - a real skill catalog gated by a neutral `capabilities.skills.packs`
  intent: umbrella `review-change`, specialist reviews, and `mcp-fit-check`;
  plus opt-in Claude/Codex reviewer subagent definition files gated by the
  `reviewer-subagents` subagent pack under `capabilities.delegation.subagents`.
- WS2 - an `init` that lets the user pick a setup profile and capability packs
  (including the optional reviewer subagents) with risk labels.

The phase preserves the product principles: local-first output, no source
upload, no secret upload, no network, no execution, deterministic generation,
lockfile-tracked artifacts, diff-before-write, and doctor validation.

## Locked Decisions

- Pack ids: `base`, `review`, `advanced-review`, `automation`,
  `mcp-recommendations`. `automation` is reserved here (loop skills land in a
  later slice); no loop skills are generated in Phase 12. The loop skill
  content was added later by `phase-22/001-automation-loop-skills.md`.
- `review-change` supersedes the `codeReview` guidance topic on skill-capable
  clients (Claude, Codex). Tabnine keeps guideline `60-code-review`, rebound to
  the `review` pack.
- Tabnine mapping is umbrella-only: `review` pack -> Tabnine `review-change`
  guideline; `advanced-review` -> specialist skills only on skill-capable
  targets, no per-specialist Tabnine IDE guideline fan-out.
- Setup profile changes only `safety.mode`/permissions; pack pre-checks are
  identical across profiles (`base` + `review` on, rest off).
- Reviewer content is defined once as neutral reviewer definitions and rendered
  into two surfaces in Phase 12: `advanced-review` skills (`004`) and, when the
  `reviewer-subagents` subagent pack is selected, Claude/Codex reviewer subagent
  definition files (`008`). Same source, two render surfaces.
- Reviewer subagents are a subagent capability, not a skill pack. They are opt-in
  via `capabilities.delegation.subagents` with `enabled: true` and
  `packs: [reviewer-subagents]`; the skill pack ids are unchanged. APC generates
  subagent definition files only - it does not launch agents, run loops, execute
  tests, supervise subagents, or apply patches.
- `mcp-recommendations` emits informational skill content only. It generates no
  MCP config, server commands, install commands, env var names, tokens, or
  arbitrary MCP ids. A separate `mcp-config` pack may exist later.
- Subagent `enabled` rule (locked, explicit-required): a non-empty
  `capabilities.delegation.subagents.packs` requires `enabled: true`. A
  non-empty `packs` with `enabled: false` is a validation/doctor error. `enabled`
  is the single master switch; disabling flips one flag and preserves `packs`.
  When `enabled: true`, at least one subagent source is required - a non-empty
  `agents` OR a non-empty `packs` - so a pack-only profile is valid (this relaxes
  the current schema's `agents`-required rule; owned by `008`).

## Review Order

1. `001-capability-matrix-refresh.md` (WS0)
2. `002-skills-pack-schema.md` (WS1 foundation: schema + skill resolution)
3. `003-review-pack.md` (umbrella review + codeReview convergence)
4. `004-advanced-review-pack.md` (specialist reviews)
5. `005-mcp-recommendations-pack.md` (`mcp-fit-check`)
6. `006-doctor-skill-checks.md`
7. `007-init-capability-selection.md` (WS2)
8. `008-reviewer-subagents-pack.md` (opt-in Claude/Codex reviewer subagents)

Read `002` before `003`-`006`; they depend on the pack schema and the
`resolveSelectedSkills` contract defined there. Read `004` before `008`; the
reviewer subagents reuse the neutral reviewer definitions defined for the
`advanced-review` skills, and render through the Phase 11 subagent targets.

## Cross-Phase Amendments Required Before Implementation

- `phase-01/001-profile-schema-v1.md` must lift `capabilities.skills.packs`
  from reserved/absent to live (owned by `002`).
- `phase-01/003-compiler-determinism.md` skill-target determinism must account
  for pack-driven skill selection (owned by `002`).
- `phase-03/004-agents-md-target.md` / `005` workflow-skill emission must read
  the resolved skill set instead of raw workflow flags (owned by `002`, `003`).
- `phase-04/006-doctor-skill-checks.md` must add the dangling-reference and
  pack/skill-mismatch checks (owned by `006`).
- `phase-05/001-cli-compile-dry-run-and-write.md` and the init wizard specs must
  accept setup-profile and pack selection, including reviewer subagents (owned by
  `007`).
- `phase-01/001-profile-schema-v1.md` must add the additive
  `capabilities.delegation.subagents.packs` field (owned by `008`).
- `phase-11/001-subagents-schema.md` and `phase-11/005-doctor-subagent-checks.md`
  gain cross-references for the `reviewer-subagents` pack expansion and doctor
  coverage (owned by `008`).
- `docs/architecture/decisions/0005-client-capability-model.md` gains a 2026-07
  verification amendment (owned by `001`).

## Out of Scope for Phase 12

- WS3 `init --assist`, WS4 MCP recommendation scan, WS5 hooks, WS6 loop skills,
  WS7 memory. Contracts for these are recorded in
  `docs/plans/001-agent-capability-direction.md`.
- Non-reviewer subagent packs, and any subagent execution/launch/supervision
  (Phase 12 reviewer subagents are definition files only).
- Any executing surface, network call, or MCP config generation.

## Follow-On

WS3-WS7 synthesis runs after Phase 12 specs are written and approved, so the
whole direction is documented before the riskier executing surfaces are built.
