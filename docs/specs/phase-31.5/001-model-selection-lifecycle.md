# Spec: Model Selection Lifecycle

## Status

Approved 2026-07-16 from the completed and approved model/effort grill.
Sequenced after Phase 31 I8 and before Phase 32 I1. Governed by amended ADR
0016 and ADR 0021.

## Problem

The implemented Phase 30 model policy is subagent-only, opt-in guidance backed
by a mapping verified on 2026-07-13. It resolves Codex and Claude to models that
are already stale, gives Tabnine only portable task-capsule guidance, does not
guide or configure primary workflow stages, and has no account-aware init or
upgrade path.

Users currently see stable classes such as `strongest` and `balanced`, but not
a complete lifecycle that answers which exact model/effort will be used,
whether the client can configure it, whether the account or organization
offers it, what happens when a new or older model is selected, and how an
existing repository adopts a newer mapping without silent drift.

## Goal

Provide one local-first model-selection lifecycle for Codex, Claude, and
Tabnine that:

- applies portable role intent to primary workflow stages and delegated roles;
- shows exact model names, target effort, alternatives, and capability status;
- uses a role-aware mixed preset by default with explicit quality-first and
  cost-conscious alternatives;
- optionally validates selected models through a consented, source-free probe;
- supports older, organization-pinned, private, and newly discovered models;
- locks approved exact resolutions and changes them only through reviewed
  init/upgrade intent;
- keeps ordinary compile, doctor, UI, and non-interactive flows offline.

## Intent

Spend premium-model capability where judgment materially changes correctness,
use efficient models for bounded work, and make every client-specific outcome
visible. Agent Profile defines and validates intended model posture; target
clients remain authoritative for runtime availability, entitlements, fallback,
and enforcement.

## Decision Rules

1. Canonical intent remains `efficient | balanced | strongest` and
   `low | medium | high | extra-high`; exact vendor values live in a
   release-versioned catalog and target adapters.
2. The default is the `role-aware` preset. `quality-first` and
   `cost-conscious` are opt-in presets. User-facing review always expands a
   preset to exact names and efforts for every enabled client.
3. The schema-v1 `subagentPolicy` key remains for backward compatibility even
   though its role model now covers primary and delegated execution. A rename
   is not part of this phase.
4. Existing enabled policies without a v3 preset retain mapping-v2 behavior
   until an explicit upgrade. New interactive init writes the selected preset;
   role entries remain explicit overrides over that preset.
5. Exact overrides are open, target-specific strings with length/control-
   character validation, not a timeless allowlist. An uncatalogued identifier
   is `unverified` and unrated; it is not rejected merely for being new or
   private.
6. Each target/surface reports exactly one deterministic capability status:
   `configured | advisory | unsupported | unverified`. This status describes
   what Agent Profile can emit or prove, not live provider availability.
7. The lockfile records catalog version, selected preset, exact per-target role
   resolutions, target effort, ordered alternatives, resolution source, and
   capability status. It records no account, entitlement, quota, or probe
   result.
8. Ordinary compile consumes the locked resolution and never silently chooses
   a newer model or runtime fallback. A missing/legacy model-provenance block
   resolves through the documented v2 compatibility path until upgrade.
9. Live probes are optional, explicit, bounded, source-free, non-persistent,
   and outside the repository. Unknown or ambiguous failures are `unknown`.
10. Model enumeration is automated only through a documented machine-readable
    interface. Interactive pickers are never scraped.
11. Tabnine organization-approved older models are valid. Known historical
    identifiers remain catalog records indefinitely and retired entries are
    hidden from ordinary onboarding.
12. A release updates the bundled catalog. An explicit metadata check may
    report a newer Agent Profile release, but no remote catalog or package is
    downloaded or applied automatically.

## Architecture Rescue Candidate

### Shared model-policy domain before feature slices

- **Current modules:** `packages/core/src/profile.ts`,
  `packages/compiler/src/subagent-mapping.ts`,
  `packages/compiler/src/subagent-policy-guidance.ts`, lockfile builders,
  CLI wizard/upgrade orchestration, and Doctor.
- **Current friction:** catalog identifiers/version live in the profile
  descriptor while effort resolution and fallback live in the compiler;
  onboarding, provenance, and diagnostics have no shared resolution contract.
- **Proposed interface:** one pure core model-policy module owns catalog
  records, presets, role intent, compatibility status, exact resolution, and
  immutable lockfile-facing types. Compiler target adapters consume the pure
  result. CLI probe adapters depend on an explicit process-runner boundary and
  never enter the pure resolver.
- **Locality/leverage:** a catalog change has one reviewed data owner; compile,
  init, upgrade, Doctor, and UI render the same result instead of recreating
  rankings or labels.
