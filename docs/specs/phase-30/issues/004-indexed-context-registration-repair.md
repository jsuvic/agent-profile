# I4: Explicit indexed-context registration repair

## Parent spec or request

`docs/specs/phase-30/001-role-aware-indexed-subagents.md` and ADR 0017.

## Intent summary

Offer a safe preview and explicit repair for CCE client registration while
leaving installation, indexing, trust approval, and unsafe conflicts to the
user.

## Behavior slice

`agent-profile setup indexed-context --provider cce` produces a deterministic
plan. `--write` applies only safe Codex/Claude project registration edits after
preflight, preserves unrelated entries, verifies the result, and emits stable
redacted action/refusal reports.

## Non-goals

- Installing CCE or creating/refreshing its repository index.
- Starting a persistent server or approving Claude MCP.
- Silent global client mutation or generic MCP config management.

## Acceptance criteria

Phase-30 acceptance criterion 7.

## Expected RED proof

CLI tests fail because the setup command, planner, refusal codes, and safe
editors do not exist.

## Expected GREEN proof

Preview/write tests cover add, ready/idempotent, conflict, unsafe edit,
precondition, atomic failure, and unrelated-entry preservation on both clients.

## Seam under test

`local observations + requested mode -> setup report and permitted filesystem
effect`.

## Allowed mock boundary

Filesystem atomic-write adapter and client command/status adapter only. Planner
and structural edit logic remain real.

## Test command guidance

Run focused setup planner/editor and CLI error-contract tests, then integration
fixtures, full tests, check, and pack verification.

## Likely file ownership

- CLI setup command/parser and report renderer
- Codex/Claude registration planners and safe structural editors
- Atomic-write utility reuse, error codes, docs, fixtures

## Dependencies

Blocked until I3 observation/state contracts are done.

## Parallelism notes

May proceed in parallel with I5 after dependencies, but coordinate CLI docs and
shared error/report infrastructure.

## Contract impact

Adds setup preview/`--write` and stable refusal codes:
`SETUP-CONTEXT-PRECONDITION`, `SETUP-CONTEXT-CONFLICT`,
`SETUP-CONTEXT-UNSAFE-EDIT`, `SETUP-CONTEXT-WRITE-FAILED`.

## Security impact

Explicit write only; fail closed on ownership ambiguity, unsafe edit, or
conflict. Never print tokens, read secrets, grant trust, install, index, upload,
or mutate unrelated/global configuration silently.

## Documentation impact

Setup command reference, preview examples, refusal table, manual install/index
and Claude approval boundaries, rollback behavior.

## Implementation context

Prefer existing insertion-only/ownership-aware machinery. If a target config
cannot be changed without reserialization or ownership loss, return
`SETUP-CONTEXT-UNSAFE-EDIT` instead of inventing a broad editor.

## Review expectations

Require table-driven code/exit/redaction tests, atomic failure proof, idempotent
second run, exact unrelated-entry preservation, and runtime sentinels proving no
install/index/approval/network path.
