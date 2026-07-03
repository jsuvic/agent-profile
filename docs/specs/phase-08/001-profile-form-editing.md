# Spec: Profile Form Editing

## Status

Implemented. Landed with the re-rooted initial import `167f313` (2026-05-12).

## Problem

Phase 6 renders `ai-profile.yaml` as a read-only profile view. Users still have
to edit raw YAML by hand even though the product already knows the schema,
defaults, safety model, and target list. A browser editor can reduce YAML
mistakes, but only if it does not weaken the local-first and diff-before-write
contracts.

## Goal

Add guarded form editing for schema v1 profile fields on the local `/profile`
route. The form produces a deterministic candidate `ai-profile.yaml` document
in memory. It does not write to disk; save flows are handled by
`002-ui-diff-before-write.md` and `003-local-write-safety.md`.

## Non-Goals

- creating a missing `ai-profile.yaml`
- editing generated target files or `ai-profile.lock`
- editing raw YAML in a browser text area
- preserving comments, anchors, aliases, or custom YAML formatting as a hard
  requirement
- editing unknown schema fields
- adding schema v2 fields
- hosted storage, sync, accounts, or collaboration
- credential or secret entry
- stack detection or import flows

## User Flow

1. The user opens `/profile` for a project that already has a valid
   `ai-profile.yaml`.
2. The page renders the current profile in form sections and shows the current
   profile hash from disk.
3. The user chooses Edit.
4. The form becomes editable for supported fields. The raw YAML preview remains
   read-only and optional.
5. Each edit updates a candidate profile object and candidate YAML in memory.
6. Validation feedback updates before the user can continue.
7. When validation passes and candidate bytes differ from the loaded bytes, the
   user can choose Review diff.
8. The user is taken to the diff review flow defined in
   `002-ui-diff-before-write.md`.

Missing, invalid, or unsupported profiles do not enter edit mode. They render
the validation state and point users to the CLI or manual YAML editing.

## Inputs

- `ai-profile.yaml` loaded from the configured project root
- the validated `AiProfile` value from `@agent-profile/core`
- the original profile bytes and sha256 hash
- user edits from form controls
- validation results from `004-profile-validation-feedback.md`

## Outputs

- editable form state for supported schema v1 fields
- deterministic candidate YAML bytes held in browser/server memory
- validation state and field-level issue mapping
- a diff-review request containing the candidate profile and the original file
  hash

No file is written by this spec.

## Editable Fields

The form covers these schema v1 fields:

| Profile path                        | Control                     | Notes                                                          |
| ----------------------------------- | --------------------------- | -------------------------------------------------------------- |
| `/version`                          | read-only value             | Must remain `1`.                                               |
| `/profile/name`                     | text input                  | Must match the schema slug pattern.                            |
| `/profile/description`              | textarea                    | Non-empty free text, secret-checked.                           |
| `/stack/languages`                  | token list                  | At least one slug, unique, sorted only when user chooses sort. |
| `/stack/frameworks`                 | token list                  | Unique slug list, empty allowed.                               |
| `/stack/packageManagers`            | token list                  | Unique slug list, empty allowed.                               |
| `/stack/testing`                    | token list                  | Unique slug list, empty allowed.                               |
| `/clients/tabnine/enabled`          | toggle                      | Enables Tabnine outputs on next CLI compile.                   |
| `/clients/codex/enabled`            | toggle                      | Enables Codex outputs on next CLI compile.                     |
| `/clients/claude/enabled`           | toggle                      | Enables Claude outputs on next CLI compile.                    |
| `/safety/mode`                      | select or segmented control | `guarded`, `balanced`, `autonomous`, `plan-only`.              |
| `/safety/requiresSandbox`           | checkbox                    | Boolean.                                                       |
| `/workflow/sdd`                     | toggle                      | Boolean.                                                       |
| `/workflow/tdd`                     | toggle                      | Boolean.                                                       |
| `/workflow/finalReview`             | toggle                      | Boolean.                                                       |
| `/permissions/filesystem/read`      | select                      | `allow`, `ask`, `deny`.                                        |
| `/permissions/filesystem/write`     | select                      | `allow`, `ask`, `deny`.                                        |
| `/permissions/shell/run`            | select                      | `allow`, `ask`, `deny`.                                        |
| `/permissions/dependencies/install` | select                      | `allow`, `ask`, `deny`.                                        |
| `/permissions/network/external`     | select                      | `allow`, `ask`, `deny`.                                        |
| `/permissions/secrets/access`       | read-only fixed value       | Must remain `deny`.                                            |
| `/permissions/production/access`    | read-only fixed value       | Must remain `deny`.                                            |

