# Spec: AI-Assisted Import Merge Proposal

## Status

Draft. Phase later. Not approved. Depends on Phase 14 safe import and ownership.

## Problem

Deterministic regions preserve user content, but they do not resolve semantic
overlap. A user may want help classifying old rules, removing duplicates, and
deciding what belongs in generated versus manual regions.

## Goal

Add an optional AI-assist prompt generator that helps users request a merge
proposal without making AI part of the safety mechanism.

## Non-Goals

- automatic AI merge
- sending repository content to a hosted model
- writing AI output directly to files
- replacing Phase 14 deterministic ownership checks
- reading secrets
- committing changes

## User Flow

```powershell
agent-profile init --import --assist-prompt --dry-run
agent-profile init --import --assist-prompt --include-existing AGENTS.md,CLAUDE.md --dry-run
```

The command prints a prompt the user may copy to an AI assistant. It does not
call an AI model.

Default prompt includes:

- sanitized repo summary
- detected stack
- detected agent files
- import report summary
- expected JSON output schema
- instructions to avoid secrets
- instructions to classify each existing rule

Existing file text is not included unless explicitly requested with
`--include-existing`.

The only supported `--include-existing` values in this phase are:

- `AGENTS.md`
- `CLAUDE.md`

The command rejects these paths even when explicitly requested:

- `.mcp.json`
- `.codex/config.toml`
- `.codex/hooks.json`
- `.claude/settings.json`
- `.claude/settings.local.json`

Those files may contain local paths, runtime settings, or tokens and are not
prompt inputs in this phase.

## Inputs

- Phase 14 import report
- optional explicit file allowlist from `--include-existing`
- generated profile proposal

## Outputs

- prompt text only
- no file writes
- no network calls

## Prompt Contract

The prompt must ask for JSON only:

```json
{
  "rules": [
    {
      "sourcePath": "AGENTS.md",
      "summary": "Run golden tests when generated outputs change.",
      "classification": "manual-project-rule",
      "recommendedRegion": "manual",
      "conflictsWithGenerated": false,
      "safetyImpact": "none",
      "reason": "Repository-specific workflow rule."
    }
  ],
  "proposedManualRegionOutline": [
    "Project principles",
    "Development workflow",
    "Final response requirements"
  ],
  "warnings": []
}
```

Allowed `classification` values:

- `manual-project-rule`
- `generated-profile-fact`
- `safety-rule`
- `local-runtime-rule`
- `duplicate`
- `conflict`
- `obsolete`
- `unknown`

Allowed `recommendedRegion` values:

- `manual`
- `generated`
- `drop`

The prompt must include:

```text
Do not include secrets, tokens, bearer headers, private keys, or environment values in the output. If a rule appears to contain sensitive material, summarize it as redacted-sensitive-material.
```

Prompt bytes are deterministic for the same import report:

- file findings sorted by path
- stack entries sorted lexicographically
- JSON keys emitted in the order shown in this spec
- LF line endings
- no trailing whitespace

## Redaction Rules

Before prompt output, each matched sensitive span is replaced with
`[REDACTED]`.

Required deterministic patterns:

| Category         | Pattern                                                                               |
| ---------------- | ------------------------------------------------------------------------------------- |
| env assignment   | `^[A-Za-z_][A-Za-z0-9_]*=[A-Za-z0-9_\\-]{16,}$`                                       |
| JWT              | `eyJ[A-Za-z0-9_\\-]+\\.[A-Za-z0-9_\\-]+\\.[A-Za-z0-9_\\-]+`                           |
| bearer header    | `Bearer [A-Za-z0-9._\\-]{16,}`                                                        |
| PEM private key  | `-----BEGIN [A-Z ]+PRIVATE KEY-----` through matching `-----END ... PRIVATE KEY-----` |
| OpenAI-style key | `sk-[A-Za-z0-9_\\-]{16,}`                                                             |
| GitHub token     | `ghp_[A-Za-z0-9_]{16,}`                                                               |
| Slack bot token  | `xoxb-[A-Za-z0-9\\-]{16,}`                                                            |

The redactor must be applied before any optional existing file body is inserted
into the prompt.

## Contracts

- `--assist-prompt` never writes.
- `--assist-prompt` never calls a model.
- File content is opt-in per path.
- Secret-like values are redacted before prompt output.
- AI output is advisory only.
- Applying a proposal requires a separate deterministic write-plan command in a
  future approved spec.
- Applying AI JSON requires a separate approved spec that routes through Phase
  14 write-plan APIs.
- Any future JSON consumer must validate AI output against the approved schema
  before attempting a write plan.

## Security Rules

- Do not read `.env` files.
- Do not upload source.
- Do not call AI APIs.
- Do not print secrets.
- Do not include ignored local runtime files.

## Acceptance Criteria

- default assist prompt contains no raw existing file content
- explicit include allows only listed supported files
- secret-like values are redacted
- prompt contains expected JSON schema
- prompt classifies AI result as advisory
- command writes no files
- `.mcp.json` is rejected by `--include-existing`

## Tests

- default prompt excludes existing file body
- include prompt includes only allowlisted file body
- secret-like content redacted
- `.env` sentinel not read
- output deterministic for same import report
- no network/API call sentinel
- redaction-pattern unit tests for each required category
- allowlist negative test rejecting `.mcp.json`

## Documentation Updates

- future AI-assist documentation
- `docs/security/trust-model.md`
- `docs/cli/README.md`

## Final Review Checklist

- deterministic ownership remains the safety mechanism
- AI output cannot directly write files
- user controls whether raw existing instructions are included
- no secret, upload, or network behavior is introduced
