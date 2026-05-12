# Trust Model

Agent Profile Compiler is designed for local-first operation.

## Trusted Boundary

The trusted boundary is the user's local machine and the repository being
processed. The MVP should not require a hosted service, login, remote execution,
or source upload.

## Assets To Protect

- repository source code
- secret files such as `.env`
- tokens and credentials in local environment variables
- generated agent instructions
- MCP server configuration
- project architecture and dependency information

## Security Rules

The tool must never:

- upload source code by default
- upload secrets
- write literal tokens into generated config files
- execute shell commands during init or compile without explicit permission
- install dependencies during init or compile without explicit permission
- modify `.gitignore` without showing a diff or asking approval

The tool should warn about:

- `.env` files that are not ignored
- hardcoded secret-like values in instruction files
- generated configs containing literal tokens
- broad filesystem access in MCP config
- shell tools configured with auto-approval
- generated files or lockfiles that drift from `ai-profile.yaml`
- runtime client permission state that cannot be verified from project files
- generated artifact secret-like literals
- oversized or vague local skill files
- obvious generated-instruction contradictions

## First-Write Protection

Write-capable commands default to dry-run. `agent-profile compile --write`
refuses to replace an existing generated-path file unless `ai-profile.lock`
proves the file is compiler-owned and still matches the recorded hash. Users
must pass `--force` to replace protected existing files after reviewing the
planned write.

## Local UI Server

`agent-profile ui` serves the live project UI on loopback only. Write-capable
browser routes are limited to the source profile save flow:

- `GET /api/profile` reads `<root>/ai-profile.yaml` and issues a CSRF token.
- `POST /api/profile/plan` validates a structured candidate profile, re-reads
  the current on-disk bytes, checks the base ETag, and returns a plain-text diff
  plus a short-lived server-side plan token.
- `POST /api/profile/apply` consumes the plan token, re-reads the file,
  re-validates the candidate, verifies the candidate hash, and writes only
  `<root>/ai-profile.yaml`.

Every state-changing request must come from the same loopback host and port as
the bound UI server and must include a valid CSRF token. The UI server does not
enable CORS and does not expose generic file, shell, install, compile, or init
endpoints.

Browser profile saves do not use generated-file first-write protection because
they write the source profile, not generated artifacts. Generated artifacts and
lockfiles remain CLI-owned.

## Secret Handling

Generated configs must use environment variable references rather than literal
values. Doctor checks should treat literal token-like values in generated files
as violations.

## Network Behavior

MVP commands must run without network access. Dependency installation is a
developer setup action, not something init, compile, or doctor performs
automatically.

Any future hosted feature requires:

- an approved spec
- explicit opt-in
- clear data inventory
- threat model update
- tests for local-only defaults

## MCP Prompt Injection And Tool Poisoning

Third-party MCP servers can introduce prompt-injection or tool-poisoning risk
through tool descriptions, tool output, and runtime behavior that the
compiler cannot inspect. The compiler treats this as a known limitation and
stays on the safer side of the boundary.

The compiler can:

- avoid auto-installing third-party MCP servers
- require allowlists later (out of MVP scope)
- record MCP tool schema hashes in the lockfile later (out of MVP scope)
- warn about unknown or unconfigured tools through doctor checks
- keep risky permissions defaulted to ask or deny in `effectivePermissions`
- refuse to embed literal secrets or production credentials in generated MCP
  configuration

The compiler cannot:

- guarantee third-party MCP tool behavior at runtime
- fully prevent prompt injection inside the client or MCP tool execution
- enforce client-side approval flows or sandbox state from project files
- audit network behavior of MCP servers the user installs

Doctor and target specs may surface MCP risk findings, but actual runtime
enforcement remains the responsibility of Tabnine, Codex, Claude, or the
surrounding sandbox.
