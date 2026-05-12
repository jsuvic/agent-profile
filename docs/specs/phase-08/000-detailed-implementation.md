# Spec: Phase 8 Detailed Implementation

## Status

Draft

This document is the implementation-level synthesis of the four Phase 8 drafts:

- `001-profile-form-editing.md`
- `002-ui-diff-before-write.md`
- `003-local-write-safety.md`
- `004-profile-validation-feedback.md`

It does not replace those drafts. It pins the architecture, endpoint surface,
types, error envelopes, and test matrix that the four drafts assume but do not
yet specify in implementation form.

If this document and any of the four drafts disagree, the per-feature draft
wins on intent and this document wins on implementation shape. Conflicts must
be resolved by editing the per-feature draft, not by silently diverging here.

## Problem

The Phase 6 local UI is read-only. Phase 8 introduces local browser-driven
edits to `ai-profile.yaml`. Adding writes through the UI server expands the
trust boundary: untrusted form input becomes file mutations on the user's
machine. The four Phase 8 drafts state correct intent (form editing, UI diff,
write safety, validation feedback) but leave the wire format, atomicity model,
stale-edit handling, secret-detection rules, and path-containment enforcement
unspecified at implementation depth.

## Goal

Ship one buildable implementation surface for Phase 8 such that:

- the SvelteKit UI can edit a defined subset of `ai-profile.yaml`
- every write goes through diff-before-write that mirrors the Phase 5 CLI
  contract
- the UI server enforces strict path containment, atomic writes, and rejects
  symlink escape
- schema and security validation are reused from `@agent-profile/core` so the
  CLI and UI cannot disagree
- secret-like literals never reach disk and never appear in UI error messages
- the entire surface is local-only, loopback-bound, and CSRF-protected

## Non-Goals

- editing generated target files (AGENTS.md, CLAUDE.md, Tabnine guidelines,
  Codex/Claude skills, MCP configs, lockfile)
- editing files outside `ai-profile.yaml`
- multi-user collaboration, presence, or locking across machines
- hosted storage, hosted validation, hosted preview, or remote diff
- credential entry of any kind
- AI-generated fixes for validation failures
- conflict resolution beyond stale-edit detection
- migrating profile schema versions
- editing fields covered by ADR 0005 future capability blocks until those
  blocks are accepted into the runtime schema

## User Flow

1. The user runs the local UI server with `--root <repoRoot>`. Phase 8 writes
   only the root `ai-profile.yaml`; custom profile paths remain out of scope
   for the browser write path.
2. The server binds to `127.0.0.1` on an ephemeral port and serves the
   SvelteKit UI.
3. The UI loads the current profile via `GET /api/profile`. The response
   includes the parsed profile, normalized safety, effective permissions,
   the on-disk byte length, and a strong ETag computed from the on-disk bytes.
4. The user edits supported fields via form controls. The UI computes a
   candidate profile object client-side and validates it incrementally against
   the schema using `@agent-profile/core` (vendored to the browser bundle).
5. While validation fails, the Save button is disabled and per-field inline
   errors are shown. Doctor-style advisory warnings are visible but do not
   block save.
6. When the user clicks Save, the UI calls `POST /api/profile/plan` with the
   candidate profile object and the previously observed ETag. The server
   re-validates, re-reads the on-disk file, computes a unified diff between
   on-disk bytes and rendered candidate bytes, and returns the diff plus a
   short-lived `planToken`.
7. The UI renders the diff as plain text and asks the user to confirm.
8. On confirmation the UI calls `POST /api/profile/apply` with the
   `planToken`. The server re-reads the file, verifies the ETag still
   matches, runs the same validation and diff, and only then writes the file
   atomically. Apply returns the new ETag and the applied byte length.
9. If at any step the on-disk ETag has changed, the server returns
   `409 stale_profile` and the UI prompts the user to reload.

## Architecture

```text
Browser (SvelteKit UI)
  |
  | fetch (same-origin, loopback only)
  v
Local UI server (Node)
  |-- GET  /api/profile
  |-- POST /api/profile/plan   (CSRF token required)
  |-- POST /api/profile/apply  (CSRF token + planToken required)
  |
  | uses
  v
@agent-profile/core          @agent-profile/compiler
  parseProfileYaml            safeOutputPath
  validateProfileValue        shared containment helpers
  deriveEffectivePermissions  optional fixed-path write helper
  containsSecretLikeLiteral
  |
  v
ai-profile.yaml (only)
```