- **Test improvement:** table-driven catalog/resolution tests become the
  highest fast deterministic seam; client processes are faked only at the
  unmanaged subprocess boundary.
- **Decision impact:** requires the ADR 0016 amendment and ADR 0021; must
  preserve schema v1, v2 mapping compatibility, and disabled-policy byte
  identity.
- **Dependency state:** prerequisite I1, not later cleanup.

## Non-Goals

- Credential brokerage, provider login, API-key storage, model routing, or
  custom endpoint management.
- Reading or persisting account identity, organization identity, subscription,
  remaining quota, credentials, private endpoints, prompt history, or source.
- A remotely mutable model catalog, automatic Agent Profile update, automatic
  dependency/client installation, or telemetry.
- Guaranteeing runtime availability or proving target runtime enforcement when
  the client exposes no inspection surface.
- Treating a Fable safety fallback as quota/entitlement fallback.
- Ranking unknown private models, forcing the newest model, or warning merely
  because an enterprise uses a supported older model.
- Scraping `/model` or any other interactive client UI.
- Inventing Tabnine effort or per-role model controls.
- Renaming `subagentPolicy`, creating schema v2, or implementing Phase 32's
  general editable update engine.
- Global/user-level client writes. This phase remains project-local by default.

## User Flow

### New interactive init

1. The user selects enabled clients and capability packs as today.
2. Init recommends `role-aware` and shows the exact expanded table for each
   client: role, model, effort, alternatives, and capability status. The
   quality-first and cost-conscious presets and per-role customization remain
   available through progressive disclosure.
3. Init offers a live availability check. Before consent it lists which client
   processes will run, the maximum number of provider calls, possible quota
   use, and that no repository content or credentials will be read by Agent
   Profile.
4. If accepted, the probe checks at most one request per distinct selected
   exact model, using the highest catalog-supported intended effort for that
   model. It stops on auth/provider/temporary-limit failures and tests an
   ordered alternative only after the preferred candidate is unavailable.
5. If declined or unsupported, the exact table remains usable with
   `unverified` availability. Tabnine falls back to guided `/model` or exact
   organization/private entry when enumeration is unavailable.
6. The user reviews `ai-profile.yaml`, generated/project configuration, and
   lockfile resolution in the existing diff-before-write flow. No write occurs
   without explicit intent.

### Existing repository upgrade

1. `agent-profile upgrade` compares the legacy/locked catalog resolution with
   mapping v3 and shows exact old/new models, effort, status, alternatives, and
   reasons.
2. A consented package-metadata check may report that a newer Agent Profile
   catalog exists and provide the manual update command. It does not install.
3. The user may retain the old resolution, adopt one preset, customize roles,
   or enter an exact target override. A live probe is separately optional.
4. Write preview includes canonical intent, target configuration/guidance, and
   lockfile provenance. Declining preserves every existing byte.

### Later validation

1. Normal `agent-profile doctor --models` is offline and compares profile,
   lock, catalog lifecycle, generated ownership, and target capability status.
2. `agent-profile doctor --models --probe` repeats the consent notice and
   source-free availability check. It remains read-only and does not update the
   lock or configuration.
3. An unavailable current selection becomes actionable only when explicit
   evidence exists. A merely newer recommendation is informational.

## Inputs

- Existing optional `subagentPolicy`, with additive `preset` and role
  overrides.
- Enabled clients and project-local ownership/lockfile state.
- Bundled mapping-v3 catalog and historical mapping-v2 descriptor.
- Optional exact target overrides, including organization/private identifiers.
- Optional explicit probe/update-check consent.
- Installed client process and documented source-free invocation behavior.

Proposed additive profile shape:

```yaml
subagentPolicy:
  enabled: true
  preset: role-aware
  roles:
    architect:
      capability: strongest
      effort: extra-high
    implementer:
      capability: balanced
      effort: high
    routine-implementer:
      capability: balanced
      effort: medium
    explorer:
      capability: efficient
      effort: low
    grill:
      capability: strongest
      effort: extra-high
      overrides:
        tabnine:
          model: organization-model-id
```

Preset absence retains Phase 30 mapping-v2 behavior for an existing enabled
policy. Known role overrides continue to win over preset defaults.

## Outputs

- Immutable canonical model-policy IR and versioned catalog data.
- Exact per-client resolution tables with capability status and ordered
  alternatives.
- Deterministic project-local target configuration or honest advisory guidance.
- Lockfile model provenance only when v3 is explicitly adopted.
- Ephemeral probe and optional update-check reports.
- Offline Doctor model-policy findings and optional probe findings.
- Local UI model-policy editor/preview that round-trips every supported field.
- Mapping-v3 evidence, schema/target/CLI docs, examples, goldens, and final
  spec-to-test matrix.

