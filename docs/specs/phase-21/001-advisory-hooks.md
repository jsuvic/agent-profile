# Spec: Advisory Hooks - non-executing slice (WS5, slice 1)

## Status

Approved on 2026-07-04. Synthesized from the WS5 candidate in
`docs/plans/003-ws3-ws7-spec-synthesis.md`.

Implemented 2026-07-04. Implementation notes:

- Both per-target event taxonomies were re-verified against the official
  hooks docs on 2026-07-04; the verified lists are recorded in
  `docs/research/008-current-agent-capabilities-2026-07.md` (Phase 21
  Decision) and pinned in `packages/compiler/src/hooks.ts`.
- Codex hook support is `confirmed-official`, so Codex advisory hooks are
  generated into a project-local `.codex/hooks.json` (one representation per
  config layer, per the Codex docs). Codex handlers pin the documented
  `commandWindows` Windows-only override next to the POSIX `command`, so
  both platform variants live in one deterministic artifact.
- Claude commands are single pinned literals that parse and fail open in
  every shell Claude documents for hook commands (`sh`, Git Bash, and the
  Windows PowerShell fallback), so Claude needs no per-platform variant.

This is slice 1 only. Command-runner hooks (format-on-write, lint-on-write,
safety-gate-shell) remain the `phase-later/001-hooks-targets.md` draft (WS5-S2)
behind their own threat-model human gate.

## Problem

Hooks add automation but command-runner hooks carry cross-platform execution
and destructive-shell risk; Windows/PowerShell quoting and missing-binary
behavior are non-trivial. Shipping everything at once couples the safe
advisory roles to the risky executing ones.

## Goal

Add a neutral `capabilities.hooks` intent and generate project-local advisory
hooks for Claude/Codex, off by default and opted into per role. Advisory means:
when the client fires the hook at runtime, it executes only a fixed, read-only,
non-project command pinned by APC - a reminder text or a read-only git query -
never a project binary, write, install, or network call. APC itself never
executes hooks at compile or doctor time.

## Non-Goals (slice 1)

- format-on-write, lint-on-write, safety-gate-shell, or any hook that runs a
  project binary or can mutate state (WS5-S2, `phase-later/001`).
- Global/user-level hooks (separate approved spec required).
- Tabnine hooks (surface unverified).
- Executing hooks at compile, validation, or doctor time.
- User-supplied or free-form hook commands; slice 1 commands come only from
  the pinned template table.

## User Flow

1. User opts in via `capabilities.hooks` (or the init wizard's hooks
   checkbox - an additive phase-12/007 wizard extension owned by this spec,
   realizing the `[ ] Hooks [optional]` line from the direction plan).
2. Compile generates project-local advisory hook artifacts for each selected
   role, for each target whose hook support is `confirmed-official` in the
   capability matrix.
3. Diff -> approve -> atomic write; artifacts are lockfile-tracked.
4. Doctor validates the artifacts structurally without executing anything.

## Schema

```yaml
capabilities:
  hooks:
    enabled: true
    advisory:
      - final-review-reminder
      - context-injection
      - pre-compact-checkpoint
```

- `advisory` is an array of unique role ids from the closed enum below.
  Unknown ids are schema validation errors. `additionalProperties: false`.
- Mirroring the locked phase-12 subagents rule: a non-empty `advisory` requires
  `enabled: true`; non-empty with `enabled: false` is a validation/doctor
  error. `enabled` is the single master switch and preserves `advisory` when
  flipped off.
- Absent `capabilities.hooks` -> no hook artifacts (off by default).
- This neutral shape supersedes the illustrative raw-command `hooks:` list in
  `phase-later/001-hooks-targets.md` as the intent surface. Raw commands never
  appear in the profile; slice 1 roles map to pinned templates, and slice 2
  will extend this same shape.

## Advisory Roles (closed enum)

| Role | Event | Pinned runtime behavior |
| --- | --- | --- |
| `final-review-reminder` | `Stop` / `SubagentStop` | Emits a fixed reminder to run `final-review` before handing off |
| `context-injection` | `UserPromptSubmit` | Emits read-only git context: current branch, short status, changed-file list |
| `pre-compact-checkpoint` | `PreCompact` | Emits a fixed reminder to checkpoint in-progress work before compaction |

- Command strings for each role and platform are pinned literals in the
  compiler (the template table), covered by golden fixtures. Where one
  portable string is impossible, per-platform variants are pinned and each
  variant has a golden fixture.
- Advisory hooks fail open: if `git` is unavailable, `context-injection`
  produces no context and exits successfully; an advisory hook must never
  block the client or the user. (Slice 2 safety gates will fail closed; the
  polarity is role-dependent and intentional.)

## Targets

- Claude: hooks written into the generated `.claude/settings.json` hooks
  surface (project-local), per the verified event list.