The server has no other write endpoint. The save path should reuse or extract
the Phase 5 path-safety logic so containment, symlink rejection, and parent
directory checks do not fork. If it reuses `applyWritePlan`, the UI wrapper
must pass only a fixed `ai-profile.yaml` descriptor and must add the atomicity
guarantees required below if the shared helper does not yet provide them.

## Inputs

- `--root <path>` - repository root supplied at server launch
- fixed profile path `ai-profile.yaml`, resolved relative to `--root`
- `Origin` and `Host` request headers (used for same-origin enforcement)
- per-session CSRF token issued at first page load
- candidate profile object on `POST /api/profile/plan`
- `planToken` and CSRF token on `POST /api/profile/apply`

## Outputs

- the same on-disk `ai-profile.yaml` with new bytes when apply succeeds
- structured JSON responses for every endpoint (no HTML in error paths)
- no other files written or deleted

## Server Endpoint Surface

All endpoints are JSON. All bodies are UTF-8. The server must reject any
non-JSON content type on `POST` endpoints with `415 unsupported_media_type`.

### `GET /api/profile`

Response `200`:

```ts
type GetProfileResponse = {
  profile: AiProfile;
  safety: NormalizedAiProfileSafety;
  effectivePermissions: AiProfileEffectivePermissions;
  bytes: number; // on-disk byte length
  etag: string; // sha256 of on-disk bytes
  csrfToken: string; // refreshed every successful GET
  profilePath: "ai-profile.yaml";
};
```

Response `404 file_not_found` if `ai-profile.yaml` is missing. Missing profiles
are not created by Phase 8; users still run `agent-profile init --write`.
Response `422 invalid_profile` if the on-disk file fails schema validation.
The `422` body must include the `ProfileValidationIssue[]` envelope from
`@agent-profile/core` and may include `unsupportedEditing: true` when unknown
fields are the reason editing is blocked.

### `POST /api/profile/plan`

Request:

```ts
type PlanRequest = {
  candidate: AiProfile;
  baseEtag: string; // ETag from the most recent GET
};
```

Response `200`:

```ts
type PlanResponse = {
  diff: {
    format: "unified";
    text: string; // plain text, no ANSI, no HTML
    counts: { added: number; removed: number };
  };
  action: "change" | "unchanged";
  candidateBytes: number;
  planToken: string; // opaque, base64url, >=128 bits entropy
  expiresAt: string; // ISO 8601, <= 60s in the future
  etag: string; // ETag of the on-disk bytes used as base
};
```

Failure responses:

- `400 invalid_request` - body is not valid JSON or missing required fields
- `403 csrf_failed` - CSRF token missing/invalid
- `409 stale_profile` - on-disk ETag does not match `baseEtag`
- `422 invalid_profile` - schema validation failed; body carries the
  `ProfileValidationIssue[]` envelope
- `422 secret_like_value` - candidate fails secret-likeness check; body lists
  the offending JSON Pointer paths but never the matched value
- `422 unsupported_field` - request would drop or modify unknown YAML keys
  preserved from the on-disk file

### `POST /api/profile/apply`

Request:

```ts
type ApplyRequest = {
  planToken: string;
};
```

Response `200`:

```ts
type ApplyResponse = {
  action: "change" | "unchanged";
  bytes: number;
  etag: string; // new ETag of the just-written file
};
```

Failure responses:

- `403 csrf_failed`
- `409 stale_profile` - on-disk bytes changed since plan was issued
- `409 candidate_mismatch` - re-rendered candidate bytes do not match the
  candidate hash stored in the reviewed plan
- `410 plan_expired` - `planToken` unknown or past `expiresAt`
- `422 invalid_profile` / `422 secret_like_value` / `422 invalid_encoding` /
  `422 unsupported_field`
  if a re-validation at apply time fails (defense in depth - must not trust
  the plan alone)
- `500 write_failed` - write was attempted and failed; body carries no file
  contents

The server must not expose any other write-capable endpoint. There is no
generic `PUT /api/files/*`, no shell endpoint, no compile/init endpoint, and
no MCP installation endpoint.

## Local Server Trust Boundary

- The HTTP listener binds to `127.0.0.1` only. IPv6 binding requires `::1`
  with no IPv4 fallback. Binding to `0.0.0.0` or any external interface is a
  fatal startup error.
- Every state-changing request must have an `Origin` (or `Referer` if `Origin`
  is absent) whose host and port match the bound loopback host and port.
  Mismatched origin returns `403 origin_mismatch` before any handler runs.
