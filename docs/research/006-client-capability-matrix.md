# Client Capability Matrix

This matrix tracks client capability assumptions for planning. It is not an
implementation source of truth by itself. Target specs must re-verify exact
keys, paths, and behavior from official documentation before implementation.

Confidence labels:

- `confirmed-official`: verified in official client documentation.
- `partial-official`: official docs confirm part of the capability, with
  limits.
- `unknown`: not verified from official docs.
- `not-supported`: official docs or target behavior indicate no support.

| Capability                       | Codex                                 | Claude Code                          | Tabnine                             | MVP support                  | Later support              | Confidence                                                      | Source needed before implementation                                      |
| -------------------------------- | ------------------------------------- | ------------------------------------ | ----------------------------------- | ---------------------------- | -------------------------- | --------------------------------------------------------------- | ------------------------------------------------------------------------ |
| Project instructions             | AGENTS.md                             | CLAUDE.md/settings                   | Guidelines                          | yes                          | yes                        | confirmed-official for all three                                | Re-verify target instruction paths and merge behavior.                   |
| Global/user instructions         | memories/global config                | user settings/memory-like guidance   | enterprise/admin controls may apply | no                           | possible explicit opt-in   | partial-official; Tabnine governance details need verification  | Official docs for global/user scope and precedence per target.           |
| Memories                         | supported                             | supported memory-like/user guidance  | unknown                             | no                           | possible explicit opt-in   | confirmed-official for Codex/Claude; unknown for Tabnine        | Official docs for memory storage, scope, and write behavior.             |
| Skills                           | supported                             | supported                            | unknown equivalent                  | workflow skills where target | richer skills later        | confirmed-official for Codex/Claude; unknown for Tabnine        | Official docs for skill file paths, format, and activation semantics.    |
| MCP config                       | supported                             | supported                            | supported                           | basic config-only            | richer local MCP config    | confirmed-official for all three                                | Official docs for exact config keys and allowed transports.              |
| Runtime permissions/safety modes | approval/sandbox configuration        | modes plus allow/ask/deny settings   | native/MCP tool permissions         | intent plus doctor guidance  | richer checks              | confirmed-official for all three                                | Official docs for current permission names and precedence.               |
| Hooks                            | supported                             | supported                            | unknown                             | no                           | target-specific specs      | confirmed-official for Codex/Claude; unknown for Tabnine        | Official hook docs, execution model, path rules, and security controls.  |
| Subagents                        | supported                             | supported                            | unknown                             | no                           | target-specific specs      | confirmed-official for Codex/Claude; unknown for Tabnine        | Official subagent docs, file format, and invocation semantics.           |
| Plugins                          | supported                             | supported                            | unknown                             | no                           | target-specific specs      | confirmed-official for Codex/Claude; unknown for Tabnine        | Official plugin packaging docs, install scope, and distribution rules.   |
| Team/admin governance            | unknown/partial depending environment | managed settings/enterprise controls | enterprise/admin controls           | doctor guidance only         | policy packs/private later | partial-official; target-specific governance needs verification | Official enterprise/admin docs and whether project config can detect it. |

Rules:

- Do not fabricate support. Unknown support remains `unknown` until official
  docs confirm it.
- Unsupported capabilities must be reported by target adapters instead of
  silently ignored.
- Project-local output is the default. Global/user-level writes require
  explicit opt-in and a dedicated spec.
