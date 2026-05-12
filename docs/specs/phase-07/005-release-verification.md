# Spec: Release Verification

## Status

Verified. Release verification passed for `agent-profile@0.1.3`,
`@agent-profile/cli@0.1.3`, and `@agent-profile/web@0.1.3` on 2026-05-08.

## Problem

Publishing to npm creates a public contract. The project needs a repeatable
pre-publish and post-publish checklist so users do not receive broken `npx`
packages, missing README metadata, stale dist files, or inconsistent package
versions.

## Goal

Define the verification workflow for npm releases of the package graph.

## Non-Goals

- automating npm publish through CI
- signing releases
- changelog generation
- GitHub release publishing

## Pre-Publish Contracts

- working tree is clean except intentional release changes
- `agent-profile@X.Y.Z` depends on `@agent-profile/cli@X.Y.Z` exactly
- `@agent-profile/cli` may depend on older internal scoped package versions when
  those packages are unchanged, but those versions must already exist on npm
- dist files are rebuilt before packing
- tarballs contain only allowed package files
- tests and checks pass

## Publish Order

When all packages change:

1. `@agent-profile/schemas`
2. `@agent-profile/core`
3. `@agent-profile/compiler`
4. `@agent-profile/scanner`
5. `@agent-profile/doctor`
6. `@agent-profile/web`
7. `@agent-profile/cli`
8. `agent-profile`

When only CLI or wrapper changes, publish the changed dependency first, then
the wrapper.

Skip unchanged packages. Never republish an existing version; bump only packages
whose contents or package metadata changed, plus dependents that need updated
dependency pins.

## Required Commands

Pre-publish:

```bash
npm run check
npm run test
npm run build
npm run verify:pack
```

Run `npm pack --json` for every changed package before publish and compare the
file list against the committed allowlist fixture for that package. Packages
with hashed build assets may use explicit required files plus allowed output
prefixes instead of exact generated asset names.

Post-publish:

```bash
npm view agent-profile version readme
npx --yes --cache <empty-cache> agent-profile --help
npx --yes --cache <empty-cache> agent-profile init --write
```

## Security Rules

- Never publish with local `.env`, `.mcp.json`, `.cce`, `.claude/worktrees`,
  `.svelte-kit`, `apps/web/build`, `coverage`, `node_modules`, or generated
  `.tgz` files included. The only published build output exception is the
  allowlisted `build/` payload inside `@agent-profile/web`.
- Never add postinstall scripts without a dedicated security spec.
- Never publish packages that require source upload or telemetry.

## Acceptance Criteria

- npm package page shows README content.
- clean-cache `npx agent-profile --help` succeeds.
- clean-cache `npx agent-profile init --write` writes valid `ai-profile.yaml`.
- generated profile has deterministic formatting.
- published wrapper resolves published scoped dependencies.
- root README documents the public command path.

## Tests

- package tarball file-list assertions against committed allowlist fixtures
- dependency-coherence test proving `agent-profile.version` exactly matches
  `agent-profile.dependencies["@agent-profile/cli"]`
- clean-cache `npx` smoke tests
- CLI test covering generated profile formatting
- workspace `check`, `test`, and `build`

## Documentation Updates

- release process documented in `docs/release.md`
- package README updated before wrapper publish

## Final Review Checklist

- publish order followed
- npm README visible
- clean-cache smoke tests passed
- release commit records version changes
