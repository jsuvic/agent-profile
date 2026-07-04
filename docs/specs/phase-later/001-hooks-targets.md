# Spec: Hooks Targets

## Status

Draft for a later phase. Not MVP.

Partially superseded: the neutral `capabilities.hooks` intent surface and the
advisory (non-executing) roles are owned by
`docs/specs/phase-21/001-advisory-hooks.md` (implemented). The illustrative
raw-command `hooks:` profile shape below is historical; raw commands never
appear in the profile. The command-runner slice (WS5-S2: format-on-write,
lint-on-write, safety-gate-shell, full `LINT-HOOK-*` catalogue) remains this
draft's scope, extends the same `capabilities.hooks` shape, and stays behind
its threat-model human gate.

## Problem

Some AI coding clients expose hook or automation surfaces, but the supported
events, file formats, execution rules, and safety controls differ per target.

## Goal

Define how Agent Profile Compiler may represent hook intent and generate
project-local hook artifacts for targets that officially support them.

## Non-Goals

- implementing hooks in MVP
- executing hooks
- installing third-party hook dependencies
- generating global/user-level hooks without explicit opt-in

## Inputs

- future `ai-profile.yaml` capability intent
- official target documentation for Codex, Claude, and Tabnine
- target-specific hook specs

## Outputs

- project-local hook artifacts only where supported
- not-supported or not-generated messages for unsupported targets
- doctor findings for unsafe hook definitions

## Contracts

- Hooks require explicit opt-in.
- Project-local output is the default.
- Global/user-level output requires a separate approved spec.
- Doctor must validate hook artifacts before generation is considered safe.
- Generation must define Codex, Claude, and Tabnine behavior separately.
- Unsupported target behavior must not be silently ignored.

## Security Rules

- Do not execute hooks during generation, validation, or doctor checks.
- Do not install dependencies automatically.
- Do not embed secrets or production access.
- Do not generate hooks that silently approve destructive behavior.

## Hook Event Taxonomy

Per-target hook events documented at the time of implementation must be
re-verified before generation begins. The shapes below are an audit of
public docs at drafting time; the Phase 21 implementation re-verified both
taxonomies on 2026-07-04 — the authoritative per-target event lists now live
in `docs/research/008-current-agent-capabilities-2026-07.md` (Phase 21
Decision) and in the compiler's pinned lists
(`packages/compiler/src/hooks.ts`), which include newer events such as
`PermissionRequest`, `PostToolUseFailure`, `SubagentStart`, and
`PostCompact`, plus the verified Codex event list.

Claude Code events (re-verify against `https://code.claude.com/docs/en/hooks`
at implementation time):

- `SessionStart` — fires at session boot; subkeys for `startup`, `clear`,
  `compact`
- `SessionEnd` — fires at session shutdown
- `UserPromptSubmit` — fires when the user submits a prompt; common use is
  injecting git status / branch / changed-file list
- `PreToolUse` — fires before any tool call; matcher narrows per-tool
  (e.g. `Bash`, `Edit`, `Write`)
- `PostToolUse` — fires after a tool call; common use is formatter / linter
  on edited files
- `Notification` — fires when a notification surface event occurs
- `Stop` — fires when the agent stops
- `SubagentStop` — fires when a subagent stops
- `PreCompact` — fires before context compaction; useful for checkpointing
  long-running work

Codex events (re-verify against current Codex hook docs).

Tabnine events remain `unknown` until Tabnine docs confirm an equivalent
surface.

## Common Hook Roles

Best-practice hook generation should cover these roles per event:

| Role | Event | Example |
| --- | --- | --- |
| format-on-write | PostToolUse on Edit/Write | `prettier --write`, `black`, `gofmt`, `ruff format` |
| lint-on-write | PostToolUse on Edit/Write | `eslint`, `ruff`, `golangci-lint` |
| safety-gate-shell | PreToolUse on Bash | deny `sudo`, `rm -rf /`, network installs without a lockfile |
| context-injection | UserPromptSubmit | git branch + status + changed-file list |
| checkpoint | PreCompact | persist memory deltas before context compaction |
| status-watcher | SessionStart | warm a status line or load project state |

The compiler must not auto-install the formatter / linter binary. Hooks
must fail closed when the binary is missing; doctor reports
`LINT-HOOK-DEPENDENCY-MISSING` informationally and never auto-installs.

## Profile Shape (Illustrative)

```yaml
# ai-profile.yaml (illustrative)
hooks:
  - name: format-typescript
    event: PostToolUse
    matcher: Edit|Write
    role: format-on-write
    command: npx prettier --write "$CLAUDE_FILE_PATHS"
    clients: [claude]
  - name: lint-typescript
    event: PostToolUse
    matcher: Edit|Write
    role: lint-on-write
    command: npx eslint --fix "$CLAUDE_FILE_PATHS"
    clients: [claude, codex]
  - name: block-dangerous-shell
    event: PreToolUse
    matcher: Bash
    role: safety-gate-shell
    forbiddenPatterns: ["sudo", "rm -rf /", "curl | sh"]
    clients: [claude, codex]
```

## Doctor Lint Catalogue

- `LINT-HOOK-001` — hook command contains a forbidden pattern (`sudo`,
  `rm -rf /`, `curl | sh`, dependency-install without a lockfile)
- `LINT-HOOK-002` — hook command references an environment value that is
  not declared via `006-secrets-and-memory-integration.md`
- `LINT-HOOK-003` — hook event is not in the verified per-target event list
- `LINT-HOOK-004` — hook matcher is empty when the event documents a
  required matcher
- `LINT-HOOK-005` — `clients` lists a target whose hook support is not
  `confirmed-official` in the capability matrix
- `LINT-HOOK-006` — hook installs dependencies as a side effect (forbidden;
  use a `make install` step gated by the user)
- `LINT-HOOK-007` — generated hook file points at a command not present on
  disk (informational; doctor must not run the command to check)

## Acceptance Criteria

- target support is documented with confidence labels and verified event
  lists
- unsupported targets produce clear `disabled_target` results
- generated hooks are project-local unless explicitly opted into otherwise
- doctor validates generated hook artifacts via the `LINT-HOOK-*` catalogue
- every hook role above has at least one golden fixture for at least one
  supported target

## Tests

- supported target golden output tests covering each hook role
- unsupported target message tests
- no execution or install regression tests at compile or doctor time
- doctor lint tests for each `LINT-HOOK-*` rule
- forbidden-pattern rejection tests against the catalogue
- cross-reference test confirming env values flow through `006`, not inline

## Documentation Updates

- target docs for Codex, Claude, and Tabnine
- capability matrix
- cross-reference `phase-later/006-secrets-and-memory-integration.md` for
  env value handling

## Final Review Checklist

- no hooks run during compile or doctor
- no automatic dependency installation
- target behavior is independently specified
- unsupported targets are explicit
- per-target event list re-verified against current official docs before
  implementation
- formatter / linter roles fail closed when the binary is missing
- env values flow through the shared `006` primitive, not inline
