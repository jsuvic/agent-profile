# I14: Fail the build when this repository's own generated artifacts go stale

## Parent spec or request

`docs/specs/phase-33/001-change-risk-review-assurance.md`

Raised 2026-07-31. Framed as an EARLY MECHANICAL GUARD under the promoted-rule
lifecycle's guard-preference clause — "a mechanical or interface-level guard
may be introduced before the third occurrence when it is clearly practical and
proportionate" — and NOT as a validated second-occurrence promotion outcome.

That distinction is deliberate. The parent contract requires promotion to count
distinct reviewed changes with validated findings and to read persisted record
values, never re-adjudicating prose
(`docs/specs/phase-33/001-change-risk-review-assurance.md`, recurrence
classification). PR #140 has no `review-learning/v1` record, so its occurrence
is not auditable and cannot authorize a threshold. Claiming it as a second
occurrence would have promotion act on an assertion the contract forbids it to
read. The guard stands on its own merits instead: the check is exact, no model
judgement is part of the safe decision, and it would have caught both observed
instances. Nothing here depends on the count.

## Intent summary

This repository self-applies its own compiler output. When a change updates the
golden fixtures but not the checked-in root artifacts, the fix exists and is
not in effect for the agent actually running — and nothing fails.

## Behavior slice

Occurrence history, same mechanism both times:

1. PR #140: the reviewer was half-emitted; the checked-in artifacts did not
   carry what the change had implemented. Reviews there were ad hoc with no
   orchestration behind them, so no `review-learning/v1` record exists for it.
   This occurrence is an OWNER DETERMINATION, recorded here and in the I8/I9
   record, and is not derivable from `docs/review-learning/`.

   It is explicitly NOT owed to I5: that brief is scoped to PRs #125 and
   #127-#133, and expanding beyond those eight is one of its non-goals, so I5
   neither owns nor will supply this occurrence. Because no record exists, this
   instance is context for why the guard is worth building and carries NO
   promotion authority. I5 must not be cited as its source, and must not
   double-count #140 if its scope is ever widened.

2. Phase-33 I8/I9: the change advanced both golden fixture trees but left
   `.claude/agents/change-risk-reviewer.md`, `.codex/agents/change-risk-reviewer.toml`
   and the root `ai-profile.lock` on their pre-change bytes. The reviewer that
   found this was itself running the stale prompt. `npm run check`, `npm test`
   and `npm run verify:pack` all passed with the artifacts stale.

Both instances are recorded above as history, not as a promotion count. The
guard is elected under the guard-preference clause because it is clearly
practical and proportionate: the check is exact and no model judgement is part
of the safe decision. If PR #140 is ever normalized into a record, the count
becomes auditable and the promotion framing can be revisited; the guard does
not wait on that.

The guard:

- Assert that a dry-run compile of this repository reports zero `create` and
  zero `change` for its own artifacts.
- Compare the COMMITTED bytes, not the working copy. The two files that differ
  locally are not equivalent and must not be exempted alike:
  - `.claude/settings.json` is tracked, emitted by the `claude-settings`
    target, and recorded `generated-owned` in `ai-profile.lock`. Exempting it
    would let a stale generated-owned artifact pass the very gate this brief
    adds. The guard verifies the committed artifact; an owner's working-copy
    override is tolerated separately and never rewritten.
  - `.mcp.json` is gitignored and untracked, so there is no committed artifact
    to verify. It is out of scope here; its contradictory ownership is
    phase-27 I8.
- The guard must never rewrite either file.
- The guard must not write. A dry run that mutates the working tree would be a
  worse defect than the one it detects.

It would have caught both occurrences.

## Non-goals

- Auto-regenerating artifacts in CI or in a hook. The guard reports; a human or
  an explicit step regenerates.
- Widening the exclusion beyond the two named local files.
- Changing artifact ownership, the lockfile format, or `compile` behaviour.

## Acceptance criteria

- A check fails when any generated-owned artifact of this repository diverges
  from what the current compiler emits, with the diverging paths named.
