# Phase 31.9: Upgrade command "custom exact" model-policy strategy

## Status

Needs a grill session before this becomes an approved spec or issue brief.
This document is a problem/findings record only - it captures why the item
was deferred and what a future grill needs to resolve. It is not itself a
spec, and nothing in it should be treated as an approved acceptance
criterion or implementation plan.

## Origin

Descoped from `docs/specs/phase-31.5/issues/006a-upgrade-comparison-and-planning.md`
(I6a) on 2026-07-21. I6a's own acceptance criteria originally listed "custom
exact (per-role/per-client picks)" as one of five required planning paths
(alongside retain, adopt, quality-first, cost-conscious). Every other path
shipped, was tested, and passed spec + code-quality review across twelve
`/implement-next` cycles; "custom exact" was the only one never
implemented. Codex bot's automated PR review flagged its absence repeatedly
across multiple review rounds on PR #125; each time, the finding was
acknowledged as a genuine gap against I6a's stated acceptance criteria but
consciously deferred rather than fixed, and the repository owner
(`jsuvic`) replied directly on one of those findings agreeing it was
out of scope for that PR. See I6a's own brief amendment (dated 2026-07-21)
for the corresponding non-goal/acceptance-criteria edit.

## Problem (in the stakeholder's terms, as best understood so far)

`agent-profile upgrade` lets a user compare their profile's current
model-policy resolution (locked v3 rows, or legacy mapping-v2 resolution)
against what today's bundled catalog would resolve fresh, then choose a
bulk strategy: retain everything, adopt every role's fresh recommendation,
or switch to a different bulk preset (quality-first/cost-conscious). All
four of those are genuinely "bulk" - one decision applies uniformly to
every role/client pair.

"Custom exact" is qualitatively different: a user who mostly likes the
fresh recommendation but wants to override ONE role's model, or pin a
specific role to an older/cheaper model while adopting fresh everywhere
else, currently has no supported path through `upgrade` at all. Today they
would have to already know to hand-edit `ai-profile.yaml`'s
`subagentPolicy.roles.<role>.overrides.<client>.{model,effort}` block
directly (a schema surface that already exists and already works for
compile-time resolution - see "What already exists" below) - `upgrade`
itself never surfaces, prompts for, or writes per-role overrides.

## Why this needs a grill, not just an implementation cycle

Every other I6a strategy reused one shared, narrow surgical-YAML-edit
primitive (`planSubagentPolicyPresetEdit`, editing exactly one scalar field
via `editScalarUnder`). "Custom exact" needs a materially different and
larger surface, and several product-shape decisions are still genuinely
open - see Design Questions below. This is not a case where the shape is
obvious and only the code is missing; several defensible designs exist and
picking wrong would create a CLI UX users depend on that is expensive to
change later.

## What already exists (do not re-derive from scratch)

- `packages/core/src/profile.ts`'s `SubagentPolicyRoleOverrides` /
  `SubagentPolicyCodexRoleOverride` / `SubagentPolicyClaudeRoleOverride`
  types already define a per-role, per-client `{model?, effort?}` override
  shape. This is the SAME shape used by both the legacy mapping-v2 resolver
  (`resolveRoleMapping`'s `overrides` parameter, in
  `packages/compiler/src/subagent-mapping.ts`) and v3's target-adapter
  (`deriveModelPolicyRoleOverrides` -> `ModelPolicyRoleOverrides`, in
  `packages/compiler/src/model-policy-target-adapter.ts`). A future "custom
  exact" design should reuse this existing schema surface rather than invent
  a new one - it is already validated, already round-trips through profile
  parsing, and both comparison helpers already accept an optional
  `roleOverrides` argument that would reflect a hypothetical custom pick
  (see next point).
