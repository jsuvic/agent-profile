# Spec: UI Launch Command

## Status

Verified. Published `npx agent-profile@0.1.3 ui` served the local UI over
loopback and rendered no-profile onboarding on 2026-05-08.

## Problem

Users should not clone the Agent Profile repository to open the local UI. The
published CLI needs a command that starts the read-only UI for the current
project.

## Goal

Add a local UI launch command:

```bash
npx agent-profile ui
```

The command starts the Phase 6 read-only UI against the user's project root.

## Non-Goals

- browser-based writes
- cloud-hosted UI
- authentication
- persisted browser preferences
- automatic profile creation

## User Flow

1. User opens a terminal in their project.
2. User runs:

   ```bash
   npx agent-profile ui
   ```

3. The CLI starts the UI server on a loopback address.
4. The CLI prints the localhost URL and local-only posture.
5. The UI reads `ai-profile.yaml` from the project root.
6. If no profile exists, the UI renders no-profile onboarding.

## Inputs

- current working directory
- optional `--root <path>`
- optional `--host <host>`, restricted to `127.0.0.1`, `localhost`, or `::1`
- optional `--port <number>`
- optional `--open`

## Outputs

- local HTTP server bound to loopback by default
- terminal output with URL and stop instructions

## Published UI Assets

`npx agent-profile ui` must run from a published npm tarball, not from the source
checkout. The first implementation must publish a dedicated UI package, expected
to be `@agent-profile/web`, that owns the built SvelteKit server output and
static assets.

The CLI may depend on that UI package and call an exported server launcher, or
it may resolve a documented asset/server entry from that package. It must not
assume that `apps/web`, `.svelte-kit`, Vite dev dependencies, or source files
exist in the user's project.

## Contracts

- The UI server must bind to `127.0.0.1` by default.
- The project root must be the command working directory unless `--root` is
  provided.
- The command must pass the root to the UI through an explicit server-side
  mechanism, not by relying on package install directory CWD.
- The command must not upload source code or profile content.
- The command must fail clearly when no usable port is available.
- The UI remains read-only in Phase 7.
- The command must reject `--host 0.0.0.0` and any other non-loopback host.

## Security Rules

- Non-loopback host binding must be rejected unless a later spec explicitly
  introduces it.
- Requests with non-localhost `Host` or `Origin` headers must be rejected where
  the server framework exposes those headers, to reduce DNS-rebinding risk
  before future write operations exist.
- The server must not expose generic filesystem read/write endpoints.
- The server must not serve files outside the built UI assets and approved
  route handlers.

## Acceptance Criteria

- `npx agent-profile ui` serves the UI against the current project.
- `npx agent-profile ui --root <path>` serves the UI against an explicit root.
- startup output includes the localhost URL and "local only" posture.
- no-profile onboarding works through the launched UI.
- generated-data routes continue to show trust banner and safety state.

## Tests

- CLI parser tests for `ui`
- root propagation test
- loopback binding test
- non-loopback rejection test for `--host 0.0.0.0`
- port collision test proving startup fails with a clean, actionable message
- smoke test that the launched server responds on localhost
- no-profile UI launch smoke test

## Documentation Updates

- root README documents `npx agent-profile ui`
- package README documents UI command once implemented
- web README documents CLI launch path

## Final Review Checklist

- no browser writes
- loopback only
- explicit project root propagation
- clean shutdown behavior documented
