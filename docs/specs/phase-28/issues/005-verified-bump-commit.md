# I5: Verified bump commit via the GitHub API

## Parent spec or request

`docs/specs/phase-28/001-release-automation.md` (W1 verified-commit
contract; amended 2026-07-10)

## Intent summary

The release-prepare bump PR must merge under a "require signed commits"
branch-protection rule; a runner-side `git commit` is unsigned and blocks.

## Behavior slice

Replace the `git config` + `git commit` + `git push` tail of
`release-prepare.yml` with a `scripts/release/create-bump-commit.mjs`
helper that, after the version/lockfile/changelog edits are made in the
working tree, creates a branch `bump-<version>` and a single commit
through the GitHub API using `GITHUB_TOKEN`, then opens the PR (existing
`gh pr create` is fine). The commit contents must be byte-identical to
what the edits produced (same files, same bytes). W2 (auto-tag) is not
touched.

Signing is outcome-based, not just "use the API": GitHub signs an
API-created commit as `github-actions[bot]` only when the request carries
**no** custom author, committer, or signature fields. Therefore:

- The create-commit request omits author, committer, and signature.
  Prefer GraphQL `createCommitOnBranch` (uses the authenticated identity;
  cannot take arbitrary author fields) over raw Git Data
  blobs/tree/commit; do not port the old `github-actions[bot]`
  name/email into the request.
- After creating the commit, fetch it and assert
  `verification.verified === true`; fail the workflow with a clear
  message otherwise. This guard is mandatory - it makes any regression
  (custom fields, non-signing path) fail loudly instead of silently
  reintroducing the unsigned-commit bug.

## Non-goals

- Any change to auto-tag, the publish job, or the release scripts'
  version/changelog logic.
- Importing a GPG/SSH signing key into CI (rejected: a stored signing
  secret contradicts the no-stored-credential posture; the API path needs
  no key).

## Acceptance criteria

The bump PR commit shows "Verified" on GitHub and is mergeable under a
require-signed-commits rule; the committed tree is byte-identical to the
runner-side edits (versions, lockfile, changelog roll); the create-commit
request carries no custom author/committer/signature fields; the workflow
asserts `verification.verified === true` and fails otherwise; dispatch for
an already-tagged/published version still refuses before creating
anything.

## Expected RED proof

Unit tests fail before the helper exists: (a) the request payload builder
includes no author/committer/signature keys; (b) a post-create guard
throws when `verification.verified` is `false`; (c) a shape assertion in
`workflows.test.mjs` that release-prepare no longer runs `git commit`.

## Expected GREEN proof

Helper unit tests green (no custom-field keys in the request; the guard
throws on unverified and passes on verified); `workflows.test.mjs`
asserts the API-commit path, the verification assertion step, and the
absence of runner-side `git commit`; the next real dispatch produces a
Verified bump commit.

## Seam under test

`create-bump-commit.mjs` pure tree/commit assembly with an injected API
client (mock the GitHub API calls at that seam); the working-tree file
enumeration over a temp fixture.

## Allowed mock boundary

The GitHub API client only. Filesystem via temp fixtures.

## Test command guidance

`npm run test:release`; root `check` + `lint`; `verify:pack` (run anyway);
parse the workflow YAML and confirm no `git commit` remains in
release-prepare, and permissions are `contents: write` +
`pull-requests: write`.

## Likely file ownership

- `scripts/release/create-bump-commit.mjs` + test
- `.github/workflows/release-prepare.yml` (replace the commit/push tail)
- `scripts/release/workflows.test.mjs` (shape assertions)

## Dependencies

`ready`. Standalone follow-up fix; does not block the 0.4.2 release
(which proceeds on the manually re-signed bump commit).

## Contract impact

W1 gains `pull-requests: write` (already needed for the PR) and keeps
`contents: write`; no new secret. The bump commit becomes verified.

## Security impact

No stored credential; uses only the ambient `GITHUB_TOKEN`. No signing
key imported. No change to the publish path or its OIDC posture.

## Documentation impact

Already covered by the spec amendment; add a `docs/release.md` note that
bump commits are API-signed (folds into the pending release.md rewrite,
PR #79, if still open).

## Implementation context

The current failing tail is `release-prepare.yml` ~lines 60-67
(`git config` + `git commit -m "Release ${VERSION}"` + `git push` +
`gh pr create`). The first live 0.4.2 run hit this: the bump PR (#80) was
blocked by "Commits must have verified signatures" and had to be
re-signed by hand. Reference: the GitHub Git Data API (`POST
/repos/{o}/{r}/git/blobs|trees|commits|refs`).

## Review expectations

Verified badge on the produced commit; tree byte-identical to the edits;
no `git commit` in release-prepare; helper tree assembly unit-tested;
no signing secret anywhere.
