# Spec: Doctor Subagent Checks

## Status

Implemented. Lifted from `phase-later/002-subagents-targets.md` on 2026-05-16.
Landed on 2026-05-17 in `dcf18bd` (PR #16). Depends on
`001-subagents-schema.md`, `002-claude-subagents-target.md`,
`003-codex-subagents-target.md`, and `004-tabnine-subagents-target.md`.

## Problem

Generated subagent artifacts add new ways the project can drift from
`effectivePermissions`: looser tool surfaces, unsafe permission modes,
shadowed built-in names, and orphan files no longer claimed by the current
profile. Existing doctor specs (`phase-04/001`, `phase-04/003`, `phase-04/005`,
`phase-04/006`) cover lockfile drift, permission-mode checks, security checks,
and skill checks but do not target subagent files specifically.

## Goal

Add a new doctor check family for subagent artifacts under `.claude/agents/`,
`.codex/agents/`, and `.tabnine/agent/agents/`. Define the issue codes, the
severity policy, the built-in collision lists per target, and the
no-print-contents rule for findings.

## Non-Goals

- enforcing client runtime permissions
- changing client settings automatically
- launching or invoking subagents
- absorbing `phase-04/006` skill checks (subagents are a separate check
  family)
- absorbing `phase-04/003` permission-mode checks (this spec uses the same
  evaluator but adds subagent-specific issue codes)
- absorbing `phase-04/001` lockfile drift (this spec extends it with
  subagent-specific orphan detection)

## Inputs

- root directory
- `ai-profile.yaml`
- `ai-profile.lock` once available
- generated subagent files listed by the current compiler target set
- derived `effectivePermissions`
- target-specific built-in collision lists from `001-subagents-schema.md`

## Outputs

- doctor report entries using the issue codes defined below
- CI-friendly non-zero exit when configured severity requires failure
- remediation guidance for each finding
- no file contents are included in findings

## Issue Envelope

```ts
type DoctorSubagentIssue = {
  code:
    | "LINT-SUBAGENT-001"
    | "LINT-SUBAGENT-002"
    | "LINT-SUBAGENT-003"
    | "LINT-SUBAGENT-004"
    | "LINT-SUBAGENT-005"
    | "LINT-SUBAGENT-006"
    | "LINT-SUBAGENT-007"
    | "LINT-SUBAGENT-008";
  severity: "info" | "warning" | "error";
  path: string;
  expected: string;
  actual: string;
  message: string;
  guidance: string;
};
```

Issue ordering is deterministic by `severity`, `path`, `code`, then
`message`. Findings must not include file contents, source contents, secret
values, or environment values.

## Issue Catalog

| Code                | Severity | Condition                                                                                                                    |
| ------------------- | -------- | ---------------------------------------------------------------------------------------------------------------------------- |
| `LINT-SUBAGENT-001` | error    | generated subagent grants a tool or permission looser than `effectivePermissions`                                            |
| `LINT-SUBAGENT-002` | error    | generated or project subagent contains literal secret-like values or inline credential material                              |
| `LINT-SUBAGENT-003` | error    | generated Codex subagent uses `danger-full-access`                                                                           |
| `LINT-SUBAGENT-004` | error    | generated Claude subagent uses `bypassPermissions`                                                                           |
| `LINT-SUBAGENT-005` | warning  | generated subagent name collides with known built-in names                                                                   |
| `LINT-SUBAGENT-006` | warning  | generated subagent file exists on disk but is no longer claimed by current compile output and lockfile                       |
| `LINT-SUBAGENT-007` | warning  | Tabnine subagent uses write, shell, browser, or network-capable tools while the feature remains experimental/no-confirmation |
| `LINT-SUBAGENT-008` | info     | target runtime enablement cannot be verified, such as Tabnine `experimental.enableAgents`                                    |

### Built-in Collision Lists

Per `001-subagents-schema.md`, the following built-in names trigger
`LINT-SUBAGENT-005` (warning) when matched after hyphen/underscore
normalization, and are hard-rejected by schema when matched pre-normalization:

- Codex: `default`, `worker`, `explorer`
- Claude: `explore`, `plan`, `general-purpose`
- Tabnine: `codebase_investigator`, `remote-codebase-investigator`,
  `generalist`, `browser_agent`

## Required Checks

### `LINT-SUBAGENT-001`: Subagent Looser Than Effective Permissions

For each generated subagent artifact, parse the frontmatter (Claude, Tabnine)
or TOML (Codex) and compare its declared tool surface and sandbox/permission
mode against `effectivePermissions`. If looser, report an error.

Reuses the evaluator from `phase-04/003-doctor-permission-mode-checks.md`
extended to handle subagent file shapes. Subagent issues use
`LINT-SUBAGENT-001`, not `LINT-PERM-005`, so users can distinguish drift
sources.

### `LINT-SUBAGENT-002`: Secret-Like Material In Subagent File

For each generated or project subagent artifact under supported roots, scan
for literal secret-like values (high-entropy strings, well-known token
prefixes, bearer headers, inline credentials). Use the same patterns as
`phase-04/005-doctor-security-checks.md`. Report an error per finding without
printing the matched bytes.

### `LINT-SUBAGENT-003`: Codex `danger-full-access`

If any generated subagent under `.codex/agents/` contains
`sandbox_mode = "danger-full-access"`, report an error. The compiler never
generates this; the check guards against post-compile tampering or
manually-authored files that fall under the same root.

### `LINT-SUBAGENT-004`: Claude `bypassPermissions`

If any generated subagent under `.claude/agents/` declares
`permissionMode: bypassPermissions`, report an error. The compiler never
generates this; the check guards against post-compile tampering or
manually-authored files that fall under the same root.

### `LINT-SUBAGENT-005`: Built-in Collision

If any subagent name collides with a documented built-in for its target after
hyphen/underscore normalization, report a warning. Schema-level rejection
already covers exact pre-normalization matches.

### `LINT-SUBAGENT-006`: Orphan Generated Subagent

If a file under `.claude/agents/`, `.codex/agents/`, or
`.tabnine/agent/agents/` contains the generated-file header but is no longer
claimed by the current compile output and lockfile, report a warning. Extends
`phase-04/001-doctor-lockfile-drift.md` orphan handling specifically for
subagent paths.

### `LINT-SUBAGENT-007`: Tabnine Unsafe Tools

If any `.tabnine/agent/agents/*.md` file declares write-capable, shell,
browser, or network-capable tools while the Tabnine subagent feature is
still documented as experimental/no-confirmation, report a warning. This is a
warning rather than an error because users may intentionally edit a
generated file to use these tools; doctor must surface the risk without
mutating the file.

### `LINT-SUBAGENT-008`: Runtime Enablement Not Verifiable

If subagent files exist under a target root but the runtime enablement
required to use them cannot be verified, report info-level guidance. Primary
case: Tabnine `experimental.enableAgents: true` is not visible in project
settings because this phase does not write `.tabnine/agent/settings.json`.

## Contracts

- Doctor distinguishes profile intent, generated config, and runtime client
  state.
- Doctor does not claim runtime enforcement beyond what the client controls.
- Doctor does not print subagent file contents in findings.
- Doctor extends, not replaces, the orphan detection in
  `phase-04/001-doctor-lockfile-drift.md` for subagent paths.
- Doctor extends, not replaces, the permission evaluator in
  `phase-04/003-doctor-permission-mode-checks.md` for subagent files.
- Subagent checks are parallel to `phase-04/006-doctor-skill-checks.md`, not
  inside it.
- Issue ordering is deterministic by `severity`, `path`, `code`, then
  `message`.
- Findings include path, expected, actual, message, and guidance — never raw
  file bytes.

## Severity Policy

| Condition                                                                     | Severity  |
| ----------------------------------------------------------------------------- | --------- |
| subagent looser than `effectivePermissions`                                   | `error`   |
| secret-like material in subagent file                                         | `error`   |
| Codex subagent `danger-full-access`                                           | `error`   |
| Claude subagent `bypassPermissions`                                           | `error`   |
| built-in name collision after normalization                                   | `warning` |
| orphan generated subagent file                                                | `warning` |
| Tabnine subagent declares write/shell/browser/network tools                   | `warning` |
| runtime enablement not verifiable (Tabnine `experimental.enableAgents`, etc.) | `info`    |

Any future policy that downgrades severity must be explicit, versioned, and
covered by tests.

## Security Rules

- Do not read secret files.
- Do not print subagent file contents in findings.
- Do not print environment variable values.
- Do not upload profile, config, lockfile, or source contents.
- Do not execute shell commands.
- Do not install dependencies.
- Do not mutate client settings or subagent files.
- Do not launch, invoke, or spawn subagents during any doctor check.

## Acceptance Criteria

- Doctor flags subagent files looser than `effectivePermissions`.
- Doctor flags secret-like material in subagent files without printing bytes.
- Doctor flags Codex `danger-full-access` and Claude `bypassPermissions` in
  subagent files.
- Doctor flags name collisions with documented built-ins per target, using
  hyphen/underscore normalization.
- Doctor flags orphan generated subagent files under each supported root.
- Doctor flags Tabnine subagents using unsafe tools.
- Doctor reports info-level guidance when runtime enablement cannot be
  verified.
- Issue ordering is deterministic.

## Tests

- generated Claude subagent with shell tools while `effectivePermissions`
  denies shell produces `LINT-SUBAGENT-001`
- subagent file containing a high-entropy token-like string produces
  `LINT-SUBAGENT-002` without printing the matched bytes
- Codex subagent containing `danger-full-access` produces `LINT-SUBAGENT-003`
- Claude subagent containing `permissionMode: bypassPermissions` produces
  `LINT-SUBAGENT-004`
- subagent named `default`/`worker`/`explorer` (Codex),
  `explore`/`plan`/`general-purpose` (Claude), or
  `codebase_investigator`/`remote-codebase-investigator`/`generalist`/`browser_agent`
  (Tabnine) produces `LINT-SUBAGENT-005`
- hyphen/underscore-folded match also triggers `LINT-SUBAGENT-005`
- generated subagent file present on disk but absent from current compile
  output and lockfile produces `LINT-SUBAGENT-006`
- Tabnine subagent declaring `run_shell_command` or `write_file` produces
  `LINT-SUBAGENT-007`
- subagent files present without verifiable runtime enablement produce
  `LINT-SUBAGENT-008`
- issue ordering is deterministic
- issue messages do not include secret-like values or file contents
- doctor exits non-zero when configured severity requires failure

## Documentation Updates

- amend `docs/specs/phase-04/001-doctor-lockfile-drift.md` to reference this
  spec for subagent orphan handling
- amend `docs/specs/phase-04/003-doctor-permission-mode-checks.md` to
  reference this spec for subagent permission evaluation
- amend `docs/specs/phase-04/005-doctor-security-checks.md` to include
  subagent artifacts in secret-pattern, source-upload, and unsafe-instruction
  checks
- amend `docs/specs/phase-04/006-doctor-skill-checks.md` to state that
  subagent checks live here, not in the skill-check family
- future doctor command documentation

## Final Review Checklist

- issue codes are unique and not duplicated across other doctor specs
- severity policy matches the umbrella `phase-later/002` table
- built-in collision lists match `001-subagents-schema.md`
- no-print-contents rule is enforced by tests
- orphan and permission evaluators reuse existing doctor infrastructure
- skill-check family is not absorbed
- doctor does not start, write, or otherwise invoke subagents
- findings do not leak file bytes

## Phase 12 Amendment (2026-07-02)

Reviewer subagents expanded from `reviewer-subagents` reuse these checks.
Missing expected reviewer files are reported by generated-artifact drift,
orphan generated reviewers by `LINT-SUBAGENT-006`, and any read-only/permission
broadening by `LINT-SUBAGENT-001`. Reviewer definitions are never executed.
