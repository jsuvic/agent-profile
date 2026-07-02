# Spec: Init Capability Selection - Setup Profile and Packs (WS2)

## Status

Approved. Depends on `002-skills-pack-schema.md` and
`008-reviewer-subagents-pack.md`.

## Problem

`agent-profile init` (`apps/cli/src/wizard.ts`) detects stack/clients/files and
chooses a preserve-vs-regions strategy, but offers no way to choose an autonomy
level or which capability packs to generate. The brainstorm requires init to be
a setup-profile + capability-pack selector with risk labels, preserving dry-run
default and diff-before-write.

## Goal

Extend the init wizard so the user picks (1) a setup profile that sets
`safety.mode`/permissions, (2) skill capability packs with risk labels that write
`capabilities.skills.packs`, and (3) the optional Claude/Codex reviewer subagents
that write `capabilities.delegation.subagents` (`enabled: true`,
`packs: [reviewer-subagents]`), then shows the resulting plan/diff before any
write.

## Non-Goals

- `init --assist` AI-CLI analysis (WS3, later).
- MCP config generation.
- Coupling pack defaults to the setup profile (explicitly forbidden).

## User Flow

1. `agent-profile init` detects stack/clients/files (unchanged).
2. Prompt: setup profile - `guarded corporate` / `balanced solo` /
   `plan-only review` / `autonomous sandbox` -> sets `safety.mode`.
3. Prompt: capability packs with risk labels:
   - `[recommended] Base instructions` (skills: base) - pre-checked
   - `[recommended] Code review` (skills: review) - pre-checked
   - `[optional] Specialist reviews` (skills: advanced-review)
   - `[optional] Claude/Codex reviewer subagents` (subagents:
     reviewer-subagents) - off by default; offered only when Claude or Codex is
     a selected client
   - `[optional] MCP recommendations` (skills: mcp-recommendations)
   - `[blocked] Plugins / global memory / auto-install` - not selectable
4. Plan/diff shows chosen safety mode, selected skill packs, whether reviewer
   subagents are enabled, and the resulting skill and subagent definition files.
5. Dry-run by default; explicit confirm writes; doctor runs after write.

The reviewer subagents selection is independent of the specialist-reviews skill
pack: a user may pick either, both, or neither.

## Inputs

- Wizard detection context (including which clients are selected).
- `capabilities.skills.packs` schema and `resolveSelectedSkills` from `002`.
- `capabilities.delegation.subagents.packs` schema from `008`.
- Existing `PERMISSION_PRESETS` in `packages/core/src/profile.ts`.

## Outputs

- `ai-profile.yaml` with `safety.mode`, `capabilities.skills.packs`, and (when
  reviewer subagents are selected) `capabilities.delegation.subagents` with
  `enabled: true` and `packs: [reviewer-subagents]`.
- Generated skill files per resolved set.
- Generated Claude/Codex reviewer subagent definition files when selected.
- Lockfile, doctor report.

## Contracts

- Setup profile changes only `safety.mode`/permissions; it never changes pack
  pre-checks.
- Pack pre-checks are identical across all four profiles (`base` + `review` on,
  rest off).
- Dry-run remains the default; nothing is written without explicit confirmation.
- The plan/diff reflects the exact files that will be written.
- The `automation` pack is not offered in Phase 12 (no loop skills yet).
- Reviewer subagents are off by default and offered only when Claude or Codex is
  a selected client; selecting them writes
  `capabilities.delegation.subagents.enabled: true` and
  `packs: [reviewer-subagents]`, and is independent of the skill packs.
- Init generates reviewer subagent definition files only; it never launches,
  supervises, or invokes subagents.

## Security Rules

- No secrets, no network, no execution during init.
- Blocked packs (plugins, global memory, auto-install) are not selectable.

## Acceptance Criteria

- Selecting a setup profile writes the matching `safety.mode`.
- Default pack selection is `base` + `review`, identical across profiles;
  reviewer subagents default off.
- Selected skill packs are written to `capabilities.skills.packs`.
- Selecting reviewer subagents writes `capabilities.delegation.subagents` with
  `enabled: true` and `packs: [reviewer-subagents]`; not selecting it leaves the
  subagents area unset.
- The reviewer subagents option is hidden/disabled when neither Claude nor Codex
  is a selected client.
- The plan shows safety mode, skill packs, reviewer-subagents state, and the
  resulting skill and subagent definition files before write.
- Nothing is written in dry-run.

## Tests

- Wizard unit tests: setup-profile selection -> `outcome.safetyMode`.
- Wizard unit tests: default pack pre-checks; parse of number/name selections;
  identical defaults across profiles.
- Wizard unit tests: reviewer subagents default off; selecting writes
  `subagents.enabled: true` + `packs: [reviewer-subagents]`; option unavailable
  when no Claude/Codex client is selected.
- Plan snapshot test showing safety mode + skill packs + reviewer-subagents
  state + generated files.
- Dry-run test asserting no writes.

## TDD Strategy

RED: wizard tests for setup-profile mapping and default pack selection; plan
snapshot. GREEN: extend `WizardOutcome`/`runInitWizard`, prompts, and the plan
renderer. Refactor: keep profile and pack selection orthogonal in code.

## Issue Plan

- I7: setup-profile selection -> `safety.mode`. `sequenced` after I1;
  parallel-safe with I2-I6.
- I8: capability-pack multi-select with risk labels. `sequenced` after I1, I7.
- I9: plan/diff reflects profile + packs. `sequenced` after I7, I8.
- I13: reviewer-subagents opt-in in init (writes
  `capabilities.delegation.subagents`; client-gated). `sequenced` after I8 and
  `008`/I10.

## Documentation Updates

- `phase-06`/`phase-08` init UX docs and `phase-05/001` compile flow, noting the
  new selections.
- CLI help text.

## Final Review Checklist

- Setup profile and pack selection orthogonal.
- Identical pack defaults across profiles; reviewer subagents default off.
- Reviewer subagents modeled under `capabilities.delegation.subagents`, not as a
  skill pack; client-gated to Claude/Codex.
- Init generates reviewer subagent definition files only (no launch/supervise).
- Dry-run default preserved; diff shown before write.
- Blocked packs not selectable.
- Deterministic plan rendering.
