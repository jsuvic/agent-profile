# CLI Reference

Implemented:

- `agent-profile doctor`
- `agent-profile compile`
- `agent-profile configure`
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
agent-profile configure [--root <path>] [--non-interactive]
agent-profile init [--root <path>] [--profile <path>] [--import] [--strategy preserve|regions] [--update-gitignore] [--preset <token>] [--client <list>] [--no-client <list>] [--non-interactive] [--json] [--quiet] [--dry-run|--write]
agent-profile ui [--root <path>] [--host <host>] [--port auto|<number>] [--open true|false]
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

`--port` defaults to `auto` (an ephemeral loopback port reserved at startup).
Passing `--port <number>` pins a specific port and exits with code 1 if it
is already in use. `--open` defaults to `true` in interactive TTY sessions
and `false` otherwise (no browser opens under CI or scripted invocations).

The CLI generates a one-time session token at launch and embeds it in the
URL it prints. The spawned server reads the token from the
`AGENT_PROFILE_SESSION_TOKEN` environment variable and rejects requests
that do not carry it via query string, cookie, or `x-agent-profile-session`
header. Loopback origin checks remain enforced for every request.

The UI's **Migration view** at `/migration` surfaces the same Phase 14
import report that `init --import` builds, with per-row actions
(`Preserve`, `Add regions`, `Update generated region`,
`Replace generated-owned`, `Skip`). Writes go through the same
`applyWritePlan` helper the CLI uses; unsafe `Replace generated-owned`
actions require an explicit per-row second confirmation and `confirmReplace:
true` on apply. After write, the UI runs `doctor` and shows the result
inline — failures are surfaced, not auto-reverted. `.env*` paths are
denied by name and never read.

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

## Configure (Phase 31)

`agent-profile configure` is the interactive flow for choosing or reconciling
the **agent control posture**. It shows the current posture, what each enabled
client will actually do, the denials that hold regardless of posture, and a
preview of every change before anything is written.

The normal postures are `guarded`, `balanced`, and `trusted-local`, plus
`plan-only` for review work. The current posture is preselected, so pressing
Enter changes nothing.

Everything before the preview is read-only.

### Shared vs personal

`configure` writes **shared** repository intent only: `ai-profile.yaml`, the
generated client artifacts, and — when you explicitly select it — the
`.gitignore` line that a later personal activation requires
(`.claude/settings.local.json`).

Those files are written **together or not at all**. If any part of the write
fails, the profile, generated artifacts, and `.gitignore` are all restored to
their original bytes and the command reports a refusal.

In the rare case where a file cannot be restored either — the same lock or
permission change that broke the write can also block the undo — configure does
not claim the repository is unchanged. It names the exact paths that still hold
new bytes so you can review them against version control.

Activating `trusted-local` on your own machine is a separate, developer-local
step: shared files make the posture possible, but they never grant it to
everyone who clones the repository (ADR 0019). `configure` never writes the
personal activation file itself.

### Reconciliation

When actual client configuration differs from the declared posture, configure
offers:

| Choice   | Effect                                                         |
| -------- | -------------------------------------------------------------- |
| `repair` | regenerate shared settings back to the declared posture        |
| `adopt`  | record the detected behavior as profile intent (lossless only) |
| `review` | show the exact sources and consequences, change nothing        |
| `leave`  | change nothing; doctor keeps reporting the mismatch            |

Each option names the clients it does _not_ synchronize: a local override to
one client is never described as applying to the others.

`repair` only rewrites files agent-profile generates. If the difference comes
from a developer-local file such as `.claude/settings.local.json`, that file
keeps overriding the generated one, so repair would change nothing and is
refused rather than reported as fixed — change it in the client, or adopt it.

`adopt` is all-or-nothing. If any part of the detected behavior has no lossless
profile form, or the behavior resolves to more than one posture, the whole
adoption is refused rather than partly applied.

### Legacy Autonomous

An existing `safety.mode: autonomous` profile is never reinterpreted. Configure
offers to keep it (byte-identical, sandbox-required), migrate explicitly to
Trusted local, choose another posture, or cancel. No branch migrates silently.

Migrating to Trusted local also clears `safety.requiresSandbox`, because the
sandbox requirement is part of the Autonomous contract being left behind and
Trusted local does not carry one. Both fields change in the same previewed
transaction. Choosing any other posture leaves the flag as your profile had it.

### Refusals and recovery

