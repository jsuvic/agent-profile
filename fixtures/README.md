# Fixtures

Schema and golden fixtures live here.

Current schema fixture:

```text
minimal-valid/
  ai-profile.yaml
  expected/
    AGENTS.md
    CLAUDE.md
    ai-profile.lock
    .agents/
      skills/
        final-review/
          SKILL.md
        sdd-change/
          SKILL.md
        tdd-change/
          SKILL.md
    .tabnine/
      guidelines/
        00-general-agent-behavior.md
        10-sdd-workflow.md
        20-tdd-workflow.md
        30-stack-typescript-svelte.md
        40-stack-java-spring.md
        50-testing-playwright-junit.md
        90-final-review.md
      mcp_servers.json
    .codex/
      config.toml
    .claude/
      settings.json
      skills/
        final-review/
          SKILL.md
        sdd-change/
          SKILL.md
        tdd-change/
          SKILL.md
    .mcp.json
preset-only/
  ai-profile.yaml
partial-overrides/
  ai-profile.yaml
react-typescript/
  ai-profile.yaml
  expected/  (phase-10 React stack guidance fixture)
code-review-enabled/
  ai-profile.yaml
  expected/  (phase-10 workflow.codeReview fixture)
refactoring-enabled/
  ai-profile.yaml
  expected/  (phase-10 workflow.refactoring fixture)
documentation-enabled/
  ai-profile.yaml
  expected/  (phase-10 workflow.documentation fixture)
subagents-enabled/
  ai-profile.yaml
  expected/  (phase-11 subagent generation fixture)
    .claude/agents/code-reviewer.md
    .codex/agents/code-reviewer.toml
    .codex/config.toml  (includes appended [agents] block)
    .tabnine/agent/agents/code-reviewer.md
```

Planned first compiler fixture:

```text
svelte-java-playwright/
  ai-profile.yaml
  expected/
    AGENTS.md
```
