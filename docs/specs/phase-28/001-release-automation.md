# Spec: Release Automation (auto-tag + OIDC trusted publishing)

## Status

Approved 2026-07-09. Synthesized from the release-automation
design-it-twice (Path A chosen over semi-automatic Path B). Accepts ADR
0012.

## Problem

Releasing is a six-step manual procedure with two demonstrated failure
modes: 0.4.0 was published from an uncommitted tree (no commit reproduces
the artifact), and no git tags existed until v0.4.1, so the changelog
had to be reconstructed from bump commits. npm 2FA makes the publish step
manual OTP ceremony three times per release, and nothing prevents a
mismatch between the published version, the tag, and master.

## Goal

A release is two human actions: trigger the release-prepare workflow,
then merge the bump PR. Everything else - tag creation, verification,
npm publish with provenance, GitHub Release - is automatic, guarded, and
idempotent. No long-lived npm credential exists anywhere.

## Intent

Automate the ceremony, not the judgment: the human still decides what
ships (bump PR review and merge). CI gains publish authority only through
short-lived OIDC identity, never a stored token, and every published
artifact is reproducible from a tagged master commit with provenance
attestations.

## Decision Rules

1. Credential doubt -> OIDC identity only; a stored npm token is a spec
   violation, not a fallback.
2. State doubt -> refuse and stay idempotent: skip already-published
   versions, never re-tag, never partially publish on guard failure.
3. Logic placement doubt -> testable `scripts/release/*.mjs` invoked by
   thin workflows; workflow YAML carries wiring, not logic.
4. Authority doubt -> publish only from a `v*` tag whose commit is on
   master and whose version equals every package manifest.

## Non-Goals

- The security-review GitHub Action (sibling candidate, phase-28/002).
- Publishing from any ref other than a tag reachable from master.
- Automating the npm trusted-publisher configuration (one-time manual
  setup on npmjs.com, documented here, performed by the maintainer).
- Changing `verify.yml` (PR/master CI) or any product behavior - this is
  repository tooling; APC itself gains no execution or network path.
- Release notes beyond the rolled CHANGELOG section.

## Design

Three pieces; existing `release-verify.yml` (already tag-triggered) is
extended rather than replaced.

### W1 - release-prepare (workflow_dispatch, or local script)

Input: explicit version, or `patch`/`minor` auto-increment. Runs
`scripts/sync-versions.mjs <version>`, refreshes the lockfile
(`npm install --package-lock-only`), rolls the CHANGELOG `Unreleased`
section into `## <version> — <date>` (fresh empty `Unreleased` added),
runs `verify-package-metadata`, and opens the bump PR. Refuses when the
target version is already tagged or published.

Verified-commit contract (amended 2026-07-10 from the first live run):
the bump commit is created through the GitHub API using the ambient
`GITHUB_TOKEN`, not `git commit` on the runner. GitHub signs an
API-created commit as `github-actions[bot]` **only when the request
carries no custom author, committer, or signature fields** (GitHub bot
signature-verification rule); supplying those fields - the natural
carry-over from the old `git config user.name`/`git commit` - produces an
unsigned commit that fails the rule again. The contract is therefore
outcome-based, not mechanism-only:

- The create-commit request omits author, committer, and signature
  entirely. A signing-capable path is required: GraphQL
  `createCommitOnBranch` (which uses the authenticated identity and
  cannot take arbitrary author fields) is preferred over raw Git Data
  blobs/tree/commit for exactly this reason.
- After creation, the workflow fetches the commit and asserts
  `verification.verified === true`, failing the run otherwise. This guard
  catches any implementation that reintroduces custom fields or uses a
  non-signing path, so the bug cannot silently return.

W2 (auto-tag) is unaffected: it tags an already-merged, already-signed
master commit, and the "require signed commits" rule does not govern tag
refs.

### W2 - auto-tag (push to master)

Reads `packages/agent-profile/package.json` version; if tag `v<version>`
does not exist, creates and pushes an annotated tag on that commit.
`permissions: contents: write`. Tag-if-missing makes every re-run a
no-op; non-bump pushes are no-ops by construction.

