# Spec: MCP Server Declaration Schema

## Status

Draft for a later phase. Not MVP.

## Problem

The verified Tabnine MCP target (`phase-02/002`) emits `{"mcpServers": {}}`
because the MVP profile schema does not yet define MCP server declarations
and the compiler must not auto-install or auto-enable third-party MCP
servers. Codex and Claude have equivalent MCP surfaces but no schema input
either. Users who want to wire SonarQube, GitHub, a private docs server,
or similar MCP servers into their generated configs currently have to
hand-edit the JSON or TOML output, which breaks the determinism contract
and the safety posture (no literal tokens, no production access by
default).

This spec is the schema and safety foundation. SonarQube and other
specific MCP servers are worked examples that depend on this spec
(`phase-later/009`).

## Goal

Add a reference-only `mcp.servers` block to `ai-profile.yaml`. The
compiler renders these declarations into the appropriate per-client MCP
config artifacts (`.tabnine/mcp_servers.json`, `.codex/config.toml`,
`.claude/...`) deterministically, with no literal credential values and
no auto-install behavior. Doctor extends with checks specific to MCP
declarations.

## Non-Goals

- installing, fetching, or running MCP servers during compile or doctor
- storing credential values in the profile, lockfile, or any artifact
- bundling MCP server binaries or container images
- registry-based MCP discovery or installation
- hosted MCP gateway support
- changing Tabnine, Codex, or Claude IDE runtime settings
- supporting transports beyond what each target officially documents

## User Flow

```yaml
# ai-profile.yaml (illustrative)
mcp:
  servers:
    - name: example
      transport: stdio          # stdio | http | sse (subject to target support)
      runtime: docker           # docker | npx | local
      image: example/mcp@sha256:abc...    # required when runtime: docker
      readOnly: true
      env:
        EXAMPLE_TOKEN:
          from: env             # references OS environment, never inlined
        EXAMPLE_URL:
          value: https://example.invalid
      clients: [tabnine, codex, claude]   # which targets receive this server
```

`agent-profile compile --dry-run` previews the rendered server entries in
each target's MCP config. `--write` produces them. Doctor flags literal
tokens, missing pinned digests when policy requires them, missing
client-target support, and unresolved env references.

## Inputs

- `mcp.servers` block in `ai-profile.yaml`
- `effectivePermissions` (existing primitive)
- per-target MCP rendering rules (this spec + per-target adapter docs)
- shared env-reference primitive from `phase-later/006-secrets-and-memory-integration.md`

## Outputs

- per-target MCP config entries rendered deterministically:
  - `.tabnine/mcp_servers.json`
  - Codex MCP block in `.codex/config.toml`
  - Claude MCP config in the documented Claude path
- doctor findings for:
  - literal token or password material in any server entry
  - env reference whose name is not declared in `secrets` (cross-check
    with spec `006`)
  - docker runtime without a pinned digest when policy requires pinning
  - `readOnly: false` in a safety mode that disallows it
  - target listed in `clients` that does not support MCP
  - duplicate server names
- lockfile entry recording the server identity (name, transport, runtime,
  image digest, env reference names) but **never** any resolved value

## Contracts

- The compiler must never read, fetch, or transmit credential values.
- Env references must use the same primitive defined in `006`; this spec
  does not introduce a parallel one.
- Docker runtime entries must require a digest pin (`@sha256:...`) when
  `safety.mode` is `restricted` or stricter; relaxed modes may allow
  `:tag` but must produce a doctor warning. Mutable references such as
  `--pull=always` must be rejected.
- `readOnly` defaults to `true`. Setting it to `false` requires an
  explicit override and a doctor info finding.
- `clients` defaults to the set of clients that have `mcp.enabled: true`
  in the profile; unsupported clients in `clients` produce a doctor
  error.
- Generated output is deterministic across runs and operating systems.
- The compiler must not introduce server entries that the user did not
  declare (no auto-install, no implicit defaults).
- Removing a server from the profile must remove it from the next
  compile output cleanly.

## Security Rules

- Do not embed credential values in any artifact.
- Do not invoke `docker`, `npx`, or any MCP runtime during compile or
  doctor.
- Do not fetch container images, npm packages, or remote configuration.
- Do not log resolved environment values.
- Reject any server entry that includes a string matching a known
  literal-secret pattern (AWS key, JWT, private key, OAuth token,
  bearer token, dotenv-style `=...` with high-entropy value).
- Reject `--pull=always` or other mutable-image directives in docker
  args.
- Refuse to render an MCP entry for a client that does not support MCP
  per the capability matrix.
- Network-backed transports (`http`, `sse`) must require explicit
  opt-in and must not be the default.

## Acceptance Criteria

- profiles with `mcp.servers` declarations render deterministic entries
  in each enabled client target
- profiles without the block produce no MCP entries and no warnings
  (existing `{"mcpServers": {}}` and equivalent behavior preserved)
- doctor flags every rule in Security Rules and Contracts
- the lockfile records server identity but contains zero credential
  material under any input
- removing a server propagates cleanly on the next compile
- env references resolve only through the shared `006` primitive

## Tests

- golden tests for Tabnine, Codex, and Claude MCP rendering with at
  least one stdio + docker server, one stdio + npx server, and a
  declared-but-unsupported-client case
- absence test (no `mcp.servers` → existing behavior unchanged)
- doctor literal-secret rejection tests across known patterns
- doctor unresolved env-reference tests
- doctor unpinned docker digest tests by safety mode
- doctor mutable-pull (`--pull=always`) rejection test
- doctor `readOnly: false` info-finding test
- removal-propagation snapshot test
- negative tests confirming no runtime invocation during compile or
  doctor

## Documentation Updates

- `docs/profile/schema.md` — add `mcp.servers` block
- `docs/targets/tabnine.md`, `docs/targets/codex.md`,
  `docs/targets/claude.md` — document MCP rendering surface per target
- `docs/security/secret-handling.md` — extend with MCP env-reference
  cross-checks
- target capability matrix — add per-target MCP transport support
- cross-reference `phase-later/006-secrets-and-memory-integration.md`

## Final Review Checklist

- no credential value is ever read, fetched, logged, or rendered
- env reference primitive is shared with spec `006`, not duplicated
- docker entries require pinned digests in restricted safety modes
- `--pull=always` and mutable image references are rejected
- network transports require explicit opt-in
- per-target rendering is deterministic and golden-tested
- backward compatibility preserved when `mcp.servers` is absent
- no auto-install, no runtime invocation, no source upload
