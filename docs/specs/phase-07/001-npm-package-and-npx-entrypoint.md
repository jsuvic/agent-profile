# Spec: npm Package and npx Entrypoint

## Status

Verified. Published npm package chain passed clean temporary-project
`npx agent-profile@0.1.3` smoke testing on 2026-05-08.

## Problem

Users should not clone this repository to bootstrap their own projects. The
product needs a public npm entrypoint that can run from any supported project
directory:

```bash
npx agent-profile init --write
```

The monorepo contains internal packages, but the public user-facing package is
the unscoped `agent-profile` wrapper.

## Goal

Publish and maintain an npm package graph that supports the public
`agent-profile` binary through `npx`.

## Non-Goals

- hosted execution
- account login
- telemetry
- browser writes
- package managers other than npm/npx for the first public release
- bundling the local UI into the `npx` entrypoint in this spec

## User Flow

1. User opens a terminal in their project.
2. User runs:

   ```bash
   npx agent-profile init --write
   ```

3. npm downloads or reuses the published package.
4. The CLI scans the local repository.
5. The CLI writes `ai-profile.yaml`.
6. User runs:

   ```bash
   npx agent-profile compile --dry-run
   npx agent-profile compile --write
   npx agent-profile doctor
   ```

## Package Graph

Required public packages:

- `agent-profile` - thin public wrapper with the `agent-profile` binary
- `@agent-profile/cli` - CLI implementation
- `@agent-profile/core` - profile parsing, validation, safety helpers
- `@agent-profile/compiler` - deterministic target generation and write plans
- `@agent-profile/scanner` - local repository stack/import scanner
- `@agent-profile/doctor` - local safety, drift, and hygiene checks
- `@agent-profile/web` - packaged read-only local UI server output
- `@agent-profile/schemas` - published JSON schema

The current monorepo placement of these packages, including the CLI
implementation living under `apps/cli`, is an internal implementation detail.
Consumers depend on published package names, binary names, and documented
exports only.

## Contracts

- `agent-profile` must expose `bin.agent-profile`.
- `agent-profile@X.Y.Z` must depend on `@agent-profile/cli@X.Y.Z` exactly.
- `@agent-profile/cli` may depend on unchanged internal scoped packages at older
  published versions when those packages did not change in the release.
- All package dependencies in the public graph must resolve to versions already
  published to npm before the wrapper package is published.
- The CLI implementation package must expose its binary and `runCli` export.
- Published package metadata must include license, description, README, and
  supported Node/npm engines.
- The CLI must treat the current working directory as the project root unless
  `--root` is provided.
- The CLI must not upload source code, profile content, or scan results.
- The CLI must not read secrets or `.env` content during `init`.
- Write-capable commands must require explicit `--write`; dry-run remains the
  safe preview path.

## Security Rules

- No package may add `preinstall` or `postinstall` scripts.
- No command may phone home during `init`, `compile`, or `doctor`.
- Published tarballs must not contain local build cache, test fixtures with
  secrets, `.env` files, CCE data, or machine-local config.
- Scoped packages must publish only files required by consumers.

## Acceptance Criteria

- `npx agent-profile --help` prints CLI help from an empty npm cache.
- `npx agent-profile init --dry-run` produces a dry-run write plan.
- `npx agent-profile init --write` writes only `ai-profile.yaml`.
- `npx agent-profile compile --dry-run` works against the generated profile.
- `npx agent-profile doctor` runs local checks.
- npm package pages show README text and useful metadata.
- `npm pack --workspace <package>` produces expected file lists for every
  package in the graph, compared against committed allowlist fixtures.

## Tests

- clean-cache `npx agent-profile --help`
- clean-cache `npx agent-profile init --write` in a temp project with detectable
  stack metadata
- `npm run test --workspace @agent-profile/cli`
- `npm run check --workspace @agent-profile/cli`
- package tarball inspection for committed file allowlists
- package manifest assertion proving no public package has `preinstall` or
  `postinstall` scripts
- package assertion proving `agent-profile.version` equals
  `agent-profile.dependencies["@agent-profile/cli"]`

## Documentation Updates

- root `README.md` documents public `npx` usage
- `packages/agent-profile/README.md` documents quick start and local-first
  posture, and is updated as each public command spec is implemented
- release notes mention exact published versions

## Final Review Checklist

- no package is still accidentally `private: true`
- package versions and dependency versions are coherent
- wrapper package points at the intended CLI version
- npm README is visible after publish
- clean-cache npx smoke test passes after publish
