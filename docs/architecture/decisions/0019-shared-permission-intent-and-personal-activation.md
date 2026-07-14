# ADR 0019: Shared Permission Intent and Personal Activation

## Status

Accepted 2026-07-14 with
`docs/specs/phase-31/001-permission-posture-lifecycle.md`.

## Context

Permission posture has both a repository-shared meaning and a developer-local
activation effect. Storing every native high-autonomy setting in generated
shared files makes a cloned repository capable of surprising a developer.
Keeping shared files permanently restrictive makes an intentional local choice
ineffective because client settings can merge restrictions across scopes.

The clients also expose different activation scopes: Claude documents a
project-local personal settings file, Codex documents project, user, profile,
and session scopes but no equivalent ignored project-local file, and Tabnine
documents manual per-tool IDE controls.

## Decision

Separate shared intent from personal activation.

- `ai-profile.yaml` records the intended baseline and optional client posture.
- Generated shared artifacts must be compatible with that intent and must not
  contain contradictory routine approval requirements.
- Trusted-local activation is a separate, explicit developer decision.
- APC may patch only documented, permission-related fields in a project-local,
  ignored personal file after a separate preview and confirmation.
- When no safe personal write surface exists, APC reports a manual/session
  activation step rather than writing global configuration or inventing a
  project-local format.
- Doctor validates shared intent, generated config, detectable personal
  activation, mapping limitations, and unknown higher scopes separately.

## Rationale

This preserves deterministic team intent without allowing a repository to
silently grant itself broad machine authority. It also avoids the opposite
failure where generated shared restrictions make a deliberate personal choice
impossible.

## Consequences

Positive:

- High-autonomy activation always has explicit personal consent.
- Shared generated files and doctor can still be deterministic.
- Client capability gaps are visible instead of hidden behind guessed config.

Negative:

- Declared posture can be valid while personal activation remains incomplete.
- The configure flow and doctor need layered status rather than one equality
  check.
- Some clients require manual activation outside APC.

## Rejected Alternatives

- Generate high autonomy entirely in shared files: rejected because repository
  trust and personal machine authority are different decisions.
- Leave shared output permanently guarded and rely on local override: rejected
  because merged restrictions can make the local choice ineffective.
- Stop generating permission policy: rejected because APC would lose a core
  deterministic safety contract and doctor could not reason about drift.

## Revisit Triggers

- A client adds a documented, ignored project-local activation surface.
- A client publishes a stable effective-permission status API.
- APC adds approved organization policy packs or managed-policy integration.
