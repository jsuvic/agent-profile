# Spec: Profile Schema

## Status

Verified

Approved by:

- ADR 0002: `docs/architecture/decisions/0002-risk-modes-and-permission-model.md`
- ADR 0004: `docs/architecture/decisions/0004-ai-profile-schema-v1.md`

Safety fields, optional permission overrides, and deterministic
`effectivePermissions` derivation are implemented and verified. Verified on
2026-05-02 after final implementation review.

## Problem

Agent Profile Compiler needs one canonical profile file before any target output
can be generated. Without a versioned schema, compiler behavior would be
implicit and generated files could drift silently.

## Goal

Define root-level `ai-profile.yaml` version 1 and publish a matching JSON
Schema at `packages/schemas/ai-profile.schema.json`.

The schema must cover the minimum fields needed for Phase 1:

- profile metadata
- stack metadata
- enabled clients
- intended safety posture
- workflow flags
- permission defaults

The JSON Schema is the normative contract for downstream compiler, doctor, and
target specs.

## Non-Goals

- generating Tabnine, Codex, or Claude outputs
- implementing the full compiler
- implementing stack scanning
- supporting profile migrations
- adding hosted validation
- adding target-specific fields beyond Tabnine, Codex, and Claude enablement

## User Flow

1. A user creates or edits `ai-profile.yaml` at the repository root.
2. The CLI parses the YAML file.
3. The CLI validates the parsed value against the version 1 schema.
4. Validation errors identify the invalid path, expected shape, and actual
   value type.
5. Later compile commands consume only validated profile data.

YAML parse failures happen before schema validation and must return a parse
error without a partial profile object.

Schema failures happen after YAML parsing and must return validation issues in a
stable envelope.

## Inputs

- root-level `ai-profile.yaml`
- `packages/schemas/ai-profile.schema.json`

## Outputs

- validation result
- typed or parsed profile object for downstream packages
- normalized profile intent for later compiler/doctor derivation
- deterministic validation issue list on failure

## Contracts

- `version` is required and must use JSON Schema `const: 1`.
- String `"1"`, integer `2`, and any other version value must fail clearly.
- Schema changes require a versioning decision.
- Unknown future versions must fail clearly until migration support exists.
- Required fields must not be silently defaulted unless this spec explicitly
  defines the default.
- Validation behavior and validation issue ordering must be deterministic.
- `ai-profile.yaml` is expected at the repository root unless a CLI option
  explicitly points to another path.
- Missing profile files return a structured `file_not_found` validation issue.
- `safety.mode` expresses intended safety posture, not raw client runtime
  permission strings.
- `guarded` is the default safety mode when `safety` is absent.
- `safety.requiresSandbox` defaults to `false`.
- `autonomous` mode requires `requiresSandbox: true`; doctor reports
  `requiresSandbox: false` as an error.
- `permissions` are optional explicit overrides over the `safety.mode` preset.
- `permissions` may be omitted when the user accepts the selected safety
  preset.
- `permissions` may be partial; omitted permission fields inherit from the
  selected safety preset.
- The compiler must derive `effectivePermissions` deterministically from
  `safety.mode`, `safety.requiresSandbox`, and `permissions`.
- Generated artifacts must consume `effectivePermissions`, not raw
  `safety.mode` alone.
- Explicit stricter overrides are allowed.
- Explicit looser overrides are valid profile intent but must trigger doctor
  findings unless a future approved policy explicitly allows them.
- Target specs must consume this schema as their input contract and must not
  invent profile fields outside an approved schema change.

## Schema Shape

All objects use `additionalProperties: false` unless this spec explicitly says
otherwise. Version 1 has no extension objects.

### Top-Level Object

| Field         | Type    | Required | Contract                          |
| ------------- | ------- | -------- | --------------------------------- |
| `version`     | integer | yes      | `const: 1`                        |
| `profile`     | object  | yes      | profile metadata                  |
| `stack`       | object  | yes      | local project stack metadata      |
| `clients`     | object  | yes      | enabled output clients            |
| `safety`      | object  | no       | intended risk/safety posture      |
| `workflow`    | object  | yes      | SDD/TDD/final-review requirements |
| `permissions` | object  | no       | explicit permission overrides     |