- The check also fails on an ORPHANED artifact: a generated-owned path that is
  checked in but no longer emitted. A dry run reports only `create`, `change`
  and `unchanged` over the current `compileResult.files`, and compile never
  deletes orphans (phase-05/001), so zero create and zero change does not
  imply the checked-in set is correct. A forgotten `.claude` or `.codex` file
  stays on disk and is still read at runtime. Compare the committed
  generated-artifact path set against the emitted set, in both directions.
- The check passes on a tree whose artifacts are current, including when the
  two excluded local files differ.
- The check performs no write; proven by a filesystem sentinel rather than by
  inspection.
- It runs as part of an existing gate (`npm run check` or an adjacent script),
  so a stale artifact cannot reach CI green.
- A regression case covers the observed shape: fixtures updated, root artifacts
  not.

## Expected RED proof

Reverting the root reviewer artifacts to their pre-I8/I9 bytes while leaving
the fixtures current fails the new check and names both artifact paths. That
exact state passed every gate before this brief.

## Seam under test

`compiler output -> this repository's checked-in generated-owned artifacts`.

## Likely file ownership

- A script under `scripts/`, wired into the `check` pipeline
- Its focused test

## Dependencies

None blocking.

## Contract impact

Adds a gate. No change to `compile`, artifact ownership, or the lockfile.

## Security impact

The guard must remain read-only and must never print file contents that could
carry secret-shaped values from a local config; report paths and hashes, not
bytes.

## Implementation divergences (disclosed, owner ratification required)

Recorded during implementation on 2026-08-01. Each is a matter of fact the
brief could not have known, not a reinterpretation of its intent. None is
ratified yet.

1. There are THREE generated-owned artifacts with unusual local status, not
   two. `.codex/config.toml` is declared per-machine in `.gitignore` on the
   same line-group as `.mcp.json` ("local runtime / per-machine") and is
   likewise untracked, so it has no committed bytes to verify. Hard-coding
   only `.mcp.json` would leave the gate permanently red. The implementation
   uses a frozen constant `DECLARED_LOCAL_ARTIFACTS = [".mcp.json",
   ".codex/config.toml"]`; any other emitted artifact missing from the commit
   is a hard failure, and the list cannot be widened at run time. This is the
   brief's stated rationale applied consistently, but it is a literal widening
   of the non-goal "widening the exclusion beyond the two named local files"
   and needs owner sign-off. `.claude/settings.json` remains verified at HEAD
   and is explicitly NOT exempt.

2. Occurrence #2 as described is not reproducible from history. `6c7998b`
   (#146) advanced `.claude/agents/change-risk-reviewer.md`,
   `.codex/agents/change-risk-reviewer.toml` and `ai-profile.lock` in the same
   commit as the compiler change, and `c415f8c` passes the new guard. During
   implementation the same drift was observed and traced to a STALE
   `apps/cli/dist`, not to stale artifacts. That is a distinct and more
   dangerous failure mode than the one the brief describes, because it makes
   the guard itself lie in both directions, so the guard now builds the CLI
   from source before reading it. The regression case reproduces the observed
   SHAPE deterministically rather than restoring pinned commit bytes, which
   also keeps it runnable on CI's shallow clone.

3. Workflow consequence, accepted rather than worked around: because the guard
   compares committed bytes, `npm run check` is red from the moment a template
   changes until the regenerated artifacts are committed -- staging them is not
   enough. This follows directly from "Compare the COMMITTED bytes, not the
   working copy" and is not otherwise avoidable.

4. The guard refreshes gitignored build output (`dist/`, `*.tsbuildinfo`) via
   `tsc -b`. It writes no tracked file and no generated artifact; the sentinel
   test asserts the property in exactly that narrower form.

## Review expectations

Confirm the no-write property is proven by sentinel and not asserted. Confirm
the exclusion covers exactly the two local files and cannot be widened by
configuration. Push back if the guard regenerates rather than reports.
