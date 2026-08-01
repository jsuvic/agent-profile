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
- Widening the exclusion beyond the named local files. AMENDED by ratified
  divergence 1: the set is three, not two. `.codex/config.toml` is declared
  per-machine on the same `.gitignore` line-group as `.mcp.json` and likewise
  has no committed bytes. The non-goal's intent stands unchanged -- the list is
  a frozen constant and cannot be widened at run time or by configuration.
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
brief could not have known, not a reinterpretation of its intent. All five
were ratified on 2026-08-01; see `Ratification` below for the verdicts and
the reasoning, which is part of this contract.

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

5. The orphan direction is WIDER than this brief's wording, and deliberately.
   The criterion scopes it to "a generated-owned path that is checked in but no
   longer emitted", but that set is not always computable: when a commit stops
   emitting a path it also regenerates the lockfile that recorded it, so
   nothing in the tree still attests the path was ever generated-owned.
   Disabling a client does this to a whole directory in one profile edit. Two
   successive attempts to derive the sweep units from what is currently emitted
   were both proven blind against exactly that shape.

   The guard therefore sweeps a DECLARED closed list of compiler-owned roots,
   `GENERATED_ARTIFACT_ROOTS = [".agents", ".claude", ".codex"]`, independent of
   emission, and treats a committed file under any of them that the compiler
   does not emit as a failure. Consequences the owner should weigh:

   - A hand-written file committed under one of those roots fails
     `npm run check`. `.claude/commands/*.md` is a conventional Claude Code
     location, so this is reachable by ordinary use, not only by mistake. The
     repository has no such file today: all 25 tracked files under those roots
     are recorded generated-owned in `ai-profile.lock`.
   - Where the evidence is ambiguous the report says so rather than guessing. A
     path the committed lockfile still records is reported `orphaned`; a path
     nothing records is reported `unrecorded` and its remediation offers both
     readings, since it may be a retired artifact or a hand-written file.
   - The list holds only roots this profile actually emits into. A root nothing
     writes to is not pre-declared, because `unknownRoots` fails the check by
     name the moment any artifact is emitted into an undeclared root, so the
     entry is demanded exactly when it starts being true.
   - It therefore differs on purpose from the `generated-ownership` surface in
     `CHANGE_RISK_HIGH_RISK_SURFACES`, which does list `.tabnine/**`. That list
     routes a changed path to a review; this one decides which committed files
     are swept as compiler-owned. A path can warrant the first without the
     second, and over-declaring here has a cost the routing list does not have.

   If the owner declines this widening, the narrower behaviour is to keep
   `unrecorded` as an advisory line that does not clear `ok`, accepting that a
   whole-root retirement then goes undetected.

## Ratification

Ratified 2026-08-01 by the owner of this brief, after independent verification
of the branch. All five divergences are ACCEPTED. The reasoning below is part
of the contract: a later reader must be able to see why the guard is shaped
this way without re-deriving it.

Verification that backed the decision, each re-run rather than taken on report:
the reverted-prompt episode left the three reviewer artifacts byte-identical to
`c415f8c` with I8's budget rule intact; the diff touches no generated artifact
or fixture; `.codex/config.toml` is gitignored at `.gitignore:39`; `npm run
check` exits 0 and leaves the working tree byte-identical; and all 25 tracked
files under the swept roots are recorded generated-owned in `ai-profile.lock`.

The guard was proven load-bearing by mutation, not assertion: committing a
pre-I8 reviewer artifact made `npm run check` exit 1 naming the path. A first
attempt that edited only the WORKING COPY passed, which is correct behaviour --
the guard compares committed bytes -- and is recorded here because it is an
easy way to mistake a working guard for a broken one.

1. ACCEPTED. The brief said two because two was all it knew. Applying its
   stated rationale consistently is not widening the non-goal. The frozen
   constant, with any other missing artifact a hard failure, is the right
   shape.

2. ACCEPTED, and the most valuable finding in the slice. One distinction must
   survive in this record: the staleness DID occur -- the I8/I9 review
   demonstrably ran the stale prompt. What is not reproducible is deriving it
   from committed history, because `6c7998b` committed artifacts and compiler
   together. A later reader must not conclude the occurrence was fabricated.
   That the true cause was a stale `apps/cli/dist`, which makes the guard lie
   in BOTH directions, is a strictly more dangerous defect than the briefed
   one; building the CLI from source is the correct response.

   This also vindicates reframing I14 as an early mechanical guard rather than
   a second-occurrence promotion. Had its justification still rested on the
   count, disproving occurrence #2 would have removed it.

3. ACCEPTED. It follows inescapably from "compare the committed bytes", which
   was itself a review finding. The friction is the price of the guard being
   honest.

4. ACCEPTED. A guard that must build from source necessarily writes `dist/`.
   Asserting the narrower sentinel property -- no tracked file, no generated
   artifact -- is the honest formulation.

5. ACCEPTED, and weighed hardest. The narrower fallback lets a whole-root
   retirement go undetected, which is the exact failure class this guard
   exists to catch: a silent false negative in a gate against silent drift.
   The widening's cost is a loud, immediate, self-explanatory failure on a
   hand-written file under a swept root, cleared by one list entry or a file
   move. For this gate a loud false positive beats a silent false negative.

   The known reachable case is `.claude/commands/*.md`, a conventional Claude
   Code location. This is accepted, not overlooked. If it is hit in ordinary
   use, the response is to record the path as manual-owned -- not to fall back
   to the advisory behaviour, which would re-open the retirement blind spot.

## Review expectations

Confirm the no-write property is proven by sentinel and not asserted. Confirm
the local-artifact exclusion covers exactly the three files named in ratified
divergence 1 and cannot be widened at run time or by configuration. Confirm the
swept-root list is likewise closed. Push back if the guard regenerates rather
than reports.
