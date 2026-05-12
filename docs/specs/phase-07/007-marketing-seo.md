# Spec: Marketing SEO

## Status

Approved for implementation.

## Parent Specs

- `docs/specs/phase-07/004-marketing-landing-contract.md`
- `docs/specs/phase-07/006-hosted-marketing-page.md`

Both parent specs remain in force. This spec only adds SEO metadata, static SEO
files, and build-time checks for the hosted marketing build.

## Problem

The hosted marketing page has correct product positioning, but it does not yet
publish a complete SEO contract for crawlers, preview cards, structured data,
sitemaps, or LLM-readable project context. The public build also needs one
canonical host so search engines do not split the root page across Pages and
custom-domain URLs.

## Goal

Make `npm run build:marketing --workspace @agent-profile/web` emit a static,
deterministic, telemetry-free marketing artifact for `https://agent-profile.com/`
with correct metadata, `robots.txt`, `sitemap.xml`, and `llms.txt`.

## Non-Goals

- hosted project analysis
- hosted profile compilation
- telemetry, analytics, accounts, waitlists, or paid campaigns
- new target support for Cursor, Copilot, Aider, AutoGPT, Devin, or enterprise
  governance
- OG image generation
- cache-control tuning before there is a measured hosting problem
- secondary-domain canonical metadata

## SEO Contract

- `AGENT_PROFILE_SITE_URL` is required for `build:marketing`.
- The canonical root URL is the normalized site URL with a trailing slash, for
  example `https://agent-profile.com/`.
- Non-root URLs are generated without trailing slashes except file paths such as
  `/sitemap.xml`.
- Tests must use a test URL such as `https://test.example`; production literals
  belong only in deployment documentation and examples.
- The page title is `agent-profile - local AI coding agent setup`.
- The meta description is:
  `Compile one local ai-profile.yaml into deterministic AGENTS.md, CLAUDE.md, and .tabnine/guidelines for your AI coding agents. No source upload. No telemetry.`
- The landing page keeps the anti-cloud H1 positioning and adds supporting copy
  for AGENTS.md, CLAUDE.md, Codex config, Claude setup, MCP config, skills, and
  AI coding agent setup.
- Hosted HTML must not link visitors to local-only routes such as `/dashboard`;
  use local CLI commands such as `npx agent-profile ui` instead.

## Structured Data

The marketing page renders JSON-LD server-side in `<svelte:head>`.

- Use one `@graph` with `WebSite` and `SoftwareApplication` only.
- Do not emit `Organization`.
- `WebSite.@id` is `<site>/#website`.
- `SoftwareApplication.@id` is `<site>/#software`.
- `SoftwareApplication.applicationCategory` is `DeveloperApplication`.
- `SoftwareApplication.operatingSystem` is `Windows, macOS, Linux`.
- `SoftwareApplication.offers` is:

```json
{
  "@type": "Offer",
  "price": "0",
  "priceCurrency": "USD",
  "availability": "https://schema.org/InStock"
}
```

## Static SEO Files

`robots.txt`:

```text
# scope: marketing build only
User-agent: *
Allow: /

Sitemap: <site>/sitemap.xml
```

`sitemap.xml`:

- uses `<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">`
- contains exactly one `<loc>` for the canonical root URL
- omits `lastmod`, `changefreq`, and `priority`

`llms.txt`:

- reads description, keywords, version, and repository URL from
  `packages/agent-profile/package.json`
- includes homepage, install command, package version, source repository,
  supported targets, and local-first posture
- states no source upload, no secret upload, and no telemetry

## Acceptance Criteria

- `build-script-env-validation`: marketing build exits non-zero when
  `AGENT_PROFILE_SITE_URL` is unset.
- `metadata-contract`: prerendered HTML reflects the configured test URL in
  canonical metadata, Open Graph metadata, Twitter metadata, and JSON-LD.
- `seo-static-routes`: `robots.txt`, `sitemap.xml`, and `llms.txt` emit
  deterministic content with expected content types.
- `deterministic-marketing-build`: two consecutive builds emit byte-identical
  sorted whole-tree output across `apps/web/build-marketing`, including
  `_app/immutable`.
- `no-third-party-hosts`: prerendered HTML contains no network-bearing
  `http(s)://` URLs outside the configured site URL and exactly
  `https://github.com/jsuvic/agent-profile`.
- `live-route-absence`: hosted output does not include `/dashboard`, `/profile`,
  or other local UI route links.

## Verification

Run:

```bash
npm test --workspace @agent-profile/web
AGENT_PROFILE_SITE_URL=https://agent-profile.com npm run build:marketing --workspace @agent-profile/web
```

`agent-profile.com` domain and Search Console ownership are a pre-merge
prerequisite and are already satisfied.
