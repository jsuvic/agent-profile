# I5: Local workflow evidence

## Parent spec or request

`docs/specs/phase-30/001-role-aware-indexed-subagents.md`

## Intent summary

Make role selection, context fallback, delegation bounds, and validation
reviewable without recording repository content or introducing telemetry.

## Behavior slice

The workflow produces a required ephemeral metadata summary. When explicitly
enabled, it appends a redacted repository-local trace with bounded retention.
Both forms reconstruct the policy decision and fallback path from metadata.

## Non-goals

- Exact savings guarantees or cross-run analytics.
- Prompt, source, retrieved chunk, diff, or tool-payload logging.
- Remote upload, telemetry, or default persisted traces.

## Acceptance criteria

Phase-30 acceptance criterion 8.

## Expected RED proof

Evidence tests fail because no event schema, redaction boundary, retention, or
forbidden-content sentinel exists.

## Expected GREEN proof

Event-to-summary/trace tests reconstruct decisions and fallback while forbidden
content, secret, network, default-write, and unbounded-retention sentinels pass.

## Seam under test

`bounded workflow events -> ephemeral summary and optional local trace`.

## Allowed mock boundary

Clock, coarse client token-usage adapter, and atomic local trace writer. Use a
fake writer; do not mock redaction or retention logic.

## Test command guidance

Run focused evidence/redaction/retention tests, workflow integration tests, then
full tests and check.

## Likely file ownership

- Evidence event/schema and reducer
- Redacted local trace writer/retention policy
- Workflow final-report integration, docs, and fixtures

## Dependencies

I2 capsule/orchestration contracts; consume I3 state vocabulary when available.

## Parallelism notes

Can run parallel with I4 after dependencies; coordinate shared CLI/report and
redaction utilities.

## Contract impact

Defines stable metadata fields for summaries and optional trace. Raw paths must
be normalized/redacted; absent client token usage remains `unavailable`, not an
estimate.

## Security impact

Trace off by default and local only. Runtime deny sentinels cover prompts,
source, chunks, diffs, payloads, secrets, environment values, credentials,
telemetry/network, and retention overflow.

## Documentation impact

Evidence field table, enable/disable and retention behavior, privacy boundary,
debug/review examples, and limitations.

## Implementation context

Minimum useful metadata: role, resolved capability/effort, mapping version,
capsule-field presence, indexed state/fallback, tool/subagent/thread counts,
validation outcome, and exposed coarse token usage. Avoid high-cardinality
content-derived identifiers.

## Review expectations

Demonstrate a reviewer can explain why a model/context path was chosen and
whether bounds held, then separately prove no forbidden content can cross the
event or writer boundary.
