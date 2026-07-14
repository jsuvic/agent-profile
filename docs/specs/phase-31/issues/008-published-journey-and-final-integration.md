# I8: Published permission journey and final integration

## Parent spec or request

`docs/specs/phase-31/001-permission-posture-lifecycle.md`

## Intent summary

Ship one coherent published journey whose docs, package, schema, client
mappings, configure flow, dispatcher, Doctor, and migration behavior agree.

## Behavior slice

Run the packaged `npx agent-profile` and explicit configure journeys against
new, aligned, drifted, incomplete-activation, legacy Autonomous, unsupported,
and unknown-policy repositories; finalize docs and compatibility evidence.

## Non-goals

- New posture behavior beyond I1-I7.
- New client support.
- Enterprise policy management.

## Acceptance criteria

- All Phase-31 acceptance criteria 1-14 pass in the final spec-to-test matrix.
- Root/package README and CLI docs lead with interactive bare usage and explain
  explicit configure/automation boundaries.
- Published-package dry-run contains every required spec/schema/runtime asset
  and no local activation file.

## Expected RED proof

At least one packaged end-to-end scenario or documentation contract fails
before integration because the component slices are not yet assembled.

## Expected GREEN proof

All end-to-end fixtures, package verification, docs links, goldens, and final
review gates pass with no unintended fixture drift.

## Seam under test

Published CLI package invocation against temporary repository fixtures.

## Allowed mock boundary

Temporary filesystem and injected interactive streams only. Use the real packed
CLI and real owned modules; network/client execution remain failing sentinels.

## Test command guidance

Run focused packaged scenarios, every workspace test sequentially, goldens,
check, lint, doctor, verify:pack, `npm pack --dry-run --workspace agent-profile
--json`, and final-review.

## Likely file ownership

- Root/package README and CLI docs
- Phase 31 README, changelog, examples, target/security docs
- Published-package fixtures and final spec-to-test matrix
- Cross-package golden reconciliation only

## Dependencies

`sequenced` after I2-I7.

## Parallelism notes

Final integration only; do not start before behavior slices stabilize.

## Contract impact

No new behavior beyond approved slices. Confirms frozen legacy/noninteractive
surfaces and exact published package contents.

## Security impact

End-to-end sentinels prove no source/secret upload, risky verification,
network, telemetry, client launch, global write, or local activation packaging.

## Documentation impact

All user-facing adoption, migration, client limitation, Doctor, and security
documentation.

## Implementation context

Build the formal MUST/acceptance/error-contract matrix before final review and
mark static-only evidence as weaker than runtime tests.

## Review expectations

Independent spec-compliance review followed by code-quality review; audit exact
golden/pack bytes, published quick-start, security sentinels, and remaining
client-version risks.
