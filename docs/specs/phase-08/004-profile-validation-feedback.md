# Spec: Profile Validation Feedback

## Status

Draft for implementation review.

## Problem

Editable forms need precise validation feedback before the user reviews a diff
or writes a file. The feedback must come from the same schema and semantic
rules used by the compiler and doctor, and it must not echo secret-like
literals back into the browser.

## Goal

Render schema, security, and advisory validation feedback inline in the
`/profile` editor. Schema and security errors block diff review and save.
Doctor-style advisory findings may be shown, but they do not replace schema
validation and do not automatically write fixes.

## Non-Goals

- AI-generated fixes
- hosted validation
- suppressing doctor findings
- validating generated artifacts from the profile editor
- running full doctor checks on every keystroke
- adding a new schema language or client-side-only validator

## User Flow

1. The user edits a form field.
2. The UI validates locally for simple field constraints where practical
   (required state, duplicate chips, empty token).
3. The server validates the candidate through the same core profile validation
   used by CLI and compiler flows when the user asks for diff review and again
   when the user confirms the write.
4. Field-level errors appear next to controls.
5. A page-level summary lists blocking errors in deterministic order.
6. Secret-like values show a security error with a redacted message.
7. Review diff remains disabled until all blocking errors are resolved.

## Inputs

- candidate profile draft from `001-profile-form-editing.md`
- `ProfileValidationIssue[]` from `@agent-profile/core`
- secret-like literal checks from `containsSecretLikeLiteral`
- optional current doctor summary for advisory display

## Outputs

- field-level validation messages
- page-level validation summary
- blocking/non-blocking validation status
- redacted security messages for secret-like values

## Issue Model

The editor should normalize validation issues into a UI model similar to:

```ts
type ProfileEditorIssue = {
  severity: "error" | "warning" | "info";
  source: "schema" | "security" | "doctor" | "ui";
  code: string;
  path: string;
  fieldId: string | null;
  message: string;
  blocking: boolean;
};
```

Messages must be deterministic for the same candidate and sorted by:

1. blocking before non-blocking
2. path
3. code
4. message

## Field Mapping

Validation paths must map to stable form field ids:

| JSON pointer                        | Field id                           |
| ----------------------------------- | ---------------------------------- |
| `/version`                          | `version`                          |
| `/profile/name`                     | `profile.name`                     |
| `/profile/description`              | `profile.description`              |
| `/stack/languages`                  | `stack.languages`                  |
| `/stack/frameworks`                 | `stack.frameworks`                 |
| `/stack/packageManagers`            | `stack.packageManagers`            |
| `/stack/testing`                    | `stack.testing`                    |
| `/clients/tabnine/enabled`          | `clients.tabnine.enabled`          |
| `/clients/codex/enabled`            | `clients.codex.enabled`            |
| `/clients/claude/enabled`           | `clients.claude.enabled`           |
| `/safety/mode`                      | `safety.mode`                      |
| `/safety/requiresSandbox`           | `safety.requiresSandbox`           |
| `/workflow/sdd`                     | `workflow.sdd`                     |
| `/workflow/tdd`                     | `workflow.tdd`                     |
| `/workflow/finalReview`             | `workflow.finalReview`             |
| `/permissions/filesystem/read`      | `permissions.filesystem.read`      |
| `/permissions/filesystem/write`     | `permissions.filesystem.write`     |
| `/permissions/shell/run`            | `permissions.shell.run`            |
| `/permissions/dependencies/install` | `permissions.dependencies.install` |
| `/permissions/network/external`     | `permissions.network.external`     |
| `/permissions/secrets/access`       | `permissions.secrets.access`       |
| `/permissions/production/access`    | `permissions.production.access`    |

Required-property and additional-property errors should map to the nearest
owning section if they cannot map to a concrete control.

## Blocking Rules

The following block diff review and save:

- YAML parse failure
- schema validation failure
- unsupported schema version
- unknown/additional fields in the current profile or candidate
- candidate secret-like literal
- empty required token list
- duplicate token values
- stale file state from `002-ui-diff-before-write.md`
- write-safety failure from `003-local-write-safety.md`

The following are advisory and do not block by themselves:

- current doctor warnings
- current doctor not-verifiable findings
- inherited permission default notices
- reminders that generated artifacts need CLI compile after profile save

## Secret-Like Literal Handling

The editor must check all editable string and token values before diff review.
If a value matches `containsSecretLikeLiteral`:

- return a blocking `security` issue
- do not include the matched value in the message
- do not include the matched value in `expected`, `actual`, analytics, logs, or
  debug output
- render the field value itself only as the user typed it in the local input;
  do not copy it into summaries, diffs, or issue text

Current profile YAML previews continue to use the existing redaction behavior
from the server preview path.

## Contracts

- Validation must use `@agent-profile/core` profile validation.
- Secret checks must use `containsSecretLikeLiteral` from
  `@agent-profile/core`.
- Client-side validation improves responsiveness for simple field constraints,
  but cannot be the only enforcement layer.
- Server-side validation must run before diff preview and again before write.
- Messages must not echo secret-like raw values.
- Doctor warnings may be shown as advisory, but schema and security errors
  block save.
- All messages render as text.

## Security Rules

- Do not upload validation input.
- Do not log candidate profile content by default.
- Do not echo secret-like values in messages.
- Do not render validation messages as HTML.
- Do not run shell commands or install dependencies for validation.
- Do not read generated artifacts from the profile validation endpoint.

## Acceptance Criteria

- Invalid fields show inline errors for local field checks and for server
  validation issues returned by the plan/apply endpoints.
- A page-level summary lists all blocking errors.
- Review diff is blocked while schema validation fails.
- Review diff is blocked while secret-like literal checks fail.
- Secret-like values show a security warning without rendering the literal.
- Unknown fields map to an unsupported/invalid editing state.
- Advisory doctor warnings are visually distinct from blocking errors.
- Validation issue ordering is deterministic.

## Tests

- validation issue mapping for every editable field path
- required-property issue maps to owning section
- additional-property issue maps to unsupported/invalid editing state
- invalid `profile.name` pattern shows inline error
- duplicate token list value shows inline error
- missing language blocks save
- unsupported schema version blocks save
- secret-like literal blocks save without echoing value
- existing advisory doctor warnings, when displayed elsewhere in the UI, do not
  block profile saves
- issue ordering is deterministic
- validation message rendering escapes HTML-like text

## Documentation Updates

- `apps/web/README.md` describes validation behavior and security redaction.
- `docs/security/secret-handling.md` notes that Phase 8 profile editor rejects
  secret-like literals before diff review.

## Final Review Checklist

- core validator is used server-side
- field mapping is stable
- blocking status is correct
- secret-like literals are not echoed
- save cannot bypass validation
