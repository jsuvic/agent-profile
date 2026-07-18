# I5R: Tabnine write-plan wiring, advanced override entry, and model-selection docs

## Parent spec or request

`docs/specs/phase-31.5/001-model-selection-lifecycle.md` and
`docs/specs/phase-31.5/issues/005-init-model-selection.md`

## Intent summary

Close the gap left by I5: the interactive init wizard now recommends the
role-aware preset, shows exact per-role model/effort/status tables before
commit, and runs a consented probe (I5's own scope), but three acceptance
criteria from I5's brief were explicitly deferred by disclosure rather than
delivered:

- AC2 (second half)/AC4: there is no wizard entry point yet for advanced
  per-role customization or an exact/unknown-model override; a user cannot
  type an uncatalogued model id during init even though `resolveModelPolicy`
  and `validateModelPolicyOverride` (I1/I1R) already support it.
- AC5 (write half)/AC8: I3's `planTabnineModelSettingsWrite` is still not
  called from any real write pipeline. `compile-plan.ts`/`buildCompileWrites`
  do not classify `.tabnine/agent/settings.json` ownership or include a
  Tabnine write/advisory branch in the diff-before-write preview.
- Documentation impact: no first-run guide, preset examples, consent copy, or
  Tabnine manual-path documentation was written.

I5's spec review (2026-07-18) confirmed these were genuine, disclosed
deferrals — not defects in what shipped — and recommended tracking them as
follow-up rather than blocking I5's closure, consistent with the project's
own precedent for I3's disclosed Tabnine-wiring scope reduction (which is
what led to I5's original 2026-07-17 amendment in the first place).

## Behavior slice

Given the resolved model preset/table already produced by I5's wizard step,
extend the same write-preview flow to (a) classify real on-disk
`.tabnine/agent/settings.json` ownership and offer the deterministic
`model.id` write or advisory guidance per I3's existing plan function, and
(b) offer a progressive-disclosure advanced entry point for per-role
customization and exact/unknown model overrides, labelled
unrated/unverified. Document both plus the existing preset/consent flow.

## Non-goals

- Any change to `resolveModelPolicy`, `buildModelPolicyTargetTable`, or
  `planTabnineModelSettingsWrite`'s own logic (I1-I3, already correct and
  reviewed) — this issue wires existing pure functions into real seams, it
  does not change their behavior.
- New JSON-merge or auto-detection heuristics for Tabnine settings beyond
  I3's ADR-0020 whole-file classification.
- Automatic provider contact, client installation, login, or global writes
  (same non-goal as I5).

## Acceptance criteria

- Init classifies `.tabnine/agent/settings.json` ownership (absent,
  Agent-Profile-generated, or unowned) at the existing `compile-plan.ts`
  planner boundary (analogous in spirit to `planRegionAwareWrites`'s
  region-marker classification, but whole-file per ADR-0020).
- When the exact selected model is known and ownership is absent or
  generated-owned, the diff-before-write preview offers the deterministic
  `model.id` write (via `planTabnineModelSettingsWrite`) alongside the
  Codex/Claude target preview, using the existing atomic-write/rollback
  contracts.
- An existing unowned settings file is always preserved byte-for-byte; the
  CLI shows advisory `/model`/`/about` guidance instead.
- Advanced per-role customization and exact/unknown-model override entry is
  reachable via explicit progressive disclosure (not shown by default);
  unrated/uncatalogued entries are labelled unverified in the preview.
- First-run/CLI docs cover: preset choices with exact tables, consent copy,
  the Tabnine manual/advisory path, the advanced override entry point, and
  the offline non-interactive/`--probe-models`-rejected contract.
- Cancellation and every failure state still write nothing; no new write
  mechanism is introduced outside the existing exact diff/ownership/
  atomicity/lockfile rules.

## Expected RED proof

Wizard/CLI tests have no Tabnine ownership classification at the
`compile-plan.ts` boundary, no Tabnine write/advisory branch in the
write-plan preview, and no advanced/override entry prompt.

## Expected GREEN proof

Table-driven tests pass for: Tabnine absent/generated-owned (write offered),
Tabnine unowned (advisory only, byte-for-byte preserved), advanced-entry
declined (default path unchanged), advanced-entry with a catalogued
override, advanced-entry with an uncatalogued override (accepted, labelled
unverified), and cancellation/failure write-nothing for each new branch.

## Seam under test

`interactive answers + real on-disk Tabnine settings state -> write-plan
preview and filesystem effect`; `interactive answers -> resolved
per-role/exact overrides`.

## Allowed mock boundary

Wizard IO and filesystem reads/writes only. Do not mock
`planTabnineModelSettingsWrite`, `resolveModelPolicy`,
`buildModelPolicyTargetTable`, or `validateModelPolicyOverride`.

## Test command guidance

Run focused wizard and CLI init/compile-plan tests, then CLI/core/compiler
suites, goldens, check, Doctor, and pack verification (same command set I5
used).

## Likely file ownership

- `apps/cli/src/compile-plan.ts` (Tabnine ownership classification + write
  inclusion)
- `apps/cli/src/wizard.ts` / `apps/cli/src/wizard-clack.ts` (advanced-entry
  prompt, progressive disclosure)
- `docs/cli/README.md` and/or `docs/targets/subagent-policy.md`
  (documentation)
- CLI tests, fixtures for on-disk Tabnine settings states

## Dependencies

I5 (done).

## Parallelism notes

Sequenced after I5. May proceed in parallel with I6 once I5's wizard/preview
seam is stable, with the same shared-CLI-presentation merge coordination
already noted for I5/I6.

## Contract impact

Additive to I5's wizard/preview flow. No change to existing explicit-flag or
non-interactive behavior.

## Security impact

Same as I5: provider contact (if any, via probe) stays consented; Tabnine
writes remain project-local, previewed, explicit, and never merge/guess at
existing unowned file contents.

## Documentation impact

First-run guide, exact preset examples, consent copy, Tabnine manual path,
advanced override entry, and the offline non-interactive/invalid-flag
contract — all still owed from I5's original documentation-impact section.

## Implementation context

This is a narrow completion of I5's already-approved scope, not new
product surface: I5's own acceptance criteria (AC2/AC4/AC5/AC8) already
describe this behavior in full; this issue exists only because I5 was
delivered as a disclosed, reviewed partial slice rather than expanding
further in a single RED-first cycle.

## Review expectations

Confirm Tabnine ownership classification never merges/auto-detects beyond
ADR-0020's whole-file rule; confirm an unowned file is preserved
byte-for-byte in a real filesystem test; confirm advanced/override entry is
off by default and requires explicit intent; confirm uncatalogued overrides
are labelled unverified, not silently treated as configured; confirm
documentation additions match what actually shipped in I5 and this issue,
not aspirational copy.
