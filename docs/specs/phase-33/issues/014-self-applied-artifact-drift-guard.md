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
   orchestration behind them, so no `review-learning/v1` record exists for it.
   This occurrence is an OWNER DETERMINATION, recorded here and in the I8/I9
   record, and is not derivable from `docs/review-learning/`.

   It is explicitly NOT owed to I5: that brief is scoped to PRs #125 and
   #127-#133, and expanding beyond those eight is one of its non-goals, so I5
   neither owns nor will supply this occurrence. Anyone auditing the promotion
   count later must take it from the owner determination or normalize #140
   separately; I5 must not be cited as its source, and must not double-count
   #140 if its scope is ever widened.

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
- Compare the COMMITTED bytes, not the working copy. The two files that differ
  locally are not equivalent and must not be exempted alike:
  - `.claude/settings.json` is tracked, emitted by the `claude-settings`
    target, and recorded `generated-owned` in `ai-profile.lock`. Exempting it
    would let a stale generated-owned artifact pass the very gate this brief
    adds. The guard verifies the committed artifact; an owner's working-copy
    override is tolerated separately and never rewritten.
  - `.mcp.json` is gitignored and untracked, so there is no committed artifact
    to verify. It is out of scope here; its contradictory ownership is
    phase-27 I8.
- The guard must never rewrite either file.
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
