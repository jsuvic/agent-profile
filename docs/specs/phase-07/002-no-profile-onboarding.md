# Spec: No-Profile Onboarding

## Status

Verified. No-profile onboarding rendered through the published
`npx agent-profile@0.1.3 ui` launch path on 2026-05-08.

## Problem

When no `ai-profile.yaml` exists, the local UI has little live project state to
display. Users need to understand what Agent Profile does, why a profile helps,
and which local command creates one.

The UI must guide the user without adding browser writes in Phase 7.

## Goal

Render consistent no-profile states across the local UI that explain the
bootstrap workflow and point to the published CLI.

## Non-Goals

- creating `ai-profile.yaml` from the browser
- hosted preset tokens
- wizard persistence
- source-code upload
- credential entry

## User Flow

1. User starts the UI in a project with no `ai-profile.yaml`.
2. The UI explains that `ai-profile.yaml` is the canonical local intent file.
3. The UI shows:

   ```bash
   npx agent-profile init --write
   ```

4. The UI explains the follow-up commands:

   ```bash
   npx agent-profile compile --dry-run
   npx agent-profile compile --write
   npx agent-profile doctor
   ```

5. The user runs the command in the terminal.
6. The user refreshes the UI and sees profile-derived views.

## Outputs

- no-profile empty state for Profile
- no-profile empty state for Artifacts
- no-profile empty state for Doctor
- no-profile empty state for Dashboard
- no-profile target/settings messaging where relevant

## Contracts

- The browser must not write files.
- The UI must never imply that a hosted service is required.
- Empty states must use the same command vocabulary as CLI documentation.
- Commands shown in the UI must be inert text, not browser actions.
- Empty states must remove or clearly relabel hard-coded dashboard blocks so
  they cannot be mistaken for live project data:
  - stack/language/framework card
  - target/client badges
  - lockfile status badge
  - artifact count such as `11 files · 3 targets`
  - timeline placeholders or static event values
- Missing profile states must not include absolute filesystem paths.

## Security Rules

- Empty states must preserve the local-first promise: no source upload, no
  secret upload, no telemetry.
- No-profile screens must not trigger compiler writes.
- No-profile screens must not read generated artifacts unless the route already
  has an explicit read-only contract.

## Acceptance Criteria

- Missing profile states explain `init`, `compile --dry-run`, `compile --write`,
  and `doctor`.
- The Profile page remains the canonical place to inspect a created profile.
- Dashboard renders a true missing-profile state, not demo project data.
- Dashboard removes or relabels the current hard-coded stack card, target
  badges, lockfile badge, artifact count, and timeline placeholders.
- Artifacts renders no tree when no profile exists.
- Doctor renders a clear bootstrap message when doctor cannot run.
- Settings explains that durable behavior is owned by `ai-profile.yaml`.

## Tests

- route/load tests for missing-profile state where server loaders exist
- UI smoke tests or snapshots for no-profile copy
- assertion that no-profile dashboard does not show hard-coded target counts as
  live data
- dashboard regression test covering the current hard-coded stack, target,
  lockfile, artifact count, and timeline blocks

## Documentation Updates

- root `README.md` includes no-profile bootstrap flow
- web README documents missing-profile behavior

## Final Review Checklist

- no browser write controls are introduced
- no misleading live state is shown
- no absolute paths are rendered
- all commands use `npx agent-profile ...`
