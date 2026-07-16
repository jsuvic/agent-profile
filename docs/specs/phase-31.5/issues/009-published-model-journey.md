# I9: Published model-selection journey and final integration

## Parent spec or request

`docs/specs/phase-31.5/001-model-selection-lifecycle.md`

## Intent summary

Prove that consumers of the packed packages receive one coherent model
lifecycle, not only passing workspace-unit tests and generated documentation.

## Behavior slice

From clean packed workspace artifacts, run a fake-client journey covering new
init, optional probe consent, exact preview/write, compile/Doctor, mapping-v2
retain, v3 upgrade/adopt, Tabnine manual/private selection, and final
provenance. Complete the spec-to-test matrix and release documentation.

## Non-goals

- Live provider calls, publishing packages, or Phase 32 implementation.
- Re-testing unrelated product journeys beyond shared-contract regression.

## Acceptance criteria

- Release test builds every required workspace before packing and installs only
  the packed artifacts in an isolated fixture.
- The journey uses fake clients and proves zero external network/provider calls.
- It covers role-aware default, exact table/status, probe decline and one
  normalized probe path, Tabnine organization/private manual path, normal
  compile lock reuse, upgrade retain/adopt, and offline Doctor.
- Published help/docs/schema/package contents include every required runtime
  asset and no test-only catalog/probe fixture.
- Full tests, goldens, check, Doctor, pack verification, and documentation links
  pass.
- The final matrix maps every MUST, acceptance criterion, status/error, and
  security rule to focused runtime evidence or calls out static-only evidence.
- Phase 32 I1 remains sequenced until I9 is done.

## Expected RED proof

The current packed CLI has no v3 model journey; a clean release-only run cannot
exercise fake probes, lock reuse, exact upgrade, or Tabnine private selection.

## Expected GREEN proof

The focused packed journey and final matrix pass from a clean build, followed
by all required repository validation.

## Seam under test

`packed CLI + isolated filesystem + fake clients -> published lifecycle outcome`.

## Allowed mock boundary

Client executables, package metadata HTTP lookup, clock, and isolated
filesystem. Product model/CLI/compiler/Doctor code remains real.

## Test command guidance

Build required workspaces first; run the focused published journey, standalone
release suite, full tests, goldens, check, Doctor, and pack verification.

## Likely file ownership

- release/published journey script and fixtures
- package file-list fixtures where new runtime assets are required
- phase-31.5 final spec-to-test matrix and release notes
- final documentation consistency fixes

## Dependencies

I1-I8.

## Parallelism notes

Final integration only. Phase 32 I1 depends on completion.

## Contract impact

No new product behavior beyond I1-I8; proves packaged delivery and freezes the
acceptance evidence.

## Security impact

No provider/network calls, no secret/source fixtures, and package test runs in
an isolated temporary root.

## Documentation impact

Final matrix, release notes, validation record, and any parity repair.

## Implementation context

Reuse the Phase 31 lesson: release-only tests must build required workspaces
before `npm pack` so missing `dist` assets cannot make the suite red by design.

## Review expectations

Review the spec-to-test matrix line by line, inspect packed file lists, confirm
fake-client/network isolation, and verify no Phase 32 or unrelated changes.
