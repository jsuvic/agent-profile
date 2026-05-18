# CLI Reference

Implemented:

- `agent-profile doctor`
- `agent-profile compile`
- `agent-profile init`
- `agent-profile ui`

Deferred:

- standalone `agent-profile diff` is deferred by ADR 0006. A later
  `doctor --diff` mode must amend the doctor command spec and JSON output
  contract before implementation.

## Commands

```bash
agent-profile doctor [--root <path>] [--json]
agent-profile compile [--root <path>] [--profile <path>] [--target <id>] [--dry-run|--write] [--force]
agent-profile init [--root <path>] [--profile <path>] [--import] [--strategy preserve|regions] [--update-gitignore] [--preset <token>] [--client <list>] [--no-client <list>] [--json] [--quiet] [--dry-run|--write]
agent-profile ui [--root <path>] [--host <host>] [--port <number>] [--open]
```

`compile` and `init` default to dry-run. File mutation requires `--write`.
`compile --write` requires `--force` before replacing existing generated-path
files that are not proven compiler-owned by `ai-profile.lock`.

For region-aware root instruction files (`AGENTS.md` and `CLAUDE.md`),
`compile --write` refuses to overwrite unmarked existing files and does not
accept `--force` as a bypass; the supported repair path is
`agent-profile init --import --strategy regions --write` (or moving/removing
the file). This matches the Phase 14 spec, which classifies marker repair as
manual.

`--root` is the repository trust boundary. The CLI rejects unsafe relative
paths and symlinks that resolve outside that root.

`ui` starts the read-only browser UI for the selected root. It binds to
`127.0.0.1` by default, accepts only `127.0.0.1`, `localhost`, or `::1` for
`--host`, and passes the root explicitly to the server.

Exit codes:

| Code | Meaning                                                            |
| ---- | ------------------------------------------------------------------ |
| `0`  | command completed without errors                                   |
| `1`  | validation, compile, doctor, or write-safety error                 |
| `2`  | argument parsing failure                                           |
| `3`  | write would replace protected existing files and `--force` missing |

`compile` does not delete orphaned generated files. A future prune mode
requires a separate approved spec.

All write-capable commands must default to dry-run and use diff-before-write
before mutating repository files.

## Init Clients

`agent-profile init` preserves the phase 5 default profile bytes unless client
selection is explicit. With no client flags, `tabnine`, `codex`, and `claude`
remain disabled in the generated profile.

```bash
agent-profile init --client codex
agent-profile init --client codex,claude --write
agent-profile init --client all --no-client tabnine --write
```

`--client` and `--no-client` accept `tabnine`, `codex`, `claude`, or `all`.
Lists are comma-separated and case-sensitive. `--no-client` is applied after
`--client`, imported client signals, or preset client preferences.

Init reports include a client matrix:

```text
clients:
  tabnine: disabled
  codex: enabled (--client)
  claude: disabled
clients enabled: codex
```

`init --json` emits a single-line JSON summary on stdout instead of the human
report. `init --quiet` suppresses the human report unless `--json` is also
present.

If `ai-profile.yaml` already exists, init reports that no changes are proposed.
It does not edit existing profiles, even when client flags and `--write` are
present. Use `agent-profile compile --dry-run` to inspect compiled artifacts.

Stack detection is conservative and metadata-only. It does not parse
`README.md` prose or source files. If no supported language metadata exists,
`init` refuses to write; create `ai-profile.yaml` manually, then use
`agent-profile compile --dry-run` to inspect generated artifacts.

Supported root metadata files: `package.json`, `tsconfig.json`,
`svelte.config.*`, `vite.config.*`, `playwright.config.*`, `pom.xml`,
`build.gradle`, `build.gradle.kts`, and `pubspec.yaml`. Flutter/Dart projects
are detected from `pubspec.yaml` (project metadata and dependency key names
only — never lockfiles, `.dart_tool`, source, assets, or Firebase config).

## Init Presets

`agent-profile init --preset <token>` verifies a short-lived hosted preset token
offline and merges its client, safety, workflow, and permission preferences with
local stack detection.

```bash
agent-profile init --preset <token>
agent-profile init --preset <token> --dry-run
agent-profile init --preset <token> --write
```

Dry-run is the default. `--write` writes only the root `ai-profile.yaml`.
Repository analysis happens locally, token processing performs no network calls,
and no source code is uploaded. Preset init does not read `.gitignore` for
secret-file ignore suggestions; it limits local reads to stack-detection
metadata and the target profile path.

Phase 9 incompatibilities:

- `--preset` cannot be combined with `--import`.
- `--preset` cannot be combined with `--profile`; preset init writes only
  `ai-profile.yaml`.
- `compile`, `doctor`, and `ui` do not accept `--preset`.

Hosted preset builder ships in a later phase. The CLI is ready to verify tokens
that match this contract.

## Init Import (Phase 14)

`agent-profile init --import` reports existing agent artifacts and, when
`--strategy regions --write` is added, wraps existing `AGENTS.md` and
`CLAUDE.md` content into a manual region with a compiler-managed generated
region above it.

```bash
agent-profile init --import --dry-run
agent-profile init --import --strategy preserve --dry-run
agent-profile init --import --strategy regions --write
agent-profile init --import --update-gitignore --write
```

Strategy rules:

- `--strategy preserve` (default) never modifies existing agent artifacts;
  the command writes only `ai-profile.yaml` when needed.
- `--strategy regions` is allowed only with `--import`. With `--write` it
  wraps existing `AGENTS.md`/`CLAUDE.md` bytes inside the manual region and
  inserts the generated region. It is a no-op for skills, subagents, MCP
  config, and client runtime config.
- `--strategy regions --write` refuses (exit `3`) when a region-aware file
  has partial markers, duplicate markers, or is a symlink. The repair path
  is manual: move/remove the file, then re-run.

`--update-gitignore` is allowed only with `--write` and appends missing
recommended ignore lines for local-runtime files:

```text
.cce/
.mcp.json
.claude/settings.local.json
.claude/worktrees/
.codex/config.toml
.codex/hooks.json
```

`.claude/settings.json` is generated client config in this product and is
intentionally **not** recommended for ignore.

`init --import --json` emits the Phase 14 `ImportReport` shape at the JSON
top level (`command`, `mode`, `strategy`, `root`, `profilePath`, `stack`,
`files[]`, `gitignore[]`, `summary{}`). Plain-text mode prints the same
facts in deterministic path order under "Phase 14 import report:".

`init` and `compile` never follow file symlinks for paths Phase 14 reads or
writes (`AGENTS.md`, `CLAUDE.md`, skill/subagent scan roots, generated write
targets, `.gitignore`). Symlinked items are reported as `refuse-conflict` in
the import report.

## Lockfile Version 2 (Phase 14)

`ai-profile.lock` is now version 2 with explicit ownership labels:

- `generated-owned` — the whole file is generated and lockfile-owned.
- `mixed` — the file has a generated region and a manual region; only the
  generated region is hashed.
- `manual-owned` — the file is intentionally user-authored (path-tracked
  only).

Version 1 lockfiles remain readable and are migrated to v2 on the next
successful `compile --write`. The migration is deterministic and idempotent.
Older `agent-profile` binaries that only know v1 will reject v2 lockfiles;
this forward-incompatibility is documented in
[`docs/release-notes/phase-14.md`](../release-notes/phase-14.md).
