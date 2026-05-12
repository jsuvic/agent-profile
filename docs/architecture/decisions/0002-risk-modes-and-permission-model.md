# ADR 0002: Risk Modes and Permission Model

## Status

Accepted

## Context

Agent Profile Compiler generates intended AI-agent configuration for multiple
clients. Runtime permission enforcement remains controlled by the client
application, not by this compiler.

Different users need different approval behavior. Corporate and sensitive
repositories usually need strict approval gates. Trusted local projects may want
fewer prompts. Isolated sandbox work may allow longer autonomous execution.
Audit and planning workflows may need read-only analysis.

The compiler therefore needs a product-level safety intent that can be compiled
into the safest compatible project configuration and checked by doctor/linter
rules.

## Decision

Add safety modes to `ai-profile.yaml`:

- `guarded`
- `balanced`
- `autonomous`
- `plan-only`

The compiler defines intended safety posture. Client apps such as Tabnine,
Codex, and Claude enforce their own runtime permission behavior.

The compiler must generate the safest compatible config where possible. The
doctor/linter must warn or fail when generated or project config is looser than
derived `effectivePermissions`.

`safety.mode` is a preset. `permissions` are optional explicit overrides and
may be partial. The compiler must derive `effectivePermissions`
deterministically from both values and generated artifacts must use
`effectivePermissions`, not raw `safety.mode` alone.

Explicit stricter overrides are allowed. Explicit looser overrides are allowed
as profile intent, but doctor/linter must report them unless a future approved
policy explicitly allows them.

`autonomous` mode with `requiresSandbox: false` is an error. `autonomous` mode
with `requiresSandbox: true` but no verifiable generated sandbox configuration
is at least a warning. The compiler must never silently generate secret access,
production access, or destructive auto-approval.

## Mode Intent

### `guarded`

Default mode for corporate and sensitive work.

- reads allowed
- writes ask first
- shell ask first
- dependency install ask first
- external network ask first
- secrets deny

Canonical guarded YAML used by init defaults:

```yaml
safety:
  mode: guarded
  requiresSandbox: false
permissions:
  filesystem:
    read: allow
    write: ask
  shell:
    run: ask
  secrets:
    access: deny
  dependencies:
    install: ask
  network:
    external: ask
  production:
    access: deny
```

### `balanced`

Mode for trusted local development.

- reads allowed
- workspace edits may be allowed
- risky shell commands ask first
- dependency install ask first
- external network ask first
- secrets deny

### `autonomous`

Mode for isolated or sandboxed environments.

- longer autonomous work may be allowed
- `requiresSandbox` must be true or doctor must report an error
- secrets deny
- destructive commands still require warning or rejection
- production access must not be silently generated

### `plan-only`

Mode for audits, reviews, and analysis.

- read/analyze only
- no edits
- no dependency installs
- no external network
- no secrets

## Effective Permissions

The derivation order is fixed:

1. Normalize missing `safety` to `mode: guarded` and
   `requiresSandbox: false`.
2. Load the preset permissions for `safety.mode`.
3. Apply any explicit `permissions` overrides field by field.
4. Preserve hard deny rules for `secrets.access` and `production.access`.
5. Emit a stable `effectivePermissions` object for compiler and doctor use.

Permission strictness is ordered as:

```text
deny < ask < allow
```

An override is stricter when it moves left in that order, equal when unchanged,
and looser when it moves right. Looser overrides must produce doctor findings
unless a future policy spec adds an explicit allowlist.

Generated files must not infer operational approval behavior from `safety.mode`
alone. They must use `effectivePermissions` plus target-specific mapping rules.

## Doctor Severity Policy

- The plan's early `LINT-PERM-*` numbering was replaced by the safety-mode
  model in this ADR. Phase 4 owns the stable permission codes:
  `LINT-PERM-001` guarded shell default, `LINT-PERM-002` guarded dependency
  install default, `LINT-PERM-003` secrets/production deny, `LINT-PERM-004`
  dangerous auto-approval/sandbox requirements, `LINT-PERM-005` config looser
  than `effectivePermissions`, and `LINT-PERM-006` runtime state not
  verifiable.
- `safety.mode: autonomous` with `safety.requiresSandbox: false` is an error.
- `safety.mode: autonomous` with `safety.requiresSandbox: true` but no
  verifiable generated sandbox config is a warning.
- Secret or production access looser than `deny` is an error in every mode.
- Dangerous auto-approval in generated/project config is an error unless
  `safety.mode: autonomous` and `safety.requiresSandbox: true`.
- Generated/project config looser than `effectivePermissions` is at least a
  warning.
- Undetectable actual runtime client state is reported as "not verifiable" and
  must not be summarized as safe.

Doctor must keep these three concepts separate:

- profile intent
- generated/project config
- actual client runtime state

## Target Mapping Summary

### Tabnine

Tabnine native tool and MCP permissions may be controlled by IDE settings.
Generated files can express profile intent and MCP server configuration, but
actual IDE permission state may be unverifiable. Doctor should provide manual
verification guidance when runtime permissions cannot be inspected.

### Codex

Codex mapping must consider `config.toml` concepts such as approval policy,
sandbox mode, workspace write access, network access, and MCP configuration
where supported. Exact config values belong in the Codex target spec and must
be verified against official Codex docs before implementation.

### Claude

Claude mapping must consider settings concepts such as `defaultMode` plus
allow/ask/deny rules. The compiler must not generate `bypassPermissions` as a
project default. `plan-only` should map to plan/read-only behavior where
supported. CLI flags or user settings can override project settings, so doctor
must report unverifiable runtime state honestly.

## Alternatives Considered

- Static permission defaults only: rejected because users have different risk
  tolerance and client runtime modes.
- Client-specific raw permission strings in the profile: rejected because it
  would make the canonical profile unstable and client-coupled.
- Let clients decide everything: rejected because doctor/linter cannot reason
  about safety drift without an intended posture.
- Compiler-enforced runtime permissions: rejected because runtime enforcement
  belongs to Tabnine, Codex, Claude, or the surrounding sandbox.

## Consequences

- `ai-profile.yaml` must express safety intent, not raw client runtime settings.
- `permissions` must be treated as optional overrides over a safety preset, not
  as a separate competing policy.
- Generated config should be conservative when client behavior cannot be mapped
  exactly.
- Generated artifacts must consume `effectivePermissions`.
- Doctor/linter rules must distinguish profile intent, generated config, and
  actual client runtime setting.
- When actual runtime client mode cannot be detected, doctor must report "not
  verifiable" with guidance rather than pretending the setup is safe.
- Future target docs must explain how each client maps to safety modes.

## Revisit Triggers

Revisit this decision if:

- target clients expose stable machine-readable runtime permission state
- safety modes need per-organization policy packs
- `autonomous` mode needs stronger sandbox attestation
- additional permission dimensions are needed beyond filesystem, shell,
  dependencies, network, secrets, and production access
