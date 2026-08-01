# I15: Stop the artifact guard's per-machine exemption falling behind its emitter

## Parent spec or request

`docs/specs/phase-33/issues/014-self-applied-artifact-drift-guard.md`

Raised 2026-08-01 by the final clean-room change-risk review of I14, snapshot
`5db443e`. P3, `follow-up`, fingerprint
`state-classification|generated-region-ownership|scripts/verify-self-applied-artifacts.mjs|DECLARED_LOCAL_ARTIFACTS|incomplete-propagation`.

## Intent summary

`DECLARED_LOCAL_ARTIFACTS` in `scripts/verify-self-applied-artifacts.mjs` is a
hand-maintained frozen list of emitted artifacts that are deliberately
per-machine and therefore have no committed bytes to verify. It names
`.mcp.json` and `.codex/config.toml`. `.gitignore` declares a third emitted
artifact in the same group with the same rationale: `.codex/hooks.json`.

## Behavior slice

`.gitignore` lines 30-40 name four per-machine files under one comment, "local
runtime / per-machine": `.claude/settings.local.json`, `.mcp.json`,
`.codex/config.toml`, `.codex/hooks.json`. Of these, `.mcp.json`,
`.codex/config.toml` and `.codex/hooks.json` are compiler outputs;
`.claude/settings.local.json` is not.

`packages/compiler/src/compiler.ts` `case "codex-hooks"` emits
`.codex/hooks.json` whenever `getSelectedAdvisoryHookRoles(profile)` is
non-empty — a single `ai-profile.yaml` edit away.

The moment that edit lands, the guard sees an emitted artifact with no
committed bytes that is not in the exemption list, classifies it `missing`, and
`npm run check` goes red in CI and locally. The failure is fail-closed, not a
missed-drift route, so nothing unsafe passes. What makes it worth fixing is the
remediation text: `missing` prints "run `compile --write`, then commit the
result", and the path can never be committed, so the report actively misdirects
the fix.

Latent today, confirmed not active: `npm run verify:artifacts` currently
reports only `.codex/config.toml, .mcp.json` as unverifiable and exits 0.

The same shape will recur for the next per-machine output. I14's divergence 1
enumerated exactly this `.gitignore` group as its rationale and then applied it
to only one of the two remaining members, which is the evidence that a
hand-maintained list drifts from its emitter.

## Non-goals

- Reading `.gitignore` at run time to derive the exemption. The exemption must
  stay unwidenable by configuration; I14's review expectations are explicit
  that it "cannot be widened by configuration", and a file the change author
  controls is configuration.
- Changing artifact ownership, the lockfile format, or `compile` behaviour.
- Relaxing the failure. An emitted artifact with no committed bytes that is not
  declared per-machine must keep failing.

## Acceptance criteria

- Adding an advisory hook role to `ai-profile.yaml` does not make
  `npm run check` fail on `.codex/hooks.json`.
- The exemption still cannot be widened at run time, by environment, by CLI
  flag, or by an untracked file.
- A regression case covers an emitted per-machine artifact that the exemption
  does not name, and asserts the reported class and its remediation text are
  the ones an author can actually act on.
- If the exemption stays a hand-maintained constant, something mechanical fails
  when a compiler target starts emitting a per-machine output the constant does
  not name — the list must not be able to fall behind its emitter silently a
  second time.

## Expected RED proof

With an advisory hook role selected in `ai-profile.yaml`, `npm run check` fails
naming `.codex/hooks.json` as `missing` and prints commit-the-result
remediation for a gitignored path.

## Seam under test

`compiler target emission -> the guard's per-machine exemption`.

## Likely file ownership

- `scripts/verify-self-applied-artifacts.mjs`
- `scripts/verify-self-applied-artifacts.test.mjs`
- possibly a target-side declaration the guard can read from the compiler

## Dependencies

I14 merged.

## Contract impact

None to `compile`, ownership, or the lockfile. Changes which paths the I14 gate
treats as unverifiable.

## Security impact

None. The guard remains read-only and continues to report paths and hashes
rather than bytes.

## Review expectations

Confirm the exemption is still unwidenable by configuration. Confirm the new
mechanical check actually fires for an unnamed per-machine emission rather than
being asserted. Push back if the fix reads `.gitignore` at run time.
