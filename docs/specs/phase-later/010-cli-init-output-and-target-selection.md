# Spec: CLI Init Output and Client Selection

## Status

Draft

Refines `docs/specs/phase-05/002-cli-init.md` (Verified). This spec does not
change the canonical profile bytes pinned by phase 5 for no-flag init. It pins
the human-visible CLI report, adds explicit client-selection ergonomics, and
defines init failure reporting.

## Problem

`npx agent-profile init` can exit without printing useful context when run in
default dry-run mode in a project where the profile already exists or where no
decisive stack signal is found. Observed on 2026-05-13:

```text
PS C:\Users\suvic\OneDrive\Documents\agent-profile> npx agent-profile init
PS C:\Users\suvic\OneDrive\Documents\agent-profile>
```

The user is left unable to tell whether init ran, no-op'd, refused, or silently
failed. This violates the project principle of explicit contracts over implicit
behavior.

A second, related gap: phase 5 init writes a profile where every first-supported
client (`tabnine`, `codex`, `claude`) defaults to `enabled: false`. A first-time
user therefore receives a profile that produces only baseline/shared compiled
artifacts until they hand-edit YAML. There is no spec'd UX for choosing which
clients to enable at init time.

## Goal

1. Make `agent-profile init` print a deterministic, human-readable report
   describing what it did, would do, refused to do, or could not do.
2. Preserve the phase 5 no-flag profile bytes: all clients remain disabled
   unless the user explicitly opts in.
3. Add `--client` / `--no-client` flags so scripted callers can opt in to
   client enablement without hand-editing YAML.
4. Render a small client matrix in the report so users see every supported
   client, not only the enabled subset.
5. Reserve, but do not implement, an interactive `--interactive` mode.
6. Fail closed and visibly when `ai-profile.yaml` cannot be planned or written.

## Non-Goals

- changing the profile bytes pinned by `phase-05/002-cli-init.md` for the
  no-flag default invocation
- using `--target` for init client selection; `compile --target` remains
  artifact-target selection
- implementing the interactive picker
- compiling per-client artifacts inside `init`; that remains the job of
  `compile`
- editing an existing `ai-profile.yaml`
- prompting for any value other than future client enablement
- adding telemetry or analytics on which clients users choose
- changing exit-code semantics already defined in phase 5

## User Flow

Default, with visible dry-run report:

```bash
npx agent-profile init
```

Output wording below is illustrative. Tests pin the exact line-prefix
vocabulary.

```text
Agent Profile Init (dry-run)

would write: ai-profile.yaml
clients:
  tabnine: disabled
  codex: disabled
  claude: disabled
clients enabled: (none)
stack detected: typescript
suggestions:
  .gitignore: add `.env`
  .gitignore: add `.env.*`

run `agent-profile init --write` to create the profile.
```

Explicit client selection:

```bash
npx agent-profile init --client codex,claude --write
npx agent-profile init --client all --write
npx agent-profile init --client all --no-client tabnine --write
```

Reserved, not implemented in this spec:

```bash
npx agent-profile init --interactive
```

Existing profile, dry-run or write:

```text
Agent Profile Init (dry-run)

unchanged: ai-profile.yaml already exists. no changes proposed.
run `agent-profile compile --dry-run` to inspect compiled artifacts.
```

No detectable stack:

```text
Agent Profile Init (refused)

refused: no language detected under --root.
schema v1 requires at least one stack.languages entry.
create ai-profile.yaml manually or add supported stack metadata and re-run init.
```

Write failure:

```text
Agent Profile Init (refused)

refused: ai-profile.yaml could not be written.
reason: permission denied.
no successful write was recorded.

fix filesystem permissions or choose a safe repository-relative --profile path.
```

## Inputs

Inherits all inputs from `phase-05/002-cli-init.md`, plus:

- `--client <list>` where `<list>` is a comma-separated subset of `tabnine`,
  `codex`, `claude`, or the literal `all`. Default: empty.
- `--no-client <list>` with the same vocabulary, applied after `--client`.
  Default: empty.
