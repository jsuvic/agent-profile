# Spec: Slash Commands Targets

## Status

Draft for a later phase. Not MVP.

Routed from `docs/research/007-agent-best-practices-review.md`
(Cross-Cutting Surfaces Still Missing — Slash commands).

## Problem

Claude Code supports project slash commands under `.claude/commands/<name>.md`;
Codex supports skill invocation with `$skill`. Teams that want shared
shortcuts — `/standup`, `/incident`, `/deploy-check`, `/release-notes` — must
hand-author per-client files today, which breaks the determinism contract and
duplicates content already present in workflow skills.

## Goal

Generate deterministic project-local slash commands from a `commands` block
in `ai-profile.yaml`. Each generated command is a thin wrapper that points at
a skill, a script, or a short inline prompt. Generation is opt-in and
emits only project-local files.

## Non-Goals

- generating user-level, admin-level, or plugin slash commands
- generating dynamic shell-injection commands (`!` placeholders or fenced
  shell-injection blocks remain forbidden, mirroring the workflow skills
  targets)
- pre-approving tools or shell execution from inside a slash command
- generating Tabnine slash commands until Tabnine documents a comparable
  surface
- supporting argument parsing beyond what the target client documents

## User Flow

```yaml
# ai-profile.yaml (illustrative)
commands:
  - name: standup
    description: Generate today's standup update from recent commits and PRs.
    body: |
      Read git log for the last 24 hours. Summarise as Yesterday / Today /
      Blockers. Stay under 200 words.
    clients: [claude, codex]
```

The compiler renders `.claude/commands/standup.md` (Claude) and the
documented Codex slash-command path verified at implementation time. Doctor
checks size, trigger description, and forbidden-pattern absence (no shell
injection).

## Inputs

- `commands` block in `ai-profile.yaml`
- per-target slash-command paths verified against current official docs at
  implementation time
- `effectivePermissions` for safety wording

## Outputs

- per-client slash-command files rendered deterministically
- doctor findings:
  - `LINT-COMMAND-001` — description shorter than 40 characters or missing
    trigger context
  - `LINT-COMMAND-002` — command body contains forbidden shell-injection
    syntax (`!`, fenced shell blocks)
  - `LINT-COMMAND-003` — body exceeds the doctor warning threshold (default
    100 lines; commands should delegate to skills for anything longer)
  - `LINT-COMMAND-004` — `clients` lists a target whose slash-command
    support is not `confirmed-official` in the capability matrix
- lockfile entries recording command identity (name, target, body hash)

## Contracts

- Commands are opt-in. Profiles without the `commands` block produce no
  command files and existing behavior is unchanged.
- Commands are project-local only. Global/user paths require a separate
  approved spec.
- Generated files use UTF-8, LF endings, single trailing newline.
- Removing a command removes the file on next compile.
- The compiler must not emit `allowed-tools` or dynamic context injection.

## Security Rules

- Do not generate slash commands that include shell-injection placeholders.
- Do not embed literal secrets, environment values, or production endpoints.
- Do not pre-approve tools or auto-install dependencies inside commands.
- Do not write to user-level, admin-level, or plugin command paths.
- Do not generate Tabnine slash commands until capability matrix verification.

## Acceptance Criteria

- profiles with `commands` declarations produce deterministic per-client
  command files
- generated bodies pass shell-injection rejection
- the lockfile records command identity
- removing a command propagates cleanly on next compile
- doctor flags each `LINT-COMMAND-*` rule

## Tests

- golden tests for Claude and Codex rendering of a minimal command
- absence test (no `commands` → no files)
- doctor lint tests for each `LINT-COMMAND-*` rule
- shell-injection rejection test
- removal-propagation snapshot test
- determinism test across runs and OSes

## Documentation Updates

- `docs/profile/schema.md` — add `commands` block
- future `docs/targets/claude.md` and `docs/targets/codex.md`
- `docs/research/006-client-capability-matrix.md` — add slash-command row
  per target
- cross-reference `phase-03/004` and `phase-03/005` so commands and skills do
  not collide on naming

## Final Review Checklist

- slash-command file paths verified against current official client docs
- no shell injection emitted under any input
- bodies stay short and delegate to skills for anything substantial
- Tabnine support remains gated on capability matrix verification
