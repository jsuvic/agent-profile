# @agent-profile/web

Local-first UI for Agent Profile Compiler. The SvelteKit app displays the
parsed `ai-profile.yaml`, the compiler's would-be output, and the doctor's
findings. The `/profile` route can edit the source `ai-profile.yaml` through
server-side validation, plain-text diff review, and explicit confirmation.
Generated artifacts still go through the CLI
(`npx agent-profile compile --write`). Launched in production via
`npx agent-profile ui`; this package ships the built server output.

## Status

Phase 8 adds guarded local editing for an existing `ai-profile.yaml`. Phase 7
marketing/live route separation and CLI launch support still apply. Specs live
under [`docs/specs/`](../../docs/specs/).

## Run

```bash
# from the repo root
npm install
npm run dev --workspace @agent-profile/web
```

The dev server binds to `127.0.0.1:5176` by default (loopback only).

Published CLI launch path:

```bash
npx agent-profile ui
npx agent-profile ui --root /path/to/project --port 5174
```

The packaged UI is served from the built `@agent-profile/web` server output.
The CLI passes the project root through `AGENT_PROFILE_ROOT`; the server must
not rely on the package install directory as project state.

By default the UI reads `ai-profile.yaml` from the current working directory.
Override the project root with `AGENT_PROFILE_ROOT`:

```bash
AGENT_PROFILE_ROOT=/path/to/your/repo npm run dev --workspace @agent-profile/web
```

## Routes

| Path         | Source                              | Notes                              |
| ------------ | ----------------------------------- | ---------------------------------- |
| `/`          | `src/routes/+page.svelte`           | Marketing/onboarding route         |
| `/landing`   | `src/routes/landing/+page.svelte`   | Redirect alias to `/`              |
| `/dashboard` | `src/routes/dashboard/+page.svelte` | Live project overview              |
| `/profile`   | `src/routes/profile/+page.svelte`   | Guarded source profile editor      |
| `/artifacts` | `src/routes/artifacts/+page.svelte` | Compiler tree + read-only preview  |
| `/doctor`    | `src/routes/doctor/+page.svelte`    | Grouped findings list              |
| `/diff`      | `src/routes/diff/+page.svelte`      | Example placeholder + CLI guidance |
| `/targets`   | `src/routes/targets/+page.svelte`   | Target support and profile state   |
| `/settings`  | `src/routes/settings/+page.svelte`  | Read-only settings reference       |

`/` is standalone and does not use live project loader data. Example project
values on the landing page are labeled as examples. Live project state starts
at `/dashboard` and the other app-shell routes.

## Profile Editing

`/profile` edits only supported schema v1 fields in `ai-profile.yaml`.
Unsupported or invalid profiles render validation feedback and keep edit mode
disabled. The browser does not create a missing profile.

The save flow is:

1. Client-side field checks run for required fields, slug syntax, and duplicate
   token lists.
2. `POST /api/profile/plan` re-reads `ai-profile.yaml`, validates the candidate
   through `@agent-profile/core`, rejects secret-like or invalid-encoding
   values, checks the base ETag, and returns a unified diff plus a short-lived
   plan token.
3. The modal renders the diff as text in a `<pre>`.
4. `POST /api/profile/apply` consumes the plan token, re-reads the file,
   re-validates the candidate, verifies the candidate hash, and writes only
   `<root>/ai-profile.yaml` through the fixed-profile atomic write helper.

The profile API has no generic file-write endpoint and no route that writes
generated artifacts, lockfiles, package files, `.gitignore`, `.mcp.json`, or
client runtime config.

## Hosted SEO

The hosted marketing build is static-only and requires a canonical site URL:

```bash
AGENT_PROFILE_SITE_URL=https://your-domain.example npm run build:marketing --workspace @agent-profile/web
```

`AGENT_PROFILE_SITE_URL` must be an origin URL with no path, query, or hash.
The build normalizes the root URL with a trailing slash and uses it in the
canonical link, Open Graph metadata, Twitter metadata, JSON-LD, `robots.txt`,
`sitemap.xml`, and `llms.txt`.

The hosted artifact must not link to local-only app routes. Visitors should use
the local CLI launch path instead:

```bash
npx agent-profile ui
```

## Missing Profile Onboarding

When no `ai-profile.yaml` exists, live project routes render bootstrap states
instead of demo project data. The UI explains that `ai-profile.yaml` is the
canonical local intent file and shows inert terminal commands:

```bash
npx agent-profile init --write
npx agent-profile compile --dry-run
npx agent-profile compile --write
npx agent-profile doctor
```

## Local-Only Network Posture

- the dev server binds to `127.0.0.1` (see `vite.config.ts`)
- there are no third-party fonts loaded at runtime
- there are no analytics or telemetry calls
- there are no outbound HTTP requests from any route handler
- write-capable routes reject mismatched loopback host/port and require CSRF

## Write Boundaries

The UI imports only the fixed-profile write helper for confirmed
`ai-profile.yaml` saves. Generated artifact mutations go through
`agent-profile` CLI commands so generated-file first-write protection and
lockfile ownership stay in one path.

## Tests

```bash
npm run test --workspace @agent-profile/web
```

Tests use Node's built-in test runner via `tsx`. They cover the project
context loader, secret redaction, preview truncation, server hook protections,
profile API helpers, and guarded profile write routes.

## Theming

Dark by default. Tokens are defined in `src/lib/styles/tokens.css` and mirror
`docs/design/phase-06/handoff/wireframes-styles.css`. Light theme parity is
intentionally deferred until the dashboard variant is selected.

The production UI uses Inter for prose and JetBrains Mono for code, paths, and
badges.
