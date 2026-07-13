# I6: Adoption, upgrade, documentation, and final integration

## Parent spec or request

`docs/specs/phase-30/001-role-aware-indexed-subagents.md`

## Intent summary

Integrate the completed policy safely, make adoption explicit, and give users a
capability-accurate path from absent CCE through ready or degraded operation.

## Behavior slice

Examples, wizard/upgrade offers, generated guidance, package docs, and final
integration present the opt-in policy without changing existing profiles. The
full workflow passes packaging and a spec-to-test final review.

## Non-goals

- Automatic adoption, install, indexing, approval, or model remapping.
- A second indexed provider.
- Unsupported Tabnine subagent/MCP/model claims.

## Acceptance criteria

Phase-30 acceptance criterion 9 plus final satisfaction of criteria 1-8.

## Expected RED proof

Adoption/docs/golden checks fail because the new capability is not offered or
explained and the full spec-to-test matrix is incomplete.

## Expected GREEN proof

Opt-in flows, docs, goldens, full tests, doctor/check, packaging verification,
and final-review matrix all pass with legacy profiles unchanged.

## Seam under test

`existing or explicitly adopting profile -> upgrade/compile/package user
experience`.

## Allowed mock boundary

None for deterministic compile/upgrade planning; CLI filesystem effects use
the established test adapter only.

## Test command guidance

Run focused upgrade/wizard/docs checks, all unit and golden tests sequentially,
`npm run check`, doctor where available, and `npm run verify:pack`.

## Likely file ownership

- Wizard/upgrade adoption planning and examples
- Root/package READMEs, CLI/schema/security docs, capability research
- Generated docs/goldens, package manifests/fixtures if required
- Final spec-to-test matrix

## Dependencies

I1-I5 complete; I4 and I5 are direct final blockers.

## Parallelism notes

Final integration slice; serialize after upstream shared-file changes.

## Contract impact

Adoption is additive and explicit. Existing profiles and disabled policy remain
byte-identical; current public CLI/report surfaces change only where phase-30
spec explicitly adds commands/options.

## Security impact

Audit the combined flow for source/secret upload, telemetry, silent mutation,
global config changes, hidden approval, unbounded trace, and unsafe fallback.

## Documentation impact

All phase-30 documentation updates, including separate Codex and Claude CCE
registration/approval notes and capability-accurate Tabnine limits.

## Implementation context

Lead docs with the user problem and opt-in benefit. Describe CCE as recommended,
not required; distinguish installed, indexed, registered, approved, healthy,
and session-exposed. Do not promise a savings percentage.

## Review expectations

Run `final-review` with a row for every MUST, acceptance criterion, error code,
and security claim. Prefer runtime sentinels for local-only/no-upload/no-secret/
no-telemetry and label any static-only evidence as weaker.
