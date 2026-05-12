# Spec: Hosted Marketing Page

## Status

Verified. Cloudflare Pages static marketing build implemented and verified on
2026-05-08.

## Problem

The repository has a marketing landing page at `/`, but the local UI build is a
Node server package that reads project state for live routes. Publishing that
server as a public website would blur the local-first trust boundary and expose
routes that only make sense inside a user's repository.

Cloudflare deployment also failed when `npx wrangler deploy` was run from the
monorepo root, because Wrangler application detection was not pointed at a
specific Pages project.

## Goal

Provide a repeatable Cloudflare Pages deployment path for the public `/`
marketing page only.

## Non-Goals

- hosted project analysis
- hosted profile compilation
- browser write flows
- analytics, telemetry, accounts, or login
- implementing hosted preset tokens
- changing the local `agent-profile ui` server behavior

## Route Contract

- The hosted public build publishes `/` only.
- Live project routes remain local UI routes served by `agent-profile ui`.
- `/dashboard`, `/profile`, `/artifacts`, `/doctor`, `/targets`, `/settings`,
  `/diff`, and other project routes are not public-hosting requirements.
- Hosted preset tokens remain Phase 9 scope and must not be implemented as part
  of this deployment slice.

## Build Contract

- `npm run build --workspace @agent-profile/web` remains the Node adapter build
  used by the npm-distributed local UI package.
- `npm run build:marketing --workspace @agent-profile/web` produces a static
  marketing artifact at `apps/web/build-marketing`.
- The marketing build script builds the required internal workspace packages
  first so a clean Cloudflare checkout does not need a custom multi-step build
  command.
- The marketing build prerenders only `/`.
- The marketing page disables Svelte client-side routing/hydration so live UI
  routes are not shipped as a browser app.
- The marketing build prunes unused SvelteKit client JavaScript and data
  artifacts after prerendering; the hosted output contains static HTML, CSS,
  and a small first-party `marketing.js` for landing-page-only interactions.
- `apps/web/build-marketing` is generated output and must stay ignored.

## Security Rules

- No source code upload.
- No secret upload.
- No hosted execution.
- No telemetry or third-party analytics.
- No credential-entry forms.
- No local filesystem access from the hosted page.
- Future preset tokens may contain only user-selected intent/preferences, never
  source code, secrets, absolute paths, generated artifacts, or scan results.

## Acceptance Criteria

- A documented Cloudflare Pages build uses:
  - build command: `npm run build:marketing --workspace @agent-profile/web`
  - build output directory: `apps/web/build-marketing`
- The old root-level `npx wrangler deploy` path is documented as the wrong
  command for this static Pages deployment.
- Static marketing build passes locally.
- Local UI Node build still passes locally.
- Server host/origin hardening remains active for local UI but does not block
  prerendering the static marketing page.
- Generated marketing output is ignored by git and CCE.

## Tests

- web server hook test for the static marketing build bypass
- local static build smoke:
  `npm run build:marketing --workspace @agent-profile/web`
- local Node build smoke:
  `npm run build --workspace @agent-profile/web`
- check/test suite for package and TypeScript contracts

## Documentation Updates

- `docs/deploy/cloudflare-marketing.md` records dashboard and direct-upload
  steps.
- `README.md` links the Cloudflare marketing deployment guide.

## Final Review Checklist

- public deployment serves only marketing content
- local project UI remains loopback-only
- no analytics or telemetry
- no source, secret, or generated artifact upload
- Cloudflare command settings are clear enough to avoid workspace-root
  Wrangler detection failures
