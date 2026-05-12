# Spec: Codex Config Target

## Status

Verified

Implemented in `packages/compiler` for the minimal fixture. Verified on
2026-05-02 after final implementation review.

## Problem

Codex separates sandbox mode from approval policy. Agent Profile Compiler needs
a Codex target spec that maps profile intent and `effectivePermissions` to
Codex project configuration concepts without guessing exact values before
implementation verifies the current official Codex docs.

## Goal

Define the Codex target mapping contract for `config.toml` concepts such as
approval policy, sandbox mode, workspace write behavior, network access, and
MCP configuration.

## Non-Goals

- implementing the Codex target
- changing live Codex runtime flags
- bypassing Codex sandboxing or approvals
- installing MCP servers automatically
- generating Tabnine or Claude artifacts
- adding hosted execution

## User Flow

1. A user enables `clients.codex.enabled: true`.
2. A future compile command derives `effectivePermissions`.
3. The Codex target maps `effectivePermissions` into project config where
   supported.
4. Doctor compares generated/project config against profile intent and reports
   actual runtime settings as "not verifiable" when it cannot inspect them.

## Inputs

- validated `AiProfile` from `001-profile-schema-v1.md`
- derived `effectivePermissions`
- Codex target mapping table from this spec
- current official Codex docs verified during implementation
- future generated `.codex/config.toml` or target-specific project config

## Outputs

- target id: `codex-config`
- template id: `targets/codex-config@1`
- generated project file: `.codex/config.toml`
- deterministic Codex project config once implemented
- doctor findings for config looser than `effectivePermissions`
- golden fixture output: `fixtures/minimal-valid/expected/.codex/config.toml`

## Output Contract

The Codex target must emit one generated file for the MVP:

| Field         | Value                                                |
| ------------- | ---------------------------------------------------- |
| target id     | `codex-config`                                       |
| template id   | `targets/codex-config@1`                             |
| output path   | `.codex/config.toml`                                 |
| fixture input | `fixtures/minimal-valid/ai-profile.yaml`             |
| fixture gold  | `fixtures/minimal-valid/expected/.codex/config.toml` |

The generated file must use deterministic TOML formatting:

- UTF-8
- LF line endings
- scalar assignments use exactly one space before and after `=`
- trailing whitespace is forbidden
- table order exactly as shown in the generated artifact shape
- exactly one trailing newline

## Generated Artifact Shape

For `fixtures/minimal-valid/ai-profile.yaml` with guarded effective
permissions, the exact golden output is:

```toml
approval_policy = "on-request"
sandbox_mode = "workspace-write"
allow_login_shell = false

[sandbox_workspace_write]
network_access = false
```

This MVP shape deliberately avoids permission profile tables and MCP server
tables until implementation re-verifies the current official Codex docs and the
project profile schema has a reviewed source for those entries. It must never
generate `sandbox_mode = "danger-full-access"` or `approval_policy = "never"` as
a project default.

`allow_login_shell = false` is an Agent Profile Compiler hardening choice for
guarded output. It is intentionally stricter than Codex's upstream default
because login shells expand the shell-execution surface beyond what
`safety.mode: guarded` should permit.

## Target Mapping

Exact generated values below are verified against official Codex docs before
implementation of this target begins.

Verified Codex config surface:

Verification date for this spec revision: 2026-05-02.

- project config path in trusted projects: `.codex/config.toml`
- user/default config path: `~/.codex/config.toml`
- primary keys: `approval_policy`, `sandbox_mode`, `allow_login_shell`
- sandbox modes: `read-only`, `workspace-write`, `danger-full-access`
- approval policies: `untrusted`, `on-request`, `never`, and granular policy
  objects
- granular approval keys: `approval_policy.granular.sandbox_approval`,
  `approval_policy.granular.rules`,
  `approval_policy.granular.mcp_elicitations`,
  `approval_policy.granular.request_permissions`,
  `approval_policy.granular.skill_approval`
- deprecated approval policy value: `on-failure`
- workspace-write table: `[sandbox_workspace_write]`
- workspace-write keys: `network_access`, `writable_roots`
- reusable permission profile key: `default_permissions`
- built-in permission profile names: `:read-only`, `:workspace`,
  `:danger-no-sandbox`
- permission profile tables: `[permissions.<name>.filesystem]`,
  `[permissions.<name>.network]`, `[permissions.<name>.network.domains]`,
  `[permissions.<name>.network.unix_sockets]`
- permission profile filesystem values: `"read"`, `"write"`, `"none"`
- permission profile network mode values: `limited`, `full`
- permission profile domain rule values: `allow`, `deny`
- permission profile Unix socket rule values: `allow`, `none`
- MCP server tables: `[mcp_servers.<id>]`
- stdio MCP keys: `command`, `args`, `env`, `env_vars`, `cwd`,
  `experimental_environment`
- HTTP MCP keys: `url`, `bearer_token_env_var`, `http_headers`,
  `env_http_headers`
- shared MCP keys: `startup_timeout_sec`, `tool_timeout_sec`, `enabled`,
  `required`, `enabled_tools`, `disabled_tools`
- additional MCP keys: `startup_timeout_ms`, `oauth_resource`, `scopes`,
  `mcp_oauth_credentials_store`
- OAuth callback keys: `mcp_oauth_callback_port`, `mcp_oauth_callback_url`

Verified source URLs:

- `https://developers.openai.com/codex/config-reference`
- `https://developers.openai.com/codex/agent-approvals-security`
- `https://developers.openai.com/codex/concepts/sandboxing`
- `https://developers.openai.com/codex/mcp`

Conceptual mapping:

