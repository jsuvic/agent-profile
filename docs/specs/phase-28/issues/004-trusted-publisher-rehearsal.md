# I4: Trusted-publisher setup + rehearsal + release.md rewrite

## Parent spec or request

`docs/specs/phase-28/001-release-automation.md` (one-time setup; Rollout;
AC6, AC7)

## Intent summary

The maintainer wires npm trust once, proves the pipeline with a dry run,
and the documented release procedure shrinks to two actions.

## Behavior slice

Maintainer-only: configure the trusted publisher (this repository +
`release-verify.yml`) on npmjs.com for `agent-profile`,
`@agent-profile/cli`, and `@agent-profile/web`. Run the 0.4.2 release as
the rehearsal: release-prepare dispatch -> merge bump PR -> auto-tag ->
publish job in `dry-run` -> inspect logs -> re-dispatch live. Rewrite
`docs/release.md` around the two-action flow, keeping the
capability-catalog checklist item from phase-27/002.

## Non-goals

- Any code beyond `docs/release.md`.

## Acceptance criteria

Spec AC6 (dry-run rehearsal) and AC7 (docs); plus `npm view` provenance
spot-check per AC3 on the live run.

## Expected RED proof

Not applicable (human-gate task); the dry-run log standing in for RED:
it must show all guards passing and zero packages published.

## Expected GREEN proof

Live 0.4.2 publish with provenance attestations visible via
`npm view <pkg> --json` (dist.attestations), GitHub Release created,
release.md rewritten.

## Seam under test

The real pipeline end-to-end.

## Allowed mock boundary

None.

## Test command guidance

Pipeline logs + `npm view` checks.

## Likely file ownership

- npmjs.com package settings (maintainer)
- `docs/release.md`

## Dependencies

`human-gate`; requires I1-I3 merged and phase-27 I4 (drift
reconciliation) landed so 0.4.2 has its content.

## Contract impact

Releases become two human actions; manual publish remains possible as
the documented degradation path.

## Security impact

Trusted-publisher scope: one repo, one workflow, per package. 2FA on the
account is unchanged for interactive operations.

## Documentation impact

`docs/release.md` rewrite (the deliverable).

## Implementation context

Rollout section of the spec is the step-by-step. If trusted publishing
is unavailable for any package, stop at the dry-run state - the pipeline
minus publish is Path B and still valuable.

## Review expectations

Dry-run log reviewed before the live dispatch; provenance verified on
all three packages; release.md contains the degradation path.
