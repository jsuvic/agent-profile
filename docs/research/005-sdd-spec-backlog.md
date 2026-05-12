# Research: SDD Spec Backlog

## Phase 0.5

- ADR 0002: risk modes and permission model
- ADR 0003: SDD artifact and knowledge model

## Phase 1

- `001-profile-schema-v1.md`
- `002-lockfile-v1.md`
- `003-compiler-determinism.md`
- `004-agents-md-target.md`
- `005-golden-test-harness.md`

## Phase 2

- Tabnine guidelines target
- `002-tabnine-mcp-config-target.md`
- Tabnine target documentation
- first full fixture using `ai-profile.lock`

## Phase 3

- `001-codex-config-target.md`
- `002-claude-config-target.md`
- `003-claude-md-target.md`
- `004-codex-workflow-skills-target.md`
- `005-claude-workflow-skills-target.md`
- Codex and Claude target documentation

## Phase 4

- doctor missing-file checks
- doctor drift checks using `ai-profile.lock`
- doctor permission mode checks against `safety.mode`
- doctor secret-like literal checks
- doctor unsafe permission checks
- CI-friendly doctor output

## Later

- init command and stack detection
  - acceptance criteria must require showing a diff and asking approval before
    modifying `.gitignore`
- optional `.sdlc` scaffold for repo-local SDD artifacts
- local knowledge tool or MCP over repo-local SDD artifacts
- importer from existing agent files
- local UI
- optional MCP scaffold
- team/profile registry exploration
