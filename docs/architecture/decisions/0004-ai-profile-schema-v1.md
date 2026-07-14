# ADR 0004: AI Profile Schema Version 1

## Status

Accepted

## Context

Agent Profile Compiler needs a canonical `ai-profile.yaml` contract before the
compiler, doctor, and target-specific outputs can be implemented. If the first
schema leaves object shapes or extension behavior ambiguous, downstream
generators can produce incompatible output for the same apparent profile.

## Decision

Publish the version 1 JSON Schema at
`packages/schemas/ai-profile.schema.json`.

The default profile location is `ai-profile.yaml` at the repository root.

Version 1 requires these top-level fields:

- `version`
- `profile`
- `stack`
- `clients`
- `workflow`

Version 1 also supports optional intent and override fields defined by
ADR 0002:

- `safety.mode`
- `safety.requiresSandbox`
- `permissions`

The `version` field must use `const: 1`. String `"1"` and integer `2` are
invalid.

All schema objects use `additionalProperties: false`. Version 1 has no extension
objects.

The first supported clients are explicitly represented under `clients`:

- `tabnine`
- `codex`
- `claude`

Each client object only supports `enabled: boolean`.

Permission mode values are `allow`, `ask`, and `deny`, except
`permissions.secrets.access` and `permissions.production.access`, which must be
`deny` in version 1.

When `permissions` overrides are present, supported permission objects are:

- `permissions.filesystem`: `read` and `write`
- `permissions.shell`: `run`
- `permissions.dependencies`: `install`
- `permissions.network`: `external`
- `permissions.secrets`: `access`
- `permissions.production`: `access`

Safety modes are:

- `guarded`
- `balanced`
- `autonomous`
- `plan-only`

When `safety` is omitted, the profile means:

```yaml
safety:
  mode: guarded
  requiresSandbox: false
```

`safety.mode` expresses intended risk posture only. The schema must not encode
client-specific raw permission text from Tabnine, Codex, Claude, or any later
target.

Permission defaults are derived from `safety.mode` for compiler/doctor behavior
when an implementation supports defaulting. The schema contract remains strict:
targets consume profile intent and generate the safest compatible config where
possible.

`permissions` are optional explicit overrides over the `safety.mode` preset.
Compiler and doctor behavior must use a deterministic `effectivePermissions`
object derived from the preset plus overrides. Omitted permission fields inherit
from the selected safety preset.

`autonomous` mode requires `requiresSandbox: true`; doctor reports
`requiresSandbox: false` as an error.

## Constraints

- `profile.name` must be a lowercase slug matching
  `^[a-z0-9][a-z0-9._-]*$`.
- `stack.languages` must contain at least one item.
- All `stack` arrays must contain unique lowercase slug values.
- Safety intent must not weaken the hard deny rules for secrets or production
  access.

## Consequences

- Downstream compiler and doctor packages can rely on fixed field shapes.
- Target-specific specs must not invent profile fields without an approved
  schema change.
- Target-specific specs must map safety intent without adding raw client
  permission strings to `ai-profile.yaml`.
- Unknown properties fail validation instead of being silently ignored.
- Unsupported schema versions fail explicitly until migration support exists.
- Validation must be local-only and must not resolve remote `$ref` values.

## 2026-07-14 Phase 31 Accepted Amendment

Accepted with the Phase 31 permission-posture lifecycle spec on 2026-07-14.

Schema v1 will add `trusted-local` to the accepted `safety.mode` values while
preserving `autonomous` and `plan-only`. `autonomous` is retained as a legacy,
sandbox-required input; new interactive setup offers Guarded, Balanced, and
Trusted local as the normal development choices and keeps Plan-only available
for audits.

Each existing client object may gain one optional neutral posture adjustment.
The Phase 31 I1 RED tests must freeze the exact key name and closed enum before
implementation. The proposed shape is:

```yaml
clients:
  claude:
    enabled: true
    permissionPosture: trusted-local
```

The adjustment vocabulary is client-neutral and must not contain raw client
setting strings. Omission means inherit the baseline. Explicit global granular
permissions and hard denials remain authoritative over client posture defaults.

Profiles omitting the additive fields and legacy Autonomous profiles must
retain byte-identical generated behavior until explicit interactive adoption.