- Codex: emitted only if the capability matrix (`phase-12/001` refresh)
  records Codex hook support as `confirmed-official` at implementation time;
  otherwise a `disabled_target` / not-supported note is reported, never
  silence.
- Tabnine: never in this slice; not-supported note when hooks are enabled on
  a Tabnine-including profile.

## Contracts (binding)

- Off by default; each role individually opted in; project-local only.
- Slice 1 emits no hook whose command runs a project binary, writes, installs,
  or touches the network; commands come only from the pinned template table.
- APC never executes hooks during generation, validation, or doctor.
- Events used must be in the per-target verified event list, re-verified
  against official docs at implementation time (`phase-later/001` taxonomy).
- Generated artifacts are deterministic, lockfile-tracked, and byte-stable.
- No dependency install; no secrets or environment values in hook commands.

## Doctor Checks (WS5-I3, non-executing)

- `LINT-HOOK-003` (from the `phase-later/001` catalogue): hook event not in
  the verified per-target event list.
- `LINT-HOOK-005`: hook emitted for a target whose support is not
  `confirmed-official`.
- `LINT-HOOK-008` (new): an advisory hook artifact's command differs from the
  pinned template for its role/platform - arbitrary commands cannot hide in
  slice-1 artifacts.
- Doctor performs string/structure comparison only; it never runs a hook
  command (including `--version`-style probes).

## Security Rules

- No execution at compile/doctor time; runtime commands are read-only and
  non-project.
- No secrets, env values, tokens, or production access in generated hooks.
- No auto-install; no network.
- Forbidden-pattern screen: the pinned templates themselves must pass the
  `LINT-HOOK-001` forbidden-pattern rules (defense in depth).

## Acceptance Criteria

- Advisory hooks are generated only when opted in, only for roles selected,
  only for `confirmed-official` targets.
- No command-runner hook can be expressed or emitted in slice 1 (schema
  rejects unknown roles; artifacts match pinned templates).
- Doctor validates advisory artifacts without executing them; a tampered
  artifact command triggers `LINT-HOOK-008`.
- `enabled: false` with non-empty `advisory` is a validation error.
- Profiles without `capabilities.hooks` produce byte-identical output to the
  current baseline.
- Windows and POSIX template variants (where they differ) each have a golden
  fixture.

## Tests

- Golden fixtures: each role for Claude (and Codex if confirmed), including
  per-platform variants; byte-stable.
- Schema table: unknown role rejected; non-empty `advisory` + `enabled: false`
  rejected; absent block emits nothing.
- Execution sentinel: compile and doctor spawn no child process when hooks
  are present in the profile and artifacts.
- Doctor: tampered-command fixture -> `LINT-HOOK-008`; unverified-event
  fixture -> `LINT-HOOK-003`; unconfirmed-target fixture -> `LINT-HOOK-005`.
- No-hooks regression: baseline output byte-identical.

## TDD Strategy

RED: schema table tests, the execution sentinel, and a golden fixture for
`final-review-reminder` on Claude fail before the schema and emission exist.
GREEN: schema (WS5-I1), template table + emission (WS5-I2), doctor checks
(WS5-I3).

## Issue Plan

- WS5-I1: `capabilities.hooks` advisory schema + validation rules. `ready`.
- WS5-I2: pinned template table + advisory hook generation (3 roles),
  Claude/Codex, per-platform variants. `sequenced` after WS5-I1; requires the
  capability-matrix hook-support verification for Codex.
- WS5-I3: doctor advisory-hook checks (LINT-HOOK-003/005/008, no execution).
  `sequenced` after WS5-I2.
- WS5-S2 (later, human gate): command-runner slice per `phase-later/001` -
  full `LINT-HOOK-*` catalogue, per-platform commands, fail-closed on missing
  binary. Threat model sign-off required before it starts.

## Cross-Phase Amendments (owned here)

- `phase-01/001-profile-schema-v1.md`: additive `capabilities.hooks` block
  (the `capabilities` object is `additionalProperties: false`, so the JSON
  schema gains the key here).
- `phase-05/002-cli-init.md` / phase-12/007 wizard: additive hooks checkbox.

## Documentation Updates

- CLI/README: `capabilities.hooks` advisory roles and the off-by-default rule.
- `phase-later/001-hooks-targets.md`: note that the intent surface is now
  owned here and slice 2 extends `capabilities.hooks`.
- Capability matrix: record the verified hook-support status used for the
  Codex emission decision.

## Final Review Checklist

- No executing surface added to APC; runtime commands read-only, non-project,
  pinned.
- Fail-open polarity for advisory roles documented and tested.
- Windows quoting handled by pinned per-platform templates with goldens.
- Doctor never executes; tamper detection via LINT-HOOK-008.
- Off by default everywhere; baseline byte-identical without opt-in.
