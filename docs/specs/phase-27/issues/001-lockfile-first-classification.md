# I1: Lockfile-first classification in the import report

## Parent spec or request

`docs/specs/phase-27/001-import-ownership-lockfile-conformance.md`

## Intent summary

`init --import` and `compile` derive root-instructions ownership from the
same proof order; lockfile-owned files can never be offered regions
adoption.

## Behavior slice

In `buildPhase14ImportReport`, consult `ownershipByPath` for
`root-instructions` entries before marker checks and classify per the
spec's behavior table (generated-owned match/drift -> preserve with the
respective note; mixed without markers -> refuse-conflict; manual-owned ->
preserve, never insert-regions; no entry -> unchanged content flow).
Adjust `recommendStrategy` in `apps/cli/src/wizard.ts`: the legacy-marker
"preserved as manual content" warning fires only without a lockfile
entry; add the drift warning; exclude lockfile-owned files from the
regions-adoption recommendation.

## Non-goals

- Any change to `planRegionAwareWrites` or compile refusals beyond the
  single manual-owned branch authorized by the spec's 2026-07-07
  amendment (skip write, no refusal, report preserved, retain lockfile
  entry).
- Intent reconciliation, upgrade flow, dispatcher (phase-27/002-004).
- Lockfile schema changes.

## Acceptance criteria

Spec acceptance criteria 1-5 (criterion 6, the 0.4.1 release, closes at
release time).

## Expected RED proof

The parity table test and the regression fixture (lockfile entry + legacy
marker + edited bytes) fail against current classification: the report
says manual-preserve while compile says hash-mismatch refuse.

## Expected GREEN proof

Parity holds for every table row; the regression fixture yields
consistent verdicts; all existing phase-14, compiler, and wizard tests
pass unmodified for no-lockfile-entry states.

## Seam under test

`buildPhase14ImportReport(input) -> Phase14ImportReport` (pure given
rootDir fixtures) and `planRegionAwareWrites(rootDir, files)` over the
same fixture directories; `recommendStrategy(report)` pure.

## Allowed mock boundary

Temp-dir fixtures only; no mocks.

## Test command guidance

`npm run test --workspace @agent-profile/compiler` and
`npm run test --workspace @agent-profile/cli`; golden suite after (must
be untouched).

## Likely file ownership

- `packages/compiler/src/import-report.ts`
- `packages/compiler/src/import-report.test.ts` (or phase14 test file)
- `apps/cli/src/wizard.ts` (recommendStrategy warnings)
- `apps/cli/src/wizard.test.ts`
- `CHANGELOG`, `docs/specs/phase-14/README.md` pointer

## Dependencies

None - `ready`. Patch targets 0.4.1.

## Parallelism notes

Standalone; merge before any phase-27/002+ work begins.

## Contract impact

Enforces the existing phase-14/001 proof order; `init --json` report
content changes only for previously-misclassified lockfile-owned/mixed
states (documented as the bug fix).

## Security impact

Closes the duplication hazard (compiler-owned bytes migrating into
manual regions). No new write paths, dependencies, or network.

## Documentation impact

CHANGELOG 0.4.1 entry; phase-14 README pointer.

## Implementation context

The classifier already loads the lockfile (`readLockfileForRegions`) and
builds `ownershipByPath` - the fix threads it into the root-instructions
branch (import-report.ts around lines 288-355). Proof-order step 2:
lockfile v1 whole-file entries count as generated-owned. Compile-side
reference behavior: `planRegionAwareWrites` in `apps/cli/src/index.ts`.

## Review expectations

Every behavior-table row cited to a test; parity proven by test; the
reported real-repository contradiction reproduced then fixed; no
compile-path diffs; goldens byte-identical.
