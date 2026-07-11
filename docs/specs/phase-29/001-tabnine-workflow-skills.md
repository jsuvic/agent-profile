# Spec: Tabnine Workflow Skills via the Shared Skills Convention

## Status

Approved 2026-07-10. Synthesized from the grill-change agreement record
of the same date (four decisions), grounded in Tabnine CLI documentation
verified the same day: Agent Skills discovery includes
`<project>/.agents/skills/<name>/SKILL.md` with the same
frontmatter-plus-markdown format APC already emits; subagents live in the
proprietary `.tabnine/agent/agents/` path behind an experimental settings
flag. Accepts ADR 0013 on approval.

Note (2026-07-10): an earlier draft claimed this supersedes ADR 0007.
It does not. ADR 0007 decided that *logging guidance* ships as an
always-read topic, not a skill; that decision stands regardless of
Tabnine's skill support (an always-on convention belongs in the
always-read layer on the merits). Phase-29 only makes Tabnine
skill-capable for the *workflow* skills, a separate concern. ADR 0007
receives a one-line staleness note (its "skills reach only Claude/Codex"
rationale premise is dated), not a supersession.

## Problem

Tabnine-only setups receive guidelines only. Users selecting capability
packs expect the workflow skills (grill-change, sdd-change, tdd-change,
final-review) - the 0.4.1 field test surfaced exactly this expectation -
and Tabnine CLI now discovers skills natively from the shared
`.agents/skills/` convention. The pre-phase-29 assumption that Tabnine
has no invocation mechanism (a rationale premise in ADR 0007, and the
reason workflow skills were never emitted for it) is outdated.

## Goal

Setups with Tabnine enabled emit the instruction-only workflow and loop
skills to the shared `.agents/skills/` convention - one file per skill,
discovered by Codex and Tabnine alike - with the existing
conditional-pointer machinery guaranteeing no dangling references in
Tabnine-only renderings.

## Intent

Extend an existing emission condition to a new convention-speaking
client; generate no new content layer, duplicate nothing, and keep the
guidance/skill layering strict.

## Decision Rules

1. Path doubt -> the shared convention (`.agents/skills/`), never a
   Tabnine-proprietary copy.
2. Content doubt -> the conditional-pointer rule; an explanatory compile
   note over silent absence.
3. Mechanism doubt -> exclude experimental contracts (subagents) and
   document the revisit condition.
4. Duplication doubt -> one layer per content item: guidelines are
   always-read conventions, skills are invocable procedures.

## Non-Goals

- Tabnine subagents (`.tabnine/agent/agents/`), hooks, or extensions -
  the subagents feature is gated behind
  `settings.json` `"experimental": { "enableAgents": true }`; APC does
  not write user settings and does not build on experimental contracts.
  Revisit when the flag drops.
- Writing anything under `.tabnine/agent/`.
- Migrating guideline content into skills or vice versa.
- Any change to Claude or Codex emission (binding: byte-identical).
- The assist flow (phase-20's Tabnine exclusion concerns invocation, not
  generation, and is unaffected).

## Behavior (binding)

- The `.agents/skills/` emission condition extends from "Codex enabled"
  to "Codex or Tabnine enabled".
- Skills emitted for a Tabnine-capable rendering: the instruction-only
  workflow set (grill-change, sdd-change, tdd-change, final-review,
  request-to-spec-issues per selected packs) and the phase-22 loop
  skills (their cross-reference machinery already inlines steps whose
  referenced skill is not generated).
- Delegation-dependent skills (`subagent-driven-change`,
  `implement-next`) are emitted only when Claude or Codex is enabled;
  a Tabnine-only setup gets an informational compile note (the phase-22
  `automation_target_not_generated` pattern) naming the skills and the
  reason.
- Shared-file byte identity: for a setup with Codex enabled, enabling
  Tabnine in addition changes no existing `.agents/skills/` byte
  (golden-proven). Tabnine-only renderings may differ from Codex
  renderings only where the conditional-pointer rule requires it.
- Generated Tabnine notes gain one caveat line: Agent Skills requires a
  current Tabnine CLI generation.
- Guidelines are unchanged; no workflow procedure is mirrored into a
  guideline.
- Doctor: no new checks; existing structural checks (e.g.
  `LINT-SKILL-LOOP-001`) apply to the same files, which now exist in
  more setups.
- Lockfile: one entry per skill file, exactly as today.

## Security Rules

- Text-file generation only; no Tabnine invocation, no settings writes,
  no network.
- The verbatim safety rules in skill bodies render identically across
  clients (single source of truth; no paraphrase per target).

## Acceptance Criteria

1. Tabnine-only init/compile emits the workflow and loop skills to
   `.agents/skills/` with valid frontmatter; the wizard capability
   picker and plan reflect them.
2. Tabnine-only setups omit `subagent-driven-change` and
   `implement-next` and emit the informational note naming them.
3. Codex-enabled goldens are byte-identical before and after enabling
   Tabnine (shared files unchanged); Claude/Codex-only setups are
   byte-identical to current baseline.
4. No dangling cross-reference in any pack x client matrix combination
   including Tabnine-only (extends the existing conditional-pointer
   tests).
5. The Tabnine notes caveat line appears exactly once; ADR 0007 gains a
   dated staleness note (its "skills reach only Claude/Codex" premise is
   outdated) while its decision is left intact; ADR 0013 is Accepted.

## Tests

- Golden fixtures: tabnine-only (new), codex+tabnine vs codex-only
  byte-diff (empty on shared files), existing baselines unchanged.
- Conditional-pointer matrix extended with the Tabnine-only column.
- Compile-note unit test for the delegation-dependent exclusion.

## TDD Strategy

RED: the tabnine-only golden and the extended pointer matrix fail
against current emission (no skills emitted). GREEN: extend the emission
condition, add the exclusion + note, regenerate goldens per spec.

## Documentation Updates

- ADR 0013 accepted. ADR 0007 gains a dated staleness note that its
  "skills reach only Claude/Codex" rationale premise is outdated
  (Tabnine added Agent Skills); its decision (logging guidance is an
  always-read topic) is unchanged and NOT superseded.
- docs/targets Tabnine page; CHANGELOG; phase-29 README.

## Issue Plan

- I1: emission-condition extension, delegation exclusions + note,
  goldens, docs/ADR updates. Single issue; brief on approval.

## Final Review Checklist

- Spec-to-test matrix over acceptance criteria 1-5.
- Byte-identity goldens for all pre-existing setups.
- No `.tabnine/agent/` writes anywhere; no settings.json touch.
- Verbatim safety rules identical across renderings.