- Read-only GET requests may omit both `Origin` and `Referer` for curl and
  server tooling compatibility, but if either header is present it must match
  the bound loopback host and port.
- Every state-changing endpoint (`POST`) requires a CSRF token issued by
  `GET /api/profile`. The token is bound to the single-page session and
  rotated on every `GET /api/profile` response.
- The server has no authentication beyond loopback + same-origin + CSRF. This
  is acceptable because the trust boundary is the user's local machine
  (`docs/security/trust-model.md`).
- The server must not log request bodies. It may log method, path, status,
  and duration.
- The server must not emit telemetry by default.

## Editable Field Surface

The form may edit only schema-defined fields covered by Phase 1. The mapping
from form section to JSON Pointer is fixed:

| Form section            | JSON Pointer scope                  | Control                      |
| ----------------------- | ----------------------------------- | ---------------------------- |
| Profile metadata        | `/profile/name`                     | text input, slug pattern     |
|                         | `/profile/description`              | textarea                     |
| Stack                   | `/stack/languages`                  | multi-select, slug pattern   |
|                         | `/stack/frameworks`                 | multi-select, slug pattern   |
|                         | `/stack/packageManagers`            | multi-select, slug pattern   |
|                         | `/stack/testing`                    | multi-select, slug pattern   |
| Clients                 | `/clients/tabnine/enabled`          | toggle                       |
|                         | `/clients/codex/enabled`            | toggle                       |
|                         | `/clients/claude/enabled`           | toggle                       |
| Safety                  | `/safety/mode`                      | enum select                  |
|                         | `/safety/requiresSandbox`           | toggle                       |
| Workflow                | `/workflow/sdd`                     | toggle                       |
|                         | `/workflow/tdd`                     | toggle                       |
|                         | `/workflow/finalReview`             | toggle                       |
| Permissions (overrides) | `/permissions/filesystem/read`      | enum select (allow/ask/deny) |
|                         | `/permissions/filesystem/write`     | enum select                  |
|                         | `/permissions/shell/run`            | enum select                  |
|                         | `/permissions/dependencies/install` | enum select                  |
|                         | `/permissions/network/external`     | enum select                  |
|                         | `/permissions/secrets/access`       | locked to `deny`             |
|                         | `/permissions/production/access`    | locked to `deny`             |

Future ADR 0005 capability blocks (`capabilities.*`) are not editable in this
phase. Because schema v1 rejects them as additional properties, their presence
puts the profile into the unsupported-editing state instead of a read-only
placeholder state.

## Unknown Field Handling

Phase 1 schema uses `additionalProperties: false`, so any unknown YAML key on
disk is already a schema validation error. Phase 8 does not relax this.

If the on-disk file contains unknown keys (e.g. an ADR-0008 capabilities block
not yet accepted into the runtime schema), the server must:

1. Return `422 invalid_profile` from `GET /api/profile` with the schema
   issues, and additionally surface a `unsupportedEditing: true` flag on the
   response so the UI shows a clear "this profile uses fields the editor does
   not yet understand; edit `ai-profile.yaml` directly" state.
2. Refuse `POST /api/profile/plan` with `422 unsupported_field` until the
   on-disk file passes validation.

This keeps the contract that "unknown YAML fields must be preserved or cause a
clear unsupported-editing state; they must not be silently dropped." The
editor never silently strips fields, because the schema itself blocks save
until the file is once again valid.

A future schema revision that introduces optional unknown fields can revisit
this by extending the editor's allowlist; until then, ambiguity is rejected.

## YAML Serialization Rules

- Use the `yaml` package (already a dependency of `@agent-profile/core`) with
  `lineWidth: 0` (no wrapping), `indent: 2`, double-quoted scalars only when
  required, sorted map keys following the schema declaration order (not
  alphabetical), and a single trailing newline.
- Serialization must be a pure function of the validated profile object. Two
  invocations on the same object must produce byte-identical output.
- Boolean values must render as `true`/`false`, not `yes`/`no`/`on`/`off`.
- Empty arrays must render as `[]`, not omitted.
- The exact serialization function lives in `@agent-profile/core` as
  `renderProfileYaml(profile: AiProfile): string` and is covered by golden
  tests.
- A round-trip test must enforce
  `parseProfileYaml(renderProfileYaml(p)).profile` deep-equals `p` for every
  fixture profile and for randomized profiles.
- Candidate YAML uses LF line endings and exactly one trailing newline,
  matching the compiler determinism contract. Phase 8 does not preserve CRLF as
  a platform-specific variant.

