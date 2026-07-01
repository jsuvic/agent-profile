# Spec: Friendly Init Wizard

## Status

Implemented. Belongs to Phase 15. Landed on 2026-05-19 in `dddc208` (PR #23).

## Problem

The safe import flow has several options. New users will often run:

```powershell
agent-profile init
```

If that command only prints help or silently picks conservative defaults, users
may not learn that existing files can be preserved, regioned, or compiled.

## Goal

Make no-argument `agent-profile init` guide interactive users through a safe
local setup while keeping non-interactive environments deterministic and
non-mutating.

## Non-Goals

- AI merge assist
- local UI
- changing Phase 14 ownership semantics
- installing dependencies
- launching clients
- running generated skills or subagents

## User Flow

Interactive terminal:

```powershell
agent-profile init
```

The CLI shows a wizard:

1. detected stack summary
2. detected existing agent files and local runtime files
3. recommended strategy
4. client selection
5. `.gitignore` recommendations
6. write plan
7. final run-mode choice

Non-interactive terminal or CI:

```powershell
agent-profile init
```

The CLI behaves as:

```powershell
agent-profile init --import --strategy preserve --dry-run
```

and exits without writing.

Non-interactive means any of:

- `stdin.isTTY` is false
- `stdout.isTTY` is false
- `CI=true`
- `--non-interactive` is present

Phase 15 does not add `--yes`. A write still requires either the existing
explicit non-wizard write flags or an interactive selection of the write run
mode.

## Inputs

- TTY detection for stdin and stdout
- existing `init` options
- Phase 14 import report
- optional user choices from prompts

## Outputs

- deterministic wizard screens
- deterministic dry-run report in non-interactive mode
- optional writes only after explicit confirmation

## Prompt Contract

Wizard prompts must be short and must default to the safest option.

Wizard choices map one-to-one to Phase 14 import and write-plan options. The
wizard does not introduce a separate write path and cannot bypass Phase 14
ownership, region, path-safety, or conflict checks.

## Recommendation Rules

| Detected state                                  | Recommendation                            |
| ----------------------------------------------- | ----------------------------------------- |
| unmarked supported root instruction file exists | `regions`                                 |
| only valid mixed root instruction files exist   | `preserve`                                |
| no agent files exist                            | `preserve`                                |
| legacy generated marker without lockfile exists | `preserve` plus generated-looking warning |
| foreign skill or subagent path conflict exists  | `preserve` plus conflict row              |

### Strategy Prompt

Question:

```text
How should existing agent instruction files be handled?
```

Choices:

| Choice                    | Default | Meaning                                                                    |
| ------------------------- | ------- | -------------------------------------------------------------------------- |
| `Preserve existing files` | yes     | Create/update profile only; do not modify existing agent files.            |
| `Add generated regions`   | no      | Preserve existing text in manual regions and add compiler-managed regions. |

`Replace all with generated files` is not offered in the wizard. Users must use
explicit CLI force behavior for that.

The CLI wizard is all-or-nothing for Phase 15. It does not support per-file
skip or replace actions. Per-file actions belong to the Phase 16 local UI
migration wizard.

### Client Prompt

Question:

```text
Which clients should this profile enable?
```

Default:

- clients detected from existing files are selected
- others are unselected

Choices:

- Tabnine
- Codex
- Claude

### Gitignore Prompt

Shown only when recommendations are missing.

Question:

```text
Add recommended local-runtime ignore entries to .gitignore?
```

Default: `No`

If user selects `Yes`, the write plan includes the equivalent of
`--update-gitignore`.

### Final Run Mode

Question:

```text
How should this plan run?
```

Choices:

| Choice                       | Default | Meaning                            |
| ---------------------------- | ------- | ---------------------------------- |
| `Dry run preview`            | yes     | Preview the plan and write nothing |
| `Write files now (--write)`  | no      | Apply the plan locally             |

If the user selects `Dry run preview`, the command exits with status `0` after
printing the dry-run plan.

## Example Interactive Output

```text
Agent Profile Init

Detected:
- languages: typescript
- package managers: npm
- clients from existing files: codex, claude
- existing instruction files: AGENTS.md, CLAUDE.md
- local runtime files: .mcp.json, .codex/config.toml
- generated client config: .claude/settings.json

Recommended strategy: Add generated regions
Reason: existing AGENTS.md and CLAUDE.md can be preserved in manual regions.

Write plan:
- create ai-profile.yaml
- update AGENTS.md generated region
- update CLAUDE.md generated region
- create .agents/skills/sdd-change/SKILL.md
- create or migrate ai-profile.lock to version 2
- preserve .mcp.json

Dry-run selected.
No files written. Re-run with --write or choose Write files now in the wizard to write.
```

## Contracts

- Non-interactive mode never writes by default.
- Interactive mode never writes unless the final run mode is `Write files now`.
- Wizard choices map to Phase 14 deterministic commands.
- Prompt defaults must be safe.
- Wizard output must not include secrets.
- `.env` files must not be read.
- User choices must be represented in the final write plan before writing.
- Foreign skill and subagent conflicts must be surfaced in the wizard report
  before final confirmation.

## Security Rules

- Do not upload repository content.
- Do not invoke AI models.
- Do not execute shell commands.
- Do not install dependencies.
- Do not read `.env` files.
- Do not print secret-like values.
- Do not write before final confirmation.

## Acceptance Criteria

- `agent-profile init` in non-interactive mode writes nothing and reports dry-run.
- `agent-profile init` in interactive mode shows detected files before strategy
  selection.
- Strategy default is preserve when existing instruction files are ambiguous.
- Strategy recommendation is regions when supported unmarked `AGENTS.md` or
  `CLAUDE.md` exist.
- Final run mode defaults to dry-run preview.
- Choosing regions writes only Phase 14 region changes.
- Choosing preserve writes no existing agent artifacts.
- Choosing `.gitignore` update appends only missing recommended lines.

## Tests

- mocked non-interactive init defaults to dry-run preserve
- mocked interactive init dry-run selection writes nothing
- mocked interactive regions flow produces same plan as
  `init --import --strategy regions`
- mocked interactive preserve flow preserves existing files
- mocked CI environment defaults to non-interactive dry-run
- mocked client choices produce expected profile clients
- mocked foreign skill conflict appears before final confirmation
- mocked `.gitignore` yes/no choices affect only `.gitignore` write plan
- no secret file read sentinel
- deterministic prompt ordering snapshot
- no-argument fresh repo plan equals equivalent explicit Phase 14 invocation

## Documentation Updates

- `README.md`
- `docs/cli/README.md`
- release notes for first friendly init behavior

## Final Review Checklist

- plain `agent-profile init` is safe
- non-interactive behavior is deterministic
- wizard choices do not bypass Phase 14 safety checks
- no AI, network, shell, dependency install, or secret reads are introduced
