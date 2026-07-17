# I1R: Complete v3 profile-schema integration

## Parent spec or request

`docs/specs/phase-31.5/001-model-selection-lifecycle.md`

## Intent summary

Close the gap left by I1: the pure core model-policy module, presets, and
optional lockfile provenance shape are implemented, but `ai-profile.yaml`
parsing/validation never learned the additive v3 `subagentPolicy` fields, so
no profile can actually opt into v3 today.

## Behavior slice

Given an `ai-profile.yaml` with an additive `subagentPolicy.preset` field,
a role entry for `routine-implementer`, and/or an uncatalogued exact model
override, the public parser/validator MUST accept them (preset and role as
typed, optional fields; the exact override as a bounded control-character-free
string that resolves `unverified` rather than being rejected for being
uncatalogued) instead of rejecting the profile. A profile without these fields
MUST continue to parse and validate byte-for-byte as today (mapping-v2
behavior, per I1's already-shipped legacy fallback).

## Non-goals

- Compiler/target adapters, generated Codex/Claude/Tabnine artifacts, or
  goldens (I2/I3).
- Live probing (I4).
- Init/upgrade/Doctor/UI presentation (I5-I8).
- Any new schema key outside the additive fields already described in the
  parent spec's "Proposed additive profile shape."

## Acceptance criteria

- `subagentPolicy.preset` parses as one of `role-aware | quality-first |
  cost-conscious`; absent remains valid and retains mapping-v2 resolution.
- `subagentPolicy.roles.routine-implementer` parses with the same
  capability/effort/overrides shape as every other role.
- An exact override string (role- or target-scoped) that is not present in
  the bundled catalog is accepted by the schema/parser rather than rejected;
  it is not validated against a fixed allowlist, only against
  `validateModelPolicyOverride`'s bounded length/control-character rules.
- A profile with none of the above fields produces byte-identical parsed/
  validated output to before this change.
- Invalid input (empty override, excessive length, control characters,
  unknown preset literal) still produces a clear, existing-style validation
  error.

## Expected RED proof

A focused core parser test loads a minimal profile containing
`subagentPolicy.preset: role-aware`, a `routine-implementer` role entry, and
an uncatalogued exact override string, and the current parser/schema rejects
it (unknown field / unknown role / rejected override).

## Expected GREEN proof

The same fixture parses and validates successfully; a companion test proves
an existing profile without these fields still parses byte-identically, and
that invalid presets/overrides still fail with clear errors.

## Seam under test

`ai-profile.yaml (raw) -> parsed/validated AiProfileSubagentPolicy`.

## Allowed mock boundary

None. Pure parsing/validation, consistent with I1's pure-computation slice.

## Test command guidance

Run focused `packages/core` profile/schema parser tests, then the core
workspace suite, type-check, and the existing disabled/legacy golden
baseline (to confirm no byte drift for profiles that do not opt in).

## Likely file ownership

- `packages/core/src/profile.ts` (parsing/validation only; do not duplicate
  `model-policy.ts`'s pure resolver or catalog logic — import and reuse
  `validateModelPolicyOverride`, `MODEL_POLICY_PRESETS`, and
  `MODEL_POLICY_ROLE_IDS` from it)
- `packages/schemas/ai-profile.schema.json` (or wherever the JSON Schema
  lives) for the additive `preset` field and `routine-implementer` role key
- core parser tests and a new minimal v3-opt-in fixture

## Dependencies

I1 (done — reuse its pure module; do not re-derive catalog/preset data).

## Parallelism notes

Blocks I2 (and I3, I4 to the extent they need `preset`/`routine-implementer`
parsed). Narrow and sequential; not parallel-safe with I2 since I2 needs this
schema surface to exist before it can wire compiler output to it.

## Contract impact

Additive only. Profiles without the new fields remain byte-identical; this
is the same compatibility guarantee I1 already committed to and partially
delivered (pure resolver/lockfile side done, parser side was missing).

## Security impact

Reuse I1's existing bounded/escaped exact-override validation; do not accept
control characters, newlines, or unbounded-length strings. No new attack
surface beyond what I1 already reviewed for the resolver.

## Documentation impact

Schema reference: document the new optional `preset` field and the
`routine-implementer` role alongside the existing `subagentPolicy` schema
section.

## Implementation context

This is a narrow correction to a task already marked `done`, not new scope:
I1's own "Likely file ownership" listed "profile/schema validation and YAML
rendering," and its acceptance criteria required freezing "all presets and
the role-aware table, including `routine-implementer`" and accepting
uncatalogued exact overrides as unrated/unverified. Those criteria were met
in the pure `model-policy.ts` module but never wired into the public parser,
so no real profile can exercise them yet.

## Review expectations

Confirm the three previously-rejected inputs (preset, `routine-implementer`,
uncatalogued override) now parse; confirm zero byte drift for profiles
without v3 fields; confirm invalid presets/overrides still fail clearly;
confirm no duplicated catalog/preset logic was introduced outside
`model-policy.ts`.
