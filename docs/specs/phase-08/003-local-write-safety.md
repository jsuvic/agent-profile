# Spec: Local Write Safety

## Status

Implemented. Landed with the re-rooted initial import `167f313` (2026-05-12).

## Problem

Adding browser writes expands the product security boundary. The local UI
server receives requests from a browser process and must enforce stricter
limits than the UI itself. No request may become a generic file-write primitive
or escape the configured project root.

## Goal

Define the server-side write safety layer for Phase 8 profile saves. The layer
allows writing exactly one file, `ai-profile.yaml`, after validation and diff
confirmation. It rejects traversal, symlink, stale, oversized, invalid, and
secret-like write attempts.

## Non-Goals

- writing generated target files
- writing `ai-profile.lock`
- writing global user config
- writing outside the configured project root
- editing `.gitignore`, `.mcp.json`, package files, client config, or skill
  files
- deleting, renaming, chmodding, or changing ownership of files
- high-assurance protection against every possible time-of-check/time-of-use
  race

## User Flow

1. The user reviews a server-generated diff for `ai-profile.yaml`.
2. The user explicitly confirms Write `ai-profile.yaml`.
3. The browser sends only the CSRF token and opaque `planToken`; it does not
   submit a path.
4. The server consumes the plan token and re-reads `<project-root>/ai-profile.yaml`.
5. The server rejects the write if the current ETag differs from the ETag stored
   in the plan.
6. The server re-parses and re-validates the stored candidate YAML, re-checks
   secret-like and invalid-encoding rules, and verifies the candidate hash still
   matches the reviewed plan.
7. The fixed-profile helper rejects missing profiles, existing profile symlinks,
   traversal, and containment failures.
8. The helper writes a server-named temporary file in the project root, fsyncs
   it, renames it over `ai-profile.yaml`, best-effort fsyncs the parent
   directory where supported, reads the final bytes, and verifies the final
   sha256.
9. The UI receives the new ETag and reloads local profile state before another
   edit can begin.

## Inputs

- configured project root from the local UI server
- fixed profile filename `ai-profile.yaml`
- candidate bytes approved by `002-ui-diff-before-write.md`
- reviewed base hash and candidate hash

## Outputs

- successful profile write result with final sha256 hash
- deterministic error responses for containment, symlink, stale, validation,
  size, and filesystem failures

## Path Contract

The Phase 8 UI save path is fixed:

```text
<project-root>/ai-profile.yaml
```

The browser must not submit a path. If an internal helper accepts a path for
testability, the public route must still pass only the fixed profile filename.

Server path resolution must:

1. resolve the configured project root to an absolute path
2. resolve the real project root when it exists
3. join only the fixed filename `ai-profile.yaml`
4. verify the target parent is the real project root
5. reject any target whose existing real path escapes the real project root
6. reject existing `ai-profile.yaml` symlinks for Phase 8
7. reject traversal, absolute paths, drive-qualified paths, UNC paths, and
   backslash-separated submitted paths in any test-only helper

Rejecting all existing profile symlinks is stricter than only rejecting symlink
escapes. This keeps the browser write path simple and avoids writing through a
link whose target may change during review.

## Endpoint Contract

The UI server may expose SvelteKit actions or internal API routes for preview
and confirm, but no endpoint may accept arbitrary file content plus arbitrary
path.

Allowed request shapes:

- structured profile edit request
- opaque apply request containing a server-issued `planToken`

Required server-side checks:

- same-origin and CSRF enforcement before mutation planning
- request size cap before parsing
- valid UTF-8 JSON decode and raw NUL byte rejection
- YAML parse through `parseProfileYaml`
- schema validation through `@agent-profile/core`
- secret-like literal rejection
- stale hash check against current disk bytes
- candidate hash match against the reviewed server-side plan
- path containment check
- fixed-path write only after explicit confirmation

## Size And Encoding Limits

- Candidate request payload for profile content must be capped at 128 KiB.
- `plan` and `apply` request bodies must be capped at 128 KiB before JSON
  parsing.
