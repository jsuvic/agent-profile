# Current Agent Capabilities (2026-07)

## Status

Verified against official product documentation on 2026-07-02. This matrix is
evidence for target specs; it is not permission to generate a capability by
itself.

Confidence values are `confirmed-official`, `partial-official`, `unknown`, and
`not-supported`. “Project” and “global” state whether APC could generate the
surface at that scope without claiming the client runtime is enforceable.

## Capability Matrix

| Capability                           | Codex support                                           | Claude Code support                                                 | Tabnine support                                                                                             | Official sources                                                                                                                                                                                                                                                                                                                     | Verified   | Confidence                                                    | Project generation                           | Global generation                         | Recommended compiler action                                      |
| ------------------------------------ | ------------------------------------------------------- | ------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ---------- | ------------------------------------------------------------- | -------------------------------------------- | ----------------------------------------- | ---------------------------------------------------------------- |
| Project instructions                 | `AGENTS.md` discovery and precedence                    | `CLAUDE.md`, `.claude/CLAUDE.md`, rules, and imports                | Project `.tabnine/guidelines/*.md`                                                                          | [Codex AGENTS.md](https://developers.openai.com/codex/guides/agents-md); [Claude memory/instructions](https://code.claude.com/docs/en/memory); [Tabnine guidelines](https://docs.tabnine.com/main/getting-started/tabnine-agent/guidelines)                                                                                          | 2026-07-02 | all `confirmed-official`                                      | yes: MVP generate                            | no by default                             | MVP generate                                                     |
| Global/user instructions             | Codex-home `AGENTS.md`                                  | user `~/.claude/CLAUDE.md` and managed policy                       | home-level guidelines and admin guidelines                                                                  | [Codex AGENTS.md](https://developers.openai.com/codex/guides/agents-md); [Claude memory/instructions](https://code.claude.com/docs/en/memory); [Tabnine guidelines](https://docs.tabnine.com/main/getting-started/tabnine-agent/guidelines)                                                                                          | 2026-07-02 | all `confirmed-official`                                      | n/a                                          | technically possible, intentionally gated | document only                                                    |
| Memory                               | Memories/Chronicle are documented                       | `CLAUDE.md` plus auto memory                                        | no equivalent project-local memory contract verified                                                        | [Codex memories](https://developers.openai.com/codex/concepts/memories); [Claude memory](https://code.claude.com/docs/en/memory)                                                                                                                                                                                                     | 2026-07-02 | Codex/Claude `confirmed-official`; Tabnine `unknown`          | document only                                | no                                        | document only                                                    |
| Skills                               | project/user/admin skills                               | project/user/plugin skills                                          | CLI skills announced, but no stable project-local IDE skill-file contract verified                          | [Codex skills](https://developers.openai.com/codex/skills); [Claude skills](https://code.claude.com/docs/en/skills); [Tabnine release notes](https://docs.tabnine.com/main/administering-tabnine/release-notes)                                                                                                                      | 2026-07-02 | Codex/Claude `confirmed-official`; Tabnine `partial-official` | yes for Codex/Claude; guidelines for Tabnine | no by default                             | MVP generate on skill-capable targets; Tabnine guideline mapping |
| MCP config                           | local and remote MCP configuration                      | local/project/user MCP configuration                                | IDE MCP config and permissions                                                                              | [Codex MCP](https://developers.openai.com/codex/mcp); [Claude MCP](https://code.claude.com/docs/en/mcp); [Tabnine agent settings](https://docs.tabnine.com/main/getting-started/tabnine-agent/agent-settings)                                                                                                                        | 2026-07-02 | all `confirmed-official`                                      | yes, config-only where separately specced    | no by default                             | MVP config-only / later opt-in                                   |
| Runtime permissions and safety modes | approval policy and sandbox configuration               | permission modes, settings, and sandbox controls                    | Auto-approve, Ask first, Disable per native/MCP tool                                                        | [Codex permissions](https://developers.openai.com/codex/permissions); [Claude settings](https://code.claude.com/docs/en/settings); [Tabnine agent settings](https://docs.tabnine.com/main/getting-started/tabnine-agent/agent-settings)                                                                                              | 2026-07-02 | all `confirmed-official`                                      | intent/config possible                       | managed/user state not controlled         | generate intent plus doctor checks                               |
| Hooks                                | project hooks                                           | project/user/plugin hooks                                           | no stable official project hook format verified                                                             | [Codex hooks](https://developers.openai.com/codex/hooks); [Claude hooks](https://code.claude.com/docs/en/hooks)                                                                                                                                                                                                                      | 2026-07-02 | Codex/Claude `confirmed-official`; Tabnine `unknown`          | later, opt-in                                | no                                        | later generate                                                   |
| Subagents                            | project custom agents                                   | project/user/plugin subagents                                       | CLI subagents announced; IDE project-local format and confirmation behavior remain insufficiently specified | [Codex subagents](https://developers.openai.com/codex/subagents); [Claude subagents](https://code.claude.com/docs/en/sub-agents); [Tabnine release notes](https://docs.tabnine.com/main/administering-tabnine/release-notes)                                                                                                         | 2026-07-02 | Codex/Claude `confirmed-official`; Tabnine `partial-official` | yes for Codex/Claude definitions only        | no                                        | MVP generate for Codex/Claude; unsupported warning for Tabnine   |
| Plugins                              | plugin bundles documented                               | plugin bundles documented                                           | no equivalent plugin packaging contract verified                                                            | [Codex plugins](https://developers.openai.com/codex/plugins); [Claude plugins](https://code.claude.com/docs/en/plugins)                                                                                                                                                                                                              | 2026-07-02 | Codex/Claude `confirmed-official`; Tabnine `unknown`          | technically possible, out of MVP             | no                                        | do not support in MVP                                            |
| Slash/custom commands                | CLI and IDE slash commands                              | skills replace custom slash commands and remain slash-invokable     | predefined slash commands documented in release notes                                                       | [Codex CLI slash commands](https://developers.openai.com/codex/cli/slash-commands); [Claude skills](https://code.claude.com/docs/en/skills); [Tabnine release notes](https://docs.tabnine.com/main/administering-tabnine/release-notes)                                                                                              | 2026-07-02 | Codex/Claude `confirmed-official`; Tabnine `partial-official` | skills only in Phase 12                      | no                                        | generate skills, not raw commands                                |
| Loop/batch workflows                 | workflows, non-interactive mode, and iteration examples | bounded non-interactive turns and skill workflows                   | no project-local loop contract verified                                                                     | [Codex workflows](https://developers.openai.com/codex/concepts/workflows); [Codex non-interactive mode](https://developers.openai.com/codex/noninteractive); [Claude CLI](https://code.claude.com/docs/en/cli-reference)                                                                                                             | 2026-07-02 | Codex/Claude `partial-official`; Tabnine `unknown`            | instruction-only later                       | no                                        | later generate as bounded skills                                 |
| Admin/team governance                | governance and managed configuration                    | managed settings and managed instructions                           | admin guidelines, MCP governance, and native-tool governance                                                | [Codex governance](https://developers.openai.com/codex/enterprise/governance); [Claude settings](https://code.claude.com/docs/en/settings); [Tabnine guidelines](https://docs.tabnine.com/main/getting-started/tabnine-agent/guidelines); [Tabnine release notes](https://docs.tabnine.com/main/administering-tabnine/release-notes) | 2026-07-02 | all `confirmed-official`                                      | project output only                          | no managed writes                         | doctor/document only                                             |
| Import/migration                     | import-to-Codex flow                                    | `/init` reads existing agent configs and proposes reviewable output | coaching-guideline CSV import documented; no general profile migration contract                             | [Import to Codex](https://developers.openai.com/codex/import); [Claude memory/instructions](https://code.claude.com/docs/en/memory); [Tabnine coaching guidelines](https://docs.tabnine.com/main/getting-started/context-engine/admin-console/coaching-guidelines-v)                                                                 | 2026-07-02 | Codex/Claude `confirmed-official`; Tabnine `partial-official` | local import analysis possible               | no                                        | document / later reviewed import                                 |

## Phase 12 Decision

- Generate project-local skills for Codex and Claude.
- Map umbrella review intent to one Tabnine guideline; do not fan specialist
  reviews out into Tabnine guidelines.
- Generate reviewer subagent definition files for Codex and Claude only, behind
  explicit `reviewer-subagents` intent.
- Keep hooks, plugins, memory writes, loop execution, global writes, automatic
  installation, and remote/hosted execution outside Phase 12.
- Treat Tabnine CLI skills/subagents as `partial-official`: official release
  notes establish the features, but not a stable project-local format and
  safety contract suitable for APC generation.

## Phase 21 Decision (advisory hooks, re-verified 2026-07-04)

- Generate project-local advisory hooks for Claude inside the generated
  `.claude/settings.json`. The verified Claude event list (from
  [Claude hooks reference](https://code.claude.com/docs/en/hooks),
  2026-07-04) is: `SessionStart`, `Setup`, `InstructionsLoaded`,
  `UserPromptSubmit`, `UserPromptExpansion`, `MessageDisplay`, `PreToolUse`,
  `PermissionRequest`, `PostToolUse`, `PostToolUseFailure`, `PostToolBatch`,
  `PermissionDenied`, `Notification`, `SubagentStart`, `SubagentStop`,
  `TaskCreated`, `TaskCompleted`, `Stop`, `StopFailure`, `TeammateIdle`,
  `ConfigChange`, `CwdChanged`, `FileChanged`, `WorktreeCreate`,
  `WorktreeRemove`, `PreCompact`, `PostCompact`, `SessionEnd`,
  `Elicitation`, `ElicitationResult`. Shell-form hook commands run via
  `sh -c` on macOS/Linux, Git Bash on Windows, or PowerShell on Windows when
  Git Bash is not installed; pinned commands must parse in all three.
- Generate project-local advisory hooks for Codex in `.codex/hooks.json`
  (Codex discovers `hooks.json` or inline `[hooks]` config.toml tables next
  to active config layers; one representation per layer is recommended). The
  verified Codex event list (from
  [Codex hooks documentation](https://developers.openai.com/codex/hooks),
  2026-07-04) is: `SessionStart`, `UserPromptSubmit`, `PreToolUse`,
  `PermissionRequest`, `PostToolUse`, `SubagentStart`, `SubagentStop`,
  `Stop`, `PreCompact`, `PostCompact`. Handlers support the documented
  `commandWindows` Windows-only override, which APC pins alongside the POSIX
  `command`. Project-local Codex hooks load only when the project `.codex/`
  layer is trusted, and non-managed command hooks must be reviewed and
  trusted (`/hooks`) before they run.
- Tabnine hook generation stays disabled (`unknown` support); `compile`
  reports a not-supported note.

## Verification Notes

- Official product documentation and official release notes are the only proof
  sources in this document.
- Client support does not imply APC generation. Every generated surface still
  requires an approved schema and target spec.
- Runtime/user/managed state remains not verifiable from project files unless a
  target spec explicitly proves otherwise.