- `--json` emits a single-line machine-readable JSON summary on stdout instead
  of the human report.
- `--quiet` suppresses the human report. It is an explicit exception to the
  non-empty stdout rule. Refusals may still emit one concise stderr line. When
  combined with `--json`, JSON still goes to stdout.
- `--interactive` is reserved. If passed before a later TTY-handling spec
  implements it, init exits `2` with `interactive mode not yet implemented`.

`--target` is intentionally not accepted by `init`; it is reserved for
artifact-target selection on `compile`.

Client list parsing rules:

- lists are comma-separated and case-sensitive
- empty list values are argument errors
- empty items such as `codex,,claude` are argument errors
- unknown client ids are argument errors
- duplicates are allowed and deduplicated
- `all` expands to `tabnine`, `codex`, and `claude`
- `--no-client` is applied after `--client`

## Outputs

Every non-quiet `init` invocation, including no-op and refusal cases, must
produce one deterministic report on stdout.

The human report is structured as:

1. one-line mode header:
   - `Agent Profile Init (dry-run)`
   - `Agent Profile Init (write)`
   - `Agent Profile Init (refused)`
2. one block of facts:
   - `would write:`
   - `wrote:`
   - `unchanged:`
   - `refused:`
   - `clients:`
   - `clients enabled:`
   - `stack detected:`
3. zero or more `suggestions:` lines
4. one closing line pointing to the next expected command or corrective action

The JSON summary, when `--json` is passed, is single-line JSON on stdout:

```json
{
  "command": "init",
  "mode": "dry-run",
  "status": "ok",
  "profilePath": "ai-profile.yaml",
  "clientsEnabled": ["codex"],
  "clients": {
    "tabnine": { "enabled": false, "source": "default" },
    "codex": { "enabled": true, "source": "--client" },
    "claude": { "enabled": false, "source": "default" }
  },
  "detectedStack": ["typescript"],
  "wouldWrite": true,
  "wrote": false
}
```

The JSON object must include:

- `command: "init"`
- `mode: "dry-run" | "write" | "refused"`
- `status: "ok" | "error"`
- `profilePath`
- `clientsEnabled: string[]`
- `clients.<name>.enabled`
- `clients.<name>.source` (`default`, `preset`, `import`, `existing`,
  `--client`, or `--no-client`)
- `detectedStack: string[]`
- `wouldWrite: boolean`
- `wrote: boolean`
- `error.code` and `error.message` when `status` is `error`

Non-zero exit codes are limited to argument errors, refusals, and write
failures, matching phase 5 semantics.

## Client Selection Rules

The base client set is determined in this order:

1. `--preset` client preferences, when present
2. `--import` detected client signals, when present
3. phase 5 defaults, all disabled

Then explicit flags are applied:

1. `--client` sets listed clients to `enabled: true`
2. `--no-client` sets listed clients to `enabled: false`

The flags only adjust `clients.<name>.enabled`. They must not change safety,
workflow, permissions, stack, profile metadata, preset validation, import
findings, or generated artifacts.

If the target profile already exists, init does not edit it in this spec. Client
selection flags are reported as ignored because existing profile edits belong
to a future explicit profile-edit or UI apply flow.

## Failure Behavior

`init` writes only the selected profile file, normally `ai-profile.yaml`. It
must not create target artifacts, lockfiles, `.gitignore`, client config files,
or MCP files.

If the profile cannot be planned, created, changed, or verified, init must fail
closed:

- exit `1`
- do not print a stack trace
- do not print absolute filesystem paths
- do not print generated profile contents
- do not claim anything was written
- report `Agent Profile Init (refused)` in human mode
- report `status: "error"`, `mode: "refused"`, and `wrote: false` in JSON mode

Failure reasons should be coarse and deterministic:

- `root not found`
- `unsafe profile path`
- `profile path is a directory`
- `permission denied`
- `write failed`
- `verification failed`

Dry-run must not require write permission. It should still report what would be
written unless root/path validation or read safety fails.

