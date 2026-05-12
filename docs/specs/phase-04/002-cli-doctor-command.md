# Spec: CLI Doctor Command

## Status

Verified

Implemented in `apps/cli` and verified on 2026-05-02 after final
implementation review.

## Problem

The repo has library-level schema, compiler, lockfile, and target output
contracts, but users need one command that runs local verification checks from a
project root.

## Goal

Add a minimal `agent-profile doctor` command that runs doctor checks for
profile validation, lockfile drift, and permission posture.

## Non-Goals

- implementing `init`
- implementing `compile`
- implementing `diff`
- writing or repairing generated files
- changing client runtime settings
- installing dependencies or MCP servers
- uploading data

## User Flow

```bash
agent-profile doctor
agent-profile doctor --root .
agent-profile doctor --json
```

The command prints a deterministic human-readable report by default. With
`--json`, it prints a stable JSON envelope.

## Inputs

- `--root <path>` optional project root, default `.`
- `--json` optional JSON output flag
- repository-local `ai-profile.yaml`
- repository-local `ai-profile.lock`
- generated project config files

## Outputs

Default text output:

```text
Agent Profile Doctor
status: pass|warn|fail

[error] LINT-... path
message
guidance
```

JSON output:

```ts
type DoctorCliJson = {
  ok: boolean;
  status: "pass" | "warn" | "fail";
  issues: DoctorIssue[];
};
```

Exit status:

- `0` when no `error` severity issues exist
- `1` when one or more `error` severity issues exist
- `2` for CLI usage errors

## Contracts

- `agent-profile` bin points to `apps/cli/dist/index.js`.
- The CLI must call the doctor package rather than duplicating doctor logic.
- Text and JSON issue ordering must match doctor package ordering.
- Issue messages must not include source contents, secret values, or environment
  values.
- The CLI must not write files.

## Security Rules

- Do not upload profile, generated config, lockfile, or source contents.
- Do not read secret files.
- Do not print environment variable values.
- Do not execute shell commands other than this CLI process.
- Do not install dependencies.
- Do not mutate files or client settings.

## Acceptance Criteria

- `agent-profile doctor` runs against the current directory.
- `agent-profile doctor --root <path>` runs against an explicit root.
- `agent-profile doctor --json` prints stable JSON.
- The command exits `1` when doctor reports errors.
- The command exits `0` when doctor reports pass or warning-only status.
- Unknown options exit `2`.
- CLI output is deterministic and does not include secret-like file contents.

## Tests

- text doctor command prints pass status for the minimal valid fixture
- JSON doctor command prints stable JSON
- missing lockfile returns exit code `1`
- unknown argument returns exit code `2`
- CLI does not mutate fixture files

## Documentation Updates

- `README.md`
- future CLI reference documentation

## Final Review Checklist

- command is intentionally narrow
- doctor logic lives in `packages/doctor`
- no file writes occur
- exit codes are CI-scriptable
- output is deterministic