| Safety/effective permission | Codex config concept                                                       |
| --------------------------- | -------------------------------------------------------------------------- |
| `plan-only` or write `deny` | read-only sandbox posture where supported                                  |
| guarded write `ask`         | sandboxed mode with approvals for edits or boundary crossings              |
| balanced write `allow`      | workspace-write posture where supported                                    |
| shell `ask`                 | approval policy that asks before untrusted or risky commands               |
| shell `allow`               | allowed only under autonomous sandbox policy; never full bypass by default |
| network `ask`/`deny`        | network access disabled or approval-gated where supported                  |
| dependencies `ask`/`deny`   | command execution remains ask/deny for installs                            |
| secrets/production `deny`   | no generated permission grants or env-value exposure                       |

The target may use Codex concepts such as approval policy, sandbox mode,
workspace write settings, network access, and MCP config where supported.

Official-doc verification is captured as a required implementation gate:

- Before implementing this target, re-check the current official Codex
  configuration, approvals/security, sandboxing, and MCP docs.
- If documented keys or allowed values differ from this spec, update this spec
  and golden fixtures before writing target code.
- When implementation begins, every key emitted by the generator must have a
  source URL and verification date captured in this spec.
- Do not emit permission profile table fields or MCP server fields unless their
  exact keys and value shapes are verified against current official docs.

The compiler must not generate a project default equivalent to full access with
no approvals. Dangerous full bypass behavior is out of scope for generated
project defaults.

`sandbox_mode = "danger-full-access"` must never be generated for any profile.
`approval_policy = "never"` must never be generated as a project default.

## Contracts

- Generated Codex artifacts consume `effectivePermissions`.
- Generated `.codex/config.toml` uses only the verified keys listed in this
  spec.
- The target must not encode unverified Codex settings.
- The target must not use raw `safety.mode` alone to decide generated config.
- Actual runtime flags can override project config; doctor reports
  unverifiable runtime state honestly.
- MCP config must not install or enable third-party servers automatically.
- The generated file path is exactly `.codex/config.toml`.
- The generated template id is exactly `targets/codex-config@1`.
- The MVP generated artifact shape is exactly the TOML shown above for the
  minimal fixture.
- Golden tests compare exact output bytes, including formatting and final
  newline.
- The lockfile must map output path `.codex/config.toml` to target id
  `codex-config` and template id `targets/codex-config@1`.

## Security Rules

- Do not generate full-access/no-approval defaults.
- Do not generate `sandbox_mode = "danger-full-access"` for any profile.
- Do not generate unsafe auto-approval.
- Do not grant secrets or production access.
- Do not embed environment variable values.
- Do not upload source code.
- Do not install dependencies or MCP servers.
- Do not auto-install third-party MCP servers.
- Do not generate production API endpoints or production access defaults.
- Do not claim runtime enforcement beyond what Codex actually controls.

## Acceptance Criteria

- Codex target mapping covers approval policy, sandbox mode, workspace write,
  network access, and MCP config concepts.
- Generated artifacts use `effectivePermissions`.
- Exact config values are verified against official docs before implementation.
- Dangerous auto-approval requires autonomous sandbox intent.
- Secrets and production access remain deny-only.
- Unverifiable runtime flags are reported as "not verifiable".
- Output path, target id, and template id match the Output Contract.
- The minimal fixture has an exact golden output at
  `fixtures/minimal-valid/expected/.codex/config.toml`.
- The generated artifact shape is concrete enough for implementation and golden
  tests.
- Official-doc key verification is required before target implementation.
- `granular` approval policy and deprecated `on-failure` handling are covered
  by target/doctor tests before implementation is marked verified.

## Tests

- guarded profile maps shell/dependency install to ask/deny posture
- plan-only maps to read-only behavior where supported
- balanced maps workspace edits without granting dangerous shell/network access
- autonomous without sandbox intent fails doctor
- generated config looser than `effectivePermissions` produces doctor finding
- generated output is deterministic
- generated output contains no literal secret-like values
- golden test writes only `.codex/config.toml` for the minimal fixture
- golden test records template id `targets/codex-config@1`
- golden test asserts exact bytes for
  `fixtures/minimal-valid/expected/.codex/config.toml`
- golden test asserts the generated TOML does not contain
  `danger-full-access`, `approval_policy = "never"`, production endpoints, env
  values, MCP server tables, or auto-install commands
- golden test asserts the generated TOML uses one space around `=`, no trailing
  whitespace, tables in documented order, and exactly one trailing newline
- negative test asserts generated output never emits `on-failure`
- negative test asserts generated output never emits `danger-full-access`

## Documentation Updates

- future `docs/targets/codex.md`
- `docs/security/trust-model.md`
- `docs/specs/phase-04/003-doctor-permission-mode-checks.md`

## Fixture Paths

- input: `fixtures/minimal-valid/ai-profile.yaml`
- expected output: `fixtures/minimal-valid/expected/.codex/config.toml`
- target id assertion: `codex-config`
- template id assertion: `targets/codex-config@1`

## Final Review Checklist

- required sections are present: problem, goal, non-goals, inputs, outputs,
  contracts, security rules, acceptance criteria, tests, documentation updates,
  final checklist
- output path and template id are concrete
- generated artifact shape is concrete enough for implementation and golden
  tests
- fixture paths and expected golden output are documented
- official-doc key verification is captured as an implementation gate
- official Codex docs were checked before implementation
- generated config does not bypass sandbox or approvals by default
- mapping uses `effectivePermissions`
- runtime flags are not treated as fully verifiable unless actually inspected
- secrets and production access stay denied
