# I5: Personal activation and manual client guidance

## Parent spec or request

`docs/specs/phase-31/001-permission-posture-lifecycle.md`

## Intent summary

Activate high autonomy only through a separate developer-local decision and
never guess a client write surface that official documentation does not define.

## Behavior slice

After a successful shared posture update, one post-shared orchestration stage
separately previews and confirms a bounded Claude project-local activation
patch. The slice owns the narrowly scoped ignore validation,
format-preserving JSON field edit, and atomic ignored-local replacement needed
to make that activation safe. Codex and Tabnine receive capability-accurate
personal/session/manual instructions when no safe project-local writer exists.
The flow reinspects and reports completion or partial activation failure
without rolling back valid shared intent.

## Non-goals

- Writing global Codex or Tabnine settings.
- Launching clients or performing approval actions.
- Owning unrelated local settings or hooks.
- Building a general-purpose JSON editing or arbitrary local-file framework.
- Changing I4 shared-apply semantics, Doctor severity behavior from I6, or
  published integration/documentation owned by I8.

## Acceptance criteria

- Phase-31 acceptance criteria 5-7 and 10, limited to personal activation.
- The personal activation stage is reachable only after successful shared
  apply. Shared preview, refusal, cancel, or write failure triggers no personal
  prompt or local effect.
- Claude activation has its own preview and confirmation after shared success.
  Decline or cancel leaves the local destination byte-identical.
- Claude local patch changes only owned permission fields and preserves every
  unrelated field and every byte outside the minimum structural edit span. The
  editor preserves the existing BOM, newline style, indentation, key order, and
  trailing-newline policy; invalid JSON, duplicate owned keys, or a non-object
  owned parent is unsafe and refuses.
- Ignore status is derived from repository state, not accepted as a
  caller-supplied assertion. Preview and immediate pre-commit validation must
  prove the destination and every filesystem artifact used by the atomic
  replacement are ignored; disagreement or uncertainty refuses.
- Destination or ancestor symlinks, unsafe structure, unignored paths, stale
  preview conflict, and write or readback failure refuse without partial local
  change. The original local bytes survive every failed activation attempt.
- An ignore refusal changes neither the local file nor `.gitignore` and gives
  stable rerun/manual guidance. Personal activation never writes `.gitignore`.
- A personal activation refusal or failure does not roll back the already
  successful shared posture update and is reported as a partial activation
  result.
- Codex and Tabnine guidance consumes I2's versioned mapping rows, preserves
  manual versus unsupported/unknown distinctions and provenance, identifies
  Codex session/profile limits plus Tabnine per-tool IDE and CLI limits, and
  never claims automatic completion.
- Reinspection after apply drives a final report in one of the closed states
  `active`, `pending`, `manual`, `unsupported`, or `unknown`; a write
  attempt alone is never reported as active.

## Expected RED proof

At the configure orchestration seam, trusted-local shared success has no
separate activation preview/consent/readback stage. The focused test also fails
when it requires repository-derived ignore proof, a format-preserving owned
field edit, atomic failure restoration, and capability-accurate manual rows.

## Expected GREEN proof

One focused configure matrix proves shared-success ordering, separate
preview/confirm, apply/readback, idempotence, byte preservation, ignore and
symlink refusal, stale conflict, atomic failure restoration, and partial
activation reporting. The final mapping report distinguishes active, pending,
manual, unsupported, and unknown; unignored-path rows prove both the local file
and `.gitignore` unchanged. Client-process and network sentinels remain
untouched.

## Seam under test

`runPostSharedPersonalActivation(sharedResult, mappingReport, repositoryState, consent) -> report + bounded local effect`.

This is one orchestration seam and one observable outcome. Ignore evaluation,
the owned-field editor, and atomic replacement are internal production
collaborators exercised through it, not separately shippable slices.

## Allowed mock boundary

Temporary filesystem, injected prompt, and filesystem fault injection at the
unmanaged I/O boundary only. Do not mock the activation orchestrator, ignore
evaluator, editor, or planner. Client-process and network sentinels must fail if
touched.

## Test command guidance

Run the focused post-shared configure matrix RED then GREEN. Run focused
activation safety tests, existing I2 mapping tests, I4 configure tests, and
Doctor readback compatibility, then full tests, goldens, check, lint,
verify:pack, and package dry-run.

## Likely file ownership

- Post-shared configure orchestration and prompt/report adapter
- Personal activation planner and narrowly scoped owned-field JSON editor
- Repository-derived ignore evaluation at preview and pre-commit
- Atomic ignored-local replacement with restoration/readback verification
- I2-backed client manual activation guidance
- Local fixture matrix, sentinels, and readback tests

## Dependencies

`ready`; I2 and I4 are done.

## Parallelism notes

Owns the complete post-shared personal activation outcome in one PR. Coordinate
Doctor readback fixtures with I6, but do not implement I6 findings or severity.

## Architecture rescue within the slice

- Current friction: atomic whole-file planning, ignore reporting, and JSON
  rendering exist behind incompatible or private seams, so composing them
  directly would trust caller state or alter unrelated local bytes.
- Interface: keep one personal-activation boundary that derives repository
  safety evidence, produces the minimal owned-field edit, commits it atomically,
  and reinspects the result.
- Locality and leverage: keep helpers narrowly owned by personal activation;
  extract a deeper shared primitive only when an existing production caller can
  adopt the same exact contract without weakening it.
- Test improvement: the high configure seam proves ordering and user outcome,
  while temporary-filesystem safety rows prove byte preservation and rollback.
- ADR/spec fit: this realizes ADR 0019 and the existing Phase-31 acceptance
  criteria; it does not change their shared-versus-personal decision.
- Dependency state: included prerequisite work inside I5, not a separate
  horizontal issue.

## Contract impact

Introduces one explicitly confirmed project-local activation writer for Claude.
No global configuration writer is authorized.

## Security impact

Ignored local file only, permission fields only, no symlinks, no secrets,
atomic write, unrelated-field preservation, no `.gitignore` write, no client
invocation.

## Documentation impact

Personal activation ownership, client-by-client manual steps, recovery and
reinspection guidance.

## Implementation context

Use a structural edit that changes or inserts only the documented owned
permission field; do not parse and reserialize the whole local file. Reuse
existing atomic machinery only where its observable contract proves original
byte restoration and ignored transient paths; otherwise introduce the minimum
personal-activation-specific primitive. Revalidate repository ignore evidence
immediately before commit. Do not replace unrelated local content or remove
manual rules outside the owned posture fields.

## Review expectations

Inspect post-shared ordering, separate consent, byte/semantic preservation,
preview-versus-precommit ignore evidence, destination and ancestor symlink
checks, atomic restoration, refusal codes, idempotence, post-write
verification, mapping provenance, and absence of `.gitignore`, global, client,
or network effects.
