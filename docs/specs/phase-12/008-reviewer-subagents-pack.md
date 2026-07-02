# Spec: Reviewer Subagents Pack (WS1/WS2)

## Status

Approved. Depends on `002-skills-pack-schema.md` (neutral reviewer
definitions), `004-advanced-review-pack.md` (shares those definitions), and the
Phase 11 subagent platform (`phase-11/001`, `002`, `003`, `005`). Owns the
`capabilities.delegation.subagents.packs` extension and reviewer subagent
generation.

## Problem

The umbrella and specialist reviews ship as skills, but Claude and Codex
officially support subagents, and reviewer subagents let a review run as a
delegated, tool-scoped, parallelizable agent. Previously this was deferred to a
later phase. The desired direction is to offer reviewer subagents in Phase 12 as
an explicit opt-in, generated deterministically as definition files only.

## Goal

Add the smallest additive schema extension under the existing subagent
capability area so a user can opt into generated Claude/Codex reviewer subagent
definition files, rendered from the same neutral reviewer definitions used by the
`advanced-review` skills.

## Non-Goals

- Launching, invoking, supervising, or testing subagents at compile or doctor
  time.
- Running loops, executing tests, or applying patches.
- Tabnine reviewer subagents (experimental "YOLO mode"; skills-only).
- Global/user/managed/admin subagents.
- Modeling reviewer subagents as a `capabilities.skills.packs` entry.

## Capability Area and Schema Shape

Reviewer subagents are a subagent capability, not a skill pack. They live under
the existing `capabilities.delegation.subagents` area with an additive optional
`packs` array:

```yaml
capabilities:
  skills:
    packs:
      - base
      - review
      - advanced-review
  delegation:
    subagents:
      enabled: true
      packs:
        - reviewer-subagents
```

- `packs` is an optional array of unique subagent pack ids.
- Allowed subagent pack id in Phase 12: `reviewer-subagents`. Unknown ids are
  rejected with a schema validation issue.
- `packs` is additive alongside the existing `agents` array and `useTemplate`
  refs; it does not replace them.
- `packs` requires `enabled: true`; a non-empty `packs` with `enabled: false` is
  a validation/doctor error. Locked decision: explicit-required - `enabled` is
  the single master switch and there is no implicit/hybrid defaulting (presence
  of `packs` never auto-enables). Disabling flips `enabled` to `false` and
  preserves the `packs` list.
- Subagent-source rule (required schema amendment): when `enabled: true`, at
  least one subagent source is required - a non-empty `agents` **or** a non-empty
  `packs`. The current schema requires a non-empty `agents` whenever
  `enabled: true` (`if enabled then required: agents, minItems: 1` in
  `packages/schemas/ai-profile.schema.json`) and, with
  `additionalProperties: false`, rejects `packs` outright. This spec relaxes both:
  `packs` is added to the `subagents` object, and the `if/then` becomes "require
  a non-empty `agents` OR a non-empty `packs`." A pack-only profile
  (`enabled: true`, `packs: [reviewer-subagents]`, no `agents`) is therefore
  valid.
- The skill pack ids (`base`, `review`, `advanced-review`, `automation`,
  `mcp-recommendations`) are unchanged and remain under
  `capabilities.skills.packs`.

### Pack -> reviewer subagent mapping (neutral)

`reviewer-subagents` expands to four reviewer subagent definitions, one per
neutral reviewer definition from `004`:

- `security-reviewer`
- `readability-reviewer`
- `test-reviewer`
- `architecture-reviewer`

These share the define-once neutral reviewer definitions with the
`advanced-review` skills (`security-review`, `readability-review`,
`test-review`, `architecture-review`). One source, two render surfaces: skills
(from `004`) and subagent definitions (here).

### Subagent-specific rendering fields

When rendered as subagent definitions, each reviewer carries subagent fields
consistent with the Phase 11 schema (`phase-11/001`):

- `toolScope: read-only` by default (reviewers do not write).
- bounded `maxTurns` / `timeoutMinutes`.
- a `modelPreference`.
- an explicit output contract in the prompt (status + findings shape).
- `mcpServers: []`.

## Rendering / Targets

- Rendered through the existing Phase 11 subagent targets: Claude project
  subagents (`phase-11/002`) and Codex project custom agents (`phase-11/003`).
- Project-local only; lockfile-tracked.
- Tabnine is excluded in Phase 12.

## User Flow

1. User opts into reviewer subagents in `init` (see `007`) or edits
   `capabilities.delegation.subagents` in `ai-profile.yaml`.
2. `agent-profile compile --dry-run` previews the generated reviewer subagent
   definition files for Claude/Codex.
3. `agent-profile compile --write` writes only lockfile-tracked project files.
4. APC never launches the clients and never invokes the generated subagents.
5. `agent-profile doctor` validates the generated definitions.

## Inputs

- Validated `AiProfile` with `capabilities.delegation.subagents.packs`.
- Neutral reviewer definitions (shared module from `004`).
- Derived `effectivePermissions`.
- Phase 11 subagent schema and target contracts.

