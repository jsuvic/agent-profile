# Spec: CLI Init

## Status

Verified

Approved for Phase 5 implementation on 2026-05-02. Implemented on
2026-05-03. Verified on 2026-05-03 with workspace checks, tests, and build.

## Problem

Users need a safe way to create a starting `ai-profile.yaml` without guessing
the schema or copying fixtures manually.

## Goal

Add `agent-profile init` to create a minimal local profile through dry-run and
explicit write flows.

## Non-Goals

- compiling generated artifacts
- importing existing agent files
- full project scanner implementation
- installing dependencies
- configuring client runtime settings
- emitting hooks, subagents, plugins, global memory writes, or dedicated
  knowledge MCP/tool artifacts

## User Flow

```bash
agent-profile init --root . --dry-run
agent-profile init --root . --write
agent-profile init --root . --write --profile ai-profile.yaml
agent-profile init --root . --import --dry-run
```

Dry-run is the default unless `--write` is provided.

## Inputs

- `--root <path>`, default `.`
- `--profile <path>`, default `ai-profile.yaml`, resolved relative to `--root`
- `--dry-run`
- `--write`
- `--import`, defined by `005-import-existing-artifacts.md`
- optional detected stack summary from `004-stack-detection.md`

## Outputs

- minimal valid `ai-profile.yaml` preview or write
- deterministic CLI report
- `.gitignore` suggestions when `.env` or `.env.*` protection is missing; init
  must not modify `.gitignore`

Default generated profile values when no stack/import signal overrides them:

```yaml
version: 1
profile:
  name: <slugified-root-directory-name>
  description: Local AI-agent setup.
stack:
  languages: <detected languages, or error if none>
  frameworks: []
  packageManagers: []
  testing: []
clients:
  tabnine:
    enabled: false
  codex:
    enabled: false
  claude:
    enabled: false
safety:
  mode: guarded
  requiresSandbox: false
workflow:
  sdd: true
  tdd: true
  finalReview: true
permissions:
  filesystem:
    read: allow
    write: ask
  shell:
    run: ask
  secrets:
    access: deny
  dependencies:
    install: ask
  network:
    external: ask
  production:
    access: deny
```

`profile.name` is the `--root` directory basename slugified to the schema
pattern. If the slug would be empty, use `default-profile`.

If stack detection finds no language, init must not write a profile. It reports
a deterministic error asking the user to add stack metadata or create
`ai-profile.yaml` manually, because schema v1 requires at least one language.

ADR 0005 reserves a future `capabilities` profile block. Phase 5 init must not
emit that block until the runtime schema accepts it. The MVP profile expresses
the same supported intent through `clients`, `workflow`, `safety`, and
`permissions`.

## Contracts

- Generated profile must validate against `001-profile-schema-v1.md`.
- Init must not overwrite an existing profile without diff-before-write and an
  explicit write request.
- Init must not mutate `.gitignore`; it may recommend changes.
- Init output must be deterministic for the same detected inputs.
- `--dry-run` and `--write` together are an argument error and exit `2`.
- `--profile` must be repository-relative under `--root` and pass
  `safeOutputPath`.
- Init does not run doctor automatically; users invoke `agent-profile doctor`
  separately.
- Guarded defaults are defined by ADR 0002. This spec pins the YAML bytes for
  init golden tests.
- Capability defaults are defined by ADR 0005. Phase 5 init emits only the
  currently implemented schema fields and must not generate later-only
  capability artifacts.
- `init --import` combines `(detected stack from 004) + (client enablement
signals from 005) + (guarded defaults from ADR 0002)` before producing a
  profile proposal.

## Security Rules

- Do not read secret files.
- Do not upload repository contents.
- Do not install dependencies.
- Do not execute shell commands.
- Do not write unless `--write` is present.

## Acceptance Criteria

- dry-run previews a valid minimal profile
- write creates `ai-profile.yaml` when missing
- existing profile is not overwritten in dry-run
- existing profile write path uses diff-before-write
- generated profile includes guarded safety defaults
- generated profile denies secrets and production access
- no detectable language produces a deterministic non-write error
- missing `.gitignore` or missing `.env` rules produces suggestions without
  mutating `.gitignore`

## Tests

- dry-run leaves temp project unchanged
- write creates valid `ai-profile.yaml`
- existing profile is protected by diff-before-write
- generated profile validates through core schema validator
- no `.env` files are read
- no detectable language refuses write
- existing `.gitignore` bytes are unchanged while suggested `.env` lines are
  reported
- `--import` is accepted and delegates import analysis to
  `005-import-existing-artifacts.md`

## Documentation Updates

- `README.md`
- `docs/cli/README.md`

## Final Review Checklist

- default behavior is non-mutating
- profile validates
- no secret files are read
- write behavior is explicit and reviewable
