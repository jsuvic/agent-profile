# I5: Exact role-aware model selection during init

## Parent spec or request

`docs/specs/phase-31.5/001-model-selection-lifecycle.md`

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
- Live probes in non-interactive init without an explicit flag.
- Hiding exact names behind only `strongest`/`balanced` labels.

## Acceptance criteria

- Recommended, quality-first, and cost-conscious choices display expanded
  exact model/effort/status tables before selection is committed.
- Role-aware is the default; advanced per-role and exact override entry is
  progressive disclosure.
- Probe consent appears immediately before execution and declining preserves a
  complete unverified path.
- Unknown/private exact entry requires explicit advanced intent and is labelled
  unrated/unverified.
- Tabnine uses documented enumeration only or guided manual selection.
- Cancellation and every failure state write nothing; final write uses existing
  exact diff, ownership, atomicity, and lockfile rules.
- Non-interactive init remains offline unless `--probe-models` is explicitly
  supplied and all required non-interactive choices are present.

## Expected RED proof

Wizard tests have no model-selection step, exact resolution preview, consented
probe branch, or v3 lock provenance.

## Expected GREEN proof

Table-driven wizard tests pass for each preset, customize/unknown/Tabnine path,
consent choice, probe result, cancellation, and write/no-write outcome.

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
non-interactive flags.

## Implementation context

Reuse the shared wizard presentation vocabulary and do not duplicate target
rankings in CLI code.

## Review expectations

Inspect defaults, exact-name visibility, progressive disclosure, cancel paths,
zero-call decline, unknown labels, and diff-before-write ordering.
