# Spec: Doctor Permission Mode Checks

## Status

Verified

Implemented in `packages/doctor` and verified on 2026-05-02 after final
implementation review.

## Problem

`ai-profile.yaml` defines intended safety posture, but Tabnine, Codex, Claude,
and other clients enforce their own runtime permission behavior. Generated or
project configuration can drift looser than derived `effectivePermissions`.

Doctor must identify unsafe or unverifiable permission posture without claiming
it can enforce runtime settings controlled by client applications.

## Goal

Add doctor checks that compare:

- profile intent
- generated project config
- detectable actual client runtime settings

Doctor should warn or fail when generated/project config is looser than
`effectivePermissions`, and report "not verifiable" when actual runtime state
cannot be detected.

## Non-Goals

- enforcing client runtime permissions
- changing client settings automatically
- implementing client-specific admin integrations
- reading secrets
- uploading project config
- implementing the `.sdlc` knowledge layer

## Inputs

- root-level `ai-profile.yaml`
- generated project files such as `AGENTS.md`, `.tabnine/mcp_servers.json`, and
  `.codex/config.toml` once those targets exist
- `ai-profile.lock` once available
- detectable local client project config files
- target-specific permission mapping tables

## Outputs

- doctor report entries
- CI-friendly non-zero exit when configured severity requires failure
- remediation guidance for each finding

## Concepts

### Profile Intent

The declared safety posture in `ai-profile.yaml`, including:

- `safety.mode`
- `safety.requiresSandbox`
- `permissions`

`permissions` are optional explicit overrides over the safety preset.

### Effective Permissions

The deterministic permission object derived from:

1. `safety.mode` preset
2. explicit `permissions` overrides
3. hard deny rules for secrets and production access

Generated artifacts are checked against `effectivePermissions`, not raw
`safety.mode` alone.

### Generated Config

Files produced by Agent Profile Compiler. These can be checked deterministically
against the profile and lockfile.

### Actual Client Runtime Setting

Client-controlled runtime state. This may include IDE settings, local config,
managed enterprise settings, or user runtime flags. Doctor must not pretend this
state is safe when it cannot be detected.

## Issue Envelope

```ts
type DoctorPermissionIssue = {
  code:
    | "LINT-PERM-001"
    | "LINT-PERM-002"
    | "LINT-PERM-003"
    | "LINT-PERM-004"
    | "LINT-PERM-005"
    | "LINT-PERM-006";
  severity: "info" | "warning" | "error";
  path: string;
  expected: string;
  actual: string;
  message: string;
  guidance: string;
};
```

Issue ordering is deterministic by `severity`, `path`, `code`, then `message`.

## Required Checks

### `LINT-PERM-001`: Guarded Shell Default

When `safety.mode: guarded`, shell execution must default to `ask` or `deny`.

### `LINT-PERM-002`: Guarded Dependency Install Default

When `safety.mode: guarded`, dependency installation must default to `ask` or
`deny`.

### `LINT-PERM-003`: Secret and Production Access Denied

Secrets and production access must always default to `deny`, regardless of
safety mode.

### `LINT-PERM-004`: Dangerous Auto-Approval Requires Sandbox

Dangerous tools must not default to auto-approve unless:

- `safety.mode: autonomous`
- `safety.requiresSandbox: true`

Dangerous tools include shell execution, dependency installation, external
network access, production access, and mutating filesystem operations.

`safety.mode: autonomous` with `safety.requiresSandbox: false` is an error.

`safety.mode: autonomous` with `safety.requiresSandbox: true` but no verifiable
generated sandbox configuration is a warning.

Codex `sandbox_mode = "danger-full-access"` is an error for any generated or
project profile, regardless of approval policy.

Claude `permissions.defaultMode = "bypassPermissions"` is an error unless a
future approved policy explicitly allows it. Claude
`permissions.disableBypassPermissionsMode` missing or set to anything other
than `"disable"` is an error when `safety.mode` is not `autonomous` with
sandbox intent.

### `LINT-PERM-005`: Config Looser Than Effective Permissions

Generated/project config must not be looser than `effectivePermissions`.

Example:

```text
profile intent: guarded
effectivePermissions.shell.run: ask
generated/project config: autonomous or auto-approve shell
result: warning or error
```

Explicit looser permission overrides in `ai-profile.yaml` also produce this
finding unless a future approved policy allows the looser override.

