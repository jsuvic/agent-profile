# Spec: Local UI Migration Wizard

## Status

Draft. Belongs to Phase 16. Not approved.

## Problem

Region adoption and skill conflict resolution require careful review. CLI
reports are safe, but side-by-side visual comparison is easier for users who are
migrating existing `AGENTS.md`, `CLAUDE.md`, skills, and local config.

## Goal

Add a local UI migration wizard that displays the Phase 14 import report and
lets users choose safe actions per file before writing.

## Non-Goals

- AI-assisted merge
- hosted migration
- uploading files
- changing Phase 14 write semantics
- editing arbitrary file contents in a rich text editor
- making runtime MCP config portable

## User Flow

```powershell
agent-profile ui --root . --port auto --open true
```

The UI shows a "Migration" view when no profile exists or when import conflicts
are detected.

CLI surface:

```text
agent-profile ui [--root <path>] [--port auto|<number>] [--open true|false]
```

Rules:

- `--root` defaults to `.`
- `--port` defaults to `auto`
- `--open` defaults to `true` in interactive sessions and `false` otherwise
- the server exits on SIGINT
- the server does not daemonize
- the server does not auto-restart

Steps:

1. scan summary
2. profile proposal
3. existing files and ownership
4. generated/manual region preview
5. skill and subagent conflicts
6. `.gitignore` recommendations
7. final write plan
8. doctor preview after write

## Inputs

- Phase 14 import report
- Phase 14 write plan
- generated output previews
- current file bytes for files the user chooses to inspect

Implementation lives in the existing `apps/web` local UI package unless a later
approved spec creates a separate UI package.

## Outputs

- local-only migration plan
- optional writes through existing safe write-plan APIs
- doctor summary

## UI Requirements

- The first screen must show local-only/no-upload status.
- Existing file text is shown only after the user opens that file row.
- Markdown previews must render as escaped text, or through a sanitizer with a
  fixed allowlist. The sanitizer must reject `<script>`, `<iframe>`, inline
  event handlers, JavaScript URLs, and remote resource loading.
- JSON and TOML previews must render as code, not HTML.
- `.mcp.json`, `.claude/settings.local.json`, `.codex/config.toml`, and
  `.codex/hooks.json` are local runtime files. The UI shows metadata and
  redacted summaries for them, not raw content previews.
- Each file row has one action:
  - `Preserve`
  - `Add regions`
  - `Update generated region`
  - `Replace generated-owned`
  - `Skip`
- Unsafe replace actions require an explicit second confirmation.
- `.mcp.json` rows show "local runtime file" when absolute paths are detected.
- Generated and manual regions are visually labeled.
- Manual region text is never edited by the UI unless the user opens an
  explicit text editor in a later spec.

`Replace generated-owned` is offered only for files Phase 14 classifies as
`generated-owned` and only when drift or template change exists. It is never
offered for `unknown`, `manual-owned`, or local runtime files.

## Transport Contract

The local UI server must:

- bind to `127.0.0.1` by default
- use an ephemeral port when `--port auto` is set
- print a one-time session token in the URL
- reject requests without the valid session token
- reject non-loopback origins
- set no CORS headers for remote origins
- avoid IPv6 dual-bind unless a future explicit option enables it
- never bind to `0.0.0.0`

## Example File Row

```text
AGENTS.md
status: existing unmarked file
recommended: Add regions
reason: supported mixed ownership path; existing content will be preserved
action: [Preserve] [Add regions]
```

## Contracts

- UI uses the same import and write-plan logic as CLI.
- UI must not have a separate merge implementation.
- UI must not write without showing a final plan.
- UI must not read ignored secret files.
- UI must not upload content.
- UI must not start clients or invoke subagents.
- UI must surface post-write doctor failures and identify the failing file.
- UI must not auto-revert after a failed post-write doctor preview. Revert is a
  separate user action.

## Security Rules

- No network upload.
- No secret file reads.
- No dependency installation.
- No shell execution.
- No writes without explicit confirmation.
- Redact secret-like values in previews and reports.

## Acceptance Criteria

- Migration view appears for an existing unprofiled repo with `AGENTS.md`.
- UI can create a preserve plan without touching existing files.
- UI can create a regions plan preserving manual bytes.
- UI reports skill path conflicts.
- UI reports skill name collisions.
- UI reports `.gitignore` recommendations.
- UI writes through safe write-plan APIs only.
- Doctor preview reflects generated-region drift and manual-region preservation.
- Post-write doctor failure is displayed without automatic revert.

## Tests

- server load test for migration report
- component test for file action row
- write-plan integration test through UI endpoint
- redaction test for secret-like values
- no `.env` read sentinel
- snapshot for preserve plan
- snapshot for regions plan
- doctor preview test after region adoption
- loopback-only bind test
- session token rejection test
- non-loopback origin rejection test
- no `.env` preview test
- malicious Markdown sanitization snapshot with `<script>` and inline event
  handlers

## Documentation Updates

- `README.md`
- `docs/cli/README.md`
- local UI docs

## Final Review Checklist

- UI is only a frontend over deterministic Phase 14 behavior
- no content upload or AI invocation exists
- unsafe replacement is hard to trigger accidentally
- manual content preservation is visually clear