## Contracts

### Default role-aware preset

| Role/stage | Capability | Effort |
| --- | --- | --- |
| `grill`, `architect`, `critical-reviewer` | strongest | extra-high |
| `spec-reviewer`, `quality-reviewer` | strongest | high |
| `complex-implementer`, `implementer` | balanced | high |
| `routine-implementer` | balanced | medium |
| `explorer` | efficient | low |
| `mechanical` | efficient | medium |

The mapping-v3 evidence expands this table to current Codex and Claude model
candidates. Tabnine resolves only against an organization-visible exact model
and never receives an invented effort.

### Catalog lifecycle

- Catalog entry status is `current | supported-legacy | deprecated | retired`.
- Runtime/organization-only entries are represented as explicit overrides and
  displayed as `organization/private - unrated`.
- Once published, an exact identifier remains in compatibility history.
- Retired entries are excluded from ordinary preset choices but remain valid
  for parsing, provenance, migration, and explicit selection.
- Capability ranking is release-reviewed data, not inferred from a model name.

### Target capability status

- `configured`: Agent Profile emitted a reviewed target control at an owned,
  project-local surface.
- `advisory`: exact instructions are shown but the target/user controls the
  setting manually.
- `unsupported`: the target has no verified equivalent control.
- `unverified`: an exact/private/new value is representable but current target
  behavior is not proven.

Status is per target surface and role. A client can configure a primary default
while remaining advisory for per-skill switching.

### Lockfile provenance

The v2 lockfile gains an optional `modelPolicy` block only after explicit v3
adoption. It contains:

- `catalogVersion` and `preset`;
- exact client/role model and target effort;
- ordered exact alternatives;
- `catalog | explicit-override | legacy` resolution source;
- deterministic capability status.

It MUST NOT contain installed client version, probe timestamp/result, auth,
entitlement, account, organization, quota, endpoint, prompt, or response.

### Compatibility and update

- Omitted/disabled policy remains byte-identical.
- Enabled mapping-v2 profiles remain valid and do not adopt v3 during ordinary
  compile.
- Ordinary compile uses the existing locked exact resolution. New catalog data
  is considered only by init/upgrade/explicit review.
- Exact overrides are rejected only for empty values, excessive length,
  control/newline characters, or unsafe target serialization—not absence from
  the bundled catalog.
- Every mutation uses existing ownership, preview, explicit-write, atomicity,
  and rollback contracts.

### Probe result

The closed result set is `available | not-entitled | temporarily-limited |
unsupported-client | provider-unavailable | auth-required | unknown`.
Classification MUST be based on table-driven, redacted evidence. Unknown wins
over speculative classification.

## Security Rules

- Normal parse, compile, Doctor, UI, and non-interactive init make no provider
  or package-registry call.
- Probe/update check requires explicit consent immediately before the call.
- Probe execution uses a new empty temporary directory outside the repository,
  a fixed content-free prompt, no session persistence where documented, a
  bounded timeout/output limit, and no tool/source request.
- Agent Profile never reads credential stores, literal tokens, account/profile
  identity, quota, subscription, prompt history, private endpoints, or source
  to perform the probe.
- Client stdout/stderr is classified in memory, redacted, bounded, and not
  persisted. Raw output is not echoed by default.
- No probe can write `ai-profile.yaml`, lockfile, generated outputs, client
  settings, history, or telemetry.
- Project-local target writes require ownership preflight, exact diff, explicit
  `--write`/wizard confirmation, atomic replacement, and rollback on failure.
- Existing unowned target settings are never overwritten merely to configure a
  model; return advisory/manual guidance instead.

## Acceptance Criteria

1. A profile without enabled v3 policy produces byte-identical current
   generated output and lockfile behavior; mapping-v2 profiles remain valid and
   unchanged until explicit upgrade.
2. Parser/schema tests freeze the presets, role matrix, new
   `routine-implementer` role, open exact-override contract, size/control-
   character errors, precedence, and deep immutability.
3. One shared pure catalog/resolver produces exact Codex, Claude, and Tabnine
   resolution rows, lifecycle labels, ordered alternatives, and capability
   statuses consumed unchanged by compiler, CLI, Doctor, and UI.
4. Codex and Claude target tests distinguish primary-default, workflow/skill,
   and subagent configuration from advisory-only surfaces; generated claims
   match current official evidence.
5. Tabnine tests retain historical identifiers, hide retired entries from
   normal init, accept private/new exact IDs as unrated, omit effort, and use
   guided manual selection when safe enumeration/configuration is unavailable.
6. Probe tests use fake executables and prove the fixed prompt, empty external
   working directory, call bound, timeout, non-persistence, result precedence,
   redaction, and zero provider/network calls in normal and CI paths.
