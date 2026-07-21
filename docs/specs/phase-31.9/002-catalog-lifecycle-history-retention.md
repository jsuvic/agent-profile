# Phase 31.9: Catalog lifecycle history retention

## Status

Needs a maintainer decision, not a grill session - the question is narrow
and binary (see "Decision needed" below), not an underspecified product
request. This document is a findings record only.

## Origin

Raised by Codex bot's automated PR review on PR #125 (finding on
`packages/compiler/src/model-policy-upgrade-comparison.ts`'s
`lockedModelLifecycle` helper, added in an earlier I6a review-fix round).
The finding: when a prior lock references a model no longer present in
`CODEX_MODEL_POLICY_CATALOG`/`CLAUDE_MODEL_POLICY_CATALOG`, the helper
reports its lifecycle as `"unrated"`, which would be wrong if that model
was actually deprecated or retired and simply got removed from the array
- it would look identical to a model that was never published at all.

## What's actually true today

This scenario cannot currently occur in this project's real history: both
catalog arrays contain only `status: "current"` entries today (no model
has ever been deprecated or retired in this project yet). The project's
own spec, `docs/specs/phase-31.5/001-model-selection-lifecycle.md`'s
"Catalog lifecycle" section, already states the intended discipline:
"once published, an exact identifier remains in compatibility history" -
i.e. a catalog entry should never be deleted, only marked
`"retired"`/`"deprecated"` in place (`findModelCatalogEntry` in
`packages/core/src/model-policy.ts` already assumes this: it does a
simple linear search with no separate historical fallback). If that
discipline is followed by every future catalog edit, `lockedModelLifecycle`
would always find a previously-published model (just possibly with a
`"retired"` status), and its `"unrated"` fallback would only ever fire for
a genuinely bogus/never-published id - which is the correct answer in that
case.

## Decision needed

Is "never delete a catalog entry, only mark it retired" purely a code-review
discipline (nothing in the codebase enforces it, so a future edit could
violate it without any test catching it), or does it need a real
enforcement mechanism? Two options, not mutually exclusive:

1. **Add a regression test that pins today's catalog contents** (e.g. a
   snapshot test asserting every currently-published id remains present
   with the same or a more-retired status across changes) so a future
   PR that accidentally deletes an entry fails CI instead of silently
   creating exactly this defect.
2. **Add a separate historical registry** for ids that must be remembered
   even after removal from the "live" candidate arrays (a genuinely new
   data structure, only justified if there's a real need to eventually
   shrink the live arrays for e.g. bundle-size reasons).

No existing code or spec chooses between these; (1) is far cheaper and
directly closes the gap the finding describes without inventing new
infrastructure, so it is the recommended default absent a reason to want
(2). A maintainer just needs to confirm before implementing.

## Non-goals for this document

Does not decide whether to build option 1, option 2, both, or neither.