Claude evaluation must be rule-precedence-aware. Claude permission rules are
evaluated as deny, then ask, then allow, with the first matching rule winning.
Doctor must evaluate generated/project settings using that order rather than a
simple field-by-field array comparison.

Claude evaluation must also account for cross-wiring and merge behavior across
permission and sandbox settings:

- `Edit(...)` allow rules can expand `sandbox.filesystem.allowWrite`.
- `Read(...)` deny rules can expand `sandbox.filesystem.denyRead`.
- `sandbox.filesystem.allowWrite`, `sandbox.filesystem.denyWrite`,
  `sandbox.filesystem.allowRead`, `sandbox.filesystem.denyRead`,
  `sandbox.network.allowedDomains`, `sandbox.network.deniedDomains`,
  `sandbox.network.allowUnixSockets`, `sandbox.network.allowAllUnixSockets`,
  `sandbox.network.allowLocalBinding`, `sandbox.network.allowMachLookup`,
  `sandbox.network.httpProxyPort`, and `sandbox.network.socksProxyPort` can
  change the effective runtime surface.
- `sandbox.enableWeakerNestedSandbox` and
  `sandbox.enableWeakerNetworkIsolation` must be treated as loosening settings
  unless a future approved policy states otherwise.
- Array-valued settings can be concatenated and deduplicated across generated,
  project-local, user, and managed scopes.

For MVP, doctor may report cross-scope state as `not verifiable` when it cannot
read a scope, but it must not treat an unreadable scope as safe.

### `LINT-PERM-006`: Runtime Client Mode Not Verifiable

When actual runtime client mode cannot be detected, doctor reports
`not verifiable` guidance. It must not report the setup as safe.

## Contracts

- Doctor distinguishes profile intent, generated config, and actual runtime
  setting.
- Doctor must not claim it can enforce runtime settings controlled by AI
  clients.
- Doctor checks generated/project config against `effectivePermissions`.
- Generated/project config looser than `effectivePermissions` is at least a
  warning.
- Explicit looser permission overrides are at least a warning unless a future
  policy allows them.
- Secret and production access defaults looser than `deny` are errors.
- Autonomous mode without sandbox intent is an error.
- Autonomous mode with sandbox intent but no verifiable generated sandbox
  config is a warning.
- "Not verifiable" findings include concrete client-specific guidance where
  available.
- Doctor output is deterministic and CI-scriptable.
- Doctor must use target id and output path metadata from `ai-profile.lock`
  when available so MCP config files are associated with the correct target.

## Severity Policy

| Condition                                                                 | Severity  |
| ------------------------------------------------------------------------- | --------- |
| `safety.mode: autonomous` and `safety.requiresSandbox: false`             | `error`   |
| `autonomous` with sandbox intent but no verifiable generated sandbox      | `warning` |
| secrets or production access looser than `deny`                           | `error`   |
| dangerous auto-approval without autonomous sandbox intent                 | `error`   |
| Codex `sandbox_mode = "danger-full-access"`                               | `error`   |
| Claude `defaultMode = "bypassPermissions"`                                | `error`   |
| Claude bypass guard missing outside autonomous sandbox intent             | `error`   |
| generated/project config looser than `effectivePermissions`               | `warning` |
| explicit looser override without approved policy                          | `warning` |
| actual runtime client mode cannot be detected                             | `info`    |
| actual runtime client mode is detectable and looser than generated config | `warning` |

Any future policy that downgrades severity must be explicit, versioned, and
covered by tests.

## Target Verification Guidance

### Tabnine

Native tool and MCP permissions may be controlled by IDE settings. Generated
files can express intent and MCP config, but actual IDE permission state may be
unverifiable. When doctor cannot inspect runtime permissions, it reports
`LINT-PERM-006` with manual verification guidance.

### Codex

Doctor compares generated Codex config against `effectivePermissions` using the
Codex target mapping for approval policy, sandbox mode, workspace write,
network access, and MCP config. Exact config values belong in the Codex target
spec and must be verified against official docs before implementation.

The MVP Codex TOML reader is intentionally narrow. It supports blank lines,
comments, table headers, scalar string/boolean/integer assignments, and inline
comments after supported scalar assignments. Unsupported TOML syntax must
produce a warning rather than being treated as safe.

### Claude