The form may display effective permission values derived from safety presets,
but it must distinguish inherited defaults from explicit YAML overrides.
Changing a permission creates or updates the explicit `permissions` path.
Resetting a permission to the inherited default may remove that explicit
override if doing so preserves behavior.

Implementation decision: Phase 8 initializes permission controls from explicit
YAML overrides when present, otherwise from effective inherited values. If a
permission changes from an inherited value, the candidate emits an explicit
`permissions` block with the editable values plus locked `secrets.access:
deny` and `production.access: deny`. This is slightly more verbose than a
minimal override-only block, but it keeps the reviewed diff explicit and avoids
silent permission loss.

## Candidate Serialization

Candidate YAML must be deterministic:

- UTF-8 text with a single trailing newline
- schema fields emitted in schema order:
  `version`, `profile`, `stack`, `clients`, `safety`, `workflow`,
  `permissions`
- nested object keys emitted in the same order as the schema
- arrays emitted in their current form order
- booleans emitted as YAML booleans, not strings
- no comments generated by the serializer
- no anchors, aliases, tags, or custom YAML nodes generated by the serializer

Optional blocks should not be materialized only because the UI displayed
effective defaults. If `safety` or `permissions` was absent and the user did
not change a value in that block, the candidate should keep it absent. If the
user changes a value in an optional block, the serializer may emit the minimal
explicit block needed to represent the change.

If comments or formatting exist in the current YAML, the form may produce a
canonicalized candidate that drops them. That is allowed only because the diff
review shows the exact byte-level replacement before write.

## Unsupported Profile Handling

Unknown fields are not silently dropped. Because schema v1 uses
`additionalProperties: false`, unknown fields produce schema validation issues.
When the current profile is missing, invalid, or contains unknown fields:

- edit controls are disabled
- the page renders validation feedback and a read-only YAML preview if safe
- no candidate YAML is produced
- Review diff and Save are unavailable

The implementation may add a future comment-preserving YAML AST editor, but it
is not required for Phase 8.

## Contracts

- The editor must use the schema v1 `AiProfile` contract from
  `@agent-profile/core`.
- The editor must not redefine schema validation rules in Svelte components.
- The editor must not call compiler write helpers.
- The editor must not write until the user reviews and confirms a diff.
- The editor must not offer fields for unsupported targets such as Cursor,
  Aider, Copilot, hooks, subagents, plugins, hosted MCP gateways, or team
  policy packs.
- The form must not change generated artifacts, lockfiles, client runtime
  settings, `.gitignore`, `.mcp.json`, or package files.
- Browser form state is not a source of truth. The on-disk profile remains the
  source of truth until the confirmed write succeeds.

## Security Rules

- Do not read or display secret files.
- Do not accept literal secret-like values in any editable string or token
  field.
- Do not add credential inputs.
- Do not upload profile contents or source code.
- Do not issue outbound network requests.
- Do not execute shell commands.
- Do not install dependencies.
- Render all user-controlled text as text, never HTML.

## Acceptance Criteria

- Users can edit profile metadata, stack, clients, safety, workflow, and
  editable permission fields through form controls.
- `version`, `permissions.secrets.access`, and
  `permissions.production.access` are rendered but cannot be changed away from
  their allowed constants.
- Edits produce deterministic candidate YAML in memory.
- Unchanged candidates cannot proceed to diff review.
- Invalid candidates cannot proceed to diff review.
- Current profiles with unknown fields show a clear unsupported/invalid editing
  state and are not silently rewritten.
- Optional `safety` and `permissions` blocks are not emitted solely because
  the UI displayed inherited defaults.
- Secret-like literals entered into editable fields are rejected before diff
  review.

## Tests

- draft construction from a minimal valid profile
- draft construction from a full profile with explicit safety and permissions
- serialization determinism for repeated equivalent edits
- schema field order in serialized YAML
- optional `safety` and `permissions` preservation when untouched
- explicit permission override creation and reset behavior
- unknown-field profile blocks edit mode
- secret-like value in `profile.description` blocks candidate creation
- duplicate slug list values map to field validation errors
- unchanged candidate disables diff review

## Documentation Updates

- `apps/web/README.md` must describe `/profile` edit mode and its limits.
- Root `README.md` must stop describing the web UI as fully read-only once
  Phase 8 is implemented; it must still say generated artifact writes use the
  CLI.
- Phase 6 profile viewer spec must be amended or superseded to note that
  Phase 8 makes `/profile` guarded-editable.

## Final Review Checklist

- only schema v1 fields are editable
- no generated target files can be edited
- candidate YAML is deterministic
- unknown fields are not dropped
- secret-like literals are blocked
- save still requires diff review and confirmation