- Both comparison helpers (`compareModelPolicyUpgrade` in
  `packages/compiler/src/model-policy-upgrade-comparison.ts`, and
  `compareModelPolicyUpgradeFromLegacy` in
  `packages/compiler/src/model-policy-legacy-upgrade-comparison.ts`) and the
  planning helper (`planModelPolicyUpgrade` in
  `packages/compiler/src/model-policy-upgrade-planning.ts`) already accept
  an optional `roleOverrides` parameter and already thread it into
  `buildModelPolicyTargetTable`. This means the COMPARISON/PLANNING side of
  "custom exact" may already be substantially supported today for a
  profile that has already been hand-edited with per-role overrides -
  `upgrade`'s existing report would already show a correct old/new
  comparison and a correct plan reflecting those overrides. What's missing
  is specifically: (a) a CLI-level way to ACQUIRE the override picks (flag
  syntax or interactive prompts) without requiring the user to already know
  the YAML shape, and (b) a WRITE path that edits
  `ai-profile.yaml`'s nested `subagentPolicy.roles.<role>.overrides` map (not
  just the single `subagentPolicy.preset` scalar every other strategy edits)
  atomically with the same lock/target-file regeneration pipeline
  `runModelPolicyWrite` already provides.
- `apps/cli/src/upgrade-model-policy-editor.ts`'s `planSubagentPolicyPresetEdit`
  and `apps/cli/src/configure.ts`'s exported `editScalarUnder` are the
  existing surgical-YAML-edit primitives. `editScalarUnder` edits exactly
  one scalar value under a given parent path. A per-role/per-client custom
  override edit would need to either add several new scalar edits (one per
  role/client/field being overridden, each potentially under a
  not-yet-existing parent path if `subagentPolicy.roles.<role>` or
  `.overrides` doesn't exist yet in the profile) or a new, more general
  "set a nested map path, creating intermediate maps as needed" primitive.
  Confirm during the grill whether `editScalarUnder` can be reused as-is
  (called once per field) or needs a genuinely new sibling function.
- `apps/cli/src/index.ts`'s `runModelPolicyWrite` (the shared write pipeline
  every other I6a strategy uses) is strategy-shape-agnostic for everything
  downstream of "what preset (if any) to write" - it takes whatever edited
  profile source results and threads it through `compileProfile` ->
  `planRegionAwareWrites` -> ... -> `createOrApplyWritePlan`. A custom-exact
  write would likely reuse this pipeline's tail unchanged, once the
  yaml-edit step produces the right edited source.
- Precedent for an existing "pick some subset from an offered list"
  interaction already exists in this same command: the capability-catalog
  `--write --adopt-recommended` vs. interactive "customize" flow
  (`UpgradeStrategy = "keep" | "adopt-recommended" | "customize"` in
  `apps/cli/src/index.ts`, and `prompts.customize(offeredIds)`) lets a user
  pick a subset of offered capability ids interactively. That flow is a
  useful reference point for what an interactive "pick per-role" experience
  could look like, though it selects whole items from a list rather than
  entering exact model/effort values per role/client.

## Design questions a grill session needs to resolve

1. **Input shape for `--write` (scripted/non-interactive).** Repeated CLI
   flags (e.g. `--model-policy-role architect:codex=gpt-5.6-sol:xhigh`,
   parsed per invocation)? A path to a JSON/YAML file describing the
   overrides? Or is "custom exact" interactive-only for its first cut, with
   scripted/JSON support deferred further? Precedent check: does any other
   command in this CLI already have a "repeated structured flag" parsing
   convention to be consistent with, or would this be the first?
2. **Baseline strategy composition.** Is "custom exact" always relative to
   the CURRENT locked/legacy resolution (i.e. "adopt nothing, but override
   these specific roles"), or can it compose with a bulk strategy (e.g.
   "adopt fresh everywhere, but pin `architect` to an explicit model")? The
   parent I6a spec's phrasing ("per-role/per-client picks") is ambiguous
   between these. This is the single highest-value question to resolve
   first, since it determines the shape of everything else.
