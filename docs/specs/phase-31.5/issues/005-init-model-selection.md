# I5: Exact role-aware model selection during init

## Parent spec or request

`docs/specs/phase-31.5/001-model-selection-lifecycle.md`

## Amendment (2026-07-17)

I3 shipped `planTabnineModelSettingsWrite` (`packages/compiler/src/model-policy-tabnine-adapter.ts`)
as a pure, fully unit-tested ownership-aware write-plan for
`.tabnine/agent/settings.json`, but explicitly left it unwired from any real
compile/write pipeline — I3's own brief scoped it as a "deterministic
generator" slice (resolution plan -> artifacts/status table), not an
orchestration slice with live filesystem integration. Both I3's spec and
code-quality reviews confirmed this was a legitimate, disclosed scope
reduction for that issue, not a defect, but flagged that the resulting
product gap (Tabnine model selection stays advisory-only in practice) is not
picked up by any other Phase 31.5 issue as originally scoped: I6-I9 all
describe Tabnine only in "manual"/"advisory"/"guided" terms. Per product
decision, this capability stays in Phase 31.5 rather than moving to a
separate phase. I5 is the correct home because it already owns "compile/write
plan integration" (see Likely file ownership) and is where the equivalent
Codex/Claude target-configuration write-preview flow gets built for the first
time — reusing that same seam avoids building project-local
ownership-classification integration twice. See the added acceptance
criterion below and the corresponding I9 amendment.

## Intent summary

Let a new user understand and approve exact model/effort behavior at the moment
they first configure enabled clients, without turning first-run setup into an
expert-only questionnaire.

## Behavior slice

After client selection, interactive init recommends the role-aware preset,
renders exact per-client role/status rows, offers progressive preset/role
customization and a separately consented probe, then includes canonical intent,
target outputs, and lock provenance in the existing preview/write flow.

## Non-goals

- Automatic provider contact, client installation, login, or global writes.
- Live probes in non-interactive init, including flag-based opt-in.
- Hiding exact names behind only `strongest`/`balanced` labels.

## Acceptance criteria

- `role-aware` (recommended), `quality-first`, and `cost-conscious` choices
  display expanded exact model/effort/status tables before selection is
  committed.
- Role-aware is the default; advanced per-role and exact override entry is
  progressive disclosure.
- Probe consent appears immediately before execution and declining preserves a
  complete unverified path.
- Unknown/private exact entry requires explicit advanced intent and is labelled
  unrated/unverified.
- Tabnine uses documented enumeration only or guided manual selection.
- Cancellation and every failure state write nothing; final write uses existing
  exact diff, ownership, atomicity, and lockfile rules.
- Non-interactive init remains offline and exposes no probe-enabling flag in
  this phase. An attempted `--probe-models` combination is rejected before any
  client/provider/package process starts and before any filesystem write.
- I3's `planTabnineModelSettingsWrite` is wired into init's real write-preview
  flow: init classifies `.tabnine/agent/settings.json` ownership (absent,
  Agent-Profile-generated, or unowned) at the existing planner boundary, and
  when the exact selected model is known and ownership is absent or
  generated-owned, the diff-before-write preview offers the deterministic
  `model.id` write alongside the Codex/Claude target preview. An existing
  unowned settings file is always preserved byte-for-byte and the CLI shows
  advisory `/model`/`/about` guidance instead, using the same
  ownership/preview/atomic-write/rollback contracts as every other target
  file. No new JSON-merge or auto-detection heuristic is introduced beyond
  I3's ADR-0020-based whole-file classification.

## Expected RED proof

Wizard tests have no model-selection step, exact resolution preview, consented
probe branch, or v3 lock provenance.

## Expected GREEN proof

Table-driven wizard tests pass for each preset, customize/unknown/Tabnine path,
consent choice, probe result, cancellation, write/no-write outcome, and the
non-interactive invalid-flag/no-call path.

## Seam under test

`interactive answers + resolution/probe ports -> init result and filesystem
effect`.

## Allowed mock boundary

Wizard IO, probe port, and filesystem writer only. Do not mock init policy or
resolution logic.

## Test command guidance

Run focused wizard and CLI init tests, then CLI/core/compiler suites, goldens,
check, Doctor, and pack verification.

## Likely file ownership

- CLI wizard contracts/adapters and init orchestration
- profile candidate/rendering and compile/write plan integration
- CLI tests, fake probe fixtures, help, and examples

## Dependencies

I2, I3, and I4.

## Parallelism notes

May proceed in parallel with I6 after target/probe contracts stabilize; both
touch shared CLI presentation and require merge coordination.

## Contract impact

Interactive init gains an additive model step. Existing explicit flags and
non-interactive behavior remain compatible/offline.

## Security impact

Provider contact is consented; source-free adapter only; no auth/account data;
writes remain project-local, previewed, and explicit.

## Documentation impact

First-run guide, exact preset examples, consent copy, Tabnine manual path, and
the offline non-interactive/invalid-flag contract.

## Implementation context

Reuse the shared wizard presentation vocabulary and do not duplicate target
rankings in CLI code.

## Review expectations

Inspect defaults, exact-name visibility, progressive disclosure, cancel paths,
zero-call decline, unknown labels, and diff-before-write ordering.
