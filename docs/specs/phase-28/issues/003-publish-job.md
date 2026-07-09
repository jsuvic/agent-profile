# I3: Publish job + dry-run gate + GitHub Release

## Parent spec or request

`docs/specs/phase-28/001-release-automation.md` (W3; Contracts; AC3-AC6)

## Intent summary

A tag run verifies, then publishes all three packages with provenance via
OIDC - guarded, ordered, idempotent, rehearsable.

## Behavior slice

Extend `.github/workflows/release-verify.yml` with a `publish` job that
`needs` the existing verification job and runs only on `v*` tag refs
(plus a `workflow_dispatch` `dry-run` input). Steps: guard script
(tag commit is ancestor of master; tag version equals wrapper/cli/web
manifests - reuse I1 guards), then `npm publish --provenance` for
`@agent-profile/web`, `@agent-profile/cli`, `agent-profile` in that
order, each behind the already-published skip; `--dry-run` substituted
when the input is set. Create a GitHub Release from the tag with the
matching CHANGELOG section (I1 roll logic exposes the extractor).
`permissions: id-token: write` (+ `contents: write` for the Release) on
this job only.

## Non-goals

- npm trusted-publisher configuration and the live rehearsal (I4).
- Any change to the existing verification steps.

## Acceptance criteria

Spec AC3, AC4, AC5, AC6.

## Expected RED proof

Guard/extractor unit tests (ancestor check, version equality matrix,
changelog-section extraction) fail before the scripts exist.

## Expected GREEN proof

Script tests green; workflow lints (actionlint or push-parse); dry-run
dispatch on a scratch tag walks the full job publishing nothing.

## Seam under test

Guard and extractor scripts with injected git/registry runners; the
workflow itself is proven by the I4 rehearsal.

## Allowed mock boundary

Git and registry command runners only.

## Test command guidance

Script unit tests; root `check` + `lint`; `verify:pack` (run anyway).

## Likely file ownership

- `.github/workflows/release-verify.yml` (publish job appended)
- `scripts/release/publish-guards.mjs`, `changelog-section.mjs` + tests

## Dependencies

`sequenced` after I1 (reuses its guard/roll modules).

## Contract impact

Publish authority moves to the workflow identity (ADR 0012); the
verification steps become a hard publish precondition in the same run.

## Security impact

No stored npm credential (grep-proof: no `NODE_AUTH_TOKEN`/`NPM_TOKEN`
anywhere); `id-token: write` scoped to this job; fork PRs never reach
tag triggers; provenance on for all three packages.

## Documentation impact

Phase-28 README pointer; release.md rewrite lands in I4.

## Implementation context

Publish order matters because the packages pin each other exactly
(web <- cli <- wrapper). Idempotent skip is the recovery path for a
mid-sequence failure: fix, re-run, earlier packages skip.

## Review expectations

AC3-AC6 each cited to a test or the rehearsal plan; permissions diff
reviewed line-by-line; no secret reference introduced.
