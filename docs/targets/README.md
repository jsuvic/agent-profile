# Targets

Target-specific documentation will be added as each compiler target is
implemented.

Planned target docs:

- `tabnine.md`
- `codex.md`
- `claude.md`

## Phase 12 Capability Mapping

| Neutral intent                     | Codex                                   | Claude                                  | Tabnine                                 |
| ---------------------------------- | --------------------------------------- | --------------------------------------- | --------------------------------------- |
| `review`                           | `.agents/skills/review-change/SKILL.md` | `.claude/skills/review-change/SKILL.md` | `.tabnine/guidelines/60-code-review.md` |
| `advanced-review`                  | four specialist skills                  | four specialist skills                  | no specialist fan-out                   |
| `mcp-recommendations`              | `mcp-fit-check` skill                   | `mcp-fit-check` skill                   | no generated skill                      |
| subagent pack `reviewer-subagents` | four `.codex/agents/*.toml` files       | four `.claude/agents/*.md` files        | unsupported in Phase 12                 |

All paths are project-local, deterministic, and lockfile-tracked. The
`mcp-recommendations` pack is advisory only and does not generate MCP config.
