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

## Review Assurance

**Change snapshot**
The complete accumulated change presented for review: committed base-to-head
diff plus identified staged, unstaged, and relevant untracked files. _Avoid:_
"changed-file list", "last fix".

**Snapshot disclosure**
Complete and lossless reviewer access to every snapshot component via a
deterministic manifest and read instructions, without eagerly injecting every
diff byte into the initial prompt. _Avoid:_ "full-context dump", "partial
file list".

**Policy projection**
The surface-specific subset of the shared change-risk policy that one
generated artifact renders; each closed value has exactly one authoritative
owner. _Avoid:_ "full policy copy", "duplicated counts".

**Change-risk review**
An independent adversarial pass that searches a complete change snapshot and
its reachable consumers for correctness and contract gaps. _Avoid:_ "second
spec review", "quality review".

**Clean-room review**
A fresh review pass that does not receive implementer conclusions, prior
praise, or prior finding lists. _Avoid:_ "rerun", "closure check".

**Finding fingerprint**
A stable human-readable identifier for one defect class across review rounds,
independent of wording changes. _Avoid:_ "comment id", "finding text hash".

**Review result envelope**
The closed versioned result for one reviewer invocation, tied to the reviewed
change snapshot and carrying its status and findings. _Avoid:_ "free-form
review response", "empty means clean".

**Review-learning record**
A versioned normalized Markdown record of review inputs, rounds, findings,
dispositions, and terminal outcome. _Avoid:_ "raw transcript", "telemetry
log".

**Fix round**
One bounded batch that addresses validated blocking findings before the
complete updated change is reviewed again. _Avoid:_ "retry", "patch review".

**Cluster key**
The defect-mechanism identity of a finding, derived from its affected
contract and unsafe-condition class. Deliberately excludes category, so one
cluster may span product-risk categories. _Avoid:_ "finding group id",
"category key".

**Cluster**
Three or more open findings in one review round sharing a cluster key,
remediated as one shared cause rather than as separate findings. _Avoid:_
"batch", "duplicate findings".

**Within-change cluster recurrence**
A later round of the same change reporting a new finding whose cluster key
matches any finding already remediated in that change, requiring a mechanical
guard instead of another patch. _Avoid:_ "repeat finding", "second
occurrence".

## Model Selection

**Model preset**
A named portable allocation of capability and effort across workflow roles.
_Avoid:_ "model bundle", "provider preset".

**Model catalog**
Release-versioned reviewed data that relates portable role intent to exact
client model identifiers, effort, lifecycle, and alternatives. _Avoid:_
"live provider catalog", "remote model list".

**Exact model resolution**
The approved client-specific model and effort selected for one role and locked
for deterministic reuse. _Avoid:_ "moving alias", "automatic latest".

**Model capability status**
The deterministic target-surface result `configured`, `advisory`,
`unsupported`, or `unverified`. _Avoid:_ "available" when referring to
account entitlement or runtime state.

**Model availability probe**
An explicitly consented, source-free, non-persistent client invocation that
returns ephemeral account/environment evidence. _Avoid:_ "model detection",
"background check".

**Organization/private model**
An exact model identifier supplied by an administrator or private deployment
that Agent Profile preserves without ranking. _Avoid:_ "unsupported model",
"unknown bad model".

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