## Diff Rules

- Diff is computed server-side from the bytes of the existing
  `ai-profile.yaml` and the bytes returned by `renderProfileYaml(candidate)`.
  Missing profile files return `404 file_not_found`; Phase 8 does not diff
  against an empty create target.
- Format is unified diff with `0` lines of context expanded to the standard
  `3` lines of context. Use a vetted library (e.g. `diff` from npm) and pin
  the version in `package.json`.
- The diff text is plain ASCII. The UI must render it inside a `<pre>` with
  no `innerHTML` injection. Diff text must be HTML-escaped.
- The diff response includes byte counts, not file contents in any other
  field.
- For `action: "unchanged"` the UI must not present a Save button.

## Validation Pipeline

Validation has three layers, all backed by `@agent-profile/core`:

1. Schema validation via `validateProfileValue` (already exists). Failures
   produce `ProfileValidationIssue[]`. JSON Pointer paths map deterministically
   to form fields by the table in "Editable Field Surface".
2. Effective-permission derivation via `deriveEffectivePermissions`. The UI
   shows the effective row for the chosen safety mode and overrides, so the
   user can see the runtime effect before saving.
3. Secret-likeness check via `containsSecretLikeLiteral` applied to every
   string-valued field in the candidate profile. Any positive match is a
   `422 secret_like_value` error keyed by the offending JSON Pointer path.
   The matched value must never appear in the response body, the diff text,
   or any UI string.

Doctor-style advisory warnings (e.g. looser-than-preset overrides, autonomous
without sandbox) are surfaced through a separate read-only advisory list. They
are not blocking and do not gate save. Save is gated only by schema +
secret-likeness.

## Form-to-Issue Mapping

The UI maps `ProfileValidationIssue.path` to a form control by walking the
JSON Pointer and matching the table above. Issues with paths outside the
editable surface (e.g. unknown top-level keys) attach to a non-field "profile
header" error region and prevent save.

Issue messages are taken verbatim from the core validator and are already
free of secret literals (the `getActual` helper only describes types, not
values, for non-`required`/`additionalProperties` errors).

## Stale-Edit Detection

- ETag is `"sha256:" + hex(sha256(onDiskBytes))`. The same value is recorded
  on `GET`, `plan`, and `apply`.
- `plan` rejects with `409 stale_profile` if `baseEtag` does not match the
  current on-disk ETag.
- `apply` rejects with `409 stale_profile` if the on-disk ETag at apply time
  no longer matches the ETag the plan was issued against.
- ETag computation must run on the bytes the server is about to compare, not
  on a cached value. There is no caching layer.

## Atomic Write

Phase 5 write planning already contains parent-directory containment and
symlink rejection logic. Phase 8 should extract or reuse that logic and then
extend the fixed-profile write path, or add a sibling helper, to write
atomically:

1. Write `ai-profile.yaml.tmp-<random>` in the same directory as the target.
2. `fsync` the temp file.
3. `rename` the temp file over the target. On Windows the Node implementation
   relies on the platform replace semantics exposed by `fs.rename`; Phase 8
   does not add a native `MoveFileEx` binding.
4. `fsync` the parent directory on POSIX where supported.
5. On error at any step, attempt to remove the temp file; never leave the
   target partially written.

If the platform does not support atomic rename, the helper still uses temp +
rename, accepting that the rename is best-effort. The contract is "atomic
where the platform supports it."

## Path Containment

- The fixed profile path is not browser-provided. The helper joins only the
  literal filename `ai-profile.yaml` to the resolved real project root on every
  write request.
- The realpath of the target's existing parent directory must be contained
  within the realpath of `--root`.
- If the target file exists, its realpath must also be contained within the
  realpath of `--root`. A target that resolves outside the root is rejected.
- Phase 8 exports a narrow sibling helper from
  `packages/compiler/src/write-plan.ts`; the UI server does not copy path
  validation or accept request paths.
- Windows path separator and traversal tests remain on generic write-plan
  helpers where paths are accepted. The Phase 8 route test proves no request
  path parameter exists.

## Secret-Likeness in UI Inputs

- `containsSecretLikeLiteral` is the single source of truth and runs
  server-side before diff review and before apply.
- The browser runs lightweight local field checks for required values, slug
  syntax, and duplicate token values. It does not bundle the full core
  validator because the current `@agent-profile/core` entrypoint includes
  Node-oriented schema and file-loading dependencies.
