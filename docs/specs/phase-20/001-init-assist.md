# Spec: init --assist - read-only AI-CLI analysis (WS3)

## Status

Approved on 2026-07-04. Synthesized from the WS3 candidate in
`docs/plans/003-ws3-ws7-spec-synthesis.md` and the grill agreement record for
`docs/plans/001-agent-capability-direction.md`.

This approval fixes the text of `ASSIST-SEC-001..010` (see Hardening Rules),
which the grill record referenced but no repository document had enumerated.

One gate remains open: the invocation adapters (WS3-I3) may not land, and the
mapping (WS3-I4) may not be reviewed, until the per-tool read-only flags are
pinned and the `002-init-assist-threat-model.md` sign-off checklist is
completed. All other issues (WS3-I1, WS3-I2, WS3-I5) are cleared for
implementation.

## Problem

Users want AI help importing and merging an existing agent setup, but letting
an external AI CLI write files breaks the deterministic compiler model and
opens a prompt-injection path from repository files into the writing tool.

## Goal

An opt-in `init --assist` where a user-chosen, locally installed AI CLI runs in
read-only/plan mode and returns a strict recommendation object. APC validates
it against a closed schema, maps validated enums/slugs into an
`ai-profile.yaml` draft, and writes via the normal diff -> approve -> single
atomic write path, followed by doctor.

The assisting CLI can only fill checkboxes APC already offers. It cannot name
files, propose writes or commands, or bypass diff, ai-profile validation, or
doctor.

## Non-Goals

- APC ever acting on a path, command, patch, or file content from the
  assistant.
- Failing the whole run on extra/unknown fields (only invalid JSON, non-object
  root, over the size cap, or no valid recommendation left cause degrade).
- Generating MCP configuration from `suggestedMcpCandidates` (ids are mapped to
  the informational intent only; config generation stays out of scope per
  phase-19).
- Prompt-generation for manual copy/paste (`phase-later/019` covers that
  distinct surface; this spec neither implements nor supersedes it).
- Hosted execution, background execution, or APC-initiated network calls.
- Tabnine hooks or any client not detected locally.

## User Flow

```bash
agent-profile init --assist
```

1. Detect installed clients via `codex --version`, `claude --version`,
   `tabnine --version` (version probe only; no other invocation).
2. User explicitly picks one client (no default; declining runs normal init).
3. Before invocation, APC displays a consent notice: the chosen CLI will read
   the repository under its own account and settings, and may send
   repository-derived content to its hosted model. APC itself uploads nothing.
4. APC invokes the chosen CLI in its read-only/plan mode with pinned flags
   (see Invocation Adapters), requesting JSON-only output.
5. Output is validated by the two-pass validator against
   `AssistRecommendationV1`.
6. Validated values pre-fill the phase-12/007 wizard selections per the
   Mapping table; display-only fields appear in the assist summary. Nothing is
   auto-applied: the user can change every pre-selection.
7. The wizard proceeds as normal: draft -> normal ai-profile validation ->
   diff -> approve -> single atomic write -> doctor.
8. On any validation failure, APC degrades to normal init and reports that no
   recommendation was applied. No partial writes.

## Inputs

- `--assist` flag on the existing `init` command (phase-12/007 wizard).
- Detected client list (version probes only).
- The chosen client's JSON output (untrusted data).
- The shared `McpCandidate` catalog from `@agent-profile/doctor` (phase-19).

## Outputs

- An `ai-profile.yaml` draft written only through the normal
  diff -> approve -> atomic write path.
- An assist report: applied recommendations, and ignored recommendations
  listed by JSON pointer + reason + value type - never raw assistant text.

## Recommendation Schema

`AssistRecommendationV1` is a closed schema of enums and slugs only:

```ts
type AssistRecommendationV1 = {
  version: 1;
  likelyStack?: StackSlug[];              // closed slug list from stack detection
  existingAgentFiles?: KnownAgentFileId[]; // closed enum, not free paths
  suggestedSetupProfile?: SetupProfileId;  // phase-12/007 enum
  suggestedSkillPacks?: SkillPackId[];     // phase-12/002 closed pack ids
  suggestedSubagentPacks?: SubagentPackId[]; // phase-12/008 closed ids
  suggestedMcpCandidates?: McpCandidateId[]; // phase-19 shared catalog enum
  risks?: RiskCode[];                      // closed enum
};
```

- No field carries free text, paths, commands, patches, URLs, or file content.
- `existingAgentFiles` is a closed enum of artifact ids APC already knows
  (e.g. `agents-md`, `claude-md`), never repository paths.
- `version` must be exactly `1`; missing or any other value -> degrade (an
  unknown schema version cannot be trusted field-by-field).
- Unknown fields are stripped and reported, not fatal.
- Hard size cap: 64 KiB of CLI stdout; over cap -> degrade.

## Mapping