### Future `capabilities`

ADR 0005 reserves a client-neutral capability model for future schema work. The
currently verified runtime schema does not yet accept a top-level
`capabilities` object. Adding this block to the runtime schema requires a
dedicated schema patch and matching fixtures/tests.

Reserved shape:

```yaml
capabilities:
  instructions:
    project: true
    global: false
  skills:
    enabled: true
    include:
      - sdd-change
      - tdd-change
      - final-review
  tools:
    mcp:
      enabled: true
      mode: config-only
  automation:
    hooks:
      enabled: false
  delegation:
    subagents:
      enabled: false
  distribution:
    plugins:
      enabled: false
  knowledge:
    sddArtifacts:
      enabled: false
```

MVP capability behavior is limited to project instructions, workflow skills,
safety intent, basic MCP config, doctor/linter checks, and lockfile tracking.
Hooks, subagents, plugins, global memory writes, and dedicated knowledge
MCP/tool generation are later-only. Advanced capabilities require
target-specific specs before implementation.

Forward reference (subagents): `docs/specs/phase-11/001-subagents-schema.md`
defines the live, client-neutral shape that must replace the reserved
single-field `capabilities.delegation.subagents.enabled` block above when
Phase 11 is approved. Until then, the reserved block is the canonical shape
and `subagents.enabled: true` is rejected by the runtime schema.

### `profile`

| Field         | Type   | Required | Contract                                                |
| ------------- | ------ | -------- | ------------------------------------------------------- |
| `name`        | string | yes      | non-empty slug matching `^[a-z0-9][a-z0-9._-]*$`        |
| `description` | string | yes      | non-empty human-readable description of the profile use |

### `stack`

Each array must contain unique lowercase slug strings matching
`^[a-z0-9][a-z0-9._-]*$`.

| Field             | Type     | Required | Contract                      |
| ----------------- | -------- | -------- | ----------------------------- |
| `languages`       | string[] | yes      | at least one language         |
| `frameworks`      | string[] | yes      | zero or more frameworks       |
| `packageManagers` | string[] | yes      | zero or more package managers |
| `testing`         | string[] | yes      | zero or more testing tools    |

### `clients`

All first-target clients must be present. A client may be disabled with
`enabled: false`.

| Field     | Type   | Required | Contract                    |
| --------- | ------ | -------- | --------------------------- |
| `tabnine` | object | yes      | `{ enabled: boolean }` only |
| `codex`   | object | yes      | `{ enabled: boolean }` only |
| `claude`  | object | yes      | `{ enabled: boolean }` only |

### `safety`

`safety` is optional in v1. When omitted, the profile means:

```yaml
safety:
  mode: guarded
  requiresSandbox: false
```

| Field             | Type    | Required | Contract                                                                       |
| ----------------- | ------- | -------- | ------------------------------------------------------------------------------ |
| `mode`            | string  | no       | `guarded`, `balanced`, `autonomous`, `plan-only`; default `guarded`            |
| `requiresSandbox` | boolean | no       | default `false`; must be true for autonomous intent or doctor reports an error |

The schema remains intent-based. It must not encode client-specific raw
permission text such as Tabnine `Auto-approve`, Codex approval policy names, or
Claude permission mode strings.

### `workflow`

| Field           | Type    | Required | Contract                                                                        |
| --------------- | ------- | -------- | ------------------------------------------------------------------------------- |
| `sdd`           | boolean | yes      | whether spec-driven development is required                                     |
| `tdd`           | boolean | yes      | whether test-driven development is required                                     |
| `finalReview`   | boolean | yes      | whether final implementation review is needed                                   |
| `codeReview`    | boolean | no       | gate for phase-10 code-review guidance on Tabnine and `AGENTS.md`               |
| `refactoring`   | boolean | no       | gate for phase-10 refactoring guidance on Tabnine and `AGENTS.md`               |
| `documentation` | boolean | no       | gate for phase-10 documentation guidance on Tabnine and `AGENTS.md`             |

### `permissions`

Permission mode values are `allow`, `ask`, and `deny`.

