# Spec Candidate: Skill Catalog + Capability-Aware Init (WS0-WS2)

## Status

Draft candidate. **Not approved.** Produced by `request-to-spec-issues` from the
grill agreement record for `docs/plans/001-agent-capability-direction.md`. Covers
the first implementation slice only: WS0 + WS1 + WS2. WS3-WS7 contracts are
recorded in `001` for later slices.

## Problem

The generated skill catalog is thin (`sdd-change`, `tdd-change`, `final-review`,
`grill-change`, `request-to-spec-issues`, `subagent-driven-change`), code review
is documentation-only, and `init` offers no capability or safety choice. The
capability matrix backing these decisions is also unverified for 2026-07.

## Goal

Ship (WS0) a verified capability matrix, (WS1) a real skill catalog gated by a
neutral `capabilities.skills.packs` intent plus opt-in Claude/Codex reviewer
subagent definition files gated by a `reviewer-subagents` subagent pack under
`capabilities.delegation.subagents`, and (WS2) an `init` that lets the user pick
a setup profile and capability packs (including the optional reviewer subagents)
with risk labels - all deterministic, diff-before-write, doctor-validated.

## Intent

Advanced capability, offered early and explicitly, never silently enabled. One
review concept mapped per client. Safety-mode and pack-selection are orthogonal.

## Decision Rules

- Skills are instruction-only, read-first, no tool/shell grants -> safe
  regardless of profile.
- Generated cross-references must be conditional on the referenced artifact
  being generated (no dangling pointers).
- `review-change` supersedes the `codeReview` guidance topic on skill-capable
  clients; Tabnine keeps guideline `60-code-review`.
- Setup profile changes only `safety.mode`/permissions; pack pre-checks are
  identical across profiles.
- Define-once reviewer definitions render into two Phase 12 surfaces: the
  `advanced-review` skills and, when the `reviewer-subagents` subagent pack is
  selected, Claude/Codex reviewer subagent definition files.
- Reviewer subagents are a subagent capability under
  `capabilities.delegation.subagents`, not a skill pack; opt-in and off by
  default; APC generates definition files only (no launch/loop/test/supervise/
  patch).

## Non-Goals (this slice)

- WS3 assist, WS4 MCP scan, WS5 hooks, WS6 loops, WS7 memory.
- Non-reviewer subagent packs, and any subagent execution/launch/supervision.
- Any executing surface.

## User Flow

`agent-profile init` -> detect stack/clients/files -> choose setup profile
(guarded/balanced/plan-only/autonomous) -> choose capability packs
(risk-labelled; `base`+`review` pre-checked) -> plan/diff -> confirm ->
deterministic write -> doctor.

## Inputs

`ai-profile.yaml` (new `capabilities.skills.packs`), wizard selections, existing
guidance content (`CODE_REVIEW_TOPIC`).

## Outputs

`.claude/skills/*/SKILL.md`, `.agents/skills/*/SKILL.md`, Tabnine guideline
mappings, optional Claude/Codex reviewer subagent definition files, updated
`ai-profile.yaml`, lockfile, doctor report;
`docs/research/008-current-agent-capabilities-2026-07.md`; ADR 0005 amendment.

## Contracts

- Existing 6 skills and their flags keep working unchanged.
- New `capabilities.skills.packs` and additive
  `capabilities.delegation.subagents.packs` fields are optional
  (`additionalProperties:false` preserved); the existing subagents
  `agents`/`useTemplate` behavior is unchanged.
- Deterministic render; byte-stable golden fixtures.
- `codeReview:true` continues to satisfy review (now selects `review` pack).
- Reviewer subagents render only for Claude/Codex, default to `read-only`, and
  never exceed `effectivePermissions`.

## Security Rules

- No secrets, no source upload, no network, no execution.
- Generated skills grant no tools/shell.

## Acceptance Criteria

- Capability matrix doc exists with per-cell confidence + source URL + 2026-07
  date; ADR 0005 amended.
- `capabilities.skills.packs` validates; unknown pack ids rejected.
- `review`, `advanced-review`, `mcp-recommendations` packs emit the agreed skills
  for Claude/Codex; Tabnine gets guideline mappings.
- `review-change` body = converted `codeReview` guidance; specialist pointers
  appear only when `advanced-review` is generated.
- `capabilities.delegation.subagents.packs: [reviewer-subagents]` with
  `enabled: true` emits the four Claude/Codex reviewer subagent definition files
  from the shared neutral reviewer definitions; none for Tabnine.