| Reason                       | Recovery                                                                                                              |
| ---------------------------- | --------------------------------------------------------------------------------------------------------------------- |
| `profile-missing`            | run `agent-profile init` first                                                                                        |
| `profile-invalid`            | run `agent-profile doctor` and fix the reported issues                                                                |
| `adoption-not-representable` | the detected behavior has no lossless profile form; keep it as a manual client setting or pick a posture explicitly   |
| `repair-not-applicable`      | every difference comes from a file agent-profile does not write; change it in the client itself, or adopt it          |
| `profile-edit-refused`       | `ai-profile.yaml` has a structure configure will not edit safely; change `safety.mode` by hand                        |
| `generated-outputs-refused`  | resolve the reported ownership/marker conflict, then re-run                                                           |
| `compile-failed`             | the profile is valid but its artifacts could not be generated; run `agent-profile compile` to see why                 |
| `shared-write-failed`        | fix the reported path condition and re-run. Nothing was written unless the refusal names paths it could not roll back |

Refusals exit with code `1` and contain setting names and normalized states
only — never secret-like values or unrelated configuration content.

### Non-interactive use

`configure` adopts a posture only from an explicit choice. Without a TTY, under
`--non-interactive`, or in CI, it explains itself, writes nothing, and exits `0`.
There is no flag that adopts a posture unattended.

## Init Wizard (Phase 26)

Plain `agent-profile init` opens a friendly interactive wizard that maps the
user's answers to the Phase 14 import and write flags. The wizard runs only
when the command is invoked without behavior flags (`--import`, `--strategy`,
`--write`, `--client`, `--no-client`, `--profile`, `--preset`,
`--update-gitignore`, `--json`, `--quiet`, `--dry-run`).

The interactive presentation uses arrow-key selects, space-toggle
multiselects, inline validation, and clack's default keyboard instructions.
Press Enter to accept the highlighted choice. Screens appear in this order:

1. Branded opening frame and a detected-stack note covering existing
   instruction files, local runtime files, generated client config, and any
   foreign skills or subagents.
2. Optional bounded manual-language entry when no language is detected.
3. Strategy choice (default tracks the recommendation table below).
4. Client multiselect for a new profile (detected clients are preselected).
5. Safety and permission setup profile.
6. Capability-pack grouped multiselect. Unavailable options are omitted and
   explained by one warning.
7. `.gitignore` recommendation prompt, shown only when at least one recommended
   line is missing.
8. Framed write-plan note with `+`, `~`, and `=` action markers.
9. Preview-or-write choice. `Preview only - write nothing` is first and remains
   the default; choose `Create setup now` to apply the plan locally.

Pressing Ctrl+C at any prompt prints `Cancelled - no files written.`, exits with
code 0, and writes nothing. Set `NO_COLOR=1` to disable terminal color. Legacy
terminals without unicode support use the ASCII `*` logo fallback. The logo,
color, and framing never appear in piped, CI, `--non-interactive`, `--json`, or
`--quiet` output.

The wizard never bypasses Phase 14 ownership, region, path-safety, or conflict
checks: choosing `Add generated regions` produces the same bytes as
`init --import --strategy regions --write`, and choosing
`Preserve existing files` writes only `ai-profile.yaml`.

In non-interactive environments — `stdin`/`stdout` is not a TTY, `CI=true`,
or `--non-interactive` is present — `init` behaves as
`init --import --strategy preserve --dry-run` and writes nothing. The wizard
does not introduce `--yes`: a write always requires the explicit Phase 14
flags or selecting `Create setup now` in the wizard.

Recommendation rules:

| Detected state                                  | Recommendation                          |
| ----------------------------------------------- | --------------------------------------- |
| unmarked supported root instruction file exists | `Add generated regions`                 |
| only valid mixed root instruction files exist   | `Preserve existing files`               |
| no agent files exist                            | `Preserve existing files`               |
| legacy generated marker without lockfile exists | `Preserve existing files` plus warning  |
| foreign skill or subagent path conflict exists  | `Preserve existing files` plus conflict |

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

## Temporary Shallow Init Stack Scan

Stack detection is conservative and metadata-only. As a temporary workaround
until [`phase-later/007`](../specs/phase-later/007-monorepo-cascading-config.md)
defines real workspace and per-package behavior, `init` aggregates signals into
the single root profile from candidate project roots at relative depths 0, 1,
and 2. For example, `package.json` under `apps/web` is in scope, while metadata
under `apps/web/src` is not. This behavior does not create package ownership,
package profiles, or package-specific generated files.

Candidate directories are skipped before descent when their basename starts
with `.`, or is one of `node_modules`, `target`, `dist`, `build`, `coverage`,
`vendor`, `tmp`, `temp`, or `out`. Child symlinks, junctions, other reparse
points, and symlinked metadata files are not followed. A symlink supplied as
`--root` resolves once and the resolved directory becomes the scan boundary.