- Candidate bytes must be valid UTF-8 text after deterministic serialization.
- Written bytes must end with a single newline.
- The server must reject raw NUL bytes in request bodies and escaped NUL
  characters in editable candidate string fields.

The 128 KiB cap is intentionally far above expected profile size and far below
a useful arbitrary file upload size.

## Atomicity Contract

Writes should be atomic where the platform supports it:

1. create a uniquely named temporary file in the project root
2. write the exact candidate bytes to that temp file
3. fsync the temp file
4. rename the temp file over `ai-profile.yaml`
5. best-effort fsync the parent directory on POSIX where supported
6. best-effort cleanup the temp file on failure
7. read back the final file and verify its sha256 matches `candidateHash`

The temp filename must be controlled by the server, not the browser. It must
not be user-provided and must not escape the root.

If the platform cannot provide an atomic replacement, the implementation may
fall back to best-effort rename semantics, but it must document the fallback
and keep the stale-hash checks before writing. The Node implementation uses
temp-file plus `rename`; on Windows this relies on the platform's replace
semantics and does not attempt a custom native `MoveFileEx` binding.

## Contracts

- Writes are limited to the configured profile path.
- Missing profiles are not created by Phase 8; use `agent-profile init`.
- Existing profile symlinks are rejected.
- Symlink escapes are rejected.
- Traversal attempts are rejected.
- Writes are exact bytes after deterministic serialization.
- The UI server must not expose a generic file-write endpoint.
- The UI server must not call CLI commands to perform the write.
- If the UI server reuses a shared write helper, the wrapper must pass only the
  fixed profile path and must not accept caller-provided write descriptors.
- The UI server must not modify generated artifacts or lockfiles as a side
  effect.

## Security Rules

- Do not read secret files.
- Do not write literal secret-like values.
- Do not upload profile or source contents.
- Do not execute shell commands.
- Do not install dependencies.
- Do not follow symlink escapes.
- Do not write outside the configured project root.
- Do not delete files.
- Do not chmod or change ownership.
- Do not bind write-capable local UI routes to a non-loopback interface by
  default.
- Do not enable CORS for write-capable routes.
- Reject cross-origin state-changing requests and missing CSRF tokens before
  reading candidate content.
- Do not log request bodies or candidate profile content by default.

## Acceptance Criteria

- Attempted traversal writes fail.
- POSIX-style `../ai-profile.yaml` and Windows-style `..\\ai-profile.yaml`
  test inputs fail in helper tests where paths are accepted.
- Absolute paths, drive-qualified paths, and UNC paths fail in helper tests.
- Existing `ai-profile.yaml` symlink fails before write.
- Symlink escape paths fail before write.
- The save endpoint writes only `ai-profile.yaml`.
- The save endpoints accept only structured profile edit requests at preview
  time and opaque server-issued plan tokens at apply time.
- No endpoint can write arbitrary paths.
- Cross-origin and CSRF-missing save requests fail before write planning.
- Successful write reports the new profile hash.
- Failed writes leave generated artifacts and `ai-profile.lock` unchanged.

## Tests

- fixed profile path resolution under root
- traversal path rejection
- Windows separator path rejection
- absolute and drive-qualified path rejection
- existing target symlink rejection
- symlink escape rejection
- missing profile returns a non-create error
- oversized payload rejection
- invalid UTF-8 or NUL byte rejection
- atomic write success and final hash verification
- temp file cleanup on simulated write failure where practical
- route test proving no request path parameter is accepted
- cross-origin save request rejection
- CSRF-missing save request rejection

## Documentation Updates

- `docs/security/trust-model.md` documents browser profile write containment.
- `apps/web/README.md` documents that the UI can write only the source profile
  and never generated artifacts.

## Final Review Checklist

- no generic write endpoint
- fixed `ai-profile.yaml` path only
- symlink writes rejected
- stale checks happen before write
- final bytes hash is verified
- no generated artifacts are touched
