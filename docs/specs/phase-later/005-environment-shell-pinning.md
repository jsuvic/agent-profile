# Spec: Environment and Shell Pinning

## Status

Draft for a later phase. Not MVP.

## Problem

Agents currently re-probe the shell environment on every session and produce
inconsistent commands across contributors and operating systems. The same
profile generates outputs that appear to work on one machine and fail on
another, because the canonical "how do I run tests / install deps / lint"
commands are not declared anywhere in the compiled output.

## Goal

Allow `ai-profile.yaml` to declare the project's canonical shell and a small
table of operational commands. The compiler emits this as a deterministic
`## Environment` block in generated `AGENTS.md` (and equivalent sections in
other targets where supported), so agents do not need to detect the shell
themselves.

## Non-Goals

- detecting the user's shell or OS at compile time
- modifying the user's shell, PATH, or rc files
- installing shells or interpreters
- generating per-machine commands
- executing the declared commands during compile or doctor
- emitting global/user-level configuration

## User Flow

```yaml
# ai-profile.yaml (illustrative)
environment:
  canonical_shell: bash      # bash | pwsh | sh
  os_targets: [linux, macos, windows]
  commands:
    install: npm ci
    test: npm test
    lint: npm run lint
    build: npm run build
  per_os:
    windows:
      install: npm ci
      test: npm test
```

The compiler emits a deterministic `## Environment` section in `AGENTS.md`
listing the canonical shell, supported OSes, and the command table. When
`per_os` overrides exist, the section enumerates them with explicit OS labels.

## Inputs

- `environment` block in `ai-profile.yaml`
- target documentation for AGENTS.md, Codex, Claude, Tabnine

## Outputs

- `## Environment` section in compiled `AGENTS.md`
- equivalent sections in other targets where supported
- doctor findings when declared commands reference forbidden patterns
  (e.g. `sudo`, absolute home paths, network installs without lockfile)

## Contracts

- Environment block is optional. Profiles without it produce no `## Environment`
  section and existing behavior is unchanged.
- Output must be deterministic across runs and across operating systems.
- Per-OS overrides must be explicit; the compiler must not infer them.
- The compiler must not run, validate, or shell out to declared commands.
- Local overrides (e.g. an untracked `AGENTS.local.md`) are out of scope for
  this spec and require a separate approved spec.

## Security Rules

- Do not execute declared commands.
- Do not read shell rc files, environment variables, or `PATH`.
- Do not write to the user's shell configuration.
- Do not embed secrets or tokens in command strings; doctor must flag any
  command containing patterns matching known secret shapes.
- Do not auto-install missing shells or interpreters.

## Acceptance Criteria

- profiles with an `environment` block produce a deterministic `## Environment`
  section in `AGENTS.md`
- profiles without an `environment` block produce no such section
- per-OS overrides render with explicit OS labels
- doctor flags commands with forbidden patterns
- compiled output byte-matches across Linux, macOS, and Windows runs

## Tests

- golden tests for environment block rendering
- golden tests for per-OS override rendering
- absence-of-block test (no section emitted)
- doctor unsafe-command rejection tests
- cross-platform determinism test

## Documentation Updates

- `docs/profile/schema.md` — add `environment` block
- `docs/targets/agents-md.md` — document `## Environment` section
- target capability matrix — add environment-block support per target

## Final Review Checklist

- no command execution during compile or doctor
- no shell or rc file mutation
- output deterministic across operating systems
- environment block remains fully optional
- local override mechanism explicitly deferred to a follow-up spec
