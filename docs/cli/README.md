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
agent-profile init [--root <path>] [--profile <path>] [--import] [--preset <token>] [--client <list>] [--no-client <list>] [--json] [--quiet] [--dry-run|--write]
agent-profile ui [--root <path>] [--host <host>] [--port <number>] [--open]
```

`compile` and `init` default to dry-run. File mutation requires `--write`.
`compile --write` requires `--force` before replacing existing generated-path
files that are not proven compiler-owned by `ai-profile.lock`.

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