`permissions` are optional explicit overrides over the selected `safety.mode`
preset. They are intentionally client-neutral and must not contain raw Tabnine,
Codex, Claude, or other target-specific permission strings.

When a nested permission object is present, each field in that object is also
optional. Omitted fields inherit from the selected safety preset. Empty
`permissions` or nested permission objects are valid but redundant.

| Field          | Type   | Required | Contract                                         |
| -------------- | ------ | -------- | ------------------------------------------------ |
| `filesystem`   | object | no       | optional `{ read?: mode, write?: mode }` only    |
| `shell`        | object | no       | optional `{ run?: mode }` only                   |
| `secrets`      | object | no       | optional `{ access?: "deny" }` only in version 1 |
| `dependencies` | object | no       | optional `{ install?: mode }` only               |
| `network`      | object | no       | optional `{ external?: mode }` only              |
| `production`   | object | no       | optional `{ access?: "deny" }` only in version 1 |

### Permission Defaults By Safety Mode

Permission presets are derived from `safety.mode`. Explicit `permissions` are
then applied field by field as overrides. The implementation allows omitted and
partial permissions while keeping derivation deterministic.

| Safety mode  | filesystem.read | filesystem.write | shell.run | dependencies.install | network.external | secrets.access | production.access |
| ------------ | --------------- | ---------------- | --------- | -------------------- | ---------------- | -------------- | ----------------- |
| `guarded`    | `allow`         | `ask`            | `ask`     | `ask`                | `ask`            | `deny`         | `deny`            |
| `balanced`   | `allow`         | `allow`          | `ask`     | `ask`                | `ask`            | `deny`         | `deny`            |
| `autonomous` | `allow`         | `allow`          | `allow`   | `ask`                | `ask`            | `deny`         | `deny`            |
| `plan-only`  | `allow`         | `deny`           | `deny`    | `deny`               | `deny`           | `deny`         | `deny`            |

The compiler must never silently generate secret access, production access, or
destructive auto-approval from these defaults.

### Effective Permission Derivation

The compiler derives `effectivePermissions` in this stable order:

1. Default missing `safety` to `mode: guarded` and `requiresSandbox: false`.
2. Select the preset row for `safety.mode`.
3. Apply any explicit `permissions` overrides field by field.
4. Re-apply hard deny rules for `secrets.access` and `production.access`.
5. Emit one stable `effectivePermissions` object for target generation and
   doctor checks.

Strictness order is:

```text
deny < ask < allow
```

Overrides that move left are stricter. Overrides that move right are looser.
Looser overrides are profile intent, but doctor must report them unless a
future policy spec explicitly allows the looser posture.

## Minimal Valid Profile

The implementation must create `fixtures/minimal-valid/ai-profile.yaml` and use
that file as the single source for the minimal valid example in documentation
and tests.

The current fixture uses fully explicit guarded permission overrides. Separate
fixtures cover preset-only profiles and partial permission overrides so the
schema, docs, and tests stay aligned.