3. **Persistence target.** Does an accepted custom pick get written into
   `ai-profile.yaml`'s `subagentPolicy.roles.<role>.overrides` (persisting
   as a durable profile-level override, consistent with how overrides
   already work for hand-edited profiles today), or does it only affect
   `ai-profile.lock`'s `modelPolicy` block for one write (a one-off pin that
   would silently revert on the next ordinary `compile` or `upgrade adopt`)?
   The former is consistent with "the profile is the source of truth"
   (already the model everywhere else in this CLI); the latter is cheaper
   to implement but creates a surprising, hard-to-discover form of state
   that lives only in the lock. Recommend defaulting to the former unless
   the grill surfaces a concrete reason not to.
4. **Interaction with the two profile shapes.** A v3-opted profile's
   `subagentPolicy.roles` overrides feed `deriveModelPolicyRoleOverrides` /
   v3's target-adapter; a mapping-v2 profile's `subagentPolicy.roles`
   overrides feed the SAME shared type but through
   `resolveRoleMapping`'s legacy resolution path instead. Does "custom
   exact" on a mapping-v2 profile mean "pick per-role overrides that apply
   to the STILL-legacy resolution" (no v3 adoption at all), or does
   choosing custom exact on a mapping-v2 profile implicitly mean "adopt v3,
   then also apply these per-role overrides" (composing with question 2's
   mapping-v2-adopt-v3 write path, already shipped in I6a cycle 12)? These
   are different products; the parent spec's own phrasing ("a mapping-v2
   profile choosing to adopt v3") suggests the latter, but this needs
   explicit confirmation, not inference.
5. **Validation and catalog membership.** Should an exact override be
   restricted to catalogued models (with a clear error for a typo/unknown
   model id), or does this need to support an intentionally uncatalogued
   override (mirroring the existing "an uncatalogued Codex override model
   resolves a conservative reasoning effort instead of throwing" precedent
   already established for compile-time exact overrides in I2)? Given I2
   already made this decision for compile-time overrides, the strong
   default is to match it exactly for consistency, but confirm during the
   grill rather than assuming.
6. **Preview/diff requirements.** Per I6a cycle 11's fix (Codex bot P1
   finding: a bulk preset switch must show the exact `ai-profile.yaml` edit
   and file-level diff before applying, not just the model-policy
   comparison table), a custom-exact write will ALSO mutate
   `ai-profile.yaml`'s content and must follow the same
   preview-before-apply mutation contract. Confirm the existing
   `previewBulkPresetSwitchWrites` helper (in `apps/cli/src/index.ts`) is
   reusable as-is once the yaml edit step is built, or whether a
   nested-map edit needs its own diff rendering (e.g. showing which
   specific override keys were added/changed, not just "ai-profile.yaml
   (change)").
7. **Interactive UX scope.** Does interactive "custom exact" prompt for
   every role one at a time (tedious for the ~10 roles this catalog
   covers), only for roles the user explicitly flags as wanting to
   override, or via a different selection mechanism entirely (e.g. reusing
   the existing offered-list "customize" pattern, but for roles instead of
   capability ids)? This is explicitly out of scope for a first,
   non-interactive-only cut if the grill decides to sequence it that way.

## Non-goals for this document

This is a findings record, not a decision. It does NOT decide:

- the CLI flag/file input shape
- whether custom-exact composes with a bulk strategy
- whether it persists to the profile or only the lock
- mapping-v2 interaction semantics
- validation strictness
- interactive UX shape

All six are grill decisions, not implementation defaults to assume.

## Suggested next step

Run a grill session (this repository's `grill-change` skill) scoped to
exactly the "Design questions" list above, in the order listed (question 2
first, since most other questions depend on its answer). The grill's output
(an agreement record) should then drive a proper issue brief under a
concrete phase number, likely spun out as a new Phase 31.5 issue (e.g.
I6f) rather than reopening I6a, since I6a's own scope is otherwise complete
and closed.
