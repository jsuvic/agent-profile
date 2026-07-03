# Spec: Doctor Skill Checks

## Status

Verified (amended 2026-05-03)

Originally Verified on 2026-05-02. Amended on 2026-05-03 to scan
`.agents/skills/**/SKILL.md` for Codex (per current official Codex skills docs)
while keeping `.claude/skills/**/SKILL.md` for Claude, and to accept approved
`Use before` trigger wording for final-review skills. The implementation and
tests in `packages/doctor` are updated to match.

## Problem

The MVP roadmap includes generated Codex and Claude workflow skills. Oversized
or vague skill files reduce agent reliability and increase prompt noise.

## Goal

Add local doctor checks for skill size and minimal trigger/use-case guidance.

## Non-Goals

- generating skills
- rewriting skills
- validating third-party marketplace skills
- reading arbitrary source files

## User Flow

1. A user runs `agent-profile doctor`.
2. Doctor scans repo-local `.agents/skills/**/SKILL.md` (Codex) and
   `.claude/skills/**/SKILL.md` (Claude) files when present.
3. Doctor reports oversized or under-specified skills.

## Inputs

- `.agents/skills/**/SKILL.md` (Codex; current official skill path)
- `.claude/skills/**/SKILL.md`

## Outputs

- `LINT-SKILL-*` doctor findings

## Contracts

- Skill checks are warning-only until a skill exceeds the hard 500-line limit.
- Skill line counting is deterministic.
- Doctor only reads `SKILL.md` files under the supported local skill roots.
- The supported Codex skill root is `.agents/skills/`. Doctor does not scan the
  legacy `.codex/skills/` path. Repositories that still use the legacy path
  must migrate skills to `.agents/skills/` to be checked.

## Security Rules

- Do not upload skill contents.
- Do not print skill contents.
- Do not mutate skill files.
- Do not install skills.

## Acceptance Criteria

- skill over 300 lines produces warning `LINT-SKILL-001`
- skill over 500 lines produces error `LINT-SKILL-001`
- skill missing a clear trigger/use-case produces warning `LINT-SKILL-002`
- skill checks are skipped when skill directories are absent
- Codex skills under `.agents/skills/**/SKILL.md` are scanned with the same
  thresholds as Claude skills

## Tests

- 301-line skill produces warning
- 501-line skill produces error
- skill without `Use when`, `Use before`, or `Trigger` language produces
  `LINT-SKILL-002`
- absent skill directories produce no findings
- Codex skill placed under `.agents/skills/` is scanned
- legacy `.codex/skills/` path is not scanned

## Forward Reference: Subagent Checks Are Separate

`docs/specs/phase-11/005-doctor-subagent-checks.md` (Draft, not approved)
defines a parallel doctor check family for subagent artifacts under
`.claude/agents/`, `.codex/agents/`, and `.tabnine/agent/agents/`. Subagent
files are explicitly out of scope for this skill-check spec. Skill roots
remain `.agents/skills` (Codex) and `.claude/skills` (Claude); subagent roots
are owned by Phase 11 using `LINT-SUBAGENT-*` codes.

## Documentation Updates

- `README.md`
- future skill target docs
- `docs/specs/phase-03/004-codex-workflow-skills-target.md` (cross-reference to
  the same `.agents/skills` path)

## Final Review Checklist

- skill roots are scoped to Codex (`.agents/skills`) and Claude
  (`.claude/skills`)
- legacy `.codex/skills` path is not scanned
- line-count thresholds match the plan
- no skill contents are printed
- no skills are installed or mutated

## Phase 12 Amendment (2026-07-02)

Doctor also compares the resolved skill set to generated artifacts:

- `LINT-SKILL-REF-001`: dangling generated-skill reference.
- `LINT-SKILL-PACK-001`: generated skill orphaned from current intent.
- `LINT-SKILL-PACK-002`: selected skill missing from disk.

Findings expose paths and stable metadata only, never skill contents.
