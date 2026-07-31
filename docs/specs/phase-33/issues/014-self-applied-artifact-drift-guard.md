# I14: Fail the build when this repository's own generated artifacts go stale

## Parent spec or request

`docs/specs/phase-33/001-change-risk-review-assurance.md`

Raised 2026-07-31 as a promotion outcome on the second occurrence of one
mechanism (`docs/review-learning/896F5F8050686A23.md`, promotion section).

## Intent summary

This repository self-applies its own compiler output. When a change updates the
golden fixtures but not the checked-in root artifacts, the fix exists and is
not in effect for the agent actually running — and nothing fails.

## Behavior slice

Occurrence history, same mechanism both times:

1. PR #140: the reviewer was half-emitted; the checked-in artifacts did not
   carry what the change had implemented. Reviews there were ad hoc with no
   orchestration behind them, so this occurrence is owed to the I5 backfill and
   is recorded as an owner determination rather than derived from
   `docs/review-learning/`.
2. Phase-33 I8/I9: the change advanced both golden fixture trees but left
   `.claude/agents/change-risk-reviewer.md`, `.codex/agents/change-risk-reviewer.toml`
   and the root `ai-profile.lock` on their pre-change bytes. The reviewer that
   found this was itself running the stale prompt. `npm run check`, `npm test`
   and `npm run verify:pack` all passed with the artifacts stale.

Under the promotion table a second occurrence earns a reviewer regression case
plus a scoped rule, and the table explicitly permits a mechanical guard earlier
when clearly practical and proportionate. A mechanical guard is available and
is preferred to a prompt rule here, because no model judgement is part of the
safe decision — the check is exact.

The guard:

- Assert that a dry-run compile of this repository reports zero `create` and
  zero `change` for its own artifacts.
- Exclude exactly the two intentionally-local files, `.claude/settings.json`
  (owner-held local permission edits) and `.mcp.json` (gitignored local MCP
  server config). Both are reported as changed by a real compile and must not
  fail the guard, and neither may be silently rewritten by it.
- The guard must not write. A dry run that mutates the working tree would be a
  worse defect than the one it detects.

It would have caught both occurrences.

## Non-goals

- Auto-regenerating artifacts in CI or in a hook. The guard reports; a human or
  an explicit step regenerates.
- Widening the exclusion beyond the two named local files.
- Changing artifact ownership, the lockfile format, or `compile` behaviour.

## Acceptance criteria

- A check fails when any generated-owned artifact of this repository diverges
  from what the current compiler emits, with the diverging paths named.
- The check passes on a tree whose artifacts are current, including when the
  two excluded local files differ.
- The check performs no write; proven by a filesystem sentinel rather than by
  inspection.
- It runs as part of an existing gate (`npm run check` or an adjacent script),
  so a stale artifact cannot reach CI green.
- A regression case covers the observed shape: fixtures updated, root artifacts
  not.

## Expected RED proof

Reverting the root reviewer artifacts to their pre-I8/I9 bytes while leaving
the fixtures current fails the new check and names both artifact paths. That
exact state passed every gate before this brief.

## Seam under test

`compiler output -> this repository's checked-in generated-owned artifacts`.

## Likely file ownership

- A script under `scripts/`, wired into the `check` pipeline
- Its focused test

## Dependencies

None blocking.

## Contract impact

Adds a gate. No change to `compile`, artifact ownership, or the lockfile.

## Security impact

The guard must remain read-only and must never print file contents that could
carry secret-shaped values from a local config; report paths and hashes, not
bytes.

## Review expectations

Confirm the no-write property is proven by sentinel and not asserted. Confirm
the exclusion covers exactly the two local files and cannot be widened by
configuration. Push back if the guard regenerates rather than reports.