## Outputs

- `security-reviewer`, `readability-reviewer`, `test-reviewer`,
  `architecture-reviewer` subagent definition files for Claude and Codex.

## Contracts

- Additive and backward compatible: profiles without `subagents.packs` behave as
  today; the existing `agents`/`useTemplate` behavior is unchanged.
- Target enablement derives from the union of expanded `agents` and expanded
  `packs`. Reviewers expanded from `packs` are treated as subagents equivalent to
  `agents` entries for target generation, name-collision checks, and doctor, so a
  pack-only profile still produces reviewer subagent targets (it must not compile
  to zero subagents).
- Non-executing: APC generates subagent definition files only. It does not
  launch agents, run loops, execute tests, supervise subagents, or apply
  patches.
- Reviewer subagent definitions default to `read-only` tool scope and must not
  broaden beyond `effectivePermissions`.
- Deterministic, byte-stable generation.
- No dangling references: reviewer subagents are generated only for skill/
  subagent-capable targets covered by the Phase 11 target specs.
- Selecting `reviewer-subagents` is independent of the `advanced-review` skill
  pack; either, both, or neither may be selected.

## Security Rules

- No secrets, no source upload, no execution at compile or doctor time.
- No `danger-full-access`, no `approval_policy = "never"`, no
  `run_shell_command`/`write_file` broadening for generated reviewers.
- No dependency install.

## Acceptance Criteria

- `capabilities.delegation.subagents.packs: [reviewer-subagents]` with
  `enabled: true` emits the four reviewer subagent definition files for Claude
  and Codex.
- A pack-only profile (`enabled: true`, `packs: [reviewer-subagents]`, no
  `agents`) validates and produces reviewer targets - it must not fail
  validation or compile to zero subagents.
- `packs` with `enabled: false` (or an unknown pack id) is rejected; `enabled:
  true` with neither `agents` nor `packs` is rejected.
- Generated reviewers default to `read-only` and never exceed
  `effectivePermissions`.
- No Tabnine reviewer subagents generated.
- Reviewer subagents and `advanced-review` skills can be selected independently.
- Deterministic, byte-stable output.

## Tests

- Core: accept `reviewer-subagents`; accept a pack-only profile (`enabled: true`,
  `packs` only, no `agents`); reject unknown pack id, `packs` with
  `enabled: false`, and `enabled: true` with neither `agents` nor `packs`.
- Compiler golden fixture `reviewer-subagents-enabled` (pack-only, no inline
  `agents`): four reviewer subagent files for Claude and Codex; none for Tabnine;
  asserts non-zero subagent targets.
- Compiler: same-source assertion that reviewer subagent bodies derive from the
  shared neutral reviewer definitions used by `004`.
- Permission test: generated reviewers are `read-only` and within
  `effectivePermissions`.
- Determinism: byte-stable double render.

## TDD Strategy

RED: schema test rejecting `reviewer-subagents` with `enabled: false` and
accepting a pack-only profile (no `agents`), plus a golden fixture expecting the
four reviewer subagent files from a pack-only profile. GREEN: relax the
`if/then` agents rule to "agents OR packs", add `packs` to the schema, and expand
packs through the Phase 11 subagent targets. Refactor: share the neutral reviewer
definition module with `004`.

## Issue Plan

- I10: `capabilities.delegation.subagents.packs` additive schema + validation
  (requires `enabled: true`). `sequenced` after I1; parallel-safe with
  I2-I6.
- I11: `reviewer-subagents` pack expansion -> Claude/Codex reviewer subagent
  definition files from the shared neutral definitions. `sequenced` after I3
  (neutral definitions) and I10.
- I12: doctor coverage for reviewer subagents (pack/subagent mismatch +
  read-only/permission bounds), reusing `phase-11/005`. `sequenced` after I11.
- I13: init opt-in for reviewer subagents (owned by `007`; cross-referenced
  here).

## Documentation Updates

- `phase-01/001-profile-schema-v1.md` amendment: add `subagents.packs`, and relax
  the `if enabled then required agents (minItems 1)` rule to require a non-empty
  `agents` OR a non-empty `packs`.
- `phase-11/001-subagents-schema.md`: pack expansion feeds the same subagent
  expansion/target-enablement pipeline as `agents`.
- `phase-11/005-doctor-subagent-checks.md` cross-reference for reviewer coverage.
- `docs/targets/` reviewer subagent mapping.

## Final Review Checklist

- Reviewer subagents modeled under `capabilities.delegation.subagents`, not as a
  skill pack.
- Additive schema; `enabled: true` required for a non-empty `packs`; `enabled:
  true` requires a non-empty `agents` OR `packs`; pack-only profiles validate and
  produce targets.
- Define-once neutral definitions render into both skills (`004`) and subagents
  (here).
- Claude/Codex only; no Tabnine reviewer subagents.
- Non-executing: definition files only; no launch/loop/test/supervise/patch.
- Read-only default; within `effectivePermissions`.
- Deterministic, byte-stable fixtures; no dangling references.