Parent directories may be created only as part of the selected profile write
path. No other file families may be created by init.

## Contracts

- The report contract pins the line-prefix vocabulary:
  `would write:`, `wrote:`, `unchanged:`, `refused:`, `clients:`,
  `clients enabled:`, `stack detected:`, `suggestions:`.
- Silent success is a regression except when the user explicitly passes
  `--quiet` without `--json`.
- No-flag behavior preserves the phase 5 pinned bytes.
- Existing profiles are not edited by this spec, even when `--write` and
  client flags are present.
- `--interactive` must not silently fall through to default behavior.
- Report wording must not include absolute filesystem paths, matching
  `phase-07/002-no-profile-onboarding.md`.
- `--client` must not talk to hosted services or any network endpoint.
- `--client` and `--no-client` must not enable enterprise or later-phase
  clients.

## Security Rules

- Do not read secret files.
- Do not print the value of any environment variable.
- Do not upload the generated profile or report anywhere.
- Do not execute shell commands as part of producing the report.
- Do not install dependencies.
- Do not write literal tokens into generated configs.
- Do not write target artifacts from `init`.
- Do not mutate `.gitignore`; only suggest changes.

## Acceptance Criteria

- Default-mode invocation in fresh, existing-profile, and no-language project
  states prints a non-empty deterministic report unless `--quiet` is passed.
- `--client codex` produces a profile with `clients.codex.enabled: true` and
  all other clients unchanged from phase 5 defaults.
- `--client all --no-client tabnine` produces a profile with codex and claude
  enabled and tabnine disabled.
- `--client unknown` exits `2` with a deterministic error naming the unknown
  client.
- `--client` combined with no `--write` previews the client selection and does
  not mutate the profile.
- Existing profiles are not modified by `init --client ... --write`.
- `--interactive` exits `2` with `not yet implemented`.
- The existing phase 5 golden fixture for the no-flag default invocation is
  unchanged.
- A new golden fixture or byte-exact assertion exists for each of:
  `--client codex`, `--client claude`, `--client tabnine`, `--client all`, and
  `--client all --no-client tabnine`.
- Write failure reports refusal, exits `1`, and does not claim `wrote:`.

## Tests

- table-driven CLI test covering `{fresh, existing, no-language}` x
  `{dry-run, write}` x `{no flags, --client codex, --client all,
--client all --no-client tabnine}` and asserting:
  - stdout is non-empty except explicit `--quiet`
  - exit code matches the table
  - written profile, if any, is byte-identical to the expected bytes
- regression test confirming phase 5 no-flag bytes are unchanged
- argument-validation test asserting `--client foo`, `--client ""`,
  `--client codex,,claude`, `--client Codex`, and `--interactive` each exit `2`
  with deterministic stderr
- `--json` test asserting stdout is single-line JSON with `mode`, `status`,
  `clientsEnabled`, client matrix, `wrote`, and `wouldWrite`
- `--quiet` test asserting stdout is empty without `--json`
- existing-profile test asserting `init --client codex --write` does not modify
  the existing profile
- write-failure test asserting a directory at the profile path exits `1` with a
  refused report and no `wrote:` line
- security sentinel: no `.env*` or secret-named file is opened during init

## Documentation Updates

- `README.md` (replace any init flows that imply silent success)
- `docs/cli/README.md` (document `--client`, `--no-client`, `--json`,
  `--quiet`, `--interactive` reservation, and report vocabulary)
- `docs/specs/phase-05/002-cli-init.md` gains a one-line back-reference to this
  spec at the bottom of its Status section once this spec is Approved.

## Final Review Checklist

- no non-quiet successful invocation of `init` can produce empty stdout
- phase 5 default bytes are byte-identical to the existing golden
- client permutations have focused byte-exact tests
- existing profiles are not edited by init
- `--interactive` is reserved but inert
- no secret files or env vars are read during report generation
- report contains no absolute filesystem paths
- exit codes are unchanged for cases already defined in phase 5
- write failures do not claim success or leak generated profile contents