- When the server detects a secret-like value, the UI shows a security warning
  and references the field by name, not by content. The textbox value remains
  the user's local input.
- Server-side rejection at `plan` and `apply` is authoritative.
- The server response must not echo the matched value in `actual`,
  `expected`, `message`, or any other field.

## Contracts

The four per-feature drafts already enumerate intent-level contracts. The
following are added at implementation depth:

- The UI server has exactly three profile API endpoints: `GET /api/profile`,
  `POST /api/profile/plan`, `POST /api/profile/apply`. There is no fourth.
- The server's only write target is `<root>/ai-profile.yaml`.
- Every `POST` requires a valid CSRF token bound to the issuing `GET`.
- Same-origin and loopback-bind checks are pre-handler middleware and apply
  to every endpoint, including `GET`.
- Diff-before-write uses a fixed-profile helper in `@agent-profile/compiler`.
  UI-only path-validation divergence is not allowed.
- Schema validation uses `@agent-profile/core.validateProfileValue` on the
  server. Browser checks are limited to simple field responsiveness and must not
  be treated as authoritative schema validation.
- YAML rendering is deterministic and lives in `@agent-profile/core`;
  fixtures and golden tests cover round-trip equality.
- Apply re-validates and re-reads on disk; it never trusts the plan alone.
- ETags are computed on the bytes used for comparison, never cached.
- The `planToken` lifetime is <= 60 seconds. Expired tokens are rejected.
- The server never reads or writes any file other than `<root>/ai-profile.yaml`.
  Reading sibling files is also forbidden, including for detecting `.env`.
- The server never executes shell commands and never installs dependencies.
- The server never resolves remote `$ref` values (already enforced by
  `compileProfileSchema`).

## Security Rules

- Bind to loopback only. Fail-closed if loopback bind fails.
- Reject mismatched `Origin`/`Host` before any handler runs.
- CSRF-protect every state-changing endpoint.
- Rate-limit `POST` endpoints to a small constant (e.g. 60/min) to bound
  pathological client bugs.
- Never log request bodies or response bodies.
- Never echo a secret-like matched value.
- Never read `.env` or `.env.*`.
- Never expose any path outside `--root`.
- Never accept `..` segments in any path field.
- Never follow symlinks outside `--root`.
- Never delete files. The apply path replaces; it does not delete.
- Never modify `.gitignore`.
- Never emit telemetry.

## Acceptance Criteria

- The UI can edit every editable field listed above and produce a candidate
  profile in memory without writing.
- Lightweight local validation runs on every edit and server-side schema
  validation runs before diff review and again before apply. Returned JSON
  Pointer paths produce per-field inline errors.
- Save is disabled while schema validation fails or any secret-likeness
  match is present.
- Save flow opens a unified-diff review and requires explicit confirmation.
- Confirmed save writes only `ai-profile.yaml` and only when the on-disk
  ETag still matches.
- Stale on-disk content (ETag mismatch) blocks save and prompts reload.
- Path traversal (`..`, absolute paths, drive-letter escapes on Windows) is
  rejected.
- Symlinks whose realpath escapes `--root` are rejected.
- Writes are atomic where the platform supports it; partial writes never
  remain after failure.
- The server has no generic write endpoint and no other state-changing
  endpoints.
- Repeated identical save flow produces byte-identical output.
- Doctor-style advisory warnings may render when already available, but Phase 8
  does not add a fourth doctor endpoint or gate saves on doctor output.
- Every error message is free of secret-literal content.
- The server fails closed if it cannot bind to loopback.
- Same-origin and CSRF checks reject crafted cross-origin requests in tests.

## Tests

### Unit (`@agent-profile/core`)

- `renderProfileYaml(profile)` is deterministic across two calls.
- `parseProfileYaml(renderProfileYaml(p)).profile` deep-equals `p` for the
  three Phase 1 fixtures and for at least one randomized profile.
- `containsSecretLikeLiteral` matches `SECRET_TOKEN_VALUE`, BEGIN PRIVATE
  KEY blocks, and `apiKey: <literal>` patterns; rejects environment-variable
  references like `$API_TOKEN`.

### Unit (`@agent-profile/compiler`)

- atomic write helper writes via temp + rename
- temp file is removed on simulated mid-write failure
- symlink with target outside root is rejected
- Windows-style backslash paths normalize through `safeOutputPath`

### Integration (UI server)

- `GET /api/profile` on minimal-valid fixture returns the parsed profile,
  effective permissions, byte length, and ETag matching the on-disk bytes.
