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
agent-profile init [--root <path>] [--profile <path>] [--import] [--dry-run|--write]
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