- `init` writes profile + safety.mode from setup profile, skill packs, and the
  optional reviewer-subagents selection; dry-run default; diff shown.
- Doctor flags dangling skill references, pack/skill mismatches, and
  reviewer-subagent pack/permission issues.

## Tests

Golden fixtures per pack combination; core schema validation unit tests;
compiler skill-resolution unit tests; wizard prompt/plan unit tests; doctor rule
tests; determinism (double-render byte-identical).

## TDD Strategy

Each issue starts with a RED golden/unit test asserting the missing skill file
or rejected schema, then minimal GREEN emission/validation, then refactor. This
complements, and does not replace, the `Tests` section above.

## Decisions locked (post-synthesis)

- **Pack id = `mcp-recommendations`** (not `mcp`). The pack emits informational
  recommendations only: no MCP config, server commands, install commands, env
  var names, tokens, or arbitrary MCP ids. A separate `mcp-config` pack may exist
  later. Pack ids for this slice: `base`, `review`, `advanced-review`,
  `automation`, `mcp-recommendations`.
- **Tabnine review mapping = umbrella-only in the first slice.** `review` pack ->
  Tabnine `review-change` guideline. `advanced-review` pack -> specialist
  SKILL.md only on skill-capable targets; **no** per-specialist Tabnine IDE
  guideline fan-out. The compiler must not create dangling references from
  Tabnine guidelines to specialist skills not generated for that target.
- **Reviewer subagents are in Phase 12, opt-in.** Modeled as a subagent
  capability: `capabilities.delegation.subagents` with `enabled: true` and
  `packs: [reviewer-subagents]` (new additive `packs` field; smallest extension
  under the existing subagent area). Skill pack ids are unchanged. The
  `reviewer-subagents` pack renders the same neutral reviewer definitions as the
  `advanced-review` skills into Claude/Codex reviewer subagent **definition files
  only** - no launch, loop, test execution, supervision, or patch application.
  Tabnine is excluded (experimental "YOLO mode"). Owned by phase-12 spec `008`.
