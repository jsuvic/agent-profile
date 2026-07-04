# Spec: Automation Pack Loop Skills (WS6)

## Status

Approved on 2026-07-04. Synthesized from the WS6 candidate in
`docs/plans/003-ws3-ws7-spec-synthesis.md`.

This spec gives content to the `automation` pack that `phase-12/002` reserved
("generates nothing in Phase 12").

## Problem

Loop workflows (implement-test-fix, review-patch-retest, and similar) are
valuable, but any APC-driven iteration is background/hosted execution and
risks hidden, uncontrolled work - both forbidden by the product principles.

## Goal

Generate instruction-only loop skills under the `automation` pack for
skill-capable clients (Claude, Codex). Each skill documents a bounded, gated
iteration discipline: a hard-coded maximum iteration count, explicit stop
conditions, and a human-approval gate before any write or destructive step.
APC emits text; it never executes, launches, schedules, or iterates anything.

## Non-Goals

- APC-executed loops, background mode, subagent supervision, or autonomous
  iteration of any kind.
- Hook- or scheduler-based loop triggering (WS5 slice 2 territory at the
  earliest).
- Tabnine loop guidelines (skills-capable clients only; see Targets).
- New pack ids; this fills the existing reserved `automation` pack.

## User Flow

1. User selects the `automation` pack (profile edit or the phase-12/007
   wizard).
2. Compile emits the five loop skills for Claude
   (`.claude/skills/<name>/SKILL.md`) and Codex (`.agents/skills/<name>/SKILL.md`).
3. Doctor structurally verifies each emitted loop skill contains the required
   bounding sections.

## Loop Skill Set (closed)

| Skill id | Loop |
| --- | --- |
| `loop-implement-test-fix` | implement -> test -> fix until green |
| `loop-review-patch-retest` | review -> patch -> retest |
| `loop-security-patch-retest` | security review -> patch -> retest |
| `loop-docs-update` | docs drift scan -> update -> re-verify |
| `loop-sdd-cycle` | SDD spec -> tests -> implementation -> verify |

The set is closed; adding a loop skill is a reviewed source change to this
mapping.

## Required Skill Body Sections (binding, structurally checkable)

Every generated loop skill body must contain exactly these headings, each
non-empty:

- `## Max Iterations` - a hard-coded integer bound (default 3); the loop
  stops unconditionally when it is reached and reports the unfinished state.
- `## Stop Conditions` - must include: tests/checks green; no diff produced
  by an iteration; the same failure repeating identically across two
  consecutive iterations.
- `## Approval Gate` - human approval is required before any write or
  destructive step in each iteration; the loop never self-approves.

Doctor checks these headings by string/structure inspection of the emitted
files (WS6-I2); it never executes anything.

## Skill Cross-References

Loop skills may point to other generated skills (e.g. `loop-sdd-cycle`
references `sdd-change`, `tdd-change`, `final-review`; `loop-review-patch-retest`
references `review-change`). The phase-12/003 conditional-pointer rule
applies: a loop skill names another skill only when that skill is actually
generated for the same target; otherwise the step is described inline with no
skill reference. No dangling reference in any pack combination
(`phase-12/006` doctor check covers the emitted set).

## Targets

- Claude and Codex: full loop skill emission.
- Tabnine: no automation artifacts. A profile enabling `automation` with a
  Tabnine-including target set reports an informational not-supported note
  for Tabnine, never silence (consistent with the unsupported-target rule in
  `phase-later/001`).

## Contracts (binding)

- The `phase-12/002` pack mapping table is amended (cross-phase, owned here):
  `automation` -> the five loop skills above.
- Instruction-only: no tool grants, shell, network, or execution semantics in
  any loop skill body; APC gains no execution path.
- Every loop skill body contains the three required sections; the bound,
  stop conditions, and gate are in the generated text, not left to the agent.
- Deterministic, lockfile-tracked, byte-stable output.
- `automation` off -> byte-identical output to the current baseline.

## Security Rules

- No execution, launch, scheduling, or iteration by APC.
- No secrets in generated content.
- Loop skill text must not instruct the agent to bypass approval, run
  destructive commands, or continue past the iteration bound.

## Acceptance Criteria

- `automation` pack on -> the five loop skills emitted for Claude and Codex;
  nothing emitted for Tabnine plus an informational note.
- Each emitted loop skill contains the three required sections with the
  hard-coded bound (structurally verified by doctor).
- Skill cross-references appear only when the referenced skill is generated
  for that target; no dangling references in any combination.
- No APC execution path is introduced (execution sentinel).
- `automation` off -> baseline byte-identical.

## Tests

- Golden fixtures: `automation` on for Claude+Codex (all five skills);
  `automation` + Tabnine target (not-supported note, no Tabnine artifact);
  byte-stable.
- Structure table: doctor passes on well-formed skills; fixtures with a
  missing `## Stop Conditions`, empty `## Approval Gate`, or absent
  `## Max Iterations` each produce the WS6-I2 doctor finding.
- Cross-reference matrix: `automation` alone (inline steps, no pointers);
  `automation` + `base` + `review` (pointers present and matching emitted
  skills); dangling-reference check green in all combinations.
- Execution sentinel: compile and doctor spawn no child process.
- No-pack regression: baseline byte-identical.

## TDD Strategy

RED: golden fixture expecting the five skill files and a doctor structure
test against a section-missing fixture fail first. GREEN: mapping-table
amendment + skill bodies (WS6-I1), then the doctor structural check (WS6-I2).

## Issue Plan

- WS6-I1: loop skill definitions + `automation` mapping amendment + emission
  (Claude/Codex, Tabnine note). `ready` (phase-12/002 pack schema landed).
- WS6-I2: doctor structural check for the three required sections.
  `sequenced` after WS6-I1.

## Documentation Updates

- `phase-12/002-skills-pack-schema.md`: mapping table row for `automation`
  updated from "(none; reserved)" to the five loop skills, citing this phase.
- README/CLI docs: the `automation` pack now generates content; what a loop
  skill is and is not (instruction-only).

## Final Review Checklist

- APC execution surface unchanged; text only.
- Bounds, stop conditions, and approval gates are in the generated text and
  structurally enforced by doctor.
- No dangling skill references in any pack combination.
- Tabnine behavior explicit, not silent.
- Deterministic, byte-stable fixtures; baseline unchanged when the pack is
  off.
