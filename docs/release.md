# Release Process

This document defines the maintainer release checklist for npm packages. It
tracks the verified release-verification contract in
`docs/specs/phase-07/005-release-verification.md`.

## Package Graph

The public package graph is:

```text
agent-profile -> @agent-profile/cli -> @agent-profile/{core,compiler,scanner,doctor,web}
@agent-profile/core -> @agent-profile/schemas
```

`agent-profile@X.Y.Z`, `@agent-profile/cli@X.Y.Z`, and `@agent-profile/web@X.Y.Z`
must publish at the same product version. The wrapper depends on the CLI at
that exact version, and the CLI depends on `@agent-profile/web` at that same
exact version. `apps/web/src/lib/version.ts` mirrors the wrapper version so
the landing page never drifts. `verify-package-metadata.mjs` enforces all of
these rules.

Internal scoped packages (`schemas`, `core`, `compiler`, `scanner`, `doctor`)
may remain on older published versions when their contents did not change.

## Pre-Publish Checklist

1. Confirm the working tree contains only intentional release changes.
2. Confirm relevant specs are approved or explicitly marked as release scope.
3. Bump the product version in one place:

   ```bash
   npm run version:set -- <X.Y.Z>
   npm install
   ```

   This propagates the version to the wrapper, CLI, web, the inter-package
   pins, and `apps/web/src/lib/version.ts`. The verify steps below will fail
   if anything drifted.

4. Review the MCP knowledge baseline
   (`docs/specs/phase-19/002-baseline-freshness-release-gate.md`): confirm the
   pinned versions and `knownAsOf` in `KNOWLEDGE_BASELINES`
   (`packages/doctor/src/mcpSuggestions.ts`) reflect what this release was
   built against, bumping them offline if stale, then run:

   ```bash
   npm run verify:baseline-age
   ```

   The script is offline (WS4-MCP-001) and fails when any `knownAsOf` is older
   than 6 calendar months. It runs only on the release path; unit tests and
   routine CI stay time-independent.

   For every phase that adds a user-selectable capability, also extend the
   reviewed `CAPABILITY_CATALOG`, advance `CAPABILITY_CATALOG_VERSION` to the
   capability's integer phase revision, and add/update catalog ordering and
   insertion-shape tests. Do not use product semver for catalog provenance.

5. Rebuild and verify the workspace:

   ```bash
   npm ci
   npm run check
   npm test
   npm run build
   node scripts/verify-package-metadata.mjs
   npm run verify:pack
   ```

6. Run the GitHub `Release Verify` workflow manually on the release candidate
   branch, or confirm it passed for the release tag. This workflow is
   verification-only: it does not create GitHub releases, publish npm packages,
   write repository contents, or require npm credentials.

   The workflow repeats the release checks on a clean Ubuntu runner, runs a
   production dependency audit, and verifies the static marketing build with
   `AGENT_PROFILE_SITE_URL=https://agent-profile.com`.

7. `npm run verify:pack` packs every public package with `npm pack --json
--dry-run` and compares the file list against fixtures in
   `fixtures/npm-pack/`.

   Packages with hashed build artifacts, currently `@agent-profile/web`, may
   use required files plus allowed build-output prefixes in the fixture.

   The private root workspace is not packed or published.

8. Confirm tarballs do not include local state such as `.env`, `.mcp.json`,
   `.cce`, `.claude/worktrees`, `.codex`, `.svelte-kit`, `apps/web/build`,
   `coverage`, `node_modules`, `*.tgz`, or absolute user-machine paths.

## Publish Order

Publish only changed packages. Never republish an existing version.

When every package changes, publish in this order:

1. `@agent-profile/schemas`
2. `@agent-profile/core`
3. `@agent-profile/compiler`
4. `@agent-profile/scanner`
5. `@agent-profile/doctor`
6. `@agent-profile/web`
7. `@agent-profile/cli`
8. `agent-profile`

When only the CLI or wrapper changes, publish the changed dependency first, then
the wrapper.

## Post-Publish Smoke Tests

Run from a clean npm cache and a temporary project directory:

```bash
npm view agent-profile version readme
npx --yes --cache <empty-cache> agent-profile --help
npx --yes --cache <empty-cache> agent-profile init --write
npx --yes --cache <empty-cache> agent-profile compile --dry-run
npx --yes --cache <empty-cache> agent-profile doctor
```

Record the published versions and smoke-test result in the release commit,
release notes, or changelog.

Do not automate npm publishing until post-publish clean-cache `npx` smoke tests
are part of the release workflow.

## GitHub Release Verification

The `.github/workflows/release-verify.yml` workflow is the CI gate for release
candidate confidence. It runs on manual dispatch and on `v*` tags.

It is intentionally not a publish workflow. It has read-only repository
permissions and does not use npm tokens. npm Trusted Publishing or provenance
automation can be added only after clean-cache `npx` post-publish smoke tests
are automated.
