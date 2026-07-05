# I1: Skill invocation policy (flag table + per-target pin)

## Parent spec or request

`docs/specs/phase-24/001-workflow-upgrade-skills.md`

## Intent summary

Entry-point skills stop consuming model-invocation context where the target
verifiably supports the flag (D9, D10).

## Behavior slice

Compile emits `disable-model-invocation: true` in frontmatter for
`grill-change`, `request-to-spec-issues`, and the WS6 loop skills on
supported targets; guardrail skills (`tdd-change`, `sdd-change`,
`final-review`, `subagent-driven-change`) never carry it; an unsupported
target gets the flag omitted (skill still emitted).

## Non-goals

- `implement-next` (I4 adds it to the policy table when it lands).
- Any new profile key.

## Acceptance criteria

- Spec acceptance criterion 5.
- The policy table is a closed constant with a table-driven test
  (entry point vs guardrail x target support).

## Expected RED proof

A new golden/unit assertion that `grill-change` frontmatter for Claude
contains `disable-model-invocation: true` fails against current output.

## Expected GREEN proof

The assertion passes; the guardrail-skill assertion (no flag) passes; the
Codex variant matches the pinned capability decision (flag present or
omitted per evidence).

## Seam under test

`compile(profile) -> emitted skill frontmatter` via golden fixtures, plus the
policy-table pure function.

## Allowed mock boundary

None (pure functions and fixture comparison).

## Test command guidance

Narrowest compiler test run via `npm run test` (workspace-scoped per
`package.json`), then the golden suite.

## Likely file ownership

- `packages/compiler/src/skill-selection.ts` (or adjacent policy constant)
- `packages/compiler/src/phase12-skill-content.ts`
- `packages/compiler/src/loop-skill-content.ts`
- Golden fixtures for affected targets

## Dependencies

None - `ready`.

## Parallelism notes

Logically parallel-safe with I2/I3, but shares content files - prefer
sequencing merges (recommended order: I2 -> I3 -> I1).

## Contract impact

Frontmatter shape of emitted skills; closed policy table.

## Security impact

None beyond reduced accidental model invocation of entry points (positive).

## Documentation impact

Capability matrix research note (Codex `disable-model-invocation` support)
pinned in `docs/research/`.

## Implementation context

Mirror the phase-21 verified-capability pattern: verify against official
docs at implementation time, pin the evidence, never guess. Unverified
support -> omit the flag.

## Review expectations

Verify the flag table against D10 exactly; check a flag-omitted golden
exists for any unverified target.