- `GET /api/profile` with `additionalProperties` violation on disk returns
  `422` with `unsupportedEditing: true`.
- `POST /api/profile/plan` with stale `baseEtag` returns `409 stale_profile`.
- `POST /api/profile/plan` with secret-like literal returns `422
secret_like_value` and the response body contains no literal value.
- `POST /api/profile/plan` returns a `planToken` and a unified diff.
- `POST /api/profile/apply` with valid token writes the file atomically.
- `POST /api/profile/apply` after the on-disk file has been mutated returns
  `409 stale_profile` and does not write.
- `POST /api/profile/apply` rejects candidate-hash mismatch with
  `409 candidate_mismatch`.
- `POST /api/profile/apply` consumes the plan token; replay returns
  `410 plan_expired`.
- `POST /api/profile/apply` with expired token returns `410 plan_expired`.
- `plan` and `apply` reject oversized JSON before parsing.
- `plan` rejects raw NUL request bytes and escaped NUL candidate string values.
- Cross-origin request to any `POST` endpoint returns `403 origin_mismatch`.
- Missing CSRF token on `POST` returns `403 csrf_failed`.
- Server fails to start if loopback bind is unavailable.
- The server refuses non-JSON `Content-Type` on `POST` with `415`.
- Missing `ai-profile.yaml` returns `404 file_not_found` and no create plan.

### Integration (UI / SvelteKit)

- Form-to-pointer mapping is exercised: each editable field surfaces a
  schema error on its labeled control when made invalid.
- Save is disabled while schema validation fails.
- Save is disabled while a secret-likeness warning is active.
- Diff modal renders plain text via `<pre>` without HTML injection (DOM
  text-content equality test).
- Stale-edit response triggers a reload prompt without writing.
- Doctor-style advisory warnings render but do not block save.

### Property tests

- A round-trip on every fixture profile produces byte-identical output.
- Sorting of array fields in serialization is stable for any input order.

## Documentation Updates

- `docs/security/trust-model.md` - add a "Local UI server" section pinning
  loopback bind, same-origin enforcement, CSRF, and the explicit endpoint
  inventory.
- `docs/security/secret-handling.md` - note that the UI input layer applies
  `containsSecretLikeLiteral` and never echoes matched values.
- `docs/architecture/overview.md` - diagram the UI server's call path into
  `@agent-profile/core` and `@agent-profile/compiler`.
- Future `docs/ui/README.md` (does not yet exist) - add the editable field
  surface table and the save flow walkthrough.
- The four Phase 8 per-feature drafts - keep this implementation synthesis in
  sync with their `User Flow`, `Inputs`, `Outputs`, `Security Rules`, `Tests`,
  `Documentation Updates`, and `Final Review Checklist` sections.

## Implementation Decisions

- Browser validation uses lightweight local field checks. The authoritative
  schema, semantic, secret-like, and encoding checks run on the server at
  `plan` and `apply`. Directly bundling `@agent-profile/core` into the browser
  is deferred because the package entrypoint is Node-oriented today.
- `planToken` is stored server-side in an in-memory map keyed by a 128-bit
  random base64url token. Tokens expire in <= 60 seconds and are consumed on
  apply. This is appropriate for the local single-process MVP and avoids
  returning reviewed candidate bytes to the browser.
- Phase 8 introduces `writeProfileAtomic`, a fixed-profile helper in
  `@agent-profile/compiler`, instead of widening generic `applyWritePlan`.
  Generated artifact writes keep the Phase 5 path and profile source writes use
  the narrower helper.
- Doctor advisory display remains a read-only page concern for Phase 8. The
  profile editor may link users to doctor/compile after save, but it does not
  add a fourth live doctor endpoint or block saves on advisory findings.

## Final Review Checklist

- every contract maps to at least one acceptance criterion
- every acceptance criterion maps to at least one test
- every endpoint has explicit error codes and an explicit "must not echo
  secret values" guarantee
- the server has no generic write endpoint
- diff-before-write reuses Phase 5 path-safety logic, not a UI-only fork
- schema validation uses `@agent-profile/core`, not a parallel validator
- atomic write is described and tested on POSIX and Windows
- loopback bind, same-origin enforcement, and CSRF are pre-handler
  middleware, not per-endpoint conditionals
- secret-likeness check is applied on the wire at both `plan` and `apply`
  without echoing matched values
- stale-edit detection is enforced at both `plan` and `apply`
- the four per-feature drafts have been re-read after this document and
  any disagreement has been pushed back into the per-feature draft
