# I5: Personal activation and manual client guidance

## Parent spec or request

`docs/specs/phase-31/001-permission-posture-lifecycle.md`

## Intent summary

Activate high autonomy only through a separate developer-local decision and
never guess a client write surface that official documentation does not define.

## Behavior slice

After a successful shared posture update, the guide separately previews and
confirms a bounded Claude project-local activation patch. Codex and Tabnine
receive capability-accurate personal/session/manual instructions when no safe
project-local writer exists. The flow reinspects and reports completion.

## Non-goals

- Writing global Codex or Tabnine settings.
- Launching clients or performing approval actions.
- Owning unrelated local settings or hooks.

## Acceptance criteria

- Phase-31 acceptance criteria 5-7 and 10, limited to personal activation.
- Claude local patch changes only owned permission fields and preserves every
  unrelated byte/field semantically required by the chosen editor contract.
- Unsafe structure, symlink, unignored destination, conflict, and write failure
  refuse without partial change. An unignored destination changes neither the
  local file nor `.gitignore` and gives stable rerun/manual guidance.
- Codex/Tabnine instructions identify manual/session limits and never claim
  automatic completion.

## Expected RED proof

Trusted-local shared success has no separate activation stage; local patch and
manual mapping fixtures fail.

## Expected GREEN proof

Preview/confirm/idempotence/preservation/refusal/partial-failure rows pass and
the final mapping report distinguishes active, pending, manual, and unknown;
unignored-destination rows prove both the local file and `.gitignore` unchanged.

## Seam under test

`plan/applyPersonalActivation(mapping, localState, consent) -> report + bounded local effect`.

## Allowed mock boundary

Temporary filesystem and injected prompt only. No mocked editor/planner; client
process and network sentinels must fail if touched.

## Test command guidance

Run focused activation planner/editor tests, CLI flow tests, doctor readback,
then full tests, check, lint, verify:pack, and package dry-run.

## Likely file ownership

- Personal activation planner and safe JSON editor
- Ignore-status validation and refusal guidance; no `.gitignore` writer
- Client manual activation guidance catalog
- Local fixture matrix and readback tests

## Dependencies

`sequenced` after I2 and I4.

## Parallelism notes

Owns local activation editor and post-shared stage; coordinate doctor readback
with I6.

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

Use structural JSON editing with deterministic formatting policy and explicit
ownership; do not replace the whole local file or remove manual rules outside
the owned posture fields.

## Review expectations

Inspect byte/semantic preservation, ignore status, symlink checks, refusal
codes, idempotence, post-write verification, and absence of `.gitignore` or
global writes.
