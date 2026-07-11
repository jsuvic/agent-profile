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

## Phase 29 Tabnine Skills Layer (ADR 0013)

Tabnine CLI now discovers Agent Skills from the shared `.agents/skills/`
convention - the same `SKILL.md` format APC already emits for Codex. Setups
with Tabnine enabled therefore emit the instruction-only workflow skills
(`grill-change`, `request-to-spec-issues`, `sdd-change`, `tdd-change`,
`final-review`, plus the selected review, specialist, `mcp-fit-check`, and
phase-22 loop skills) to `.agents/skills/`, one file per skill. Enabling
Tabnine alongside Codex adds no new file: the shared convention renders the
same bytes.

- Delegation-dependent skills (`subagent-driven-change`, `implement-next`)
  require a delegation-capable client (Claude or Codex). A Tabnine-only setup
  omits them and receives an informational compile note.
- No Tabnine-proprietary copy is ever written; nothing is emitted under
  `.tabnine/agent/`, and Tabnine `settings.json` is never touched.
- Guidelines remain the always-read layer; no workflow procedure is mirrored
  into a guideline.
- Agent Skills discovery depends on the installed Tabnine CLI, so the generated
  compile notes carry one caveat: it requires a current Tabnine CLI generation.
