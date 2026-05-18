# Phase 14 Release Notes

Phase 14 introduces the safe-import, ownership, and region-aware merge layer.
This page collects breaking-ish behavior changes and upgrade guidance.

## Highlights

- New `init --import --strategy preserve|regions` and `init --update-gitignore`
  flags for repositories that already have `AGENTS.md`, `CLAUDE.md`, custom
  skills, or local MCP/Codex/Claude runtime config.
- `AGENTS.md` and `CLAUDE.md` support mixed ownership: a compiler-managed
  generated region plus a byte-preserving manual region marked by the four
  explicit HTML markers `<!-- agent-profile:generated:start -->` / `:end -->`
  and `<!-- agent-profile:manual:start -->` / `:end -->`.
- New doctor codes: `LINT-REGION-001/002/003/004`, `LINT-OWN-001/002`,
  `LINT-SKILL-009`, `LINT-SUBAGENT-009`, `LINT-GITIGNORE-002`.
- `init --import --json` emits the structured `ImportReport` shape at the
  JSON top level (`command`, `mode`, `strategy`, `root`, `profilePath`,
  `stack`, `files[]`, `gitignore[]`, `summary{}`).

## Lockfile v2

`ai-profile.lock` is now version 2 with explicit ownership labels:

| Ownership          | Stored hashes        | Doctor drift behavior                              |
| ------------------ | -------------------- | -------------------------------------------------- |
| `generated-owned`  | whole-file `sha256`  | Drift fails (`LINT-LOCK-007`).                     |
| `mixed`            | generated-region hash only | Generated-region drift fails (`LINT-REGION-004`). Manual edits never fail. |
| `manual-owned`     | path-tracked only    | No drift checks; doctor preserves the file.        |

Version 1 lockfiles remain readable through version dispatch and are
**migrated to v2 on the next successful `compile --write`**. Migration rules:

- Every v1 output becomes `ownership: "generated-owned"`.
- `sha256`, `target`, `templateId`, and output ordering are copied unchanged.
- Mixed ownership is **not** inferred from v1.
- A second successful compile produces byte-identical v2 lockfile bytes for
  the same inputs (idempotent).

### Forward incompatibility

Older `agent-profile` binaries that only know lockfile v1 will **reject** v2
lockfiles. This is expected and documented in the lockfile v2 spec.

Recommended upgrade path:

1. Upgrade every developer machine, CI runner, and release pipeline that runs
   `agent-profile` to the v2-aware build before any developer commits a v2
   lockfile to the shared branch.
2. After upgrading, run `agent-profile compile --write` once to materialize
   the v2 lockfile. The compiler emits v2 by default.

## Region adoption

For a repository that already has user-authored `AGENTS.md` / `CLAUDE.md`:

```bash
agent-profile init --import --strategy regions --dry-run
agent-profile init --import --strategy regions --write
agent-profile compile --write
agent-profile doctor
```

- The existing file's bytes are preserved verbatim inside the manual region.
- The generated region is rendered by the same code path as `compile`, so
  the region hash matches the compiler's expected output.
- `compile --write` updates only the generated region of mixed files on
  every subsequent run.
- `compile --write` **refuses** to overwrite an existing `AGENTS.md` or
  `CLAUDE.md` that has no region markers, and `--force` does **not** bypass
  that refusal. The supported repair path is manual: move/remove the file
  or re-run `init --import --strategy regions --write`.

Partial or duplicate markers are errors and are never auto-repaired
(`LINT-REGION-001`/`LINT-REGION-002`).

## `.gitignore` recommendations

Run `agent-profile init --import --update-gitignore --write` to append the
recommended ignore lines for local-runtime files:

```text
.cce/
.mcp.json
.claude/settings.local.json
.claude/worktrees/
.codex/config.toml
.codex/hooks.json
```

`.claude/settings.json` is **generated client config** in this product and is
intentionally **not** recommended for ignore.

On a fresh clone, `agent-profile doctor` reports `LINT-LOCK-006` as a
**warning** (not error) for paths matching the local-runtime ignore list, with
the guidance to run `agent-profile compile --write` to materialize them.

## Symlink safety

Phase 14 explicitly does not follow file symlinks for paths it reads or
writes:

- `compile --write` refuses to write through symlinked targets.
- `init --import` refuses symlinked scan roots (e.g. a `.agents/skills`
  symlink to outside the repo) and skips symlinked subdirectory entries.
  Refusals surface as `refuse-conflict` entries in the import report.
- `agent-profile doctor` does not follow symlinks when reading known paths.

A symlinked `AGENTS.md` pointing at `.env` is now refused at every layer.

## Cross-references

- [`docs/specs/phase-14/001-safe-import-ownership-and-regions.md`](../specs/phase-14/001-safe-import-ownership-and-regions.md)
- [`docs/specs/phase-14/002-lockfile-v2.md`](../specs/phase-14/002-lockfile-v2.md)
- [`docs/cli/README.md`](../cli/README.md)
