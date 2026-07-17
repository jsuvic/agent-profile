# Subagent Execution Policy

`subagentPolicy` is opt-in. When it is omitted or `enabled: false`, generated
files and lockfile provenance remain byte-identical to the corresponding
profile without the policy.

```yaml
subagentPolicy:
  enabled: true
  roles:
    architect:
      capability: strongest
      effort: extra-high
      overrides:
        codex:
          model: gpt-5.2-codex
          effort: extra-high
        claude:
          model: claude-opus-4-1-20250805
          effort: high
  orchestration:
    maxConcurrentThreads: 3
    maxDepth: 1
    parallelWrites: false
  context:
    handoff: task-capsule
    memory: targeted
    indexed:
      mode: preferred
      provider: cce
  evidence:
    summary: required
    localTrace:
      enabled: false
      retention: 20
```

The canonical role values are provider-neutral. Exact model identifiers and
target effort are exceptions that must use the versioned allowlist described in
[Subagent Model Mapping v2 Evidence](../research/010-subagent-model-mapping-v2.md).
Codex and Claude receive resolved model guidance; Tabnine receives only portable
task-capsule and local-first conventions.

`indexed.mode: off` omits indexed-first guidance and explicitly directs bounded
native discovery. It neither installs nor indexes CCE.

## Mapping-v3 opt-in (`preset`)

An additive, optional `preset` field opts a profile into the mapping-v3
model-policy resolver instead of the mapping-v2 allowlist above:

```yaml
subagentPolicy:
  enabled: true
  preset: role-aware # or: quality-first | cost-conscious
  roles:
    routine-implementer:
      capability: balanced
      effort: medium
```

- `preset` is one of `role-aware | quality-first | cost-conscious`. Omitting
  it retains mapping-v2 behavior byte-for-byte; see
  [Model Selection Lifecycle](../specs/phase-31.5/001-model-selection-lifecycle.md)
  for the preset tables.
- `routine-implementer` is a v3-only role: it is accepted alongside the
  existing nine roles but has no mapping-v2 legacy resolution, so it is only
  meaningful on a profile that also sets `preset`.
- When `preset` is set, `overrides.codex.model` / `overrides.claude.model`
  accept any non-empty, control-character-free string under 200 characters —
  not only the pinned mapping-v2 allowlist above. An uncatalogued exact
  identifier is accepted and resolves `unverified`/unrated rather than being
  rejected; see the parent spec's target-capability-status contract.
- Without `preset`, `overrides.codex.model` / `overrides.claude.model` are
  still restricted to the pinned mapping-v2 allowlist.
- This phase (I1R) only extends parsing/validation. Generated Codex/Claude/
  Tabnine artifacts, YAML round-tripping of `preset`, and golden output for
  a v3-opted-in profile are delivered by later Phase 31.5 issues (I2+).
