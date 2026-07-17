# I3: Tabnine historical, organization, and private model lifecycle

## Parent spec or request

`docs/specs/phase-31.5/001-model-selection-lifecycle.md`

## Intent summary

Make Tabnine model selection useful in conservative enterprise environments
without assuming the public newest model, inventing effort controls, or
overwriting administrator/user-owned settings.

## Behavior slice

Resolve portable role intent against the bundled Tabnine compatibility catalog
or an explicit organization/private identifier. Show exact model and status,
retain historical records, and hide retired normal choices. Treat model
selection and effort as separate target controls: Tabnine may have a usable
model control while effort remains unsupported. Emit a project-local model
selector only when its exact settings path, value shape, target-version
evidence, and ownership are reviewed as safe; otherwise provide guided
`/model`/`/about` selection.

## Non-goals

- Scraping the interactive `/model` picker.
- Admin console, BYOAI endpoint, key, or certificate configuration.
- Ranking private models or adding Tabnine effort/per-role claims.
- Guessing that `model.id`, `model.name`, `model.effort`, or another settings
  path is portable across Tabnine editions or versions.

## Acceptance criteria

- Catalog tests retain every published historical Tabnine identifier and
  distinguish current, supported-legacy, deprecated, and retired.
- Ordinary candidate lists exclude retired entries but explicit parsing and
  locked migration continue to recognize them.
- Unknown exact identifiers render as `organization/private - unrated` and
  `unverified`, not invalid or outdated.
- Model and effort outcomes remain independently representable. A Tabnine row
  may report an exact model as `configured`, `advisory`, or `unverified` while
  reporting effective effort as absent and `unsupported`; one scalar status
  must not collapse this mixed outcome.
- `effort` is absent/unsupported unless new reviewed official evidence approves
  an exact Tabnine control. No generated artifact receives an invented effort
  key or value.
- Target-resolution and lockfile provenance distinguish canonical requested
  effort from effective target effort. For Tabnine, effective effort is absent
  and its control status is `unsupported`; canonical intent must not be
  presented as applied target configuration.
- A Tabnine effort limitation changes neither the resolved model/effort nor the
  write outcome for Codex or Claude. Mixed-client tests prove that supported
  Codex/Claude effort changes proceed while Tabnine omits effort, and that the
  Tabnine capability gap does not block the overall resolution or write plan.
- Absent/generated-owned project settings may receive a deterministic model
  selector after preview/write only through a release-reviewed, versioned
  adapter mapping for the exact property and value shape. Existing unowned
  settings are preserved and result in advisory manual guidance.
- When the supported Tabnine settings key cannot be established confidently,
  compilation remains deterministic and uses exact advisory `/model` guidance;
  it does not infer a key from a model display name or an unowned user file.
- Migration between reviewed settings shapes, including `model.id` and
  `model.name`, requires an explicit adapter mapping and diff-before-write. An
  unverified shape never triggers automatic mutation.
- No output implies that an older admin-approved model is unhealthy.

## Expected RED proof

The current implementation emits only portable Tabnine task-capsule guidance,
has no model catalog/status, and rejects or cannot represent uncatalogued exact
overrides. It also has no proof that a mixed result such as "model configured,
effort unsupported" is preserved independently across targets, and the issue's
former unconditional `model.id` assumption is contradicted by field evidence.

## Expected GREEN proof

Focused catalog/adapter tests and Tabnine goldens cover current, legacy,
retired, private, absent-owned, generated-owned, and unowned settings outcomes.
They also cover every reviewed settings-key shape, the advisory fallback for an
unknown shape, separate model/effort statuses, absence of serialized Tabnine
effort, and a Codex/Claude/Tabnine mixed-capability resolution.

## Seam under test

`resolution plan + reviewed target-settings mapping + ownership state ->
Tabnine artifact/manual guidance and per-control capability-status rows`.

## Allowed mock boundary

Filesystem ownership state only at the existing planner boundary; no Tabnine
process or network call belongs in this slice. Tests inject reviewed settings
mappings; they do not learn a writable key by inspecting arbitrary user-owned
settings.

## Test command guidance

Run focused core catalog, compiler Tabnine/golden, and ownership tests, then
core/compiler suites, goldens, Doctor/check, and package verification.

## Likely file ownership

- core catalog Tabnine records
- compiler Tabnine adapter/guidance/settings planning and per-control status
  representation
- lockfile target-resolution provenance when needed to represent absent
  effective effort without erasing canonical intent
- Tabnine fixtures/goldens and target docs
- ownership/refusal integration tests

## Dependencies

I1.

Before adapter work, confirm that the shared target-resolution and lockfile
shapes can represent a configured/advisory model alongside absent/unsupported
effective effort. If they cannot, the first I3 RED may add the smallest
backward-compatible target-result extension required for that mixed state; it
must not overload one status or persist an invented Tabnine effort.

## Parallelism notes

Parallel-safe with I2 and I4 after I1; coordinate catalog exports and shared
preview row types.

## Contract impact

Adds capability-accurate Tabnine model representation/configuration. Existing
Tabnine outputs remain unchanged until v3 adoption. Codex and Claude resolution
semantics remain unchanged.

## Security impact

Never inspect or emit Tabnine credentials/private endpoints. Refuse mutation of
unowned settings rather than reading arbitrary values for merge. Do not write
global/user-level Tabnine configuration in this issue, and do not use an
unverified settings key as a probe.

## Documentation impact

Tabnine target docs, historical/private model explanation, init manual fallback,
reviewed settings-key mapping evidence, and the separate model/effort status
contract.

## Implementation context

Use `/model` and `/about` as the user-controlled fallback surfaces. Do not treat
one JSON property as universal:

- the public settings material reviewed for Phase 31.5 showed `model.id`;
- a 2026-07-17 user-observed macOS Tabnine Enterprise CLI persisted a `/model`
  choice as `model.name: "GPT-5.5"` in
  `.tabnine/agent/settings.json`;
- the user-observed result is useful field evidence but remains locally
  unverified in this repository and does not establish cross-version support;
- no reviewed evidence currently establishes a Tabnine effort/reasoning key.

The versioned adapter mapping must record which exact project-local property
and value shape it supports and the evidence behind that decision. If the
running environment cannot be matched to a reviewed writable contract, remain
advisory and instruct the user to select the exact model through `/model` and
verify it through `/about`. Treat administrator policy and deployment as
runtime truth.

## Review expectations

Check history retention, hidden retired choices, private model neutrality,
separate model/effort statuses, absence of effort claims and serialized effort,
cross-client isolation, evidence-versioned settings keys, ownership safety, and
exact manual guidance.
