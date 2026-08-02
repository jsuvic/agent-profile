# I18: Require class-level remediation of review findings

## Parent spec or request

`docs/specs/phase-33/002-bounded-review-remediation.md`

Promoted from the I5 remediation (#148) at the fifth occurrence of one
mechanism.

## Intent summary

When a review finding names a specific field, file, or call site, the
remediation has repeatedly fixed only the named instance and declared the
finding closed. The next review round then found the same defect in the next
unlisted member of the same class. The enumeration itself was the defect: any
member added later starts life ungated.

## Observed occurrences

The redaction gate on committed evidence, across four consecutive review
rounds of #148:

| Round | Gated after the fix                      | Found in the next round        |
| ----- | ---------------------------------------- | ------------------------------ |
| 1     | `evidence`                               | `findingId`                    |
| 2     | `+ findingId`                            | `safePath`                     |
| 3     | `+ safePath, provider, systemicReason`   | `reviewerSurface`, `baseId`, `headId` |
| 4     | the whole envelope, walked recursively   | nothing                        |

One defect, found four times. The class-level fix in round 4 ended it.

A fifth occurrence in a different gate during the same PR shows the habit
survives the specific fix: `verifyDerivedIdentity` was written to check
`fingerprint` and `normalizedLocation`, but `findingId` is equally derived and
was omitted. An edited thread ordinal stayed safe and unique, cleared every
gate, and would have committed a heading identifying the wrong historical
thread. The class fix was applied in one gate and the instance-level habit was
reproduced in the gate immediately beside it.

## Behavior slice

Make class-level remediation a stated, checkable obligation of the bounded
remediation workflow rather than a matter of judgement.

When a fix round closes a finding by adding a member to an enumerated list --
a field list, an allowlist, a set of checked paths, a switch arm -- the round
MUST record either:

- the class-level fix that removes the enumeration; or
- an explicit statement of why the class-level fix was not practical, in the
  same form the promotion contract already requires for recorded
  impracticality.

The obligation attaches to the fix round, so it is visible in the handoff
record rather than living only in review conversation.

## Non-goals

- Forbidding enumerations. Many are correct and closed by design; closed
  vocabularies in the shared policy are the obvious case.
- Automating the judgement of what the class is.
- Retroactively reopening findings closed before this rule.

## Acceptance criteria

- The remediation workflow states the obligation in the terms above.
- A fix round that extends an enumeration without either disclosure is
  reported as an incomplete round rather than a clean one.
- The learning record persists which choice was made and the stated reason,
  so a later reader can see that the class question was asked.
- The five occurrences above are representable in that record shape.
- Documentation-only: no change to `compile`, artifact ownership, or the
  lockfile.

## Expected RED proof

A fix round that adds one field to a redaction list, with no class statement
and no impracticality reason, is accepted by the current workflow. Under this
brief it must not be.

## Seam under test

`fix round outcome -> recorded remediation obligation`.

## Likely file ownership

- `docs/specs/phase-33/002-bounded-review-remediation.md`
- The reviewer or orchestration surface that renders the fix-round contract
- The learning-record shape, if a new persisted field is required

## Dependencies

Interacts with I3's record schema if the choice is persisted as a field.
Sequence after I17 if both land, since I17 provides a mechanical example of
what "class-level fix" means in practice.

## Contract impact

Possible additive field on `review-learning/v1`. Prefer additive and optional;
do not bump the schema version without owner approval.

## Security impact

Indirect and significant. Four of the five occurrences were in a redaction
gate protecting committed evidence, and each instance-level fix left a live
leak path open for another round.

## Review expectations

Confirm the rule is checkable rather than aspirational: a reviewer must be able
to tell, from the record alone, whether the class question was asked. Push back
if the obligation is stated only in prose guidance with no persisted evidence,
since prose guidance is what already failed here.
