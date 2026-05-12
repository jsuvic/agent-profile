# Spec: CLI Diff Command

## Status

Deferred

Deferred from Phase 5 by
`docs/architecture/decisions/0006-cli-diff-deferral.md`.

## Problem

Phase 5 adds an internal diff-before-write helper used by `compile` and `init`.
Users may also want a standalone `agent-profile diff` command, but that command
has different UX, exit-code semantics, and JSON output needs than the write
helper.

## Goal

Define a future standalone `agent-profile diff` command after compile/init are
implemented and verified.

## Non-Goals

- blocking Phase 5 compile/init implementation
- replacing `003-diff-before-write.md`
- implementing interactive patch selection
- deleting files
- printing full file contents by default
- adding `doctor --diff` without first amending the doctor command spec and
  doctor JSON output contract

## User Flow

Future command shape:

```bash
agent-profile diff --root .
agent-profile diff --root . --target agents-md
agent-profile diff --root . --json
```

## Inputs

- root directory
- optional target filters
- current `ai-profile.yaml`
- current generated artifacts
- current `ai-profile.lock`

## Outputs

- deterministic diff report
- optional JSON report
- CI-friendly exit code

## Contracts

- This command must reuse the compile output and diff-before-write contracts.
- It must not write files.
- It must not delete files.
- It must not print file contents by default.
- It must distinguish generated output drift from lockfile drift.

## Security Rules

- Do not read secret files.
- Do not upload artifacts.
- Do not mutate files.
- Do not execute shell commands.
- Do not install dependencies.

## Acceptance Criteria

- To be defined after `001-cli-compile-dry-run-and-write.md` and
  `003-diff-before-write.md` are implemented.

## Tests

- To be defined in the future diff-command implementation spec review.

## Documentation Updates

- `docs/cli/README.md`

## Final Review Checklist

- command is separate from write-capable compile/init flows
- output is deterministic
- no contents are leaked by default
- no writes occur
