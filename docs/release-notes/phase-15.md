# Phase 15 Release Notes

Phase 15 turns `agent-profile init` into a friendly first-run experience while
keeping non-interactive environments deterministic and non-mutating.

## Highlights

- Plain `agent-profile init` (no behavior flags) opens an interactive wizard
  that maps user answers to the Phase 14 import and write flags.
- Non-interactive environments — `stdin`/`stdout` not a TTY, `CI=true`, or
  `--non-interactive` present — behave as
  `init --import --strategy preserve --dry-run` and write nothing.
- All explicit Phase 14 flag combinations (`--import`, `--strategy`,
  `--write`, `--client`, `--no-client`, `--profile`, `--preset`,
  `--update-gitignore`, `--json`, `--quiet`, `--dry-run`) continue to bypass
  the wizard and produce the exact behavior they did in Phase 14.

## Wizard contract

Prompts run in deterministic order:

1. `selectStrategy` — `Preserve existing files` (default) or `Add generated
   regions`. The wizard recommends a default per the recommendation table
   below.
2. `selectClients` — defaults to the clients detected from existing files
   (`AGENTS.md`, `CLAUDE.md`, `.tabnine/*`, `.codex/*`, `.claude/*`,
   `.mcp.json`).
3. `confirmGitignore` — only shown when at least one recommended local-runtime
   ignore line is missing. Default `No`.
4. `confirmWritePlan` — default `No`. A `No` answer prints the dry-run plan
   and exits status `0` without writing anything.

The wizard does not introduce a new write path: confirmed choices flow through
the same Phase 14 import pipeline (`planRegionAdoptions`,
`appendMissingGitignoreLines`, `applyWritePlan`) as explicit flags would.

Phase 15 does not introduce `--yes`. A write always requires either the
existing explicit non-wizard flags or the interactive final confirmation.

### Recommendation rules

| Detected state                                  | Recommendation                            |
| ----------------------------------------------- | ----------------------------------------- |
| unmarked supported root instruction file exists | `Add generated regions`                   |
| only valid mixed root instruction files exist   | `Preserve existing files`                 |
| no agent files exist                            | `Preserve existing files`                 |
| legacy generated marker without lockfile exists | `Preserve existing files` plus warning    |
| foreign skill or subagent path conflict exists  | `Preserve existing files` plus conflict   |

## Safety guarantees (unchanged from Phase 14)

- Wizard prompts never read `.env` files and never echo secret-like values.
- No new third-party dependencies (the default prompter is built on Node's
  `readline/promises`).
- No AI calls, network access, shell execution, or dependency installs are
  introduced by the wizard.
- Foreign skill or subagent conflicts surface in the wizard report before the
  final confirmation prompt.

## Cross-references

- [`docs/specs/phase-15/001-friendly-init-wizard.md`](../specs/phase-15/001-friendly-init-wizard.md)
- [`docs/cli/README.md`](../cli/README.md)
