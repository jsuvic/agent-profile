# Contributing

Agent Profile Compiler is a local-first AI agent profile compiler. It compiles
one canonical `ai-profile.yaml` into deterministic configuration for Codex,
Claude, and Tabnine.

## Development Principles

- Start meaningful changes from a spec in `docs/specs/`.
- Keep changes scoped to the approved goal, non-goals, contracts, and acceptance
  criteria.
- Prefer tests before implementation where practical.
- Preserve deterministic generated output.
- Keep safety checks part of the product, not optional cleanup.

## Local Setup

```bash
npm install
npm run check
npm test
npm run build
```

Use npm workspaces. Do not introduce another package manager without an approved
spec.

## Safety Rules

Never add behavior that uploads source code, uploads secrets, enables telemetry,
or writes generated files without an explicit write contract. Do not read `.env`
contents during scanning or initialization.

Local machine state must stay out of commits, including `.mcp.json`, `.cce/`,
`.claude/worktrees/`, `.codex/config.toml`, generated tarballs, and package
manager credentials.

## Specs

Specs live under `docs/specs/`. Before changing implementation behavior, read
the relevant phase spec and update it first if the desired behavior is not
already covered.

For implementation work, final review should cover:

1. what changed
2. tests run
3. contract impact
4. security impact
5. remaining risks or TODOs
6. whether the spec acceptance criteria are fully met

## Publishing

Only maintainers publish npm packages. Follow `docs/release.md`.

Do not add `preinstall` or `postinstall` scripts. Release verification must
confirm package metadata, package dependency coherence, and intentional tarball
contents before publish.

### Version bumps

The wrapper `agent-profile`, `@agent-profile/cli`, and `@agent-profile/web`
must publish at the same product version, and the inter-package pins
(`agent-profile` → `@agent-profile/cli`, `@agent-profile/cli` →
`@agent-profile/web`) must be exact. The landing page also imports the
version from `apps/web/src/lib/version.ts`. Do not edit any of those by
hand. Run:

```bash
npm run version:set -- 0.1.3   # set to a specific version
npm run version:sync           # propagate the wrapper's current version
```

Then run `npm install` to refresh the lockfile. `npm run check` will fail if
any of the five mapped places drift; that check is what enforces the
contract, the script just makes it easy to satisfy.
