# I5: Flow guidance conformance patch (0.4.3)

## Parent spec or request

`docs/specs/phase-27/006-flow-guidance-patch.md`

## Intent summary

Every next-step line the CLI prints is state-computed and correct to
follow verbatim; questions without a real decision are skipped; the
picker and plan say what will actually be produced.

## Behavior slice

The spec's seven binding behaviors: (1) lockfile-missing guidance names
`compile --write`; (2) upgrade runs without a lockfile (report via the
seeding rule; write defers the catalogVersion stamp with a note);
(3) init next-step lines are state-computed and ordered (compile --write
before any upgrade suggestion; upgrade suggested only when it can
succeed); (4) compile dry-run ends with the nothing-written +
`--write` hint; (5) the wizard strategy question is skipped with a note
when the scan finds no root instruction files (outcome = old default,
`preserve`); (6) capability-picker client-applicability hints + plan
note for packs producing no artifacts for the selected clients;
(7) write-mode reports labeled "state after write".

## Non-goals

- The no-args dispatcher (phase-27/004), back-navigation (dropped),
  Tabnine skill emission (phase-29).
- Any change to generated artifacts, schemas, lockfile format, or
  ownership machinery.

## Acceptance criteria

Spec 006 acceptance criteria 1-6 (criterion 7, the 0.4.3 release,
closes at release time).

## Expected RED proof

The AC1 advice-path integration test reproduces the reported dead-end
today (upgrade fails after following printed advice through compile
dry-run); the seeding, skip, hint, and label tests fail before
implementation.

## Expected GREEN proof

Advice-path test walks init -> printed advice -> compile --write ->
upgrade with zero failures on a temp dir; all seven behavior tests
green; golden diff contains only the enumerated corrected texts.

## Seam under test

Message/state matrix via pure formatters and `runCli` over temp dirs;
wizard skip via injected prompts; upgrade seeding via profile-only
fixtures (no lockfile).

## Allowed mock boundary

Temp-dir fixtures and injected prompts/streams only.

## Test command guidance

`npm run test --workspace @agent-profile/cli`; root `check` + `lint`;
`npm run verify:pack` (run regardless); golden suite - expect diffs ONLY
in the enumerated texts, byte-identical elsewhere.

## Likely file ownership

- `apps/cli/src/index.ts` (messages, next-step computation, dry-run
  hint, report label, upgrade lockfile-optional path)
- `apps/cli/src/wizard.ts` + `wizard-clack.ts` (strategy skip, picker
  hints)
- tests; goldens for enumerated texts; CHANGELOG

## Dependencies

`ready` (spec approved 2026-07-10). Standalone; merge before phase-29 I1
to keep golden churn separable.

## Contract impact

Behavior-corrective text changes to enumerated outputs (documented in
CHANGELOG); `--json` shapes unchanged; `WizardOutcome` semantics
unchanged; upgrade requires no lockfile per the spec-002 seeding rule.

## Security impact

No new write paths, network, or dependencies; every refusal still
refuses - guidance only names working commands.

## Documentation impact

CHANGELOG 0.4.3 entry enumerating corrected texts; README/docs command
examples quoting old advice.

## Implementation context

The dead-end: `apps/cli/src/index.ts:407` (message), `:1577`/`:1690`
(unconditional upgrade advice); the strategy prompt is unconditional at
`apps/cli/src/wizard.ts:756`. Compile's dry-run/write mode split lives
in runCompile (~771). The 0.4.2 field log in the phase-27 findings
review is the reproduction script for AC1.

## Review expectations

AC1 integration test present and green; golden diff audited against the
enumerated list; refusal semantics unchanged; advice lines verified
against actual command defaults (compile defaults to dry-run).
