# Research: Best Practices Per Artifact

## `ai-profile.yaml`

- Keep the schema strict.
- Reject unknown fields by default.
- Use explicit versioning.
- Avoid implicit defaults unless a spec defines them.

## `ai-profile.lock`

- Treat the lockfile as a drift-detection artifact.
- Store hashes and metadata, not source contents.
- Sort paths and entries deterministically.
- Keep lockfile updates reviewable.

## Generated `AGENTS.md`

- Generate from profile data only.
- Preserve local-first and no-secret rules.
- Reflect enabled clients accurately.
- Do not mention unsupported targets unless a spec adds them.

## Generated Tabnine Guidelines

- Use `.tabnine/guidelines/` project files.
- Split guidelines by concern instead of creating one large file.
- Keep each guideline short and task-specific.
- Include generated-file headers.
- Preserve ask/deny behavior for mutating, shell, dependency, and network work.
- Never instruct source upload, secret reads, production access, auto-install,
  or unsafe auto-approval.

## Generated Tabnine MCP Config

- Use `.tabnine/mcp_servers.json`.
- Emit an empty `mcpServers` object until the profile schema supports reviewed
  MCP server declarations.
- Do not invent undocumented per-server approval keys.
- Use environment variable names only when future specs add server entries.

## Generated Codex Config

- Use `.codex/config.toml`.
- Keep guarded output sandboxed and approval-gated.
- Emit `allow_login_shell = false` as a tighter guarded default.
- Never emit `sandbox_mode = "danger-full-access"`.
- Never emit `approval_policy = "never"` as a project default.
- Use exact TOML formatting in golden tests: one space around `=`, no trailing
  whitespace, table order pinned, and exactly one trailing newline.

## Generated Claude Settings

- Use `.claude/settings.json` for shared project settings.
- Use `.mcp.json` for project MCP servers.
- Never generate `bypassPermissions` as a project default.
- Set bypass and auto-mode guards to `"disable"` for guarded output.
- Account for deny -> ask -> allow rule precedence.
- Account for merged arrays and sandbox cross-wiring when doctor checks drift.
- Emit empty `mcpServers` until reviewed MCP declarations exist in the profile
  schema.

## Generated Skills

- Keep skills task-specific.
- MVP skill set is `sdd-change`, `tdd-change`, `final-review`, and
  `grill-change` (the Phase 17 pre-spec clarification skill, generated when
  `workflow.sdd` is enabled).
- Generate Codex repository skills under `.agents/skills/<skill-name>/SKILL.md`.
- Generate Claude project skills under `.claude/skills/<skill-name>/SKILL.md`.
- Prefer concise action rules over large contextual essays.
- Avoid duplicating full repository documentation inside skills.
- For behavior changes, require explicit RED proof before implementation and
  GREEN proof after the minimal fix. Generated TDD guidance should ask for the
  command, expected failure reason, passing rerun, and any approved exception.
- Testing guidance should warn against asserting on mocks instead of behavior,
  adding production APIs only for tests, broad mocking without understanding
  side effects, and partial test doubles that do not match consumed data
  shapes.
- Delegation workflow skills should require fresh task context for every
  subagent prompt and should run spec-compliance review before code-quality
  review.
- Do not emit `allowed-tools`, dynamic shell context injection, scripts,
  plugins, subagents, global/user/admin skills, or marketplace artifacts in the
  MVP skills.

## Generated Subagents

- Treat subagent definitions as project-local generated artifacts owned by the
  lockfile.
- Prefer explicit template references or full inline definitions over implicit
  role creation.
- Keep reviewer subagents read-only unless an approved spec says otherwise.
- Use workspace-write only for implementation workers and only when
  `effectivePermissions` allows workspace writes.
- Template descriptions should state trigger conditions, expected inputs,
  output contract, edge cases, and tool surface.
- Implementation workers should report one of `DONE`, `DONE_WITH_CONCERNS`,
  `BLOCKED`, or `NEEDS_CONTEXT`.
- Review workflows should verify actual changed files against the spec before
  doing maintainability review.
- Fresh-context prompting is required: parent prompts should include the full
  task text, relevant spec excerpts, non-goals, acceptance criteria, file
  ownership, constraints, expected tests, and command limits.
- Do not generate subagents that install dependencies, read secrets, contact
  production systems, upload source, commit, push, or open pull requests unless
  a later approved spec explicitly owns that behavior.

## Generated MCP Config

- Use environment variable references only.
- Never write literal tokens.
- Avoid broad filesystem access.
- Mutating or shell-capable tools must default to ask/deny.

## Golden Fixtures

- Compare generated output byte-for-byte.
- Require intentional fixture updates.
- Use stable fixture traversal order.
- Keep fixture data free of secrets.
