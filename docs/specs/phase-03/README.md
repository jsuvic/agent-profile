# Phase 3 Spec Map

## Status

Map updated on 2026-05-03. Specs `001` through `005` are Verified.

## Purpose

Phase 3 covers Codex and Claude targets. The config, Claude instruction, and
workflow skill targets are verified ahead of Phase 6 local UI work.

## Review Order

1. `001-codex-config-target.md`
2. `002-claude-config-target.md`
3. `003-claude-md-target.md`
4. `004-codex-workflow-skills-target.md`
5. `005-claude-workflow-skills-target.md`

## Phase 6 UI Gate

Phase 6 UI must consume the verified Phase 3 target contracts instead of
defining target behavior itself:

- `003-claude-md-target.md` - Verified 2026-05-03
- `004-codex-workflow-skills-target.md` - Verified 2026-05-03
- `005-claude-workflow-skills-target.md` - Verified 2026-05-03

## Doctor Path Amendment

Current official Codex docs use `.agents/skills`, not the older local
`.codex/skills` path. The doctor skill-check spec
(`phase-04/006-doctor-skill-checks.md`) and implementation were amended on
2026-05-03 to scan `.agents/skills/**/SKILL.md` for Codex skill hygiene while
keeping `.claude/skills/**/SKILL.md` for Claude. The amended doctor spec is
Verified after the 2026-05-03 test run against the updated implementation.
