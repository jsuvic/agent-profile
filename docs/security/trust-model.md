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
lockfiles remain CLI-owned: the UI reads `<root>/ai-profile.lock` to render
resolved model provenance exactly as the generated files carry it, but never
writes it, and an absent, unreadable, or invalid lockfile degrades to "no
retained resolution" rather than failing the page.

`subagentPolicy` is preserved but never edited through the browser. The save
flow reconstructs the candidate profile from form fields only, and the server —
not the client — reinstates the block from the trusted on-disk profile, so the
raw block never round-trips through the browser. The read-only model-policy
table sends only already-resolved presentation values (exact model, lifecycle,
per-surface status, alternatives), and each resolved identifier passes through
the same secret-like redaction applied to the YAML preview, because a resolved
identifier can originate in a user-authored override string.

## Secret Handling

Generated configs must use environment variable references rather than literal
values. Doctor checks should treat literal token-like values in generated files
as violations.

## Network Behavior

Every command runs to completion without network access by default. Dependency
installation is a developer setup action, not something init, compile, or
doctor performs automatically.

Two opt-in network paths exist. Both are off unless explicitly requested in
that invocation, both are refusable, and neither is required for any command to
succeed:

| Path                | How it is requested                                                                     | What it sends                                                              | What it persists |
| ------------------- | --------------------------------------------------------------------------------------- | -------------------------------------------------------------------------- | ---------------- |
| Model availability probe | `init` wizard prompt (defaults to decline), `upgrade --probe-models`, `doctor --models --probe` | A minimal one-shot invocation of the locally installed client CLI, to check whether a resolved model id is usable | Nothing. Results are ephemeral and advisory for that run only. |
| Package update check | `agent-profile upgrade --check-for-updates`                                               | One read-only HTTPS GET for this package's own registry metadata. No credentials, auth headers, or telemetry. | Nothing. It never installs or downloads. |

Declining performs zero network access, proven by tests that run the declined
path under a network sentinel.

The probe is source-free by construction: it runs in a fresh empty temporary
directory outside the repository (removed before the run returns), under an
environment allowlist, with time, output, process, and call-count bounds. It
never sends repository content, credentials, or account data, and its report
carries only closed-set statuses and evidence labels — never raw client output,
client versions, paths, or timestamps. A client with no documented safe one-shot
invocation has no contract row and is honestly reported `unsupported-client`
rather than guessed at.

Model selection itself is not a network feature: catalog resolution is fully
offline and deterministic against versioned catalog data shipped with the
release, so `init`, `compile`, `upgrade`, and `doctor --models` resolve exact
model identifiers, lifecycle, and per-surface capability status with no
provider contact. A probe can only annotate that result; it never changes a
written selection, and probe output is never merged into `ai-profile.yaml` or
`ai-profile.lock`.

The local browser UI never probes and never contacts a provider. It renders the
same resolved model-policy table read-only, so it cannot display live account,
quota, or entitlement data — it has no code path that could obtain any.

Any future hosted feature requires:

- an approved spec
- explicit opt-in
- clear data inventory
- threat model update
- tests for local-only defaults

## Hosted Preset Tokens

Phase 9 adds only the local CLI consumer for hosted preset tokens. The hosted
builder UI and signing endpoint are deferred, but the trust boundary is fixed:
the builder may collect preset intent only, and the CLI verifies the resulting
token offline.

Preset token payloads may contain:

- target client choices for Tabnine, Codex, and Claude
- safety mode and sandbox preference
- SDD/TDD/final-review workflow booleans
- filesystem, shell, dependency-install, and external-network permission
  preferences
- bounded preset metadata such as a slug-like preset id and optional label

Preset token payloads must not contain source files, generated artifacts,
repository paths, stack detection results, `.env` keys or values, credentials,
environment variables, arbitrary instructions, secret permission grants, or
production permission grants.

`agent-profile init --preset <token>` performs zero network calls. It does not
fetch token URLs, resolve opaque identifiers, send telemetry, upload repository
metadata, upload source code, upload generated artifacts, or upload secrets.
After the token is verified, stack detection still reads only the local
allowlisted metadata files used by normal init, and the token cannot set
`stack.*`, `profile.name`, or `profile.description`.

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