```yaml
version: 1
profile:
  name: svelte-java-playwright
  description: AI-agent setup for a SvelteKit, Java, and Playwright project.
stack:
  languages:
    - typescript
    - java
  frameworks:
    - sveltekit
    - spring-boot
  packageManagers:
    - npm
  testing:
    - playwright
    - junit
clients:
  tabnine:
    enabled: true
  codex:
    enabled: true
  claude:
    enabled: true
safety:
  mode: guarded
  requiresSandbox: false
workflow:
  sdd: true
  tdd: true
  finalReview: true
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

## Validation Errors

Validation failures must return a stable issue envelope:

```ts
type ProfileValidationIssue = {
  code:
    | "file_not_found"
    | "yaml_parse_error"
    | "schema_validation_error"
    | "unsupported_schema_version";
  path: string;
  expected: string;
  actual: string;
  message: string;
};
```

Rules:

- YAML parse errors use `code: "yaml_parse_error"` and `path:
"ai-profile.yaml"` unless the parser can provide a more precise location.
- Missing profile files use `code: "file_not_found"` and the requested file
  path.
- Schema errors use JSON Pointer paths such as `/version`,
  `/permissions/filesystem/write`, or `/clients/tabnine/enabled`.
- Unsupported versions use `code: "unsupported_schema_version"` at `/version`.
- Issues must be sorted by `path`, then `code`, then `message`.
- Error messages must not include environment variable values or secret file
  contents.

## Security Rules

- Validation must not upload profile contents.
- Validation must not read secret files.
- Validation must not execute shell commands.
- Validation must not install dependencies.
- Validation must not resolve `$ref` values from network URLs.
- Validation must not write files, caches, or logs outside an explicit
  user-approved path.
- Validation errors must not print environment variable values.

## Acceptance Criteria

- `packages/schemas/ai-profile.schema.json` exists.
- The schema uses `const: 1` for `version`.
- The schema requires `version`, `profile`, `stack`, `clients`, and `workflow`.
- `permissions` is optional and acts as explicit overrides over the safety
  preset.
- The schema pins the field shapes documented in this spec.
- The schema uses `additionalProperties: false` for every object.
- `ai-profile.yaml` can express intended safety posture through `safety.mode`
  and `safety.requiresSandbox`.
- `guarded` is the default safety mode.
- `autonomous` requires `requiresSandbox: true`; doctor reports
  `requiresSandbox: false` as an error.
- The schema remains intent-based and does not encode client-specific raw
  permission text.
- Permission presets are derived from `safety.mode` and documented.
- `permissions` are supported as explicit overrides over the safety preset.
- Omitted `permissions` fields inherit from the safety preset.
- `effectivePermissions` derivation is deterministic and documented.
- Generated target specs consume `effectivePermissions`.
- Future `capabilities` schema work must preserve client-neutral intent and
  must not add client-specific raw settings to `ai-profile.yaml`.
- A valid fixture profile passes validation.
- Invalid profile fixtures fail with deterministic validation issues.
- YAML parse failures and schema validation failures are distinguishable.
- The documented minimal profile and valid fixture stay aligned from one source.
- ADR `0004-ai-profile-schema-v1.md` records the version 1 field set and
  strictness decision.
- ADR `0002-risk-modes-and-permission-model.md` records safety modes and the
  client-runtime boundary.
- ADR `0005-client-capability-model.md` records future client-neutral
  capability categories and the target-support confidence model.

## Tests

- schema unit tests for valid and invalid profiles
- fixture test for `fixtures/minimal-valid/ai-profile.yaml`
- negative tests for missing required top-level fields
- negative tests for unknown properties at top-level and nested objects
- negative test for `version: 2`
- negative test for `version: "1"`
- negative test for `permissions.secrets.access: allow`
- safety mode enum tests
- guarded default test
- preset-only profile test with omitted `permissions`
- partial permission override test
- autonomous without `requiresSandbox: true` error test in future doctor
  coverage
- deterministic `effectivePermissions` derivation tests in future compiler/core
  coverage
- stricter override accepted test
- looser override doctor finding test in future doctor coverage
- network external permission mode test
- production access deny-only test
- negative tests for uppercase and whitespace in `profile.name`
- negative test for empty `stack.languages`
- negative test for duplicate stack array values
- `readProfileFile` happy-path test
- `readProfileFile` missing-file test
- YAML parse failure test
- deterministic validation issue envelope test
- test or explicit validator configuration proving remote `$ref` resolution is
  disabled
- strict schema compile regression test for unknown JSON Schema keywords

## Documentation Updates

- `README.md`
- `docs/architecture/decisions/0002-risk-modes-and-permission-model.md`
- `docs/architecture/decisions/0004-ai-profile-schema-v1.md`
- `docs/architecture/decisions/0005-client-capability-model.md`
- future schema reference documentation once docs for profile authoring exist
- target docs in later phases must reference this schema as their input
  contract and must not invent fields

## Final Review Checklist

- schema is strict enough for deterministic compiler behavior
- required fields match the documented example and valid fixture
- every object has an explicit `additionalProperties` decision
- `version` uses `const: 1`
- validation does not perform network, shell, dependency, secret, or write
  actions
- validation does not resolve remote `$ref` values
- validation errors are stable and useful without exposing secrets
- tests cover both success and failure cases