Validated fields either pre-fill wizard selections or are display-only in the
assist summary. Nothing is auto-applied; the user can change every
pre-selection before the diff.

| Field | Effect |
| --- | --- |
| `suggestedSetupProfile` | Pre-selects the wizard's setup-profile question (which sets `safety.mode` per phase-12/007) |
| `suggestedSkillPacks` | Pre-checks pack checkboxes -> `capabilities.skills.packs` |
| `suggestedSubagentPacks` | Pre-checks subagent pack checkboxes -> `capabilities.delegation.subagents.packs` |
| `suggestedMcpCandidates` | Display-only in the assist summary; may pre-check the `mcp-recommendations` pack checkbox |
| `likelyStack`, `existingAgentFiles`, `risks` | Display-only in the assist summary; never touch the draft |

## Two-Pass Validator

Fixed order, binding:

1. Parse + bound: JSON parse, root must be an object, size cap enforced before
   parse, `version` must be `1`.
2. Collect: record every unknown or forbidden field as an ignored
   recommendation (JSON pointer + reason + value type).
3. Strip: reduce to the closed allowlist.
4. Strict validate: enums/slugs only; invalid values become ignored entries,
   not errors, unless nothing valid remains.
5. Pre-fill wizard selections per the Mapping table (pack targets follow
   phase-12/002 - not a `skills.include` shape).
6. Normal ai-profile validation -> diff -> approve -> single atomic write ->
   doctor.

Degrade conditions (whole-run): invalid JSON, non-object root, over size cap,
missing or non-`1` `version`, or no valid recommendation remaining after
stripping.

## Invocation Adapters

Per-tool read-only invocations, pinned at implementation time and recorded in
the threat model:

- `codex exec` with sandboxed, no-approval-required-write flags.
- `claude -p` with plan/read-only permission mode, bounded max turns, JSON
  output format.
- `tabnine -p` non-interactive JSON mode.

Adapters must: pass a fixed instruction requesting JSON matching
`AssistRecommendationV1` only; select the most restrictive documented
read-only/sandboxed mode the client offers; set a wall-clock timeout; capture
stdout for parsing and capture stderr separately, discarding it without
rendering, persisting, or logging it (assistant diagnostics can carry raw
text or reflected secrets; only APC's deterministic degrade message is ever
shown); treat a non-zero exit, timeout, or empty stdout as degrade. APC never
grants the assisting CLI write, shell, or install permissions.

## Hardening Rules (binding)

Reconstructed as `ASSIST-SEC-001..010`; approving this spec fixes their text.

- ASSIST-SEC-001: assist is opt-in per run; no default client; declining or
  any failure degrades to normal init.
- ASSIST-SEC-002: the assisting CLI is invoked only in its read-only/plan/
  sandbox mode with pinned flags; never with write, shell, or install
  permissions granted by APC.
- ASSIST-SEC-003: assistant output is untrusted data, parsed only as JSON
  against the closed `AssistRecommendationV1` schema; it is never interpreted
  as instructions, a write plan, a command plan, or path authority.
- ASSIST-SEC-004: any path, command, patch, URL, or file-content field is
  stripped and reported; APC never acts on it.
- ASSIST-SEC-005: stdout is capped at 64 KiB before parsing; over cap degrades
  with no partial application.
- ASSIST-SEC-006: the two-pass validation order (parse+bound -> collect ->
  strip -> strict validate -> map -> normal validation) is fixed and may not
  be reordered or short-circuited.
- ASSIST-SEC-007: ignored recommendations are reported by JSON pointer +
  reason + value type only; raw assistant text - from stdout or stderr - is
  never echoed to terminal, files, or logs (prompt-injection sink
  prevention). Adapter stderr is captured and discarded, never inherited by
  the terminal.
- ASSIST-SEC-008: all writes route through the normal diff -> approve ->
  single atomic write path; assist cannot bypass ai-profile validation or
  doctor.
- ASSIST-SEC-009: on degrade, APC reports that no recommendation was applied
  without echoing assistant output, and continues as normal init with no
  partial writes.
- ASSIST-SEC-010: APC itself performs no network calls; any model/network
  access happens inside the user's chosen CLI under the user's own account,
  and the consent notice discloses this before invocation.

## Contracts (binding)

- `AssistRecommendationV1` is closed; `suggestedMcpCandidates` imports
  `McpCandidateId` from the phase-19 shared catalog; adding values is a
  reviewed source change.
- Recommendations only pre-fill choices the phase-12/007 wizard already
  offers. The profile surfaces reachable from a recommendation are exactly the
  wizard's: `safety.mode` (via setup profile), `capabilities.skills.packs`
  (phase-12/002), and `capabilities.delegation.subagents.packs`
  (phase-12/008). Display-only fields never touch the profile.
- The consent notice is shown before every invocation; it names the chosen
  client, states that APC uploads nothing itself, warns that the client may
  send repository-derived content to its hosted model, and defaults to
  decline - assist proceeds only on explicit affirmative confirmation.
