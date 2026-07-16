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
retain historical records, hide retired normal choices, emit a project-local
`model.id` only when the target surface and ownership are safe, and otherwise
provide guided `/model`/`/about` selection.

## Non-goals

- Scraping the interactive `/model` picker.
- Admin console, BYOAI endpoint, key, or certificate configuration.
- Ranking private models or adding Tabnine effort/per-role claims.

## Acceptance criteria

- Catalog tests retain every published historical Tabnine identifier and
  distinguish current, supported-legacy, deprecated, and retired.
- Ordinary candidate lists exclude retired entries but explicit parsing and
  locked migration continue to recognize them.
- Unknown exact identifiers render as `organization/private - unrated` and
  `unverified`, not invalid or outdated.
- `effort` is absent/unsupported unless new official evidence approves it.
- Absent/generated-owned project settings may receive deterministic `model.id`
  after preview/write; existing unowned settings are preserved and result in
  advisory manual guidance.
- No output implies that an older admin-approved model is unhealthy.

## Expected RED proof

The current implementation emits only portable Tabnine task-capsule guidance,
has no model catalog/status, and rejects or cannot represent uncatalogued exact
overrides.

## Expected GREEN proof

Focused catalog/adapter tests and Tabnine goldens cover current, legacy,
retired, private, absent-owned, generated-owned, and unowned settings outcomes.

## Seam under test

`resolution plan + ownership state -> Tabnine artifact/manual guidance and
capability-status rows`.

## Allowed mock boundary

Filesystem ownership state only at the existing planner boundary; no Tabnine
process or network call belongs in this slice.

## Test command guidance

Run focused core catalog, compiler Tabnine/golden, and ownership tests, then
core/compiler suites, goldens, Doctor/check, and package verification.

## Likely file ownership

- core catalog Tabnine records
- compiler Tabnine adapter/guidance/settings planning
- Tabnine fixtures/goldens and target docs
- ownership/refusal integration tests

## Dependencies

I1.

## Parallelism notes

Parallel-safe with I2 and I4 after I1; coordinate catalog exports and shared
preview row types.

## Contract impact

Adds capability-accurate Tabnine model representation/configuration. Existing
Tabnine outputs remain unchanged until v3 adoption.

## Security impact

Never inspect or emit Tabnine credentials/private endpoints. Refuse mutation of
unowned settings rather than reading arbitrary values for merge.

## Documentation impact

Tabnine target docs, historical/private model explanation, init manual fallback,
and mapping evidence.

## Implementation context

Use the documented project `model.id`, `/model`, and `/about` surfaces. Treat
administrator policy and deployment as runtime truth.

## Review expectations

Check history retention, hidden retired choices, private model neutrality,
absence of effort claims, ownership safety, and exact manual guidance.
