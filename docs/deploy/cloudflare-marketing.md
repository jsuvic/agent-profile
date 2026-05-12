# Cloudflare Marketing Page Deployment

## Purpose

This deployment publishes the public marketing page at `/` only. It does not
host project analysis, profile compilation, doctor checks, browser writes, or
any local filesystem access.

The local project UI remains available through:

```bash
npx agent-profile ui
```

## Cloudflare Pages Dashboard Settings

Cloudflare Pages supports static SvelteKit output through the static adapter;
for this project the static output directory is customized to
`apps/web/build-marketing`.

The `build:marketing` script also builds the internal packages needed during
SvelteKit prerendering, so the Cloudflare build command can stay as one command.

Create a Cloudflare Pages project connected to this repository and use these
build settings:

| Setting                | Value                                                    |
| ---------------------- | -------------------------------------------------------- |
| Framework preset       | None or SvelteKit with custom output                     |
| Root directory         | repository root                                          |
| Build command          | `npm run build:marketing --workspace @agent-profile/web` |
| Build output directory | `apps/web/build-marketing`                               |
| Deploy command         | leave empty                                              |

Set this production environment variable in the Pages project:

| Variable                 | Value                       |
| ------------------------ | --------------------------- |
| `AGENT_PROFILE_SITE_URL` | `https://agent-profile.com` |

Do not use `npx wrangler deploy` as the Pages deploy command from the monorepo
root. That command targets Wrangler application detection for Workers-style
deploys and can fail before it reaches the static Pages output.

## Direct Upload

For a one-off manual Pages upload:

```bash
AGENT_PROFILE_SITE_URL=https://agent-profile.com \
npm run build:marketing --workspace @agent-profile/web
npx wrangler pages deploy apps/web/build-marketing --project-name <pages-project-name>
```

## Build Modes

The web package has two build modes:

- `npm run build --workspace @agent-profile/web` builds the Node server used by
  the npm-distributed local UI package.
- `npm run build:marketing --workspace @agent-profile/web` prerenders only `/`
  into `apps/web/build-marketing` for public static hosting.

The marketing build requires `AGENT_PROFILE_SITE_URL`. The value is normalized
to the canonical root URL with a trailing slash and is used by canonical
metadata, JSON-LD, `robots.txt`, `sitemap.xml`, and `llms.txt`.

## Security Boundary

The hosted marketing page must stay static and informational:

- no telemetry or analytics by default
- no source-code upload
- no secret upload
- no hosted repository scanning
- no hosted compilation
- no credential-entry forms
- no local filesystem access

Future hosted preset tokens are Phase 9 scope. A token may describe selected
setup intent and preferences, but it must not contain source code, secrets,
absolute paths, generated artifacts, or scan results. Repository scanning and
compilation remain local through `npx agent-profile`.

## References

- [Cloudflare Pages SvelteKit guide](https://developers.cloudflare.com/pages/framework-guides/deploy-a-svelte-kit-site/)