- **Subagent `enabled` rule = explicit-required.** A non-empty
  `capabilities.delegation.subagents.packs` requires `enabled: true`; `enabled:
  false` with a non-empty `packs` is a validation/doctor error. `enabled` is the
  single master switch (no implicit/hybrid defaulting); disabling flips the flag
  and preserves `packs`. When `enabled: true`, at least one subagent source is
  required (non-empty `agents` OR `packs`); a pack-only profile is valid and must
  produce targets. This relaxes the current schema's `if enabled then required
  agents (minItems 1)` rule - owned by phase-12 `008`.

## Architecture Rescue Candidate (prerequisite)

### R1 - Generalize skill selection from "flag->skill" to "resolved skill set"

- Files: `packages/compiler/src/compiler.ts` (`WORKFLOW_SKILLS`,
  `getWorkflowSkills`), `packages/core/src/profile.ts`.
- Friction: `WORKFLOW_SKILLS` hard-binds each skill to one `workflow` flag. Packs
  introduce pack->N-skills and a flag<->pack equivalence (`codeReview` <->
  `review`), which would scatter conditional logic across every emitter.
- Proposal: one `resolveSelectedSkills(profile): SkillId[]` that unions
  workflow-flag skills and pack skills (de-duped, ordered). Claude/Codex/Tabnine
  emitters and doctor read this single resolved set.
- Leverage: every WS1 catalog issue and WS4/WS6 (later) reuse it; no per-emitter
  pack logic.
- Test improvement: skill selection becomes unit-testable in one place instead
  of via each emitter's golden output.
- ADR/spec conflicts: none; additive.
- Dependency state: `ready`, prerequisite for I2-I6.

## Issue Briefs

### I0 - Capability matrix + ADR 0005 amendment (WS0)

- Parent: this spec, WS0.
- Intent: ground capability claims in verified 2026-07 official docs.
- Behavior slice: docs-only. Create `docs/research/008-...md` matrix (rows:
  instructions, memory, skills, MCP, permissions, hooks, subagents, plugins,
  slash commands, loops, governance, import; columns: Codex/Claude/Tabnine
  support, source URL, verify date, confidence, project-local?, user-level?,
  recommended compiler action) with confidence labels; amend ADR 0005.
- Non-goals: no code, no schema.
- Acceptance: matrix + ADR present, every claim cites an official URL + date.
- RED proof: n/a (doc). GREEN proof: matrix + ADR present, links resolve.
- Test command guidance: markdown link check / docs lint if available.
- File ownership: `docs/research/`, `docs/architecture/decisions/`.
- Dependencies: `ready`, `parallel-safe`.
- Contract/security impact: none.
- Docs impact: this is the docs.
- Review: verify each capability claim cites official docs, not a blog/video.

### I1 - `capabilities.skills.packs` schema (WS1 foundation)

- Parent: this spec, WS1.
- Intent: neutral pack intent field.
- Behavior slice: add pack field to `ai-profile.schema.json`,
  `AiProfileCapabilities` in `profile.ts`, validation (reject unknown pack ids),
  deterministic render in `renderProfileYaml`.
- Non-goals: no compiler emission yet.
- Acceptance: known pack ids accepted, unknown rejected, render byte-stable.
- RED proof: validation test rejecting `packs:["bogus"]`, accepting known ids;
  render test. GREEN proof: minimal schema+types pass.
- Test command guidance: `packages/core` unit tests.
- File ownership: `packages/core`, `packages/schemas`.
- Dependencies: `ready`; blocks I2-I6, I8.
- Contract impact: additive. Security impact: none.
- Docs impact: schema reference.
- Review: `additionalProperties:false` preserved; deterministic order.

### I2 - `review` pack -> `review-change` skill + codeReview convergence

- Parent: this spec, WS1.
- Intent: one umbrella review skill mapped per client.
- Behavior slice: `review-change` generated for Claude/Codex from
  `CODE_REVIEW_TOPIC` body; `codeReview:true` selects `review` pack; Tabnine
  keeps `60-code-review` guideline.
- Non-goals: no specialist pointers yet (I5).
- Acceptance: golden fixture emits `review-change/SKILL.md`; `codeReview:true`
  yields the review pack; Tabnine guideline unchanged.
- RED proof: golden fixture expecting `review-change/SKILL.md`; mapping test.
  GREEN proof: emission via R1 makes it pass.
- Test command guidance: `packages/compiler` golden + unit tests.
- File ownership: `packages/compiler`, `fixtures/*`.
- Dependencies: `sequenced` after I1, R1; parallel-safe with I3, I4.
- Contract impact: `codeReview` semantics preserved.
- Security impact: none. Docs impact: `docs/targets/`.
- Review: no duplicate review surface on skill-capable clients.

### I3 - `advanced-review` pack -> 4 specialist skills

- Parent: this spec, WS1.
- Intent: deeper specialist reviews as skills.
- Behavior slice: `security-review`, `readability-review`, `test-review`,
  `architecture-review` skills (Claude/Codex skill files; Tabnine guideline
  mapping - open sub-decision: guideline per specialist vs none).
- Non-goals: reviewer subagent definition files (owned by I11 / phase-12 `008`
  in this same phase). This issue extracts the shared neutral definitions and
  renders the skill surface.
- Acceptance: golden fixtures for each specialist under an
  `advanced-review-enabled` fixture.
- RED proof: fixtures for each specialist. GREEN proof: emission via R1.
- Test command guidance: `packages/compiler` golden tests.
- File ownership: `packages/compiler`, `fixtures/*`.
- Dependencies: `sequenced` after I1, R1; parallel-safe with I2, I4.
- Contract impact: additive. Security impact: none.
- Docs impact: `docs/targets/`.
- Review: descriptions match the grill catalog; skills grant no tools.

### I4 - `mcp-recommendations` pack -> `mcp-fit-check` skill

- Parent: this spec, WS1.
- Intent: advisory MCP-fit skill.
- Behavior slice: `mcp-fit-check` skill (Claude/Codex; Tabnine guideline or
  none). Advisory-only text; no network, no install, per WS4 contract.
- Non-goals: the WS4 scan itself.
- Acceptance: golden fixture emits `mcp-fit-check/SKILL.md`.
- RED/GREEN: golden fixture. Test guidance: `packages/compiler` golden tests.
- File ownership: `packages/compiler`, `fixtures/*`.
- Dependencies: `sequenced` after I1, R1; parallel-safe with I2, I3.
- Contract/security impact: none new. Docs impact: `docs/targets/`.
- Review: skill body never instructs installation or network calls.

### I5 - Conditional specialist pointers in `review-change`

- Parent: this spec, WS1.
- Intent: self-consistent generated references.
- Behavior slice: `review-change` body includes "run `security-review`/..."
  pointers only for specialists actually generated.
- Acceptance: `advanced-review` off -> no pointers; on -> pointers present.
- RED proof: two fixtures (off/on). GREEN proof: conditional render.
- File ownership: `packages/compiler`, `fixtures/*`.
- Dependencies: `sequenced` after I2, I3.
- Contract impact: `review-change` body varies with packs (fixture-covered).
- Security impact: none. Review: no dangling references in any combination.

### I6 - Doctor skill checks

- Parent: this spec, WS1.
- Intent: validate the generated catalog.
- Behavior slice: doctor flags dangling skill references + pack/skill mismatch
  (orphan generated skill vs profile packs).
- Acceptance: hand-broken reference -> doctor finding; orphan skill -> finding.
- RED proof: doctor test with broken reference. GREEN proof: check + finding
  code. File ownership: `packages/doctor`.
- Dependencies: `sequenced` after I5. Cross-ref `phase-04/006`.
- Contract/security impact: none. Review: no file contents printed in findings.

### I7 - Init setup-profile selection -> `safety.mode`

- Parent: this spec, WS2.
- Intent: choose autonomy level at init.
- Behavior slice: wizard prompt for guarded/balanced/plan-only/autonomous;
  writes `safety.mode`; permissions from existing presets.
- Non-goals: pack selection (I8).
- Acceptance: selection -> `outcome.safetyMode`; plan renderer shows it.
- RED proof: wizard unit test. GREEN proof: extend `WizardOutcome`/
  `runInitWizard`. File ownership: `apps/cli`.
- Dependencies: `sequenced` after I1; parallel-safe with I2-I6.
- Contract impact: init writes safety.mode. Security impact: none new.
- Review: dry-run default preserved.

### I8 - Init capability-pack multi-select with risk labels

- Parent: this spec, WS2.
- Intent: explicit, risk-labelled pack choice.
- Behavior slice: risk-labelled pack picker (`base`+`review` pre-checked);
  writes `capabilities.skills.packs`.
- Acceptance: default selection correct; labels rendered; parse handles
  numbers/names.
- RED proof: wizard test for defaults + label rendering + parse. GREEN proof:
  prompt + outcome wiring. File ownership: `apps/cli`.
- Dependencies: `sequenced` after I1, I7.
- Contract impact: init writes packs. Security impact: none.
- Review: identical pre-checks across profiles (orthogonality rule).

### I9 - Init plan/diff reflects profile + packs

- Parent: this spec, WS2.
- Intent: user sees exactly what will be written.
- Behavior slice: plan renderer + diff-before-write show chosen safety mode,
  packs, and resulting skill files; dry-run default preserved.
- Acceptance: plan snapshot shows safety mode + packs + skill files.
- RED proof: plan snapshot test. GREEN proof: renderer update. File ownership:
  `apps/cli`.
- Dependencies: `sequenced` after I7, I8.
- Contract impact: none beyond display. Security impact: none.
- Review: nothing written in dry-run.

### I10 - `capabilities.delegation.subagents.packs` schema (reviewer subagents foundation)

- Parent: this spec, WS1; owned by phase-12 `008`.
- Intent: smallest additive schema extension for opt-in subagent packs.
- Behavior slice: add optional `packs` array to the existing subagents block in
  `ai-profile.schema.json` and `profile.ts`; allow id `reviewer-subagents`;
  require `enabled: true` for a non-empty `packs`; deterministic render.
- Non-goals: emitting subagent files (I11); skill packs (I1).
- Acceptance: `reviewer-subagents` accepted; unknown id and `enabled:false` with
  packs rejected; existing `agents`/`useTemplate` unchanged.
- RED proof: validation test rejecting `packs:[reviewer-subagents]` with
  `enabled:false`. GREEN proof: additive schema + validation.
- Test command guidance: `packages/core` unit tests.
- File ownership: `packages/core`, `packages/schemas`.
- Dependencies: `sequenced` after I1; parallel-safe with I2-I6.
- Contract impact: additive. Security impact: none.
- Review: `additionalProperties:false` preserved; not a skill pack.

### I11 - `reviewer-subagents` pack -> Claude/Codex reviewer subagent files

- Parent: this spec, WS1; owned by phase-12 `008`.
- Intent: render reviewer subagents from the shared neutral definitions.
- Behavior slice: expand `reviewer-subagents` into `security-reviewer`,
  `readability-reviewer`, `test-reviewer`, `architecture-reviewer` definition
  files via the Phase 11 Claude/Codex subagent targets; `read-only` default;
  within `effectivePermissions`; `mcpServers: []`.
- Non-goals: Tabnine reviewer subagents; any execution/launch/supervision.
- Acceptance: golden fixture `reviewer-subagents-enabled` -> four files for
  Claude and Codex, none for Tabnine; bodies trace to the shared definitions.
- RED proof: golden fixture. GREEN proof: pack expansion through Phase 11
  targets. File ownership: `packages/compiler`, `fixtures/*`.
- Dependencies: `sequenced` after I3 (shared neutral definitions) and I10.
- Contract impact: additive; non-executing. Security impact: read-only,
  bounded; no shell/write broadening.
- Review: define-once source shared with I3; no dangling references.

### I12 - Doctor coverage for reviewer subagents

- Parent: this spec, WS1; owned by phase-12 `008`.
- Intent: validate generated reviewer subagents.
- Behavior slice: pack/subagent mismatch (orphan/gap) + read-only/permission
  bounds, reusing `phase-11/005`.
- Acceptance: orphan reviewer file -> finding; missing pack subagent -> finding;
  over-broad permission -> finding; clean tree -> none.
- RED proof: doctor test per finding. GREEN proof: checks + finding codes.
- File ownership: `packages/doctor`.
- Dependencies: `sequenced` after I11. Cross-ref `phase-11/005`.
- Contract/security impact: none. Review: no file contents printed.

### I13 - Init opt-in for reviewer subagents

- Parent: this spec, WS2; owned by phase-12 `007`.
- Intent: offer reviewer subagents at init.
- Behavior slice: risk-labelled `[optional] Claude/Codex reviewer subagents`
  option, off by default, client-gated to Claude/Codex; selecting writes
  `capabilities.delegation.subagents.enabled: true` + `packs:
  [reviewer-subagents]`; plan/diff shows subagent files.
- Non-goals: launching/supervising subagents.
- Acceptance: default off; selection writes the subagent intent; option hidden
  when no Claude/Codex client selected; plan reflects it.
- RED proof: wizard unit tests. GREEN proof: prompt + outcome wiring + plan
  renderer. File ownership: `apps/cli`.
- Dependencies: `sequenced` after I8 and I10.
- Contract impact: init writes subagent intent. Security impact: none new.
- Review: independent of `advanced-review` skill pack; definition files only.

## Dependency Map

```
I0  (parallel-safe, WS0)
R1  ->  I2, I3, I4, I6
I1  ->  I2, I3, I4, I6, I7, I8, I10
I2 ┐
I3 ├-> I5 -> I6
I4 ┘
I3, I10 -> I11 -> I12
I7 -> I8 -> I9
I8, I10 -> I13
```

## Parallelism Map

- Wave 1 (parallel-safe): I0, R1, I1.
- Wave 2 (after I1+R1): I2, I3, I4; and I7, I10 (after I1).
- Wave 3: I5 (after I2,I3), I8 (after I7), I11 (after I3,I10).
- Wave 4: I6 (after I5), I9 (after I8), I12 (after I11), I13 (after I8,I10).

## Human Gates

- `human-gate`: spec approval before any implementation (SDD required).
- `human-gate`: ADR 0005 amendment sign-off (I0).
- Both synthesis sub-decisions are locked (pack id `mcp-recommendations`;
  Tabnine umbrella-only) - see "Decisions locked".
- Reviewer subagents are now an in-phase, opt-in capability (definition files
  only); see "Decisions locked".

## Documentation Updates

- `docs/research/008-current-agent-capabilities-2026-07.md` (new).
- ADR 0005 amendment.
- `docs/targets/` skill and reviewer-subagent mappings for the new artifacts.
- `phase-01/001` (additive `subagents.packs`) and `phase-11/001` + `phase-11/005`
  cross-references for the `reviewer-subagents` pack.
- Numbered specs under `docs/specs/phase-12/` (`001`-`008`).

## Final Review Checklist

- New pack fields additive; existing skills/flags and subagents
  `agents`/`useTemplate` unchanged.
- No dangling generated references in any pack combination.
- Deterministic, byte-stable golden fixtures.
- Setup profile and pack selection orthogonal.
- No secrets, no network, no execution, no tool grants in generated skills.
- Reviewer subagents modeled under `capabilities.delegation.subagents`, not as a
  skill pack; Claude/Codex only; definition files only; read-only default.
- Every WS0 capability claim cites an official source with a verification date.

## Recommended Next Step

The phase-12 specs (`001`-`008`) are Approved and implementation is handed to
Codex. Codex starts Wave 1 (I0, R1, I1) under `sdd-change` + `tdd-change`;
reviewer subagents (I10-I13) join in Waves 2-4 per
`docs/specs/phase-12/008-reviewer-subagents-pack.md`. This synthesis note itself
stays a non-binding candidate; the binding contracts live in the phase-12
specs.
