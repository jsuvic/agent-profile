# Agent Profile Compiler

Domain glossary for the APC workflow vocabulary. Definitions only - no
implementation details or decisions (those live in `docs/architecture/decisions/`).

## Workflow

**Guidance topic**
A generated, always-read documentation block (AGENTS.md section, Tabnine
guideline) gated by a `workflow.*` boolean. _Avoid:_ "guideline pack",
"docs skill".

**Task ledger**
The root `TASKS.md` index of work items with a closed state set; content
lives in issue briefs. _Avoid:_ "backlog file", "todo list".

**Issue brief**
A per-slice file under `docs/specs/<spec-dir>/issues/` carrying the full
implementation context, including the seam and mock boundary. _Avoid:_
"ticket", "task file".

**Seam**
The public boundary where a test observes behavior. _Avoid:_ "test hook",
"entry point".

## Logging

**Debug output**
Temporary diagnostic output used while implementing; it must be removed
before work is reported done. _Avoid:_ "trace logging", "dev logs".

**Observability log**
A permanent log entry that support or business relies on; it is observable
behavior and deserves tests. _Avoid:_ "debug log".

**Event code**
A stable identifier attached to a logged error path so it can be grepped
and referenced by support. _Avoid:_ "error string", "log message id".

**Redaction rule**
The fixed, verbatim never-log rule from ADR 0008; it takes priority over
any project logging convention. _Avoid:_ "log hygiene", "sanitization
guideline".
