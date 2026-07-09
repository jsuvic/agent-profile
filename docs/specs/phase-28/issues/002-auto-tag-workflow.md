# I2: Auto-tag workflow

## Parent spec or request

`docs/specs/phase-28/001-release-automation.md` (W2; AC2)

## Intent summary

Merging a bump PR creates `v<version>` exactly once; everything else is a
no-op.

## Behavior slice

New `.github/workflows/auto-tag.yml` on push to master: read
`packages/agent-profile/package.json` version via a small
`scripts/release/tag-if-missing.mjs` (unit-tested: version parse, tag
existence, annotated-tag creation command emission); if `v<version>` is
absent, create and push the annotated tag on the pushed commit.
`permissions: contents: write`. Existing tag or non-bump push -> exit 0,
no tag.

## Non-goals

- Publishing (the existing tag-triggered `release-verify.yml` picks the
  tag up; its publish job is I3).
- Any branch or PR automation.

## Acceptance criteria

Spec AC2.

## Expected RED proof

`tag-if-missing.mjs` unit tests (missing tag -> create; existing tag ->
no-op; malformed version -> refuse) fail before the script exists.

## Expected GREEN proof

Tests green; a rehearsal push on a scratch branch (workflow temporarily
targeting it) tags once and no-ops on re-run.

## Seam under test

`tag-if-missing.mjs` pure logic with injected `git tag -l` /
`git push` runners.

## Allowed mock boundary

The git command runner only.

## Test command guidance

Script unit tests; root `check` + `lint`; `verify:pack` (unaffected, run
anyway).

## Likely file ownership

- `.github/workflows/auto-tag.yml`
- `scripts/release/tag-if-missing.mjs` + test

## Dependencies

`ready`. Parallel-safe with I1 (shares the `scripts/release/` directory;
coordinate the test runner entry).

## Contract impact

None to product surfaces. Tags become the release trigger authority.

## Security impact

`contents: write` only; no credentials beyond the ambient GITHUB_TOKEN;
no secret reads.

## Documentation impact

Phase-28 README pointer.

## Implementation context

`release-verify.yml` already triggers on `v*` - creating the tag is the
missing link that connects a master merge to the existing verification
run.

## Review expectations

Idempotence proven by test and rehearsal; the workflow cannot tag
anything but the exact manifest version.
