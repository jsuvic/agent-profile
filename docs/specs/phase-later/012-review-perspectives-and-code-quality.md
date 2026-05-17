# Spec: Review Perspectives and Code-Quality Skill Bundle

## Status

Draft for a later phase. Not MVP.

Routed from `docs/research/007-agent-best-practices-review.md` (dimensions 6
and 7). Depends on `phase-later/011-skill-bundled-resources.md`.

## Problem

The MVP ships a single `final-review` skill that collapses every review lens —
spec compliance, contract impact, tests, security regressions, documentation,
deterministic output — into one numbered list. An agent following the skill
makes a single pass and is structurally biased toward stopping when it finds
*any* issue. Real review pipelines apply multiple independent lenses
(security, performance, correctness, accessibility, tests, secrets, bug-hunt)
and gain coverage from running them separately.

Separately, the user's brief lists five code-quality principles (no magic
numbers, single responsibility, extract complex logic, automated
formatting/linting, intent-over-implementation comments) that have no home in
the current generated artifacts. AGENTS.md has Safety Rules but no style
rules; skills do not encode them; doctor does not check for them.

This spec ships the multi-perspective review skills *and* the code-quality
skill as a single bundle because both share the same delivery surface
(generated skills + AGENTS.md style section) and both depend on
`phase-later/011-skill-bundled-resources.md` for their referenced checklists.

## Goal

Add an opt-in `quality` block to `ai-profile.yaml` that, when enabled,
generates:

1. A set of perspective-specific review skills (`review-security`,
   `review-performance`, `review-correctness`, `review-accessibility`,
   `review-tests`, `review-secrets`, `bug-hunter`).
2. A `code-quality` skill encoding the five principles, with referenced
   checklists shipped via `phase-later/011`.
3. A `## Code Quality` section in generated `AGENTS.md` (and the equivalent in
   `CLAUDE.md`) so the agent sees the rules at session start, not only when a
   skill triggers.

## Non-Goals

- shipping language-specific tooling (eslint, prettier, ruff, gofmt) as
  bundled assets — those belong to expanded `phase-later/001-hooks-targets.md`
- generating per-language style guides
- shipping a generic "monitor PR" workflow (out of scope until a separate
  spec defines CI integration)
- generating subagent definitions for the same review lenses — that lands in
  `phase-later/017-subagent-template-library.md`; the exact implementation
  worker plus two-stage review bundle is owned by `phase-13`
- generating Tabnine review skills until Tabnine documents an equivalent
  trigger surface

## Boundary With Phase 10.5 and Phase 13

`docs/specs/phase-10.5/001-tdd-skill-red-green-hardening.md` owns the early
TDD skill hardening work: RED verification, GREEN verification, and testing
anti-pattern guidance in the existing `tdd-change` workflow skill.

This spec keeps ownership of the broader opt-in review-perspective and
code-quality skill bundle.

`docs/specs/phase-13/` owns the delegated implementation workflow: template
references, `implementer`, `spec-reviewer`, `code-quality-reviewer`, explicit
status values, fresh-context prompting, and the parent
`subagent-driven-change` orchestration skill.

## User Flow

```yaml
# ai-profile.yaml (illustrative)
quality:
  enabled: true
  perspectives:
    security: true
    performance: true
    correctness: true
    accessibility: false
    tests: true
    secrets: true
    bugHunt: true
  codeQuality:
    enabled: true
    principles:
      - naming
      - singleResponsibility
      - extractComplexLogic
      - automatedFormatting
      - intentOverImplementation
```

The compiler renders each enabled perspective as a dedicated SKILL.md under
`.claude/skills/` and `.agents/skills/`, with a concise instruction body and
a `references/` checklist for the deep dive. The `code-quality` skill ships
the same way and is linked from a new `## Code Quality` section in generated
`AGENTS.md` and from `CLAUDE.md`.

## Inputs

- `quality` block in `ai-profile.yaml`
- existing skill target contracts (`phase-03/004`, `phase-03/005`)
- existing `AGENTS.md` target contract (`phase-01/004`)
- existing `CLAUDE.md` target contract (`phase-03/003`)
- bundled resources primitive from `phase-later/011`
- `effectivePermissions` for safety wording

## Outputs

- per-client review SKILL.md files for each enabled perspective:
  `review-security`, `review-performance`, `review-correctness`,
  `review-accessibility`, `review-tests`, `review-secrets`, `bug-hunter`
