# I8: Local UI model policy and user documentation

## Parent spec or request

`docs/specs/phase-31.5/001-model-selection-lifecycle.md`

## Intent summary

Expose the exact model lifecycle in Agent Profile's local interface and public
documentation so users do not need to infer behavior from YAML, lockfiles, or
abstract capability names.

## Behavior slice

The local profile UI round-trips legacy and v3 policy, presents preset and
advanced role controls, and renders the same exact model/effort/status/
alternative rows as CLI preview. Documentation explains init, upgrade, Doctor,
Tabnine legacy/private behavior, and trust boundaries. The UI never probes.

## Non-goals

- Provider calls from the web process/browser.
- Global client configuration or account/quota dashboards.
- A generic model marketplace or remote catalog UI.

## Acceptance criteria

- Loading and saving through the UI preserves all legacy/v3 roles, presets,
  exact overrides, unknown IDs, and unrelated profile fields.
- Role-aware is recommended and exact mappings are visible before edit/write;
  quality-first/cost-conscious and advanced overrides are progressively exposed.
- Each target surface displays configured/advisory/unsupported/unverified and
  Tabnine organization/private labels consistently with CLI.
- Retired catalog entries are hidden from normal pickers but preserved when an
  existing profile/lock references them.
- UI read/preview starts no client/network process and cannot display ephemeral
  account results.
- Root/package README, schema, target, CLI, privacy, and release docs state
  implemented behavior only and identify advisory/unsupported gaps.

## Expected RED proof

Current UI state does not represent the v3 preset/open override/provenance
preview and documentation still points to mapping v2 subagent-only behavior.

## Expected GREEN proof

Focused UI round-trip/render tests and documentation contract checks pass for
legacy, v3, unknown, retired, and all target capability statuses.

## Seam under test

`profile + deterministic resolution -> UI editor state and rendered preview`.

## Allowed mock boundary

Local profile/filesystem load-save adapter only. No provider or probe mock is
needed because UI probing is forbidden.

## Test command guidance

Run focused web state/route tests and docs link/check tests, then web/core/
compiler suites, goldens, check, and package verification.

## Likely file ownership

- web profile state/components/routes and tests
- shared presentation data from core/compiler
- README/package README, schema, target, CLI, privacy, and release docs

## Dependencies

I2, I3, I5, I6, and I7.

## Parallelism notes

Sequenced after behavior stabilizes to avoid duplicating interim mappings and
status wording.

## Contract impact

UI/profile round-trip expands additively; no live external behavior is added.

## Security impact

Local-only, no probe/network, no account data, exact diff/write rules retained.

## Documentation impact

Primary deliverable of this slice.

## Implementation context

Consume the same resolution/status DTO as CLI. Do not embed a second model
catalog in Svelte components or prose tests.

## Review expectations

Check field preservation, exact-name visibility, status wording, retired/private
handling, no-network sentinels, and root/published-package documentation parity.