### W3 - publish job (appended to release-verify.yml, tag-triggered)

Runs only after the existing verification steps pass in the same run
(check, test, goldens, verify:pack, baseline-age gate). Guards, then
publishes `@agent-profile/web` -> `@agent-profile/cli` -> `agent-profile`
via `npm publish --provenance` (`--access public` on the scoped
packages), using npm trusted publishing (OIDC). `permissions: id-token:
write` is scoped to this job only. Skips any package whose version is
already on the registry (idempotent re-runs). Creates a GitHub Release
from the tag with the matching CHANGELOG section.

Two gates on live publishing (amended 2026-07-09 from the I3 review):

1. Arm switch. A live (non-dry-run) publish proceeds only when the
   repository variable `RELEASE_PUBLISH_ENABLED` equals `"true"`. When it
   is unset, an auto-tag push still runs the full verification and the
   publish job, but the live publish step is skipped with an explicit
   "publisher not armed" message. This exists because the workflow
   triggers on `push: tags: v*` (auto-tag) as well as `workflow_dispatch`,
   so without the switch the very first pushed tag would publish live
   before any rehearsal could run. The switch is set once, after the
   dry-run rehearsal succeeds, and steady state is then fully automatic.
   It doubles as a permanent publish kill-switch.
2. Dry-run rehearsal. The `dry-run` workflow_dispatch input runs the full
   job with `--dry-run` appended to the exact same publish arguments used
   live (so `--provenance` and `--access public` are exercised), and
   publishes nothing. Dry-run ignores the arm switch (it is safe by
   construction).

Build-arg contract: the dry-run command is the live command plus
`--dry-run` - never a separately constructed command - so a passing
rehearsal proves the live argument set.

### One-time manual setup (maintainer)

On npmjs.com, configure the trusted publisher (this repository +
`release-verify.yml`) for each public package: `agent-profile`,
`@agent-profile/cli`, `@agent-profile/web`. No token is created.

## Inputs

Version input to W1; `packages/agent-profile/package.json` as the version
source of truth; CHANGELOG `Unreleased` section; `v*` tags.

## Outputs

Bump PR (versions, lockfile, rolled changelog); annotated `v<version>`
tag; three npm packages published with provenance; a GitHub Release.

## Contracts (binding)

- No long-lived npm credential in the repository, GitHub secrets, or
  workflow env - the absence is asserted by review and by the workflow
  containing no secret reference for npm.
- `id-token: write` appears only on the publish job; every other job and
  workflow keeps `contents: read` (plus `contents: write` for W2's tag
  push and the GitHub Release step, and `contents: write` +
  `pull-requests: write` on W1 for the API commit and bump PR).
- W1's bump commit is created via the GitHub API (verified/signed by
  GitHub), never `git commit` on the runner, so it satisfies a
  "require signed commits" branch-protection rule.
- Publish preconditions, all mechanical: tag commit is an ancestor of
  master; tag version equals the wrapper, cli, and web manifest versions;
  verification steps passed in the same workflow run.
- Publish order is web -> cli -> wrapper (exact-pin dependency order);
  a mid-sequence failure leaves earlier packages published and the re-run
  skips them (idempotence is the recovery path).
- All three packages publish with `--provenance`; scoped packages
  (`@agent-profile/web`, `@agent-profile/cli`) add `--access public`.
- A live publish requires `vars.RELEASE_PUBLISH_ENABLED == "true"`; unset
  skips the live publish step with an explicit message (auto-tag pushes
  still verify). Dry-run ignores the switch. The dry-run publish command
  is exactly the live command plus `--dry-run`.
- Release logic lives in `scripts/release/*.mjs` with unit tests
  (changelog roll, version/tag guard, already-published check); workflow
  YAML stays thin wiring.
- Third-party actions stay pinned per existing repo convention.

## Security Rules

- No stored npm token, ever (ADR 0012); OIDC identity is the only
  publish authority.