- per-client `code-quality` SKILL.md
- bundled checklist references under each skill's `references/` directory
  (via `phase-later/011`)
- `## Code Quality` section appended to generated `AGENTS.md`
- `## Code Quality` callout in generated `CLAUDE.md` (one short paragraph
  pointing at the skill, in keeping with the existing claude-md target
  contract that the file remains concise)
- doctor findings:
  - `LINT-QUALITY-001` — `quality.codeQuality.enabled: true` without any
    `principles` listed
  - `LINT-QUALITY-002` — review skill description missing trigger language
  - `LINT-QUALITY-003` — `code-quality` skill description fails the existing
    `LINT-SKILL-002` trigger-language check (cross-ref doctor skill checks)

## Contracts

- Quality generation is opt-in. Without `quality.enabled: true`, no review
  perspective skills, no code-quality skill, and no AGENTS.md style section
  are emitted.
- Each enabled perspective produces exactly one SKILL.md per supported
  target. Disabling a perspective removes its file on next compile.
- Skill descriptions must each carry distinct trigger phrases so the agent
  picks the correct lens (e.g. "Use when reviewing for security",
  "Use when reviewing for performance bottlenecks").
- The `code-quality` skill body must encode each principle with its *why*,
  not only a rule statement. (Theory-of-mind reasoning, not heavy `MUST`
  walls.)
- The AGENTS.md style section must not duplicate the full skill body. It
  lists the principles by name and links to the skill.
- Generated skills consume `effectivePermissions` for safety wording.
- Each skill stays below the doctor 300-line warning threshold; references
  carry the deep content.

## Security Rules

- Do not embed literal secrets, environment values, or production endpoints
  in any generated skill or section.
- Do not instruct agents to run shell commands automatically; review skills
  read code, they do not execute it.
- Do not embed CVE lookups, third-party API calls, or vulnerability database
  fetches.
- Do not generate Tabnine review skills until the capability matrix marks
  Tabnine review-skill support as at least `partial-official`.
- Do not write to user-level, admin-level, or marketplace skill locations.

## Acceptance Criteria

- profiles with `quality.enabled: true` and at least one enabled perspective
  generate the corresponding SKILL.md files for Claude and Codex
- profiles without the block produce no review-perspective skills, no
  code-quality skill, and no `## Code Quality` section
- each generated skill description passes `LINT-SKILL-002` (trigger
  language) and is distinct from peer skills
- the `code-quality` skill body covers all five principles with explicit
  *why* statements
- the AGENTS.md style section is generated when at least one principle is
  enabled and remains absent otherwise
- removing a perspective removes its skill on next compile
- every skill stays below the doctor warning threshold
- doctor reports each `LINT-QUALITY-*` rule

## Tests

- golden tests for each perspective skill (Claude and Codex)
- golden test for the code-quality skill (Claude and Codex)
- golden test for the `## Code Quality` AGENTS.md section
- absence test (no `quality` block → no review-perspective skills, no
  code-quality skill, no AGENTS.md style section)
- doctor lint tests for each `LINT-QUALITY-*` rule
- determinism test confirming byte-identical output across runs and OSes
- removal-propagation snapshot test
- negative test confirming no shell execution path or external HTTP fetch
  exists in any generated skill body

## Documentation Updates

- `docs/profile/schema.md` — add `quality` block
- `docs/research/004-best-practices-per-artifact.md` — add review-perspective
  guidance and code-quality skill guidance
- `docs/specs/phase-03/004-codex-workflow-skills-target.md` — cross-reference
  the new skill set
- `docs/specs/phase-03/005-claude-workflow-skills-target.md` — cross-reference
  the new skill set
- `docs/specs/phase-01/004-agents-md-target.md` — cross-reference the
  `## Code Quality` section
- `docs/specs/phase-03/003-claude-md-target.md` — cross-reference the
  `## Code Quality` callout

## Final Review Checklist

- each generated skill has a distinct trigger phrase
- the code-quality skill explains the *why* behind every principle, not
  only the rule
- AGENTS.md style section avoids duplicating skill bodies
- no shell execution, network fetch, or dependency install is implied by
  any generated skill
- Tabnine review-skill support remains gated on capability matrix
  verification
- bundled checklists are loaded only on demand (progressive disclosure via
  `phase-later/011`)
