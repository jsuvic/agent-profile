# I6: Published guided-update journey and final integration

## Parent spec or request

`docs/specs/phase-32/001-guided-repository-update.md`

## Intent summary

Ship one packaged repository-update journey in which permission configuration,
custom future ownership, capability review, profile apply, and compile consent
tell a consistent user story.

## Behavior slice

The packed CLI runs the field scenario end to end after Phase 31.5: exact local
permission source routes to configure; valid custom MCP is preserved and
explained; adopt-all enters editable review; supported YAML applies after
consent; compile remains separately confirmed; final Doctor output contains
only intended info/unknown findings.

## Non-goals

- New behavior beyond Phase 31 and Phase 32 approved slices.
- MCP schema support, server verification, or new clients.
- Enterprise policy management.

## Acceptance criteria

- Phase-32 acceptance criterion 10 and the final matrix for criteria 1-10.
- The published field fixture proves the complete staged journey and every
  consent boundary.
- Root/package README and CLI docs explain configure versus upgrade, custom MCP
  ownership, editable review, apply, and compile.
- Package dry-run contains required runtime metadata and no personal/local
  configuration.

## Expected RED proof

At least one packed field-journey or documentation contract fails before the
component slices are integrated.

## Expected GREEN proof

The packed field journey, frozen contracts, docs links, golden/pack fixtures,
and final spec-to-test matrix all pass with no unintended drift.

## Seam under test

Published CLI package invocation against temporary field-scenario repositories.

## Allowed mock boundary

Temporary filesystem and injected interactive streams only. Use the real packed
CLI; network, MCP/client execution, environment/secret reads, telemetry, and
hosted execution remain failing sentinels.

## Test command guidance

Run focused packed field scenarios, every workspace test sequentially, goldens,
check, lint, Doctor, verify:pack, `npm pack --dry-run --workspace agent-profile
--json`, and final-review.

## Likely file ownership

- Root/package README and CLI/Doctor/ownership docs
- Phase 32 README, changelog, package fixtures
- Packed end-to-end field fixtures and final spec matrix

## Dependencies

`sequenced` after Phase 32 I2 and I5.

## Parallelism notes

Final integration only; do not begin until preservation and interactive-flow
slices stabilize.

## Contract impact

No behavior beyond approved Phase 31/32 slices. Confirms frozen automation,
legacy, generated-output, and package contracts.

## Security impact

End-to-end sentinels prove no source/secret upload, MCP/client launch, network,
telemetry, hosted execution, dependency installation, unsafe auto-approval, or
personal configuration packaging.

## Documentation impact

Complete user-facing repository-update journey and limitation guidance.

## Implementation context

Build the formal MUST/acceptance/refusal/error/info matrix before final review.
Static-only evidence is insufficient for byte preservation and forbidden side
effects.

## Review expectations

Independent spec compliance followed by code-quality review; audit exact pack
contents, consent transitions, byte sentinels, issue guidance, and remaining
future-schema/client-version risks.
