# I3: Upgrade command, insertion editor, and report mode

## Parent spec or request

`docs/specs/phase-27/002-upgrade-flow.md`

## Intent summary

Make newly shipped capabilities reachable while preserving
`ai-profile.yaml` as user-owned intent through conservative, insertion-only
edits.

## Behavior slice

Add `agent-profile upgrade` with keep/adopt/customize interactive choices,
preview-first confirmation, non-interactive reporting, and the explicit
`--write --adopt-recommended` mutation path. Apply accepted additions through a
comment-preserving YAML Document editor, stamp `upgrade.catalogVersion` only on
a successful write, and add the interactive-only init pointer.

## Non-goals

- Changing existing profile values, removing capabilities, or re-rendering the
  profile.
- Per-pack decline memory, drift reconciliation, or the no-args dispatcher.
- Chaining compile after upgrade.
- Any network, telemetry, dependency, or permission-posture change.

## Acceptance criteria

Spec acceptance criteria 1-7, including the insertion-only sentinel,
comment/format byte preservation, refusal fixture, scripted mutation pair, and
frozen non-interactive init surfaces.

## Expected RED proof

CLI flow tests cannot dispatch `upgrade`; editor byte tests show no safe
insertion API; the init interactive pointer assertion is absent.

## Expected GREEN proof

Keep/adopt/customize/cancel and non-interactive matrices pass; only inserted
bytes differ in profile fixtures; refusals print exact manual lines without
partial writes; successful writes atomically update profile and lockfile; all
frozen init goldens remain byte-identical.

## Seam under test

Orchestration: injected CLI prompts plus temp-directory files observe report,
diff, confirmation, exit status, and atomic writes. Deterministic editor:
`planProfileInsertions(source, selectedCapabilities) -> edit plan/refusals` with
byte comparison outside insertions.

## Allowed mock boundary

Injected prompt adapter and temp filesystem only. Do not mock the catalog,
editor, lockfile writer, or CLI orchestration under test.

## Test command guidance

Run focused CLI tests first, then core/compiler tests, repository goldens, and
doctor/check. Exercise both TTY and non-TTY surfaces through existing injected
CLI seams.

## Likely file ownership

- `apps/cli/src/index.ts` command dispatch and orchestration
- Existing CLI prompt adapter/wizard modules and focused tests
- A focused insertion-editor module and byte-preservation fixtures
- Compiler lockfile write seam consumed from I2
- `README.md`, `CHANGELOG.md`, phase-27 docs, release checklist

## Dependencies

`sequenced` after phase-27 I2.

## Parallelism notes

Not parallel-safe with I2. Coordinate `apps/cli/src/index.ts` ownership with
phase-27 I4 if drift reconciliation is approved before this issue lands.

## Contract impact

Adds a top-level CLI command and explicit flags; adds one interactive-only init
line. Non-interactive init output and existing command behavior remain frozen.

## Security impact

All operations remain local. Writes use diff, approval, and one atomic commit;
refusal is fail-closed with no partial mutation. Existing safety and permission
fields are never editable through this flow.

## Documentation impact

Document the command and flags, upgrade report semantics, catalog release rule,
and no implicit compile behavior in README/CHANGELOG/phase-27 materials.

## Implementation context

Consume the I2 catalog and provenance APIs instead of duplicating detection.
Follow phase-26 prompt framing and cancellation contracts. Use the installed
`yaml` Document API and reject unsafe target shapes (flow sequences and anchors)
instead of falling back to parse-and-render. Reuse the established diff,
approval, and atomic-write path.

## Review expectations

Build the full spec-to-test matrix for acceptance criteria 1-7. Require runtime
sentinels for no network/source upload/secret read and mutation boundaries;
table-drive CLI error/status/redaction behavior; verify every existing byte
outside inserted regions and every frozen init surface.
