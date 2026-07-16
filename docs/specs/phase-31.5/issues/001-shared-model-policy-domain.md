# I1: Shared model-policy domain and compatibility resolver

## Parent spec or request

`docs/specs/phase-31.5/001-model-selection-lifecycle.md`

## Intent summary

Create one immutable, provider-neutral catalog/preset/resolution contract that
all later compiler, CLI, Doctor, and UI slices consume without recreating model
rankings or compatibility rules.

## Behavior slice

Given canonical role intent, bundled catalog v3, optional exact overrides, and
optional legacy/locked provenance, return one deterministic resolution plan
with exact models, target efforts, alternatives, lifecycle labels, resolution
source, and capability status. Missing v3 preset retains mapping-v2 behavior.

## Non-goals

- Emitting client files or invoking clients.
- Init, upgrade, Doctor, or UI presentation.
- Renaming `subagentPolicy` or deleting mapping v2.

## Acceptance criteria

- Freeze all presets and the role-aware table, including
  `routine-implementer`.
- Exact overrides accept bounded control-character-free strings even when not
  catalogued; unknown values resolve unrated/unverified.
- Historical entries remain addressable and retired entries are excluded from
  ordinary candidates.
- Legacy v2, v3, and locked-resolution precedence are table-driven and deeply
  immutable.
- The optional lockfile model-provenance shape validates and serializes in
  stable order without ephemeral fields.

## Expected RED proof

A focused core test cannot parse the v3 preset or produce a shared immutable
resolution/provenance object, and an uncatalogued exact override is rejected by
the current allowlist.

## Expected GREEN proof

The pure table passes for all presets, clients, lifecycle states, overrides,
legacy rows, and invalid strings; lockfile round-trip tests pass.

## Seam under test

`intent + catalog + prior provenance -> immutable resolution plan`.

## Allowed mock boundary

None. The slice is pure computation.

## Test command guidance

Run focused core and compiler lockfile tests, then their workspace suites,
type-check, and the disabled/legacy golden baseline.

## Likely file ownership

- `packages/core/src/model-policy.ts` (new deeper module) and core exports
- profile/schema validation and YAML rendering
- compiler lockfile types/builders/validation
- pure core/lockfile tests and invalid fixtures

## Dependencies

None. Prerequisite architecture-rescue slice.

## Parallelism notes

Finish before I2-I4. It owns shared vocabulary and lockfile-facing types.

## Contract impact

Additive v3 preset/role/override support and optional lockfile provenance;
legacy mapping-v2 and disabled output remain unchanged.

## Security impact

Bound/escape exact strings and reject control/newline content. Persist no
account, probe, endpoint, prompt, or credential data.

## Documentation impact

Schema reference, ADR 0016 terminology, and mapping-v3 evidence links.

## Implementation context

Do not leave catalog/version ownership split between core descriptors and
compiler resolver tables. Target adapters consume this result; they do not own
rankings.

## Review expectations

Inspect immutability, stable ordering, v2 compatibility, open-override safety,
retired-history retention, and absence of probe fields.
