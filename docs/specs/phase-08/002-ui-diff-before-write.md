# Spec: UI Diff Before Write

## Status

Draft for implementation review.

## Problem

Browser writes require the same safety posture as Phase 5 CLI writes. A user
must see the exact `ai-profile.yaml` byte changes before the local UI modifies
disk, and the server must detect if another process changed the file after the
form was loaded.

## Goal

Add a profile diff review and confirmation flow between form editing and disk
write. The flow compares the current on-disk profile bytes with the candidate
bytes and blocks stale, invalid, unchanged, or unsafe writes.

## Non-Goals

- generated artifact write flows
- `ai-profile.lock` writes
- arbitrary file editing
- hunk selection or partial apply
- merge conflict resolution
- external diff tools
- standalone CLI diff command

## User Flow

1. The user edits `/profile` and chooses Review diff.
2. The client sends the candidate profile draft and the base profile hash that
   was loaded with the form.
3. The server re-reads `ai-profile.yaml` from disk.
4. If the current disk hash differs from the base hash, the server returns a
   stale-file response. No diff write confirmation is available.
5. If the candidate is invalid, secret-like, or unchanged from disk, the server
   returns a blocking response.
6. If the candidate is valid and changed, the UI renders a plain-text diff for
   `ai-profile.yaml`.
7. The user explicitly confirms Write `ai-profile.yaml`.
8. The server consumes the opaque plan token, re-reads `ai-profile.yaml` again,
   re-validates the server-stored candidate, re-checks the candidate hash, and
   writes only if the disk hash still matches the reviewed base hash.
9. The UI reports the new profile hash and asks the user to run CLI compile or
   doctor as the next step.

## Inputs

- candidate profile draft or candidate YAML produced by
  `001-profile-form-editing.md`
- base profile sha256 hash from the form load
- current on-disk `ai-profile.yaml` bytes
- explicit confirmation event from the user

## Outputs

- a diff review model for `ai-profile.yaml`
- stale-file, invalid-candidate, unchanged, or security-blocked responses
- on successful confirmation, a write result containing the new profile hash

## Diff Model

The implementation renders a unified diff string with `diff@^9` rather than a
custom LCS implementation. The model must preserve these facts:

```ts
type ProfileDiffReview = {
  path: "ai-profile.yaml";
  baseHash: string;
  candidateHash: string;
  changed: boolean;
  oldBytes: number;
  newBytes: number;
  diffText: string;
};
```

If a structured hunk model is used instead of `diffText`, the UI must still
render the diff as plain text and keep the same base/candidate hash contract.

The diff must compare the exact bytes that are currently on disk at preview
time to the exact candidate bytes that would be written. It must not diff
against stale loader data or normalized objects.

## Confirmation Contract

The preview response includes:

- the reviewed `baseHash`
- the reviewed `candidateHash`
- the candidate YAML stored server-side
- an opaque `planToken` with no more than a 60 second lifetime

The confirm request must include:

- the `planToken`
- an explicit confirmation action

The server must:

1. re-read `ai-profile.yaml`
2. reject if the current hash does not match the base hash stored in the plan
3. re-parse candidate bytes stored in the plan
4. reject if the rebuilt candidate hash does not match the candidate hash
   stored in the plan
5. run schema validation and secret-like literal checks again
6. write through the safety layer in `003-local-write-safety.md`
7. read back or otherwise verify the resulting bytes hash to report success

The server must not trust client-side disabled buttons, client-side validation,
or hidden form fields as the only enforcement point.

The chosen implementation stores plan tokens in process memory and consumes
them on apply. This is the right tradeoff for the MVP because the UI server is
single-process and local-only; it avoids sending reviewed candidate bytes back
from the browser and keeps the token opaque.

## Contracts

- The diff must compare current on-disk profile bytes with candidate bytes.
- The server must re-read the profile before creating the preview.
- The server must re-read the profile before applying the confirmed write.
- The user must explicitly confirm the write after seeing the diff.
- Unchanged candidates must not create a write.
- Invalid candidates must not create a diff confirmation.
- Stale on-disk content must block both preview and confirmation.
- The diff view must render text as plain text.
- The route must not expose before/after bytes for any path except
  `ai-profile.yaml`.
- The flow must not call `compile --write` or any generated artifact write
  path. If it reuses a shared write helper such as `applyWritePlan`, that use
  must be server-only, fixed to `ai-profile.yaml`, and wrapped by
  `003-local-write-safety.md`.

## Security Rules

- Do not render diff text as HTML.
- Do not include literal secret-like values in validation or security messages.
- If the candidate or current profile contains secret-like content, block the
  write review and show a redacted security message.
- Do not accept an arbitrary path in preview or confirm requests.
- Require same-origin and CSRF protection for state-changing preview and
  confirm requests, using SvelteKit built-ins or explicit server checks.
- Do not upload profile contents or source code.
- Do not write generated artifacts or lockfiles.

## Acceptance Criteria

- Profile save opens a diff review before any disk write.
- The diff is for `ai-profile.yaml` only.
- The diff is generated from current disk bytes and candidate bytes.
- Stale on-disk content at preview time blocks the flow and asks the user to
  reload.
- Stale on-disk content at confirmation time blocks the write and asks the user
  to reload.
- Confirmed saves write only `ai-profile.yaml`.
- The UI reports a no-op when candidate bytes equal current disk bytes.
- Candidate validation failure disables confirmation.
- Diff text escapes `<`, `>`, `&`, quotes, and other user-controlled text by
  rendering as text nodes.

## Tests

- unchanged candidate returns a no-op state
- changed candidate returns a diff review
- stale disk hash at preview blocks review
- stale disk hash at confirmation blocks write
- invalid candidate blocks review
- secret-like candidate blocks review without echoing the literal
- candidate hash mismatch on confirm blocks write
- cross-origin or CSRF-missing confirm request blocks write
- confirmed valid write changes only `ai-profile.yaml`
- generated artifacts and `ai-profile.lock` remain unchanged after profile save
- diff rendering test covers HTML-like profile text as escaped text

## Documentation Updates

- `apps/web/README.md` documents the profile diff review flow.
- Root `README.md` states that browser profile writes are diff-gated.
- `docs/security/trust-model.md` adds browser profile saves to the write-safety
  boundary after Phase 8 implementation.

## Final Review Checklist

- current disk bytes are re-read for preview
- current disk bytes are re-read for confirmation
- user confirmation is explicit
- stale edits are blocked
- no generated artifact write path is reachable
- diff rendering is plain text
