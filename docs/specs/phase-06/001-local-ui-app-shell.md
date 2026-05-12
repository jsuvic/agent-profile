# Spec: Local UI App Shell

## Status

Approved

## Problem

Phase 5 ships write-capable CLI flows but leaves humans without a visual way
to inspect the profile, the generated artifacts, or the doctor report. The
SDD plan calls for a SvelteKit local UI in Phase 6 (`Phase 6 — Local UI`).

## Goal

Create a SvelteKit app at `apps/web/` with a left-sidebar shell, a top
breadcrumb bar, a persistent trust banner, a global safety badge, and routes
for Profile, Artifacts, and Doctor. The shell is the chrome that every
Phase 6 screen sits in.

## Non-Goals

- write-capable actions
- third-party API calls (no telemetry, no remote MCP)
- account / auth / sync
- light theme parity (dark only in Phase 6)
- mobile layout — desktop only
- diff viewer (deferred; Phase 5 owns the diff contract)

## User Flow

1. The user runs `npm run dev --workspace @agent-profile/web`.
2. The dev server reads `ai-profile.yaml` from the project root the user
   launched from.
3. The user lands on the Profile screen by default. The sidebar is visible
   with the project name, profile hash, and current safety mode.
4. The user clicks Artifacts to view the compiled tree, or Doctor to view
   findings. No clicks ever cause a file write.

## Phase 7 Route Contract Amendment

Phase 7 spec `docs/specs/phase-07/004-marketing-landing-contract.md`
supersedes the Phase 6 default route rule for `/` and `/landing`.

After Phase 7, `/` may render a standalone marketing/onboarding landing page
without the app sidebar or project shell. Live project routes, including
`/dashboard`, `/profile`, `/artifacts`, `/doctor`, `/targets`, and `/settings`,
remain app-shell routes and keep the local trust and safety indicators.

## Inputs

- `ai-profile.yaml` at the configured root (default: `process.cwd()`)
- `AGENT_PROFILE_ROOT` env var to override the root
- compiler output via `compileProfile` from `@agent-profile/compiler`
- doctor output via `runDoctor` from `@agent-profile/doctor`

## Outputs

- a SvelteKit application served from `apps/web/`
- a sidebar with: Overview, Profile, Artifacts, Doctor, Settings
- a top bar with breadcrumbs
- a trust banner: "Local-first. No source upload. No secrets transmitted."
- a safety badge that reads the validated profile's safety mode

## Contracts

- The shell must not introduce a new compiler or doctor API surface — it must
  consume the existing public exports of `@agent-profile/compiler` and
  `@agent-profile/doctor`.
- The shell must run server-side only when reading the profile from disk.
  No profile content is shipped to the browser as raw YAML; only structured
  fields are passed through.
- The shell must depend on `@agent-profile/core`, `@agent-profile/compiler`,
  and `@agent-profile/doctor` as workspace dependencies.

## Security Rules

- never read a path outside the configured root
- never bind the dev server to a non-loopback interface in default config
- never include literal secrets in any rendered field; if a field's value
  matches a secret-like pattern, render a redaction marker instead
- never call out to any URL except localhost during request handling
- no telemetry, no analytics scripts, no third-party fonts at runtime
  (fonts are bundled or self-hosted)

## Acceptance Criteria

- `apps/web/` contains a SvelteKit project that builds with `npm run build`
- the sidebar route table matches the design: Overview, Profile, Artifacts,
  Doctor, Settings
- the trust banner appears on every page that renders profile-derived data
- the safety badge appears in the sidebar foot and reads from the validated
  profile
- the typography uses Inter for UI prose and JetBrains Mono for code, paths,
  and badges; no Caveat in the production UI
- the dark color palette uses the design tokens documented in
  `apps/web/src/lib/styles/tokens.css`

## Tests

- `apps/web/src/routes/+layout.server.test.ts` (when added) covers the
  layout loader returning project name, profile hash, and safety mode
- visual smoke verified via `npm run build` succeeding and `svelte-check`
  reporting no errors

## Documentation Updates

- `apps/web/README.md` describes how to run the dev server, the
  required env vars, and the local-only network posture
- `README.md` (root) gains a short pointer to Phase 6 UI

## Final Review Checklist

- shell never writes files
- shell uses only existing compiler/doctor exports
- design tokens match the hand-off bundle
- safety badge and trust banner appear on every data-bearing route
