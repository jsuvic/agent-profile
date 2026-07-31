# I8: Lockfile-owned generated outputs the repository does not track

## Parent spec or request

`docs/specs/phase-27/001-import-ownership-lockfile-conformance.md`, against the
ownership proof order in `docs/specs/phase-14/001-safe-import-ownership-and-regions.md`.

Raised 2026-07-31 from phase-33 work, not from a grill: a hand-edited
`.mcp.json` was one `compile --write --force` away from being replaced with no
way to recover it, and the same state turned out to hold for a second path.

## Intent summary

Ownership recorded in the lockfile should be verifiable by anyone who clones
the repository. A `generated-owned` entry for a path the repository
deliberately does not track records a hash nobody else can check and protects
a file version control cannot restore.

## Behavior slice

In this repository today, two lockfile outputs are `generated-owned`,
gitignored, and untracked:

- `.mcp.json`
- `.codex/config.toml`

`.gitignore` classifies both as "local runtime / per-machine" deliberately,
while `ai-profile.lock` — which is tracked — records a `sha256` for each. The
combination produces three problems that a single decision resolves:

1. On a fresh clone neither file exists, so the recorded hash describes bytes
   no other checkout has, and ownership cannot be proved by the proof order's
   first step.
2. A user may legitimately hand-author these files for their machine (the
   observed case: `.mcp.json` holding a local MCP server definition). Compile
   then refuses on hash mismatch, which is the guard working, but `--force`
   replaces the file — and because it is untracked, the previous content is
   unrecoverable by any git operation.
3. Doctor and import read lockfile ownership first, so both reason about paths
   whose recorded provenance can never be confirmed in a clean checkout.

Decide, and make the record and the ignore rules agree:

- **Track them** — the ignore entries are wrong, the outputs are ordinary
  generated artifacts, and per-machine content belongs in a local override
  file instead; or
- **Stop claiming ownership of them** — introduce (or reuse) an ownership
  value for locally-materialised generated outputs that the lockfile lists
  without hashing, so compile still writes them, drift checks skip them, and
  `--force` cannot silently destroy hand-authored local content.

This is a product decision about what the lockfile promises, not a defect with
one obviously correct fix. It is `human-gate`: run `grill-change` before
implementing, and do not pick a branch inside the implementation slice.

## Non-goals

- Changing the lockfile schema version or the region-ownership model.
- Changing which files the compiler generates.
- Auto-deleting, auto-adopting, or merging any existing local file.
- Weakening the existing hash-mismatch refusal; that guard is what surfaced
  the problem and must survive whichever branch is taken.

## Acceptance criteria

- A stated rule covers every generated output that the repository does not
  track, with no path left in the current contradictory state.
- Whichever branch is chosen, `compile --write --force` can no longer replace
  an untracked, hand-authored file whose content git cannot restore, without
  first stating exactly what will be lost.
- A fresh clone followed by `compile --write` reaches a state where
  `compile --dry-run` reports no drift for these paths.
- Doctor's report for these paths matches the chosen rule instead of reporting
  provenance it cannot verify.
- A test enumerates lockfile outputs and asserts none is simultaneously
  `generated-owned`, gitignored, and untracked — so this state cannot return
  silently for a future path.

## Expected RED proof

The enumeration test fails against the current repository, naming `.mcp.json`
and `.codex/config.toml`.

## Expected GREEN proof

The enumeration test passes, the fresh-clone compile round-trip reports no
drift for these paths, and the force-overwrite path is covered by a test that
proves a hand-authored untracked file is not silently destroyed.

## Seam under test

`lockfile ownership record -> compile write/refusal decision`, and
`lockfile ownership record -> doctor report`, for paths outside version
control.

## Allowed mock boundary

Filesystem fixtures under the OS temp directory may stand in for a fresh
clone. Do not mock the lockfile validator, the ownership classifier, or the
write-refusal decision.

## Test command guidance

Run the CLI compile and doctor tests, then the compiler lockfile tests, before
the broader suites.

## Likely file ownership

- `.gitignore` (present a diff and get approval before changing it)
- `apps/cli/src/compile-plan.ts` ownership classification and write refusal
- `packages/compiler/src` lockfile output construction
- Doctor's ownership reporting
- A new enumeration test plus compile/doctor fixtures

## Dependencies

`human-gate` on a `grill-change` decision between the two branches. No code
dependency on phase-33.

## Parallelism notes

Overlaps the compile write path that phase-33's scoped-target lockfile work
touched. Rebase onto that rather than editing the same lines concurrently.

## Contract impact

Changes what a `generated-owned` lockfile entry promises, or changes which
paths the repository tracks. Either is a durable contract statement and is why
this needs a grill rather than a direct fix.

## Security impact

Positive. The observed case was a local MCP server definition — exactly the
kind of per-machine configuration that should never be silently replaced by a
generated default. No secret is read or written by this change.

## Documentation impact

The chosen rule belongs in the phase-27 conformance spec and in whatever
documents the ignore policy; the ADR record should say why the previous state
was contradictory.

## Review expectations

Try a fresh clone with no local files, a hand-edited local file with and
without `--force`, and a machine where only one of the two paths exists.
Confirm the hash-mismatch refusal still fires, that `--force` cannot destroy
untracked hand-authored content without stating what it replaces, and that the
enumeration test fails when a new generated output is added to `.gitignore`.