7. Init tests show exact names/efforts/statuses before consent and before write;
   decline/unsupported/auth/quota/unknown paths still reach a safe reviewable
   result without source or secret access.
8. Upgrade tests preserve v2/locked resolutions by default, compare exact
   old/new values, allow retain/adopt/customize, make update checking optional,
   and never install or silently remap.
9. Lockfile tests prove deterministic v3 provenance, stable ordering,
   round-trip validation, legacy migration, and absence of all ephemeral or
   account-scoped fields.
10. Doctor tests distinguish outdated recommendation from confirmed
    unavailability, remain offline by default, and make `--probe` read-only and
    consent-gated.
11. Local UI tests round-trip v2 and v3 policy fields, show the same exact
    resolution/status table, and never initiate a live probe.
12. Published-package integration starts from clean packed workspaces and
    completes init -> optional fake probe -> preview/write -> compile -> Doctor
    -> upgrade retain/adopt without network or product-code fixtures leaking.
13. A final spec-to-test matrix cites a focused regression for every MUST,
    acceptance criterion, status/error contract, and hard safety boundary;
    static-only evidence is called out as weaker.

## Tests

- Pure core catalog/preset/resolution and invalid-profile tables.
- Compiler target-adapter tests and deterministic Codex/Claude/Tabnine goldens.
- Lockfile v2 optional-model-provenance validation/migration tests.
- Fake-process probe adapter tests with filesystem, network, source-read,
  history, secret, output-size, timeout, and persistence sentinels.
- CLI init/upgrade/doctor table tests for every consent and result state.
- Ownership/conflict/atomic-write tests for target configuration changes.
- Local UI state/round-trip/render tests; no live client invocation.
- Release-pack journey built before packing, plus standard full tests, check,
  goldens, Doctor, and package verification.

## TDD Strategy

- I1 is a **computation** slice at `intent + catalog + prior provenance ->
  immutable resolution plan` with no mocks.
- I2 and I3 are **deterministic generator** slices at `resolution plan ->
  target artifacts/status table` with golden output as the seam.
- I4 is an **orchestration** slice at `probe request -> normalized ephemeral
  result`; only the client subprocess, clock, and temporary filesystem are
  unmanaged mock boundaries.
- I5-I7 are **orchestration** slices observed through their public command
  result, report, and filesystem effect. They consume faked resolution/probe
  ports and never mock the code under test.
- I8 is a **deterministic UI adapter** slice at `profile + resolution -> editor
  state/rendered preview`.
- I9 is an **orchestration** slice at the packed CLI journey boundary.

Each issue starts with one focused RED proving its declared observable outcome,
then implements the minimum GREEN. No issue may decide a new catalog,
permission, network, or persistence policy outside this spec.

## Issue Plan

See `docs/specs/phase-31.5/issues/` and `TASKS.md`.

Dependency map:

```text
I1 -> (I2, I3, I4)
(I2, I3, I4) -> I5
(I1, I2, I3, I4) -> I6
(I4, I6) -> I7
(I2, I3, I5, I6, I7) -> I8
(I1-I8) -> I9
I9 -> Phase 32 I1
```

I2, I3, and I4 are parallel-safe after I1 apart from shared exports/test
fixtures. I5 and I6 may proceed in parallel after their dependencies, but
shared wizard/upgrade entrypoints require merge coordination. No product-level
human gate remains; missing official target evidence degrades to advisory,
unsupported, or unverified rather than expanding the contract.

## Documentation Updates

- Root and package README model-policy/onboarding sections.
- Schema reference and examples, including legacy-v2 behavior.
- `docs/targets/subagent-policy.md` plus Codex, Claude, and Tabnine exact
  capability/status tables.
- CLI reference for init, upgrade, `doctor --models`, and explicit `--probe`.
- Privacy/security documentation for source-free provider contact.
- Mapping-v3 evidence and release notes.
- Local UI help for presets, exact models, status, and overrides.

## Final Review Checklist

- Build a spec-to-test matrix for every MUST, acceptance criterion, status,
  error, and security contract.
- Re-verify all three clients against current official documentation and pin
  tested client versions in mapping-v3 evidence.
- Prove mapping-v2 and disabled-policy byte identity.
- Prove lockfile resolution is deterministic and normal compile cannot remap.
- Prove every network/provider path is explicit and every normal/CI path is
  offline with runtime sentinels.
- Prove probe execution cannot access repository source, secret stores, or
  history and cannot persist raw output or availability.
- Prove Tabnine legacy/private behavior and absence of invented effort claims.
- Review generated exact names and capability-status wording in CLI and UI.
- Run focused tests, full tests, goldens, check, Doctor, package verification,
  and the clean packed journey.
- List remaining client-version, entitlement, and documentation-drift risks.