- No secrets read or echoed; publish logs never print registry tokens
  (there are none) or environment values.
- The publish job runs only on `v*` tag refs of this repository; fork
  PRs never reach it (tag triggers do not fire for forks).
- Provenance attestations on for every package.
- This automation grants APC-the-product no network, execution, or
  hosted path; product principles are untouched.

## Acceptance Criteria

1. W1 dispatch produces a bump PR containing exactly: synced versions,
   refreshed lockfile, rolled changelog with fresh `Unreleased`, and
   passing metadata verification; dispatch for an already-tagged version
   refuses with a clear message.
2. Merging the bump PR creates tag `v<version>` exactly once; re-running
   W2 or pushing unrelated commits creates no tag.
3. The tag run verifies first and publishes web -> cli -> wrapper with
   provenance; `npm view <pkg>` shows the new version with provenance
   attestation.
4. Re-running the tag workflow after a successful publish is a complete
   no-op (all three skipped), exit green.
5. A tag whose version mismatches the manifests, or whose commit is not
   on master, refuses before any publish.
6. The `dry-run` input rehearses the full job with `--dry-run` appended
   to the live publish arguments (`--provenance`, and `--access public`
   on scoped packages) and publishes nothing.
7. With `RELEASE_PUBLISH_ENABLED` unset, an auto-tag push runs
   verification and reaches the publish job but skips the live publish
   with a "publisher not armed" message and no registry mutation; setting
   it to `"true"` lets the same path publish live.
8. `scripts/release/*.mjs` logic (changelog roll, guards,
   already-published check, publish-arg construction) is unit-tested;
   `docs/release.md` is rewritten to the two-action procedure and the
   one-time arming step.

## Tests

- Unit tests for the release scripts: changelog roll (populated and
  empty `Unreleased`, idempotent re-roll refusal), version/tag guard
  matrix, already-published detection (mocked registry response is
  acceptable here - the seam is the HTTP check, not npm itself).
- Workflow rehearsal: first release after merge runs W3 with `dry-run`
  before the real publish (documented in the rollout plan below).
- Existing CI (verify.yml, release-verify verification steps) unchanged
  and green.

## Rollout

1. Land scripts + workflows with `RELEASE_PUBLISH_ENABLED` unset, so no
   auto-tag push can publish live before the rehearsal.
2. Maintainer configures the three trusted publishers on npmjs.com.
3. Next release (0.4.2, after phase-27 I4): run W1 -> merge. Auto-tag
   pushes `v0.4.2`; the tag run verifies and reaches the publish job but
   skips live publish (unarmed). Dispatch W3 with `dry-run: true` on the
   tag; inspect logs (guards pass, three dry-run publishes with
   `--provenance`/`--access public`, no Release).
4. Set `RELEASE_PUBLISH_ENABLED = "true"`; re-dispatch W3 (not dry-run)
   on the tag for the live publish. From then on every release is fully
   automatic: dispatch W1 -> merge.

## Documentation Updates

- `docs/release.md` rewritten around the two-action flow, keeping the
  capability-catalog checklist item from phase-27/002.
- Phase-28 README; CHANGELOG entry (repo tooling).

## Issue Plan

- I1: release scripts (`scripts/release/*.mjs`) + unit tests +
  release-prepare workflow (W1). `ready` on approval.
- I2: auto-tag workflow (W2). `parallel-safe` with I1.
- I3: publish job in release-verify.yml (W3) + dry-run gate + GitHub
  Release step. `sequenced` after I1 (uses its guard scripts).
- I4: trusted-publisher setup + live dry-run rehearsal + docs/release.md
  rewrite. `human-gate` (npm settings are maintainer-only).

## Final Review Checklist

- No npm secret reference anywhere in workflows (grep-proof).
- `id-token: write` scoped to the publish job only.
- Guard scripts unit-tested; workflows thin.
- Dry-run rehearsal documented and performed before first live publish.
- ADR 0012 accepted alongside this spec.