Only these metadata basenames may be opened: `package.json`, `tsconfig.json`,
`vite.config.{js,mjs,cjs,ts,mts,cts}`,
`svelte.config.{js,mjs,cjs,ts}`, `pom.xml`, `build.gradle`,
`build.gradle.kts`, `playwright.config.{js,mjs,cjs,ts,mts,cts}`, and
`pubspec.yaml`. Detection never opens source files, `README.md`, `.env*`,
lockfiles, hidden/tool directories, or generated/build output, and it never
runs a package manager.

For `package.json`, detection uses only `name`, `dependencies`,
`devDependencies`, `engines`, and `packageManager`; signals depend on key names,
not values. The temporary metadata bridge detects React from `react` or
`react-dom` dependency keys and detects JavaScript when a candidate root has
valid package metadata but no TypeScript signal in that same root. React
Native, `peerDependencies`, `optionalDependencies`, and package lockfiles are
out of scope.

If no language is detected, the interactive wizard asks whether to enter
comma-separated language slugs manually. Input is trimmed, lowercased,
deduplicated, and sorted. A whole entry is rejected and re-prompted if it has
more than 10 slugs, any slug longer than 40 characters, or a slug outside
`^[a-z0-9][a-z0-9._-]*$`. Declined, empty, and non-interactive input uses
`unknown`. The fallback is schema-valid but inert: it selects no
language-specific generated guidance, and `doctor` warns non-fatally until it
is replaced with the real language.

Human output includes compact relative `Detection sources`; JSON output adds a
sorted `detectionSources` array containing only relative metadata paths and
sorted signal slugs. Reports never include file contents, dependency values,
URLs, environment values, or secret-like metadata.

Flutter/Dart detection remains based on `pubspec.yaml` project metadata and
dependency key names only—never `pubspec.lock`, `.dart_tool`, source, assets,
or Firebase config.

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

## Advisory Hooks (Phase 21)

`capabilities.hooks` opts into advisory, non-executing hooks. Hooks are off
by default: without the block (or with `enabled: false`) no hook artifact is
generated and output stays byte-identical to the previous baseline.

```yaml
capabilities:
  hooks:
    enabled: true
    advisory:
      - final-review-reminder
      - context-injection
      - pre-compact-checkpoint
```

Each role is opted into individually from a closed enum; `enabled: false`
with a non-empty `advisory` list is a validation error. Roles map to command
strings pinned inside the compiler (the template table) — raw commands never
appear in the profile, and slice 1 cannot express a hook that runs a project
binary, writes, installs, or touches the network.

| Role                     | Event(s)               | Pinned runtime behavior                                                     |
| ------------------------ | ---------------------- | --------------------------------------------------------------------------- |
| `final-review-reminder`  | `Stop`, `SubagentStop` | fixed reminder to run `final-review` before handing off                     |
| `context-injection`      | `UserPromptSubmit`     | read-only `git status --short --branch` (fail-open when git is unavailable) |
| `pre-compact-checkpoint` | `PreCompact`           | fixed reminder to checkpoint in-progress work before compaction             |

Targets:

- **Claude** — hooks are written into the generated `.claude/settings.json`
  hooks surface (project-local, lockfile-tracked). Each pinned command is a
  single literal that parses and fails open in every shell Claude documents
  for hooks (`sh`, Git Bash, and the Windows PowerShell fallback), so no
  per-platform variant is needed.
- **Codex** — hooks are written into a generated project-local
  `.codex/hooks.json` (the hooks representation Codex documents alongside
  inline `config.toml` tables; APC uses one representation per layer). Each
  handler pins both `command` (POSIX) and the documented `commandWindows`
  Windows override in the same deterministic artifact. Codex output
  semantics differ per event: `Stop`/`SubagentStop` require JSON stdout and
  `PreCompact` ignores plain stdout, so the reminder roles echo a
  `{"systemMessage": ...}` payload; `UserPromptSubmit` adds plain stdout as
  developer context, so the git command stays plain. Codex requires project
  hooks to be reviewed and trusted (`/hooks`) before they run.
- **Tabnine** — not generated; hook support is not confirmed-official.
  `compile` reports a note when hooks are enabled on a Tabnine-including
  profile.

The compiler never executes hooks at compile, validation, or doctor time.
`doctor` validates advisory hook artifacts structurally: `LINT-HOOK-003`
flags events outside the verified per-target event lists, `LINT-HOOK-005`
flags a hook surface where APC does not generate hooks (for example an
inline `[hooks]` table in the generated `config.toml`), and `LINT-HOOK-008`
flags a hook handler that differs from the pinned template for its role.

The init wizard exposes a single optional `Advisory hooks` capability
checkbox (available when Claude or Codex is selected) that enables all three
roles in the generated profile.
