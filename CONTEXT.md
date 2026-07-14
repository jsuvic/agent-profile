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

## Subagents and Context

**Task capsule**
The minimum authoritative handoff for one delegated slice: objective,
contracts, artifact paths, seam, validation, ownership, and blockers. _Avoid:_
"full chat context", "context dump".

**Indexed repository context**
A provider-neutral local capability for focused retrieval from a repository
index. _Avoid:_ "CCE context" as the canonical product term.

**Degraded context mode**
The explicit bounded fallback used when indexed repository context is not
ready. _Avoid:_ "no-MCP mode", "silent fallback".

**Capability class**
A stable intent for the model strength a role needs, resolved through a
versioned client mapping. _Avoid:_ "model alias", "model tier".

**Workflow evidence summary**
A metadata-only record of role resolution, context path, orchestration, and
validation outcome. _Avoid:_ "telemetry", "prompt log".

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

## Permission Posture

**Permission posture**
The user-facing intended outcome for how independently an enabled agent client may act. _Avoid:_ "raw client permission mode".

**Baseline posture**
The repository-wide permission posture inherited by enabled clients unless a client adjustment is present. _Avoid:_ "global client setting".

**Client adjustment**
A client-specific posture choice that replaces the baseline defaults for that client while explicit granular permissions and hard denials remain authoritative. _Avoid:_ "client escape hatch".

**Personal activation**
The separately confirmed developer-local step that enables a declared high-autonomy posture through a documented client surface. _Avoid:_ "automatic approval grant".

**Hard safety denial**
A restriction for secrets, source upload, production access, or telemetry that no posture or client adjustment may weaken. _Avoid:_ "recommended deny".

**Effective posture**
The normalized behavior inferred from declared intent and every inspected permission scope, with unobserved scopes recorded as unknown. _Avoid:_ "guaranteed runtime mode".

**Mapping status**
The closed client-capability result describing whether a posture is automatic, personally activated, manual, unsupported, policy-blocked, or unknown. _Avoid:_ "support boolean".

**Configuration source**
The exact inspected file or client scope that supplies a known effective setting. _Avoid:_ attributing merged behavior to a lower-precedence generated file.

## Repository Update

**User-owned future configuration**
Valid configuration for a capability the canonical profile cannot yet represent, preserved without management or synchronization claims. _Avoid:_ "generated drift", "automatically adopted config".

**Editable adoption review**
The interactive capability review where a preselected current/proposed set is explained and may be changed before preview or write consent. _Avoid:_ "adopt confirmation", "bulk accept".
