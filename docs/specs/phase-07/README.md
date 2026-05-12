# Phase 7 Spec Map

## Status

Verified. Phase 7 distribution and onboarding acceptance criteria passed on
2026-05-08 with the published `agent-profile@0.1.3` package chain.

## Purpose

Phase 7 turns the local-first compiler from a repository-local tool into a
usable npm-distributed product. The phase covers the published `npx` entrypoint,
no-profile onboarding, local UI launch, marketing/demo route boundaries, and
release verification.

Phase 7 must preserve the MVP product principles:

- local-first by default
- no source-code upload
- no secret upload
- no hosted execution
- deterministic generated files
- explicit write contracts

## Verification Record

Verified on 2026-05-08:

- `agent-profile@0.1.3`, `@agent-profile/cli@0.1.3`, and
  `@agent-profile/web@0.1.3` are visible on npm.
- Clean temporary-project smoke passed:
  - `npx --yes agent-profile@0.1.3 --help`
  - `npx --yes agent-profile@0.1.3 init --write`
  - `npx --yes agent-profile@0.1.3 compile --dry-run`
  - `npx --yes agent-profile@0.1.3 doctor`
  - `npx --yes agent-profile@0.1.3 ui --root <temp> --port 48638`
- The `doctor` smoke returned expected exit code `1` after dry-run compile
  because generated files and `ai-profile.lock` were intentionally not written.
- The UI smoke loaded `/dashboard` over loopback and rendered no-profile
  onboarding.

## Baseline

As of the initial Phase 7 planning pass:

- `agent-profile@0.1.1` is published on npm
- `@agent-profile/cli@0.1.1` is published on npm
- `@agent-profile/core`, `@agent-profile/compiler`, `@agent-profile/scanner`,
  `@agent-profile/doctor`, and `@agent-profile/schemas` are published at
  `0.1.0`
- manual clean-cache `npx agent-profile init --write` smoke testing was
  verified on 2026-05-06; `005-release-verification.md` defines the repeatable
  release gate
- `agent-profile` package README is visible on npm

Those facts are useful context, but Phase 7 implementation must still be
reviewed against the specs below before marking the phase verified.

## Review Order

1. `001-npm-package-and-npx-entrypoint.md`
2. `002-no-profile-onboarding.md`
3. `003-ui-launch-command.md`
4. `004-marketing-landing-contract.md`
5. `005-release-verification.md`
6. `006-hosted-marketing-page.md`

## Cross-Spec Contracts

- `001` owns npm package names, versioning, and the public `npx` command
  surface.
- `002` owns UI empty states when no `ai-profile.yaml` exists.
- `003` owns the future `agent-profile ui` command and local server launch.
- `004` owns the difference between marketing/demo data and live project data.
- `005` owns the verification checklist before publish and after publish.
- `006` owns the static Cloudflare Pages deployment path for the public `/`
  marketing page.

## Out of Scope

- browser write flows
- hosted preset tokens
- accounts, sync, telemetry, or hosted execution
- enterprise governance
- new target capabilities such as hooks, subagents, plugins, or global memory

## Implementation Gate

Phase 7 verification:

- users can run the published CLI from their own repositories with `npx`
- `init` remains local and writes only `ai-profile.yaml`
- `compile --dry-run` remains the preview path before generated writes
- no-profile UI states explain why the profile exists and what command to run
- the UI launch path is local-only and loopback-bound
- marketing/demo surfaces never masquerade as live project state
- npm package READMEs and metadata are present
- clean-cache npm smoke tests pass after publish
