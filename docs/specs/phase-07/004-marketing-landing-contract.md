# Spec: Marketing Landing Contract

## Status

Verified. Marketing/live route separation and example labeling are implemented
and covered by tests as of 2026-05-08.

## Problem

The product benefits from a marketing/onboarding landing page, but live project
screens must not mix demo data with actual project state. Users must be able to
distinguish examples from what the tool detected locally.

## Goal

Define the route and data contract for marketing/demo surfaces in the local UI.

## Non-Goals

- hosted marketing site implementation
- analytics
- account signup
- remote preset generation
- changing target generation behavior

## Route Contract

- `/` may be a standalone marketing/onboarding route.
- `/landing` may exist as an alias or follow-up route.
- `/dashboard`, `/profile`, `/artifacts`, `/doctor`, `/targets`, and
  `/settings` are live or read-only project routes.
- The app shell requirement applies to live project routes.
- This route contract amends
  `docs/specs/phase-06/001-local-ui-app-shell.md`.

## Data Contract

- Demo data must be visibly labeled as example data.
- Live project state must come from route loaders or approved server helpers.
- Marketing pages must not claim to have scanned or validated the user's
  project unless they render real loader data.
- Dashboard must not use static demo stack, target, lockfile, or artifact
  values as live state.

## Security Rules

- No marketing surface may add telemetry or third-party analytics.
- No marketing surface may upload source code or profile content.
- No marketing surface may include credential-entry forms.

## Acceptance Criteria

- `docs/specs/phase-06/001-local-ui-app-shell.md` is updated in the same change
  to allow `/` as a standalone landing route.
- `/dashboard` renders only live project data or explicit empty states.
- Demo screenshots, examples, and skeletons are clearly labeled as examples.
- No marketing surface introduces network calls or telemetry.
- No demo data appears in live status badges without an "example" label.

## Tests

- snapshot or smoke test that marketing route labels demo data as example data
- route test proving `/` does not call compiler, doctor, or project-context
  loading APIs
- dashboard test proving live values derive from profile/compiler/doctor state
- no-profile dashboard test proving no static demo counts leak into live state

## Documentation Updates

- Phase 6 shell spec notes the Phase 7 route contract amendment
- web README documents `/` as marketing/onboarding if implemented

## Final Review Checklist

- marketing/demo route is clearly separate from live project routes
- no analytics or telemetry
- no misleading project state
