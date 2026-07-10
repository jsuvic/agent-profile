# Release Process

Releasing is two actions: **dispatch `release-prepare`**, then **merge the
bump PR**. Everything after that - tagging, verification, npm publish with
provenance, and the GitHub Release - is automatic, guarded, and idempotent.
No npm token exists anywhere; CI publishes via OIDC trusted publishing
(ADR 0012, `docs/specs/phase-28/001-release-automation.md`).

The pre-automation manual checklist is kept at the end as the documented
degradation path.

## The two-action release

1. **Dispatch `release-prepare`** (GitHub → Actions → Release Prepare → Run
   workflow). Input a version, or `patch` / `minor` to auto-increment. It
   syncs versions (`sync-versions.mjs`), refreshes the lockfile, rolls the
   CHANGELOG `## Unreleased` into `## <version> — <date>`, runs metadata
   verification, and opens a bump PR. It refuses if the target version is
   already tagged or published.
2. **Review and merge the bump PR.** On merge, `auto-tag.yml` pushes
   `v<version>` once, which triggers `release-verify.yml`: it runs the full
   verification job and then the publish job (web → cli → wrapper, each with
   `npm publish --provenance`; scoped packages add `--access public`),
   skipping any version already on the registry, and creates a GitHub
   Release from the rolled changelog section.

That is the steady state. Live publishing is gated by the arm switch below,
which is set once and then stays on.

## One-time setup (maintainer)

Do these once before the first automated release.

### Trusted publishers on npmjs.com

For **each** public package - `agent-profile`, `@agent-profile/cli`,
`@agent-profile/web`:

1. npmjs.com → the package → **Settings** → **Trusted Publisher**.
2. Choose **GitHub Actions** and enter exactly:
   - Organization or user: `jsuvic`
   - Repository: `agent-profile`
   - Workflow filename: `release-verify.yml`
   - Environment: leave empty
3. Save. No token is created or stored.

After the first successful live publish, set each package's publishing
access to the strictest option that **disallows tokens** (trusted
publishing keeps working - it is not token-based). Do this only after a
successful publish so you are never locked out mid-debug.

### The arm switch

`RELEASE_PUBLISH_ENABLED` (GitHub → Settings → Secrets and variables →
Actions → **Variables**) gates live publishing. Leave it **unset** until
the first dry-run rehearsal has passed; then set it to `"true"`. It is a
permanent publish kill-switch: unset it any time to freeze all publishing
while everything else keeps working.

While unset, an auto-tag push still runs verification and reaches the
publish job, but the live publish step is skipped with a "publisher not
armed" message.

### Repository permission

GitHub → Settings → Actions → General → **Allow GitHub Actions to create
and approve pull requests** must be enabled (for `release-prepare` to open
the bump PR).

## First release (the 0.4.2 rehearsal)

The first automated release doubles as the end-to-end rehearsal, with
`RELEASE_PUBLISH_ENABLED` still unset:

1. Complete the trusted-publisher setup above.
2. Dispatch `release-prepare` with `patch`; review and merge the bump PR.
3. Auto-tag pushes `v0.4.2`; the tag run verifies and reaches the publish
   job but **skips live publish** (unarmed). Confirm that in the logs.
4. Dispatch `release-verify` on the tag with **`dry-run: true`**. Inspect:
   guards pass, three dry-run publishes each carrying `--provenance` (and
   `--access public` on the scoped packages), no GitHub Release created.
5. Set `RELEASE_PUBLISH_ENABLED = "true"`.
6. Re-dispatch `release-verify` on the tag (not dry-run). Live publish +
   GitHub Release.
7. Verify: `npm view agent-profile version` shows the new version, and
   `npm view agent-profile --json` shows a provenance attestation.

From then on, every release is just the two actions.

## Package graph and version rules (reference)

```text
agent-profile -> @agent-profile/cli -> @agent-profile/{core,compiler,scanner,doctor,web}
@agent-profile/core -> @agent-profile/schemas
```

`agent-profile@X.Y.Z`, `@agent-profile/cli@X.Y.Z`, and
`@agent-profile/web@X.Y.Z` publish at the same product version. The wrapper
pins the CLI at that exact version; the CLI pins `@agent-profile/web` at the
same exact version; `apps/web/src/lib/version.ts` mirrors it.
`verify-package-metadata.mjs` enforces all of these. Internal scoped
packages (`schemas`, `core`, `compiler`, `scanner`, `doctor`) may stay on
older published versions when unchanged. The private root workspace is
never packed or published.

## Release-scope checklist (reference)

The automated pipeline runs verification for you, but before dispatching a
release, confirm the two things CI cannot decide:

- **MCP knowledge baseline** (`docs/specs/phase-19/002-baseline-freshness-release-gate.md`):
  the pinned versions and `knownAsOf` in `KNOWLEDGE_BASELINES`
  (`packages/doctor/src/mcpSuggestions.ts`) reflect what this release was
  built against. `npm run verify:baseline-age` fails on the release path
  when any `knownAsOf` is older than 6 months.
- **Capability catalog**: every phase that added a user-selectable
  capability must have extended `CAPABILITY_CATALOG` and advanced
  `CAPABILITY_CATALOG_VERSION` to that capability's integer phase revision,
  with catalog ordering and insertion-shape tests. Do not use product
  semver for catalog provenance.

## Post-publish smoke test

From a clean cache and temporary directory:

```bash
npm view agent-profile version readme
npx --yes agent-profile --help
npx --yes agent-profile init --write
npx --yes agent-profile compile --dry-run
npx --yes agent-profile doctor
```

## Manual publish (degradation path)

If trusted publishing is unavailable, everything except the publish job
still works: `release-prepare` opens the bump PR and `auto-tag` still tags.

First build the publish artifacts. `apps/cli` publishes `dist/*` and
`apps/web` publishes `build/`, both gitignored and produced only by
`npm run build`; there are no `prepack`/`prepublishOnly` hooks, so a fresh
checkout must build and verify before publishing or it ships stale or
missing output:

```bash
npm ci
npm run build
node scripts/verify-package-metadata.mjs
npm run verify:pack
```

Then publish the three packages, in dependency order, with 2FA:

```bash
npm publish --workspace @agent-profile/web --otp <code>
npm publish --workspace @agent-profile/cli --otp <code>
npm publish --workspace agent-profile --otp <code>
```

Then tag if not already tagged (`git tag -a v<version> -m "Release
<version>" && git push origin v<version>`) and create the GitHub Release by
hand. Publish only changed packages; never republish an existing version.

## Verification workflow (reference)

`.github/workflows/release-verify.yml` runs on `workflow_dispatch` and on
`v*` tags. The verification job has `contents: read` and no npm credential.
The publish job carries `id-token: write` (+ `contents: write` for the
Release), scoped to that job only, and runs only on tag refs - fork PRs
never reach it.
