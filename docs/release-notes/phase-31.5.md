# Phase 31.5 Release Notes

Phase 31.5 adds a local, reviewable model-selection lifecycle for Codex,
Claude, and Tabnine.

## Highlights

- New interactive setup recommends the role-aware preset and previews exact
  model, effort, alternatives, and capability status before writing.
- Model selections are release-pinned in `ai-profile.lock`. Normal compile
  reuses that exact resolution; upgrade is the explicit retain/adopt boundary.
- Availability probes are optional, consented, source-free, temporary, and
  never persist account or provider output. Normal commands remain offline.
- Tabnine remains honest about manual/advisory surfaces. An organization or
  private exact model can be recorded without being ranked, and only the
  reviewed project-local `model.id` setting is written when the file is absent
  or already generated-owned.
- `agent-profile doctor --models` reports model lifecycle and capability
  status offline. It now recognizes the generated-owned Tabnine settings file
  produced by the same locked policy instead of misreporting it as extra lock
  output.

## Safety and compatibility

- Existing mapping-v2 and disabled policies do not silently adopt v3.
- No credential brokerage, provider login, model routing, telemetry, hosted
  execution, or global client configuration is added.
- Package validation uses only packed artifacts and fake clients; no provider
  or package-registry call is made during the normal journey.

## Cross-references

- [Phase 31.5 spec](../specs/phase-31.5/001-model-selection-lifecycle.md)
- [Final spec-to-test matrix](../specs/phase-31.5/002-final-spec-to-test-matrix.md)
- [Model-policy evidence](../research/012-model-policy-mapping-v3-evidence.md)