Doctor compares generated Claude settings against `effectivePermissions` using
the Claude target mapping for `defaultMode` and allow/ask/deny rules. Doctor
must flag generated `bypassPermissions` project defaults as an error. CLI flags
or user settings can override project settings; unverifiable state uses
`LINT-PERM-006`.

Claude checks must account for:

- deny -> ask -> allow rule precedence
- merged arrays across settings scopes
- sandbox filesystem and network settings that can broaden or narrow the same
  surface represented by permission rules
- managed-only locks such as `allowManagedPermissionRulesOnly` when visible
- weaker sandbox flags and broad network settings that can loosen isolation
- unavailable scopes as `not verifiable`, not safe

Settings such as `skipDangerousModePermissionPrompt` and managed-only lock
settings are in scope for detection when present, but not required for MVP
enforcement unless a future spec adds managed-policy support.

The MVP Claude evaluator is conservative, not a complete reimplementation of
Claude's full rule-pattern engine. It must catch broad allow rules, bypass
modes, missing guards, merged local settings, and broad sandbox/network
loosening, but future work may replace it with a more exact evaluator if Claude
publishes a stable machine-readable rule engine.

## Security Rules

- Do not read secret files.
- Do not print environment variable values.
- Do not upload profile, config, or source contents.
- Do not execute shell commands.
- Do not install dependencies.
- Do not mutate client settings.

## Acceptance Criteria

- Doctor can compare generated/project config against `effectivePermissions`.
- Doctor flags config looser than `effectivePermissions`.
- Dangerous tools cannot default to auto-approve unless autonomous mode has
  sandbox intent.
- Codex `danger-full-access` is always an error when observed in generated or
  project config.
- Claude `bypassPermissions` is an error when observed in generated or project
  config.
- `safety.mode: autonomous` with `requiresSandbox: false` is an error.
- Autonomous mode with no verifiable generated sandbox config is at least a
  warning.
- Shell execution defaults to ask/deny in guarded mode.
- Dependency installation defaults to ask/deny in guarded mode.
- Secrets and production access always default to deny.
- Undetectable actual runtime client mode is reported as "not verifiable" with
  guidance.
- Output distinguishes profile intent, generated config, and actual runtime
  setting.

## Tests

- guarded profile with shell `allow` produces `LINT-PERM-001`
- guarded profile with dependency install `allow` produces `LINT-PERM-002`
- any profile with secrets access not `deny` produces `LINT-PERM-003`
- any profile with production access not `deny` produces `LINT-PERM-003`
- autonomous profile with `requiresSandbox: false` produces error
  `LINT-PERM-004`
- autonomous profile with no verifiable generated sandbox config produces
  warning `LINT-PERM-004`
- dangerous auto-approval without autonomous sandbox intent produces
  `LINT-PERM-004`
- generated/project config looser than `effectivePermissions` produces
  `LINT-PERM-005`
- Codex `sandbox_mode = "danger-full-access"` produces error `LINT-PERM-004`
- Claude `permissions.defaultMode = "bypassPermissions"` produces error
  `LINT-PERM-004`
- Claude missing or non-disable `permissions.disableBypassPermissionsMode`
  outside autonomous sandbox intent produces error `LINT-PERM-004`
- Claude precedence test catches a looser effective surface when
  `permissions.allow` contains `Bash` and a narrower deny rule cannot make the
  overall config safe
- Claude merge test checks generated `.claude/settings.json` plus
  `.claude/settings.local.json` before reporting the merged surface
- Claude sandbox cross-wiring test catches permissive
  `sandbox.filesystem.allowWrite` or `sandbox.network.allowedDomains`
- Claude sandbox test catches `sandbox.enableWeakerNestedSandbox`,
  `sandbox.enableWeakerNetworkIsolation`,
  `sandbox.network.allowAllUnixSockets`, and broad proxy settings as loosening
  isolation
- explicit looser override without an approved policy produces `LINT-PERM-005`
- undetectable runtime client mode produces `LINT-PERM-006`
- issue ordering is deterministic
- issue messages do not include secret-like values

## Documentation Updates

- `docs/security/trust-model.md`
- `docs/security/secret-handling.md`
- future doctor command documentation
- target docs for Tabnine, Codex, and Claude permission mappings

## Final Review Checklist

- profile intent, generated config, and runtime client state are clearly
  separated
- doctor does not overclaim enforcement
- guarded defaults are strict enough for sensitive work
- autonomous mode requires sandbox intent
- secrets and production access remain deny-only
- unverifiable runtime state is reported honestly