- Boundary clarification: the product's no-source-upload contract governs
  APC's own behavior; APC transmits nothing. A user-chosen client reading the
  repository under the user's own account is outside that boundary and is
  permitted only through the default-decline consent gate above. An adapter
  may only invoke modes documented as read-only for the repository; if a
  client offers a verified local/offline mode, the adapter must prefer it.
- `init` without `--assist` is byte-identical to phase-12/007 behavior.
- ASSIST-SEC-001..010 above.

## Security Rules

- No secrets read or printed; no environment values passed to the assistant
  beyond what its own CLI reads itself.
- No APC-initiated network, install, shell, or file mutation from assistant
  output.
- Assistant stdout is never persisted verbatim.
- The version probes execute only `<client> --version`.

## Acceptance Criteria

- Assistant output containing a path, command, patch, URL, or unknown field is
  stripped and reported by pointer + type; APC acts only on validated
  enums/slugs.
- Invalid JSON / non-object / over 64 KiB / wrong `version` / nothing valid
  left -> degrade to normal init, no partial writes, no assistant text echoed.
- Recommendations only pre-fill wizard selections the user can change;
  display-only fields never modify the draft.
- All writes go through the single atomic path after diff approval.
- No shell/write/install is performed from assistant output (runtime sentinel).
- Consent notice precedes invocation; declining runs normal init.
- `init` without `--assist` matches the phase-12/007 golden baseline.
- The assist report is deterministic for a fixed recommendation fixture.

## Tests

- Validator table (table-driven): valid minimal object; unknown field
  stripped+reported; forbidden field (path/command/patch/URL) stripped+
  reported; invalid enum value ignored; non-object root, invalid JSON,
  over-cap, missing/wrong `version`, and empty-after-strip all degrade.
- Display-only isolation: a fixture carrying only `likelyStack`,
  `existingAgentFiles`, and `risks` leaves the draft identical to wizard
  defaults; the values appear only in the assist summary.
- Injection fixtures: recommendation embedding shell strings, relative/absolute
  paths, and markdown instructions - assert none reach the draft, the report,
  or any execution path; raw text absent from all output (echo sentinel).
- Write-path sentinel: no file mutation occurs before diff approval; degrade
  leaves the tree untouched.
- Execution sentinel: no child process other than the version probes and the
  single chosen adapter invocation.
- Stderr sentinel: an adapter fixture writing assistant-style text and
  secret-shaped strings to stderr -> none of it reaches terminal output,
  files, or logs; only the deterministic degrade message appears.
- Adapter behavior: non-zero exit / timeout / empty stdout -> degrade.
- Consent gate: default answer declines and runs normal init; the adapter is
  invoked only after explicit affirmative confirmation.
- Mapping: validated pack ids land in `capabilities.skills.packs` /
  `...subagents.packs`; resulting draft passes normal ai-profile validation.
- Golden: assist report fixture byte-stable; no-flag init byte-identical to
  the phase-12/007 baseline.

## TDD Strategy

RED: validator table tests, echo sentinel, and write-path sentinel fail before
the validator and adapters exist. GREEN: schema + validator (WS3-I1/I2), then
adapters (WS3-I3) behind the threat-model gate, then mapping and report
(WS3-I4/I5).

## Issue Plan

- WS3-I1: `AssistRecommendationV1` schema + shared catalog wiring. `ready`
  (phase-19 catalog, phase-12/002 packs, phase-12/007 init all landed).
- WS3-I2: two-pass validator with ASSIST-SEC-003..007. `sequenced` after
  WS3-I1.
- WS3-I3: client detection + read-only invocation adapters. `parallel-safe`
  with WS3-I2; `blocked` on `002-init-assist-threat-model.md` sign-off.
- WS3-I4: recommendation -> draft mapping + normal validation. `sequenced`
  after WS3-I2; review `blocked` on the threat-model sign-off.
- WS3-I5: assist report + degrade-to-normal. `sequenced` after WS3-I4.
- WS3-I6 (human gate): `002-init-assist-threat-model.md` sign-off.

## Documentation Updates

- CLI reference: `init --assist`, the consent notice, and degrade behavior.
- `docs/security/trust-model.md`: assistant output as untrusted data; the
  consent boundary for the chosen CLI's own network access.
- Update `docs/plans/003-ws3-ws7-spec-synthesis.md` to point WS3 at this phase.

## Final Review Checklist

- Assistant can only fill checkboxes; no path/command/patch authority.
- Fail closed on every malformed input; no partial writes on degrade.
- Ignored input reported without echoing raw text anywhere.
- Consent notice honest about the chosen CLI's own network/model access.
- Single atomic write path preserved; doctor runs after write.
- ASSIST-SEC-001..010 each covered by a focused test or explicit static-only
  evidence, called out as such.
